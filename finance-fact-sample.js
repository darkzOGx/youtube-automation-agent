require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { AIVideoGenerator } = require('./utils/ai-video-generator');
const { canUseWindowsSpeech, generateWindowsSpeech } = require('./utils/local-tts');
const { createCartoonIllustrations } = require('./utils/cartoon-illustrations');
const { renderShortVideo } = require('./utils/short-video-renderer');
const { runFFmpeg } = require('./utils/ffmpeg');

const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, 'data', 'finance-fact-sample');
const TOPIC = 'How Casinos Make Money Without Every Player Losing';
const SOURCE = 'https://www.gamblingcommission.gov.uk/public-and-players/guide/page/what-is-the-house-edge';
const DISCLAIMER = 'Educational content only. Gambling involves risk and is not a financial strategy.';
const FAST_SPEED = 1.12;
const FAST_MODE = process.argv.includes('--fast') || process.env.FINANCE_SAMPLE_FAST === '1';

const SEGMENTS = [
  { title: 'The business model', detail: 'A casino does not need every customer to lose', kind: 'house', text: 'A casino does not need every customer to lose.' },
  { title: 'Roulette example', detail: 'American roulette has 38 numbered slots', kind: 'chart', text: 'Look at American roulette as a simple example. It has thirty eight numbered slots.' },
  { title: 'Red and black', detail: 'There are 18 red and 18 black slots', kind: 'bucket', text: 'There are eighteen red slots and eighteen black slots.' },
  { title: 'The green slots', detail: 'Two green slots change the odds', kind: 'warning', text: 'But there are also two green slots.' },
  { title: 'Betting red', detail: 'A red bet wins 18 times out of 38', kind: 'target', text: 'If you bet on red, you win on eighteen of thirty eight outcomes, not nineteen of thirty eight.' },
  { title: 'The house edge', detail: 'The average mathematical edge is about 5.26 percent', kind: 'scale', text: 'That difference creates a mathematical house edge of about five point two six percent on that bet.' },
  { title: 'One session', detail: 'A player can still win in the short term', kind: 'coins', text: 'This does not mean every player loses every session. Luck can move either way in the short term.' },
  { title: 'Many bets', detail: 'Probability becomes more useful over a large volume', kind: 'chart', text: 'The edge becomes more useful to the business across a large number of bets.' },
  { title: 'Repeat play', detail: 'Volume gives the odds more opportunities to work', kind: 'clock', text: 'More games and repeat play give that probability more opportunities to show up.' },
  { title: 'More than games', detail: 'Casinos can also earn from rooms food and events', kind: 'people', text: 'The wider business may also earn from rooms, food, entertainment, and events.' },
  { title: 'Gross revenue', detail: 'The edge is not the same as net profit', kind: 'receipt', text: 'The house edge describes expected gaming revenue before operating costs, not guaranteed net profit.' },
  { title: 'The lesson', detail: 'Understand probability before risking money', kind: 'shield', text: `The lesson is to understand the odds and the risks. ${DISCLAIMER}` }
];

const NARRATION = SEGMENTS.map(segment => segment.text).join(' ');

function thumbnailOverlay() {
  return `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#071526" stop-opacity="0.94"/>
        <stop offset="0.72" stop-color="#071526" stop-opacity="0.38"/>
        <stop offset="1" stop-color="#071526" stop-opacity="0.08"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#shade)"/>
    <rect x="54" y="48" width="290" height="62" rx="14" fill="#f6c75d"/>
    <text x="199" y="89" text-anchor="middle" fill="#071526" font-family="Arial, sans-serif" font-size="28" font-weight="900">MONEY MINUTE</text>
    <text x="58" y="290" fill="#ffffff" font-family="Arial, sans-serif" font-size="68" font-weight="900">HOW CASINOS</text>
    <text x="58" y="380" fill="#f6c75d" font-family="Arial, sans-serif" font-size="78" font-weight="900">MAKE MONEY</text>
    <text x="58" y="650" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="700">House edge explained | Educational only</text>
  </svg>`;
}

async function createThumbnail(sourcePath, outputPath) {
  await sharp(sourcePath)
    .resize(1280, 720, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(thumbnailOverlay()) }])
    .jpeg({ quality: 90, progressive: true })
    .toFile(outputPath);
}

async function createNarration(outputPath) {
  if (canUseWindowsSpeech()) {
    await generateWindowsSpeech(NARRATION, outputPath);
    return 'Windows System.Speech';
  }

  const generator = new AIVideoGenerator({});
  await generator.generateTTSAudio(NARRATION, outputPath);
  return 'AIVideoGenerator TTS';
}

async function createFasterNarration(inputPath, outputPath) {
  await runFFmpeg([
    '-y',
    '-nostdin',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-filter:a',
    `atempo=${FAST_SPEED}`,
    '-vn',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '2',
    outputPath
  ]);
}

async function main() {
  const illustrationsDir = path.join(OUTPUT_DIR, 'illustrations');
  const suffix = FAST_MODE ? '-fast' : '';
  const cardsDir = path.join(OUTPUT_DIR, `cards${suffix}`);
  const audioPath = path.join(OUTPUT_DIR, 'narration.mp3');
  const renderAudioPath = FAST_MODE ? path.join(OUTPUT_DIR, 'narration-fast.mp3') : audioPath;
  const videoPath = path.join(OUTPUT_DIR, `casino-house-edge-short${suffix}.mp4`);
  const srtPath = path.join(OUTPUT_DIR, `casino-house-edge-short${suffix}.srt`);
  const thumbnailPath = path.join(OUTPUT_DIR, `casino-house-edge-thumbnail${suffix}.jpg`);
  const manifestPath = path.join(OUTPUT_DIR, `manifest${suffix}.json`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const narrationProvider = await createNarration(audioPath);
  if (FAST_MODE) await createFasterNarration(audioPath, renderAudioPath);
  const illustrations = await createCartoonIllustrations(SEGMENTS, illustrationsDir, { topicKey: 'casino-house-edge-sample' });
  const rendered = await renderShortVideo({
    sourceImages: illustrations,
    scenes: SEGMENTS.map(segment => ({
      ...segment,
      duration: segment.text.split(/\s+/).length
    })),
    narrationText: NARRATION,
    audioPath: renderAudioPath,
    outputPath: videoPath,
    srtPath,
    cardsDir,
    captionMaxWords: 6,
    fadeDuration: 0.45
  });
  await createThumbnail(illustrations[0], thumbnailPath);

  const manifest = {
    status: 'preview_ready',
    title: TOPIC,
    source: SOURCE,
    disclaimer: DISCLAIMER,
    playbackRate: FAST_MODE ? FAST_SPEED : 1,
    narrationProvider,
    outputs: { video: videoPath, captions: srtPath, thumbnail: thumbnailPath },
    timedScenes: SEGMENTS.map((segment, index) => ({
      title: segment.title,
      narration: segment.text,
      kind: segment.kind,
      renderedDurationSeconds: rendered.durations[index]
    })),
    generatedAt: new Date().toISOString()
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({ status: manifest.status, videoPath, srtPath, thumbnailPath, manifestPath, duration: rendered.duration, playbackRate: manifest.playbackRate, narrationProvider }, null, 2));
}

main().catch(error => {
  console.error(`Finance fact sample failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
