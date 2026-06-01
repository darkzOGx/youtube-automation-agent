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
    this.generationStatus = {
      status: 'idle',
      currentStep: 'Idle',
      error: null,
      title: null,
      contentId: null,
      timestamp: new Date().toISOString(),
      steps: {
        strategy: 'pending',
        script: 'pending',
        thumbnail: 'pending',
        seo: 'pending',
        production: 'pending'
      },
      estimatedSecondsRemaining: 0
    };
  }

  async initialize() {
    try {
      console.log(chalk.cyan.bold('\n🎬 YouTube Automation Agent v1.0'));
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
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'dashboard')));
    this.app.use('/data', express.static(path.join(__dirname, 'data')));
    this.app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    
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

    // Get background generation status
    this.app.get('/generation-status', (req, res) => {
      res.json(this.generationStatus);
    });
    
    // Manual content generation
    this.app.post('/generate', async (req, res) => {
      try {
        if (this.generationStatus && this.generationStatus.status === 'generating') {
          return res.status(400).json({ success: false, error: 'A content generation task is already running.' });
        }
        
        const { topic, style, length, imageProvider, imageModel, videoFormat, testMode } = req.body;
        
        // Start background content generation
        this.runBackgroundGeneration(topic, style, length, imageProvider, imageModel, videoFormat, testMode).catch(err => {
          this.logger.error('Background generation process crashed:', err);
        });
        
        res.json({ success: true, message: 'Content generation pipeline started successfully in the background.' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Mount separate dashboard detail pages
    require('./dashboard-details.js')(this.app, this.agents, this.db);

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

    // Get full publish history/queue
    this.app.get('/publish-history', async (req, res) => {
      try {
        const history = await this.db.getPublishHistory();
        res.json(history);
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

    // Delete schedule item
    this.app.delete('/schedule/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { feedback, videoTitle, productionId } = req.body;
        
        // Remove from schedule agent queue in memory
        this.agents.publishing.publishQueue = this.agents.publishing.publishQueue.filter(e => e.id !== id);
        
        // Remove from db
        await this.db.deleteScheduleEntry(id);
        
        // Save feedback if provided
        if (feedback && feedback.trim() !== '') {
          await this.db.saveFeedback({ feedback, videoTitle, productionId });
          this.logger.info(`Feedback saved for deleted video: ${videoTitle}`);
        }
        
        this.logger.info(`Schedule entry deleted: ${id}`);
        res.json({ success: true, message: 'Schedule entry deleted.' });
      } catch (error) {
        this.logger.error(`Failed to delete schedule entry ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // List all YouTube channels on the authenticated account (personal + Brand Accounts)
    this.app.get('/youtube/channels', async (req, res) => {
      try {
        const youtube = this.credentials.getYouTubeClient();

        // Get personal channel (mine: true)
        const mineResponse = await youtube.channels.list({
          part: 'snippet,statistics',
          mine: true,
          maxResults: 50
        });

        // Get Brand Account channels managed by this account
        let brandChannels = [];
        try {
          const brandResponse = await youtube.channels.list({
            part: 'snippet,statistics',
            managedByMe: true,
            maxResults: 50
          });
          brandChannels = brandResponse.data.items || [];
        } catch (brandErr) {
          this.logger.warn('Could not fetch brand channels:', brandErr.message);
        }

        // Merge, dedup by channel ID
        const allItems = [...(mineResponse.data.items || []), ...brandChannels];
        const seen = new Set();
        const channels = allItems
          .filter(ch => {
            if (seen.has(ch.id)) return false;
            seen.add(ch.id);
            return true;
          })
          .map(ch => ({
            id: ch.id,
            title: ch.snippet.title,
            description: ch.snippet.description,
            customUrl: ch.snippet.customUrl,
            thumbnail: ch.snippet.thumbnails?.default?.url || null,
            subscriberCount: ch.statistics?.subscriberCount || '0',
            videoCount: ch.statistics?.videoCount || '0'
          }));

        // Include which channel is currently selected (ID + saved name)
        const selectedChannelId = this.credentials.credentials?.channel?.selectedChannelId || null;
        const selectedChannelName = this.credentials.credentials?.channel?.selectedChannelName || null;

        res.json({ channels, selectedChannelId, selectedChannelName });
      } catch (error) {
        this.logger.error('Failed to list YouTube channels:', error.message || error);
        if (error.response && error.response.data) {
          this.logger.error('YouTube API Error details:', JSON.stringify(error.response.data));
        }
        res.status(500).json({ error: error.message });
      }
    });

    // Select a specific channel for uploads
    this.app.post('/youtube/select-channel', async (req, res) => {
      try {
        const { channelId, channelName } = req.body;
        if (!channelId) {
          return res.status(400).json({ error: 'channelId is required' });
        }

        // Persist the selected channel in credentials
        if (!this.credentials.credentials.channel) {
          this.credentials.credentials.channel = {};
        }
        this.credentials.credentials.channel.selectedChannelId = channelId;
        if (channelName) {
          this.credentials.credentials.channel.selectedChannelName = channelName;
        }
        await this.credentials.saveCredentials();

        this.logger.info(`YouTube channel selected for uploads: ${channelId} (${channelName || 'unnamed'})`);
        res.json({ success: true, channelId, channelName });
      } catch (error) {
        this.logger.error('Failed to select channel:', error);
        res.status(500).json({ error: error.message });
      }
    });
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
    
    // Step 6: Save to database
    const contentId = await this.db.saveProductionData(productionData);
    this.logger.info(`Content saved with ID: ${contentId}`);
    
    // Step 7: Schedule for publishing
    await this.agents.publishing.scheduleContent(productionData);
    this.logger.info('Content scheduled for publishing');
    
    return {
      contentId,
      title: script.title,
      scheduledFor: productionData.scheduledPublishTime
    };
  }

  async runBackgroundGeneration(topic = null, style = null, length = 'medium', imageProvider = 'gemini', imageModel = 'imagen-4.0-generate-001', videoFormat = 'slideshow', testMode = false) {
    this.generationStatus = {
      status: 'generating',
      currentStep: 'Initializing content generation...',
      error: null,
      title: null,
      contentId: null,
      timestamp: new Date().toISOString(),
      steps: {
        strategy: 'processing',
        script: 'pending',
        thumbnail: 'pending',
        seo: 'pending',
        production: 'pending'
      },
      estimatedSecondsRemaining: 180
    };
    
    try {
      this.logger.info('Starting background content generation pipeline...');
      
      // Step 1: Strategy
      this.generationStatus.currentStep = 'Analyzing Content Strategy...';
      const topTopics = this.agents.analytics.getTopPerformingTopics();
      const topKeywords = this.agents.analytics.getTopPerformingKeywords();
      const analyticsData = { topTopics, topKeywords };
      
      const strategy = await this.agents.strategy.generateContentStrategy(topic, analyticsData);
      if (style) {
        strategy.contentType = style.charAt(0).toUpperCase() + style.slice(1);
      }
      this.logger.info(`Strategy generated: ${strategy.topic} (${strategy.contentType})`);
      
      // Step 2: Script Writing
      this.generationStatus.steps.strategy = 'completed';
      this.generationStatus.steps.script = 'processing';
      this.generationStatus.estimatedSecondsRemaining = 160;
      this.generationStatus.currentStep = 'Generating Story Script via Google Gemini...';
      const script = await this.agents.scriptWriter.generateScript(strategy);
      script.imageProvider = imageProvider;
      script.imageModel = imageModel;
      this.generationStatus.title = script.title;
      this.logger.info(`Script generated: ${script.title}`);
      
      // Step 3: Thumbnail Design
      this.generationStatus.steps.script = 'completed';
      this.generationStatus.steps.thumbnail = 'processing';
      this.generationStatus.estimatedSecondsRemaining = 145;
      this.generationStatus.currentStep = 'Designing custom thumbnail & enhanced prompts...';
      const thumbnail = await this.agents.thumbnailDesigner.generateThumbnail(script);
      this.logger.info('Thumbnail generated');
      
      // Step 4: SEO Optimization
      this.generationStatus.steps.thumbnail = 'completed';
      this.generationStatus.steps.seo = 'processing';
      this.generationStatus.estimatedSecondsRemaining = 130;
      this.generationStatus.currentStep = 'Optimizing SEO keywords and tags...';
      const seoData = await this.agents.seoOptimizer.optimize(script, strategy, analyticsData);
      this.logger.info('SEO optimization complete');
      
      // Step 5: Production Management (Vivid fairytale assets + Free Google TTS + Slideshow compilation)
      this.generationStatus.steps.seo = 'completed';
      this.generationStatus.steps.production = 'processing';
      this.generationStatus.estimatedSecondsRemaining = 600;
      this.generationStatus.currentStep = 'Generating visual illustrations and synthesizing audio narration...';
      const productionData = await this.agents.production.processContent({
        strategy,
        script,
        thumbnail,
        seo: seoData,
        videoFormat: videoFormat || 'slideshow',
        testMode
      });
      this.logger.info('Production processing complete');
      
      // Step 6: Save to database
      this.generationStatus.steps.production = 'completed';
      this.generationStatus.estimatedSecondsRemaining = 0;
      this.generationStatus.currentStep = 'Saving final video details to database...';
      const contentId = await this.db.saveProductionData(productionData);
      this.logger.info(`Content saved with ID: ${contentId}`);
      
      // Step 7: Schedule for publishing
      this.generationStatus.currentStep = 'Scheduling content for publication...';
      await this.agents.publishing.scheduleContent(productionData);
      this.logger.info('Content scheduled for publishing');
      
      this.generationStatus.status = 'completed';
      this.generationStatus.currentStep = 'Content generated successfully and scheduled for publication!';
      this.generationStatus.contentId = contentId;
      this.generationStatus.timestamp = new Date().toISOString();
    } catch (error) {
      this.logger.error('Background generation failed:', error);
      this.generationStatus.status = 'failed';
      this.generationStatus.currentStep = 'Failed during: ' + this.generationStatus.currentStep;
      this.generationStatus.steps = Object.fromEntries(
        Object.entries(this.generationStatus.steps).map(
          ([key, val]) => [key, val === 'processing' ? 'failed' : val]
        )
      );
      this.generationStatus.error = error.message || 'Unknown error occurred.';
      this.generationStatus.timestamp = new Date().toISOString();
      this.generationStatus.estimatedSecondsRemaining = 0;
    }
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