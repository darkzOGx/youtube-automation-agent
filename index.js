require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Logger } = require('./utils/logger');
const { requireApiToken, sameOriginOnly } = require('./utils/security');
const { Database } = require('./database/db');
const { CredentialManager } = require('./utils/credential-manager');
const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
const { ScriptWriterAgent } = require('./agents/script-writer-agent');
const { ThumbnailDesignerAgent } = require('./agents/thumbnail-designer-agent');
const { SEOOptimizerAgent } = require('./agents/seo-optimizer-agent');
const { ProductionManagementAgent } = require('./agents/production-management-agent');
const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
const { AnalyticsOptimizationAgent } = require('./agents/analytics-optimization-agent');
const { DailyAutomation } = require('./schedules/daily-automation');
const chalk = require('chalk');

class YouTubeAutomationAgent {
  constructor() {
    this.logger = new Logger('MainAgent');
    this.db = null;
    this.credentials = null;
    this.agents = {};
    this.app = express();
    this.isInitialized = false;
    this.host = process.env.HOST || '127.0.0.1';
    this.apiToken = this.resolveApiToken();
  }

  // Resolve the API token used to protect mutating endpoints. Prefer an
  // explicitly configured token; otherwise generate one, persist it to a
  // gitignored file, and surface it in the startup banner.
  resolveApiToken() {
    if (process.env.API_TOKEN && process.env.API_TOKEN.length >= 16) {
      return process.env.API_TOKEN;
    }
    const tokenFile = path.join(__dirname, '.api-token');
    try {
      const existing = fs.readFileSync(tokenFile, 'utf8').trim();
      if (existing.length >= 16) {
        process.env.API_TOKEN = existing;
        return existing;
      }
    } catch { /* no token file yet */ }

    const token = crypto.randomBytes(24).toString('hex');
    try {
      fs.writeFileSync(tokenFile, token, { mode: 0o600 });
    } catch (error) {
      this.logger.warn('Could not persist API token file: ' + error.message);
    }
    process.env.API_TOKEN = token;
    return token;
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
    this.agents = {
      strategy: new ContentStrategyAgent(this.db, this.credentials),
      scriptWriter: new ScriptWriterAgent(this.db, this.credentials),
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
    // Security headers. CSP allows the dashboard's inline styles/handlers while
    // still constraining external script/connect origins (defense-in-depth; the
    // primary XSS fix is output-escaping in the dashboard itself).
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    }));

    // Cap request bodies to mitigate memory-exhaustion DoS.
    this.app.use(express.json({ limit: '64kb' }));

    // Global rate limit, with a stricter limit on the expensive generation route.
    const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
    const generateLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
    this.app.use(globalLimiter);

    const requireAuth = requireApiToken(() => this.apiToken);
    const originGuard = sameOriginOnly(() => (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean));

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
        timestamp: new Date().toISOString()
      });
    });

    // Manual content generation (privileged: spends API budget). Requires token + same-origin.
    this.app.post('/generate', generateLimiter, originGuard, requireAuth, async (req, res) => {
      try {
        const { topic, style, length } = this.validateGenerateInput(req.body);
        const result = await this.generateContent(topic, style, length);
        res.json({ success: true, result });
      } catch (error) {
        if (error.statusCode === 400) {
          return res.status(400).json({ success: false, error: error.message });
        }
        this.logger.error('Generation request failed:', error);
        res.status(500).json({ success: false, error: 'Content generation failed' });
      }
    });

    // Get analytics
    this.app.get('/analytics', async (req, res) => {
      try {
        const analytics = await this.agents.analytics.getRecentAnalytics();
        res.json(analytics);
      } catch (error) {
        this.logger.error('Analytics request failed:', error);
        res.status(500).json({ error: 'Failed to load analytics' });
      }
    });

    // Get upcoming schedule
    this.app.get('/schedule', async (req, res) => {
      try {
        const schedule = await this.db.getUpcomingSchedule();
        res.json(schedule);
      } catch (error) {
        this.logger.error('Schedule request failed:', error);
        res.status(500).json({ error: 'Failed to load schedule' });
      }
    });

    // Manual publish (privileged: publishes externally). Requires token + same-origin.
    this.app.post('/publish/:contentId', originGuard, requireAuth, async (req, res) => {
      try {
        const contentId = String(req.params.contentId || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(contentId)) {
          return res.status(400).json({ success: false, error: 'Invalid content id' });
        }
        const result = await this.agents.publishing.publishContent(contentId);
        res.json({ success: true, result });
      } catch (error) {
        this.logger.error('Publish request failed:', error);
        res.status(500).json({ success: false, error: 'Publish failed' });
      }
    });
  }

  // Validate and normalize /generate input. Throws a 400-tagged error on bad input.
  validateGenerateInput(body) {
    const bad = (msg) => { const e = new Error(msg); e.statusCode = 400; return e; };
    const src = body && typeof body === 'object' ? body : {};

    let { topic, style, length } = src;

    if (topic !== undefined && topic !== null) {
      if (typeof topic !== 'string') throw bad('topic must be a string');
      if (topic.length > 200) throw bad('topic must be 200 characters or fewer');
    } else {
      topic = null;
    }

    const allowedStyles = ['tutorial', 'explainer', 'list', 'listicle', 'review', 'story', null, undefined];
    if (style !== undefined && style !== null) {
      if (typeof style !== 'string' || !allowedStyles.includes(style.toLowerCase())) {
        throw bad('style is not a recognized value');
      }
      style = style.toLowerCase();
    } else {
      style = null;
    }

    const allowedLengths = ['short', 'medium', 'long', undefined, null];
    if (length !== undefined && length !== null && !allowedLengths.includes(length)) {
      throw bad('length must be short, medium, or long');
    }
    length = length || 'medium';

    return { topic, style, length };
  }

  async generateContent(topic = null, style = null, length = 'medium') {
    this.logger.info('Starting content generation pipeline...');
    
    // Step 1: Strategy
    const strategy = await this.agents.strategy.generateContentStrategy(topic);
    this.logger.info(`Strategy generated: ${strategy.topic}`);
    
    // Step 2: Script Writing
    const script = await this.agents.scriptWriter.generateScript(strategy);
    this.logger.info(`Script generated: ${script.title}`);
    
    // Step 3: Thumbnail Design
    const thumbnail = await this.agents.thumbnailDesigner.generateThumbnail(script);
    this.logger.info('Thumbnail generated');
    
    // Step 4: SEO Optimization
    const seoData = await this.agents.seoOptimizer.optimize(script, strategy);
    this.logger.info('SEO optimization complete');
    
    // Step 5: Production Management
    const productionData = await this.agents.production.processContent({
      strategy,
      script,
      thumbnail,
      seo: seoData
    });
    this.logger.info('Production processing complete');
    
    // Production data is already persisted by the production agent
    // (processContent -> saveProductionData/updateProductionData); do not
    // insert it again here or it violates the productions.id primary key.
    const contentId = productionData.id;
    this.logger.info(`Content ready with ID: ${contentId}`);

    return {
      contentId,
      title: script.title,
      scheduledFor: productionData.scheduledPublishTime
    };
  }

  async start() {
    const initialized = await this.initialize();
    
    if (!initialized) {
      console.log(chalk.red('\n❌ Failed to initialize. Please check your configuration.'));
      process.exit(1);
    }
    
    const PORT = process.env.PORT || 3456;
    this.app.listen(PORT, this.host, () => {
      const display = this.host === '0.0.0.0' ? 'localhost' : this.host;
      console.log(chalk.green(`\n✅ YouTube Automation Agent running on ${this.host}:${PORT}`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('📊 Dashboard: ') + chalk.cyan(`http://${display}:${PORT}`));
      console.log(chalk.white('🔧 API Health: ') + chalk.cyan(`http://${display}:${PORT}/health`));
      console.log(chalk.white('📅 Schedule: ') + chalk.cyan(`http://${display}:${PORT}/schedule`));
      console.log(chalk.white('📈 Analytics: ') + chalk.cyan(`http://${display}:${PORT}/analytics`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('🔑 API token (for /generate and /publish): ') + chalk.yellow(this.apiToken));
      console.log(chalk.gray('   Send as "Authorization: Bearer <token>" or "x-api-token" header.'));
      if (this.host !== '127.0.0.1' && this.host !== 'localhost') {
        console.log(chalk.red(`⚠️  Server is bound to ${this.host} (non-localhost). Ensure access is restricted.`));
      }
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