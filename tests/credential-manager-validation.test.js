const assert = require('assert');

const { CredentialManager } = require('../utils/credential-manager');

function managerWith(credentials) {
  const manager = new CredentialManager();
  manager.loadCredentials = async () => {
    manager.credentials = credentials;
  };
  manager.loadTokens = async () => {
    manager.tokens = { youtube: { access_token: 'token' } };
  };
  return manager;
}

async function main() {
  assert.strictEqual(
    await managerWith({
      aiService: 'gemini',
      youtube: {},
      gemini: { apiKey: 'gemini-key' },
    }).validateAll(),
    true,
    'Gemini setup should validate without OpenAI credentials',
  );

  assert.strictEqual(
    await managerWith({
      aiService: 'openai',
      youtube: {},
      gemini: { apiKey: 'gemini-key' },
    }).validateAll(),
    false,
    'OpenAI setup should still require OpenAI credentials',
  );

  assert.strictEqual(
    await managerWith({
      youtube: {},
      gemini: { apiKey: 'gemini-key' },
    }).validateAll(),
    true,
    'Existing configs without aiService should accept any configured AI provider',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
