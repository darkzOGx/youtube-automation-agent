const { Database } = require('./database/db');
const { Logger } = require('./utils/logger');
const { CredentialManager } = require('./utils/credential-manager');
const { AudienceEngagementService } = require('./utils/audience-engagement-service');
const { DailyAutomation } = require('./schedules/daily-automation');
const chalk = require('chalk');
const path = require('path');
const { ProductionReadinessService } = require('./utils/production-readiness-service');
const { normalizeTags, validateYouTubeMetadata } = require('./utils/youtube-metadata-validator');

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
      { name: 'Local Activation Metrics', test: () => this.testActivationMetrics() },
      { name: 'Anonymous Telemetry Opt-in', test: () => this.testAnonymousTelemetryOptIn() },
      { name: 'Operator Workflow API', test: () => this.testOperatorWorkflowAPI() },
      { name: 'Autonomous Channel Operator', test: () => this.testAutonomousChannelOperator() },
      { name: 'Closed-loop Channel Learning', test: () => this.testChannelLearningLoop() },
      { name: 'Controlled Growth Experiments Studio', test: () => this.testGrowthExperimentsStudio() },
      { name: 'Outcome and ROI Studio', test: () => this.testOutcomeROIStudio() },
      { name: 'Scene-Aware Retention Studio', test: () => this.testSceneAwareRetentionStudio() },
      { name: 'Production Readiness Gate', test: () => this.testProductionReadinessGate() },
      { name: 'Durable Multi-Provider Video Generation', test: () => this.testVideoProviderLayer() },
      { name: 'Scene Repair Studio', test: () => this.testSceneRepairStudio() },
      { name: 'Narration Reliability and Recovery', test: () => this.testNarrationReliability() },
      { name: 'Shorts Repurposing Studio', test: () => this.testShortsRepurposingStudio() },
      { name: 'Research and Provenance Desk', test: () => this.testProvenanceDesk() },
      { name: 'DarkzSEO Discoverability Preflight', test: () => this.testDiscoverabilityPreflight() },
      { name: 'Resumable Generation Checkpoints', test: () => this.testResumableGenerationCheckpoints() },
      { name: 'API Validation and Security', test: () => this.testAPIValidationAndSecurity() },
      { name: 'Publishing Safety', test: () => this.testPublishingSafety() },
      { name: 'Publishing Frequency', test: () => this.testPublishingFrequency() },
      { name: 'Multi-Provider Credential Validation', test: () => this.testCredentialValidation() },
      { name: 'AI Text Service Token Compatibility', test: () => this.testAITextServiceTokenParams() },
      { name: 'Placeholder Scheduling Guard', test: () => this.testPlaceholderSchedulingGuard() },
      { name: 'FFmpeg Resolution', test: () => this.testFFmpegResolution() },
      { name: 'Gemini Media Provider Selection', test: () => this.testGeminiMediaProvider() },
      { name: 'Slideshow Renderer', test: () => this.testSlideshowRenderer() },
      { name: 'Evergreen Template Topics', test: () => this.testEvergreenTopics() },
      { name: 'Walkthrough Module', test: () => this.testWalkthroughModule() },
      { name: 'Logger System', test: () => this.testLogger() },
      { name: 'Directory Structure', test: () => this.testDirectories() },
      { name: 'Agent Loading', test: () => this.testAgentLoading() },
      { name: 'Configuration Files', test: () => this.testConfiguration() },
      { name: 'Audience Comment Store', test: () => this.testAudienceCommentStore() },
      { name: 'Engagement Insight Store', test: () => this.testEngagementInsightStore() },
      { name: 'Reply Draft Lifecycle Store', test: () => this.testReplyDraftStore() },
      { name: 'YouTube Scope Detection', test: () => this.testYouTubeScopeDetection() },
      { name: 'Audience Comment Sync', test: () => this.testAudienceCommentSync() },
      { name: 'Audience Comment Analysis', test: () => this.testAudienceCommentAnalysis() },
      { name: 'Audience Idea Mining', test: () => this.testAudienceIdeaMining() },
      { name: 'Reply Drafting', test: () => this.testReplyDrafting() },
      { name: 'Reply Approval and Posting', test: () => this.testReplyApprovalAndPosting() },
      { name: 'Engagement AI Provider Wiring', test: () => this.testEngagementAIProviderWiring() },
      { name: 'Engagement Sync Schedule', test: () => this.testEngagementSyncSchedule() },
      { name: 'Growth Experiment Refresh Schedule', test: () => this.testGrowthExperimentRefreshSchedule() }
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

  async testActivationMetrics() {
    const fs = require('fs').promises;
    const { ActivationMetrics } = require('./utils/activation-metrics');
    const db = new Database();
    await db.initialize();
    const id = `activation_test_${Date.now()}`;
    const videoPath = path.join(__dirname, 'temp', `${id}.mp4`);
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d
    ]);

    try {
      await fs.mkdir(path.dirname(videoPath), { recursive: true });
      await fs.writeFile(videoPath, mp4Header);
      await db.saveProductionData({
        id,
        status: 'ready',
        assets: { finalVideo: { path: videoPath, simulated: false } },
        timeline: { readyForUpload: new Date().toISOString() },
        scheduledPublishTime: null,
        priority: 1,
        estimatedDuration: '0:01'
      });

      const activation = new ActivationMetrics(db);
      const summary = await activation.getSummary();
      if (!summary.milestones.firstRealVideo.achieved || summary.counts.realVideos < 1) {
        throw new Error('A verified non-simulated MP4 was not counted as activation');
      }

      await fs.writeFile(videoPath, Buffer.from('renamed-but-not-an-mp4'));
      const invalidContainerSummary = await activation.getSummary();
      if (invalidContainerSummary.counts.realVideos >= summary.counts.realVideos) {
        throw new Error('A file with an .mp4 extension but no MP4 signature was counted as activation');
      }

      await fs.writeFile(videoPath, mp4Header);
      await db.updateProductionData({
        id,
        status: 'simulated',
        assets: { finalVideo: { path: videoPath, simulated: true } },
        timeline: {},
        scheduledPublishTime: null,
        priority: 1
      });
      const simulatedSummary = await activation.getSummary();
      if (simulatedSummary.counts.realVideos >= summary.counts.realVideos) {
        throw new Error('A simulated MP4 was incorrectly counted as activation');
      }
    } finally {
      await db.executeQuery('DELETE FROM productions WHERE id = ?', [id]);
      await fs.unlink(videoPath).catch(() => {});
      await db.close();
    }

    this.logger.info('Local activation metrics test completed successfully');
  }

  async testAnonymousTelemetryOptIn() {
    const { AnonymousTelemetry } = require('./utils/anonymous-telemetry');
    const savedEnabled = process.env.ANONYMOUS_TELEMETRY_ENABLED;
    const savedEndpoint = process.env.ANONYMOUS_TELEMETRY_ENDPOINT;
    const db = new Database();
    await db.initialize();
    try {
      delete process.env.ANONYMOUS_TELEMETRY_ENABLED;
      delete process.env.ANONYMOUS_TELEMETRY_ENDPOINT;
      const telemetry = new AnonymousTelemetry(db, this.logger);
      if (telemetry.configuration().enabled) throw new Error('Anonymous telemetry was enabled without opt-in');

      process.env.ANONYMOUS_TELEMETRY_ENABLED = 'true';
      process.env.ANONYMOUS_TELEMETRY_ENDPOINT = 'http://example.com/events';
      if (telemetry.configuration().enabled) throw new Error('Anonymous telemetry accepted a non-HTTPS endpoint');
    } finally {
      if (savedEnabled === undefined) delete process.env.ANONYMOUS_TELEMETRY_ENABLED;
      else process.env.ANONYMOUS_TELEMETRY_ENABLED = savedEnabled;
      if (savedEndpoint === undefined) delete process.env.ANONYMOUS_TELEMETRY_ENDPOINT;
      else process.env.ANONYMOUS_TELEMETRY_ENDPOINT = savedEndpoint;
      await db.close();
    }
    this.logger.info('Anonymous telemetry opt-in test completed successfully');
  }

  async testOperatorWorkflowAPI() {
    const { YouTubeAutomationAgent } = require('./index');
    const { OperatorService } = require('./utils/operator-service');
    const db = new Database();
    await db.initialize();
    let server;
    let job;
    let learningRecommendation;

    try {
      job = await db.createGenerationJob({ topic: 'Operator workflow test', style: 'explainer', length: 'short' });
      await db.updateGenerationJob(job.id, { status: 'running', stage: 'script', progress: 25 });
      const updated = await db.getGenerationJob(job.id);
      if (updated.stage !== 'script' || updated.progress !== 25) {
        throw new Error('Generation job progress was not persisted');
      }

      const operator = new OperatorService(db);
      operator.notify = async () => null;
      const quality = await operator.runQualityChecks({
        script: { title: 'Test title', fullScript: 'x'.repeat(250) },
        seo: { title: 'Test title', description: 'x'.repeat(80), tags: ['one', 'two', 'three'] },
        assets: { finalVideo: { path: 'placeholder.info', simulated: true } }
      }, { bannedTopics: [] });
      if (quality.passed || !quality.blockingFailures.includes('video')) {
        throw new Error('Quality gate did not block a simulated video');
      }

      const agent = new YouTubeAutomationAgent();
      agent.db = db;
      agent.operator = operator;
      agent.agents = {
        analytics: {
          getRecentAnalytics: async () => ({ totalVideos: 0, averagePerformanceScore: 0, topPerformers: [], insights: [] })
        }
      };
      agent.scheduler = {
        isEnabled: true,
        pauseAutomation: async function() { this.isEnabled = false; },
        resumeAutomation: async function() { this.isEnabled = true; }
      };
      agent.isInitialized = true;
      agent.setupAPI();
      server = await new Promise(resolve => {
        const running = agent.app.listen(0, () => resolve(running));
      });
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
      const dashboard = await response.json();
      if (
        !response.ok ||
        !Array.isArray(dashboard.jobs) ||
        !Array.isArray(dashboard.pipeline) ||
        !Array.isArray(dashboard.operatorRuns) ||
        dashboard.activation?.privacy !== 'local-only'
      ) {
        throw new Error('Operator dashboard API did not return its data contract');
      }
      const unavailableStart = await fetch(`http://127.0.0.1:${port}/api/operator/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (unavailableStart.status !== 503) {
        throw new Error('Autonomous operator did not fail closed when its strategy agent was unavailable');
      }

      learningRecommendation = await db.saveLearningRecommendation({
        fingerprint: `operator-api-${Date.now()}`,
        category: 'format',
        title: 'Test evidence-backed recommendation',
        rationale: 'Created only for API contract verification.',
        evidence: { sampleSize: 4 },
        proposedChange: { target: 'future_plans', prefer: 'tutorial' },
        confidence: 'medium'
      });
      const approveLearning = await fetch(
        `http://127.0.0.1:${port}/api/learning/recommendations/${learningRecommendation.id}/approve`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      const approvedLearning = await approveLearning.json();
      if (!approveLearning.ok || approvedLearning.result?.status !== 'approved') {
        throw new Error('Learning recommendation review API did not persist approval');
      }
    } finally {
      if (server) await new Promise(resolve => server.close(resolve));
      if (job) await db.executeQuery('DELETE FROM generation_jobs WHERE id = ?', [job.id]);
      if (learningRecommendation) await db.executeQuery('DELETE FROM learning_recommendations WHERE id = ?', [learningRecommendation.id]);
      await db.close();
    }

    this.logger.info('Operator workflow API test completed successfully');
  }

  async testAutonomousChannelOperator() {
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const { AutonomousChannelOperator } = require('./utils/autonomous-channel-operator');
    const db = new Database();
    await db.initialize();
    const previousStrategy = await db.getChannelStrategy();
    let run;
    let recoverableJob;

    try {
      const strategy = await db.saveChannelStrategy({
        objective: 'Teach small teams to automate useful work',
        audience: 'Small business operators',
        valueProposition: 'Practical steps without hype',
        contentPillars: ['AI workflows', 'Automation playbooks'],
        cadencePerWeek: 2,
        videosPerRun: 2,
        defaultFormat: 'tutorial',
        defaultLength: 'short',
        successMetric: 'Returning viewers',
        constraints: 'Do not invent statistics',
        status: 'active'
      });
      if (strategy.contentPillars.length !== 2 || strategy.cadence_per_week !== 2) {
        throw new Error('Channel strategy was not persisted correctly');
      }

      const strategyAgent = new ContentStrategyAgent(db, {});
      strategyAgent.analyzeTrends = async function() {
        this.trendingTopics = [{
          topic: 'practical AI workflows', score: 8, sources: ['trending'],
          evidence: [{
            url: 'https://www.youtube.com/watch?v=research123',
            title: 'Practical AI workflows', publisher: 'Evidence channel', sourceType: 'video'
          }]
        }];
        this.competitorData = [];
      };
      const planned = await strategyAgent.researchAndPlanChannel(strategy);
      if (
        planned.plan.length !== 2 || !planned.research.sources.includes('YouTube most-popular videos') ||
        planned.research.sourceCatalog.length !== 1 || planned.plan[0].sourceUrls.length !== 1
      ) {
        throw new Error('Strategy did not produce an evidence-labeled autonomous plan');
      }

      const receivedInputs = [];
      let resumedJobs = 0;
      const operator = new AutonomousChannelOperator(db, {
        researchAndPlan: async () => planned,
        startGenerationJob: async input => {
          receivedInputs.push(input);
          return { id: `fake-job-${receivedInputs.length}` };
        },
        waitForGenerationJob: async jobId => ({
          id: jobId,
          status: 'completed',
          production_id: `production-${jobId}`,
          details: { reviewStatus: 'needs_review' }
        }),
        resumeGenerationJob: async jobId => {
          resumedJobs++;
          await db.updateGenerationJob(jobId, { status: 'completed', productionId: `production-${jobId}` });
          return db.getGenerationJob(jobId);
        }
      });
      run = await operator.start(strategy);
      await operator.activeRuns.get(run.id);
      const completed = await db.getOperatorRun(run.id);
      if (
        completed.status !== 'waiting_review' ||
        completed.generatedJobs.length !== 2 ||
        receivedInputs.some(input => input.source !== 'autonomous_operator' || !input.strategyContext?.angle) ||
        receivedInputs[0].strategyContext.researchSources.length !== 1
      ) {
        throw new Error('Autonomous operator did not execute the planned workflow');
      }

      recoverableJob = await db.createGenerationJob({ topic: planned.plan[0].topic, source: 'autonomous_operator' });
      await db.updateGenerationJob(recoverableJob.id, { status: 'interrupted', stage: 'script' });
      const interruptedJobs = completed.generatedJobs.map((item, index) => index === 0
        ? { ...item, jobId: recoverableJob.id, status: 'interrupted', reviewStatus: null }
        : item);
      await db.updateOperatorRun(run.id, {
        status: 'interrupted',
        stage: 'producing_1_of_2',
        progress: 40,
        generatedJobs: interruptedJobs,
        error: 'The application restarted before this operator run finished',
        completedAt: new Date().toISOString()
      });
      await operator.resume(run.id, strategy);
      await operator.activeRuns.get(run.id);
      const recoveredRun = await db.getOperatorRun(run.id);
      if (resumedJobs !== 1 || recoveredRun.status !== 'waiting_review' || recoveredRun.generatedJobs[0].status !== 'completed') {
        throw new Error('Autonomous operator did not continue from its saved plan and interrupted job');
      }
    } finally {
      if (run) {
        const stored = await db.getOperatorRun(run.id);
        for (const item of stored?.generatedJobs || []) {
          if (item.ideaId) await db.executeQuery('DELETE FROM content_ideas WHERE id = ?', [item.ideaId]);
        }
        await db.executeQuery('DELETE FROM operator_runs WHERE id = ?', [run.id]);
      }
      if (previousStrategy) {
        await db.saveChannelStrategy({
          objective: previousStrategy.objective,
          audience: previousStrategy.audience,
          valueProposition: previousStrategy.value_proposition,
          contentPillars: previousStrategy.contentPillars,
          cadencePerWeek: previousStrategy.cadence_per_week,
          videosPerRun: previousStrategy.videos_per_run,
          defaultFormat: previousStrategy.default_format,
          defaultLength: previousStrategy.default_length,
          successMetric: previousStrategy.success_metric,
          constraints: previousStrategy.constraints,
          status: previousStrategy.status
        });
      } else {
        await db.executeQuery("DELETE FROM channel_strategies WHERE id = 'default'");
      }
      if (recoverableJob) await db.executeQuery('DELETE FROM generation_jobs WHERE id = ?', [recoverableJob.id]);
      await db.close();
    }

    this.logger.info('Autonomous channel operator test completed successfully');
  }

  async testChannelLearningLoop() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-learning-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'learning.db');
    await db.initialize();

    try {
      const learning = new ChannelLearningEngine(db);
      const report = (videoId, format, performanceScore, ctr, retention, simulated = false) => ({
        videoId,
        videoDetails: {
          title: `${format} automation guide`,
          publishedAt: new Date(Date.now() - 8 * 86400000).toISOString()
        },
        analytics: {
          simulated,
          views: { totalViews: 500, totalImpressions: 5000, averageCTR: ctr },
          watchTime: { averageViewPercentage: retention, averageViewDuration: 240, totalWatchTime: 2000 },
          engagement: { engagementRate: format === 'tutorial' ? 6 : 2 }
        },
        thumbnailMetrics: { impressions: 5000, clickThroughRate: ctr },
        performance: { score: performanceScore, grade: 'B' }
      });
      const context = format => ({
        strategy: { topic: `${format} topic`, contentType: format, requestedLengthKey: 'medium' },
        script: { hook: 'A concise opening that immediately promises a useful and concrete result.' },
        thumbnail: { concept: { composition: 'centered' } }
      });

      await learning.capture(report('learning-tutorial-1', 'tutorial', 88, 7.5, 62), context('tutorial'), '7d');
      await learning.capture(report('learning-tutorial-2', 'tutorial', 84, 7, 58), context('tutorial'), '7d');
      await learning.capture(report('learning-list-1', 'list', 52, 3.5, 39), context('list'), '7d');
      await learning.capture(report('learning-list-2', 'list', 48, 3, 35), context('list'), '7d');
      await learning.capture(report('learning-simulated', 'review', 99, 12, 90, true), context('review'), '7d');

      const summary = await learning.getSummary();
      const recommendation = summary.recommendations.find(item => item.category === 'format');
      if (summary.measuredVideos !== 4 || !recommendation || !/tutorial/.test(recommendation.title)) {
        throw new Error('Learning engine did not derive a real-evidence format recommendation');
      }
      if (summary.recommendations.some(item => /review/.test(item.title))) {
        throw new Error('Simulated analytics influenced a learning recommendation');
      }

      const approved = await db.reviewLearningRecommendation(recommendation.id, 'approved');
      if (approved.status !== 'approved') throw new Error('Learning recommendation approval was not persisted');

      const strategyAgent = new ContentStrategyAgent(db, {});
      strategyAgent.analyzeTrends = async function() {
        this.trendingTopics = [];
        this.competitorData = [];
      };
      const planned = await strategyAgent.researchAndPlanChannel({
        objective: 'Teach useful automation',
        audience: 'Small teams',
        value_proposition: 'Practical guidance',
        contentPillars: ['Automation'],
        videos_per_run: 1,
        default_format: 'tutorial',
        default_length: 'medium'
      });
      if (
        planned.research.approvedLearnings.length !== 1 ||
        !planned.research.sources.includes('Operator-approved channel performance learnings')
      ) {
        throw new Error('Approved learning was not supplied to autonomous planning');
      }

      const due = await learning.getDueMeasurementWindows({
        youtube_id: 'unmeasured-video',
        published_at: new Date(Date.now() - 8 * 86400000).toISOString()
      });
      if (!due.includes('24h') || !due.includes('7d')) {
        throw new Error('24-hour and 7-day learning windows were not scheduled');
      }

      const { YouTubeAutomationAgent } = require('./index');
      const { ThumbnailDesignerAgent } = require('./agents/thumbnail-designer-agent');
      const workflow = new YouTubeAutomationAgent();
      const titleVariants = workflow.buildTitleExperimentVariants('Automate Your Weekly Reporting');
      const selected = workflow.validateEditorData(
        { selectedTitleVariant: 1, selectedThumbnailVariant: 2 },
        { packagingExperiment: { titleVariants, thumbnailVariants: [{}, {}, {}] } }
      );
      if (titleVariants.length !== 3 || selected.selectedTitleVariant !== 1 || selected.selectedThumbnailVariant !== 2) {
        throw new Error('Packaging experiment selections were not validated');
      }

      const thumbnailDesigner = new ThumbnailDesignerAgent(db, {});
      thumbnailDesigner.createThumbnail = async (_concept, suffix) => `base-${suffix}`;
      thumbnailDesigner.addTextOverlay = async (_path, _concept, suffix) => `overlay-${suffix}`;
      thumbnailDesigner.optimizeForYouTube = async (_path, suffix) => `optimized-${suffix}.jpg`;
      const thumbnailVariants = await thumbnailDesigner.generateABVariants({
        primaryText: 'GUIDE',
        colors: { primary: 'blue', secondary: 'white', accent: 'green' },
        composition: 'split'
      });
      if (thumbnailVariants.length !== 3 || thumbnailVariants.some(item => !item.path.endsWith('.jpg'))) {
        throw new Error('Approved packaging learning did not produce complete thumbnail variants');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Closed-loop channel learning test completed successfully');
  }

  async testGrowthExperimentsStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { GrowthExperimentService } = require('./utils/growth-experiment-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-experiments-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'experiments.db');
    await db.initialize();
    const productionId = 'experiment-production';
    const thumbnails = await Promise.all(['control', 'variant-a', 'variant-b'].map(async name => {
      const file = path.join(directory, `${name}.jpg`);
      await fs.writeFile(file, Buffer.from(`thumbnail-${name}`));
      return file;
    }));

    try {
      await db.saveProductionData({
        id: productionId, status: 'published',
        assets: { thumbnail: { path: thumbnails[0] }, finalVideo: { path: 'fixture.mp4' } },
        timeline: {}, scheduledPublishTime: new Date().toISOString(), priority: 50, estimatedDuration: '8:00'
      });
      await db.saveProductionSnapshot({
        id: productionId,
        strategy: { topic: 'Controlled growth' },
        script: { title: 'Control title' },
        thumbnail: { path: thumbnails[0] },
        seo: { title: 'Control title', description: 'Fixture', tags: [] }
      });
      const sourceLearning = await db.saveLearningRecommendation({
        fingerprint: 'growth-experiment-source', category: 'packaging',
        title: 'Test packaging', rationale: 'CTR trails the channel baseline.',
        evidence: { measuredVideos: 4 }, proposedChange: { experiment: 'title_thumbnail_variant' }, confidence: 'medium'
      });
      await db.reviewLearningRecommendation(sourceLearning.id, 'approved');
      await db.saveContentReview(productionId, {
        status: 'approved',
        editorData: {
          packagingExperiment: {
            sourceRecommendationId: sourceLearning.id,
            hypothesis: 'A clearer promise improves qualified clicks.',
            titleVariants: [
              { label: 'Control', title: 'Control title' },
              { label: 'Clear benefit', title: 'A Clearer Automation Benefit' },
              { label: 'Curiosity', title: 'The Automation Detail You Missed' }
            ],
            thumbnailVariants: [
              { label: 'Control', path: thumbnails[0] },
              { label: 'Clear benefit', path: thumbnails[1] },
              { label: 'Curiosity', path: thumbnails[2] }
            ]
          }
        }
      });
      const schedule = await db.saveScheduleEntry({
        productionId, title: 'Control title', publishTime: new Date(Date.now() - 8 * 86400000).toISOString(),
        status: 'published', priority: 50,
        metadata: { seo: { title: 'Control title', description: 'Fixture', tags: [] }, thumbnail: { path: thumbnails[0] } }
      });
      schedule.status = 'published';
      schedule.youtubeId = 'youtube-experiment-1';
      schedule.youtubeUrl = 'https://www.youtube.com/watch?v=youtube-experiment-1';
      schedule.publishedAt = new Date(Date.now() - 8 * 86400000).toISOString();
      await db.updateScheduleEntry(schedule);

      const cumulative = [
        { impressions: 10000, clicks: 500, views: 700 },
        { impressions: 11000, clicks: 550, views: 770 },
        { impressions: 12000, clicks: 650, views: 860 },
        { impressions: 13000, clicks: 690, views: 920 }
      ];
      let reportIndex = 0;
      const analytics = {
        analyzeVideoPerformance: async () => {
          const point = cumulative[Math.min(reportIndex++, cumulative.length - 1)];
          return {
            analytics: {
              simulated: false,
              views: { totalViews: point.views, totalImpressions: point.impressions, averageCTR: point.clicks / point.impressions * 100 },
              watchTime: { totalWatchTime: point.views * 4, averageViewPercentage: 55 },
              engagement: { engagementRate: 4.5 },
              outcomes: { netSubscribers: Math.floor(point.views / 100), estimatedRevenue: point.views / 100 }
            },
            thumbnailMetrics: { impressions: point.impressions, clickThroughRate: point.clicks / point.impressions * 100 }
          };
        }
      };
      const applied = [];
      const publishing = {
        applyVideoPackaging: async (videoId, packaging) => applied.push({ videoId, ...packaging })
      };
      let clock = Date.now();
      const service = new GrowthExperimentService(db, analytics, publishing, { now: () => new Date(clock) });
      let experiment = await service.create({ productionId, armDurationHours: 24, minImpressions: 100 });
      if (experiment.status !== 'draft' || experiment.arms.length !== 3 || !experiment.arms[0].isControl) {
        throw new Error('Experiment plan did not persist a control and complete variant arms');
      }

      let confirmationBlocked = false;
      try { await service.approve(experiment.id); } catch (error) { confirmationBlocked = error.code === 'EXPERIMENT_CONFIRMATION_REQUIRED'; }
      if (!confirmationBlocked) throw new Error('Experiment approval did not require explicit confirmation');
      experiment = await service.approve(experiment.id, { confirmed: true });
      experiment = await service.start(experiment.id, { confirmed: true });
      if (experiment.status !== 'running' || applied.length !== 1) throw new Error('Approved experiment did not start on its control arm');

      for (let index = 0; index < 3; index++) {
        clock += 24 * 3600000;
        experiment = await service.refresh(experiment.id);
      }
      if (
        experiment.status !== 'awaiting_winner' || !experiment.winningArmId ||
        experiment.arms.find(arm => arm.id === experiment.winningArmId)?.label !== 'Clear benefit' ||
        experiment.result.guardrails.passed !== true || applied.at(-1).title !== 'Control title'
      ) {
        throw new Error('Experiment did not select an evidence-backed winner and restore the control');
      }

      experiment = await service.adoptWinner(experiment.id, { confirmed: true });
      const learned = (await db.listLearningRecommendations({ status: 'approved', limit: 20 }))
        .find(item => item.evidence?.experimentId === experiment.id);
      if (experiment.status !== 'adopted' || !learned || applied.at(-1).title !== 'A Clearer Automation Benefit') {
        throw new Error('Winner adoption did not update packaging and approve the resulting learning');
      }

      const storedSamples = await db.listExperimentSamples(experiment.id);
      if (storedSamples.length < 6 || storedSamples.some(sample => !Number.isFinite(sample.metrics.impressions))) {
        throw new Error('Experiment evidence samples were not durably stored');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Controlled Growth Experiments Studio test completed successfully');
  }

  async testOutcomeROIStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const { AnalyticsOptimizationAgent } = require('./agents/analytics-optimization-agent');
    const { YouTubeAutomationAgent } = require('./index');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-outcomes-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'outcomes.db');
    await db.initialize();

    try {
      const validated = new YouTubeAutomationAgent().validateChannelStrategy({
        objective: 'Grow a durable automation audience', audience: 'Small teams',
        contentPillars: ['Automation', 'Tool reviews'], primaryKpi: 'subscribers',
        targetValue: 40, targetWindowDays: 28, monthlyBudget: 100,
        outcomeCurrency: 'USD', status: 'active'
      });
      const strategy = await db.saveChannelStrategy(validated);
      if (strategy.primary_kpi !== 'subscribers' || strategy.target_value !== 40 || strategy.target_window_days !== 28) {
        throw new Error('Structured outcome strategy was not validated and persisted');
      }

      const learning = new ChannelLearningEngine(db);
      const report = (videoId, format, subscribers, revenue) => ({
        videoId,
        videoDetails: { title: `${format} outcome fixture`, publishedAt: new Date(Date.now() - 8 * 86400000).toISOString() },
        analytics: {
          simulated: false,
          views: { totalViews: 1000, totalImpressions: 10000, averageCTR: 5 },
          watchTime: { averageViewPercentage: 45, averageViewDuration: 240, totalWatchTime: 4000 },
          engagement: { engagementRate: 4 },
          outcomes: {
            subscribersAvailable: true, subscribersGained: subscribers + 1, subscribersLost: 1,
            netSubscribers: subscribers, revenueAvailable: true, estimatedRevenue: revenue,
            monetizedPlaybacks: 500, playbackBasedCpm: 8, currency: 'USD'
          }
        },
        thumbnailMetrics: { impressions: 10000, clickThroughRate: 5 },
        performance: { score: 70, grade: 'B' }
      });
      const context = (format, pillar) => ({
        strategy: { topic: `${format} topic`, contentType: format, requestedLengthKey: 'medium', contentPillar: pillar },
        script: { hook: 'A concise, outcome-aligned opening.' },
        thumbnail: { concept: { composition: 'centered' } },
        productionCost: { amount: 2, currency: 'USD', complete: true, providers: ['fixture-video'] }
      });
      await learning.capture(report('outcome-tutorial-1', 'tutorial', 12, 5), context('tutorial', 'Automation'), '7d');
      await learning.capture(report('outcome-tutorial-2', 'tutorial', 10, 5), context('tutorial', 'Automation'), '7d');
      await learning.capture(report('outcome-list-1', 'list', 2, 5), context('list', 'Tool reviews'), '7d');
      await learning.capture(report('outcome-list-2', 'list', 1, 5), context('list', 'Tool reviews'), '7d');

      const summary = await learning.getSummary();
      const recommendation = summary.recommendations.find(item => item.category === 'outcome_alignment');
      if (
        summary.outcome.goal.id !== 'subscribers' || summary.outcome.observed !== 25 ||
        summary.outcome.progressPercent !== 62.5 || summary.outcome.economics.roi !== 150 ||
        !recommendation || recommendation.status !== 'pending' || recommendation.proposedChange.autoApply !== false
      ) {
        throw new Error('Outcome evidence did not produce the expected goal scorecard and approval-gated recommendation');
      }

      const analytics = new AnalyticsOptimizationAgent(db, { getYouTubeAuth: () => ({}) });
      analytics.youtubeAnalytics = {
        reports: {
          query: async ({ metrics }) => {
            if (metrics.includes('estimatedRevenue')) throw new Error('not monetized');
            return { data: { rows: [[7, 2]] } };
          }
        }
      };
      const outcomes = await analytics.getOutcomeAnalytics('outcome-video', '2026-08-01', '2026-08-07');
      if (!outcomes.subscribersAvailable || outcomes.netSubscribers !== 5 || outcomes.revenueAvailable || outcomes.estimatedRevenue !== null) {
        throw new Error('Unavailable monetization evidence was converted into a false zero');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Outcome and ROI Studio test completed successfully');
  }

  async testSceneAwareRetentionStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const { AnalyticsOptimizationAgent } = require('./agents/analytics-optimization-agent');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-retention-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'retention.db');
    await db.initialize();

    try {
      const learning = new ChannelLearningEngine(db);
      const points = Array.from({ length: 100 }, (_, index) => {
        const elapsedRatio = (index + 1) / 100;
        let audienceWatchRatio;
        let relativeRetentionPerformance;
        if (elapsedRatio <= 0.17) {
          audienceWatchRatio = 1 - elapsedRatio * 0.4;
          relativeRetentionPerformance = 0.64;
        } else if (elapsedRatio <= 0.5) {
          audienceWatchRatio = 0.93 - ((elapsedRatio - 0.17) / 0.33) * 0.48;
          relativeRetentionPerformance = 0.31;
        } else {
          audienceWatchRatio = 0.45 - (elapsedRatio - 0.5) * 0.08;
          relativeRetentionPerformance = 0.7;
        }
        return {
          elapsedRatio,
          audienceWatchRatio,
          relativeRetentionPerformance,
          startedWatching: index === 0 ? 800 : 0,
          stoppedWatching: elapsedRatio > 0.17 && elapsedRatio <= 0.5 ? 5 : 1,
          totalSegmentImpressions: 800
        };
      });
      const context = {
        productionId: 'retention-production',
        contentFormat: 'long_form',
        title: 'Scene retention fixture',
        publishedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
        retentionDuration: 90,
        retentionScenes: [
          { id: 'scene-hook', position: 0, label: 'Hook', duration: 15 },
          { id: 'scene-intro', position: 1, label: 'Introduction', duration: 30 },
          { id: 'scene-demo', position: 2, label: 'Demonstration', duration: 45 }
        ]
      };
      const snapshot = await learning.captureRetention({
        available: true,
        simulated: false,
        videoId: 'retention-video-1',
        title: context.title,
        publishedAt: context.publishedAt,
        durationSeconds: 90,
        points
      }, context, '7d', { views: 800, impressions: 12000 });

      if (
        !snapshot || snapshot.points.length !== 100 || snapshot.sceneMetrics.length !== 3 ||
        snapshot.summary.primaryDropoff?.id !== 'scene-intro' || snapshot.confidence !== 'high'
      ) {
        throw new Error('The real retention curve was not mapped to the expected scene evidence');
      }
      const recommendation = (await db.listLearningRecommendations({ limit: 20 }))
        .find(item => item.category === 'scene_retention');
      if (!recommendation || recommendation.status !== 'pending' || recommendation.proposedChange.autoEditPublishedContent !== false) {
        throw new Error('Scene retention learning bypassed pending review or published-content safety');
      }
      const approvedBeforeReview = await db.listLearningRecommendations({ status: 'approved', limit: 20 });
      if (approvedBeforeReview.some(item => item.id === recommendation.id)) {
        throw new Error('Pending scene retention learning entered autonomous planning');
      }
      await db.reviewLearningRecommendation(recommendation.id, 'approved');
      const approvedAfterReview = await db.listLearningRecommendations({ status: 'approved', limit: 20 });
      if (!approvedAfterReview.some(item => item.id === recommendation.id)) {
        throw new Error('Approved scene retention learning was not made available to planning');
      }

      const skipped = await learning.captureRetention({
        available: true,
        simulated: true,
        videoId: 'retention-simulated',
        durationSeconds: 90,
        points
      }, context, '7d', { views: 1000 });
      if (skipped !== null || (await db.listRetentionSnapshots({ limit: 10 })).length !== 1) {
        throw new Error('Simulated retention evidence was persisted');
      }

      const clipped = db.buildRetentionSceneContext(context.retentionScenes, {
        startSeconds: 10,
        duration: 35,
        sourceSceneIds: ['scene-hook', 'scene-intro']
      });
      if (clipped.length !== 2 || clipped[0].duration !== 5 || clipped[1].duration !== 30) {
        throw new Error('Shorts retention context did not clip the source scene timeline correctly');
      }

      const analytics = new AnalyticsOptimizationAgent(db, { getYouTubeAuth: () => ({}) });
      analytics.youtubeAnalytics = {
        reports: {
          query: async () => ({
            data: {
              columnHeaders: [
                'elapsedVideoTimeRatio', 'audienceWatchRatio', 'relativeRetentionPerformance',
                'startedWatching', 'stoppedWatching', 'totalSegmentImpressions'
              ].map(name => ({ name })),
              rows: [[0.01, 0.99, 0.7, 10, 1, 10]]
            }
          })
        }
      };
      const apiCurve = await analytics.getAudienceRetention('fixture-video', null, 'PT2M30S');
      if (!apiCurve.available || apiCurve.durationSeconds !== 150 || apiCurve.points[0].audienceWatchRatio !== 0.99) {
        throw new Error('YouTube audience retention response was not normalized correctly');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Scene-Aware Retention Studio test completed successfully');
  }

  async testProductionReadinessGate() {
    const fs = require('fs').promises;
    const os = require('os');
    let savedRun = null;
    const db = {
      generateId: () => 'readiness_test',
      saveReadinessRun: async run => {
        savedRun = {
          ...run,
          started_at: run.startedAt,
          completed_at: run.completedAt
        };
        return savedRun;
      },
      getLatestReadinessRun: async () => savedRun
    };
    const passingProbe = label => async () => ({ message: `${label} verified` });
    const service = new ProductionReadinessService(db, { credentials: {} }, {
      probes: {
        text: passingProbe('Text'),
        image: passingProbe('Image'),
        videoProvider: passingProbe('Video provider'),
        narration: passingProbe('Narration'),
        videoAssembly: passingProbe('Video'),
        youtube: passingProbe('YouTube'),
        metadata: passingProbe('Metadata')
      }
    });
    const passed = await service.run({ includePaidMedia: true });
    if (passed.status !== 'passed' || passed.checks.length !== 7 || !savedRun) {
      throw new Error('A successful readiness run was not persisted correctly');
    }
    await service.assertReady('Test automation');

    const failingService = new ProductionReadinessService(db, { credentials: {} }, {
      probes: {
        text: passingProbe('Text'),
        image: passingProbe('Image'),
        videoProvider: passingProbe('Video provider'),
        narration: passingProbe('Narration'),
        videoAssembly: passingProbe('Video'),
        youtube: async () => { throw new Error('token rejected sk-secret-value'); },
        metadata: passingProbe('Metadata')
      }
    });
    const failed = await failingService.run();
    if (failed.status !== 'failed' || failed.blockingFailures[0] !== 'youtube_access') {
      throw new Error('A blocking readiness probe did not fail closed');
    }
    if (failed.checks.find(check => check.id === 'youtube_access').message.includes('sk-secret-value')) {
      throw new Error('Readiness diagnostics did not redact a provider-shaped secret');
    }
    let blocked = false;
    try {
      await failingService.assertReady('Test publishing');
    } catch (error) {
      blocked = error.status === 409;
    }
    if (!blocked) throw new Error('Failed readiness did not block protected automation');

    const tags = normalizeTags(['#Automation', 'automation', 'bad"tag', 'x'.repeat(140)]);
    const metadata = validateYouTubeMetadata({
      title: 'A valid title',
      description: 'A valid upload description.',
      tags,
      metadata: { category: 22, language: 'en' }
    });
    if (!metadata.valid || tags[0] !== 'Automation' || tags.includes('automation') || tags.some(tag => tag.includes('"') || tag.length > 100)) {
      throw new Error('YouTube metadata normalization is unsafe or invalid');
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-readiness-db-'));
    const persistenceDb = new Database();
    persistenceDb.dbPath = path.join(directory, 'readiness.db');
    try {
      await persistenceDb.initialize();
      await persistenceDb.saveReadinessRun(passed);
      const persisted = await persistenceDb.getLatestReadinessRun();
      if (persisted?.id !== passed.id || persisted.checks.length !== 7 || persisted.summary.passed !== 7) {
        throw new Error('Readiness evidence did not round-trip through SQLite');
      }
    } finally {
      await persistenceDb.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Production readiness gate test completed successfully');
  }

  async testVideoProviderLayer() {
    const fs = require('fs').promises;
    const os = require('os');
    const { runFFmpeg, checkFFmpeg } = require('./utils/ffmpeg');
    const { MediaGenerationService } = require('./utils/media-generation-service');
    const {
      VideoProvider, VideoProviderRegistry, SeedanceProvider, MiniMaxH3Provider,
      GoogleOmniProvider, KlingProvider, WanProvider
    } = require('./utils/video-providers');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-media-provider-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'media.db');
    await db.initialize();
    const job = await db.createGenerationJob({ topic: 'Provider durability test' });
    const source = path.join(directory, 'source.mp4');
    let createCalls = 0;
    let pollCalls = 0;

    try {
      if (!(await checkFFmpeg())) {
        this.logger.warn('Skipping provider MP4 durability assertion because FFmpeg is unavailable');
        return;
      }
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=1', '-c:v', 'mpeg4', source]);
      const fake = new VideoProvider('seedance', {
        model: 'bytedance/seedance-2.5',
        capabilities: { minDuration: 4, maxDuration: 30, cancellation: true }
      });
      fake.isAvailable = () => true;
      fake.createTask = async () => {
        createCalls++;
        return { externalTaskId: 'prediction-1', status: 'queued' };
      };
      fake.getTask = async id => {
        pollCalls++;
        return { externalTaskId: id, status: 'succeeded', outputUrl: 'fake://video' };
      };
      fake.downloadResult = async (_task, outputPath) => {
        await fs.copyFile(source, outputPath);
        return outputPath;
      };
      const registry = new VideoProviderRegistry({}, { providers: { seedance: fake } });
      const service = new MediaGenerationService(db, {}, { registry, pollIntervalMs: 10, sleep: async () => {} });
      const output = path.join(directory, 'output.mp4');
      const input = {
        jobId: job.id,
        productionId: 'prod-provider-test',
        scene: { index: 0 },
        provider: fake,
        outputPath: output,
        request: { prompt: 'A red frame', duration: 4, resolution: '720p', aspectRatio: '16:9' }
      };
      const first = await service.generateClip(input);
      const second = await service.generateClip(input);
      const tasks = await db.listMediaGenerationTasks(job.id);
      if (createCalls !== 1 || pollCalls !== 1 || !second.reused || tasks.length !== 1) {
        throw new Error('A completed provider task was duplicated instead of being reused');
      }
      if (first.task.external_task_id !== 'prediction-1' || tasks[0].model !== 'bytedance/seedance-2.5') {
        throw new Error('Provider task identity and model evidence did not persist');
      }
      const providers = registry.list();
      for (const id of ['seedance', 'minimax_h3', 'google_omni', 'kling', 'wan', 'slideshow']) {
        if (!providers.find(provider => provider.id === id)) throw new Error(`Missing video provider: ${id}`);
      }
      const shortOnly = new VideoProvider('wan', { model: 'wan-test', capabilities: { minDuration: 2, maxDuration: 15, firstFrame: true } });
      shortOnly.isAvailable = () => true;
      const routed = new VideoProviderRegistry({}, { providers: { seedance: fake, wan: shortOnly } });
      if (routed.select('auto', ['wan', 'seedance'], { duration: 20 }).id !== 'seedance') {
        throw new Error('Automatic video routing ignored the requested duration capability');
      }
      if (routed.select('auto', ['seedance', 'wan'], { duration: 8, generateAudio: true }).id !== 'slideshow') {
        throw new Error('Automatic video routing selected a provider without requested native audio support');
      }
      const listedJob = (await db.listGenerationJobs(10)).find(item => item.id === job.id);
      if (listedJob?.mediaTasks?.length !== 1 || listedJob.mediaTasks[0].external_task_id !== 'prediction-1') {
        throw new Error('Generation job history did not expose its durable provider task');
      }

      let seedanceSubmission;
      const seedance = new SeedanceProvider({}, { client: { predictions: {
        create: async submission => {
          seedanceSubmission = submission;
          return { id: 'seedance-task', status: 'starting' };
        }
      } } });
      const seedanceTask = await seedance.createTask({ prompt: 'Seedance scene', duration: 30, aspectRatio: '16:9' });
      if (seedanceTask.externalTaskId !== 'seedance-task' || seedanceSubmission.model !== 'bytedance/seedance-2.5' || seedanceSubmission.input.duration !== 30) {
        throw new Error('Seedance adapter did not submit the expected Replicate task');
      }
      const fileOutput = seedance.normalizeTask({ id: 'file-output', status: 'succeeded', output: { url: () => new URL('https://example.com/video.mp4') } });
      if (fileOutput.outputUrl !== 'https://example.com/video.mp4') throw new Error('Seedance FileOutput was not normalized');

      let minimaxBody;
      const minimax = new MiniMaxH3Provider({}, { apiKey: 'test', http: {
        post: async (_url, body) => { minimaxBody = body; return { data: { task_id: 'h3-task' } }; }
      } });
      const minimaxTask = await minimax.createTask({ prompt: 'H3 scene', duration: 15, resolution: '2K', aspectRatio: '9:16' });
      if (minimaxTask.externalTaskId !== 'h3-task' || minimaxBody.model !== 'MiniMax-H3' || minimaxBody.content[0].type !== 'text') {
        throw new Error('MiniMax H3 adapter did not submit the expected multimodal task');
      }

      let googleName;
      const google = new GoogleOmniProvider({}, { client: {
        interactions: { create: async () => ({ id: 'omni-task', output_video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/omni-file:download?alt=media' } }) },
        files: { get: async ({ name }) => { googleName = name; return { state: { name: 'ACTIVE' } }; } }
      } });
      const googleTask = await google.createTask({ prompt: 'Omni scene', aspectRatio: '16:9' });
      await google.getTask(googleTask.externalTaskId);
      if (googleTask.status !== 'queued' || googleName !== 'files/omni-file') throw new Error('Gemini Omni URI task was not normalized for polling');

      let klingBody;
      const kling = new KlingProvider({}, { accessKey: 'access', secretKey: 'secret', http: {
        post: async (_url, body) => { klingBody = body; return { data: { data: { task_id: 'kling-task' } } }; }
      } });
      const klingTask = await kling.createTask({ prompt: 'Kling scene', duration: 8, aspectRatio: '16:9' });
      if (klingTask.externalTaskId !== 'kling-task' || klingBody.model_name !== 'kling-v3-omni' || klingBody.sound !== 'off') {
        throw new Error('Kling adapter did not submit the expected task');
      }

      let wanBody;
      const wan = new WanProvider({}, { apiKey: 'test', http: {
        post: async (_url, body) => { wanBody = body; return { data: { output: { task_id: 'wan-task' } } }; }
      } });
      const wanTask = await wan.createTask({ prompt: 'Wan scene', duration: 10, resolution: '720p', aspectRatio: '16:9' });
      if (wanTask.externalTaskId !== 'wan-task' || wanBody.model !== 'wan2.7-t2v-2026-06-12' || wanBody.parameters.resolution !== '720P') {
        throw new Error('Wan adapter did not submit the expected task-specific model payload');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Durable multi-provider video generation test completed successfully');
  }

  async testSceneRepairStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const sharp = require('sharp');
    const { SceneRepairService, buildInitialSceneManifest } = require('./utils/scene-repair-service');
    const { OperatorService } = require('./utils/operator-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-scene-repair-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'scenes.db');
    await db.initialize();

    try {
      const imagePath = path.join(directory, 'scene.png');
      const oldVideoPath = path.join(directory, 'old.mp4');
      const originalAudioPath = path.join(directory, 'original.mp3');
      await sharp({ create: { width: 320, height: 180, channels: 3, background: '#203a5f' } }).png().toFile(imagePath);
      await fs.writeFile(oldVideoPath, Buffer.from('previous final video'));
      await fs.writeFile(originalAudioPath, Buffer.from('previous narration'));
      const production = {
        id: `prod_scene_${Date.now()}`,
        status: 'ready',
        script: {
          title: 'Repair one scene',
          fullScript: 'A complete factual-review-safe script for testing selective scene repair without replacing the entire production.',
          hook: { text: 'Fix one weak moment without starting over.' },
          introduction: { greeting: 'Hello.', topicIntro: 'Scene repair matters.', valueProposition: 'Save time and credits.' },
          mainContent: { sections: [{ title: 'Selective repair', content: 'Keep the scenes that work and replace only the scene that does not.' }] },
          conclusion: { recap: ['Preserve good work.'], finalThought: 'Review the repaired timeline.' }
        },
        seo: { title: 'Repair one scene', description: 'A detailed description of selective scene repair for video production workflows.', tags: ['video', 'repair', 'workflow'] },
        strategy: { topic: 'Selective scene repair' },
        assets: {
          video: { visualAssets: [imagePath] },
          audio: { path: originalAudioPath, status: 'ready', simulated: false, provider: 'fixture-tts', model: 'fixture-voice' },
          thumbnail: { path: imagePath },
          finalVideo: { path: oldVideoPath, simulated: false, duration: '1:00', provider: { actualProvider: 'slideshow' } }
        },
        timeline: { readyForUpload: new Date().toISOString() },
        scheduledPublishTime: new Date(Date.now() + 86400000).toISOString(),
        priority: 50,
        estimatedDuration: '1:00'
      };
      await db.saveProductionData(production);
      await db.saveProductionSnapshot(production);
      await db.saveContentReview(production.id, { status: 'needs_review', editorData: {}, qualityChecks: [] });
      await db.saveContentProvenance(production.id, {
        sources: [], claims: [], containsSyntheticMedia: false, status: 'not_required',
        summary: { sourceCount: 0, verifiedSources: 0, claimCount: 0, resolvedClaims: 0, highRiskClaims: 0, unresolvedClaims: 0 }
      });

      const manifest = buildInitialSceneManifest(production, { actualProvider: 'slideshow', model: 'local-ffmpeg' });
      if (manifest.length < 3 || manifest.some(scene => scene.assetPath !== imagePath)) {
        throw new Error('Initial scene manifest did not preserve the script structure and visual assets');
      }
      await db.replaceProductionScenes(production.id, manifest);
      for (const scene of await db.listProductionScenes(production.id)) {
        await db.updateProductionScene(production.id, scene.id, {
          audioPath: originalAudioPath, narrationStatus: 'current',
          narrationProvider: 'fixture-tts', narrationModel: 'fixture-voice'
        });
      }
      const roundTrip = await db.listProductionScenes(production.id);
      if (roundTrip.length !== manifest.length || roundTrip[0].scriptText !== manifest[0].scriptText) {
        throw new Error('Scene manifest did not round-trip through SQLite');
      }

      const fakeProvider = {
        id: 'seedance', model: 'seedance-test',
        normalizeRequest: request => ({ ...request, duration: Math.min(4, Number(request.duration || 4)) })
      };
      const fakeGenerator = {
        mediaGeneration: {
          settings: async () => ({ provider: 'seedance', order: ['seedance'], clipDuration: 4, resolution: '720p', aspectRatio: '16:9' }),
          registry: { select: () => fakeProvider, get: () => fakeProvider },
          generateClip: async ({ outputPath }) => {
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, Buffer.from('generated scene video'));
            return { outputPath, task: { model: fakeProvider.model, external_task_id: 'scene-task-1' } };
          },
          isValidVideo: async () => true
        },
        generateVisualAssets: async () => [imagePath],
        async generateTTSAudio(_text, outputPath) {
          await fs.writeFile(outputPath, Buffer.from('scene narration'));
          this.lastNarrationResult = {
            status: 'ready', path: outputPath, provider: 'fixture-tts', model: 'fixture-voice-v2',
            externalTaskId: 'narration-task-1', generatedAt: new Date().toISOString(),
            cost: { provider: 'fixture-tts', amount: null, invoiceRequired: true }
          };
          return outputPath;
        },
        isUsableAudioFile: async filePath => Boolean(filePath && await fs.stat(filePath).then(stat => stat.size > 0).catch(() => false)),
        renderMediaTimeline: async (_segments, outputPath) => { await fs.writeFile(outputPath, Buffer.from('rebuilt visual timeline')); return outputPath; },
        addAudioToVideo: async (videoPath, _audioPath, outputPath) => { await fs.copyFile(videoPath, outputPath); return outputPath; }
      };
      const service = new SceneRepairService(db, fakeGenerator, { dataRoot: directory, logger: this.logger });
      service.rebuildNarration = async () => originalAudioPath;
      const first = roundTrip[0];
      const edited = await service.updateScene(production.id, first.id, {
        scriptText: `${first.scriptText} Updated narration.`, prompt: `${first.prompt} Brighter composition.`, factualChange: false
      });
      if (edited.status !== 'visual_stale' || edited.narrationStatus !== 'stale' || edited.revision !== first.revision + 1) {
        throw new Error('Scene edits did not invalidate only the scene rebuild and narration state');
      }

      const quality = await new OperatorService(db).runQualityChecks({ ...(await db.getProductionBundle(production.id)), scenes: await db.listProductionScenes(production.id) }, {});
      if (quality.passed || !quality.blockingFailures.includes('scene_integrity')) {
        throw new Error('Approval quality checks did not block an unrepaired scene');
      }
      const estimate = await service.regenerationEstimate(production.id, first.id);
      if (!estimate.paid || estimate.provider !== 'seedance') throw new Error('Paid scene estimate did not expose provider billing risk');
      let paidBlocked = false;
      try {
        await service.regenerate(production.id, first.id, { regenerateNarration: true });
      } catch (error) {
        paidBlocked = error.code === 'PAID_CONFIRMATION_REQUIRED';
      }
      if (!paidBlocked) throw new Error('Paid scene regeneration started without explicit confirmation');
      const regenerated = await service.regenerate(production.id, first.id, { confirmPaid: true, regenerateNarration: true });
      if (
        regenerated.scene.status !== 'needs_rebuild' || regenerated.scene.externalTaskId !== 'scene-task-1' ||
        regenerated.scene.narrationStatus !== 'current' || regenerated.scene.narrationProvider !== 'fixture-tts' ||
        regenerated.scene.narrationTaskId !== 'narration-task-1'
      ) {
        throw new Error('Confirmed selective regeneration did not persist visual and narration evidence');
      }

      const second = roundTrip[1];
      const replacement = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#ad3d45' } }).png().toBuffer();
      let rightsBlocked = false;
      try {
        await service.replaceAsset(production.id, second.id, { buffer: replacement, contentType: 'image/png', filename: 'replacement.png' });
      } catch (error) {
        rightsBlocked = error.code === 'RIGHTS_CONFIRMATION_REQUIRED';
      }
      if (!rightsBlocked) throw new Error('Uploaded scene asset bypassed rights confirmation');
      const replaced = await service.replaceAsset(production.id, second.id, {
        buffer: replacement, contentType: 'image/png', filename: 'replacement.png', rightsConfirmed: true
      });
      if (replaced.assetOrigin !== 'uploaded' || !replaced.rightsConfirmed || replaced.status !== 'needs_rebuild') {
        throw new Error('Replacement asset evidence did not persist');
      }

      const ordered = await service.reorder(production.id, (await db.listProductionScenes(production.id)).map(scene => scene.id).reverse());
      if (ordered[0].id === first.id) throw new Error('Scene timeline order did not persist');
      const rebuilt = await service.rebuild(production.id);
      const finalBundle = await db.getProductionBundle(production.id);
      if (!rebuilt.finalVideo || finalBundle.assets.finalVideo.previousPath !== oldVideoPath || finalBundle.scenes.some(scene => scene.status !== 'ready')) {
        throw new Error('Scene rebuild did not preserve the prior video and finalize every scene');
      }
      const revisions = await db.listProductionSceneRevisions(production.id);
      for (const action of ['edit', 'regenerate', 'replace_asset', 'reorder', 'rebuild']) {
        if (!revisions.some(revision => revision.action === action)) throw new Error(`Scene revision history is missing ${action}`);
      }

      const locked = await service.updateScene(production.id, ordered[0].id, { locked: true });
      let lockBlocked = false;
      try {
        await service.updateScene(production.id, locked.id, { prompt: 'Unauthorized locked edit' });
      } catch (error) {
        lockBlocked = error.status === 409;
      }
      if (!lockBlocked) throw new Error('Locked scene accepted an edit');
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Scene Repair Studio test completed successfully');
  }

  async testNarrationReliability() {
    const fs = require('fs').promises;
    const os = require('os');
    const { SceneRepairService } = require('./utils/scene-repair-service');
    const { OperatorService } = require('./utils/operator-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-narration-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'narration.db');
    await db.initialize();

    try {
      const productionId = 'prod-narration-recovery';
      const visualPath = path.join(directory, 'scene.png');
      const videoPath = path.join(directory, 'video.mp4');
      await fs.writeFile(visualPath, Buffer.from('visual'));
      await fs.writeFile(videoPath, Buffer.from('video'));
      const production = {
        id: productionId, status: 'ready',
        strategy: { topic: 'Narration recovery' },
        script: {
          title: 'Narration recovery',
          fullScript: 'A complete script that demonstrates reliable narration recovery and explicit operator controls.'.repeat(4)
        },
        seo: {
          title: 'Narration recovery',
          description: 'A detailed explanation of reliable narration recovery for production workflows.',
          tags: ['narration', 'recovery', 'workflow']
        },
        assets: {
          audio: { path: path.join(directory, 'missing.mp3.info'), status: 'unavailable', simulated: true, error: 'Provider quota exhausted' },
          finalVideo: { path: videoPath, simulated: false }, thumbnail: { path: visualPath }
        },
        timeline: {}, priority: 50, scheduledPublishTime: new Date(Date.now() + 86400000).toISOString()
      };
      await db.saveProductionData(production);
      await db.saveProductionSnapshot(production);
      await db.replaceProductionScenes(productionId, [{
        id: 'scene-narration-1', label: 'Opening', scriptText: 'This narration must be recovered.',
        prompt: 'Opening visual', duration: 8, assetType: 'image', assetOrigin: 'generated', assetPath: visualPath,
        status: 'ready', narrationStatus: 'unavailable', narrationError: 'Provider quota exhausted', rightsConfirmed: true
      }]);

      const blockedQuality = await new OperatorService(db).runQualityChecks({
        ...production, scenes: await db.listProductionScenes(productionId)
      }, {});
      if (blockedQuality.passed || !blockedQuality.blockingFailures.includes('narration')) {
        throw new Error('Missing narration did not block production quality');
      }

      let failProvider = true;
      const generator = {
        async generateTTSAudio(_text, outputPath) {
          if (failProvider) {
            this.lastNarrationResult = {
              status: 'failed', provider: 'openai', model: 'gpt-4o-mini-tts',
              generatedAt: new Date().toISOString(), error: 'Provider quota exhausted',
              cost: { provider: 'openai', amount: null, invoiceRequired: true }
            };
            throw new Error('Provider quota exhausted');
          }
          await fs.writeFile(outputPath, Buffer.from('recovered narration'));
          this.lastNarrationResult = {
            status: 'ready', path: outputPath, provider: 'openai', model: 'gpt-4o-mini-tts',
            externalTaskId: 'tts-task-1', generatedAt: new Date().toISOString(),
            cost: { provider: 'openai', amount: null, invoiceRequired: true }
          };
          return outputPath;
        },
        isUsableAudioFile: async filePath => Boolean(filePath && await fs.stat(filePath).then(stat => stat.size > 0).catch(() => false))
      };
      const service = new SceneRepairService(db, generator, { dataRoot: directory, logger: this.logger });

      let confirmationBlocked = false;
      try {
        await service.regenerateNarration(productionId, 'scene-narration-1');
      } catch (error) {
        confirmationBlocked = error.code === 'NARRATION_COST_CONFIRMATION_REQUIRED';
      }
      if (!confirmationBlocked) throw new Error('Narration regeneration bypassed the provider-cost confirmation');

      let outagePersisted = false;
      try {
        await service.regenerateNarration(productionId, 'scene-narration-1', { confirmCost: true });
      } catch (_error) {
        const failed = await db.getProductionScene(productionId, 'scene-narration-1');
        outagePersisted = failed.narrationStatus === 'failed' && failed.narrationProvider === 'openai' && /quota/.test(failed.narrationError);
      }
      if (!outagePersisted) throw new Error('Narration provider failure evidence was not persisted');

      failProvider = false;
      const recovered = await service.regenerateNarration(productionId, 'scene-narration-1', { confirmCost: true });
      if (
        recovered.narrationStatus !== 'current' || recovered.narrationProvider !== 'openai' ||
        recovered.narrationModel !== 'gpt-4o-mini-tts' || recovered.narrationTaskId !== 'tts-task-1' ||
        recovered.status !== 'needs_rebuild'
      ) {
        throw new Error('Narration-only recovery did not preserve provider evidence and rebuild state');
      }

      let weakSilenceBlocked = false;
      try {
        await service.setSilenceOverride(productionId, { enabled: true, confirmed: true, reason: 'silent' });
      } catch (error) {
        weakSilenceBlocked = /at least 10/.test(error.message);
      }
      if (!weakSilenceBlocked) throw new Error('Intentional silence was accepted without a meaningful reason');

      await service.setSilenceOverride(productionId, {
        enabled: true, confirmed: true, reason: 'This visual demonstration intentionally uses captions only.'
      });
      const silenceBundle = await db.getProductionBundle(productionId);
      const silenceQuality = await new OperatorService(db).runQualityChecks(silenceBundle, {});
      const narrationCheck = silenceQuality.checks.find(check => check.id === 'narration');
      if (!narrationCheck?.passed || silenceBundle.scenes[0].narrationStatus !== 'intentional_silence') {
        throw new Error('Confirmed intentional silence did not satisfy the narration evidence gate');
      }

      const revisions = await db.listProductionSceneRevisions(productionId);
      for (const action of ['regenerate_narration', 'confirm_intentional_silence']) {
        if (!revisions.some(revision => revision.action === action)) throw new Error(`Narration history is missing ${action}`);
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Narration reliability and recovery test completed successfully');
  }

  async testShortsRepurposingStudio() {
    const fs = require('fs').promises;
    const os = require('os');
    const { runFFmpeg } = require('./utils/ffmpeg');
    const { ShortsRepurposingService } = require('./utils/shorts-repurposing-service');
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const { ChannelLearningEngine } = require('./utils/channel-learning-engine');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-shorts-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'shorts.db');
    await db.initialize();

    try {
      const productionId = 'prod-shorts-studio';
      const sourceVideo = path.join(directory, 'source.mp4');
      const audioPath = path.join(directory, 'narration.m4a');
      const thumbnailPath = path.join(directory, 'thumbnail.jpg');
      await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', 'color=c=#203a5f:s=640x360:r=24:d=4',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sourceVideo
      ]);
      await fs.writeFile(audioPath, Buffer.from('narration evidence'));
      await fs.writeFile(thumbnailPath, Buffer.from('thumbnail evidence'));
      const production = {
        id: productionId, status: 'scheduled',
        strategy: { topic: 'Repurpose one production', contentType: 'tutorial' },
        script: { title: 'Repurpose one production', fullScript: 'A complete source script for producing several useful vertical excerpts from one approved production.'.repeat(4) },
        seo: {
          title: 'Repurpose one production',
          description: 'A detailed source description for a safe and efficient vertical repurposing workflow.',
          tags: ['repurposing', 'shorts', 'workflow']
        },
        assets: {
          finalVideo: { path: sourceVideo, simulated: false, duration: 4 },
          audio: { path: audioPath, status: 'ready', simulated: false, provider: 'fixture-tts' },
          thumbnail: { path: thumbnailPath }
        },
        timeline: {}, priority: 50,
        scheduledPublishTime: new Date(Date.now() + 86400000).toISOString()
      };
      await db.saveProductionData(production);
      await db.saveProductionSnapshot(production);
      await db.saveContentReview(productionId, {
        status: 'approved', editorData: { factChecked: true, rightsConfirmed: true },
        qualityChecks: [], reviewedAt: new Date().toISOString()
      });
      await db.saveContentProvenance(productionId, {
        sources: [], claims: [], containsSyntheticMedia: true, status: 'not_required',
        summary: { sourceCount: 0, verifiedSources: 0, claimCount: 0, resolvedClaims: 0, highRiskClaims: 0, unresolvedClaims: 0 }
      });
      await db.replaceProductionScenes(productionId, [
        { id: 'short-source-1', label: 'Hook', scriptText: 'One strong idea can reach more than one audience.', prompt: 'Opening', duration: 1.4, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true },
        { id: 'short-source-2', label: 'Method', scriptText: 'Use the approved scene evidence to build a vertical excerpt.', prompt: 'Method', duration: 1.3, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true },
        { id: 'short-source-3', label: 'Result', scriptText: 'Render locally and review every Short before it reaches the schedule.', prompt: 'Result', duration: 1.3, assetType: 'video', assetPath: sourceVideo, audioPath, status: 'ready', narrationStatus: 'current', rightsConfirmed: true }
      ]);

      const publishing = new PublishingSchedulingAgent(db, {});
      const service = new ShortsRepurposingService(db, publishing, {
        dataRoot: path.join(directory, 'shorts'), width: 360, height: 640, logger: this.logger
      });
      const proposed = await service.propose(productionId, { count: 3 });
      if (proposed.length !== 3 || proposed.some(clip => !clip.sourceSceneIds.length || clip.status !== 'proposed')) {
        throw new Error('Short drafts did not preserve source-scene identity');
      }
      const edited = await service.update(productionId, proposed[0].id, {
        title: 'One approved video, three vertical moments', layout: 'blur',
        tags: ['Shorts', 'repurposing', 'workflow']
      });
      if (edited.title.length > 100 || edited.layout !== 'blur') throw new Error('Short draft edits did not persist');
      const rendered = await service.render(productionId, edited.id);
      if (rendered.status !== 'rendered' || !rendered.outputPath || !rendered.captionsPath) {
        throw new Error('Local vertical rendering did not persist its MP4 and captions');
      }
      await runFFmpeg(['-v', 'error', '-i', rendered.outputPath, '-f', 'null', '-']);

      let approvalBlocked = false;
      try {
        await service.approve(productionId, rendered.id, {});
      } catch (error) {
        approvalBlocked = error.code === 'SHORT_APPROVAL_REQUIRED';
      }
      if (!approvalBlocked) throw new Error('Short scheduling bypassed explicit approval confirmation');
      const scheduled = await service.approve(productionId, rendered.id, {
        confirmed: true, publishTime: new Date(Date.now() + 172800000).toISOString(), privacyStatus: 'private'
      });
      const schedule = await db.getLatestScheduleEntry(rendered.id);
      if (
        scheduled.status !== 'scheduled' || !schedule || schedule.metadata.contentType !== 'short' ||
        schedule.metadata.sourceProductionId !== productionId || schedule.metadata.containsSyntheticMedia !== true
      ) {
        throw new Error('Approved Short did not inherit evidence into an independent schedule entry');
      }
      schedule.status = 'published';
      schedule.youtubeId = 'youtube-short-1';
      schedule.youtubeUrl = 'https://www.youtube.com/shorts/youtube-short-1';
      schedule.publishedAt = new Date().toISOString();
      await db.updateScheduleEntry(schedule);
      await publishing.syncShortStatus(schedule, 'published');
      const published = await db.getShortClip(rendered.id);
      const context = await db.getPublishedContentContext('youtube-short-1');
      const attributes = new ChannelLearningEngine(db).extractAttributes({ videoDetails: { title: published.title } }, context);
      if (published.status !== 'published' || context.contentFormat !== 'short' || attributes.surface !== 'shorts' || attributes.format !== 'shorts') {
        throw new Error('Published Short did not remain separate in analytics learning context');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }
    this.logger.info('Shorts Repurposing Studio test completed successfully');
  }

  async testProvenanceDesk() {
    const fs = require('fs').promises;
    const os = require('os');
    const { ProvenanceService } = require('./utils/provenance-service');
    const { OperatorService } = require('./utils/operator-service');
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-provenance-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'provenance.db');
    await db.initialize();
    const productionId = 'prod-provenance-test';
    const videoPath = path.join(directory, 'video.mp4');
    const audioPath = path.join(directory, 'narration.mp3');
    await fs.writeFile(videoPath, Buffer.from('test-video'));
    await fs.writeFile(audioPath, Buffer.from('test-audio'));

    try {
      await db.saveProductionData({
        id: productionId,
        status: 'needs_review',
        assets: { finalVideo: { path: videoPath, simulated: false }, audio: { path: audioPath, status: 'ready', simulated: false, provider: 'fixture-tts' } },
        timeline: {}, scheduledPublishTime: new Date(Date.now() + 86400000).toISOString(),
        priority: 50, estimatedDuration: '1:00'
      });
      const production = {
        id: productionId,
        strategy: {
          topic: 'Evidence-aware automation',
          researchSources: [{
            url: 'https://example.com/research/fact',
            title: 'Official research evidence',
            publisher: 'Example Institute',
            sourceType: 'official'
          }]
        },
        script: {
          title: 'Evidence-aware automation',
          fullScript: 'A sufficiently detailed script with a factual statement that must be reviewed before this production can be approved.'.repeat(3),
          claims: [{
            text: 'The documented workflow reduces repeated manual steps.',
            riskLevel: 'standard',
            sourceUrls: ['https://example.com/research/fact']
          }]
        },
        seo: {
          title: 'Evidence-aware automation',
          description: 'A detailed description of an evidence-aware automation workflow for careful channel operators.',
          tags: ['automation', 'evidence', 'workflow']
        },
        assets: { finalVideo: { path: videoPath, simulated: false }, audio: { path: audioPath, status: 'ready', simulated: false, provider: 'fixture-tts' } }
      };
      await db.saveProductionSnapshot(production);

      const provenanceService = new ProvenanceService(db);
      const initialized = await provenanceService.initialize(productionId, production);
      if (
        initialized.status !== 'blocked' || initialized.sources.length !== 1 ||
        initialized.claims.length !== 1 || initialized.claims[0].sourceIds.length !== 1
      ) {
        throw new Error('Generated research sources and claims were not initialized as unresolved provenance');
      }

      const publishGuard = new PublishingSchedulingAgent(db, {});
      publishGuard.publishQueue = [{ productionId, status: 'scheduled', metadata: {} }];
      let blockedPublishRejected = false;
      try {
        await publishGuard.publishContent(productionId);
      } catch (error) {
        blockedPublishRejected = error.code === 'PROVENANCE_BLOCKED';
      }
      if (!blockedPublishRejected) throw new Error('Publishing did not independently enforce the provenance gate');

      let unverifiedSupportRejected = false;
      try {
        await provenanceService.review(productionId, {
          sources: initialized.sources,
          claims: [{ ...initialized.claims[0], status: 'supported' }]
        });
      } catch (error) {
        unverifiedSupportRejected = /verified source/.test(error.message);
      }
      if (!unverifiedSupportRejected) throw new Error('A claim was supported without reviewer-verified evidence');

      const reviewed = await provenanceService.review(productionId, {
        sources: initialized.sources.map(source => ({ ...source, status: 'verified' })),
        claims: [{ ...initialized.claims[0], status: 'supported' }],
        containsSyntheticMedia: true
      });
      if (reviewed.status !== 'verified' || !reviewed.containsSyntheticMedia || reviewed.summary.unresolvedClaims !== 0) {
        throw new Error('A complete evidence review was not persisted as verified');
      }

      const bundle = await db.getProductionBundle(productionId);
      const quality = await new OperatorService(db).runQualityChecks({ ...production, provenance: bundle.provenance }, {});
      if (!quality.passed || !quality.checks.find(check => check.id === 'provenance' && check.passed)) {
        throw new Error('Verified provenance did not satisfy the production quality gate');
      }

      let uploadRequest;
      const publishing = new PublishingSchedulingAgent(db, {});
      publishing.youtube = {
        videos: { insert: async request => { uploadRequest = request; return { data: { id: 'provenance-video' } }; } }
      };
      await publishing.uploadToYouTube({
        publishTime: new Date(Date.now() + 86400000).toISOString(),
        metadata: {
          seo: production.seo,
          video: { path: videoPath },
          privacyStatus: 'private',
          containsSyntheticMedia: true
        }
      });
      if (uploadRequest?.requestBody?.status?.containsSyntheticMedia !== true) {
        throw new Error('Synthetic-media disclosure was not handed to the YouTube upload request');
      }

      let emptyWaiverRejected = false;
      try {
        new ProvenanceService(db).build({
          sources: reviewed.sources,
          claims: [{ ...reviewed.claims[0], status: 'waived', notes: '' }]
        });
      } catch (error) {
        emptyWaiverRejected = /reviewer note/.test(error.message);
      }
      if (!emptyWaiverRejected) throw new Error('A claim waiver without a reviewer note was accepted');
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Research and provenance desk test completed successfully');
  }

  async testDiscoverabilityPreflight() {
    const fs = require('fs').promises;
    const os = require('os');
    const { DiscoverabilityService } = require('./utils/discoverability-service');
    const { OperatorService } = require('./utils/operator-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-discoverability-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'discoverability.db');
    await db.initialize();
    const productionId = 'prod-discoverability-test';
    const fakeAdapter = {
      audit: async content => ({
        schemaVersion: '1.0',
        engine: { name: 'darkzseo', version: '1.4.0' },
        mode: 'content',
        target: content.id,
        status: 'attention_required',
        summary: {
          severity: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, INFO: 0 },
          category: { SEO: 0, GEO: 1, AIO: 0, AEO: 0 }
        },
        findings: [{
          ruleId: 'geo.trust_network', category: 'GEO', severity: 'HIGH',
          applicability: ['youtube', 'content'],
          message: 'Trust Network: Long content lacks authority links',
          remediation: 'Add a verified authority source.'
        }]
      })
    };

    try {
      await db.saveProductionData({
        id: productionId, status: 'needs_review', assets: {}, timeline: {},
        scheduledPublishTime: null, priority: 50, estimatedDuration: '1:00'
      });
      const production = {
        id: productionId,
        script: { title: 'AgentTube discoverability', fullScript: 'Detailed content '.repeat(200), sections: [] },
        seo: { title: 'AgentTube discoverability', description: 'A detailed discoverability review.', chapters: [] },
        provenance: { sources: [] }
      };
      await db.saveProductionSnapshot(production);
      const service = new DiscoverabilityService(db, { adapter: fakeAdapter });
      const first = await service.auditProduction(production, { channel_name: 'AgentTube' });
      if (first.engineVersion !== '1.4.0' || first.findings.length !== 1 || first.pendingCount !== 1) {
        throw new Error('The versioned DarkzSEO report was not persisted');
      }

      const quality = await new OperatorService(db).runQualityChecks({ ...production, discoverability: first }, {});
      const discoverabilityCheck = quality.checks.find(check => check.id === 'discoverability');
      if (!discoverabilityCheck || discoverabilityCheck.passed || discoverabilityCheck.blocking) {
        throw new Error('High-priority discoverability guidance was not advisory and visible');
      }

      let shortReasonRejected = false;
      try {
        await service.reviewFinding(first.findings[0].id, { status: 'dismissed', reason: 'no' });
      } catch (error) {
        shortReasonRejected = /at least 5/.test(error.message);
      }
      if (!shortReasonRejected) throw new Error('A false-positive dismissal without reviewer evidence was accepted');

      await service.reviewFinding(first.findings[0].id, { status: 'dismissed', reason: 'The cited source is attached in the approved evidence desk.' });
      const second = await service.auditProduction(production, { channel_name: 'AgentTube' });
      if (second.findings[0].reviewStatus !== 'dismissed' || second.pendingCount !== 0) {
        throw new Error('Finding review evidence did not carry forward across matching audits');
      }
      const reviewedQuality = await new OperatorService(db).runQualityChecks({ ...production, discoverability: second }, {});
      if (!reviewedQuality.checks.find(check => check.id === 'discoverability' && check.passed)) {
        throw new Error('A dismissed false positive remained an actionable quality warning');
      }

      const { YouTubeAutomationAgent } = require('./index');
      const apiAgent = new YouTubeAutomationAgent();
      apiAgent.db = db;
      apiAgent.operator = new OperatorService(db);
      apiAgent.discoverability = service;
      apiAgent.setupAPI();
      const server = await new Promise(resolve => {
        const listener = apiAgent.app.listen(0, '127.0.0.1', () => resolve(listener));
      });
      try {
        const address = server.address();
        const apiHeaders = { 'content-type': 'application/json', ...(process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {}) };
        const runResponse = await fetch(`http://127.0.0.1:${address.port}/api/content/${productionId}/discoverability/run`, {
          method: 'POST', headers: apiHeaders, body: JSON.stringify({ platform: 'youtube' })
        });
        const runPayload = await runResponse.json();
        if (!runResponse.ok || runPayload.audit?.schemaVersion !== '1.0' || !runPayload.result?.discoverability) {
          throw new Error('Discoverability run API did not return the persisted versioned audit');
        }
        const apiFinding = runPayload.audit.findings[0];
        const reviewResponse = await fetch(`http://127.0.0.1:${address.port}/api/discoverability/findings/${apiFinding.id}`, {
          method: 'PATCH', headers: apiHeaders, body: JSON.stringify({ status: 'accepted' })
        });
        const reviewPayload = await reviewResponse.json();
        if (!reviewResponse.ok || reviewPayload.result?.finding?.reviewStatus !== 'accepted') {
          throw new Error('Discoverability review API did not persist the operator decision');
        }
      } finally {
        await new Promise(resolve => server.close(resolve));
      }

      const unavailableService = new DiscoverabilityService(db, {
        adapter: { audit: async () => { const error = new Error('Python is not installed'); error.code = 'DARKZSEO_UNAVAILABLE'; throw error; } }
      });
      const unavailable = await unavailableService.auditProduction(production, { channel_name: 'AgentTube' });
      if (unavailable.status !== 'unavailable' || unavailable.errorCode !== 'DARKZSEO_UNAVAILABLE' || unavailable.findings.length !== 0) {
        throw new Error('An unavailable DarkzSEO runtime was not stored explicitly');
      }
      const unavailableQuality = await new OperatorService(db).runQualityChecks({ ...production, discoverability: unavailable }, {});
      const unavailableCheck = unavailableQuality.checks.find(check => check.id === 'discoverability');
      if (!unavailableCheck || unavailableCheck.passed || unavailableCheck.blocking) {
        throw new Error('DarkzSEO runtime availability did not remain an explicit non-blocking check');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('DarkzSEO discoverability preflight test completed successfully');
  }

  async testResumableGenerationCheckpoints() {
    const fs = require('fs').promises;
    const os = require('os');
    const { YouTubeAutomationAgent } = require('./index');
    const { GenerationRecoveryService } = require('./utils/generation-recovery-service');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-recovery-'));
    const db = new Database();
    db.dbPath = path.join(directory, 'recovery.db');
    await db.initialize();

    const thumbnailPath = path.join(directory, 'thumbnail.jpg');
    const videoPath = path.join(directory, 'video.mp4');
    await fs.writeFile(thumbnailPath, Buffer.from('thumbnail'));
    await fs.writeFile(videoPath, Buffer.from('video'));
    const strategy = {
      topic: 'Checkpointed automation',
      contentType: 'Tutorial',
      requestedStyle: 'tutorial',
      requestedLengthKey: 'short'
    };
    const script = {
      title: 'Checkpointed automation',
      fullScript: 'A complete script that can be reused after an interrupted generation run.',
      mainContent: [{ text: 'Reusable content' }]
    };
    let strategyCalls = 0;
    let scriptCalls = 0;
    let productionCalls = 0;

    try {
      const agent = new YouTubeAutomationAgent();
      agent.db = db;
      agent.recovery = new GenerationRecoveryService(db, {
        logger: agent.logger,
        baseDelayMs: 0,
        updateJobStage: (...args) => agent.updateJobStage(...args)
      });
      agent.readiness = { assertReady: async () => true };
      agent.operator = {
        runQualityChecks: async () => ({ passed: true, score: 100, checks: [{ passed: true }], blockingFailures: [] }),
        notify: async () => null
      };
      agent.agents = {
        strategy: { generateContentStrategy: async () => { strategyCalls++; return strategy; } },
        scriptWriter: { generateScript: async () => { scriptCalls++; return script; } },
        thumbnailDesigner: { generateThumbnail: async () => ({ path: thumbnailPath, concept: {} }) },
        seoOptimizer: { optimize: async () => ({ title: script.title, description: 'A complete description.', tags: ['automation'] }) },
        production: {
          processContent: async input => {
            productionCalls++;
            return {
              id: `recovery-production-${Date.now()}`,
              status: 'ready',
              ...input,
              assets: {
                finalVideo: { path: videoPath, simulated: false },
                thumbnail: { path: thumbnailPath }
              },
              timeline: {},
              scheduledPublishTime: new Date(Date.now() + 86400000).toISOString(),
              priority: 50,
              estimatedDuration: '2:00'
            };
          }
        },
        publishing: { scheduleContent: async () => null }
      };

      const job = await db.createGenerationJob({
        topic: strategy.topic,
        style: 'tutorial',
        length: 'short',
        source: 'manual',
        strategyContext: { objective: 'Test recovery' }
      });
      await db.saveGenerationCheckpoint(job.id, 'strategy', {
        status: 'completed', artifact: strategy, completedAt: new Date().toISOString()
      });
      await db.saveGenerationCheckpoint(job.id, 'script', {
        status: 'completed', artifact: script, completedAt: new Date().toISOString()
      });
      await db.updateGenerationJob(job.id, { status: 'running', stage: 'thumbnail', progress: 40 });
      await db.markInterruptedJobs();
      const interrupted = await db.getGenerationJob(job.id);
      if (interrupted.status !== 'interrupted' || interrupted.stage !== 'thumbnail') {
        throw new Error('Restart recovery did not preserve the interrupted stage');
      }

      const resumed = await agent.resumeGenerationJob(job.id);
      if (resumed.details?.resumeFrom !== 'thumbnail') {
        throw new Error('Resume did not select the first incomplete stage');
      }
      await agent.waitForGenerationJob(job.id);
      const completed = await db.getGenerationJob(job.id);
      const checkpoints = await db.listGenerationCheckpoints(job.id);
      if (
        completed.status !== 'completed' ||
        checkpoints.filter(item => item.status === 'completed').length !== 6 ||
        strategyCalls !== 0 || scriptCalls !== 0 || productionCalls !== 1 ||
        !completed.details.reusedStages.includes('strategy') || !completed.details.reusedStages.includes('script')
      ) {
        throw new Error('Generation did not resume from verified checkpoints');
      }

      let transientAttempts = 0;
      const transientJob = await db.createGenerationJob({ topic: 'Transient retry' });
      const recovered = await agent.recovery.run(transientJob.id, 'strategy', 10, async () => {
        transientAttempts++;
        if (transientAttempts === 1) {
          const error = new Error('Temporary provider failure');
          error.status = 503;
          throw error;
        }
        return { topic: 'Recovered strategy' };
      });
      const transientCheckpoint = await db.getGenerationCheckpoint(transientJob.id, 'strategy');
      if (recovered.topic !== 'Recovered strategy' || transientAttempts !== 2 || transientCheckpoint.attempt_count !== 2) {
        throw new Error('A retry-safe transient stage failure was not recovered with bounded attempts');
      }

      const invalidJob = await db.createGenerationJob({ topic: 'Invalid dependency' });
      await db.saveGenerationCheckpoint(invalidJob.id, 'strategy', {
        status: 'completed', artifact: {}, completedAt: new Date().toISOString()
      });
      await db.saveGenerationCheckpoint(invalidJob.id, 'script', {
        status: 'completed', artifact: script, completedAt: new Date().toISOString()
      });
      await agent.recovery.run(invalidJob.id, 'strategy', 10, async () => ({ topic: 'Rebuilt dependency' }));
      if (await db.getGenerationCheckpoint(invalidJob.id, 'script')) {
        throw new Error('A stale downstream checkpoint survived invalid upstream artifact recovery');
      }
    } finally {
      await db.close();
      await fs.rm(directory, { recursive: true, force: true });
    }

    this.logger.info('Resumable generation checkpoints test completed successfully');
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

    // The dashboard's "Generate Content Now" button sends an explicit null topic
    // to mean "pick a trending topic for me". null must be accepted, not rejected.
    const dashboardPayload = agent.validateGenerateRequestBody({ topic: null, style: 'story' });
    if (!dashboardPayload.valid) {
      throw new Error(`Dashboard generate payload was rejected: ${dashboardPayload.error}`);
    }
    if (dashboardPayload.value.topic !== null || dashboardPayload.value.style !== 'story') {
      throw new Error('Null topic was not normalised to an auto-selected topic');
    }

    const nullStyle = agent.validateGenerateRequestBody({ topic: 'Node automation', style: null });
    if (!nullStyle.valid || nullStyle.value.style !== null) {
      throw new Error('Null style was not accepted as "no style preference"');
    }

    const nullLength = agent.validateGenerateRequestBody({ topic: null, style: null, length: null });
    if (!nullLength.valid || nullLength.value.length !== 'medium') {
      throw new Error('Null length did not fall back to the default length');
    }

    const blankTopic = agent.validateGenerateRequestBody({ topic: '   ' });
    if (!blankTopic.valid || blankTopic.value.topic !== null) {
      throw new Error('Whitespace-only topic was not normalised to null');
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
    const intentionalAudio = {
      intentionalSilence: true,
      silenceReason: 'This test fixture is intentionally silent.',
      silenceConfirmedAt: new Date().toISOString()
    };
    const agent = new PublishingSchedulingAgent({
      updateScheduleEntry: async () => {}
    }, {});

    agent.publishQueue = [
      { productionId: 'prod-a', title: 'A', status: 'scheduled', metadata: { audio: intentionalAudio } },
      { productionId: 'prod-b', title: 'B', status: 'scheduled', metadata: { audio: intentionalAudio } }
    ];
    agent.uploadToYouTube = async () => ({ id: 'youtube-1' });

    await agent.publishContent('prod-a');

    if (agent.publishQueue.length !== 1 || agent.publishQueue[0].productionId !== 'prod-b') {
      throw new Error('publishContent removed the wrong publish queue entries');
    }

    const missingNarration = new PublishingSchedulingAgent({ updateScheduleEntry: async () => {} }, {});
    missingNarration.publishQueue = [{ productionId: 'prod-no-audio', status: 'scheduled', metadata: {} }];
    missingNarration.uploadToYouTube = async () => { throw new Error('Upload must not start without narration'); };
    let narrationPublishBlocked = false;
    try {
      await missingNarration.publishContent('prod-no-audio');
    } catch (error) {
      narrationPublishBlocked = error.code === 'NARRATION_REQUIRED';
    }
    if (!narrationPublishBlocked) throw new Error('Publishing accepted a production without narration evidence');

    let missingFileRejected = false;
    try {
      await agent.getVideoStream(path.join(__dirname, 'data', 'missing-placeholder.mp4'));
    } catch (error) {
      missingFileRejected = /video file not found/.test(error.message);
    }

    if (!missingFileRejected) {
      throw new Error('getVideoStream did not reject a missing video file');
    }

    let uncertainUpdates = [];
    const uncertain = new PublishingSchedulingAgent({
      updateScheduleEntry: async entry => uncertainUpdates.push({ ...entry })
    }, {});
    uncertain.publishQueue = [
      { id: 'schedule-uncertain', productionId: 'prod-uncertain', title: 'Uncertain', status: 'scheduled', metadata: { audio: intentionalAudio } }
    ];
    let uploadAttempts = 0;
    uncertain.uploadToYouTube = async entry => {
      uploadAttempts++;
      entry.uploadAttempted = true;
      const error = new Error('socket closed during upload');
      error.code = 'ECONNRESET';
      throw error;
    };
    let uncertainBlocked = false;
    try {
      await uncertain.publishContent('prod-uncertain');
    } catch (error) {
      uncertainBlocked = error.code === 'UPLOAD_OUTCOME_UNKNOWN';
    }
    try {
      await uncertain.publishContent('prod-uncertain');
    } catch (error) {
      uncertainBlocked = uncertainBlocked && error.code === 'UPLOAD_OUTCOME_UNKNOWN';
    }
    if (!uncertainBlocked || uploadAttempts !== 1 || uncertainUpdates.at(-1)?.status !== 'reconciliation_required') {
      throw new Error('An uncertain upload outcome was retried or failed to require reconciliation');
    }

    let reconciliationCalls = 0;
    const recorded = {
      id: 'schedule-recorded', productionId: 'prod-recorded', title: 'Recorded', status: 'uploaded',
      youtubeId: 'youtube-existing', metadata: { audio: intentionalAudio }
    };
    const reconcile = new PublishingSchedulingAgent({
      getLatestScheduleEntry: async () => recorded,
      updateScheduleEntry: async () => {}
    }, {});
    reconcile.youtube = {
      videos: {
        list: async () => {
          reconciliationCalls++;
          return { data: { items: [{ id: 'youtube-existing' }] } };
        }
      }
    };
    reconcile.uploadToYouTube = async () => {
      throw new Error('A recorded upload must never be uploaded again');
    };
    const reconciled = await reconcile.publishContent('prod-recorded');
    if (reconciled.status !== 'published' || reconciliationCalls !== 1) {
      throw new Error('A recorded YouTube upload was not reconciled idempotently');
    }

    this.logger.info('Publishing safety test completed successfully');
  }

  async testPublishingFrequency() {
    const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
    const agent = new PublishingSchedulingAgent({}, {});
    const dailyPublications = [
      { publishedAt: '2026-01-01T12:00:00.000Z' },
      { publishedAt: '2026-01-02T12:00:00.000Z' },
      { publishedAt: '2026-01-03T12:00:00.000Z' }
    ];

    const frequency = agent.calculatePublishingFrequency(dailyPublications);
    if (frequency !== '1.0 videos per day') {
      throw new Error(`Daily publishing cadence was reported as ${frequency}`);
    }

    this.logger.info('Publishing frequency test completed successfully');
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

  async testAITextServiceTokenParams() {
    const { AITextService } = require('./utils/ai-text-service');

    const savedEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const service = new AITextService({
        aiProvider: { provider: 'openai', apiKey: 'test-key', model: 'gpt-5.6' }
      });

      // Newer OpenAI models (gpt-5.x) reject max_tokens — the request must use
      // max_completion_tokens, never the legacy spelling.
      const calls = [];
      service.client.chat.completions.create = async (params) => {
        calls.push(params);
        return { choices: [{ message: { content: '{"ok":true}' } }] };
      };

      const result = await service.generateText('test prompt', { maxTokens: 512 });
      if (result !== '{"ok":true}') throw new Error('generateText did not return the model content');
      if (calls[0].max_completion_tokens !== 512) {
        throw new Error('Modern models must receive max_completion_tokens, not max_tokens');
      }
      if (calls[0].max_tokens !== undefined) {
        throw new Error('Legacy max_tokens must not be sent to modern models');
      }

      // Legacy models reject max_completion_tokens with a 400 — the service must
      // retry the identical request using max_tokens.
      let attempt = 0;
      service.client.chat.completions.create = async (_params) => {
        attempt++;
        if (attempt === 1) {
          const err = new Error("Unsupported parameter: 'max_completion_tokens' is not supported with this model.");
          err.status = 400;
          throw err;
        }
        return { choices: [{ message: { content: 'legacy-ok' } }] };
      };
      const legacyResult = await service.generateText('legacy prompt');
      if (legacyResult !== 'legacy-ok') throw new Error('Legacy fallback did not return content');
      if (attempt !== 2) throw new Error('Expected exactly one retry with max_tokens');

      // An empty model body must surface as a descriptive error, not the cryptic
      // "Unexpected end of JSON input" the agents used to log.
      service.client.chat.completions.create = async () => ({ choices: [{ message: { content: '' } }] });
      let emptyRejected = false;
      try {
        await service.generateText('empty prompt');
      } catch (error) {
        emptyRejected = /empty response/i.test(error.message);
      }
      if (!emptyRejected) {
        throw new Error('Empty response was not rejected with a descriptive error');
      }

      // Gemini 3.5+ rejects/deprecates sampling parameters. Keep the latest
      // Gemini default on the parameter-safe request path.
      const geminiCalls = [];
      const geminiService = Object.create(AITextService.prototype);
      geminiService.gemini = {
        models: {
          generateContent: async (params) => {
            geminiCalls.push(params);
            return { text: 'gemini-ok' };
          }
        }
      };
      geminiService.client = null;
      geminiService.model = 'gemini-3.7-flash';
      geminiService.providerName = 'Google Gemini';

      const geminiResult = await geminiService.generateText('gemini prompt', { temperature: 0.2 });
      if (geminiResult !== 'gemini-ok') throw new Error('Gemini generation did not return content');
      if (geminiCalls[0].config.temperature !== undefined) {
        throw new Error('Gemini 3.7 must not receive the deprecated temperature parameter');
      }
    } finally {
      if (savedEnv === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedEnv;
    }

    this.logger.info('AI text service token parameter test completed successfully');
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

    const missingNarration = await agent.scheduleContent({
      id: 'prod-no-narration', script: { title: 'No narration' }, priority: 50,
      scheduledPublishTime: new Date().toISOString(),
      assets: { finalVideo: { path: 'video.mp4' } }, seo: {}
    });
    if (missingNarration !== null) throw new Error('Production without narration was scheduled for publishing');

    const real = await agent.scheduleContent({
      id: 'prod-real',
      script: { title: 'Real' },
      priority: 50,
      scheduledPublishTime: new Date().toISOString(),
      assets: {
        finalVideo: { path: 'video.mp4' }, thumbnail: {}, captions: {},
        audio: {
          intentionalSilence: true,
          silenceReason: 'This fixture intentionally uses a silent timeline.',
          silenceConfirmedAt: new Date().toISOString()
        }
      },
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
    const fs = require('fs').promises;
    const os = require('os');
    const sharp = require('sharp');

    const envKeys = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'REPLICATE_API_KEY', 'ELEVENLABS_API_KEY'];
    const savedEnv = {};
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-gemini-image-'));
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

      const thoughtImage = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#ff0000' }
      }).jpeg().toBuffer();
      const finalImage = await sharp({
        create: { width: 320, height: 180, channels: 3, background: '#0066ff' }
      }).webp().toBuffer();
      let imageRequest = null;
      geminiOnly.gemini.models.generateContent = async request => {
        imageRequest = request;
        return {
          candidates: [{
            content: {
              parts: [
                { thought: true, inlineData: { mimeType: 'image/jpeg', data: thoughtImage.toString('base64') } },
                { text: 'Rendering the final image.' },
                { inlineData: { mimeType: 'image/webp', data: finalImage.toString('base64') } }
              ]
            }
          }]
        };
      };

      const outputPath = path.join(directory, 'gemini-output.png');
      await geminiOnly.generateGeminiImage('Create a blue widescreen test image', outputPath);
      const metadata = await sharp(outputPath).metadata();
      if (metadata.format !== 'png' || metadata.width !== 320 || metadata.height !== 180) {
        throw new Error('Gemini final image was not selected and normalized to the requested file format');
      }
      if (
        imageRequest?.config?.responseModalities?.[0] !== 'IMAGE' ||
        imageRequest?.config?.imageConfig?.aspectRatio !== '16:9'
      ) {
        throw new Error('Gemini image request did not require a widescreen image response');
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
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
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
      if (generator.parseDurationSeconds('2:05') !== 125 || generator.parseDurationSeconds('1:02:03') !== 3723) {
        throw new Error('Human-readable production durations are not converted to timeline seconds');
      }

      const embeddedAssets = await generator.filterImageAssets(stills);
      if (embeddedAssets.length !== stills.length || embeddedAssets.some(asset => !asset.startsWith('data:image/png;base64,'))) {
        throw new Error('Slideshow image assets were not embedded as browser-safe image data');
      }
      const { chromium } = require('playwright');
      let browser = null;
      try {
        browser = await chromium.launch();
      } catch (error) {
        if (!/Executable doesn't exist|playwright install/i.test(error.message)) throw error;
        this.logger.warn('Chromium is not installed — verified browser-safe image embedding without the live browser assertion');
      }
      if (browser) {
        try {
          const page = await browser.newPage();
          await page.setContent(generator.createSlideshowHTML({ title: 'Image loading test' }, embeddedAssets));
          const imageState = await page.$$eval('.background-image', images => images.map(image => ({
            complete: image.complete,
            width: image.naturalWidth,
            height: image.naturalHeight
          })));
          if (!imageState.length || imageState.some(image => !image.complete || !image.width || !image.height)) {
            throw new Error('Embedded slideshow images did not load in Chromium');
          }
        } finally {
          await browser.close();
        }
      }

      const videoPath = path.join(dir, 'out.mp4');
      await generator.renderSlidesToVideo(stills, 6, videoPath);

      const stats = await fs.stat(videoPath);
      if (!stats.size) {
        throw new Error('Rendered slideshow video is empty');
      }

      // Missing narration must fail closed unless the operator explicitly confirmed silence.
      const finalPath = path.join(dir, 'final.mp4');
      let missingNarrationBlocked = false;
      try {
        await generator.addAudioToVideo(videoPath, path.join(dir, 'missing.mp3'), finalPath);
      } catch (error) {
        missingNarrationBlocked = error.code === 'NARRATION_REQUIRED';
      }
      if (!missingNarrationBlocked) throw new Error('Missing narration silently produced a final video');
      await generator.addAudioToVideo(videoPath, path.join(dir, 'missing.mp3'), finalPath, { allowSilent: true });
      const finalStats = await fs.stat(finalPath);
      if (!finalStats.size) {
        throw new Error('Explicit intentional-silence assembly did not produce a video');
      }

      const hybridPath = path.join(dir, 'hybrid.mp4');
      await generator.renderMediaTimeline([
        { type: 'video', path: videoPath, duration: 1 },
        { type: 'image', path: stills[0], duration: 1 }
      ], hybridPath);
      const hybridStats = await fs.stat(hybridPath);
      if (!hybridStats.size) throw new Error('Hybrid provider/still timeline did not produce a video');
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
    const { SetupWalkthrough, AI_PROVIDER_GUIDE, VIDEO_PROVIDER_GUIDE } = require('./walkthrough');
    const { PROVIDERS, GEMINI_MODELS, GEMINI_DEFAULT_MODEL } = require('./utils/ai-text-service');

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

    if (
      JSON.stringify(AI_PROVIDER_GUIDE.gemini.models) !== JSON.stringify(GEMINI_MODELS) ||
      AI_PROVIDER_GUIDE.gemini.defaultModel !== GEMINI_DEFAULT_MODEL
    ) {
      throw new Error('Walkthrough Gemini models drifted from the runtime catalog');
    }

    for (const id of Object.keys(PROVIDERS)) {
      if (JSON.stringify(AI_PROVIDER_GUIDE[id].models) !== JSON.stringify(PROVIDERS[id].models)) {
        throw new Error(`Walkthrough provider "${id}" models drifted from the runtime catalog`);
      }
    }

    for (const id of ['slideshow', 'seedance', 'minimax_h3', 'google_omni', 'kling', 'wan']) {
      const guide = VIDEO_PROVIDER_GUIDE[id];
      if (!guide?.label) throw new Error(`Walkthrough is missing video provider "${id}"`);
      if (id !== 'slideshow') {
        const credentials = {};
        guide.save(credentials, 'test-key', 'test-secret');
        if (!Object.keys(credentials).length || !guide.keyUrl || !guide.credentialName) {
          throw new Error(`Video provider guide "${id}" cannot save its credentials`);
        }
      }
    }

    const currentOpenRouterModels = [
      'openai/gpt-5.6-sol',
      'anthropic/claude-fable-5',
      'google/gemini-3.7-flash',
      'moonshotai/kimi-k3',
      'z-ai/glm-5.3'
    ];
    if (JSON.stringify(PROVIDERS.openrouter.models) !== JSON.stringify(currentOpenRouterModels)) {
      throw new Error('OpenRouter curated models are not the verified current catalog');
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
      './agents/analytics-optimization-agent',
      './utils/discoverability-service',
      './utils/discoverability-adapters/darkzseo'
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

  async testYouTubeScopeDetection() {
    const manager = new CredentialManager();
    const forceSsl = 'https://www.googleapis.com/auth/youtube.force-ssl';
    manager.tokens = { youtube: { scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube' } };
    if (manager.hasYouTubeScope(forceSsl)) throw new Error('force-ssl must not be reported before consent');
    if (!manager.hasYouTubeScope('https://www.googleapis.com/auth/youtube')) throw new Error('Granted scopes must be detected');
    manager.tokens.youtube.scope += ` ${forceSsl}`;
    if (!manager.hasYouTubeScope(forceSsl)) throw new Error('force-ssl must be detected after consent');
    manager.tokens = {};
    if (manager.hasYouTubeScope('https://www.googleapis.com/auth/youtube')) throw new Error('Missing tokens must report no scopes');
  }

  async testReplyDraftStore() {
    const db = new Database();
    await db.initialize();
    const commentId = `rc_test_${Date.now()}`;
    const videoId = `vid_reply_${Date.now()}`;
    try {
      const draft = await db.saveReplyDraft({ commentId, videoId, draftText: 'Thanks! The cache works per scene.', rationale: 'Direct question' });
      if (!draft || draft.status !== 'proposed') throw new Error('saveReplyDraft did not create a proposed draft');

      const edited = await db.updateReplyDraft(draft.id, { editedText: 'Thanks! Each scene caches separately.' });
      if (edited.editedText !== 'Thanks! Each scene caches separately.') throw new Error('editedText was not persisted');

      const replaced = await db.saveReplyDraft({ commentId, videoId, draftText: 'New draft text' });
      if (replaced.id !== draft.id) throw new Error('Re-drafting must reuse the comment row');
      if (replaced.editedText !== null || replaced.status !== 'proposed') throw new Error('Re-drafting must reset the lifecycle');

      const postedAt = new Date().toISOString();
      await db.updateReplyDraft(draft.id, { status: 'posted', postedCommentId: 'yt_reply_1', postedAt });
      const posted = await db.getReplyDraft(draft.id);
      if (posted.status !== 'posted' || posted.postedCommentId !== 'yt_reply_1') throw new Error('Posting evidence was not stored');

      let blocked = false;
      try {
        await db.saveReplyDraft({ commentId, videoId, draftText: 'Should not overwrite' });
      } catch (error) {
        blocked = error.status === 409;
      }
      if (!blocked) throw new Error('A posted reply draft must never be replaced');

      const postedCount = await db.countReplyDraftsPostedSince(new Date(Date.now() - 60000).toISOString());
      if (postedCount < 1) throw new Error('countReplyDraftsPostedSince missed the posted draft');

      const listed = await db.listReplyDrafts({ videoId, status: 'posted' });
      if (listed.length !== 1) throw new Error('listReplyDrafts filter failed');
    } finally {
      await db.executeQuery('DELETE FROM reply_drafts WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testEngagementInsightStore() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_insight_${Date.now()}`;
    try {
      const synced = await db.saveEngagementInsight({
        videoId, title: 'Test video', commentCount: 4,
        lastSyncedAt: '2026-08-23T10:00:00.000Z',
        newestCommentAt: '2026-08-23T09:00:00.000Z'
      });
      if (!synced || synced.videoId !== videoId) throw new Error('saveEngagementInsight did not store the row');

      const analyzed = await db.saveEngagementInsight({
        videoId, analyzedCount: 4,
        sentiment: { method: 'ai', positive: 3, neutral: 1, negative: 0 },
        themes: [{ title: 'Render cache questions', summary: 'Viewers ask how caching works', kind: 'question', count: 3, commentIds: ['a', 'b', 'c'] }],
        attentionFlags: [{ commentId: 'x', categories: ['scam'], permalink: 'https://www.youtube.com/watch?v=1&lc=x' }],
        analysisMethod: 'ai', analyzedAt: '2026-08-23T10:05:00.000Z'
      });
      if (analyzed.id !== synced.id) throw new Error('Insight upsert must reuse the video row, not duplicate');
      if (analyzed.lastSyncedAt !== '2026-08-23T10:00:00.000Z') throw new Error('Merge lost the sync watermark');
      if (analyzed.themes[0]?.count !== 3 || analyzed.sentiment.positive !== 3) throw new Error('JSON columns did not round-trip');
      if (analyzed.attentionFlags.length !== 1) throw new Error('attention_flags did not round-trip');

      const listed = await db.listEngagementInsights({ limit: 5 });
      if (!listed.some(item => item.videoId === videoId)) throw new Error('listEngagementInsights missed the row');
    } finally {
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testAudienceCommentStore() {
    const db = new Database();
    await db.initialize();
    const commentId = `ac_test_${Date.now()}`;
    const videoId = `vid_test_${Date.now()}`;
    try {
      const first = await db.upsertAudienceComment({
        commentId, videoId,
        text: 'How does the render cache work?',
        authorName: 'Viewer One', authorChannelId: 'UC_viewer_1',
        likeCount: 3, replyCount: 0,
        publishedAt: new Date().toISOString()
      });
      if (!first || first.commentId !== commentId) throw new Error('upsertAudienceComment did not store the comment');
      if (first.isChannelOwner !== false || first.repliedByAgent !== false) throw new Error('Boolean parsing is wrong');

      const second = await db.upsertAudienceComment({
        commentId, videoId, text: 'How does the render cache work? (edited)', likeCount: 5
      });
      if (second.id !== first.id) throw new Error('Re-syncing the same comment must upsert, not duplicate');
      if (second.likeCount !== 5 || !second.text.includes('(edited)')) throw new Error('Upsert did not refresh mutable fields');

      const flagged = await db.setAudienceCommentAnalysis(commentId, ['question']);
      if (flagged.analysisState !== 'analyzed' || !flagged.flags.includes('question')) throw new Error('Analysis flags were not persisted');

      const listed = await db.listAudienceComments({ videoId, topLevelOnly: true });
      if (listed.length !== 1) throw new Error('listAudienceComments missed the top-level comment');

      const counts = await db.countAudienceComments(videoId);
      if (counts.total !== 1 || counts.topLevel !== 1) throw new Error('countAudienceComments returned wrong counts');

      const replied = await db.markAudienceCommentReplied(commentId);
      if (!replied.repliedByAgent) throw new Error('markAudienceCommentReplied did not persist');
    } finally {
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.close();
    }
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

    // The startup banner must report the real version. It was hardcoded to "v2.0"
    // through v2.4.0, so bug reports pasted a version that was four releases stale.
    const indexSource = await fs.readFile('index.js', 'utf8');
    const hardcodedBanner = indexSource.match(/YouTube Automation Agent v[\d.]/);
    if (hardcodedBanner) {
      throw new Error(
        `Startup banner hardcodes a version ("${hardcodedBanner[0]}") — interpolate package.json's version instead`
      );
    }
    if (!indexSource.includes('YouTube Automation Agent v${version}')) {
      throw new Error('Startup banner does not report the package.json version');
    }

    // package.json and package-lock.json drifted apart before v2.4.1; keep them aligned
    const lockJson = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
    if (lockJson.version !== packageJson.version) {
      throw new Error(
        `package-lock.json version (${lockJson.version}) does not match package.json (${packageJson.version})`
      );
    }

    this.logger.info('Configuration test completed successfully');
  }

  async testAudienceCommentSync() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_sync_${Date.now()}`;
    const iso = offsetMinutes => new Date(Date.now() - offsetMinutes * 60000).toISOString();
    const thread = (id, publishedAt, replies = []) => ({
      id,
      snippet: {
        totalReplyCount: replies.length,
        topLevelComment: { id, snippet: {
          textOriginal: `Comment ${id}`, authorDisplayName: 'Viewer',
          authorChannelId: { value: 'UC_viewer' }, likeCount: 1, publishedAt, updatedAt: publishedAt
        } }
      },
      replies: { comments: replies }
    });
    try {
      const pages = [
        { items: [thread(`${videoId}_c2`, iso(5)), thread(`${videoId}_c1`, iso(60), [{
            id: `${videoId}_c1_r1`, snippet: {
              textOriginal: 'A reply', authorDisplayName: 'Owner',
              authorChannelId: { value: 'UC_channel_owner' }, likeCount: 0, publishedAt: iso(30), updatedAt: iso(30)
            }
          }]) ] }
      ];
      const service = new AudienceEngagementService(db, null, null, {
        listCommentThreads: async () => pages[0],
        getChannelId: async () => 'UC_channel_owner'
      });

      const first = await service.syncVideoComments(videoId, { title: 'Sync test' });
      if (first.fetched !== 3) throw new Error(`Expected 3 stored comments, got ${first.fetched}`);
      if (!first.insight?.newestCommentAt) throw new Error('Sync did not record the watermark');
      const ownerReply = await db.getAudienceComment(`${videoId}_c1_r1`);
      if (!ownerReply.isChannelOwner || ownerReply.parentCommentId !== `${videoId}_c1`) throw new Error('Reply mapping is wrong');

      const second = await service.syncVideoComments(videoId, {});
      if (second.fetched !== 0) throw new Error('Watermark must stop re-ingesting known comments');

      // Refusal policy: API failure stores nothing and rethrows
      const failing = new AudienceEngagementService(db, null, null, {
        listCommentThreads: async () => { throw new Error('quota exceeded'); },
        getChannelId: async () => 'UC_channel_owner'
      });
      let threw = false;
      try { await failing.syncVideoComments(`${videoId}_other`, {}); } catch (_error) { threw = true; }
      if (!threw) throw new Error('API failure must throw');
      if (await db.getEngagementInsight(`${videoId}_other`)) throw new Error('A failed sync must store nothing');

      // Disabled comments are not an error
      const disabledError = new Error('disabled');
      disabledError.errors = [{ reason: 'commentsDisabled' }];
      const disabledService = new AudienceEngagementService(db, null, null, {
        listCommentThreads: async () => { throw disabledError; },
        getChannelId: async () => 'UC_channel_owner'
      });
      const disabled = await disabledService.syncVideoComments(`${videoId}_disabled`, {});
      if (!disabled.disabled || disabled.fetched !== 0) throw new Error('commentsDisabled must be recorded, not thrown');

      // Taper
      if (service.isSyncDue(null, iso(0))) { /* never-synced is due */ } else throw new Error('Never-synced video must be due');
      const fresh = { lastSyncedAt: iso(60) };
      if (service.isSyncDue(fresh, iso(24 * 60))) throw new Error('A 1h-stale sync of a 1-day-old video is not due (4h taper)');
      if (!service.isSyncDue({ lastSyncedAt: iso(5 * 60) }, iso(24 * 60))) throw new Error('A 5h-stale sync of a 1-day-old video is due');
      if (service.isSyncDue({ lastSyncedAt: iso(13 * 60) }, iso(40 * 24 * 60))) throw new Error('Videos older than 30 days are never auto-due');
    } finally {
      await db.executeQuery("DELETE FROM audience_comments WHERE video_id LIKE ?", [`${videoId}%`]);
      await db.executeQuery("DELETE FROM engagement_insights WHERE video_id LIKE ?", [`${videoId}%`]);
      await db.close();
    }
  }

  async testAudienceCommentAnalysis() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_analysis_${Date.now()}`;
    const seed = async (suffix, text, likeCount = 0) => db.upsertAudienceComment({
      commentId: `${videoId}_${suffix}`, videoId, text, likeCount,
      publishedAt: new Date().toISOString()
    });
    try {
      await seed('q1', 'How do I configure the render cache?', 4);
      await seed('q2', 'Can you explain the cache setup?', 2);
      await seed('q3', 'What cache settings do you use?', 1);
      await seed('scam1', 'Congratulations! Message me on telegram to claim your prize');
      const aiResponse = JSON.stringify({
        comments: [
          { commentId: `${videoId}_q1`, sentiment: 'positive', flags: ['question'] },
          { commentId: `${videoId}_q2`, sentiment: 'neutral', flags: ['question'] },
          { commentId: `${videoId}_q3`, sentiment: 'neutral', flags: ['question'] },
          { commentId: `${videoId}_scam1`, sentiment: 'neutral', flags: ['scam'] },
          { commentId: 'not_a_real_comment', sentiment: 'negative', flags: ['toxic'] }
        ],
        themes: [
          { title: 'Render cache setup', summary: 'Viewers want a cache configuration walkthrough', kind: 'question',
            commentIds: [`${videoId}_q1`, `${videoId}_q2`, `${videoId}_q3`, `${videoId}_scam1`, 'not_a_real_comment'] },
          { title: 'Bad theme', summary: 'Only one supporter', kind: 'feedback', commentIds: [`${videoId}_q1`] }
        ]
      });
      const service = new AudienceEngagementService(db, null, {
        isAvailable: () => true,
        generateText: async () => aiResponse
      }, {});

      const insight = await service.analyzeVideo(videoId);
      if (insight.analysisMethod !== 'ai') throw new Error('AI analysis was not recorded as ai');
      if (insight.sentiment.positive !== 1 || insight.sentiment.neutral !== 3) throw new Error('Sentiment counts are wrong');
      if (insight.themes.length !== 1) throw new Error('Theme normalization must drop single-comment themes');
      if (insight.themes[0].count !== 3) throw new Error('Quarantined and unknown comment ids must not count toward themes');
      if (insight.attentionFlags.length !== 1 || insight.attentionFlags[0].commentId !== `${videoId}_scam1`) {
        throw new Error('Scam comment must land in attentionFlags');
      }
      const scam = await db.getAudienceComment(`${videoId}_scam1`);
      if (!scam.flags.includes('scam')) throw new Error('Per-comment flags were not stored');

      // parseAIJsonResponse handles fenced, embedded, and malformed output
      if (service.parseAIJsonResponse('```json\n{"a":1}\n```')?.a !== 1) throw new Error('Fenced JSON must parse');
      if (service.parseAIJsonResponse('noise before [1,2] noise after')?.[0] !== 1) throw new Error('Embedded arrays must parse');
      if (service.parseAIJsonResponse('not json at all') !== null) throw new Error('Garbage must return null');

      // Fallback: mechanical facts only, no themes
      const fallbackVideo = `${videoId}_fb`;
      await db.upsertAudienceComment({ commentId: `${fallbackVideo}_c1`, videoId: fallbackVideo, text: 'Is this real?', publishedAt: new Date().toISOString() });
      const fallbackService = new AudienceEngagementService(db, null, { isAvailable: () => false }, {});
      const fallback = await fallbackService.analyzeVideo(fallbackVideo);
      if (fallback.analysisMethod !== 'fallback') throw new Error('Fallback method was not recorded');
      if (fallback.themes.length !== 0) throw new Error('Fallback must never invent themes');
      if (fallback.sentiment.method !== 'fallback' || 'positive' in fallback.sentiment) throw new Error('Fallback must not claim sentiment');
      const fallbackComment = await db.getAudienceComment(`${fallbackVideo}_c1`);
      if (!fallbackComment.flags.includes('question')) throw new Error('Fallback question detection failed');

      // syncDueVideos delegates and analyzes only after a fetching sync
      let analyzeCalls = 0;
      const dueService = new AudienceEngagementService(db, null, { isAvailable: () => false }, {
        listCommentThreads: async () => ({ items: [] })
      });
      dueService.analyzeVideo = async () => { analyzeCalls++; };
      const results = await dueService.syncDueVideos([
        { youtubeId: `${videoId}_due`, title: 'Due', publishedAt: new Date().toISOString(), productionId: null },
        { youtubeId: null }
      ]);
      if (results.synced !== 1 || results.skipped !== 1) throw new Error(`syncDueVideos counters are wrong: ${JSON.stringify(results)}`);
      if (analyzeCalls !== 0) throw new Error('A sync that fetched nothing must not trigger analysis');
    } finally {
      await db.executeQuery("DELETE FROM learning_recommendations WHERE category = 'audience_demand' AND evidence LIKE ?", [`%${videoId}%`]);
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id LIKE ?', [`${videoId}%`]);
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id LIKE ?', [`${videoId}%`]);
      await db.close();
    }
  }

  async testAudienceIdeaMining() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_mining_${Date.now()}`;
    try {
      for (const suffix of ['m1', 'm2', 'm3']) {
        await db.upsertAudienceComment({
          commentId: `${videoId}_${suffix}`, videoId,
          text: `Please cover local caching next (${suffix})`, publishedAt: new Date().toISOString()
        });
      }
      const service = new AudienceEngagementService(db, null, null, {});
      const insight = {
        videoId, title: 'Mining test', analysisMethod: 'ai',
        themes: [
          { title: 'Cover local caching', summary: 'Repeated requests for a caching deep-dive', kind: 'request',
            count: 3, commentIds: [`${videoId}_m1`, `${videoId}_m2`, `${videoId}_m3`] },
          { title: 'Too few asks', summary: 'Only two', kind: 'request', count: 2, commentIds: [`${videoId}_m1`, `${videoId}_m2`] },
          { title: 'Praise cluster', summary: 'Nice video', kind: 'praise', count: 5, commentIds: [`${videoId}_m1`, `${videoId}_m2`, `${videoId}_m3`] }
        ]
      };
      const saved = await service.refreshAudienceRecommendations(videoId, insight);
      if (saved.length !== 1) throw new Error(`Only the >=3 request/question theme may mine an idea; got ${saved.length}`);
      const recommendation = saved[0];
      if (recommendation.category !== 'audience_demand') throw new Error('Category must be audience_demand');
      if (recommendation.status !== 'pending') throw new Error('Mined ideas must be pending until reviewed');
      if (recommendation.confidence !== 'low') throw new Error('Ask-count 3 maps to low confidence');
      const evidence = recommendation.evidence; // parseLearningRecommendation returns it already parsed
      if (evidence.askCount !== 3 || evidence.sampleComments.length !== 3) throw new Error('Evidence is incomplete');
      if (!evidence.sampleComments[0].permalink.includes('&lc=')) throw new Error('Evidence must carry comment permalinks');
      if (recommendation.proposedChange.autoEditPublishedContent !== false) throw new Error('autoEditPublishedContent must be false');

      const again = await service.refreshAudienceRecommendations(videoId, insight);
      if (again[0].id !== recommendation.id) throw new Error('Re-analysis must dedupe by fingerprint, not duplicate');

      const nonAI = await service.refreshAudienceRecommendations(videoId, { ...insight, analysisMethod: 'fallback' });
      if (nonAI.length !== 0) throw new Error('Fallback analysis must never mine ideas');
    } finally {
      await db.executeQuery("DELETE FROM learning_recommendations WHERE category = 'audience_demand' AND evidence LIKE ?", [`%${videoId}%`]);
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testReplyDrafting() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_draft_${Date.now()}`;
    const seed = (suffix, text, flags, extra = {}) => db.upsertAudienceComment({
      commentId: `${videoId}_${suffix}`, videoId, text,
      publishedAt: new Date().toISOString(), ...extra
    }).then(() => db.setAudienceCommentAnalysis(`${videoId}_${suffix}`, flags));
    try {
      await seed('q1', 'How long does a render take?', ['question']);
      await seed('praise1', 'Great video!', ['praise']);
      await seed('scam1', 'Claim your prize now', ['scam']);
      await seed('own1', 'Thanks all!', [], { isChannelOwner: true });
      await db.upsertAudienceComment({
        commentId: `${videoId}_nested`, videoId, parentCommentId: `${videoId}_q1`,
        text: 'Also curious?', publishedAt: new Date().toISOString()
      });
      await db.saveEngagementInsight({ videoId, title: 'Draft test', analysisMethod: 'ai', analyzedAt: new Date().toISOString() });

      let promptSeen = '';
      const service = new AudienceEngagementService(db, null, {
        isAvailable: () => true,
        generateText: async prompt => {
          promptSeen = prompt;
          return JSON.stringify([
            { commentId: `${videoId}_q1`, reply: 'About two minutes per scene on default settings.', rationale: 'Direct question' },
            { commentId: `${videoId}_praise1`, reply: 'Visit http://spam.example now', rationale: 'Link should be dropped' },
            { commentId: `${videoId}_scam1`, reply: 'Should never appear', rationale: 'Quarantined' }
          ]);
        }
      }, {});

      const drafts = await service.draftReplies(videoId);
      if (drafts.length !== 1) throw new Error(`Expected 1 usable draft (link + quarantined dropped), got ${drafts.length}`);
      if (drafts[0].commentId !== `${videoId}_q1` || drafts[0].status !== 'proposed') throw new Error('Draft shape is wrong');
      if (promptSeen.includes(`${videoId}_scam1`) || promptSeen.includes(`${videoId}_own1`) || promptSeen.includes(`${videoId}_nested`)) {
        throw new Error('Quarantined, owner, and nested comments must never reach the draft prompt');
      }

      const noAI = new AudienceEngagementService(db, null, { isAvailable: () => false }, {});
      let status = 0;
      try { await noAI.draftReplies(videoId); } catch (error) { status = error.status; }
      if (status !== 503) throw new Error('Drafting without AI must throw 503');

      await db.saveEngagementInsight({ videoId: `${videoId}_fb`, analysisMethod: 'fallback' });
      status = 0;
      try { await service.draftReplies(`${videoId}_fb`); } catch (error) { status = error.status; }
      if (status !== 409) throw new Error('Drafting without an AI analysis must throw 409');
    } finally {
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id LIKE ?', [`${videoId}%`]);
      await db.executeQuery('DELETE FROM reply_drafts WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testReplyApprovalAndPosting() {
    const db = new Database();
    await db.initialize();
    const videoId = `vid_post_${Date.now()}`;
    const commentId = `${videoId}_target`;
    const scopedCredentials = { hasYouTubeScope: scope => scope === 'https://www.googleapis.com/auth/youtube.force-ssl' };
    try {
      await db.upsertAudienceComment({ commentId, videoId, text: 'Question?', publishedAt: new Date().toISOString() });
      const makeDraft = () => db.saveReplyDraft({ commentId, videoId, draftText: 'Answer text' });

      let draft = await makeDraft();
      const posts = [];
      const service = new AudienceEngagementService(db, scopedCredentials, null, {
        insertComment: async ({ parentId, text }) => { posts.push({ parentId, text }); return { id: 'yt_posted_1' }; }
      });

      let code = null;
      try { await service.approveReplyDraft(draft.id, {}); } catch (error) { code = error.code; }
      if (code !== 'REPLY_APPROVAL_REQUIRED') throw new Error('Approval must require confirmed: true');

      const unscoped = new AudienceEngagementService(db, { hasYouTubeScope: () => false }, null, {});
      code = null;
      try { await unscoped.approveReplyDraft(draft.id, { confirmed: true }); } catch (error) { code = error.code; }
      if (code !== 'REPLY_SCOPE_REQUIRED') throw new Error('Missing force-ssl scope must block posting');
      const gate = unscoped.postingEnabled();
      if (gate.enabled || gate.reason !== 'missing_scope') {
        throw new Error('postingEnabled must report missing_scope');
      }

      const posted = await service.approveReplyDraft(draft.id, { confirmed: true, editedText: 'Edited answer' });
      if (posted.status !== 'posted' || posted.postedCommentId !== 'yt_posted_1') throw new Error('Posting evidence missing');
      if (posts[0].parentId !== commentId || posts[0].text !== 'Edited answer') throw new Error('The edited text must be what posts');
      if (!(await db.getAudienceComment(commentId)).repliedByAgent) throw new Error('Source comment must be marked replied');

      let status = null;
      try { await service.approveReplyDraft(draft.id, { confirmed: true }); } catch (error) { status = error.status; }
      if (status !== 409) throw new Error('A posted draft must not post twice');

      // Failure path: failed + reason, manual retry allowed
      const failingComment = `${videoId}_fail`;
      await db.upsertAudienceComment({ commentId: failingComment, videoId, text: 'Other?', publishedAt: new Date().toISOString() });
      const failDraft = await db.saveReplyDraft({ commentId: failingComment, videoId, draftText: 'Will fail' });
      const failing = new AudienceEngagementService(db, scopedCredentials, null, {
        insertComment: async () => { throw new Error('commentThreadNotFound'); }
      });
      status = null;
      try { await failing.approveReplyDraft(failDraft.id, { confirmed: true }); } catch (error) { status = error.status; }
      if (status !== 502) throw new Error('A failed post must throw 502');
      const failed = await db.getReplyDraft(failDraft.id);
      if (failed.status !== 'failed' || !failed.failureReason.includes('commentThreadNotFound')) throw new Error('Failure evidence missing');

      // Daily cap
      const capped = new AudienceEngagementService(db, scopedCredentials, null, { dailyReplyCap: 1, insertComment: async () => ({ id: 'x' }) });
      status = null;
      try { await capped.approveReplyDraft(failDraft.id, { confirmed: true }); } catch (error) { status = error.status; }
      if (status !== 429) throw new Error('The daily reply cap must block further posts');

      // updateReplyDraft rules
      const edited = await service.updateReplyDraft(failDraft.id, { editedText: 'Retry text' });
      if (edited.status !== 'proposed' || edited.editedText !== 'Retry text') throw new Error('Editing must re-open a failed draft');
      const discarded = await service.updateReplyDraft(failDraft.id, { discard: true });
      if (discarded.status !== 'discarded') throw new Error('Discard failed');

      // Summary
      const summary = await service.getSummary();
      if (summary.postedToday < 1) throw new Error('getSummary missed postedToday');
      if (summary.postingEnabled !== true) throw new Error('getSummary posting flag is wrong');
      if (!summary.evidencePolicy.includes('operator approval')) throw new Error('evidencePolicy text missing');
    } finally {
      await db.executeQuery('DELETE FROM audience_comments WHERE video_id = ?', [videoId]);
      await db.executeQuery('DELETE FROM reply_drafts WHERE video_id = ?', [videoId]);
      await db.executeQuery('DELETE FROM engagement_insights WHERE video_id = ?', [videoId]);
      await db.close();
    }
  }

  async testEngagementAIProviderWiring() {
    const { AITextService } = require('./utils/ai-text-service');

    // Regression: index.js must hand AITextService the unwrapped credentials object
    // (manager.credentials), the shape the walkthrough writes to credentials.json.
    // Passing the CredentialManager itself leaves the engagement studio permanently
    // in fallback mode on installs with no provider environment variables.
    const savedEnv = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const configured = new AITextService({
        aiProvider: { provider: 'openai', apiKey: 'test-key', model: 'gpt-5.6' }
      });
      if (!configured.isAvailable()) {
        throw new Error('AITextService must initialize from a credentials-file aiProvider config');
      }

      const wrapped = new AITextService({
        credentials: { aiProvider: { provider: 'openai', apiKey: 'test-key', model: 'gpt-5.6' } }
      });
      if (wrapped.isAvailable()) {
        throw new Error('A CredentialManager-shaped argument must not look configured; index.js has to unwrap it');
      }
    } finally {
      if (savedEnv === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = savedEnv;
    }
  }

  async testEngagementSyncSchedule() {
    let captured = null;
    const events = [];
    const fakeDb = {
      getAllRows: async () => [
        { youtube_id: 'vid_sched_1', title: 'Scheduled video', published_at: '2026-08-22T00:00:00.000Z', production_id: 'prod_1' }
      ],
      executeQuery: async () => ({}),
      generateId: prefix => `${prefix}_test`
    };
    const scheduler = new DailyAutomation({}, fakeDb, {
      generateContent: async () => {},
      engagement: {
        syncDueVideos: async videos => {
          captured = videos;
          return { synced: 1, skipped: 0, failed: 0, analyzed: 1 };
        }
      }
    });
    scheduler.logAutomationEvent = async (type, status, data) => { events.push({ type, status, data }); };
    await scheduler.collectAudienceEngagement();
    if (!captured || captured[0].youtubeId !== 'vid_sched_1') throw new Error('The scheduler did not map youtube_id');
    if (captured[0].productionId !== 'prod_1' || captured[0].publishedAt !== '2026-08-22T00:00:00.000Z') {
      throw new Error('The scheduler did not map production/publish fields');
    }
    if (!events.some(event => event.type === 'audience_engagement_sync' && event.status === 'success')) {
      throw new Error('The engagement sweep must log an automation event');
    }
    const noService = new DailyAutomation({}, fakeDb, { generateContent: async () => {} });
    await noService.collectAudienceEngagement(); // must be a silent no-op, not a crash
  }

  async testGrowthExperimentRefreshSchedule() {
    const events = [];
    let refreshes = 0;
    const scheduler = new DailyAutomation({}, {}, {
      experiments: {
        refreshDue: async () => {
          refreshes++;
          return { running: 2, refreshed: 1, failed: 0 };
        }
      }
    });
    scheduler.logAutomationEvent = async (type, status, data) => events.push({ type, status, data });
    await scheduler.refreshGrowthExperiments();
    if (refreshes !== 1 || !events.some(event =>
      event.type === 'growth_experiment_refresh' && event.status === 'success' && event.data.refreshed === 1
    )) {
      throw new Error('The scheduler did not refresh and record due controlled experiments');
    }
    const noService = new DailyAutomation({}, {}, {});
    await noService.refreshGrowthExperiments();
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
