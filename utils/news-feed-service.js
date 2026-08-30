const { decodeXmlEntities, looksLikeHttpUrl, normalizeNewsUrl, stripHtml } = require('./news-url');
const { fetchNewsResource } = require('./news-http');

function firstMatch(block, patterns) {
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match && match[1]) return decodeXmlEntities(match[1]);
  }
  return '';
}

function tagText(block, names) {
  for (const name of names) {
    const cdata = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${name}>`, 'i'));
    if (cdata) return decodeXmlEntities(cdata[1]);
    const simple = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
    if (simple) return decodeXmlEntities(simple[1]);
  }
  return '';
}

function atomHref(block) {
  return firstMatch(block, [
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i
  ]);
}

function rssLink(block) {
  const tagged = tagText(block, ['link']);
  if (looksLikeHttpUrl(tagged)) return tagged;
  const href = atomHref(block);
  if (looksLikeHttpUrl(href)) return href;
  return '';
}

function guidUrl(block) {
  const guid = tagText(block, ['guid', 'id']);
  return looksLikeHttpUrl(guid) ? guid : '';
}

function extractItemUrl(block) {
  return rssLink(block) || guidUrl(block) || '';
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function collectBlocks(xml, tagName) {
  const blocks = [];
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?</${tagName}>`, 'gi');
  let match = pattern.exec(xml);
  while (match) {
    blocks.push(match[0]);
    match = pattern.exec(xml);
  }
  return blocks;
}

function parseFeedXml(xml, options = {}) {
  const document = String(xml || '');
  const items = [
    ...collectBlocks(document, 'item'),
    ...collectBlocks(document, 'entry')
  ];
  const limit = options.limit || 100;
  const parsed = [];
  const seen = new Set();

  for (const block of items) {
    if (parsed.length >= limit) break;
    const title = stripHtml(tagText(block, ['title']));
    const url = normalizeNewsUrl(extractItemUrl(block));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    parsed.push({
      title: title || url,
      url,
      summary: stripHtml(tagText(block, ['description', 'summary', 'content', 'content:encoded'])).slice(0, 2000),
      publishedAt: parseDate(tagText(block, ['pubDate', 'published', 'updated', 'dc:date']))
    });
  }

  return parsed;
}

class NewsFeedService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs;
    this.userAgent = options.userAgent;
  }

  parse(xml, options = {}) {
    return parseFeedXml(xml, options);
  }

  async fetchAndParse(url, options = {}) {
    const response = await fetchNewsResource(url, {
      fetchImpl: this.fetchImpl,
      timeoutMs: options.timeoutMs || this.timeoutMs,
      userAgent: options.userAgent || this.userAgent
    });
    return {
      items: this.parse(response.body, options),
      latencyMs: response.latencyMs,
      finalUrl: response.finalUrl
    };
  }
}

module.exports = {
  NewsFeedService,
  parseFeedXml,
  extractItemUrl,
  guidUrl,
  rssLink
};
