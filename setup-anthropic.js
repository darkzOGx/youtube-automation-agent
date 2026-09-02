require('dotenv').config();

const { CredentialManager } = require('./utils/credential-manager');

async function main() {
  const manager = new CredentialManager();
  await manager.loadCredentials();
  await manager.setupAnthropicCredentials();
  console.log('Anthropic Claude credentials saved locally.');
}

main().catch(error => {
  console.error(`Anthropic setup failed: ${error.message}`);
  process.exitCode = 1;
});
