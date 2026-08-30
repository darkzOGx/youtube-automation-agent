const SCORE_VERSION = 'news-score-v1';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hoursSince(value) {
  if (!value) return Infinity;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return (Date.now() - date.getTime()) / 36e5;
}

class NewsScoreService {
  constructor(options = {}) {
    this.version = options.scoreVersion || SCORE_VERSION;
  }

  freshnessScore(event, sources = []) {
    const timestamps = [event.event_at, event.eventAt, ...sources.map(source => source.published_at || source.publishedAt)];
    const newestHours = Math.min(...timestamps.map(hoursSince));
    if (newestHours <= 6) return 20;
    if (newestHours <= 24) return 16;
    if (newestHours <= 72) return 12;
    if (newestHours <= 168) return 8;
    if (newestHours <= 336) return 4;
    return 0;
  }

  authorityScore(sources = []) {
    const bestTier = Math.min(...sources.map(source => Number(source.source_tier || source.sourceTier || 4)), 4);
    if (bestTier === 1) return 20;
    if (bestTier === 2) return 15;
    if (bestTier === 3) return 10;
    if (sources.length) return 5;
    return 0;
  }

  impactScore(event) {
    const type = String(event.event_type || event.eventType || '').toLowerCase();
    const haystack = `${event.title || ''} ${event.summary || ''}`.toLowerCase();
    let score = 6;
    if (['model_release', 'product_launch'].includes(type)) score += 10;
    if (type === 'pricing') score += 4;
    if (type === 'research') score += 3;
    if (/(gpt-\d|chatgpt|claude|gemini|llama|grok|available now|generally available|\bapi\b)/.test(haystack)) score += 4;
    if (/\b(shutdown|ban|outage|breach)\b/.test(haystack)) score += 5;
    return clamp(score, 0, 20);
  }

  trendScore(sources = []) {
    const independent = new Set(sources.map(source => source.publisher || source.normalized_url || source.url)).size;
    const hnScore = sources.reduce((sum, source) => sum + Number(source.hn_score || source.hnScore || 0), 0);
    const hnComments = sources.reduce((sum, source) => sum + Number(source.hn_comments || source.hnComments || 0), 0);
    let score = Math.min(8, independent >= 1 ? 5 + Math.max(0, independent - 1) * 3 : 0);
    if (hnScore >= 300 || hnComments >= 200) score += 7;
    else if (hnScore >= 100 || hnComments >= 50) score += 5;
    else if (hnScore >= 20) score += 2;
    return clamp(score, 0, 15);
  }

  audienceFitScore(event, channel = {}) {
    const haystack = `${event.title || ''} ${event.summary || ''} ${event.event_type || ''}`.toLowerCase();
    let score = 5;
    if (/(gpt-\d|chatgpt|claude|gemini|copilot|workflow|office|marketing|sales|tutorial|tool|\bapi\b)/.test(haystack)) score += 6;
    if (/\b(openai|anthropic|google|meta|hugging face)\b/.test(haystack)) score += 2;
    if ((channel.audience || '').toLowerCase().includes('việt') || (channel.language || '') === 'vi') score += 2;
    if (['tutorial', 'review', 'comparison', 'product_launch', 'model_release'].includes(String(event.event_type || event.eventType || ''))) score += 2;
    return clamp(score, 0, 15);
  }

  verificationScore(event, sources = []) {
    const primary = sources.filter(source => Number(source.source_tier || source.sourceTier) === 1 && source.discoveryOnly !== true).length;
    const secondary = sources.filter(source => Number(source.source_tier || source.sourceTier) === 2).length;
    const status = event.verification_status || event.verificationStatus;
    let score = 0;
    if (primary) score += 7;
    if (secondary) score += 2;
    if (status === 'verified') score += 3;
    if (status === 'conflicted') score = Math.min(score, 3);
    return clamp(score, 0, 10);
  }

  score(event = {}, sources = [], channel = {}) {
    const components = {
      freshness_score: this.freshnessScore(event, sources),
      authority_score: this.authorityScore(sources),
      impact_score: this.impactScore(event),
      trend_score: this.trendScore(sources),
      audience_fit_score: this.audienceFitScore(event, channel),
      verification_score: this.verificationScore(event, sources)
    };
    const total = Object.values(components).reduce((sum, value) => sum + value, 0);
    return {
      ...components,
      total_score: clamp(total, 0, 100),
      score_version: this.version
    };
  }
}

module.exports = { NewsScoreService, SCORE_VERSION };
