const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const { escapeHtml } = require('./utils/security');
const { readJsonSecureSync, writeJsonSecureSync } = require('./utils/secure-store');

class ModernAuth {
  constructor() {
    this.credentialsPath = path.join(__dirname, 'config', 'credentials.json');
    this.tokensPath = path.join(__dirname, 'config', 'tokens.json');
    this.server = null;
  }

  async authenticate() {
    console.log(chalk.cyan.bold('\n🔐 YouTube Authentication (Modern Flow)'));
    console.log(chalk.gray('═'.repeat(60)));
    
    try {
      const credentials = readJsonSecureSync(this.credentialsPath);

      // Use a random high port to avoid conflicts
      const port = 8000 + crypto.randomInt(0, 1000);
      const redirectUri = `http://localhost:${port}/callback`;
      
      const oauth2Client = new google.auth.OAuth2(
        credentials.youtube.client_id,
        credentials.youtube.client_secret,
        redirectUri
      );

      const scopes = [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly'
      ];

      // Start a temporary local server
      await this.startTempServer(port, oauth2Client);
      
      // Generate auth URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
      });

      console.log(chalk.cyan('🔗 Please visit this URL to authorize:'));
      console.log(chalk.blue(authUrl));
      console.log(chalk.yellow(`\n⚡ A temporary server is running on port ${port}`));
      console.log(chalk.yellow('After authorization, you\'ll be redirected automatically.'));
      console.log(chalk.gray('Waiting for authorization...'));
      
      // The server will handle the rest
      return new Promise((resolve, reject) => {
        this.resolveAuth = resolve;
        this.rejectAuth = reject;
        
        // Set timeout
        setTimeout(() => {
          this.cleanup();
          reject(new Error('Authentication timeout (5 minutes)'));
        }, 300000); // 5 minutes
      });
      
    } catch (error) {
      console.error(chalk.red('Authentication failed:'), error.message);
      throw error;
    }
  }

  async startTempServer(port, oauth2Client) {
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <h1>❌ Authorization Error</h1>
            <p>${escapeHtml(error)}</p>
            <p>You can close this window.</p>
          `);
          this.rejectAuth(new Error(`Authorization error: ${error}`));
          return;
        }
        
        if (code) {
          try {
            const { tokens } = await oauth2Client.getToken(code);

            // Save tokens (encrypted at rest when CREDENTIAL_KEY is set; otherwise 0600)
            const tokenData = { youtube: tokens };
            writeJsonSecureSync(this.tokensPath, tokenData);
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1 style="color: #4CAF50;">🎉 Authentication Successful!</h1>
                  <p>Your YouTube Automation Agent has been authorized!</p>
                  <p><strong>"Ethereal Dreamscript"</strong> is ready for automation.</p>
                  <p>You can close this window and return to the terminal.</p>
                </body>
              </html>
            `);
            
            console.log(chalk.green('\n✅ Authentication successful!'));
            this.cleanup();
            this.resolveAuth(tokens);
            
          } catch (tokenError) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <h1>❌ Token Exchange Failed</h1>
              <p>${escapeHtml(tokenError.message)}</p>
            `);
            this.rejectAuth(tokenError);
          }
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>🎬 YouTube Automation Agent</h1>
              <p>Waiting for OAuth callback...</p>
              <p>Please complete the authorization in the other tab.</p>
            </body>
          </html>
        `);
      }
    });
    
    this.server.listen(port, 'localhost');
    console.log(chalk.gray(`Temporary OAuth server started on port ${port}`));
  }
  
  cleanup() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  async testAuthentication() {
    try {
      const tokens = readJsonSecureSync(this.tokensPath);
      const credentials = readJsonSecureSync(this.credentialsPath);
      
      const oauth2Client = new google.auth.OAuth2(
        credentials.youtube.client_id,
        credentials.youtube.client_secret
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
        console.log(chalk.gray(`   Channel ID: ${channel.id}`));
        console.log(chalk.gray(`   Subscribers: ${channel.statistics?.subscriberCount || 'Hidden'}`));
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
  const auth = new ModernAuth();
  
  try {
    await auth.authenticate();
    
    console.log(chalk.cyan('\n🧪 Testing authentication...'));
    const success = await auth.testAuthentication();
    
    if (success) {
      console.log(chalk.green.bold('\n🎉 Authentication Complete!'));
      console.log(chalk.cyan('Your "Ethereal Dreamscript" YouTube automation is ready!'));
      console.log(chalk.yellow('\n📋 Next Steps:'));
      console.log(chalk.white('1. Run: npm start'));
      console.log(chalk.white('2. Visit: http://localhost:3456'));
      console.log(chalk.white('3. Your first video will be generated within 24 hours!'));
    } else {
      console.log(chalk.red('\n❌ Authentication test failed.'));
    }
  } catch (error) {
    console.error(chalk.red('\nAuthentication failed:'), error.message);
    if (error.message.includes('timeout')) {
      console.log(chalk.yellow('\n💡 Try again - the authorization window might have closed.'));
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runAuth();
}

module.exports = { ModernAuth };