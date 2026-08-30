const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid']);

function looksLikeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed);
}

function hostnameOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_error) {
    return '';
  }
}

function stripWww(hostname) {
  return String(hostname || '').replace(/^www\./i, '').toLowerCase();
}

function normalizeNewsUrl(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) {
    parsed.username = '';
    parsed.password = '';
  }

  parsed.hash = '';
  parsed.hostname = stripWww(parsed.hostname);

  const toDelete = [];
  for (const key of parsed.searchParams.keys()) {
    if (/^utm_/i.test(key) || TRACKING_PARAMS.has(key.toLowerCase())) {
      toDelete.push(key);
    }
  }
  toDelete.forEach(key => parsed.searchParams.delete(key));

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed.toString();
}

function sameHostname(urlA, urlB) {
  const a = hostnameOf(urlA);
  const b = hostnameOf(urlB);
  return Boolean(a && b && a === b);
}

function pathStartsWith(url, prefix) {
  if (!prefix) return true;
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '') || '/';
    const allowed = String(prefix).replace(/\/+$/, '') || '/';
    return pathname === allowed || pathname.startsWith(`${allowed}/`);
  } catch (_error) {
    return false;
  }
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .trim();
}

function stripHtml(value) {
  return decodeXmlEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  TRACKING_PARAMS,
  looksLikeHttpUrl,
  hostnameOf,
  stripWww,
  normalizeNewsUrl,
  sameHostname,
  pathStartsWith,
  decodeXmlEntities,
  stripHtml
};
