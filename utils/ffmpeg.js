const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let cachedPath = null;

function findSystemFFmpeg() {
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const pathValue = process.env.PATH || process.env.Path || '';
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  const match = directories
    .map(directory => path.join(directory, executable))
    .find(candidate => fs.existsSync(candidate));
  return match || 'ffmpeg';
}

/**
 * Resolve the FFmpeg binary to use, in order of preference:
 * 1. FFMPEG_PATH environment variable
 * 2. Bundled binary from the optional ffmpeg-static package
 * 3. `ffmpeg` on the system PATH
 */
function getFFmpegPath() {
  if (cachedPath) {
    return cachedPath;
  }

  if (process.env.FFMPEG_PATH) {
    cachedPath = process.env.FFMPEG_PATH;
    return cachedPath;
  }

  try {
    const bundledPath = require('ffmpeg-static');
    cachedPath = bundledPath && fs.existsSync(bundledPath) ? bundledPath : null;
  } catch {
    cachedPath = null;
  }

  cachedPath = cachedPath || findSystemFFmpeg();
  return cachedPath;
}

async function checkFFmpeg() {
  try {
    await execFileAsync(getFFmpegPath(), ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(getFFmpegPath(), args, { windowsHide: true });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let spawnError = null;
    let outputLimitError = null;

    const collect = (target, chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 32 * 1024 * 1024 && !outputLimitError) {
        outputLimitError = new Error('FFmpeg output exceeded the 32 MB limit');
        child.kill();
        return;
      }
      target.push(chunk);
    };

    child.stdout.on('data', chunk => collect(stdout, chunk));
    child.stderr.on('data', chunk => collect(stderr, chunk));
    child.once('error', error => {
      spawnError = error;
    });
    child.once('close', (code, signal) => {
      const stdoutText = Buffer.concat(stdout).toString();
      const stderrText = Buffer.concat(stderr).toString();
      if (spawnError) {
        spawnError.stdout = stdoutText;
        spawnError.stderr = stderrText;
        reject(spawnError);
      } else if (outputLimitError) {
        outputLimitError.stdout = stdoutText;
        outputLimitError.stderr = stderrText;
        reject(outputLimitError);
      } else if (code !== 0) {
        const error = new Error(`FFmpeg exited with code ${code}${signal ? ` (${signal})` : ''}`);
        error.code = code;
        error.signal = signal;
        error.stdout = stdoutText;
        error.stderr = stderrText;
        reject(error);
      } else {
        resolve({ stdout: stdoutText, stderr: stderrText });
      }
    });
  });
}

function ffmpegInstallHint() {
  const hints = {
    win32: 'winget install Gyan.FFmpeg (then restart your terminal)',
    darwin: 'brew install ffmpeg',
    linux: 'sudo apt install ffmpeg (or your distro equivalent)'
  };

  const platformHint = hints[process.platform] || 'https://ffmpeg.org/download.html';
  return `FFmpeg not found. Install it with: ${platformHint} — or run "npm install" again to fetch the bundled ffmpeg-static binary, or set FFMPEG_PATH to your ffmpeg executable.`;
}

module.exports = { getFFmpegPath, checkFFmpeg, runFFmpeg, ffmpegInstallHint };
