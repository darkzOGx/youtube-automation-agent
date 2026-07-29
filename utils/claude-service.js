// claude-service.js
// A small, reusable helper that lets the project talk to Anthropic's Claude
// models using the official @anthropic-ai/sdk. It has the SAME shape as
// gemini-service.js (isConfigured / generateText / generateJson), so any agent
// can use Claude or Gemini interchangeably.

const { Logger } = require('./logger');

class ClaudeService {
  constructor(credentials = {}) {
    this.logger = new Logger('ClaudeService');

    // API key: from config/credentials.json first, then the .env file.
    this.apiKey = credentials.claude?.apiKey
      || credentials.anthropic?.apiKey
      || process.env.ANTHROPIC_API_KEY;

    // Which Claude model to use. claude-opus-5 is the most capable;
    // claude-haiku-4-5 is far cheaper. Override with CLAUDE_MODEL in .env.
    this.model = credentials.claude?.model
      || process.env.CLAUDE_MODEL
      || 'claude-opus-5';

    this.client = null;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async getClient() {
    if (this.client) return this.client;

    if (!this.isConfigured()) {
      throw new Error('No Anthropic API key found. Add ANTHROPIC_API_KEY to your .env file.');
    }

    // Dynamic import() works inside this CommonJS project and loads the SDK
    // only when it's actually needed.
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    this.client = new Anthropic({ apiKey: this.apiKey });
    return this.client;
  }

  // Send a text prompt to Claude and get the text answer back.
  async generateText(prompt) {
    const client = await this.getClient();

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    // Claude can decline a request for safety reasons; treat that as a failure
    // so the caller falls back to its own logic.
    if (response.stop_reason === 'refusal') {
      throw new Error('Claude declined to answer this request.');
    }

    // response.content is a list of blocks; keep only the text ones and join them.
    return (response.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  // Ask Claude for JSON and hand back a real JavaScript object (or null).
  async generateJson(prompt) {
    const raw = await this.generateText(prompt);
    return ClaudeService.parseJson(raw);
  }

  // Pull a JSON object out of a text reply (handles ```json ... ``` fences).
  static parseJson(text) {
    if (!text) return null;
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
      return null;
    }
  }
}

module.exports = { ClaudeService };
