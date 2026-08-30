const { Logger } = require('./logger');
const { loadNewsroomConfig } = require('./newsroom-config');
const { NewsScoreService } = require('./news-score-service');
const { NewsRadarAgent } = require('../agents/news-radar-agent');
const { NewsVerificationAgent } = require('../agents/news-verification-agent');
const { NewsResearchAgent } = require('../agents/news-research-agent');
const { NewsRoutingAgent } = require('../agents/news-routing-agent');

const AUTO_IDEA_ROUTES = new Set(['ai_today', 'tutorial', 'review', 'comparison', 'weekly_digest']);

class NewsroomService {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = options.logger || new Logger('Newsroom');
    this.config = options.config || loadNewsroomConfig();
    this.radar = options.radar || new NewsRadarAgent(db, options);
    this.verification = options.verification || new NewsVerificationAgent(db, options);
    this.research = options.research || new NewsResearchAgent(db, options);
    this.router = options.router || new NewsRoutingAgent({ config: this.config, logger: this.logger });
    this.scoring = options.scoring || new NewsScoreService({ scoreVersion: this.config.scoreVersion });
    this.startGenerationJob = options.startGenerationJob || null;
    this.notify = options.notify || (async () => {});
    this.activeCycle = null;
  }

  async initialize() {
    await this.radar.initialize();
    await this.verification.initialize();
    await this.research.initialize();
    await this.router.initialize();
    return true;
  }

  async runRadar(options = {}) {
    return this.radar.collect(options);
  }

  async verifyPendingEvents(limit) {
    return this.verification.verifyPending(limit);
  }

  async verifyEvent(eventId) {
    return this.verification.verifyEvent(eventId);
  }

  async scoreEvent(eventId) {
    const event = await this.db.getNewsEvent(eventId);
    if (!event) throw new Error('News event not found');
    const sources = await this.db.getNewsEventSources(eventId);
    const score = this.scoring.score(event, sources, this.config.channel);
    await this.db.saveNewsEventScore(eventId, score);
    return { event: await this.db.getNewsEvent(eventId), score };
  }

  async scoreVerifiedEvents(limit = 50) {
    const events = await this.db.listNewsEvents({ limit: 200 });
    const scored = [];
    for (const event of events.slice(0, limit)) {
      scored.push(await this.scoreEvent(event.id));
    }
    return scored;
  }

  async researchEvent(eventId, verification) {
    return this.research.researchEvent(eventId, verification);
  }

  async routeEvent(eventId) {
    const event = await this.db.getNewsEvent(eventId);
    if (!event) throw new Error('News event not found');
    const sources = await this.db.getNewsEventSources(eventId);
    const research = await this.db.getNewsResearch(eventId);
    const routing = this.router.routeEvent(event, sources, research || {});
    const status = routing.route === 'ignore'
      ? 'ignored'
      : routing.route === 'watchlist'
        ? 'watchlist'
        : event.status === 'approved'
          ? 'approved'
          : 'routed';
    await this.db.updateNewsEvent(eventId, {
      contentRoute: routing.route,
      urgency: routing.urgency,
      status
    });
    return { event: await this.db.getNewsEvent(eventId), routing };
  }

  ideaPayload(event, routing, research, sources) {
    const pack = research?.package || research || {};
    const title = (routing.titleAngles && routing.titleAngles[0]) || event.title;
    const sourceRefs = sources.map(source => ({
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      sourceType: Number(source.source_tier) === 1 ? 'official' : Number(source.source_tier) === 3 ? 'article' : 'other',
      publishedAt: source.published_at
    }));
    return {
      topic: title.slice(0, 200),
      angle: pack.whyItMatters || routing.reason,
      style: routing.recommendedFormat,
      status: 'backlog',
      rationale: routing.reason,
      source: 'ai_newsroom',
      newsEventId: event.id,
      contentRoute: routing.route,
      urgency: routing.urgency,
      researchJson: pack,
      sourceReferences: sourceRefs,
      suggestedTitle: title,
      thumbnailAngle: (routing.thumbnailAngles || [])[0] || title,
      targetAudience: this.config.channel.audience,
      contentPillar: routing.pillar
    };
  }

  async createContentIdea(eventId, options = {}) {
    const event = await this.db.getNewsEvent(eventId);
    if (!event) throw new Error('News event not found');
    if (event.content_idea_id && !options.replace) {
      return this.db.getRow('SELECT * FROM content_ideas WHERE id = ?', [event.content_idea_id]);
    }
    const sources = await this.db.getNewsEventSources(eventId);
    const research = await this.db.getNewsResearch(eventId);
    const routing = options.routing || this.router.routeEvent(event, sources, research || {});
    if (routing.route === 'ignore') {
      const error = new Error('Ignored events cannot become content ideas');
      error.status = 409;
      throw error;
    }
    if (routing.route === 'breaking' && !routing.verifiedPrimary && this.config.requirePrimaryForBreaking) {
      const error = new Error('Breaking ideas require a verified primary source');
      error.status = 409;
      throw error;
    }
    const idea = await this.db.createContentIdea(this.ideaPayload(event, routing, research, sources));
    await this.db.updateNewsEvent(eventId, {
      contentIdeaId: idea.id,
      contentRoute: routing.route,
      urgency: routing.urgency,
      status: options.status || event.status || 'idea_ready'
    });
    return idea;
  }

  async approveEvent(eventId, input = {}) {
    const routed = await this.routeEvent(eventId);
    if (input.route) {
      await this.db.updateNewsEvent(eventId, { contentRoute: input.route });
      routed.routing.route = input.route;
    }
    await this.db.updateNewsEvent(eventId, {
      status: 'approved',
      holdReason: null
    });
    const idea = await this.createContentIdea(eventId, { routing: routed.routing, status: 'approved' });
    let job = null;
    if (input.generate === true) {
      job = await this.queueGeneration(eventId, idea, input);
    }
    await this.notify({
      type: 'newsroom_event_approved',
      level: 'success',
      title: 'Newsroom event approved',
      message: idea.topic,
      data: { eventId, ideaId: idea.id, route: routed.routing.route }
    });
    return { event: await this.db.getNewsEvent(eventId), idea, job, routing: routed.routing };
  }

  async rejectEvent(eventId, input = {}) {
    return this.db.updateNewsEvent(eventId, {
      status: 'rejected',
      holdReason: input.reason || 'rejected_by_operator'
    });
  }

  async holdEvent(eventId, input = {}) {
    return this.db.updateNewsEvent(eventId, {
      status: 'hold',
      holdReason: input.reason || 'held_by_operator'
    });
  }

  async changeRoute(eventId, route) {
    const allowed = ['breaking', 'ai_today', 'tutorial', 'review', 'comparison', 'weekly_digest', 'watchlist', 'ignore'];
    if (!allowed.includes(route)) {
      const error = new Error('Unsupported newsroom route');
      error.status = 400;
      throw error;
    }
    return this.db.updateNewsEvent(eventId, {
      contentRoute: route,
      status: route === 'ignore' ? 'ignored' : route === 'watchlist' ? 'watchlist' : 'routed',
      urgency: route === 'breaking' ? 'immediate' : route === 'ai_today' ? 'same_day' : 'normal'
    });
  }

  generationContext(event, idea, sources, research, routing) {
    const pack = research?.package || research || {};
    return {
      topic: idea.topic,
      style: idea.style || routing.recommendedFormat,
      length: routing.recommendedLength || 'medium',
      source: 'ai_newsroom',
      strategyContext: {
        angle: idea.angle || pack.whyItMatters || '',
        rationale: idea.rationale || routing.reason || '',
        audience: this.config.channel.audience || '',
        objective: this.config.channel.objective || '',
        valueProposition: this.config.channel.valueProposition || '',
        constraints: this.config.channel.constraints || '',
        pillar: routing.pillar || 'AI News',
        language: this.config.channel.language || 'vi',
        contentRoute: routing.route,
        newsEventId: event.id,
        scriptBlueprint: routing.route,
        thumbnailAngle: idea.thumbnail_angle || idea.thumbnailAngle || '',
        researchSources: (sources || []).filter(source => source.url).map(source => ({
          url: source.url,
          title: source.title,
          publisher: source.publisher,
          sourceType: Number(source.source_tier) === 1 ? 'official' : 'article',
          publishedAt: source.published_at
        }))
      }
    };
  }

  async queueGeneration(eventId, idea, _input = {}) {
    if (!this.startGenerationJob) {
      const error = new Error('Generation is not available until AgentTube setup is complete');
      error.status = 503;
      throw error;
    }
    const event = await this.db.getNewsEvent(eventId);
    const sources = await this.db.getNewsEventSources(eventId);
    const research = await this.db.getNewsResearch(eventId);
    const routing = this.router.routeEvent(event, sources, research || {});
    const job = await this.startGenerationJob(this.generationContext(event, idea, sources, research, routing));
    await this.db.saveNewsEventPublication({
      newsEventId: event.id,
      contentIdeaId: idea.id,
      productionId: job.production_id || null,
      route: routing.route,
      score: event.score
    });
    if (idea.id) await this.db.updateContentIdea(idea.id, { status: 'generating' });
    return job;
  }

  async maybeCreateIdea(event, routing) {
    if (!this.config.autoCreateIdeas) return null;
    if (!AUTO_IDEA_ROUTES.has(routing.route)) return null;
    if (event.verification_status === 'conflicted') return null;
    if (['rejected', 'hold'].includes(event.status)) return null;
    return this.createContentIdea(event.id, { routing, status: 'idea_ready' });
  }

  async processEvent(eventId) {
    const verification = await this.verifyEvent(eventId);
    const scored = await this.scoreEvent(eventId);
    const research = await this.researchEvent(eventId, verification);
    const routed = await this.routeEvent(eventId);
    const idea = await this.maybeCreateIdea(routed.event, routed.routing);
    return { verification, score: scored.score, research, routing: routed.routing, idea };
  }

  async runCycle(options = {}) {
    if (this.activeCycle) {
      return { skipped: true, reason: 'run_in_progress', run: this.activeCycle };
    }
    const existing = await this.db.getActiveNewsroomRun();
    if (existing && !options.force) {
      return { skipped: true, reason: 'run_in_progress', run: existing };
    }

    const run = await this.db.createNewsroomRun({ runType: options.runType || 'cycle' });
    this.activeCycle = run;
    const errors = [];
    try {
      const radar = await this.runRadar({ maxSignals: options.maxSignals });
      errors.push(...(radar.errors || []));
      const createdIds = radar.outcomes
        .filter(item => item.event && (item.classification === 'new' || item.classification === 'probable' || item.classification === 'exact' || item.classification === 'auto_merge'))
        .map(item => item.event.id);
      const uniqueIds = [...new Set(createdIds)];
      let verified = 0;
      let ideas = 0;
      for (const eventId of uniqueIds) {
        try {
          const processed = await this.processEvent(eventId);
          if (processed.verification?.verificationStatus === 'verified') verified += 1;
          if (processed.idea) ideas += 1;
        } catch (error) {
          errors.push({ eventId, error: error.message });
        }
      }

      if (options.runType === 'weekly_digest') {
        await this.prepareWeeklyDigest();
      }
      if (options.runType === 'ai_today') {
        await this.prepareAiToday();
      }

      const finished = await this.db.finishNewsroomRun(run.id, {
        status: errors.length ? 'completed_with_errors' : 'completed',
        signalsScanned: (radar.signals || []).length,
        eventsCreated: radar.created || 0,
        eventsMerged: radar.merged || 0,
        eventsVerified: verified,
        ideasCreated: ideas,
        errors,
        metrics: { ignored: radar.ignored || 0, processed: uniqueIds.length }
      });
      return { run: finished, radar };
    } catch (error) {
      errors.push({ error: error.message });
      const finished = await this.db.finishNewsroomRun(run.id, {
        status: 'failed',
        errors
      });
      this.logger.error('Newsroom cycle failed:', error);
      return { run: finished, error: error.message };
    } finally {
      this.activeCycle = null;
    }
  }

  async prepareAiToday() {
    const events = await this.db.listNewsEvents({ minScore: this.config.aiTodayThreshold, limit: 30 });
    for (const event of events) {
      if (event.content_route === 'breaking' || event.status === 'rejected') continue;
      if (Number(event.score) >= this.config.breakingThreshold) continue;
      await this.db.updateNewsEvent(event.id, {
        contentRoute: event.content_route || 'ai_today',
        urgency: 'same_day'
      });
    }
  }

  async prepareWeeklyDigest() {
    const events = await this.db.listNewsEvents({ minScore: this.config.watchlistThreshold, limit: 40 });
    const digestable = events.filter(event => ['watchlist', 'routed', 'idea_ready', 'discovered'].includes(event.status));
    if (!digestable.length) return null;
    const titles = digestable.slice(0, 8).map(event => event.title);
    const idea = await this.db.createContentIdea({
      topic: `AI tuần này: ${titles[0]}`.slice(0, 200),
      angle: 'Weekly AI Digest cho khán giả Việt Nam',
      style: 'list',
      status: 'backlog',
      rationale: titles.join(' | ').slice(0, 2000),
      source: 'ai_newsroom',
      contentRoute: 'weekly_digest',
      urgency: 'weekly',
      suggestedTitle: 'AI tuần này: những cập nhật cần biết',
      contentPillar: 'Weekly Digest / Explainers',
      targetAudience: this.config.channel.audience
    });
    return idea;
  }

  async getEventBundle(eventId) {
    const event = await this.db.getNewsEvent(eventId);
    if (!event) return null;
    const [sources, score, research, publications] = await Promise.all([
      this.db.getNewsEventSources(eventId),
      this.db.getNewsEventScore(eventId),
      this.db.getNewsResearch(eventId),
      this.db.listNewsEventPublications(eventId)
    ]);
    return { event, sources, score, research, publications };
  }

  async dashboardSummary() {
    const summary = await this.db.getNewsroomSummary();
    const events = await this.db.listNewsEvents({ limit: 40 });
    const runs = await this.db.listNewsroomRuns(10);
    return {
      enabled: this.config.enabled,
      ...summary,
      latestRun: runs[0] || summary.latestRun || null,
      runs,
      events,
      config: {
        breakingThreshold: this.config.breakingThreshold,
        aiTodayThreshold: this.config.aiTodayThreshold,
        standardThreshold: this.config.standardThreshold,
        autoCreateIdeas: this.config.autoCreateIdeas,
        requirePrimaryForBreaking: this.config.requirePrimaryForBreaking,
        scanIntervalMinutes: this.config.scanIntervalMinutes
      }
    };
  }
}

module.exports = { NewsroomService, AUTO_IDEA_ROUTES };
