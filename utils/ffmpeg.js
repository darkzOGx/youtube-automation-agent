const { execFile } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let cachedPath = null;

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
    cachedPath = require('ffmpeg-static');
  } catch (error) {
    cachedPath = null;
  }

  cachedPath = cachedPath || 'ffmpeg';
  return cachedPath;
}

async function checkFFmpeg() {
  try {
    await execFileAsync(getFFmpegPath(), ['-version']);
    return true;
  } catch (error) {
    return false;
  }
}

async function runFFmpeg(args) {
  return execFileAsync(getFFmpegPath(), args, { maxBuffer: 32 * 1024 * 1024 });
}

function getFFprobePath() {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const ffmpegPath = getFFmpegPath();
  if (ffmpegPath !== 'ffmpeg') {
    const candidate = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    if (candidate !== ffmpegPath && fs.existsSync(candidate)) return candidate;
  }
  return 'ffprobe';
}

async function getMediaDuration(filePath) {
  try {
    const { stdout } = await execFileAsync(getFFprobePath(), [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ]);
    const duration = Number(String(stdout || '').trim());
    if (Number.isFinite(duration) && duration > 0) return duration;
  } catch (_error) {
    // The bundled ffmpeg-static package does not include ffprobe; use FFmpeg's metadata output below.
  }

  try {
    await runFFmpeg(['-i', filePath]);
  } catch (error) {
    const match = String(error.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    if (match) {
      const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      if (Number.isFinite(duration) && duration > 0) return duration;
    }
  }
  throw new Error(`Could not determine media duration for ${filePath}`);
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

module.exports = { getFFmpegPath, getFFprobePath, getMediaDuration, checkFFmpeg, runFFmpeg, ffmpegInstallHint };
