require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const { AIVideoGenerator } = require('./utils/ai-video-generator');
const { getFFmpegPath, runFFmpeg } = require('./utils/ffmpeg');

const execFileAsync = promisify(execFile);
const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, 'data', 'finance-sample');
const SOURCE_DIR = path.join(OUTPUT_DIR, 'source-images');
const FLOW_IMAGE_DIR = path.resolve(
  ROOT,
  process.env.FLOW_IMAGE_DIR || path.join('data', 'finance-sample', 'flow-images'),
);
const CARD_DIR = path.join(OUTPUT_DIR, 'cards');
const WIDTH = 1920;
const HEIGHT = 1080;
const SHORT_WIDTH = 1080;
const SHORT_HEIGHT = 1920;
const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = 720;

const LONG_TITLE = 'How $100 a Month Could Grow With Compound Interest';
const SHORT_TITLE = 'The $100 Habit That Could Become $59,000';
const SOURCE_URL = 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator';

const LONG_NARRATION = `Compound interest is one of the most important ideas in personal finance.

It means your money can earn returns, and those returns can potentially earn additional returns over time.

Here is a simple illustration.

Imagine contributing one hundred dollars every month. If the money earned a hypothetical 8 percent annual return and compounded monthly, you would contribute twelve thousand dollars after 10 years. The account could be worth approximately eighteen thousand three hundred dollars.

After 20 years, you would contribute twenty-four thousand dollars. The account could be worth approximately fifty-eight thousand nine hundred dollars.

After 30 years, you would contribute thirty-six thousand dollars. The account could be worth approximately one hundred forty-nine thousand dollars.

The important point is that the growth becomes larger over time. During the early years, most of the balance comes from your own contributions. Later, the accumulated balance has more opportunity to generate growth.

This is why time can be more important than trying to find the perfect investment.

However, this example has important limitations.

An 8 percent return is only an assumption. Investments can rise or fall, and no return is guaranteed. Fees reduce investment results. Taxes may reduce what you keep. Inflation reduces the purchasing power of money over time.

The example also assumes regular contributions and no withdrawals. Real life is less predictable.

The practical lesson is not that everyone should expect 8 percent. The lesson is to understand how consistent saving and a long time horizon can affect potential growth.

A person who starts with a manageable amount and increases contributions when their income grows may give compounding more time to work. Automating contributions can also make consistency easier.

Before investing, learn about risk, diversification, account fees, and the difference between saving and investing. Money needed soon may require a different approach from money intended for a long-term goal.

Use a reputable calculator to test different contribution amounts, time periods, and return assumptions.

Compound interest is not a shortcut to guaranteed wealth. It is a mathematical process that rewards consistency and time.

This video is for general education only and is not personalized financial advice. Consider your own situation and consult a qualified professional before making financial decisions.`;

const SHORT_NARRATION = `What could one hundred dollars a month become?

Using a hypothetical 8 percent annual return, compounded monthly, investing one hundred dollars every month for 20 years means you contribute twenty-four thousand dollars.

The account could grow to about fifty-nine thousand dollars.

That extra growth comes from your returns earning additional returns. This is compound growth.

In the same example, one hundred dollars a month becomes about eighteen thousand dollars after 10 years, fifty-nine thousand after 20 years, and one hundred forty-nine thousand after 30 years.

But 8 percent is not guaranteed. Real returns change, and fees, taxes, and inflation affect the result.

The lesson is simple: start with an amount you can sustain, automate it, and give it time.

Follow for practical finance facts. This content is educational, not financial advice.`;

const SCENES = [
  {
    id: '01',
    label: 'THE $100 HABIT',
    detail: 'Small contributions can matter more with time',
    prompt: 'A single gold coin placed at the bottom of a long elegant staircase, subtle glowing path leading upward, a calm anonymous adult silhouette in the distance, visual metaphor for starting small and building wealth over time',
  },
  {
    id: '02',
    label: 'YOUR CONTRIBUTIONS',
    detail: '$100 every month',
    prompt: 'A transparent glass savings jar receiving one gold coin at a time, repeated monthly rhythm suggested by soft circular calendar shapes, modern personal finance education scene, no text',
  },
  {
    id: '03',
    label: '20 YEARS LATER',
    detail: 'About $58,900 in this illustration',
    prompt: 'A glowing snowball made from small gold coins rolling gently down a wide hill and becoming much larger, cinematic financial growth metaphor, navy and amber palette, no text',
  },
  {
    id: '04',
    label: 'THE ENGINE',
    detail: 'Returns can earn additional returns',
    prompt: 'Nested golden circles and expanding rings of light around a central coin, elegant abstract visualization of compound growth, premium editorial finance illustration, no text',
  },
  {
    id: '05',
    label: 'THE TIMELINE',
    detail: '10 years: $18.3K   20 years: $58.9K   30 years: $149K',
    prompt: 'Three increasingly tall glowing columns made from stacked coins, arranged from left to right on a dark studio floor, clear visual comparison of time horizons, no numbers or text',
  },
  {
    id: '06',
    label: 'REALITY CHECK',
    detail: '8% is an assumption, not a promise',
    prompt: 'A balanced scale showing a growing coin stack on one side and abstract risk, fees, taxes, and inflation symbols on the other, thoughtful financial education visual, no logos, no text',
  },
  {
    id: '07',
    label: 'THE TAKEAWAY',
    detail: 'Start small. Stay consistent. Give it time.',
    prompt: 'An anonymous adult walking a long sunrise path while carrying a small glowing transparent savings jar, hopeful but realistic personal finance ending, no text',
  },
  {
    id: '08',
    label: 'EDUCATIONAL ONLY',
    detail: 'Check the assumptions before making decisions',
    prompt: 'Clean desktop with a calculator, notebook, and simple rising line drawn on paper, warm morning light, trustworthy financial education mood, no readable text, no brand logos',
  },
];

const STYLE = 'Original editorial finance education artwork, cinematic 3D illustration, deep navy and warm amber palette, clean modern composition, realistic lighting, consistent visual language, no readable text, no letters, no company logos, no watermark, no stock ticker, no distorted hands.';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(value, maxChars) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function textLines(lines, x, y, fontSize, lineHeight, options = {}) {
  const anchor = options.anchor || 'start';
  const fill = options.fill || '#ffffff';
  const weight = options.weight || 700;
  const family = options.family || 'Arial, sans-serif';
  const shadow = options.shadow === false ? '' : ' filter="url(#shadow)"';

  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-family="${family}" font-size="${fontSize}px" font-weight="${weight}"${shadow}>${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

function cardOverlay(scene, width, height, vertical = false) {
  const margin = vertical ? 68 : 90;
  const labelSize = vertical ? 48 : 52;
  const detailSize = vertical ? 42 : 48;
  const detailLines = wrapText(scene.detail, vertical ? 22 : 40);
  const labelY = vertical ? height - 560 : height - 420;
  const detailY = labelY + (vertical ? 76 : 86);
  const footerY = height - margin;
  const titleLines = vertical ? ['FINANCE', 'FACTS'] : ['FINANCE FACTS'];
  const titleY = vertical ? margin + 66 : margin + 54;

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#061323" stop-opacity="0.08"/>
          <stop offset="0.58" stop-color="#061323" stop-opacity="0.18"/>
          <stop offset="1" stop-color="#061323" stop-opacity="0.94"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.65"/>
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#shade)"/>
      <rect x="${margin}" y="${margin}" width="${vertical ? 280 : 330}" height="${vertical ? 112 : 72}" rx="18" fill="#f6b73c"/>
      ${textLines(titleLines, margin + (vertical ? 28 : 165), titleY, vertical ? 36 : 34, 38, { anchor: vertical ? 'start' : 'middle', fill: '#071522', weight: 900, shadow: false })}
      ${textLines([scene.label], margin, labelY, labelSize, labelSize + 8, { fill: '#ffffff', weight: 900 })}
      ${textLines(detailLines, margin, detailY, detailSize, detailSize + 16, { fill: '#f6c75d', weight: 700 })}
      <text x="${margin}" y="${footerY}" fill="#e6edf5" font-family="Arial, sans-serif" font-size="${vertical ? 26 : 24}px" font-weight="600" opacity="0.9">Hypothetical illustration | Educational content</text>
    </svg>`;
}

function thumbnailOverlay() {
  return `
    <svg width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" viewBox="0 0 ${THUMB_WIDTH} ${THUMB_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="thumbShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#061323" stop-opacity="0.92"/>
          <stop offset="0.58" stop-color="#061323" stop-opacity="0.42"/>
          <stop offset="1" stop-color="#061323" stop-opacity="0.08"/>
        </linearGradient>
        <filter id="thumbShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#000000" flood-opacity="0.72"/>
        </filter>
      </defs>
      <rect width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" fill="url(#thumbShade)"/>
      <rect x="54" y="52" width="270" height="58" rx="14" fill="#f6b73c"/>
      <text x="189" y="91" text-anchor="middle" fill="#071522" font-family="Arial, sans-serif" font-size="30px" font-weight="900">FINANCE FACTS</text>
      <text x="62" y="292" fill="#ffffff" font-family="Arial, sans-serif" font-size="86px" font-weight="900" filter="url(#thumbShadow)">THE $100</text>
      <text x="62" y="390" fill="#f6c75d" font-family="Arial, sans-serif" font-size="98px" font-weight="900" filter="url(#thumbShadow)">HABIT</text>
      <text x="62" y="544" fill="#ffffff" font-family="Arial, sans-serif" font-size="62px" font-weight="900" filter="url(#thumbShadow)">COULD BECOME</text>
      <text x="62" y="632" fill="#f6c75d" font-family="Arial, sans-serif" font-size="82px" font-weight="900" filter="url(#thumbShadow)">~$59K*</text>
      <text x="62" y="684" fill="#e6edf5" font-family="Arial, sans-serif" font-size="22px" font-weight="600">Hypothetical example | Returns not guaranteed</text>
    </svg>`;
}

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(OUTPUT_DIR, { recursive: true }),
    fs.mkdir(SOURCE_DIR, { recursive: true }),
    fs.mkdir(FLOW_IMAGE_DIR, { recursive: true }),
    fs.mkdir(CARD_DIR, { recursive: true }),
  ]);
}

async function findFlowImage(scene) {
  const names = [
    `scene_${scene.id}`,
    `flow_scene_${scene.id}`,
    `scene-${scene.id}`,
    `flow-${scene.id}`,
  ];
  const extensions = ['.png', '.jpg', '.jpeg', '.webp'];

  for (const name of names) {
    for (const extension of extensions) {
      const candidate = path.join(FLOW_IMAGE_DIR, `${name}${extension}`);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try the next supported filename.
      }
    }
  }

  return null;
}

async function loadLocalCredentials() {
  try {
    const contents = await fs.readFile(path.join(ROOT, 'config', 'credentials.json'), 'utf8');
    return JSON.parse(contents);
  } catch {
    return {};
  }
}

async function createFallbackImage(scene, index) {
  const hue = 210 + index * 11;
  const svg = `
    <svg width="1536" height="1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue}, 55%, 13%)"/>
          <stop offset="1" stop-color="hsl(${hue + 40}, 65%, 32%)"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="45%" r="48%">
          <stop offset="0" stop-color="#f6c75d" stop-opacity="0.8"/>
          <stop offset="1" stop-color="#f6c75d" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1536" height="1024" fill="url(#bg)"/>
      <circle cx="770" cy="475" r="420" fill="url(#glow)"/>
      <circle cx="770" cy="475" r="180" fill="#f6b73c" opacity="0.82"/>
      <circle cx="770" cy="475" r="130" fill="#ffd978" opacity="0.65"/>
      <path d="M0 850 C350 680 530 900 800 720 C1060 545 1200 800 1536 600 L1536 1024 L0 1024 Z" fill="#061323" opacity="0.74"/>
      <g fill="#f6c75d" opacity="0.72">
        <circle cx="190" cy="180" r="12"/><circle cx="1320" cy="210" r="9"/><circle cx="1180" cy="440" r="14"/><circle cx="320" cy="560" r="8"/>
      </g>
    </svg>`;
  const output = path.join(SOURCE_DIR, `scene_${scene.id}_fallback.png`);
  await sharp(Buffer.from(svg)).png().toFile(output);
  return output;
}

async function generateSourceImages(generator) {
  const assets = [];
  let generatedCount = 0;
  let fallbackCount = 0;
  let flowCount = 0;
  for (let index = 0; index < SCENES.length; index += 1) {
    const scene = SCENES[index];
    const output = path.join(SOURCE_DIR, `scene_${scene.id}.png`);
    const flowImage = await findFlowImage(scene);

    if (flowImage) {
      await fs.copyFile(flowImage, output);
      flowCount += 1;
      assets.push(output);
      console.log(`Imported Flow scene image ${scene.id}`);
      continue;
    }

    try {
      const generated = await generator.generateVisualAssets(`${scene.prompt}. ${STYLE}`, 'modern', 1);
      const source = generated.find(asset => /\.(png|jpe?g|webp)$/i.test(asset));
      if (!source) throw new Error('image provider returned no usable image file');
      await fs.copyFile(source, output);
      generatedCount += 1;
      console.log(`Generated scene image ${scene.id}`);
    } catch (error) {
      console.warn(`Scene ${scene.id} image generation failed; using local fallback: ${error.message}`);
      await createFallbackImage(scene, index);
      await fs.rename(path.join(SOURCE_DIR, `scene_${scene.id}_fallback.png`), output);
      fallbackCount += 1;
    }

    assets.push(output);
  }
  const providers = [];
  if (flowCount > 0) providers.push('Google Flow (manual import)');
  if (generatedCount > 0) providers.push('Gemini');
  if (fallbackCount > 0) providers.push('local fallback');
  return {
    assets,
    provider: providers.join(' + ') || 'local fallback',
    flowCount,
  };
}

async function createCard(source, scene, output, width, height, vertical = false) {
  const overlay = Buffer.from(cardOverlay(scene, width, height, vertical));
  await sharp(source)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .composite([{ input: overlay }])
    .png()
    .toFile(output);
}

async function createCards(sourceImages) {
  const longCards = [];
  const shortCards = [];

  for (let index = 0; index < SCENES.length; index += 1) {
    const scene = SCENES[index];
    const longPath = path.join(CARD_DIR, `long_${scene.id}.png`);
    const shortPath = path.join(CARD_DIR, `short_${scene.id}.png`);
    await createCard(sourceImages[index], scene, longPath, WIDTH, HEIGHT);
    await createCard(sourceImages[index], scene, shortPath, SHORT_WIDTH, SHORT_HEIGHT, true);
    longCards.push(longPath);
    shortCards.push(shortPath);
  }

  return { longCards, shortCards };
}

async function createThumbnail(source) {
  const output = path.join(OUTPUT_DIR, 'thumbnail_final.jpg');
  await sharp(source)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(thumbnailOverlay()) }])
    .jpeg({ quality: 90, progressive: true, optimizeScans: true })
    .toFile(output);
  return output;
}

function calculateOffset(durations, index, fade) {
  return durations.slice(0, index).reduce((sum, value) => sum + value, 0) - (index * fade);
}

async function renderSlides(cards, durations, audioPath, outputPath) {
  const visualPath = outputPath.replace(/\.mp4$/i, '_visual.mp4');
  const fade = 0.55;
  const args = ['-y'];

  for (let index = 0; index < cards.length; index += 1) {
    args.push('-loop', '1', '-t', String(durations[index]), '-i', cards[index]);
  }

  const filters = cards.map((_, index) => `[${index}:v]format=yuv420p,setsar=1[v${index}]`);
  let current = '[v0]';
  let outputLabel = 'vfade1';

  for (let index = 1; index < cards.length; index += 1) {
    const next = `[v${index}]`;
    const target = `[${outputLabel}]`;
    filters.push(`${current}${next}xfade=transition=fade:duration=${fade}:offset=${calculateOffset(durations, index, fade).toFixed(3)}${target}`);
    current = target;
    outputLabel = `vfade${index + 1}`;
  }

  filters.push(`${current}format=yuv420p[vfinal]`);
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[vfinal]',
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-an',
    visualPath,
  );
  await runFFmpeg(args);

  await runFFmpeg([
    '-y',
    '-i', visualPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath,
  ]);

  await fs.unlink(visualPath).catch(() => {});
}

async function probeDuration(audioPath) {
  try {
    await execFileAsync(getFFmpegPath(), ['-hide_banner', '-i', audioPath], { maxBuffer: 2 * 1024 * 1024 });
  } catch (error) {
    const text = `${error.stdout || ''}\n${error.stderr || ''}`;
    const match = text.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
    if (match) {
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
  }
  return null;
}

function formatSrtTime(seconds) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function createCaptions(text, duration) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  for (let index = 0; index < words.length; index += 9) {
    chunks.push(words.slice(index, index + 9).join(' '));
  }

  const totalWords = words.length;
  let cursor = 0;
  return chunks.map((chunk, index) => {
    const chunkWords = chunk.split(/\s+/).length;
    const chunkDuration = duration * (chunkWords / totalWords);
    const start = cursor;
    const end = cursor + chunkDuration;
    cursor = end;
    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${chunk}\n`;
  }).join('\n');
}

async function generateAudio(generator, text, output, fallbackSeconds) {
  if (process.env.REUSE_FINANCE_AUDIO === 'true') {
    try {
      const stats = await fs.stat(output);
      if (stats.isFile() && stats.size > 0) {
        const provider = String(process.env.TTS_PROVIDER || 'auto').toLowerCase() === 'gemini'
          ? 'Gemini free tier (cached)'
          : 'existing audio';
        console.log(`Reusing existing narration ${output}`);
        return { path: output, provider };
      }
    } catch {
      // Generate narration when no reusable audio file exists.
    }
  }

  try {
    await generator.generateTTSAudio(text, output);
    const stats = await fs.stat(output);
    if (!stats.size) throw new Error('TTS output is empty');
    const provider = String(process.env.TTS_PROVIDER || 'auto').toLowerCase() === 'gemini'
      ? 'Gemini free tier'
      : process.env.ELEVENLABS_API_KEY
        ? 'ElevenLabs'
        : 'Gemini fallback';
    return { path: output, provider };
  } catch (error) {
    console.warn(`TTS generation failed; using a silent review track: ${error.message}`);
    await runFFmpeg([
      '-y',
      '-f', 'lavfi',
      '-i', 'anullsrc=r=24000:cl=mono',
      '-t', String(fallbackSeconds),
      '-q:a', '9',
      output,
    ]);
    return { path: output, provider: 'silent fallback' };
  }
}

async function writeManifest(manifest) {
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}

async function main() {
  await ensureDirectories();
  const generator = new AIVideoGenerator(await loadLocalCredentials());
  const { assets: sourceImages, provider: imageProvider, flowCount } = await generateSourceImages(generator);
  const { longCards, shortCards } = await createCards(sourceImages);
  const thumbnail = await createThumbnail(sourceImages[2]);

  const longAudio = await generateAudio(
    generator,
    LONG_NARRATION,
    path.join(OUTPUT_DIR, 'long_narration.mp3'),
    230,
  );
  const shortAudio = await generateAudio(
    generator,
    SHORT_NARRATION,
    path.join(OUTPUT_DIR, 'short_narration.mp3'),
    65,
  );

  const longDuration = await probeDuration(longAudio.path) || 190;
  const shortDuration = await probeDuration(shortAudio.path) || 55;
  const longVideo = path.join(OUTPUT_DIR, 'compound-interest-long.mp4');
  const shortVideo = path.join(OUTPUT_DIR, 'compound-interest-short.mp4');

  await renderSlides(longCards, [12, 25, 35, 35, 40, 35, 30, 15], longAudio.path, longVideo);
  await renderSlides(shortCards.slice(0, 6), [8, 11, 12, 11, 10, 10], shortAudio.path, shortVideo);

  const longCaptions = path.join(OUTPUT_DIR, 'compound-interest-long.srt');
  const shortCaptions = path.join(OUTPUT_DIR, 'compound-interest-short.srt');
  await fs.writeFile(longCaptions, createCaptions(LONG_NARRATION, longDuration), 'utf8');
  await fs.writeFile(shortCaptions, createCaptions(SHORT_NARRATION, shortDuration), 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'long-script.txt'), LONG_NARRATION, 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'short-script.txt'), SHORT_NARRATION, 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'image-prompts.json'), JSON.stringify(SCENES, null, 2), 'utf8');

  const requestedButNotConnected = ['ElevenLabs voice'];
  if (flowCount === 0) requestedButNotConnected.push('Google Flow image generation');

  const manifest = {
    status: 'awaiting_approval',
    publicUpload: false,
    title: LONG_TITLE,
    shortTitle: SHORT_TITLE,
    source: SOURCE_URL,
    assumptions: {
      monthlyContribution: 100,
      annualReturn: 0.08,
      compounding: 'monthly',
      disclaimer: 'Hypothetical illustration. Returns are not guaranteed. Fees, taxes, and inflation are excluded.',
    },
    providers: {
      images: imageProvider,
      narration: longAudio.provider,
      editing: 'FFmpeg + Sharp',
      requestedButNotConnected,
    },
    outputs: {
      longVideo,
      shortVideo,
      thumbnail,
      longCaptions,
      shortCaptions,
    },
    generatedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);

  console.log(JSON.stringify({
    status: manifest.status,
    longVideo,
    shortVideo,
    thumbnail,
    manifest: path.join(OUTPUT_DIR, 'manifest.json'),
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
