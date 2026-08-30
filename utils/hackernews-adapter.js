const { fetchNewsResource } = require('./news-http');
const { looksLikeHttpUrl, normalizeNewsUrl } = require('./news-url');

const HN_ITEM_URL = id => `https://news.ycombinator.com/item?id=${id}`;

class HackerNewsAdapter {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs;
    this.userAgent = options.userAgent;
  }

  discussionUrl(id) {
    return HN_ITEM_URL(id);
  }

  normalizeItem(item) {
    if (!item || item.dead || item.deleted || !item.title) return null;
    const external = looksLikeHttpUrl(item.url) ? normalizeNewsUrl(item.url) : null;
    const discussion = HN_ITEM_URL(item.id);
    return {
      title: String(item.title).trim(),
      url: external || discussion,
      discussionUrl: discussion,
      summary: item.text ? String(item.text).slice(0, 2000) : '',
      publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
      hnItemId: item.id,
      hnScore: Number(item.score || 0),
      hnComments: Number(item.descendants || 0),
      author: item.by || null,
      communityOnly: !external,
      sourceTierHint: 4
    };
  }

  async fetchJson(url) {
    const response = await fetchNewsResource(url, {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      userAgent: this.userAgent,
      json: true,
      accept: 'application/json'
    });
    return { body: response.body, latencyMs: response.latencyMs };
  }

  async collect(source, options = {}) {
    const base = String(source.url || 'https://hacker-news.firebaseio.com/v0').replace(/\/$/, '');
    const lists = source.lists || ['topstories', 'newstories', 'beststories'];
    const maxItems = Math.max(1, Number(options.maxItems || source.maxItems || 40));
    const started = Date.now();
    const ids = [];
    const seen = new Set();

    for (const list of lists) {
      const payload = await this.fetchJson(`${base}/${list}.json`);
      for (const id of payload.body || []) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= maxItems) break;
      }
      if (ids.length >= maxItems) break;
    }

    const items = [];
    for (const id of ids) {
      const payload = await this.fetchJson(`${base}/item/${id}.json`);
      const normalized = this.normalizeItem(payload.body);
      if (normalized) items.push(normalized);
    }

    return {
      items,
      latencyMs: Date.now() - started
    };
  }
}

module.exports = { HackerNewsAdapter, HN_ITEM_URL };
