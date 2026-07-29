// test-claude.js
// Checks whether your project can talk to Anthropic's Claude.
// Run it with:   npm run test:claude

require('dotenv').config();

const chalk = require('chalk');
const { ClaudeService } = require('./utils/claude-service');

async function main() {
  console.log(chalk.cyan.bold('\n🧠 Claude Connection Test'));
  console.log(chalk.gray('─'.repeat(50)));

  const claude = new ClaudeService();

  if (!claude.isConfigured()) {
    console.log(chalk.red('❌ No API key found.'));
    console.log(chalk.yellow('   Add this line to your .env file, then run again:'));
    console.log(chalk.white('   ANTHROPIC_API_KEY=your-key-here'));
    process.exit(1);
  }

  console.log(chalk.white('🔑 API key:  ') + chalk.green('found'));
  console.log(chalk.white('🤖 Model:    ') + chalk.cyan(claude.model));
  console.log(chalk.gray('\nSending a test message to Anthropic... please wait.'));

  try {
    const reply = await claude.generateText('Reply with exactly these three words: CLAUDE CONNECTION OK');
    console.log(chalk.white('\n📨 Claude replied: ') + chalk.green(reply.trim()));
    console.log(chalk.green.bold('\n✅ SUCCESS — your project is communicating with Claude!\n'));
  } catch (error) {
    console.log(chalk.red('\n❌ FAILED to reach Claude.'));
    console.log(chalk.red('   Reason: ') + error.message);

    if (/api|key|authentication|401/i.test(error.message)) {
      console.log(chalk.yellow('   → Check your key in .env (no quotes, no spaces around it).'));
    }
    if (/rate|429|overloaded|529/i.test(error.message)) {
      console.log(chalk.yellow('   → Rate limited or overloaded. Wait a moment and retry.'));
    }
    if (/model|not_found|404/i.test(error.message)) {
      console.log(chalk.yellow('   → Try setting CLAUDE_MODEL=claude-haiku-4-5 in your .env.'));
    }
    console.log('');
    process.exit(1);
  }
}

main();
