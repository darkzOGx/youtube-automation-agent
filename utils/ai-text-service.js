const OpenAI = require('openai');
const { Logger } = require('./logger');

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-4-argon',
  'gemini-3.5-flash-lite',
];
const GEMINI_DEFAULT_MODEL = GEMINI_MODELS[0];
// Floor for the single retry after a thinking model exhausts a small budget.
const GEMINI_THINKING_RETRY_MIN_TOKENS = 1024;
// Lighter models tried, in order, when the configured model stays overloaded.
// Override with GEMINI_FALLBACK_MODELS (comma-separated, empty to disable).
const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite'];
const GEMINI_TRANSIENT_ATTEMPTS = 3;
const GEMINI_RETRY_BASE_MS = 2000;

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6.1-sol',
    models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'],
    envKey: 'OPENAI_API_KEY',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-6.1-sol',
    models: ['openai/gpt-6.1-sol', 'anthropic/claude-fable-5.1', 'google/gemini-3.8-flash', 'moonshotai/kimi-k3', 'z-ai/glm-5.3', 'deepseek/deepseek-v4.1-flash', 'minimax/minimax-m3'],
    envKey: 'OPENROUTER_API_KEY',
  },
  kimi: {
    name: 'Kimi (Moonshot AI)',
    baseURL: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k3',
    models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
    envKey: 'MOONSHOT_API_KEY',
  },
  mimo: {
    name: 'MiMo (Xiaomi)',
    baseURL: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.6-pro',
    models: ['mimo-v2.6-pro', 'mimo-v2.6-flash'],
    envKey: 'MIMO_API_KEY',
  },
  glm: {
    name: 'GLM (Zhipu AI)',
    baseURL: 'https://api.z.ai/api/paas/v4/',
    defaultModel: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.3-flash', 'glm-5.2'],
    envKey: 'GLM_API_KEY',
  },
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    envKey: 'DEEPSEEK_API_KEY',
  },
  minimax: {
    name: 'MiniMax',
    baseURL: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M3.1-Flash',
    models: ['MiniMax-M3.1-Flash', 'MiniMax-M3'],
    // MINIMAX_API_KEY already selects MiniMax H3 video; reusing it here would
    // silently switch Gemini users with a video key over to MiniMax text.
    envKey: 'MINIMAX_TEXT_API_KEY',
  },
};

class AITextService {
  constructor(credentials = {}) {
    this.logger = new Logger('AITextService');
    this.client = null;
    this.gemini = null;
    this.model = null;
    this.providerName = null;
    this.retryBaseMs = GEMINI_RETRY_BASE_MS;

    this._init(credentials);
  }

  _init(credentials) {
    const provider = credentials.aiProvider?.provider;
    const apiKey = credentials.aiProvider?.apiKey;
    const model = credentials.aiProvider?.model;

    if (provider && PROVIDERS[provider] && apiKey) {
      return this._initOpenAICompatible(PROVIDERS[provider], apiKey, model);
    }

    for (const [, preset] of Object.entries(PROVIDERS)) {
      const key = process.env[preset.envKey];
      if (key) {
        return this._initOpenAICompatible(preset, key);
      }
    }

    const geminiKey = credentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      return this._initGemini(geminiKey, credentials.gemini?.model);
    }

    this.logger.warn('No AI text provider configured — text generation unavailable');
  }

  _initOpenAICompatible(preset, apiKey, model) {
    this.client = new OpenAI({ apiKey, baseURL: preset.baseURL });
    this.model = model || preset.defaultModel;
    this.providerName = preset.name;
    this.logger.info(`${preset.name} initialized (model: ${this.model})`);
  }

  _initGemini(apiKey, model) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      this.gemini = new GoogleGenAI({ apiKey });
      this.model = model || GEMINI_DEFAULT_MODEL;
      this.providerName = 'Google Gemini';
      this.logger.info(`Gemini initialized (model: ${this.model})`);
    } catch (error) {
      this.logger.error('Failed to initialize Gemini:', error.message);
    }
  }

  async generateText(prompt, options = {}) {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || 2048;
    const temperature = options.temperature ?? 0.7;

    if (this.gemini) {
      const candidates = [model, ...this._geminiFallbackModels().filter(candidate => candidate !== model)];
      let lastError = null;
      for (const candidate of candidates) {
        try {
          const text = await this._withTransientRetry(() => this._generateGeminiText(candidate, prompt, maxTokens, temperature));
          if (candidate !== model) this.logger.warn(`Gemini ${model} stayed unavailable; used fallback model ${candidate}`);
          return text;
        } catch (error) {
          lastError = error;
          if (!this._isTransientError(error)) throw error;
          this.logger.warn(`Gemini ${candidate} is unavailable after ${GEMINI_TRANSIENT_ATTEMPTS} attempts: ${this._shortError(error)}`);
        }
      }
      throw lastError;
    }

    return this._generateOpenAICompatibleText(model, prompt, maxTokens, temperature);
  }

  async _generateGeminiText(model, prompt, maxTokens, temperature) {
    const config = { maxOutputTokens: maxTokens };
    if (!/^gemini-(?:3\.(?:[5-9]|\d{2,})|[4-9]|\d{2,})[.-]/.test(model)) config.temperature = temperature;
    let response = await this.gemini.models.generateContent({
      model,
      contents: prompt,
      config,
    });
    let text = response && response.text;

    // Thinking models (gemini-3.x flash/pro) count thoughts against
    // maxOutputTokens, so a small budget can be spent before the answer is
    // finished: no text at all, or text cut off mid-JSON. Retry once with
    // room for the thoughts plus the whole answer.
    if (this._geminiFinishReason(response) === 'MAX_TOKENS') {
      const retryTokens = Math.max(maxTokens * 4, GEMINI_THINKING_RETRY_MIN_TOKENS);
      response = await this.gemini.models.generateContent({
        model,
        contents: prompt,
        config: { ...config, maxOutputTokens: retryTokens },
      });
      text = response && response.text;
    }

    if (!this._hasText(text)) {
      throw new Error(this._geminiEmptyResponseMessage(response));
    }
    return text;
  }

  _geminiFallbackModels() {
    if (process.env.GEMINI_FALLBACK_MODELS === undefined) return GEMINI_FALLBACK_MODELS;
    return process.env.GEMINI_FALLBACK_MODELS.split(',').map(value => value.trim()).filter(Boolean);
  }

  // Overloaded (503) and rate-limited (429) responses are temporary; anything
  // else (bad key, blocked prompt, empty output) is not worth retrying.
  _isTransientError(error) {
    const status = Number(error?.status || error?.code || error?.response?.status || 0);
    if ([429, 500, 502, 503, 504].includes(status)) return true;
    return /"code"\s*:\s*(429|500|503)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(String(error?.message || error || ''));
  }

  async _withTransientRetry(operation) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= GEMINI_TRANSIENT_ATTEMPTS || !this._isTransientError(error)) throw error;
        const delay = this.retryBaseMs * 2 ** (attempt - 1);
        this.logger.warn(`Gemini is busy (attempt ${attempt}/${GEMINI_TRANSIENT_ATTEMPTS}); retrying in ${delay / 1000}s`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  _shortError(error) {
    const message = String(error?.message || error || '');
    const parsed = message.match(/"message"\s*:\s*"([^"]+)"/);
    return (parsed ? parsed[1] : message).slice(0, 160);
  }

  async _generateOpenAICompatibleText(model, prompt, maxTokens, temperature) {
    if (!this.client) {
      throw new Error('No AI text provider configured');
    }

    const params = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    };

    const tokenParams = [
      { max_completion_tokens: maxTokens },
      { max_tokens: maxTokens },
    ];

    let lastError = null;
    for (let index = 0; index < tokenParams.length; index++) {
      const request = { ...params, ...tokenParams[index] };
      try {
        const response = await this.client.chat.completions.create(request);
        return this._extractContent(response);
      } catch (error) {
        lastError = error;
        const message = error?.message || '';
        const unsupportedTemperature =
          error?.status === 400 &&
          /temperature/i.test(message) &&
          /(unsupported value|does not support|only the default)/i.test(message);

        if (unsupportedTemperature) {
          const { temperature: _temperature, ...withoutTemperature } = request;
          try {
            const response = await this.client.chat.completions.create(withoutTemperature);
            return this._extractContent(response);
          } catch (retryError) {
            lastError = retryError;
          }
        }

        // Older models and some providers reject max_completion_tokens with a
        // 400; retry with the legacy max_tokens spelling. This also applies if
        // the temperature-compatible retry exposed the token incompatibility.
        if (
          index === 0 &&
          lastError?.status === 400 &&
          /max(_completion)?_tokens/i.test(lastError.message || '')
        ) {
          continue;
        }
        throw lastError;
      }
    }

    throw lastError;
  }

  _hasText(text) {
    return typeof text === 'string' && text.trim().length > 0;
  }

  _geminiFinishReason(response) {
    return response?.candidates?.[0]?.finishReason || null;
  }

  _geminiEmptyResponseMessage(response) {
    const finishReason = this._geminiFinishReason(response);
    const blockReason = response?.promptFeedback?.blockReason;
    if (finishReason === 'MAX_TOKENS') {
      const thoughts = response?.usageMetadata?.thoughtsTokenCount;
      return `${this.providerName} spent its whole output budget${thoughts ? ` (${thoughts} thinking tokens)` : ''} before writing any text. Raise maxTokens, or choose a model that does not think, such as gemini-3.5-flash-lite.`;
    }
    if (blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(finishReason)) {
      return `${this.providerName} blocked the response (${blockReason || finishReason}). Rephrase the prompt or topic and try again.`;
    }
    return `${this.providerName} returned an empty response${finishReason ? ` (finishReason: ${finishReason})` : ''}. Check the API key and model quota — free-tier Gemini keys are rate-limited and can return empty output.`;
  }

  _extractContent(response) {
    const content =
      response &&
      response.choices &&
      response.choices[0] &&
      response.choices[0].message
        ? response.choices[0].message.content
        : null;

    if (typeof content !== 'string' || !content.trim()) {
      // A null/empty body used to surface as cryptic "Unexpected end of JSON input"
      // in the agents' JSON parsers. Report the real cause instead.
      throw new Error(
        `${this.providerName} returned an empty response. Check the API key and model quota.`
      );
    }
    return content;
  }

  isAvailable() {
    return !!(this.client || this.gemini);
  }
}

module.exports = { AITextService, PROVIDERS, GEMINI_MODELS, GEMINI_DEFAULT_MODEL };
