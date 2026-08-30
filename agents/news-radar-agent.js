const { Logger } = require('../utils/logger');
const { NewsAdapterService } = require('../utils/news-adapter-service');
const { NewsDeduplicationService } = require('../utils/news-deduplication-service');
const { NewsSourceService } = require('../utils/news-source-service');
const { loadNewsroomConfig } = require('../utils/newsroom-config');

class NewsRadarAgent {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = options.logger || new Logger('NewsRadar');
    this.config = options.config || loadNewsroomConfig();
    this.sources = options.sourceService || new NewsSourceService(this.config);
    this.adapters = options.adapterService || new NewsAdapterService({
      config: this.config,
      sourceService: this.sources,
      logger: this.logger,
      fetchImpl: options.fetchImpl
    });
    this.dedup = options.dedup || new NewsDeduplicationService();
  }

  async initialize() {
    this.logger.info('Initializing News Radar Agent...');
    return true;
  }

  isRelevant(signal) {
    if (signal.sourceTier === 1 || signal.sourceTier === 2) {
      return this.sources.isAiRelevant(`${signal.title} ${signal.summary} ${signal.publisher}`)
        || Boolean(signal.company)
        || ['openai-news', 'anthropic-news', 'huggingface-blog', 'deepmind-blog', 'meta-ai-blog'].includes(signal.sourceId);
    }
    return this.sources.isAiRelevant(`${signal.title} ${signal.summary}`);
  }

  async persistHealth(results = []) {
    for (const result of results) {
      await this.db.upsertNewsSourceHealth({
        sourceId: result.sourceId,
        adapter: result.adapter,
        lastSuccessAt: result.status === 'ok' ? new Date().toISOString() : null,
        lastFailureAt: result.status === 'error' ? new Date().toISOString() : null,
        lastError: result.error || null,
        itemsCollected: (result.items || []).length,
        latencyMs: result.latencyMs,
        status: result.status
      });
    }
  }

  sourceRecord(signal) {
    const discussionOnly = signal.adapter === 'hackernews' && signal.communityOnly;
    const url = discussionOnly ? (signal.discussionUrl || signal.url) : signal.url;
    return {
      url,
      normalizedUrl: url,
      title: signal.title,
      publisher: signal.publisher,
      sourceTier: discussionOnly ? 4 : signal.sourceTier,
      sourceType: discussionOnly ? 'community' : signal.sourceType,
      sourceId: discussionOnly ? 'hacker-news' : signal.sourceId,
      adapter: signal.adapter,
      publishedAt: signal.publishedAt,
      discoveryOnly: signal.discoveryOnly,
      hnItemId: signal.hnItemId,
      hnScore: signal.hnScore,
      hnComments: signal.hnComments,
      notes: discussionOnly ? 'community_signal' : null
    };
  }

  extraCommunitySource(signal) {
    if (signal.adapter !== 'hackernews' || !signal.discussionUrl) return null;
    if (signal.discussionUrl === signal.url) return null;
    return {
      url: signal.discussionUrl,
      normalizedUrl: signal.discussionUrl,
      title: `HN: ${signal.title}`,
      publisher: 'Hacker News',
      sourceTier: 4,
      sourceType: 'community',
      sourceId: 'hacker-news',
      adapter: 'hackernews',
      publishedAt: signal.publishedAt,
      discoveryOnly: false,
      hnItemId: signal.hnItemId,
      hnScore: signal.hnScore,
      hnComments: signal.hnComments,
      notes: 'community_signal'
    };
  }

  async ingestSignal(signal, recentEvents) {
    if (!this.isRelevant(signal)) {
      return { classification: 'ignored', reason: 'not_ai_relevant' };
    }

    const withSources = await Promise.all(recentEvents.map(async event => ({
      ...event,
      sources: event.sources || await this.db.getNewsEventSources(event.id)
    })));
    const match = this.dedup.classifyAgainst(signal, withSources);
    const source = this.sourceRecord(signal);
    const extra = this.extraCommunitySource(signal);

    if (match.classification === 'exact' || match.classification === 'auto_merge') {
      await this.db.addNewsEventSource(match.event.id, source);
      if (extra) await this.db.addNewsEventSource(match.event.id, extra);
      if (!match.event.company && signal.company) {
        await this.db.updateNewsEvent(match.event.id, { company: signal.company, product: signal.product });
      }
      return { classification: match.classification, event: await this.db.getNewsEvent(match.event.id), score: match.score };
    }

    const created = await this.db.createNewsEvent({
      canonicalKey: match.canonicalKey,
      title: signal.title,
      summary: signal.summary,
      company: signal.company,
      product: signal.product,
      eventType: signal.eventType,
      eventAt: signal.publishedAt,
      status: 'discovered',
      verificationStatus: 'discovered',
      relatedEventId: match.classification === 'probable' ? match.event?.id : null
    });
    await this.db.addNewsEventSource(created.id, source);
    if (extra) await this.db.addNewsEventSource(created.id, extra);
    recentEvents.unshift(created);
    return { classification: match.classification, event: created, score: match.score };
  }

  async collect(options = {}) {
    const { results, signals } = await this.adapters.collectAll({
      maxSignals: options.maxSignals || this.config.maxSignalsPerScan
    });
    await this.persistHealth(results);
    const recent = await this.db.listRecentNewsEvents(options.lookbackHours || 240);
    const outcomes = [];
    for (const signal of signals) {
      outcomes.push(await this.ingestSignal(signal, recent));
    }
    return {
      results,
      signals,
      outcomes,
      created: outcomes.filter(item => item.classification === 'new' || item.classification === 'probable').length,
      merged: outcomes.filter(item => item.classification === 'exact' || item.classification === 'auto_merge').length,
      ignored: outcomes.filter(item => item.classification === 'ignored').length,
      errors: results.filter(item => item.status === 'error').map(item => ({
        sourceId: item.sourceId,
        error: item.error
      }))
    };
  }
}

module.exports = { NewsRadarAgent };
