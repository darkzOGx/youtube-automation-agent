const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Logger } = require('./logger');

/**
 * Text-generation client shared by the agents.
 *
 * Providers are tried in order until one returns text:
 *   1. The OpenAI-compatible router in LLM_BASE_URL / LLM_MODEL (same setup Hermes uses)
 *   2. Each model in LLM_FALLBACK_MODELS on that same router, then any
 *      `llm.fallbacks` entries in config/credentials.json (other endpoints)
 *   3. Google Gemini, when a Gemini API key is configured
 *
 * Config can come from config/credentials.json (`llm: { baseUrl, apiKey, model, fallbacks: [...] }`)
 * or from the environment; credentials.json wins when both are set.
 */
class LLMClient {
  constructor(credentials = {}) {
    this.logger = new Logger('LLMClient');
    const raw = credentials.credentials || credentials || {};
    const cfg = raw.llm || {};
    this.providers = [];

    const baseURL = cfg.baseUrl || process.env.LLM_BASE_URL;
    const apiKey = cfg.apiKey || process.env.LLM_API_KEY;
    const model = cfg.model || process.env.LLM_MODEL;

    if (baseURL && model) {
      this.addOpenAICompatible('primary', baseURL, apiKey, model);

      const fallbackModels = (process.env.LLM_FALLBACK_MODELS || '')
        .split(',')
        .map(m => m.trim())
        .filter(Boolean);
      fallbackModels.forEach((m, i) => this.addOpenAICompatible(`fallback-${i + 1}`, baseURL, apiKey, m));
    }

    // Second router (e.g. 9router), configured from the environment
    const fbBaseURL = process.env.LLM_FALLBACK_BASE_URL;
    const fbApiKey = process.env.LLM_FALLBACK_API_KEY;
    (process.env.LLM_FALLBACK_ENDPOINT_MODELS || '')
      .split(',')
      .map(m => m.trim())
      .filter(Boolean)
      .forEach((m, i) => fbBaseURL && this.addOpenAICompatible(`router2-${i + 1}`, fbBaseURL, fbApiKey, m));

    (cfg.fallbacks || []).forEach((fb, i) => {
      if (fb.baseUrl && fb.model) {
        this.addOpenAICompatible(fb.name || `extra-fallback-${i + 1}`, fb.baseUrl, fb.apiKey, fb.model);
      }
    });

    const geminiKey = raw.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      this.providers.push({
        type: 'gemini',
        name: 'gemini',
        model: process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
        client: new GoogleGenerativeAI(geminiKey)
      });
    }

    if (this.providers.length === 0) {
      this.logger.warn('No LLM provider configured (set LLM_BASE_URL + LLM_MODEL, or GEMINI_API_KEY)');
    } else {
      this.logger.info(`LLM providers: ${this.describe()}`);
    }
  }

  addOpenAICompatible(name, baseURL, apiKey, model) {
    this.providers.push({
      type: 'openai',
      name,
      model,
      client: new OpenAI({
        baseURL,
        apiKey: apiKey || 'not-needed',
        timeout: 180000,
        maxRetries: 1
      })
    });
  }

  isAvailable() {
    return this.providers.length > 0;
  }

  describe() {
    return this.providers.map(p => `${p.name}:${p.model}`).join(' -> ');
  }

  /**
   * Generate text. With `json: true` the provider is asked for a JSON object
   * (callers still parse the returned string).
   */
  async generate({ system, prompt, json = false }) {
    if (!this.isAvailable()) {
      throw new Error('No LLM provider configured');
    }

    let lastError = null;
    for (const provider of this.providers) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          this.logger.info(`LLM request via ${provider.name} (${provider.model}), attempt ${attempt}`);
          const text = provider.type === 'gemini'
            ? await this.callGemini(provider, system, prompt, json)
            : await this.callOpenAICompatible(provider, system, prompt, json);

          const cleaned = this.stripReasoning(text);
          if (!cleaned) throw new Error('Empty response');
          return cleaned;
        } catch (error) {
          lastError = error;
          const status = error.status || error.response?.status;
          const retryable = status === 429 || (status >= 500 && status < 600);
          this.logger.warn(`LLM ${provider.name} failed (${status || 'no status'}): ${error.message}`);
          if (retryable && attempt === 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          break;
        }
      }
    }
    throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
  }

  async callOpenAICompatible(provider, system, prompt, json) {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const request = { model: provider.model, messages };
    if (json) request.response_format = { type: 'json_object' };

    let response;
    try {
      response = await provider.client.chat.completions.create(request);
    } catch (error) {
      // Some routed models reject response_format; retry once without it.
      if (json && error.status === 400) {
        delete request.response_format;
        response = await provider.client.chat.completions.create(request);
      } else {
        throw error;
      }
    }
    return response.choices?.[0]?.message?.content || '';
  }

  async callGemini(provider, system, prompt, json) {
    const model = provider.client.getGenerativeModel({
      model: provider.model,
      ...(system && { systemInstruction: system }),
      ...(json && { generationConfig: { responseMimeType: 'application/json' } })
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  stripReasoning(text) {
    return (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
}

module.exports = { LLMClient };
