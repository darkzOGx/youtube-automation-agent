const { CredentialManager } = require('./utils/credential-manager');
const { Database } = require('./database/db');
const { Logger } = require('./utils/logger');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

class YouTubeAutomationSetup {
  constructor() {
    this.logger = new Logger('Setup');
    this.credentialManager = new CredentialManager();
    this.database = new Database();
  }

  async run() {
    console.log(chalk.cyan.bold('\n🎬 YouTube Automation Agent Setup'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.cyan('Welcome to the YouTube Automation Agent setup wizard!'));
    console.log(chalk.gray('This will configure your system for fully automated YouTube content creation.\n'));

    try {
      // Step 1: Create directories
      await this.createDirectories();
      
      // Step 2: Initialize database
      await this.initializeDatabase();
      
      // Step 3: Run credential setup
      await this.credentialManager.runSetupWizard();
      
      // Step 4: Create environment file
      await this.createEnvironmentFile();
      
      // Step 5: Install additional dependencies if needed
      await this.installDependencies();
      
      // Step 6: Create startup scripts
      await this.createStartupScripts();
      
      // Step 7: Final validation
      await this.validateSetup();
      
      console.log(chalk.green.bold('\n🎉 Setup completed successfully!'));
      console.log(chalk.cyan('\n📋 Next steps:'));
      console.log(chalk.white('1. Run: npm start'));
      console.log(chalk.white('2. Visit: http://localhost:3456'));
      console.log(chalk.white('3. Your first video will be generated and scheduled within 24 hours'));
      
      console.log(chalk.gray('\n═'.repeat(60)));
      console.log(chalk.yellow('🤖 Your YouTube channel is now fully automated!'));

    } catch (error) {
      console.log(chalk.red.bold('\n❌ Setup failed!'));
      console.log(chalk.red(error.message));
      process.exit(1);
    }
  }

  async createDirectories() {
    console.log(chalk.cyan('\n📁 Creating directory structure...'));
    
    const directories = [
      'config',
      'logs',
      'data',
      'data/production',
      'data/assets',
      'data/videos',
      'data/audio',
      'data/scripts',
      'data/captions',
      'data/thumbnail-templates',
      'temp/processing',
      'uploads/thumbnails'
    ];

    for (const dir of directories) {
      const fullPath = path.join(__dirname, dir);
      await fs.mkdir(fullPath, { recursive: true });
      console.log(chalk.gray(`  ✓ Created: ${dir}`));
    }

    console.log(chalk.green('✅ Directory structure created'));
  }

  async initializeDatabase() {
    console.log(chalk.cyan('\n🗄️  Initializing database...'));
    
    await this.database.initialize();
    
    console.log(chalk.green('✅ Database initialized'));
  }

  async createEnvironmentFile() {
    console.log(chalk.cyan('\n🔧 Creating environment configuration...'));
    
    const envContent = `# YouTube Automation Agent Environment Configuration
# Generated on ${new Date().toISOString()}

# Application Settings
NODE_ENV=production
PORT=3456
LOG_LEVEL=info

# YouTube Settings
YOUTUBE_REGION=US
DEFAULT_PRIVACY_STATUS=private

# Content Settings
AUTO_SHORTEN_CONTENT=true
AUTO_ADD_BACKLINKS=true
PRESERVE_FORMATTING=true
AUTO_RESIZE_IMAGES=true
MAX_IMAGE_WIDTH=1280
MAX_IMAGE_HEIGHT=720
IMAGE_QUALITY=90

# Rate Limiting
GLOBAL_RATE_LIMIT_PER_HOUR=50
DEFAULT_DELAY_BETWEEN_POSTS=60000

# TTS Settings
TTS_VOICE=neural_voice_1

# Analytics & Monitoring
ENABLE_ANALYTICS=true
ANALYTICS_DB_PATH=./data/analytics.db

# File Upload Settings
MAX_FILE_SIZE=52428800
UPLOAD_PATH=./uploads

# Error Handling
RETRY_ATTEMPTS=3
RETRY_DELAY=5000

# Automation Settings
DAILY_CONTENT_ENABLED=true
AUTO_PUBLISH_ENABLED=true
OPTIMIZATION_ENABLED=true
CONTENT_BUFFER_DAYS=3
MAX_DAILY_POSTS=1

# Notification Settings
NOTIFICATION_ENABLED=true

# Debug Settings (Development only)
DEBUG_MODE=false
VERBOSE_LOGGING=false
SAVE_SCREENSHOTS=false
SCREENSHOT_PATH=./debug/screenshots
`;

    await fs.writeFile(path.join(__dirname, '.env'), envContent);
    console.log(chalk.green('✅ Environment file created'));
  }


  async installDependencies() {
    console.log(chalk.cyan('\n📦 Checking dependencies...'));
    
    try {
      // Check if package.json exists and dependencies are installed
      const packagePath = path.join(__dirname, 'package.json');
      const nodeModulesPath = path.join(__dirname, 'node_modules');
      
      try {
        await fs.access(nodeModulesPath);
        console.log(chalk.green('✅ Dependencies already installed'));
      } catch (error) {
        console.log(chalk.yellow('⚠️  Dependencies not installed. Please run: npm install'));
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not verify dependencies'));
    }
  }

  async createStartupScripts() {
    console.log(chalk.cyan('\n🚀 Creating startup scripts...'));
    
    // Create Windows batch file
    const windowsScript = `@echo off
echo Starting YouTube Automation Agent...
node index.js
pause`;
    
    await fs.writeFile(path.join(__dirname, 'start.bat'), windowsScript);
    
    // Create Unix shell script
    const unixScript = `#!/bin/bash
echo "Starting YouTube Automation Agent..."
node index.js`;
    
    await fs.writeFile(path.join(__dirname, 'start.sh'), unixScript);
    
    // Create PM2 ecosystem file for production
    const pm2Config = {
      apps: [{
        name: 'youtube-automation-agent',
        script: 'index.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
          NODE_ENV: 'production',
          PORT: 3456
        }
      }]
    };
    
    await fs.writeFile(
      path.join(__dirname, 'ecosystem.config.js'), 
      `module.exports = ${JSON.stringify(pm2Config, null, 2)};`
    );
    
    console.log(chalk.green('✅ Startup scripts created'));
  }

  async validateSetup() {
    console.log(chalk.cyan('\n🔍 Validating setup...'));
    
    const validation = {
      directories: true,
      database: false,
      credentials: false,
      environment: false
    };

    // Check directories
    try {
      await fs.access(path.join(__dirname, 'data'));
      await fs.access(path.join(__dirname, 'logs'));
      await fs.access(path.join(__dirname, 'config'));
    } catch (error) {
      validation.directories = false;
    }

    // Check database
    try {
      const stats = await this.database.getStats();
      validation.database = true;
    } catch (error) {
      validation.database = false;
    }

    // Check credentials
    validation.credentials = await this.credentialManager.validateAll();

    // Check environment
    try {
      await fs.access(path.join(__dirname, '.env'));
      validation.environment = true;
    } catch (error) {
      validation.environment = false;
    }

    // Display validation results
    Object.entries(validation).forEach(([component, valid]) => {
      const icon = valid ? '✅' : '❌';
      const color = valid ? chalk.green : chalk.red;
      console.log(color(`  ${icon} ${component}`));
    });

    const allValid = Object.values(validation).every(Boolean);
    
    if (!allValid) {
      throw new Error('Setup validation failed. Please check the errors above.');
    }

    console.log(chalk.green('✅ All validations passed'));
  }

  async createSampleContent() {
    console.log(chalk.cyan('\n📝 Creating sample content templates...'));
    
    // Create sample script template
    const sampleScript = {
      title: "Getting Started with YouTube Automation",
      hook: {
        type: "question",
        text: "Have you ever wondered how top YouTubers manage to post consistently?"
      },
      introduction: {
        greeting: "Hey everyone, welcome back to the channel!",
        topicIntro: "Today, we're diving into YouTube automation.",
        valueProposition: "By the end of this video, you'll understand how automation can transform your channel."
      },
      mainContent: {
        sections: [
          {
            title: "What is YouTube Automation?",
            content: "YouTube automation is the process of using technology to handle repetitive tasks in content creation and channel management."
          },
          {
            title: "Benefits of Automation",
            content: "Automation saves time, ensures consistency, and allows you to focus on strategy rather than execution."
          }
        ]
      }
    };

    await fs.writeFile(
      path.join(__dirname, 'data', 'sample-script.json'),
      JSON.stringify(sampleScript, null, 2)
    );

    console.log(chalk.green('✅ Sample content created'));
  }
}

// Run setup if called directly
if (require.main === module) {
  const setup = new YouTubeAutomationSetup();
  setup.run().catch(error => {
    console.error(chalk.red('Setup failed:'), error);
    process.exit(1);
  });
}

module.exports = { YouTubeAutomationSetup };