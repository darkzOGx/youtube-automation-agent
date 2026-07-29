// test-gemini.js
// A simple, standalone script that checks whether your project can talk to
// Google's Gemini AI. Run it with:   npm run test:gemini
//
// It does three things:
//   1. Loads your secret key from the .env file.
//   2. Sends one short test message to Gemini.
//   3. Prints SUCCESS if Gemini answers, or a helpful error if it doesn't.

// This line reads your .env file and loads values like GEMINI_API_KEY
// into process.env so the rest of the code can use them.
require('dotenv').config();

const chalk = require('chalk');
const { GeminiService } = require('./utils/gemini-service');

async function main() {
  console.log(chalk.cyan.bold('\n💎 Gemini Connection Test'));
  console.log(chalk.gray('─'.repeat(50)));

  const gemini = new GeminiService();

  // Step 1: Do we even have a key?
  if (!gemini.isConfigured()) {
    console.log(chalk.red('❌ No API key found.'));
    console.log(chalk.yellow('   Add this line to your .env file, then run again:'));
    console.log(chalk.white('   GEMINI_API_KEY=your-key-here'));
    process.exit(1);
  }

  console.log(chalk.white('🔑 API key:  ') + chalk.green('found'));
  console.log(chalk.white('🤖 Model:    ') + chalk.cyan(gemini.model));
  console.log(chalk.gray('\nSending a test message to Google... please wait.'));

  // Step 2 & 3: Try to talk to Gemini.
  try {
    const reply = await gemini.testConnection();
    console.log(chalk.white('\n📨 Gemini replied: ') + chalk.green(reply.trim()));
    console.log(chalk.green.bold('\n✅ SUCCESS — your project is communicating with Gemini!\n'));
  } catch (error) {
    console.log(chalk.red('\n❌ FAILED to reach Gemini.'));
    console.log(chalk.red('   Reason: ') + error.message);

    // Beginner-friendly hints for the most common problems:
    if (/API key|API_KEY|invalid|permission/i.test(error.message)) {
      console.log(chalk.yellow('   → Check your key in .env (no quotes, no spaces around it).'));
      console.log(chalk.yellow('   → Make sure you copied the whole key from Google AI Studio.'));
    }
    if (/quota|429|rate/i.test(error.message)) {
      console.log(chalk.yellow('   → You hit the free-tier limit. Wait ~60 seconds and retry.'));
    }
    if (/model|not found|404/i.test(error.message)) {
      console.log(chalk.yellow('   → Try setting GEMINI_MODEL=gemini-2.5-flash in your .env.'));
    }
    console.log('');
    process.exit(1);
  }
}

main();
