const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'is', 'are',
  'new', 'launches', 'launch', 'announces', 'announce', 'introduces', 'available',
  'now', 'its', 'from', 'into', 'about'
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !STOPWORDS.has(token));
}

function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / new Set([...left, ...right]).size;
}

function dayKey(value) {
  if (!value) return 'unknown-day';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown-day';
  return date.toISOString().slice(0, 10);
}

function slugTitle(tokens) {
  return tokens.slice(0, 8).join('-') || 'untitled';
}

class NewsDeduplicationService {
  constructor(options = {}) {
    this.autoMergeThreshold = options.autoMergeThreshold ?? 0.72;
    this.probableThreshold = options.probableThreshold ?? 0.48;
  }

  canonicalKey(input = {}) {
    const company = String(input.company || 'unknown').toLowerCase().replace(/\s+/g, '-');
    const product = String(input.product || 'na').toLowerCase().replace(/\s+/g, '-');
    const eventType = String(input.eventType || 'other').toLowerCase();
    const day = dayKey(input.eventAt || input.publishedAt);
    const titleSlug = slugTitle(tokenize(input.title));
    return `${company}|${product}|${eventType}|${day}|${titleSlug}`;
  }

  similarity(left, right) {
    return jaccard(tokenize(left?.title), tokenize(right?.title));
  }

  sameEventWindow(left, right) {
    const a = dayKey(left.eventAt || left.publishedAt);
    const b = dayKey(right.eventAt || right.publishedAt);
    if (a === 'unknown-day' || b === 'unknown-day') return true;
    const delta = Math.abs(new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`));
    return delta <= 48 * 60 * 60 * 1000;
  }

  classifyAgainst(signal, events = []) {
    const signalKey = this.canonicalKey(signal);
    for (const event of events) {
      const eventUrls = new Set((event.sources || []).map(source => source.normalized_url || source.normalizedUrl).filter(Boolean));
      if (eventUrls.has(signal.url) || event.canonical_key === signalKey) {
        return { classification: 'exact', event, score: 1, canonicalKey: signalKey };
      }
    }

    let best = { classification: 'new', event: null, score: 0, canonicalKey: signalKey };
    for (const event of events) {
      if (signal.company && event.company && signal.company !== event.company) continue;
      if (!this.sameEventWindow(signal, event)) continue;
      const score = this.similarity(signal, event);
      const sameLaunch = Boolean(signal.company && event.company && signal.company === event.company)
        && Boolean(signal.product && event.product && String(signal.product).toLowerCase() === String(event.product).toLowerCase())
        && Boolean(signal.eventType && event.event_type && signal.eventType === event.event_type);
      if ((score >= this.autoMergeThreshold || (sameLaunch && score >= this.probableThreshold)) && score >= best.score) {
        best = { classification: 'auto_merge', event, score, canonicalKey: event.canonical_key || signalKey };
      } else if (score >= this.probableThreshold && score > best.score && best.classification !== 'auto_merge' && best.classification !== 'exact') {
        best = { classification: 'probable', event, score, canonicalKey: signalKey };
      }
    }
    return best;
  }
}

module.exports = { NewsDeduplicationService, tokenize, jaccard };
