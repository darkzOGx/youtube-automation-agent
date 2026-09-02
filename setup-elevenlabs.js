require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const inquirer = require('inquirer');

const envPath = path.join(__dirname, '.env');

function upsertEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) {
    return contents.replace(pattern, () => line);
  }
  return `${contents.trimEnd()}\n${line}\n`;
}

async function main() {
  const current = await fs.readFile(envPath, 'utf8').catch(() => '');
  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Paste the ElevenLabs SECRET API key (hidden):',
      mask: '*',
      validate: value => value.trim().length > 0 || 'A secret API key is required',
    },
    {
      type: 'input',
      name: 'voiceId',
      message: 'Enter the ElevenLabs Voice ID:',
      default: process.env.ELEVENLABS_VOICE_ID || '',
      validate: value => value.trim().length > 0 || 'A Voice ID is required',
    },
  ]);

  let updated = upsertEnv(current, 'ELEVENLABS_API_KEY', answers.apiKey.trim());
  updated = upsertEnv(updated, 'ELEVENLABS_VOICE_ID', answers.voiceId.trim());
  await fs.writeFile(envPath, updated, 'utf8');
  console.log('ElevenLabs credentials saved locally. Secret values were not printed.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
