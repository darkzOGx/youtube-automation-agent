// gemini-service.js
// A small, reusable helper that lets the rest of the project talk to
// Google's Gemini AI models using the official @google/genai SDK.
//
// Think of this file as a "translator": you give it plain text (a prompt),
// it sends that to Google, and hands you back Gemini's reply as plain text.

const { Logger } = require('./logger');

class GeminiService {
  constructor(credentials = {}) {
    this.logger = new Logger('GeminiService');

    // Where does the API key come from?
    //  1) config/credentials.json  (saved by the setup wizard), OR
    //  2) the GEMINI_API_KEY value in your .env file
    this.apiKey = credentials.gemini?.apiKey || process.env.GEMINI_API_KEY;

    // Which Gemini model to use. "Flash" models are the fast, free-tier ones.
    // You can override this in .env with GEMINI_MODEL=...
    this.model = credentials.gemini?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    // We create the actual connection lazily (only when first needed).
    this.client = null;
  }

  // Returns true only if we actually have an API key to use.
  isConfigured() {
    return Boolean(this.apiKey);
  }

  // Builds (once) and returns the Gemini client object.
  async getClient() {
    if (this.client) return this.client;

    if (!this.isConfigured()) {
      throw new Error('No Gemini API key found. Add GEMINI_API_KEY to your .env file.');
    }

    // We use a dynamic import() here instead of require() because the modern
    // @google/genai SDK is an ES module. import() works safely inside this
    // CommonJS project.
    const { GoogleGenAI } = await import('@google/genai');
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }

  // Send a text prompt to Gemini and get the text answer back.
  async generateText(prompt) {
    const ai = await this.getClient();

    const response = await ai.models.generateContent({
      model: this.model,
      contents: prompt
    });

    // In the new SDK, response.text is a property that holds the reply text.
    return response.text;
  }

  // Ask Gemini for JSON and hand back a real JavaScript object.
  // Returns null if the reply can't be understood as JSON.
  async generateJson(prompt) {
    const raw = await this.generateText(prompt);
    return GeminiService.parseJson(raw);
  }

  // Pulls a JSON object out of a text reply. AI models often wrap JSON in
  // ```json ... ``` code fences, so we grab everything between the first "{"
  // and the last "}" and parse that.
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

  // A tiny "are we connected?" check used by test-gemini.js.
  async testConnection() {
    this.logger.info(`Testing Gemini connection (model: ${this.model})...`);
    return this.generateText('Reply with exactly these three words: GEMINI CONNECTION OK');
  }
}

module.exports = { GeminiService };
