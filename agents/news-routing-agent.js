const { Logger } = require('../utils/logger');
const { loadNewsroomConfig } = require('../utils/newsroom-config');

const FORMAT_BY_ROUTE = {
  breaking: 'explainer',
  ai_today: 'explainer',
  tutorial: 'tutorial',
  review: 'review',
  comparison: 'review',
  weekly_digest: 'list',
  watchlist: 'explainer',
  ignore: 'explainer'
};

const LENGTH_BY_ROUTE = {
  breaking: 'short',
  ai_today: 'medium',
  tutorial: 'medium',
  review: 'medium',
  comparison: 'medium',
  weekly_digest: 'long',
  watchlist: 'short',
  ignore: 'short'
};

class NewsRoutingAgent {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('NewsRouting');
    this.config = options.config || loadNewsroomConfig();
  }

  async initialize() {
    this.logger.info('Initializing News Routing Agent...');
    return true;
  }

  hasVerifiedPrimary(sources = []) {
    return sources.some(source => Number(source.source_tier) === 1 && !source.discovery_only);
  }

  routeEvent(event, sources = [], research = {}) {
    const score = Number(event.score || 0);
    const eventType = String(event.event_type || '').toLowerCase();
    const pack = research.package || research;
    const verifiedPrimary = this.hasVerifiedPrimary(sources);
    const requirePrimary = this.config.requirePrimaryForBreaking !== false;
    let route = 'ignore';
    let reason = 'Score below the watchlist threshold.';

    if (score >= this.config.breakingThreshold) {
      if (verifiedPrimary || !requirePrimary) {
        route = 'breaking';
        reason = 'High score with verified primary source.';
      } else {
        route = score >= this.config.aiTodayThreshold ? 'ai_today' : 'watchlist';
        reason = 'Score is Breaking-level but community/media evidence is not enough without a verified primary source.';
      }
    } else if (score >= this.config.aiTodayThreshold) {
      route = 'ai_today';
      reason = 'Same-day / high-priority AI news.';
    } else if (score >= this.config.standardThreshold) {
      route = 'ai_today';
      reason = 'Standard news opportunity.';
    } else if (score >= this.config.watchlistThreshold) {
      route = 'watchlist';
      reason = 'Relevant but not ready to produce.';
    }

    if (route !== 'ignore' && route !== 'breaking') {
      if (pack.comparisonOpportunity || eventType === 'comparison') {
        route = 'comparison';
        reason = 'Comparison angle is stronger than a straight news hit.';
      } else if (pack.tutorialOpportunity || eventType === 'tutorial') {
        route = 'tutorial';
        reason = 'Practical workflow/tutorial opportunity.';
      } else if (eventType === 'review') {
        route = 'review';
        reason = 'Tool/review evidence is sufficient for a hands-on video.';
      }
    }

    if (event.verification_status === 'conflicted' && route === 'breaking') {
      route = 'watchlist';
      reason = 'Material source conflicts block Breaking until a human reviews them.';
    }

    const titleAngles = pack.suggestedAngles || [event.title];
    return {
      route,
      urgency: route === 'breaking' ? 'immediate' : route === 'ai_today' ? 'same_day' : route === 'watchlist' ? 'hold' : 'normal',
      recommendedLength: LENGTH_BY_ROUTE[route],
      recommendedFormat: FORMAT_BY_ROUTE[route],
      recommendedPublishWindow: route === 'breaking' ? 'as_soon_as_approved' : route === 'ai_today' ? 'today' : 'planned',
      reason,
      titleAngles,
      thumbnailAngles: titleAngles.slice(0, 3),
      verifiedPrimary,
      pillar: this.pillarFor(route)
    };
  }

  pillarFor(route) {
    if (route === 'tutorial') return 'AI Tutorials';
    if (route === 'review') return 'AI Tools / Reviews';
    if (route === 'comparison') return 'AI Comparisons';
    if (route === 'weekly_digest') return 'Weekly Digest / Explainers';
    return 'AI News';
  }
}

module.exports = { NewsRoutingAgent, FORMAT_BY_ROUTE, LENGTH_BY_ROUTE };
