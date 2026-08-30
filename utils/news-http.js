const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_USER_AGENT = 'AgentTube-Newsroom/2.10 (+https://github.com/ronivuong/youtube-automation-agent)';

async function fetchNewsResource(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;
  const fetchImpl = options.fetchImpl || fetch;
  const headers = {
    'User-Agent': userAgent,
    Accept: options.accept || 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.9, */*;q=0.8',
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} from ${url}`);
      error.status = response.status;
      error.latencyMs = latencyMs;
      throw error;
    }
    const contentType = response.headers?.get ? response.headers.get('content-type') : '';
    let body;
    if (options.json || /json/i.test(contentType || '')) {
      body = await response.json();
    } else {
      body = await response.text();
    }
    return {
      url,
      finalUrl: response.url || url,
      status: response.status,
      contentType,
      body,
      latencyMs
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new Error(`Timed out after ${timeoutMs}ms: ${url}`);
      timeout.code = 'NEWS_TIMEOUT';
      timeout.latencyMs = timeoutMs;
      throw timeout;
    }
    error.latencyMs = error.latencyMs || Date.now() - started;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  fetchNewsResource
};
