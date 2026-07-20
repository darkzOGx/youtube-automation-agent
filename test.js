const { Database } = require('./database/db');
const { Logger } = require('./utils/logger');
const { CredentialManager } = require('./utils/credential-manager');
const chalk = require('chalk');
const path = require('path');

class SystemTest {
  constructor() {
    this.logger = new Logger('SystemTest');
    this.testResults = {};
  }

  async runAllTests() {
    console.log(chalk.cyan.bold('\n🧪 YouTube Automation Agent - System Test'));
    console.log(chalk.gray('═'.repeat(60)));
    
    const tests = [
      { name: 'Database Connection', test: () => this.testDatabase() },
      { name: 'Production Persistence', test: () => this.testProductionPersistence() },
      { name: 'Automation Events Table', test: () => this.testAutomationEventsTable() },
      { name: 'API Validation and Security', test: () => this.testAPIValidationAndSecurity() },
      { name: 'Publishing Safety', test: () => this.testPublishingSafety() },
      { name: 'Multi-Provider Credential Validation', test: () => this.testCredentialValidation() },
      { name: 'Placeholder Scheduling Guard', test: () => this.testPlaceholderSchedulingGuard() },
      { name: 'FFmpeg Resolution', test: () => this.testFFmpegResolution() },
      { name: 'Gemini Media Provider Selection', test: () => this.testGeminiMediaProvider() },
      { name: 'Slideshow Renderer', test: () => this.testSlideshowRenderer() },
      { name: 'Evergreen Template Topics', test: () => this.testEvergreenTopics() },
      { name: 'Walkthrough Module', test: () => this.testWalkthroughModule() },
      { name: 'Logger System', test: () => this.testLogger() },
      { name: 'Directory Structure', test: () => this.testDirectories() },
      { name: 'Agent Loading', test: () => this.testAgentLoading() },
      { name: 'Configuration Files', test: () => this.testConfiguration() }
    ];

    let passed = 0;
    let failed = 0;

    for (const { name, test } of tests) {
      try {
        console.log(chalk.cyan(`\n🔍 Testing ${name}...`));
        await test();
        console.log(chalk.green(`✅ ${name} - PASSED`));
        this.testResults[name] = { status: 'PASSED' };
        passed++;
      } catch (error) {
        console.log(chalk.red(`❌ ${name} - FAILED`));
        console.log(chalk.red(`   Error: ${error.message}`));
        this.testResults[name] = { status: 'FAILED', error: error.message };
        failed++;
      }
    }

    // Display summary
    console.log(chalk.gray('\n' + '═'.repeat(60)));
    console.log(chalk.cyan.bold('📊 Test Summary:'));
    console.log(chalk.green(`✅ Passed: ${passed}`));
    console.log(chalk.red(`❌ Failed: ${failed}`));
    console.log(chalk.cyan(`📝 Total: ${passed + failed}`));

    if (failed === 0) {
      console.log(chalk.green.bold('\n🎉 All tests passed! System is ready to run.'));
      console.log(chalk.cyan('Run: npm start'));
    } else {
      console.log(chalk.yellow.bold('\n⚠️  Some tests failed. Please check the errors above.'));
      console.log(chalk.cyan('Run: npm run setup (to reconfigure)'));
    }

    return failed === 0;
  }

  async testDatabase() {
    const db = new Database();
    await db.initialize();
    
    // Test basic operations
    const stats = await db.getStats();
    if (!stats) throw new Error('Failed to get database stats');
    
    // Test settings
    await db.setSetting('test_key', 'test_value', 'Test setting');
    const value = await db.getSetting('test_key');
    if (value !== 'test_value') throw new Error('Settings read/write failed');
    
    await db.close();
    this.logger.info('Database test completed successfully');
  }

  async testProductionPersistence() {
    const db = new Database();
    await db.initialize();

    const production = {
      id: `prod_test_${Date.now()}`,
      status: 'processing',
      assets: { finalVideo: { path: 'placeholder.mp4' } },
      timeline: { created: new Date().toISOString() },
      scheduledPublishTime: new Date().toISOString(),
      priority: 25,
      estimatedDuration: '1:00'
    };

    const firstId = await db.saveProductionData(production);
    if (firstId !== production.id) {
      throw new Error('saveProductionData did not return the production id');
    }

    const secondId = await db.saveProductionData({
      ...production,
      status: 'ready',
      priority: 90
    });
    if (secondId !== production.id) {
      throw new Error('saveProductionData upsert did not return the production id');
    }

    const saved = await db.getRow('SELECT status, priority FROM productions WHERE id = ?', [production.id]);
    if (!saved || saved.status !== 'ready' || saved.priority !== 90) {
      throw new Error('saveProductionData did not upsert the existing production row');
    }

    await db.executeQuery('DELETE FROM productions WHERE id = ?', [production.id]);
    await db.close();
    this.logger.info('Production persistence test completed successfully');
  }

  async testAutomationEventsTable() {
    const db = new Database();
    await db.initialize();

    await db.executeQuery(
      'INSERT INTO automation_events (event_type, status, data, created_at) VALUES (?, ?, ?, datetime("now"))',
      ['test_event', 'success', JSON.stringify({ ok: true })]
    );

    const row = await db.getRow(
      'SELECT event_type, status, data FROM automation_events WHERE event_type = ? ORDER BY created_at DESC',
      ['test_event']
    );

    if (!row || row.status !== 'success') {
      throw new Error('automation_events row was not persisted');
    }

    await db.executeQuery('DELETE FROM automation_events WHERE event_type = ?', ['test_event']);
    await db.close();
    this.logger.info('Automation events table test completed successfully');
  }

  async testAPIValidationAndSecurity() {
    const { YouTubeAutomationAgent } = require('./index');
    const agent = new YouTubeAutomationAgent();

    if (typeof agent.validateGenerateRequestBody !== 'function') {
      throw new Error('validateGenerateRequestBody is not implemented');
    }
    if (typeof agent.requireAPIKey !== 'function') {
      throw new Error('requireAPIKey is not implemented');
    }

    const valid = agent.validateGenerateRequestBody({
      topic: 'Node automation',
      style: 'tutorial'
    });
    if (!valid.valid || valid.value.topic !== 'Node automation') {
      throw new Error('Valid generate request was rejected');
    }

    const invalidTopic = agent.validateGenerateRequestBody({ topic: 123 });
    if (invalidTopic.valid || invalidTopic.status !== 400) {
      throw new Error('Non-string topic was not rejected');
    }

    const invalidStyle = agent.validateGenerateRequestBody({ style: 'x'.repeat(51) });
    if (invalidStyle.valid || invalidStyle.status !== 400) {
      throw new Error('Overlong style was not rejected');
    }

    const previousKey = process.env.API_KEY;
    process.env.API_KEY = 'test-secret';
    const middleware = agent.requireAPIKey();

    let rejectedNextCalled = false;
    const rejectedResponse = this.createMockResponse();
    middleware({ get: () => 'wrong-secret' }, rejectedResponse, () => {
      rejectedNextCalled = true;
    });

    if (rejectedNextCalled || rejectedResponse.statusCode !== 401) {
      throw new Error('Invalid API key was not rejected');
    }

    let acceptedNextCalled = false;
    const acceptedResponse = this.createMockResponse();
    middleware({ get: () => 'test-secret' }, acceptedResponse, () => {
      acceptedNextCalled = true;
    });

    if (!acceptedNextCalled || acceptedResponse.statusCode) {
      throw new Error('Valid API key was not accepted');
    }

    if (previousKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = previousKey;
    }

    this.logger.info('API validation and security test completed successfully');
  }

  createMockResponse() {
    return {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      }
    };
  }

  async testPublishingSafety() {
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const agent = new PublishingSchedulingAgent({
      updateScheduleEntry: async () => {}
    }, {});

    agent.publishQueue = [
      { productionId: 'prod-a', title: 'A', status: 'scheduled', metadata: {} },
      { productionId: 'prod-b', title: 'B', status: 'scheduled', metadata: {} }
    ];
    agent.uploadToYouTube = async () => ({ id: 'youtube-1' });

    await agent.publishContent('prod-a');

    if (agent.publishQueue.length !== 1 || agent.publishQueue[0].productionId !== 'prod-b') {
      throw new Error('publishContent removed the wrong publish queue entries');
    }

    let missingFileRejected = false;
    try {
      await agent.getVideoStream(path.join(__dirname, 'data', 'missing-placeholder.mp4'));
    } catch (error) {
      missingFileRejected = /video file not found/.test(error.message);
    }

    if (!missingFileRejected) {
      throw new Error('getVideoStream did not reject a missing video file');
    }

    this.logger.info('Publishing safety test completed successfully');
  }

  async testCredentialValidation() {
    const { PROVIDERS } = require('./utils/ai-text-service');
    const manager = new CredentialManager();

    // Isolate the test from any API keys set in the environment
    const envKeys = [...Object.values(PROVIDERS).map(p => p.envKey), 'GEMINI_API_KEY'];
    const savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    try {
      manager.credentials = { youtube: { client_id: 'x' }, gemini: { apiKey: 'gm-test' } };
      if (manager.getMissingCredentials().length !== 0) {
        throw new Error('Gemini-only configuration was incorrectly reported as missing credentials');
      }

      manager.credentials = { youtube: { client_id: 'x' }, aiProvider: { provider: 'openrouter', apiKey: 'sk-or-test' } };
      if (manager.getMissingCredentials().length !== 0) {
        throw new Error('OpenRouter configuration was incorrectly reported as missing credentials');
      }

      manager.credentials = { youtube: { client_id: 'x' }, aiProvider: { provider: 'atlascloud', apiKey: 'atlas-test' } };
      if (manager.getMissingCredentials().length !== 0) {
        throw new Error('Atlas Cloud configuration was incorrectly reported as missing credentials');
      }

      manager.credentials = { youtube: { client_id: 'x' } };
      const missingProvider = manager.getMissingCredentials();
      if (missingProvider.length !== 1 || !/AI provider/.test(missingProvider[0])) {
        throw new Error('Missing AI provider was not detected');
      }

      manager.credentials = { openai: { apiKey: 'sk-test' } };
      const missingYouTube = manager.getMissingCredentials();
      if (missingYouTube.length !== 1 || missingYouTube[0] !== 'youtube') {
        throw new Error('Missing YouTube credentials were not detected');
      }
    } finally {
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
    }

    this.logger.info('Credential validation test completed successfully');
  }

  async testPlaceholderSchedulingGuard() {
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const agent = new PublishingSchedulingAgent({
      saveScheduleEntry: async () => {}
    }, {});

    const simulated = await agent.scheduleContent({
      id: 'prod-simulated',
      script: { title: 'Simulated' },
      assets: { finalVideo: { path: 'video.mp4.assembly.json', simulated: true } }
    });
    if (simulated !== null) {
      throw new Error('Simulated production was scheduled for publishing');
    }

    const missingVideo = await agent.scheduleContent({
      id: 'prod-missing',
      script: { title: 'Missing' },
      assets: {}
    });
    if (missingVideo !== null) {
      throw new Error('Production without a final video was scheduled for publishing');
    }

    const real = await agent.scheduleContent({
      id: 'prod-real',
      script: { title: 'Real' },
      priority: 50,
      scheduledPublishTime: new Date().toISOString(),
      assets: { finalVideo: { path: 'video.mp4' }, thumbnail: {}, captions: {} },
      seo: {}
    });
    if (!real || agent.publishQueue.length !== 1) {
      throw new Error('Real production was not scheduled for publishing');
    }

    this.logger.info('Placeholder scheduling guard test completed successfully');
  }

  async testFFmpegResolution() {
    const { getFFmpegPath, checkFFmpeg, ffmpegInstallHint } = require('./utils/ffmpeg');

    const ffmpegPath = getFFmpegPath();
    if (typeof ffmpegPath !== 'string' || ffmpegPath.length === 0) {
      throw new Error('getFFmpegPath did not return a usable path');
    }

    const available = await checkFFmpeg();
    if (typeof available !== 'boolean') {
      throw new Error('checkFFmpeg did not return a boolean');
    }

    if (!/FFmpeg/i.test(ffmpegInstallHint())) {
      throw new Error('ffmpegInstallHint did not return install guidance');
    }

    this.logger.info(`FFmpeg resolution test completed (binary: ${ffmpegPath}, available: ${available})`);
  }

  async testGeminiMediaProvider() {
    const { AIVideoGenerator } = require('./utils/ai-video-generator');

    const envKeys = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'REPLICATE_API_KEY', 'ELEVENLABS_API_KEY'];
    const savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    try {
      const geminiOnly = new AIVideoGenerator({ gemini: { apiKey: 'test-key' } });
      if (!geminiOnly.gemini) {
        throw new Error('Gemini media service was not initialized from gemini credentials');
      }
      if (geminiOnly.openai) {
        throw new Error('OpenAI client initialized without a key');
      }

      const none = new AIVideoGenerator({});
      if (none.gemini || none.openai) {
        throw new Error('Media services initialized without any credentials');
      }
    } finally {
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
    }

    this.logger.info('Gemini media provider selection test completed successfully');
  }

  async testSlideshowRenderer() {
    const { AIVideoGenerator } = require('./utils/ai-video-generator');
    const { checkFFmpeg } = require('./utils/ffmpeg');
    const fs = require('fs').promises;
    const os = require('os');

    if (!(await checkFFmpeg())) {
      this.logger.warn('FFmpeg unavailable — skipping slideshow renderer test');
      return;
    }

    const sharp = require('sharp');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-slides-'));

    try {
      const stills = [];
      for (let i = 0; i < 3; i++) {
        const stillPath = path.join(dir, `slide_${i}.png`);
        await sharp({
          create: { width: 320, height: 180, channels: 3, background: { r: 60 * i, g: 80, b: 160 } }
        }).png().toFile(stillPath);
        stills.push(stillPath);
      }

      const generator = new AIVideoGenerator({});
      const videoPath = path.join(dir, 'out.mp4');
      await generator.renderSlidesToVideo(stills, 6, videoPath);

      const stats = await fs.stat(videoPath);
      if (!stats.size) {
        throw new Error('Rendered slideshow video is empty');
      }

      // Silent fallback: an unusable audio path must still yield a playable output
      const finalPath = path.join(dir, 'final.mp4');
      await generator.addAudioToVideo(videoPath, path.join(dir, 'missing.mp3'), finalPath);
      const finalStats = await fs.stat(finalPath);
      if (!finalStats.size) {
        throw new Error('Silent-audio fallback did not produce a video');
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }

    this.logger.info('Slideshow renderer test completed successfully');
  }

  async testEvergreenTopics() {
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const agent = new ContentStrategyAgent(null, {});
    agent.historicalPerformance = [];

    // Single scraped keywords must never become video topics
    agent.trendingTopics = [{ topic: 'crown', score: 5 }, { topic: 'official', score: 3 }];
    const fallback = agent.selectOptimalTopic();
    if (!fallback.topic.includes(' ') || fallback.topic.length < 8) {
      throw new Error(`Template mode produced a junk topic: "${fallback.topic}"`);
    }

    // A readable multi-word trend should be used when available
    agent.trendingTopics = [{ topic: 'artificial intelligence explained', score: 5 }];
    const readable = agent.selectOptimalTopic();
    if (readable.topic !== 'artificial intelligence explained') {
      throw new Error(`Readable trending topic was not selected: "${readable.topic}"`);
    }

    this.logger.info('Evergreen template topics test completed successfully');
  }

  async testWalkthroughModule() {
    const { SetupWalkthrough, AI_PROVIDER_GUIDE } = require('./walkthrough');
    const { PROVIDERS } = require('./utils/ai-text-service');

    const walkthrough = new SetupWalkthrough();
    if (typeof walkthrough.run !== 'function') {
      throw new Error('SetupWalkthrough.run is not implemented');
    }

    // Every guided provider must be complete and coherent
    for (const [id, guide] of Object.entries(AI_PROVIDER_GUIDE)) {
      for (const field of ['label', 'keyUrl', 'instructions', 'models', 'defaultModel', 'save', 'validationCreds']) {
        if (!guide[field]) {
          throw new Error(`Provider guide "${id}" is missing "${field}"`);
        }
      }
      if (!guide.models.includes(guide.defaultModel)) {
        throw new Error(`Provider guide "${id}" default model is not in its model list`);
      }

      // save() must produce credentials that pass validation
      const credentials = {};
      guide.save(credentials, 'test-key', guide.defaultModel);
      const manager = new CredentialManager();
      manager.credentials = { youtube: { client_id: 'x' }, ...credentials };

      const envKeys = [...Object.values(PROVIDERS).map(p => p.envKey), 'GEMINI_API_KEY'];
      const savedEnv = {};
      for (const key of envKeys) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
      try {
        if (manager.getMissingCredentials().length !== 0) {
          throw new Error(`Provider guide "${id}" save() output fails credential validation`);
        }
      } finally {
        for (const key of envKeys) {
          if (savedEnv[key] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = savedEnv[key];
          }
        }
      }
    }

    this.logger.info('Walkthrough module test completed successfully');
  }

  async testLogger() {
    const testLogger = new Logger('TestLogger');
    
    testLogger.info('Test info message');
    testLogger.warn('Test warning message');
    testLogger.success('Test success message');
    
    // Test timer
    const timer = testLogger.startTimer('Test Operation');
    await new Promise(resolve => setTimeout(resolve, 100));
    timer.end();
    
    this.logger.info('Logger test completed successfully');
  }

  async testDirectories() {
    const fs = require('fs').promises;
    
    const requiredDirs = [
      'config',
      'logs', 
      'data',
      'agents',
      'database',
      'utils',
      'schedules'
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, dir);
      await fs.access(dirPath);
    }

    this.logger.info('Directory structure test completed successfully');
  }

  async testAgentLoading() {
    // Test that agent files can be loaded
    const agentFiles = [
      './agents/content-strategy-agent',
      './agents/script-writer-agent',
      './agents/thumbnail-designer-agent',
      './agents/seo-optimizer-agent',
      './agents/production-management-agent',
      './agents/publishing-scheduling-agent',
      './agents/analytics-optimization-agent'
    ];

    for (const agentFile of agentFiles) {
      try {
        require(agentFile);
      } catch (error) {
        throw new Error(`Failed to load ${agentFile}: ${error.message}`);
      }
    }

    this.logger.info('Agent loading test completed successfully');
  }

  async testConfiguration() {
    const fs = require('fs').promises;
    
    // Check package.json
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
    if (!packageJson.name || !packageJson.dependencies) {
      throw new Error('Invalid package.json');
    }

    // Check if main index file exists
    await fs.access('./index.js');

    this.logger.info('Configuration test completed successfully');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new SystemTest();
  tester.runAllTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error(chalk.red('Test runner failed:'), error);
      process.exit(1);
    });
}

module.exports = { SystemTest };
