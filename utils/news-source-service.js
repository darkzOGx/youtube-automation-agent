const { loadNewsroomConfig } = require('./newsroom-config');
const { hostnameOf, stripWww } = require('./news-url');

const TIER_LABELS = {
  1: 'primary_official',
  2: 'developer_technical',
  3: 'reputable_media',
  4: 'community'
};

class NewsSourceService {
  constructor(config = null) {
    this.config = config || loadNewsroomConfig();
    this.sources = this.config.sources || [];
    this.companies = this.config.companies || [];
    this.mediaDomains = new Set((this.config.mediaDomains || []).map(stripWww));
    this.hostIndex = this.buildHostIndex();
  }

  buildHostIndex() {
    const index = new Map();
    for (const source of this.sources) {
      for (const host of source.hosts || []) {
        index.set(stripWww(host), source);
      }
    }
    return index;
  }

  listSources({ includeDisabled = false } = {}) {
    return this.sources.filter(source => includeDisabled || source.enabled !== false);
  }

  getSource(id) {
    return this.sources.find(source => source.id === id) || null;
  }

  classifyUrl(url, hint = {}) {
    const host = hostnameOf(url);
    const configured = this.hostIndex.get(host);
    if (configured) {
      return {
        domain: host,
        publisher: configured.publisher,
        company: configured.company,
        tier: Number(configured.tier),
        type: configured.type,
        authority: Number(configured.authority || 0),
        sourceId: configured.id,
        discoveryOnly: configured.discoveryOnly === true
      };
    }

    if (this.mediaDomains.has(host)) {
      return {
        domain: host,
        publisher: hint.publisher || host,
        company: hint.company || null,
        tier: 3,
        type: 'reputable_media',
        authority: 70,
        sourceId: null,
        discoveryOnly: false
      };
    }

    if (host === 'news.ycombinator.com' || host === 'ycombinator.com') {
      return {
        domain: host,
        publisher: 'Hacker News',
        company: null,
        tier: 4,
        type: 'community',
        authority: 40,
        sourceId: 'hacker-news',
        discoveryOnly: false
      };
    }

    return {
      domain: host,
      publisher: hint.publisher || host || 'unknown',
      company: hint.company || null,
      tier: 4,
      type: hint.type || 'unverified',
      authority: 15,
      sourceId: hint.sourceId || null,
      discoveryOnly: hint.discoveryOnly === true
    };
  }

  extractCompany(text, fallback = null) {
    const haystack = String(text || '').toLowerCase();
    for (const company of this.companies) {
      if ((company.aliases || []).some(alias => haystack.includes(String(alias).toLowerCase()))) {
        return company.name;
      }
    }
    return fallback;
  }

  extractProduct(text) {
    const value = String(text || '');
    const match = value.match(/\b(GPT-?\d(?:\.\d)?[A-Za-z-]{0,12}|Claude(?:\s+\d(?:\.\d)?)?[A-Za-z-]{0,16}|Gemini(?:\s+\d(?:\.\d)?)?[A-Za-z-]{0,16}|Llama[-\s]?\d[A-Za-z0-9.-]{0,12}|Grok[-\s]?\d{0,2}|ChatGPT|Sora(?:\s+\d)?)\b/i);
    return match ? match[0].replace(/\s+/g, ' ').trim() : null;
  }

  extractEventType(text) {
    const haystack = String(text || '').toLowerCase();
    if (/\b(vs|versus|compared|comparison|benchmark)\b/.test(haystack)) return 'comparison';
    if (/\b(how to|tutorial|guide|walkthrough|playbook)\b/.test(haystack)) return 'tutorial';
    if (/\b(review|hands-on)\b/.test(haystack)) return 'review';
    if (/\b(price|pricing|free|subscription|plan)\b/.test(haystack)) return 'pricing';
    if (/\b(paper|research|study|arxiv)\b/.test(haystack)) return 'research';
    if (/\b(partner|acquisition|acquire|funding)\b/.test(haystack)) return 'business';
    if (/\b(api|sdk|release notes|changelog|launches|released|announc|introduc|available|preview)\b/.test(haystack)) {
      return /\b(model|gpt|claude|gemini|llama|grok)\b/.test(haystack) ? 'model_release' : 'product_launch';
    }
    if (/\b(model|llm|gpt|claude|gemini)\b/.test(haystack)) return 'model_release';
    return 'other';
  }

  isAiRelevant(text) {
    const haystack = String(text || '').toLowerCase();
    if (!haystack.trim()) return false;
    return (this.config.aiKeywords || []).some(keyword => haystack.includes(String(keyword).toLowerCase()));
  }

  tierLabel(tier) {
    return TIER_LABELS[Number(tier)] || 'community';
  }
}

module.exports = { NewsSourceService, TIER_LABELS };
