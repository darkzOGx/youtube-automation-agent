const axios = require('axios');
const { StringDecoder } = require('string_decoder');
const { version } = require('../package.json');

const SERVER_URL = 'https://mcp.parallel.ai/mcp';
const USER_AGENT = `youtube-automation-agent/${version} (public-source-feed)`;
const PROTOCOL_VERSION = '2025-03-26';

// Only this read-only tool is called. Server instructions and other tools are ignored.
class ParallelSourceFeed {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 20000;
  }

  async search(topic) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': USER_AGENT
    };
    const request = async (method, params, id) => {
      const response = await axios.post(SERVER_URL, {
        jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(id ? { id } : {})
      }, {
        headers, maxRedirects: 0, signal: controller.signal,
        responseType: 'stream', validateStatus: () => true
      });
      if (response.status < 200 || response.status >= 300) {
        response.data.destroy();
        throw new Error(`Parallel source feed HTTP ${response.status}`);
      }
      const session = response.headers['mcp-session-id'];
      if (session) headers['Mcp-Session-Id'] = session;
      if (!id) {
        response.data.destroy();
        return;
      }
      const reply = await this.readReply(response, id);
      if (reply.error || !reply.result) throw new Error('Parallel source feed RPC error');
      return reply.result;
    };

    try {
      const initialized = await request('initialize', {
        protocolVersion: PROTOCOL_VERSION, capabilities: {},
        clientInfo: { name: 'youtube-automation-agent', version }
      }, 1);
      if (initialized.protocolVersion !== PROTOCOL_VERSION) throw new Error('Unsupported MCP protocol version');
      headers['MCP-Protocol-Version'] = PROTOCOL_VERSION;
      await request('notifications/initialized');
      const result = await request('tools/call', {
        name: 'web_search',
        arguments: {
          objective: `Find public documentation and primary sources for a video about: ${topic}`,
          search_queries: [topic]
        }
      }, 2);
      if (result.isError) throw new Error('Parallel source feed tool error');
      const data = result.structuredContent || JSON.parse(
        (result.content || []).find(item => item.type === 'text')?.text || '{}'
      );
      if (!Array.isArray(data.results)) throw new Error('Invalid Parallel source feed results');
      const sources = new Map();
      for (const item of data.results) {
        try {
          const url = new URL(item.url);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
          // Preserve the returned URL exactly for catalog membership and plan citations.
          if (typeof item.url !== 'string' || sources.has(item.url)) continue;
          sources.set(item.url, {
            url: item.url,
            title: String(item.title || item.url).slice(0, 300),
            publisher: url.hostname,
            sourceType: 'article',
            excerpt: (Array.isArray(item.excerpts) ? item.excerpts : []).map(String).join('\n').slice(0, 1000)
          });
          if (sources.size === 5) break;
        } catch (_error) { /* Ignore unusable source URLs. */ }
      }
      return [...sources.values()];
    } finally {
      clearTimeout(timeout);
    }
  }

  async readReply(response, id) {
    if (response.headers['content-type']?.includes('application/json')) {
      const chunks = [];
      for await (const chunk of response.data) chunks.push(chunk);
      const reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (reply.id !== id) throw new Error('Unexpected MCP response ID');
      return reply;
    }
    // Streamable HTTP can return SSE, including keepalives before the response.
    const decoder = new StringDecoder('utf8');
    let pending = '';
    for await (const chunk of response.data) {
      pending += decoder.write(Buffer.from(chunk)).replace(/\r/g, '');
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const event = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = event.split('\n').filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const reply = JSON.parse(data);
        if (reply.id === id) return reply;
      }
    }
    throw new Error('Missing MCP response');
  }
}

module.exports = { ParallelSourceFeed, USER_AGENT };
