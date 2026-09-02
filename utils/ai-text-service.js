const OpenAI = require('openai');
const axios = require('axios');
const { Logger } = require('./logger');

const GEMINI_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash-lite',
];
const GEMINI_DEFAULT_MODEL = GEMINI_MODELS[0];

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6',
    models: ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    envKey: 'OPENAI_API_KEY',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5.6-sol',
    models: ['openai/gpt-5.6-sol', 'anthropic/claude-fable-5', 'google/gemini-3.7-flash', 'moonshotai/kimi-k3', 'z-ai/glm-5.3'],
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
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5'],
    envKey: 'MIMO_API_KEY',
  },
  glm: {
    name: 'GLM (Zhipu AI)',
    baseURL: 'https://api.z.ai/api/paas/v4/',
    defaultModel: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.2', 'glm-5.1'],
    envKey: 'GLM_API_KEY',
  },
};

class AITextService {
  constructor(credentials = {}) {
    this.logger = new Logger('AITextService');
    this.client = null;
    this.gemini = null;
    this.anthropic = null;
    this.model = null;
    this.providerName = null;

    this._init(credentials);
  }

  _init(credentials) {
    const provider = credentials.aiProvider?.provider;
    const apiKey = credentials.aiProvider?.apiKey;
    const model = credentials.aiProvider?.model;

    if (provider && PROVIDERS[provider] && apiKey) {
      return this._initOpenAICompatible(PROVIDERS[provider], apiKey, model);
    }

    const anthropicKey = credentials.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      return this._initAnthropic(anthropicKey, credentials.anthropic?.model);
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

  _initAnthropic(apiKey, model) {
    this.anthropic = { apiKey };
    this.model = model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
    this.providerName = 'Anthropic Claude';
    this.logger.info(`Anthropic Claude initialized (model: ${this.model})`);
  }

  async generateText(prompt, options = {}) {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || 2048;
    const temperature = options.temperature ?? 0.7;

    if (this.anthropic) {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.anthropic.apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 120000,
        },
      );

      return (response.data.content || [])
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
    }

    if (this.gemini) {
      const config = { maxOutputTokens: maxTokens };
      if (!/^gemini-3\.(?:[5-9]|\d{2,})-/.test(model)) config.temperature = temperature;
      const response = await this.gemini.models.generateContent({
        model,
        contents: prompt,
        config,
      });
      const text = response && response.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(
          `${this.providerName} returned an empty response. Check the API key and model quota — free-tier Gemini keys are rate-limited and can return empty output.`
        );
      }
      return text;
    }

    if (!this.client) {
      throw new Error('No AI text provider configured');
    }

    const params = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    };

    try {
      // Newer OpenAI models (gpt-5.x and later) reject the legacy max_tokens
      // parameter with a 400 error and require max_completion_tokens instead.
      const response = await this.client.chat.completions.create({
        ...params,
        max_completion_tokens: maxTokens,
      });
      return this._extractContent(response);
    } catch (error) {
      // Older models and some providers reject max_completion_tokens with a 400;
      // retry the same request using the legacy max_tokens spelling.
      if (
        error &&
        error.status === 400 &&
        /max(_completion)?_tokens/i.test(error.message || '')
      ) {
        const response = await this.client.chat.completions.create({
          ...params,
          max_tokens: maxTokens,
        });
        return this._extractContent(response);
      }
      throw error;
    }
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
    return !!(this.client || this.gemini || this.anthropic);
  }
}

module.exports = { AITextService, PROVIDERS, GEMINI_MODELS, GEMINI_DEFAULT_MODEL };
