const { fetchNewsResource } = require('./news-http');
const {
  decodeXmlEntities,
  hostnameOf,
  normalizeNewsUrl,
  pathStartsWith,
  sameHostname,
  stripHtml
} = require('./news-url');

function extractAnchors(html) {
  const anchors = [];
  const pattern = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = pattern.exec(html);
  while (match) {
    anchors.push({
      href: decodeXmlEntities(match[1]),
      title: stripHtml(match[2]).slice(0, 300)
    });
    match = pattern.exec(html);
  }
  return anchors;
}

class HtmlListingAdapter {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs;
    this.userAgent = options.userAgent;
    this.maxCandidates = options.maxCandidates || 100;
  }

  collectFromHtml(html, source) {
    const listingUrl = source.url;
    const seen = new Set();
    const items = [];
    for (const anchor of extractAnchors(html)) {
      if (items.length >= (source.maxCandidates || this.maxCandidates)) break;
      let absolute;
      try {
        absolute = new URL(anchor.href, listingUrl).toString();
      } catch (_error) {
        continue;
      }
      const normalized = normalizeNewsUrl(absolute);
      if (!normalized || seen.has(normalized)) continue;
      if (!sameHostname(normalized, listingUrl) && !(source.hosts || []).includes(hostnameOf(normalized))) continue;
      if (source.allowedPathPrefix && !pathStartsWith(normalized, source.allowedPathPrefix)) continue;
      seen.add(normalized);
      items.push({
        title: anchor.title || normalized,
        url: normalized,
        summary: '',
        publishedAt: null,
        discoveryOnly: true
      });
    }
    return items;
  }

  async collect(source, options = {}) {
    const response = await fetchNewsResource(source.url, {
      fetchImpl: this.fetchImpl,
      timeoutMs: options.timeoutMs || this.timeoutMs,
      userAgent: options.userAgent || this.userAgent,
      accept: 'text/html,application/xhtml+xml'
    });
    return {
      items: this.collectFromHtml(response.body, source),
      latencyMs: response.latencyMs,
      finalUrl: response.finalUrl
    };
  }
}

module.exports = { HtmlListingAdapter, extractAnchors };
