// test-script.js
// Shows the Script Writer agent in action. It generates a real video script
// for a sample topic and prints it, telling you whether the words were
// written by Claude (AI) or by the old built-in templates.
//
// Run it with:   npm run test:script

require('dotenv').config();

const chalk = require('chalk');
const { ScriptWriterAgent } = require('./agents/script-writer-agent');

// The real agent normally saves to a database. For this demo we pass a tiny
// fake "database" that just ignores the save, so we can run it on its own.
const fakeDb = { saveScript: async () => {} };

// A pretend "strategy" — normally produced by the Content Strategy agent.
const sampleStrategy = {
  topic: 'Indoor Hydroponic Gardening',
  angle: 'The Complete Beginner Guide to Indoor Hydroponic Gardening',
  contentType: 'Explainer',
  targetAudience: 'Beginners who want to grow food at home',
  keywords: ['hydroponics', 'indoor gardening', 'grow food at home']
};

async function main() {
  console.log(chalk.cyan.bold('\n📝 Script Writer Test (with Claude)'));
  console.log(chalk.gray('─'.repeat(50)));

  // We pass {} as credentials; the agent will read GEMINI_API_KEY from .env.
  const agent = new ScriptWriterAgent(fakeDb, {});
  await agent.initialize();

  console.log(chalk.gray(`Topic: ${sampleStrategy.topic}`));
  console.log(chalk.gray('Generating script... please wait.\n'));

  const script = await agent.generateScript(sampleStrategy);

  const writtenBy = script.metadata.generatedBy;
  const label = writtenBy === 'claude'
    ? chalk.green('Claude (AI) ✅')
    : chalk.yellow('built-in templates (no Claude key found)');

  console.log(chalk.white('✍️  Written by: ') + label);
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white.bold('TITLE: ') + chalk.cyan(script.title));
  console.log(chalk.white.bold('\nHOOK:  ') + script.hook.text);
  console.log(chalk.white.bold('\nINTRO: ') + script.introduction.greeting);

  console.log(chalk.white.bold('\nFIRST SECTION:'));
  const firstSection = script.mainContent.sections[0];
  console.log(chalk.cyan('  ' + firstSection.title));
  console.log('  ' + (firstSection.content || '(no content)'));

  console.log(chalk.gray('\n─'.repeat(50)));
  if (writtenBy === 'claude') {
    console.log(chalk.green.bold('✅ Success — Claude wrote this script!\n'));
  } else {
    console.log(chalk.yellow('ℹ️  No Claude key detected, so templates were used.'));
    console.log(chalk.yellow('   Add ANTHROPIC_API_KEY to your .env and run again to see AI output.\n'));
  }
}

main().catch(error => {
  console.error(chalk.red('\n❌ Error:'), error.message);
  process.exit(1);
});
