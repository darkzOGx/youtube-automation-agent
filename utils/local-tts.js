const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { runFFmpeg } = require('./ffmpeg');

function canUseWindowsSpeech() {
  return process.platform === 'win32';
}

function runPowerShellSpeech(text, wavPath) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$synth.Rate = 0',
    '$synth.Volume = 100',
    '$synth.SetOutputToWaveFile($env:YAA_TTS_OUTPUT)',
    '$synth.Speak([Console]::In.ReadToEnd())',
    '$synth.Dispose()'
  ].join('; ');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script
    ], {
      windowsHide: true,
      env: { ...process.env, YAA_TTS_OUTPUT: wavPath },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stderr = [];
    let spawnError = null;

    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', error => {
      spawnError = error;
    });
    child.once('close', code => {
      if (spawnError) {
        reject(spawnError);
      } else if (code !== 0) {
        reject(new Error(`Windows Speech exited with code ${code}: ${Buffer.concat(stderr).toString().trim()}`));
      } else {
        resolve();
      }
    });

    child.stdin.end(text);
  });
}

async function generateWindowsSpeech(text, outputPath) {
  if (!canUseWindowsSpeech()) {
    throw new Error('Windows System.Speech is only available on Windows');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const wavPath = `${outputPath}.wav`;
  try {
    await runPowerShellSpeech(text, wavPath);
    await runFFmpeg([
      '-y',
      '-i', wavPath,
      '-codec:a', 'libmp3lame',
      '-q:a', '4',
      outputPath
    ]);
    const stats = await fs.stat(outputPath);
    if (!stats.isFile() || stats.size === 0) throw new Error('Windows Speech produced an empty audio file');
    return outputPath;
  } finally {
    await fs.rm(wavPath, { force: true }).catch(() => {});
  }
}

module.exports = { canUseWindowsSpeech, generateWindowsSpeech };
