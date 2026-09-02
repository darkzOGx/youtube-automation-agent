const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { runFFmpeg } = require('./ffmpeg');

const SHORT_WIDTH = 1080;
const SHORT_HEIGHT = 1920;
const MOTION_WIDTH = 720;
const MOTION_HEIGHT = 1280;
const DEFAULT_FPS = 30;
const DEFAULT_FADE_DURATION = 0.45;
const DEFAULT_CAPTION_WORDS = 6;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(value, maxCharacters) {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function sceneText(scene = {}, fallbackIndex = 0) {
  if (typeof scene === 'string') {
    return { title: scene, detail: '', accent: '#f6c75d', index: fallbackIndex };
  }

  return {
    title: scene.title || scene.label || scene.heading || `Finance beat ${fallbackIndex + 1}`,
    detail: scene.detail || scene.subtitle || scene.caption || scene.text || '',
    accent: scene.accent || '#f6c75d',
    index: fallbackIndex
  };
}

function cardOverlay(scene, index, width = SHORT_WIDTH, height = SHORT_HEIGHT) {
  const text = sceneText(scene, index);
  const titleLines = wrapText(text.title, 20).slice(0, 3);
  const detailLines = wrapText(text.detail, 28).slice(0, 4);
  const titleY = height - (detailLines.length ? 610 : 470);
  const detailY = titleY + 94;
  const accent = escapeXml(text.accent);

  const titleSvg = titleLines.map((line, lineIndex) => (
    `<tspan x="76" dy="${lineIndex === 0 ? 0 : 70}">${escapeXml(line)}</tspan>`
  )).join('');
  const detailSvg = detailLines.map((line, lineIndex) => (
    `<tspan x="76" dy="${lineIndex === 0 ? 0 : 48}">${escapeXml(line)}</tspan>`
  )).join('');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#061323" stop-opacity="0.06"/>
          <stop offset="0.58" stop-color="#061323" stop-opacity="0.16"/>
          <stop offset="1" stop-color="#061323" stop-opacity="0.96"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="0.72"/>
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#shade)"/>
      <rect x="76" y="78" width="350" height="76" rx="18" fill="${accent}"/>
      <text x="104" y="128" fill="#071522" font-family="Arial, sans-serif" font-size="32px" font-weight="900">MONEY MINUTE</text>
      <text x="76" y="${titleY}" fill="#ffffff" font-family="Arial, sans-serif" font-size="66px" font-weight="900" filter="url(#shadow)">${titleSvg}</text>
      ${detailLines.length ? `<text x="76" y="${detailY}" fill="${accent}" font-family="Arial, sans-serif" font-size="42px" font-weight="700" filter="url(#shadow)">${detailSvg}</text>` : ''}
      <text x="76" y="${height - 76}" fill="#e6edf5" font-family="Arial, sans-serif" font-size="25px" font-weight="600" opacity="0.92">Education only | No guaranteed returns</text>
    </svg>`;
}

function getSourceValue(source) {
  if (typeof source === 'string' || Buffer.isBuffer(source)) return source;
  if (source && (typeof source.path === 'string' || Buffer.isBuffer(source.path))) return source.path;
  throw new Error('Each Short source image must be a file path, Buffer, or { path } object');
}

async function createVerticalCard(source, scene, outputPath, options = {}) {
  const index = Number.isInteger(options.index) ? options.index : 0;
  const positions = ['centre', 'north', 'south', 'east', 'west'];
  const position = options.position || positions[index % positions.length];
  const brightness = Number.isFinite(options.brightness)
    ? options.brightness
    : 0.96 + ((index % 4) * 0.025);
  const saturation = Number.isFinite(options.saturation)
    ? options.saturation
    : 0.92 + ((index % 3) * 0.06);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  let image = sharp(getSourceValue(source))
    .resize(SHORT_WIDTH, SHORT_HEIGHT, { fit: 'cover', position })
    .modulate({ brightness, saturation });

  if (options.sharpen !== false) image = image.sharpen(0.6);

  await image
    .composite([{ input: Buffer.from(cardOverlay(scene, index)) }])
    .removeAlpha()
    .png()
    .toFile(outputPath);

  return outputPath;
}

/**
 * Create one local vertical card per scene. Callers can provide a dedicated
 * source for every beat; the renderer itself never invokes an image or
 * animation API.
 */
async function createVerticalCards(sourceImages, scenes, outputDir, options = {}) {
  if (!Array.isArray(sourceImages) || sourceImages.length === 0) {
    throw new Error('At least one source image is required to create Short cards');
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('At least one scene is required to create Short cards');
  }

  const cards = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const outputPath = path.join(outputDir, `card_${String(index + 1).padStart(2, '0')}.png`);
    const source = sourceImages[index % sourceImages.length];
    await createVerticalCard(source, scenes[index], outputPath, { ...options, index });
    cards.push(outputPath);
  }

  return cards;
}

function splitWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

function chunkWords(textOrWords, maxWords = DEFAULT_CAPTION_WORDS) {
  const words = Array.isArray(textOrWords) ? textOrWords.filter(Boolean) : splitWords(textOrWords);
  const size = Math.max(1, Math.floor(Number(maxWords) || DEFAULT_CAPTION_WORDS));
  const chunks = [];

  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size));
  }

  return chunks;
}

function formatSrtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
  const remainder = milliseconds % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(remainder).padStart(3, '0')}`;
}

function createSrtCaptions(text, duration, options = {}) {
  const words = splitWords(text);
  const totalDuration = Number(duration);
  if (words.length === 0) return '';
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    throw new Error('Caption duration must be a positive number');
  }

  const chunks = chunkWords(words, options.maxWords || DEFAULT_CAPTION_WORDS);
  let wordCursor = 0;
  return chunks.map((chunk, index) => {
    const start = totalDuration * (wordCursor / words.length);
    wordCursor += chunk.length;
    const end = index === chunks.length - 1
      ? totalDuration
      : totalDuration * (wordCursor / words.length);
    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${chunk.join(' ')}\n`;
  }).join('\n');
}

function estimateNarrationDuration(text, wordsPerMinute = 150) {
  const words = splitWords(text).length;
  const rate = Math.max(1, Number(wordsPerMinute) || 150);
  return Math.max(1, (words / rate) * 60);
}

function parseDuration(text) {
  const match = String(text || '').match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function probeAudioDuration(audioPath) {
  let output = '';
  try {
    const result = await runFFmpeg(['-hide_banner', '-i', audioPath, '-f', 'null', '-']);
    output = `${result.stdout || ''}\n${result.stderr || ''}`;
  } catch (error) {
    output = `${error.stdout || ''}\n${error.stderr || ''}`;
  }

  const duration = parseDuration(output);
  if (!duration || duration <= 0) {
    throw new Error(`Could not measure narration duration: ${audioPath}`);
  }
  return duration;
}

async function isUsableAudioFile(audioPath) {
  if (typeof audioPath !== 'string' || audioPath.endsWith('.info')) return false;
  try {
    const stats = await fs.stat(audioPath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

function getEffectiveFadeDuration(totalDuration, cardCount, requested = DEFAULT_FADE_DURATION) {
  const safeRequested = Math.max(0.1, Number(requested) || DEFAULT_FADE_DURATION);
  if (cardCount <= 1) return 0;
  return Math.min(safeRequested, Math.max(0.1, totalDuration / (cardCount * 2)));
}

function sceneWeight(scene) {
  const explicit = Number(scene?.duration);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = scene?.caption || scene?.detail || scene?.subtitle || scene?.title || '';
  return Math.max(1, splitWords(text).length);
}

function calculateCardDurations(totalDuration, scenes, fadeDuration = DEFAULT_FADE_DURATION) {
  const duration = Number(totalDuration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video duration must be positive');
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('At least one scene is required');

  const fade = getEffectiveFadeDuration(duration, scenes.length, fadeDuration);
  const available = duration + (fade * Math.max(0, scenes.length - 1));
  const weights = scenes.map(sceneWeight);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  return {
    durations: weights.map(weight => available * (weight / totalWeight)),
    fadeDuration: fade,
    totalDuration: duration
  };
}

function escapeSubtitleFilterPath(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return normalized
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');
}

function escapeFilterStyle(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

function buildSubtitleFilter(srtPath, forceStyle) {
  const style = forceStyle || 'FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=140';
  return `subtitles=filename='${escapeSubtitleFilterPath(srtPath)}':force_style='${escapeFilterStyle(style)}'`;
}

function kenBurnsFilter(index, duration, fadeFps = DEFAULT_FPS) {
  const frames = Math.max(1, Math.ceil(duration * fadeFps));
  const increment = (0.045 / frames).toFixed(8);
  const direction = index % 4;
  let x;
  let y;

  if (direction === 0) {
    x = `(iw-iw/zoom)*on/${frames}`;
    y = `(ih-ih/zoom)*on/${frames}`;
  } else if (direction === 1) {
    x = `(iw-iw/zoom)*(1-on/${frames})`;
    y = `(ih-ih/zoom)*on/${frames}`;
  } else if (direction === 2) {
    x = `(iw-iw/zoom)*on/${frames}`;
    y = `(ih-ih/zoom)*(1-on/${frames})`;
  } else {
    x = `(iw-iw/zoom)*(1-on/${frames})`;
    y = `(ih-ih/zoom)*(1-on/${frames})`;
  }

  return `zoompan=z=min(zoom+${increment}\\,1.045):x=${x}:y=${y}:d=1:s=${MOTION_WIDTH}x${MOTION_HEIGHT}:fps=${fadeFps},scale=${SHORT_WIDTH}:${SHORT_HEIGHT}:flags=bilinear,format=yuv420p,setsar=1`;
}

async function renderMotionVideo(cards, durations, fadeDuration, outputPath, options = {}) {
  if (!Array.isArray(cards) || cards.length === 0) throw new Error('No cards to render');
  if (cards.length !== durations.length) throw new Error('Card and duration counts do not match');

  const fps = Number(options.fps) || DEFAULT_FPS;
  const motionDir = `${outputPath}.motion-cards`;
  await fs.mkdir(motionDir, { recursive: true });

  try {
    const motionCards = [];
    for (let index = 0; index < cards.length; index += 1) {
      const motionCard = path.join(motionDir, `motion_${String(index + 1).padStart(2, '0')}.png`);
      await sharp(cards[index])
        .resize(MOTION_WIDTH, MOTION_HEIGHT, { fit: 'fill' })
        .removeAlpha()
        .png()
        .toFile(motionCard);
      motionCards.push(motionCard);
    }

    const args = ['-y', '-nostdin', '-loglevel', 'error'];
    for (let index = 0; index < motionCards.length; index += 1) {
      args.push('-loop', '1', '-framerate', String(fps), '-t', durations[index].toFixed(4), '-i', motionCards[index]);
    }

    const filters = cards.map((_, index) => (
      `[${index}:v]${kenBurnsFilter(index, durations[index], fps)}[v${index}]`
    ));
    let current = '[v0]';
    for (let index = 1; index < cards.length; index += 1) {
      const offset = durations.slice(0, index).reduce((sum, value) => sum + value, 0) - (index * fadeDuration);
      const output = `[xf${index}]`;
      filters.push(`${current}[v${index}]xfade=transition=fade:duration=${fadeDuration.toFixed(4)}:offset=${offset.toFixed(4)}${output}`);
      current = output;
    }
    filters.push(`${current}format=yuv420p[vfinal]`);
    const outputDuration = durations.reduce((sum, value) => sum + value, 0)
      - (fadeDuration * Math.max(0, cards.length - 1));

    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[vfinal]',
      '-an',
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', options.preset || 'veryfast',
      '-crf', String(options.crf || 20),
      '-pix_fmt', 'yuv420p',
      '-t', outputDuration.toFixed(4),
      '-frames:v', String(Math.max(1, Math.ceil(outputDuration * fps))),
      outputPath
    );
    await runFFmpeg(args);
  } finally {
    await fs.rm(motionDir, { recursive: true, force: true }).catch(() => {});
  }
  return outputPath;
}

async function burnCaptionsAndAudio(visualPath, audioPath, srtPath, outputPath, duration, options = {}) {
  const hasAudio = await isUsableAudioFile(audioPath);
  const args = ['-y', '-nostdin', '-loglevel', 'error', '-i', visualPath];
  if (hasAudio) args.push('-i', audioPath);

  args.push(
    '-vf', buildSubtitleFilter(srtPath, options.forceStyle),
    '-map', '0:v:0',
    '-c:v', 'libx264',
    '-preset', options.preset || 'veryfast',
    '-crf', String(options.crf || 20),
    '-pix_fmt', 'yuv420p'
  );

  if (hasAudio) {
    args.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '128k', '-shortest');
  } else {
    args.push('-an', '-t', String(duration));
  }

  args.push('-movflags', '+faststart', outputPath);
  await runFFmpeg(args);
  return outputPath;
}

async function renderShortVideo(options = {}) {
  const {
    sourceImages,
    scenes,
    narrationText,
    audioPath,
    outputPath,
    srtPath = outputPath && outputPath.replace(/\.mp4$/i, '.srt'),
    cardsDir = outputPath && path.join(path.dirname(outputPath), 'cards'),
    allowSilent = false
  } = options;

  if (!outputPath) throw new Error('outputPath is required');
  if (!narrationText || splitWords(narrationText).length === 0) throw new Error('narrationText is required');
  if (!srtPath || !cardsDir) throw new Error('srtPath and cardsDir are required');

  const audioAvailable = await isUsableAudioFile(audioPath);
  let measuredDuration;
  if (audioAvailable) {
    measuredDuration = await probeAudioDuration(audioPath);
  } else if (!allowSilent) {
    throw new Error('A usable narration audio file is required; pass allowSilent only for an intentional silent preview');
  } else {
    measuredDuration = Number(options.duration) > 0
      ? Number(options.duration)
      : estimateNarrationDuration(narrationText);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(srtPath), { recursive: true });
  await fs.writeFile(
    srtPath,
    createSrtCaptions(narrationText, measuredDuration, { maxWords: options.captionMaxWords }),
    'utf8'
  );

  const cards = await createVerticalCards(sourceImages, scenes, cardsDir, options.cardOptions);
  const timing = calculateCardDurations(measuredDuration, scenes, options.fadeDuration);
  const visualPath = options.visualPath || outputPath.replace(/\.mp4$/i, '_visual.mp4');

  try {
    await renderMotionVideo(cards, timing.durations, timing.fadeDuration, visualPath, options);
    await burnCaptionsAndAudio(visualPath, audioAvailable ? audioPath : null, srtPath, outputPath, measuredDuration, options);
  } finally {
    if (!options.keepVisual) await fs.rm(visualPath, { force: true }).catch(() => {});
  }

  return {
    outputPath,
    srtPath,
    cards,
    duration: measuredDuration,
    durations: timing.durations,
    fadeDuration: timing.fadeDuration,
    audioPath: audioAvailable ? audioPath : null,
    silent: !audioAvailable
  };
}

module.exports = {
  SHORT_WIDTH,
  SHORT_HEIGHT,
  buildSubtitleFilter,
  calculateCardDurations,
  cardOverlay,
  chunkWords,
  createCaptions: createSrtCaptions,
  createSrtCaptions,
  createVerticalCard,
  createVerticalCards,
  escapeSubtitleFilterPath,
  escapeSubtitlePath: escapeSubtitleFilterPath,
  estimateNarrationDuration,
  formatSrtTime,
  formatTimestamp: formatSrtTime,
  getEffectiveFadeDuration,
  isUsableAudioFile,
  kenBurnsFilter,
  measureAudioDuration: probeAudioDuration,
  probeAudioDuration,
  renderMotionVideo,
  renderShort: renderShortVideo,
  renderShortVideo
};
