const express = require('express');
const path = require('path');
const { Logger } = require('./utils/logger');
const { Database } = require('./database/db');
const { CredentialManager } = require('./utils/credential-manager');
const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
const { ScriptWriterAgent } = require('./agents/script-writer-agent');
const { ThumbnailDesignerAgent } = require('./agents/thumbnail-designer-agent');
const { SEOOptimizerAgent } = require('./agents/seo-optimizer-agent');
const { ProductionManagementAgent } = require('./agents/production-management-agent');
const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
const { AnalyticsOptimizationAgent } = require('./agents/analytics-optimization-agent');
const { AITextService } = require('./utils/ai-text-service');
const { DailyAutomation } = require('./schedules/daily-automation');
const chalk = require('chalk');

// Ordered pipeline steps for the /generate progress tracker, with rough
// expected durations (seconds) used to estimate overall % and ETA.
const GENERATION_STEPS = [
  { key: 'strategy',   label: 'Choosing topic & strategy', est: 10 },
  { key: 'script',     label: 'Writing the script (AI)',    est: 18 },
  { key: 'thumbnail',  label: 'Designing thumbnail',        est: 3 },
  { key: 'seo',        label: 'Optimizing SEO',             est: 2 },
  { key: 'production', label: 'Producing & rendering video', est: 25 }
];

class YouTubeAutomationAgent {
  constructor() {
    this.logger = new Logger('MainAgent');
    this.db = null;
    this.credentials = null;
    this.agents = {};
    this.app = express();
    this.isInitialized = false;
    this.jobs = {}; // in-flight + recent generation jobs, keyed by id
  }

  async initialize() {
    try {
      console.log(chalk.cyan.bold('\n🎬 YouTube Automation Agent v2.0'));
      console.log(chalk.gray('─'.repeat(50)));
      
      // Initialize database
      this.logger.info('Initializing database...');
      this.db = new Database();
      await this.db.initialize();
      
      // Load credentials
      this.logger.info('Loading credentials...');
      this.credentials = new CredentialManager();
      const credentialsValid = await this.credentials.validateAll();
      
      if (!credentialsValid) {
        console.log(chalk.yellow('\n⚠️  Some credentials are missing or invalid.'));
        console.log(chalk.yellow('Run: npm run credentials:setup'));
        return false;
      }
      
      // Initialize agents
      this.logger.info('Initializing agents...');
      await this.initializeAgents();
      
      // Setup API endpoints
      this.setupAPI();
      
      // Initialize scheduler
      this.logger.info('Setting up automation scheduler...');
      this.scheduler = new DailyAutomation(this.agents, this.db);
      await this.scheduler.initialize();
      
      this.isInitialized = true;
      this.logger.success('YouTube Automation Agent initialized successfully!');
      
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize:', error);
      return false;
    }
  }

  async initializeAgents() {
    // Shared AI text service (Gemini / OpenAI / OpenRouter / etc.) built from
    // the loaded credentials. Agents use it for real content generation and
    // gracefully fall back to templates when it is unavailable.
    this.aiService = new AITextService(this.credentials.credentials || {});
    if (this.aiService.isAvailable()) {
      this.logger.info(`AI text service ready: ${this.aiService.providerName} (${this.aiService.model})`);
    } else {
      this.logger.warn('AI text service unavailable — agents will use template fallbacks');
    }

    this.agents = {
      strategy: new ContentStrategyAgent(this.db, this.credentials, this.aiService),
      scriptWriter: new ScriptWriterAgent(this.db, this.credentials, this.aiService),
      thumbnailDesigner: new ThumbnailDesignerAgent(this.db, this.credentials),
      seoOptimizer: new SEOOptimizerAgent(this.db, this.credentials),
      production: new ProductionManagementAgent(this.db, this.credentials),
      publishing: new PublishingSchedulingAgent(this.db, this.credentials),
      analytics: new AnalyticsOptimizationAgent(this.db, this.credentials)
    };

    // Initialize each agent
    for (const [name, agent] of Object.entries(this.agents)) {
      await agent.initialize();
      this.logger.info(`✓ ${name} agent initialized`);
    }
  }

  setupAPI() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'dashboard')));
    
    // Main dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        initialized: this.isInitialized,
        agents: Object.keys(this.agents),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Channel configuration (for dashboard display)
    this.app.get('/config', (req, res) => {
      const c = (this.credentials && this.credentials.credentials) || {};
      res.json({
        channelName: c.channel?.channelName || 'YouTube Automation',
        channelDescription: c.channel?.channelDescription || '',
        targetAudience: c.content?.targetAudience || '',
        contentTypes: c.content?.contentTypes || [],
        postingFrequency: c.content?.postingFrequency || '',
        preferredPostTime: c.content?.preferredPostTime || ''
      });
    });

    // Manual content generation — runs asynchronously and reports progress via
    // /progress/:jobId so the dashboard can show a live status instead of hanging.
    this.app.post('/generate', (req, res) => {
      const { topic, style, length } = req.body || {};
      const job = this._createJob();

      // Respond immediately with the job id; the pipeline runs in the background.
      res.json({ success: true, jobId: job.id });

      this.generateContent(topic, style, length, (key) => this._markStep(job, key))
        .then(result => {
          this._finishStep(job);
          job.status = 'done';
          job.result = result;
          this.logger.info(`Generation job ${job.id} complete: ${result.title}`);
        })
        .catch(error => {
          this._finishStep(job, 'error');
          job.status = 'error';
          job.error = error.message;
          this.logger.error(`Generation job ${job.id} failed: ${error.message}`);
        });
    });

    // Progress of a generation job
    this.app.get('/progress/:jobId', (req, res) => {
      const job = this.jobs[req.params.jobId];
      if (!job) return res.status(404).json({ error: 'job not found' });
      res.json(this._jobSnapshot(job));
    });

    // Get analytics
    this.app.get('/analytics', async (req, res) => {
      try {
        const analytics = await this.agents.analytics.getRecentAnalytics();
        res.json(analytics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get upcoming schedule
    this.app.get('/schedule', async (req, res) => {
      try {
        const schedule = await this.db.getUpcomingSchedule();
        res.json(schedule);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Manual publish
    this.app.post('/publish/:contentId', async (req, res) => {
      try {
        const { contentId } = req.params;
        const result = await this.agents.publishing.publishContent(contentId);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  async generateContent(topic = null, style = null, length = 'medium', onStep = null) {
    const step = (key) => { if (onStep) onStep(key); };
    this.logger.info('Starting content generation pipeline...');

    // Step 1: Strategy
    step('strategy');
    const strategy = await this.agents.strategy.generateContentStrategy(topic);
    this.logger.info(`Strategy generated: ${strategy.topic}`);

    // Step 2: Script Writing
    step('script');
    const script = await this.agents.scriptWriter.generateScript(strategy);
    this.logger.info(`Script generated: ${script.title}`);

    // Step 3: Thumbnail Design
    step('thumbnail');
    const thumbnail = await this.agents.thumbnailDesigner.generateThumbnail(script);
    this.logger.info('Thumbnail generated');

    // Step 4: SEO Optimization
    step('seo');
    const seoData = await this.agents.seoOptimizer.optimize(script, strategy);
    this.logger.info('SEO optimization complete');

    // Step 5: Production Management
    step('production');
    const productionData = await this.agents.production.processContent({
      strategy,
      script,
      thumbnail,
      seo: seoData
    });
    this.logger.info('Production processing complete');
    
    // Step 6: The production agent already persisted this record
    // (processContent calls db.saveProductionData internally), so just
    // capture its ID here — re-inserting would violate the UNIQUE id constraint.
    const contentId = productionData.id;
    this.logger.info(`Content saved with ID: ${contentId}`);
    
    return {
      contentId,
      title: script.title,
      scheduledFor: productionData.scheduledPublishTime
    };
  }

  // ---- Generation job tracking (for live dashboard progress) ----

  _createJob() {
    const id = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const steps = GENERATION_STEPS.map(s => ({
      key: s.key, label: s.label, est: s.est,
      status: 'pending', startedAt: null, endedAt: null
    }));
    const job = { id, status: 'running', steps, currentKey: null, startedAt: Date.now(), result: null, error: null };
    this.jobs[id] = job;

    // Prune jobs older than 15 minutes so the store doesn't grow unbounded.
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const k of Object.keys(this.jobs)) {
      if (this.jobs[k].startedAt < cutoff) delete this.jobs[k];
    }
    return job;
  }

  // Mark the next step running (and the previous one done).
  _markStep(job, key) {
    this._finishStep(job);
    const cur = job.steps.find(s => s.key === key);
    if (cur) {
      cur.status = 'running';
      cur.startedAt = Date.now();
      job.currentKey = key;
    }
  }

  // Close out whichever step is currently running.
  _finishStep(job, status = 'done') {
    const running = job.steps.find(s => s.status === 'running');
    if (running) {
      running.status = status;
      running.endedAt = Date.now();
    }
  }

  // Build a serialisable progress snapshot with overall %, elapsed and ETA.
  _jobSnapshot(job) {
    const now = Date.now();
    const totalEst = job.steps.reduce((a, s) => a + s.est, 0);

    let doneEst = 0;
    let remainingEst = 0;
    for (const s of job.steps) {
      if (s.status === 'done') {
        doneEst += s.est;
      } else if (s.status === 'running') {
        const inStep = (now - s.startedAt) / 1000;
        doneEst += Math.min(inStep, s.est);
        remainingEst += Math.max(0, s.est - inStep);
      } else if (s.status === 'pending') {
        remainingEst += s.est;
      }
    }

    let percent;
    if (job.status === 'done') percent = 100;
    else if (job.status === 'error') percent = Math.round(job.steps.filter(s => s.status === 'done').length / job.steps.length * 100);
    else percent = Math.min(99, Math.round((doneEst / totalEst) * 100));

    return {
      id: job.id,
      status: job.status,
      percent,
      elapsed: Math.round((now - job.startedAt) / 1000),
      eta: job.status === 'running' ? Math.max(0, Math.round(remainingEst)) : 0,
      currentKey: job.currentKey,
      steps: job.steps.map(s => ({
        key: s.key,
        label: s.label,
        est: s.est,
        status: s.status,
        elapsed: s.startedAt ? Math.round(((s.endedAt || now) - s.startedAt) / 1000) : 0
      })),
      result: job.result,
      error: job.error
    };
  }

  async start() {
    const initialized = await this.initialize();
    
    if (!initialized) {
      console.log(chalk.red('\n❌ Failed to initialize. Please check your configuration.'));
      process.exit(1);
    }
    
    const PORT = process.env.PORT || 3456;
    this.app.listen(PORT, () => {
      console.log(chalk.green(`\n✅ YouTube Automation Agent running on port ${PORT}`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('📊 Dashboard: ') + chalk.cyan(`http://localhost:${PORT}`));
      console.log(chalk.white('🔧 API Health: ') + chalk.cyan(`http://localhost:${PORT}/health`));
      console.log(chalk.white('📅 Schedule: ') + chalk.cyan(`http://localhost:${PORT}/schedule`));
      console.log(chalk.white('📈 Analytics: ') + chalk.cyan(`http://localhost:${PORT}/analytics`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.yellow('\n🤖 Automation is active. Content will be generated and posted daily.'));
    });
  }
}

// Start the agent
if (require.main === module) {
  const agent = new YouTubeAutomationAgent();
  agent.start().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = { YouTubeAutomationAgent };