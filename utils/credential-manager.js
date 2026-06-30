const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { Logger } = require('./logger');

class CredentialManager {
  constructor() {
    this.logger = new Logger('CredentialManager');
    this.credentialsPath = path.join(__dirname, '..', 'config', 'credentials.json');
    this.tokensPath = path.join(__dirname, '..', 'config', 'tokens.json');
    this.credentials = {};
    this.tokens = {};
  }

  async initialize() {
    try {
      await this.loadCredentials();
      await this.loadTokens();
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize credentials:', error);
      return false;
    }
  }

  async loadCredentials() {
    try {
      const data = await fs.readFile(this.credentialsPath, 'utf8');
      this.credentials = JSON.parse(data);
    } catch (error) {
      this.credentials = {};
    }
  }

  async loadTokens() {
    try {
      const data = await fs.readFile(this.tokensPath, 'utf8');
      this.tokens = JSON.parse(data);
    } catch (error) {
      this.tokens = {};
    }
  }

  async saveCredentials() {
    await fs.mkdir(path.dirname(this.credentialsPath), { recursive: true });
    await fs.writeFile(this.credentialsPath, JSON.stringify(this.credentials, null, 2));
  }

  async saveTokens() {
    await fs.mkdir(path.dirname(this.tokensPath), { recursive: true });
    await fs.writeFile(this.tokensPath, JSON.stringify(this.tokens, null, 2));
  }

  // YouTube API Authentication
  async setupYouTubeCredentials() {
    console.log(chalk.cyan('\n🎬 YouTube API Setup'));
    console.log(chalk.gray('You need to create a YouTube Data API project in Google Cloud Console'));
    console.log(chalk.gray('Visit: https://console.cloud.google.com/'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'Enter your YouTube API Client ID:',
        validate: input => input.length > 0 || 'Client ID is required'
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'Enter your YouTube API Client Secret:',
        validate: input => input.length > 0 || 'Client Secret is required'
      },
      {
        type: 'input',
        name: 'redirectUri',
        message: 'Enter your redirect URI:',
        default: 'http://localhost:8080/oauth2callback'
      }
    ]);

    this.credentials.youtube = {
      client_id: answers.clientId,
      client_secret: answers.clientSecret,
      redirect_uris: [answers.redirectUri]
    };

    await this.saveCredentials();
    
    // Authenticate and get tokens
    await this.authenticateYouTube();
    
    console.log(chalk.green('✅ YouTube credentials configured successfully!'));
  }

  async authenticateYouTube() {
    const oauth2Client = new google.auth.OAuth2(
      this.credentials.youtube.client_id,
      this.credentials.youtube.client_secret,
      this.credentials.youtube.redirect_uris[0]
    );

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });

    console.log(chalk.cyan('\n🔗 Please visit this URL to authorize the application:'));
    console.log(chalk.blue(authUrl));

    const { code } = await inquirer.prompt([
      {
        type: 'input',
        name: 'code',
        message: 'Enter the authorization code:',
        validate: input => input.length > 0 || 'Authorization code is required'
      }
    ]);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    this.tokens.youtube = tokens;
    await this.saveTokens();

    console.log(chalk.green('✅ YouTube authentication completed!'));
  }

  getYouTubeAuth() {
    if (!this.credentials.youtube || !this.tokens.youtube) {
      throw new Error('YouTube credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.credentials.youtube.client_id,
      this.credentials.youtube.client_secret,
      this.credentials.youtube.redirect_uris[0]
    );

    oauth2Client.setCredentials(this.tokens.youtube);
    return oauth2Client;
  }

  getYouTubeClient() {
    const auth = this.getYouTubeAuth();
    return google.youtube({ version: 'v3', auth });
  }

  // OpenAI API Setup
  async setupOpenAICredentials() {
    console.log(chalk.cyan('\n🤖 OpenAI API Setup'));
    console.log(chalk.gray('Get your API key from: https://platform.openai.com/api-keys'));
    
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your OpenAI API Key:',
        validate: input => input.startsWith('sk-') || 'Invalid OpenAI API key format'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select your preferred model:',
        choices: [
          'gpt-5.5',
          'gpt-5.5-instant',
          'gpt-5.4'
        ],
        default: 'gpt-5.5'
      }
    ]);

    this.credentials.openai = {
      apiKey: answers.apiKey,
      model: answers.model
    };

    await this.saveCredentials();
    console.log(chalk.green('✅ OpenAI credentials configured successfully!'));
  }

  // Google Gemini API Setup
  async setupGeminiCredentials() {
    console.log(chalk.cyan('\n💎 Google Gemini API Setup'));
    console.log(chalk.gray('Get your API key from: https://aistudio.google.com/apikey'));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Gemini API Key:',
        validate: input => input.length > 0 || 'API key is required'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select your preferred Gemini model:',
        choices: [
          'gemini-3.5-flash',
          'gemini-3.5-pro'
        ],
        default: 'gemini-3.5-flash'
      }
    ]);

    this.credentials.gemini = {
      apiKey: answers.apiKey,
      model: answers.model
    };

    await this.saveCredentials();
    console.log(chalk.green('✅ Gemini credentials configured successfully!'));
  }

  // OpenRouter Setup
  async setupOpenRouterCredentials() {
    console.log(chalk.cyan('\nOpenRouter Setup'));
    console.log(chalk.gray('Get your API key from: https://openrouter.ai/keys'));
    console.log(chalk.gray('One key gives access to 300+ models (OpenAI, Claude, Gemini, Kimi, GLM, etc.)'));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your OpenRouter API Key:',
        validate: input => input.startsWith('sk-or-') || 'Invalid OpenRouter key format (starts with sk-or-)'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select default model:',
        choices: [
          'openai/gpt-5.5',
          'anthropic/claude-opus-4-8',
          'google/gemini-3.5-flash',
          'moonshotai/kimi-k2.6',
          'zhipu/glm-5'
        ],
        default: 'openai/gpt-5.5'
      }
    ]);

    this.credentials.aiProvider = {
      provider: 'openrouter',
      apiKey: answers.apiKey,
      model: answers.model
    };

    await this.saveCredentials();
    console.log(chalk.green('OpenRouter configured successfully!'));
  }

  // Kimi (Moonshot AI) Setup
  async setupKimiCredentials() {
    console.log(chalk.cyan('\nKimi (Moonshot AI) Setup'));
    console.log(chalk.gray('Get your API key from: https://platform.kimi.ai'));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your Moonshot API Key:',
        validate: input => input.length > 0 || 'API key is required'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-auto'],
        default: 'kimi-k2.6'
      }
    ]);

    this.credentials.aiProvider = {
      provider: 'kimi',
      apiKey: answers.apiKey,
      model: answers.model
    };

    await this.saveCredentials();
    console.log(chalk.green('Kimi credentials configured successfully!'));
  }

  // MiMo (Xiaomi) Setup
  async setupMiMoCredentials() {
    console.log(chalk.cyan('\nMiMo (Xiaomi) Setup'));
    console.log(chalk.gray('Get your API key from: https://mimo.mi.com'));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your MiMo API Key:',
        validate: input => input.length > 0 || 'API key is required'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: ['mimo-v2.5-pro', 'mimo-v2.5'],
        default: 'mimo-v2.5-pro'
      }
    ]);

    this.credentials.aiProvider = {
      provider: 'mimo',
      apiKey: answers.apiKey,
      model: answers.model
    };

    await this.saveCredentials();
    console.log(chalk.green('MiMo credentials configured successfully!'));
  }

  // GLM (Zhipu AI) Setup
  async setupGLMCredentials() {
    console.log(chalk.cyan('\nGLM (Zhipu AI) Setup'));
    console.log(chalk.gray('Get your API key from: https://z.ai'));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your GLM API Key:',
        validate: input => input.length > 0 || 'API key is required'
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select model:',
        choices: ['glm-5', 'glm-5.1'],
        default: 'glm-5'
      }
    ]);

    this.credentials.aiProvider = {
      provider: 'glm',
      apiKey: answers.apiKey,
      model: answers.model
    };

    await this.saveCredentials();
    console.log(chalk.green('GLM credentials configured successfully!'));
  }

  // Azure Speech Services (TTS)
  async setupAzureSpeechCredentials() {
    console.log(chalk.cyan('\n🎙️  Azure Speech Services Setup'));
    console.log(chalk.gray('Create a Speech service in Azure Portal'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'subscriptionKey',
        message: 'Enter your Azure Speech subscription key:',
        validate: input => input.length > 0 || 'Subscription key is required'
      },
      {
        type: 'input',
        name: 'region',
        message: 'Enter your Azure region:',
        default: 'eastus'
      },
      {
        type: 'list',
        name: 'voice',
        message: 'Select preferred voice:',
        choices: [
          'en-US-JennyNeural',
          'en-US-GuyNeural',
          'en-US-AriaNeural',
          'en-US-DavisNeural',
          'en-US-AmberNeural'
        ],
        default: 'en-US-JennyNeural'
      }
    ]);

    this.credentials.azureSpeech = {
      subscriptionKey: answers.subscriptionKey,
      region: answers.region,
      voice: answers.voice
    };

    await this.saveCredentials();
    console.log(chalk.green('✅ Azure Speech credentials configured successfully!'));
  }

  // Channel Configuration
  async setupChannelConfig() {
    console.log(chalk.cyan('\n📺 Channel Configuration'));
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'channelName',
        message: 'Enter your channel name:',
        validate: input => input.length > 0 || 'Channel name is required'
      },
      {
        type: 'input',
        name: 'channelDescription',
        message: 'Enter channel description:',
        default: 'Automated content channel'
      },
      {
        type: 'input',
        name: 'defaultCategory',
        message: 'Enter default video category ID (22 = People & Blogs):',
        default: '22'
      },
      {
        type: 'list',
        name: 'defaultPrivacy',
        message: 'Select default privacy setting:',
        choices: ['public', 'unlisted', 'private'],
        default: 'public'
      },
      {
        type: 'input',
        name: 'websiteUrl',
        message: 'Enter your website URL (optional):'
      },
      {
        type: 'input',
        name: 'businessEmail',
        message: 'Enter business email (optional):'
      }
    ]);

    this.credentials.channel = answers;
    
    // Set environment variables for the application
    process.env.CHANNEL_NAME = answers.channelName;
    process.env.DEFAULT_PRIVACY_STATUS = answers.defaultPrivacy;
    process.env.WEBSITE_URL = answers.websiteUrl;
    process.env.BUSINESS_EMAIL = answers.businessEmail;

    await this.saveCredentials();
    console.log(chalk.green('✅ Channel configuration saved successfully!'));
  }

  // Content Configuration
  async setupContentConfig() {
    console.log(chalk.cyan('\n📝 Content Configuration'));
    
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'contentTypes',
        message: 'Select content types to generate:',
        choices: [
          { name: 'Tutorials', value: 'tutorial', checked: true },
          { name: 'Explainers', value: 'explainer', checked: true },
          { name: 'List Videos', value: 'list', checked: true },
          { name: 'Reviews', value: 'review', checked: false },
          { name: 'Stories', value: 'story', checked: false }
        ],
        validate: input => input.length > 0 || 'Select at least one content type'
      },
      {
        type: 'input',
        name: 'competitorChannels',
        message: 'Enter competitor channel IDs (comma-separated):',
        filter: input => input.split(',').map(id => id.trim()).filter(id => id)
      },
      {
        type: 'input',
        name: 'targetAudience',
        message: 'Describe your target audience:',
        default: 'General audience interested in educational content'
      },
      {
        type: 'list',
        name: 'postingFrequency',
        message: 'Select posting frequency:',
        choices: [
          { name: 'Daily', value: 'daily' },
          { name: 'Every other day', value: 'every-2-days' },
          { name: '3 times per week', value: '3-per-week' },
          { name: 'Weekly', value: 'weekly' }
        ],
        default: 'daily'
      },
      {
        type: 'input',
        name: 'preferredPostTime',
        message: 'Preferred posting time (24h format, e.g., 14:00):',
        default: '14:00'
      }
    ]);

    this.credentials.content = answers;
    
    // Set environment variables
    process.env.COMPETITOR_CHANNELS = answers.competitorChannels.join(',');
    process.env.DEFAULT_AUTHOR = answers.channelName || 'Content Creator';
    process.env.TARGET_AUDIENCE = answers.targetAudience;

    await this.saveCredentials();
    console.log(chalk.green('✅ Content configuration saved successfully!'));
  }

  // Validation methods
  async validateAll() {
    try {
      await this.loadCredentials();
      await this.loadTokens();
    } catch (error) {
      // Files might not exist yet
    }

    const requiredCredentials = ['youtube', ...this.getRequiredAIServices()];
    const missing = [];

    for (const service of requiredCredentials) {
      if (Array.isArray(service)) {
        if (!service.some(option => this.credentials[option])) {
          missing.push(service.join(' or '));
        }
      } else if (!this.credentials[service]) {
        missing.push(service);
      }
    }

    if (missing.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Missing credentials for: ${missing.join(', ')}`));
      return false;
    }

    // Validate YouTube tokens
    if (!this.tokens.youtube) {
      console.log(chalk.yellow('\n⚠️  YouTube authentication required'));
      return false;
    }

    return true;
  }

  getRequiredAIServices() {
    const supportedAIServices = ['openai', 'gemini', 'openrouter', 'kimi', 'mimo', 'glm'];
    const selectedService = this.credentials.aiService;

    if (supportedAIServices.includes(selectedService)) {
      return [selectedService];
    }

    return [supportedAIServices];
  }

  async testConnections() {
    console.log(chalk.cyan('\n🔍 Testing API connections...'));
    
    const results = {
      youtube: false,
      openai: false,
      azureSpeech: false
    };

    // Test YouTube API
    try {
      const youtube = this.getYouTubeClient();
      await youtube.channels.list({
        part: 'snippet',
        mine: true
      });
      results.youtube = true;
      console.log(chalk.green('✅ YouTube API connection successful'));
    } catch (error) {
      console.log(chalk.red('❌ YouTube API connection failed'));
      this.logger.error('YouTube API test failed:', error);
    }

    // Test OpenAI API
    if (this.credentials.openai) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: this.credentials.openai.apiKey });

        await openai.models.list();
        results.openai = true;
        console.log(chalk.green('✅ OpenAI API connection successful'));
      } catch (error) {
        console.log(chalk.red('❌ OpenAI API connection failed'));
        this.logger.error('OpenAI API test failed:', error);
      }
    }

    return results;
  }

  // Setup wizard
  async runSetupWizard() {
    console.log(chalk.cyan.bold('\n🚀 YouTube Automation Agent Setup Wizard'));
    console.log(chalk.gray('Let\'s configure your credentials and settings...\n'));

    const setupSteps = [
      { name: '🎬 YouTube API', action: () => this.setupYouTubeCredentials() },
      { name: '🤖 AI Service (OpenAI/Gemini)', action: () => this.setupAIService() },
      { name: '🎙️  Text-to-Speech Service', action: () => this.setupTTSService() },
      { name: '📺 Channel Configuration', action: () => this.setupChannelConfig() },
      { name: '📝 Content Configuration', action: () => this.setupContentConfig() }
    ];

    for (const step of setupSteps) {
      console.log(chalk.cyan(`\n${step.name}`));
      await step.action();
    }

    console.log(chalk.green.bold('\n🎉 Setup completed successfully!'));
    console.log(chalk.cyan('You can now run: npm start'));
    
    // Test connections
    await this.testConnections();
  }

  async setupAIService() {
    const { service } = await inquirer.prompt([
      {
        type: 'list',
        name: 'service',
        message: 'Select your preferred AI service:',
        choices: [
          { name: 'OpenAI (GPT-5.5)', value: 'openai' },
          { name: 'Google Gemini (Gemini 3.5 — free tier)', value: 'gemini' },
          { name: 'OpenRouter (300+ models, one API key)', value: 'openrouter' },
          { name: 'Kimi (Moonshot AI — K2.6)', value: 'kimi' },
          { name: 'MiMo (Xiaomi — V2.5 Pro)', value: 'mimo' },
          { name: 'GLM (Zhipu AI — GLM-5)', value: 'glm' },
        ]
      }
    ]);

    this.credentials.aiService = service;
    await this.saveCredentials();

    switch (service) {
      case 'openai': return await this.setupOpenAICredentials();
      case 'gemini': return await this.setupGeminiCredentials();
      case 'openrouter': return await this.setupOpenRouterCredentials();
      case 'kimi': return await this.setupKimiCredentials();
      case 'mimo': return await this.setupMiMoCredentials();
      case 'glm': return await this.setupGLMCredentials();
    }
  }

  async setupTTSService() {
    const { service } = await inquirer.prompt([
      {
        type: 'list',
        name: 'service',
        message: 'Select your preferred Text-to-Speech service:',
        choices: [
          { name: 'OpenAI TTS (gpt-4o-mini-tts, uses your OpenAI key)', value: 'openai-tts' },
          { name: 'ElevenLabs (highest quality)', value: 'elevenlabs' },
          { name: 'Azure Speech Services', value: 'azure' },
          { name: 'Skip TTS Setup', value: 'skip' }
        ]
      }
    ]);

    if (service === 'openai-tts') {
      console.log(chalk.green('✅ OpenAI TTS will use your existing OpenAI API key'));
    } else if (service === 'elevenlabs') {
      await this.setupElevenLabsCredentials();
    } else if (service === 'azure') {
      await this.setupAzureSpeechCredentials();
    }
  }

  async setupElevenLabsCredentials() {
    console.log(chalk.cyan('\n🎙️  ElevenLabs Setup'));
    console.log(chalk.gray('Get your API key from: https://elevenlabs.io'));

    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your ElevenLabs API Key:',
        validate: input => input.length > 0 || 'API key is required'
      },
      {
        type: 'input',
        name: 'voiceId',
        message: 'Enter your preferred Voice ID:',
        validate: input => input.length > 0 || 'Voice ID is required'
      }
    ]);

    this.credentials.elevenLabs = {
      apiKey: answers.apiKey,
      voiceId: answers.voiceId
    };

    await this.saveCredentials();
    console.log(chalk.green('✅ ElevenLabs credentials configured successfully!'));
  }
}

// CLI interface for credential setup
if (require.main === module) {
  const credentialManager = new CredentialManager();
  
  const args = process.argv.slice(2);
  if (args.includes('setup')) {
    credentialManager.runSetupWizard().catch(console.error);
  } else {
    console.log('Usage: node credential-manager.js setup');
  }
}

module.exports = { CredentialManager };
