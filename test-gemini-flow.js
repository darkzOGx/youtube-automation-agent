const { Database } = require('./database/db');
const { CredentialManager } = require('./utils/credential-manager');
const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
const { ScriptWriterAgent } = require('./agents/script-writer-agent');
const { AIVideoGenerator } = require('./utils/ai-video-generator');
const chalk = require('chalk');

async function testGeminiFlow() {
  console.log(chalk.cyan.bold('\n🧪 Testing YouTube Automation Agent - Google Gemini & Pollinations Flow'));
  console.log(chalk.gray('═'.repeat(70)));

  // Initialize DB
  const db = new Database();
  await db.initialize();

  // Load Credentials
  const credentials = new CredentialManager();
  await credentials.initialize();

  // Check if credentials are valid
  const valid = await credentials.validateAll();
  console.log(valid ? chalk.green('✓ Credentials validated successfully!') : chalk.yellow('⚠️ Validation warning'));

  // Test Strategy & Script Generation
  try {
    const strategyAgent = new ContentStrategyAgent(db, credentials);
    await strategyAgent.initialize();
    
    const scriptWriter = new ScriptWriterAgent(db, credentials);
    await scriptWriter.initialize();

    console.log(chalk.cyan('\n1. Generating Content Strategy for: "Kisah Kancil Cerdik dan Buaya"'));
    const strategy = await strategyAgent.generateContentStrategy("Kisah Kancil Cerdik dan Buaya");
    console.log(chalk.green('✓ Strategy Generated!'));
    console.log(JSON.stringify(strategy, null, 2));

    console.log(chalk.cyan('\n2. Generating Script using Google Gemini...'));
    const script = await scriptWriter.generateScript(strategy);
    console.log(chalk.green('✓ Script Generated successfully via Gemini!'));
    console.log(chalk.yellow(`Title: ${script.title}`));
    console.log(chalk.white(`Estimated Duration: ${script.duration}`));
    console.log(chalk.gray(`Script snippet: ${script.fullScript.substring(0, 500)}...`));

    // Test Image / Thumbnail Generation
    console.log(chalk.cyan('\n3. Initializing AI Video Generator & Testing Visual Asset Generation...'));
    const generator = new AIVideoGenerator(credentials.credentials);
    
    console.log(chalk.cyan('Generating a cartoon visual scene via Pollinations (Gemini-enhanced)...'));
    const images = await generator.generateVisualAssets("Kancil cerdik berdiri di pinggir sungai yang jernih, tersenyum lebar", "animated", 1);
    console.log(chalk.green('✓ Visual asset generated!'));
    console.log(chalk.white(`Local Image Path: ${images[0]}`));

    console.log(chalk.cyan('Generating a YouTube Thumbnail via Pollinations...'));
    const thumbnail = await generator.generateThumbnail(script, "animated");
    console.log(chalk.green('✓ Thumbnail generated!'));
    console.log(chalk.white(`Local Thumbnail Path: ${thumbnail.path}`));
    console.log(chalk.white(`URL: ${thumbnail.url}`));

    console.log(chalk.green.bold('\n🎉 Gemini & Pollinations full flow completed successfully!'));
  } catch (error) {
    console.error(chalk.red('\n❌ Test Flow Failed:'), error);
  } finally {
    await db.close();
  }
}

testGeminiFlow();
