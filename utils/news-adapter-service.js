const { Logger } = require('./logger');
const { loadNewsroomConfig } = require('./newsroom-config');
const { NewsSourceService } = require('./news-source-service');
const { NewsFeedService } = require('./news-feed-service');
const { HtmlListingAdapter } = require('./html-listing-adapter');
const { HackerNewsAdapter } = require('./hackernews-adapter');
const { RedditAdapter } = require('./reddit-adapter');
const { GitHubNewsAdapter } = require('./github-news-adapter');
const { normalizeNewsUrl } = require('./news-url');

class NewsAdapterService {
  constructor(options = {}) {
    this.config = options.config || loadNewsroomConfig();
    this.sources = options.sourceService || new NewsSourceService(this.config);
    this.logger = options.logger || new Logger('NewsAdapters');
    this.fetchImpl = options.fetchImpl;
    const shared = {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.config.timeoutMs,
      userAgent: this.config.userAgent
    };
    this.feed = options.feedService || new NewsFeedService(shared);
    this.html = options.htmlAdapter || new HtmlListingAdapter({
      ...shared,
      maxCandidates: this.config.maxCandidatesPerSource
    });
    this.hackerNews = options.hackerNewsAdapter || new HackerNewsAdapter(shared);
    this.reddit = options.redditAdapter || new RedditAdapter();
    this.github = options.githubAdapter || new GitHubNewsAdapter();
  }

  decorateItem(item, source) {
    const url = normalizeNewsUrl(item.url);
    if (!url) return null;
    const classification = this.sources.classifyUrl(url, {
      sourceId: source.id,
      publisher: source.publisher,
      company: source.company
    });
    const discoveryOnly = source.discoveryOnly === true || item.discoveryOnly === true;
    return {
      title: item.title || url,
      url,
      discussionUrl: item.discussionUrl || null,
      summary: item.summary || '',
      publishedAt: item.publishedAt || null,
      publisher: classification.publisher,
      company: this.sources.extractCompany(`${item.title} ${item.summary}`, classification.company),
      product: this.sources.extractProduct(`${item.title} ${item.summary}`),
      eventType: this.sources.extractEventType(`${item.title} ${item.summary}`),
      sourceId: classification.sourceId || source.id,
      sourceTier: classification.tier,
      sourceType: classification.type,
      authority: classification.authority,
      adapter: source.adapter,
      discoveryOnly,
      hnItemId: item.hnItemId || null,
      hnScore: item.hnScore || 0,
      hnComments: item.hnComments || 0,
      author: item.author || null,
      communityOnly: item.communityOnly === true
    };
  }

  async collectSource(source, options = {}) {
    const started = Date.now();
    try {
      if (source.enabled === false) {
        return {
          sourceId: source.id,
          status: 'disabled',
          items: [],
          latencyMs: 0,
          error: source.disabledReason || 'disabled'
        };
      }

      let collected;
      if (source.adapter === 'rss') collected = await this.feed.fetchAndParse(source.url, options);
      else if (source.adapter === 'html') collected = await this.html.collect(source, options);
      else if (source.adapter === 'hackernews') collected = await this.hackerNews.collect(source, options);
      else if (source.adapter === 'reddit') collected = await this.reddit.collect(source);
      else if (source.adapter === 'github') collected = await this.github.collect(source);
      else throw new Error(`Unsupported adapter: ${source.adapter}`);

      const items = (collected.items || [])
        .map(item => this.decorateItem(item, source))
        .filter(Boolean);

      return {
        sourceId: source.id,
        publisher: source.publisher,
        adapter: source.adapter,
        status: collected.skipped ? 'skipped' : 'ok',
        items,
        latencyMs: collected.latencyMs || Date.now() - started,
        error: collected.reason || null
      };
    } catch (error) {
      this.logger.warn(`News adapter ${source.id} failed: ${error.message}`);
      return {
        sourceId: source.id,
        publisher: source.publisher,
        adapter: source.adapter,
        status: 'error',
        items: [],
        latencyMs: Date.now() - started,
        error: error.message
      };
    }
  }

  async collectAll(options = {}) {
    const sources = this.sources.listSources({ includeDisabled: true });
    const results = [];
    for (const source of sources) {
      results.push(await this.collectSource(source, options));
    }
    const signals = [];
    const seen = new Set();
    for (const result of results) {
      for (const item of result.items) {
        const key = `${result.sourceId}:${item.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        signals.push(item);
        if (signals.length >= (options.maxSignals || this.config.maxSignalsPerScan)) {
          return { results, signals };
        }
      }
    }
    return { results, signals };
  }
}

module.exports = { NewsAdapterService };
