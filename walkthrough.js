require('dotenv').config();

const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { CredentialManager } = require('./utils/credential-manager');
const { AITextService, PROVIDERS } = require('./utils/ai-text-service');
const { Database } = require('./database/db');
const { checkFFmpeg, ffmpegInstallHint } = require('./utils/ffmpeg');

// Everything a beginner needs to know about each provider, in one place
const AI_PROVIDER_GUIDE = {
  gemini: {
    label: 'Google Gemini — FREE tier, no credit card (recommended for beginners)',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'starts with "AIza"',
    instructions: [
      'Sign in with any Google account',
      'Click "Create API key"',
      'Copy the key it shows you'
    ],
    models: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-pro'],
    defaultModel: 'gemini-3.5-flash',
    covers: 'scripts + images + voice narration (full free pipeline)',
    save(credentials, apiKey, model) {
      credentials.gemini = { apiKey, model };
    },
    validationCreds: (apiKey, model) => ({ gemini: { apiKey, model } })
  },
  openai: {
    label: 'OpenAI — paid (~$0.05–0.20/video), premium image + voice quality',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'starts with "sk-"',
    instructions: [
      'Sign in (or create an account) and add billing',
      'Click "Create new secret key"',
      'Copy the key — it is shown only once'
    ],
    models: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4'],
    defaultModel: 'gpt-5.5',
    covers: 'scripts + images + voice narration',
    save(credentials, apiKey, model) {
      credentials.openai = { apiKey, model };
    },
    validationCreds: (apiKey, model) => ({ aiProvider: { provider: 'openai', apiKey, model } })
  },
  openrouter: {
    label: 'OpenRouter — one key, 300+ models (pay per use)',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'starts with "sk-or-"',
    instructions: [
      'Sign in and add a few dollars of credit',
      'Create a key and copy it'
    ],
    models: ['openai/gpt-5.5', 'anthropic/claude-opus-4-8', 'google/gemini-3.5-flash', 'moonshotai/kimi-k2.6', 'zhipu/glm-5'],
    defaultModel: 'google/gemini-3.5-flash',
    covers: 'scripts only (add a Gemini or OpenAI key for images/voice)',
    save(credentials, apiKey, model) {
      credentials.aiProvider = { provider: 'openrouter', apiKey, model };
    },
    validationCreds: (apiKey, model) => ({ aiProvider: { provider: 'openrouter', apiKey, model } })
  },
  atlascloud: {
    label: 'Atlas Cloud — OpenAI-compatible multi-model API',
    keyUrl: 'https://www.atlascloud.ai/console/api-keys',
    keyHint: 'from the Atlas Cloud console',
    instructions: [
      'Sign in to Atlas Cloud',
      'Open the API keys page and create a key',
      'Copy the key into this setup step'
    ],
    models: ['qwen/qwen3.5-flash', 'deepseek-ai/deepseek-v4-pro'],
    defaultModel: 'qwen/qwen3.5-flash',
    covers: 'scripts only (add a Gemini or OpenAI key for images/voice)',
    save(credentials, apiKey, model) {
      credentials.aiProvider = { provider: 'atlascloud', apiKey, model };
    },
    validationCreds: (apiKey, model) => ({ aiProvider: { provider: 'atlascloud', apiKey, model } })
  },
  kimi: {
    label: 'Kimi (Moonshot AI) — very cheap, strong quality',
    keyUrl: 'https://platform.kimi.ai',
    keyHint: 'from the Moonshot platform console',
    instructions: ['Create an account', 'Open the API keys page and create a key'],
    models: ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-auto'],
    defaultModel: 'kimi-k2.6',
    covers: 'scripts only (add a Gemini or OpenAI key for images/voice)',
    save(credentials, apiKey, model) {
      credentials.aiProvider = { provider: 'kimi', apiKey, model };
    },
    validationCreds: (apiKey, model) => ({ aiProvider: { provider: 'kimi', apiKey, model } })
  },
  mimo: {
    label: 'MiMo (Xiaomi) — competitive pricing',
    keyUrl: 'https://mimo.mi.com',
    keyHint: 'from the MiMo console',
    instructions: ['Create an account', 'Create an API key in the console'],
    models: ['mimo-v2.5-pro', 'mimo-v2.5'],
    defaultModel: 'mimo-v2.5-pro',
    covers: 'scripts only (add a Gemini or OpenAI key for images/voice)',
    save(credentials, apiKey, model) {
      credentials.aiProvider = { provider: 'mimo', apiKey, model };
    },
    validationCreds: (apiKey, model) => ({ aiProvider: { provider: 'mimo', apiKey, model } })
  },
  glm: {
    label: 'GLM (Zhipu AI) — ~$1/M input tokens',
    keyUrl: 'https://z.ai',
    keyHint: 'from the Z.ai console',
    instructions: ['Create an account', 'Create an API key in the console'],
    models: ['glm-5', 'glm-5.1'],
    defaultModel: 'glm-5',
    covers: 'scripts only (add a Gemini or OpenAI key for images/voice)',
    save(credentials, apiKey, model) {
      credentials.aiProvider = { provider: 'glm', apiKey, model };
    },
    validationCreds: (apiKey, model) => ({ aiProvider: { provider: 'glm', apiKey, model } })
  }
};

class SetupWalkthrough {
  constructor() {
    this.cm = new CredentialManager();
    this.totalSteps = 5;
  }

  header(step, title) {
    console.log(chalk.cyan.bold(`\n━━━ Step ${step} of ${this.totalSteps}: ${title} `.padEnd(62, '━')));
  }

  openBrowser(url) {
    const commands = {
      win32: `start "" "${url}"`,
      darwin: `open "${url}"`,
      linux: `xdg-open "${url}"`
    };
    const command = commands[process.platform];
    if (command) {
      exec(command, () => {}); // best effort — the URL is printed either way
    }
  }

  async run() {
    console.log(chalk.cyan.bold('\n🧭 YouTube Automation Agent — Guided Walkthrough'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.white('This takes about 10–15 minutes and explains everything as you go.'));
    console.log(chalk.white('Every step can be skipped and finished later — your progress is'));
    console.log(chalk.white('saved after each step. Re-run any time with: ') + chalk.cyan('npm run walkthrough'));

    await this.cm.loadCredentials();
    await this.cm.loadTokens();

    try {
      await this.stepSystemCheck();
      await this.stepAIProvider();
      await this.stepYouTube();
      await this.stepChannelBasics();
      await this.stepFinish();
    } catch (error) {
      if (error && (error.isTtyError || /User force closed/i.test(error.message || ''))) {
        console.log(chalk.yellow('\n\n👋 No problem — everything you completed is saved.'));
        console.log(chalk.cyan('Pick up where you left off with: npm run walkthrough'));
        return;
      }
      throw error;
    }
  }

  // ── Step 1: environment ────────────────────────────────────────────────
  async stepSystemCheck() {
    this.header(1, 'Checking your system');

    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    console.log(nodeMajor >= 18
      ? chalk.green(`  ✓ Node.js ${process.versions.node}`)
      : chalk.red(`  ✗ Node.js ${process.versions.node} — version 18+ is required (https://nodejs.org)`));

    const ffmpegOk = await checkFFmpeg();
    console.log(ffmpegOk
      ? chalk.green('  ✓ FFmpeg (video assembly)')
      : chalk.yellow(`  ✗ FFmpeg — ${ffmpegInstallHint()}`));

    const directories = [
      'config', 'logs', 'data', 'data/production', 'data/assets', 'data/videos',
      'data/audio', 'data/scripts', 'data/captions', 'temp/processing', 'uploads/thumbnails'
    ];
    for (const dir of directories) {
      await fs.mkdir(path.join(__dirname, dir), { recursive: true });
    }
    console.log(chalk.green('  ✓ Project folders'));

    const db = new Database();
    await db.initialize();
    await db.close();
    console.log(chalk.green('  ✓ Database'));

    // Create .env from a minimal template if the user doesn't have one yet
    try {
      await fs.access(path.join(__dirname, '.env'));
      console.log(chalk.green('  ✓ .env file'));
    } catch (error) {
      await fs.writeFile(path.join(__dirname, '.env'), [
        '# Created by the guided walkthrough — see .env.example for every option',
        'NODE_ENV=production',
        'PORT=3456',
        'LOG_LEVEL=info',
        'DEFAULT_PRIVACY_STATUS=private',
        ''
      ].join('\n'));
      console.log(chalk.green('  ✓ .env file created'));
    }
  }

  // ── Step 2: AI provider ────────────────────────────────────────────────
  async stepAIProvider() {
    this.header(2, 'Your AI provider (writes scripts, makes images & narration)');

    if (this.cm.hasAITextProvider()) {
      const { redo } = await inquirer.prompt([{
        type: 'confirm',
        name: 'redo',
        message: 'An AI provider is already configured. Set up a different one?',
        default: false
      }]);
      if (!redo) return;
    } else {
      console.log(chalk.white('The agent needs one AI service. If you don\'t want to spend money,'));
      console.log(chalk.white('pick Google Gemini — its free tier covers the whole pipeline:'));
      console.log(chalk.white('scripts, images, and voice narration.'));
    }

    const { providerId } = await inquirer.prompt([{
      type: 'list',
      name: 'providerId',
      message: 'Which AI provider do you want to use?',
      choices: Object.entries(AI_PROVIDER_GUIDE).map(([value, guide]) => ({ name: guide.label, value }))
    }]);

    const guide = AI_PROVIDER_GUIDE[providerId];

    console.log(chalk.cyan(`\nHow to get your key (${guide.keyHint}):`));
    guide.instructions.forEach((line, i) => console.log(chalk.white(`  ${i + 1}. ${line}`)));
    console.log(chalk.white(`  → ${chalk.blue(guide.keyUrl)} (opening in your browser)`));
    console.log(chalk.gray(`  This key covers: ${guide.covers}`));
    this.openBrowser(guide.keyUrl);

    while (true) {
      const { apiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        mask: '*',
        message: `Paste your ${providerId} API key (or leave empty to skip this step):`
      }]);

      if (!apiKey.trim()) {
        console.log(chalk.yellow('  Skipped — configure later with: npm run walkthrough'));
        return;
      }

      const { model } = await inquirer.prompt([{
        type: 'list',
        name: 'model',
        message: 'Model to use:',
        choices: guide.models,
        default: guide.defaultModel
      }]);

      console.log(chalk.gray('  Testing your key with a tiny request...'));
      const ok = await this.validateAIKey(guide, apiKey.trim(), model);

      if (ok) {
        guide.save(this.cm.credentials, apiKey.trim(), model);
        await this.cm.saveCredentials();
        console.log(chalk.green('  ✓ Key works! Saved.'));
        return;
      }

      const { retry } = await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'That key didn\'t work. Try pasting it again?',
        default: true
      }]);
      if (!retry) {
        console.log(chalk.yellow('  Skipped — configure later with: npm run walkthrough'));
        return;
      }
    }
  }

  async validateAIKey(guide, apiKey, model) {
    // Temporarily clear provider env keys so the test hits exactly the pasted key
    const envKeys = [...Object.values(PROVIDERS).map(p => p.envKey), 'GEMINI_API_KEY'];
    const savedEnv = {};
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    try {
      const service = new AITextService(guide.validationCreds(apiKey, model));
      const reply = await service.generateText('Reply with the single word OK.', { maxTokens: 20, temperature: 0 });
      return typeof reply === 'string' && reply.length > 0;
    } catch (error) {
      console.log(chalk.red(`  ✗ ${error.message}`));
      return false;
    } finally {
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
    }
  }

  // ── Step 3: YouTube ────────────────────────────────────────────────────
  async stepYouTube() {
    this.header(3, 'Connecting your YouTube channel');

    if (this.cm.credentials.youtube && this.cm.tokens.youtube) {
      const { redo } = await inquirer.prompt([{
        type: 'confirm',
        name: 'redo',
        message: 'YouTube is already connected. Reconnect?',
        default: false
      }]);
      if (!redo) return;
    } else {
      console.log(chalk.white('This lets the agent upload to your channel. It\'s the fiddliest step,'));
      console.log(chalk.white('but it\'s free and you only do it once. You can also skip it — videos'));
      console.log(chalk.white('will still be generated locally in data/videos/.'));
    }

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'How do you want to proceed?',
      choices: [
        { name: '🧭 Walk me through creating the Google credentials (~5 min)', value: 'guided' },
        { name: '⚡ I already have a Client ID and Client Secret', value: 'have' },
        { name: '⏭️  Skip for now', value: 'skip' }
      ]
    }]);

    if (action === 'skip') {
      console.log(chalk.yellow('  Skipped — connect later with: npm run walkthrough'));
      return;
    }

    if (action === 'guided') {
      console.log(chalk.cyan('\nDo this in the browser tab that just opened:'));
      console.log(chalk.white('  1. Create a project (any name) — top bar → "New project"'));
      console.log(chalk.white('  2. Menu → "APIs & Services" → "Library" → search "YouTube Data API v3" → Enable'));
      console.log(chalk.white('  3. "APIs & Services" → "OAuth consent screen" → External → fill the 3 required'));
      console.log(chalk.white('     fields → add YOUR OWN email under "Test users"'));
      console.log(chalk.white('  4. "APIs & Services" → "Credentials" → "Create credentials" → "OAuth client ID"'));
      console.log(chalk.white('     → Application type: "Desktop app"'));
      console.log(chalk.white('  5. Copy the Client ID and Client Secret it shows you'));
      console.log(chalk.white(`  → ${chalk.blue('https://console.cloud.google.com/')}`));
      this.openBrowser('https://console.cloud.google.com/');
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'Paste your Client ID (ends in .apps.googleusercontent.com, empty to skip):'
      },
      {
        type: 'password',
        name: 'clientSecret',
        mask: '*',
        message: 'Paste your Client Secret:',
        when: (a) => a.clientId.trim().length > 0
      }
    ]);

    if (!answers.clientId.trim()) {
      console.log(chalk.yellow('  Skipped — connect later with: npm run walkthrough'));
      return;
    }

    this.cm.credentials.youtube = {
      client_id: answers.clientId.trim(),
      client_secret: (answers.clientSecret || '').trim(),
      redirect_uris: ['http://localhost:8080/oauth2callback']
    };
    await this.cm.saveCredentials();

    console.log(chalk.cyan('\nNow let\'s sign in. A Google page will open — approve the access.'));
    console.log(chalk.gray('(You may see "Google hasn\'t verified this app" — click "Continue".'));
    console.log(chalk.gray(' That\'s expected: the "app" is your own Cloud project.)'));

    try {
      const { ModernAuth } = require('./modern-auth');
      const auth = new ModernAuth();
      await auth.authenticate();
      await this.cm.loadTokens();
      console.log(chalk.gray('  Checking which channel this is...'));
      await auth.testAuthentication();
    } catch (error) {
      console.log(chalk.red(`  ✗ Sign-in failed: ${error.message}`));
      console.log(chalk.yellow('  Your Client ID/Secret are saved — retry with: npm run walkthrough'));
    }
  }

  // ── Step 4: channel basics ─────────────────────────────────────────────
  async stepChannelBasics() {
    this.header(4, 'Channel & content basics');

    const existing = this.cm.credentials.channel || {};
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'channelName',
        message: 'What\'s your channel called?',
        default: existing.channelName || 'My Automated Channel'
      },
      {
        type: 'list',
        name: 'postingFrequency',
        message: 'How often should it post?',
        choices: [
          { name: 'Daily', value: 'daily' },
          { name: 'Every other day', value: 'every-2-days' },
          { name: '3 times per week', value: '3-per-week' },
          { name: 'Weekly', value: 'weekly' }
        ],
        default: this.cm.credentials.content?.postingFrequency || 'daily'
      },
      {
        type: 'input',
        name: 'targetAudience',
        message: 'Describe your target audience in one line:',
        default: this.cm.credentials.content?.targetAudience || 'General audience interested in educational content'
      }
    ]);

    this.cm.credentials.channel = {
      ...existing,
      channelName: answers.channelName,
      channelDescription: existing.channelDescription || 'Automated content channel',
      defaultCategory: existing.defaultCategory || '22',
      defaultPrivacy: existing.defaultPrivacy || 'private'
    };
    this.cm.credentials.content = {
      contentTypes: this.cm.credentials.content?.contentTypes || ['tutorial', 'explainer', 'list'],
      competitorChannels: this.cm.credentials.content?.competitorChannels || [],
      targetAudience: answers.targetAudience,
      postingFrequency: answers.postingFrequency,
      preferredPostTime: this.cm.credentials.content?.preferredPostTime || '14:00'
    };
    await this.cm.saveCredentials();

    console.log(chalk.green('  ✓ Saved.') + chalk.gray(' Uploads default to PRIVATE so you can review them first —'));
    console.log(chalk.gray('  set DEFAULT_PRIVACY_STATUS=public in .env when you\'re confident.'));
  }

  // ── Step 5: summary ────────────────────────────────────────────────────
  async stepFinish() {
    this.header(5, 'All set — here\'s what your pipeline can do');

    await this.cm.loadCredentials();
    await this.cm.loadTokens();
    const creds = this.cm.credentials;

    const hasText = this.cm.hasAITextProvider();
    const hasGemini = Boolean(creds.gemini?.apiKey || process.env.GEMINI_API_KEY);
    const hasMedia = Boolean(creds.openai?.apiKey || process.env.OPENAI_API_KEY || hasGemini);
    const hasFFmpeg = await checkFFmpeg();
    const hasUpload = Boolean(creds.youtube && this.cm.tokens.youtube);

    const rows = [
      { ok: hasText, name: 'Write scripts & pick topics', fix: 'step 2 (AI provider)' },
      { ok: hasMedia, name: 'Generate images & voice narration', fix: 'step 2 — use a Gemini or OpenAI key' },
      { ok: hasFFmpeg, name: 'Assemble real .mp4 videos', fix: ffmpegInstallHint() },
      { ok: hasUpload, name: 'Upload to YouTube', fix: 'step 3 (YouTube connection)' }
    ];

    for (const row of rows) {
      console.log(row.ok
        ? chalk.green(`  ✓ ${row.name}`)
        : chalk.yellow(`  ✗ ${row.name} — re-run the walkthrough: ${row.fix}`));
    }

    console.log(chalk.cyan.bold('\n🚀 Next steps:'));
    console.log(chalk.white('  1. npm start'));
    console.log(chalk.white('  2. Open http://localhost:3456 and press "Generate Content"'));
    console.log(chalk.white('     (or wait — it generates automatically every day at 6 AM)'));
    console.log(chalk.white('  3. Finished videos land in data/videos/ and upload as PRIVATE'));
    console.log(chalk.gray('\nChanged your mind about anything? Just run: npm run walkthrough'));
  }
}

if (require.main === module) {
  new SetupWalkthrough().run().catch(error => {
    console.error(chalk.red('\nWalkthrough failed:'), error.message);
    console.log(chalk.yellow('Your progress so far is saved — re-run: npm run walkthrough'));
    process.exit(1);
  });
}

module.exports = { SetupWalkthrough, AI_PROVIDER_GUIDE };
