const crypto = require('crypto');

/**
 * Shared security helpers used across the application.
 * - HTML/XML escaping to prevent injection into dashboards and SVG documents
 * - SSRF-safe URL validation for outbound downloads
 * - Constant-time API-token middleware + Origin/CSRF check for mutating routes
 */

// Escape a value for safe inclusion in HTML text/attribute contexts.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape a value for safe inclusion inside an SVG/XML text node.
function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Block obvious SSRF targets: only http(s), no credentials, no private/loopback/link-local hosts.
function isSafePublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();

  // Reject localhost and the cloud-metadata endpoint outright.
  if (host === 'localhost' || host.endsWith('.localhost') || host === '169.254.169.254') {
    return false;
  }

  // Reject literal private / loopback / link-local IPv4 and IPv6 addresses.
  const privateV4 = [
    /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./, /^0\./,
  ];
  if (privateV4.some((re) => re.test(host))) return false;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return false;
  }

  return true;
}

// Constant-time string comparison that never throws on length mismatch.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Express middleware factory enforcing a bearer / x-api-token on mutating routes.
 * The token is resolved lazily so it works whether it is set before or after
 * the middleware is created (the server generates one at boot if none is configured).
 */
function requireApiToken(getToken) {
  return function (req, res, next) {
    const expected = typeof getToken === 'function' ? getToken() : getToken;
    if (!expected) {
      // Fail closed: if no token is configured we refuse mutating actions.
      return res.status(503).json({ error: 'Server auth token not configured' });
    }

    const header = req.headers['authorization'] || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const provided = bearer || req.headers['x-api-token'] || req.query.token || '';

    if (!safeEqual(provided, expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  };
}

/**
 * Express middleware: reject cross-origin browser requests on mutating routes.
 * If an Origin/Referer header is present it must resolve to an allowed host.
 * Same-origin and non-browser (no Origin) callers with a valid token pass.
 */
function sameOriginOnly(allowedHostsGetter) {
  return function (req, res, next) {
    const origin = req.headers.origin || req.headers.referer;
    if (!origin) return next(); // CLI / server-to-server callers send no Origin.

    let host;
    try {
      host = new URL(origin).host;
    } catch {
      return res.status(403).json({ error: 'Invalid Origin' });
    }

    const allowed = new Set([
      `127.0.0.1:${req.socket.localPort}`,
      `localhost:${req.socket.localPort}`,
      req.headers.host,
      ...(typeof allowedHostsGetter === 'function' ? allowedHostsGetter() : []),
    ].filter(Boolean));

    if (!allowed.has(host)) {
      return res.status(403).json({ error: 'Cross-origin request blocked' });
    }
    return next();
  };
}

module.exports = {
  escapeHtml,
  escapeXml,
  isSafePublicUrl,
  safeEqual,
  requireApiToken,
  sameOriginOnly,
};
