const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');

class SimpleAuth {
  constructor() {
    this.credentialsPath = path.join(__dirname, 'config', 'credentials.json');
    this.tokensPath = path.join(__dirname, 'config', 'tokens.json');
  }

  async authenticate() {
    console.log(chalk.cyan.bold('\n🔐 YouTube Authentication'));
    console.log(chalk.gray('═'.repeat(50)));
    
    try {
      // Load credentials
      const credentials = JSON.parse(fs.readFileSync(this.credentialsPath));
      
      const oauth2Client = new google.auth.OAuth2(
        credentials.youtube.client_id,
        credentials.youtube.client_secret,
        'urn:ietf:wg:oauth:2.0:oob'  // This should work for desktop apps
      );

      // Try the installed application flow
      const scopes = [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly'
      ];

      // Generate auth URL for manual flow
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
      });

      console.log(chalk.cyan('\n🔗 Please visit this URL to authorize the application:'));
      console.log(chalk.blue(authUrl));
      console.log(chalk.yellow('\nCopy the URL, visit it in your browser, and authorize the application.'));
      console.log(chalk.red.bold('⚠️  CRITICAL: When selecting a Google Account, you MUST select the specific YouTube Channel (Brand Account) you want to upload to (e.g. Cerita Singkatku). Do NOT select your main email account unless you want videos uploaded there!'));
      console.log(chalk.yellow('Then copy the authorization code that appears and paste it below.'));
      
      // Get the authorization code from user
      const { code } = await inquirer.prompt([
        {
          type: 'input',
          name: 'code',
          message: 'Enter the authorization code:',
          validate: input => input.length > 0 || 'Authorization code is required'
        }
      ]);

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      // Save tokens
      const tokenData = { youtube: tokens };
      fs.writeFileSync(this.tokensPath, JSON.stringify(tokenData, null, 2));
      
      console.log(chalk.green('\n✅ Authentication successful!'));
      console.log(chalk.green('✅ Tokens saved to config/tokens.json'));
      
      return tokens;
    } catch (error) {
      console.error(chalk.red('Authentication failed:'), error.message);
      throw error;
    }
  }

  async testAuthentication() {
    try {
      const tokens = JSON.parse(fs.readFileSync(this.tokensPath));
      const credentials = JSON.parse(fs.readFileSync(this.credentialsPath));
      
      const oauth2Client = new google.auth.OAuth2(
        credentials.youtube.client_id,
        credentials.youtube.client_secret,
        'urn:ietf:wg:oauth:2.0:oob'
      );
      
      oauth2Client.setCredentials(tokens.youtube);
      
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const response = await youtube.channels.list({
        part: 'snippet',
        mine: true
      });
      
      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        console.log(chalk.green(`✅ Connected to channel: ${channel.snippet.title}`));
        return true;
      } else {
        console.log(chalk.red('❌ No channel found'));
        return false;
      }
    } catch (error) {
      console.error(chalk.red('Authentication test failed:'), error.message);
      return false;
    }
  }
}

async function runAuth() {
  const auth = new SimpleAuth();
  
  console.log(chalk.cyan.bold('\n🎬 YouTube Automation Agent - Authentication Setup'));
  
  try {
    await auth.authenticate();
    
    console.log(chalk.cyan('\n🧪 Testing authentication...'));
    const success = await auth.testAuthentication();
    
    if (success) {
      console.log(chalk.green.bold('\n🎉 Authentication complete!'));
      console.log(chalk.cyan('Your YouTube Automation Agent is ready to start.'));
      console.log(chalk.yellow('Run: npm start'));
    } else {
      console.log(chalk.red('\n❌ Authentication test failed.'));
    }
  } catch (error) {
    console.error(chalk.red('\nAuthentication setup failed:'), error);
    process.exit(1);
  }
}

if (require.main === module) {
  runAuth();
}

module.exports = { SimpleAuth };