require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { CredentialManager } = require('./utils/credential-manager');
const {
  markPublicShortUploaded,
  reservePublicShort,
  releasePublicShort
} = require('./utils/youtube-rate-limit');

const DEFAULT_MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-flash-preview';
const DEFAULT_DURATION = Number(process.env.SHORT_DEFAULT_DURATION || 10);
const DEFAULT_ASPECT_RATIO = process.env.SHORT_ASPECT_RATIO || '9:16';
const DEFAULT_PRIVACY = process.env.SHORT_PRIVACY_STATUS || 'private';
const VALID_DURATIONS = new Set([4, 6, 8, 10]);
const VALID_ASPECT_RATIOS = new Set(['9:16', '16:9']);
const VALID_PRIVACY_STATUSES = new Set(['private', 'unlisted', 'public']);

function parseArgs(argv) {
  const options = {
    prompt: null,
    model: DEFAULT_MODEL,
    duration: DEFAULT_DURATION,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    output: null,
    upload: false,
    privacy: DEFAULT_PRIVACY,
    title: null,
    description: null,
    tags: [],
    category: process.env.YOUTUBE_CATEGORY_ID || '24',
    help: false
  };
  const positional = [];
  const valueFlags = new Set([
    '--prompt',
    '--model',
    '--duration',
    '--aspect-ratio',
    '--output',
    '--privacy',
    '--title',
    '--description',
    '--tags',
    '--category'
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const equalsIndex = argument.indexOf('=');
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    let value = equalsIndex === -1 ? null : argument.slice(equalsIndex + 1);

    if (flag === '--help' || flag === '-h') {
      options.help = true;
      continue;
    }

    if (flag === '--upload') {
      options.upload = true;
      continue;
    }

    if (!valueFlags.has(flag)) {
      if (argument.startsWith('-')) {
        throw new Error(`Unknown option: ${argument}`);
      }
      positional.push(argument);
      continue;
    }

    if (value === null) {
      value = argv[index + 1];
      index += 1;
    }

    if (!value || value.startsWith('--')) {
      throw new Error(`A value is required for ${flag}`);
    }

    switch (flag) {
      case '--prompt':
        options.prompt = value;
        break;
      case '--model':
        options.model = value;
        break;
      case '--duration':
        options.duration = Number(value);
        break;
      case '--aspect-ratio':
        options.aspectRatio = value;
        break;
      case '--output':
        options.output = value;
        break;
      case '--privacy':
        options.privacy = value;
        break;
      case '--title':
        options.title = value;
        break;
      case '--description':
        options.description = value;
        break;
      case '--tags':
        options.tags = value.split(',');
        break;
      case '--category':
        options.category = value;
        break;
      default:
        throw new Error(`Unhandled option: ${flag}`);
    }
  }

  if (!options.prompt && positional.length > 0) {
    options.prompt = positional.join(' ');
  }

  return options;
}

function validateOptions(options) {
  if (!options.prompt || options.prompt.trim().length === 0) {
    throw new Error('Provide a prompt as text or with --prompt "..."');
  }

  if (options.prompt.length > 10000) {
    throw new Error('Prompt must be 10,000 characters or less');
  }

  if (!VALID_DURATIONS.has(options.duration)) {
    throw new Error('Duration must be one of: 4, 6, 8, or 10 seconds');
  }

  if (!VALID_ASPECT_RATIOS.has(options.aspectRatio)) {
    throw new Error('Aspect ratio must be 9:16 or 16:9');
  }

  if (!VALID_PRIVACY_STATUSES.has(options.privacy)) {
    throw new Error('Privacy must be private, unlisted, or public');
  }

  if (!options.model || options.model.trim().length === 0) {
    throw new Error('A Gemini video model is required');
  }

  if (!options.upload && options.privacy !== 'private') {
    throw new Error('--privacy other than private requires --upload');
  }

  if (options.title && options.title.length > 100) {
    throw new Error('YouTube titles must be 100 characters or less');
  }

  if (options.description && options.description.length > 5000) {
    throw new Error('YouTube descriptions must be 5,000 characters or less');
  }
}

function buildShortPrompt(options) {
  const orientation = options.aspectRatio === '9:16' ? 'vertical' : 'landscape';

  return [
    `Create exactly a ${options.duration}-second ${orientation} video in ${options.aspectRatio} format for a YouTube Short.`,
    options.prompt.trim(),
    'Follow the requested subject, action, camera movement, lighting, and visual style. Do not add on-screen text unless requested.'
  ].join('\n\n');
}

function createDefaultTitle(prompt) {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  const title = compact.length > 86 ? `${compact.slice(0, 83).trim()}...` : compact;
  return `AI Short: ${title}`.slice(0, 100);
}

function sanitizeTags(tags = []) {
  const cleaned = tags
    .map(tag => String(tag).trim())
    .filter(Boolean);
  const defaults = cleaned.length > 0 ? cleaned : ['Shorts', 'AI video', 'Gemini Omni Flash'];
  const kept = [];
  let total = 0;

  for (const tag of defaults) {
    if (total + tag.length + 1 > 500) {
      break;
    }
    kept.push(tag);
    total += tag.length + 1;
  }

  return kept;
}

function isExplicitShort(metadata = {}) {
  return metadata.isShort === true
    || String(metadata.contentType || '').toLowerCase() === 'short'
    || metadata.aspectRatio === '9:16';
}

function shortReservationKey(options, videoPath) {
  return options.reservationKey || `shorts:${path.resolve(videoPath)}`;
}

function extractVideoPart(response) {
  const parts = (response.candidates || [])
    .flatMap(candidate => candidate.content?.parts || []);

  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data;
    const inlineMimeType = inlineData?.mimeType || inlineData?.mime_type || '';
    if (inlineData?.data && (!inlineMimeType || /^video\//i.test(inlineMimeType))) {
      return {
        type: 'base64',
        data: inlineData.data,
        mimeType: inlineMimeType || 'video/mp4'
      };
    }

    const fileData = part.fileData || part.file_data;
    const fileUri = fileData?.fileUri || fileData?.file_uri;
    if (fileUri) {
      return {
        type: 'uri',
        uri: fileUri,
        mimeType: fileData.mimeType || fileData.mime_type || 'video/mp4'
      };
    }
  }

  return null;
}

async function downloadVideoPart(ai, videoPart, outputPath, apiKey) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  if (videoPart.type === 'base64') {
    await fsp.writeFile(outputPath, Buffer.from(videoPart.data, 'base64'));
  } else if (videoPart.uri.startsWith('files/') || videoPart.uri.includes('/files/')) {
    await ai.files.download({ file: videoPart.uri, downloadPath: outputPath });
  } else if (/^https?:\/\//i.test(videoPart.uri)) {
    const response = await axios.get(videoPart.uri, {
      responseType: 'arraybuffer',
      headers: apiKey ? { 'x-goog-api-key': apiKey } : undefined
    });
    await fsp.writeFile(outputPath, response.data);
  } else {
    throw new Error(`Gemini returned an unsupported video URI: ${videoPart.uri}`);
  }

  const stats = await fsp.stat(outputPath);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error('Gemini returned an empty video file');
  }

  return outputPath;
}

function getGeminiApiKey(credentials = {}) {
  return process.env.GEMINI_API_KEY || credentials.gemini?.apiKey || null;
}

async function generateShort(options, credentials = {}) {
  const apiKey = getGeminiApiKey(credentials);
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const outputPath = path.resolve(
    __dirname,
    options.output || path.join('data', 'videos', `omni_short_${Date.now()}.mp4`)
  );
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildShortPrompt(options);

  console.log(`Generating with ${options.model}...`);
  const response = await ai.models.generateContent({
    model: options.model,
    contents: prompt,
    config: {
      responseModalities: ['VIDEO']
    }
  });
  const videoPart = extractVideoPart(response);

  if (!videoPart) {
    const reason = response.promptFeedback?.blockReason || 'no video part returned';
    const responseText = response.text ? ` ${response.text.slice(0, 300)}` : '';
    throw new Error(`Gemini Omni Flash did not return a video (${reason}).${responseText}`);
  }

  await downloadVideoPart(ai, videoPart, outputPath, apiKey);
  return { outputPath, prompt };
}

async function uploadToYouTube(options, videoPath) {
  const credentialManager = new CredentialManager();
  const initialized = await credentialManager.initialize();
  if (!initialized) {
    throw new Error('Could not load YouTube credentials');
  }

  let youtube;
  try {
    youtube = credentialManager.getYouTubeClient();
  } catch (error) {
    throw new Error(`YouTube is not authenticated. Run "node modern-auth.js" first. ${error.message}`);
  }

  const title = options.title || createDefaultTitle(options.prompt);
  const description = options.description || 'Created with Gemini Omni Flash.\n\n#Shorts';
  const publicShort = options.privacy === 'public' && isExplicitShort(options);
  const reservation = publicShort
    ? await reservePublicShort(shortReservationKey(options, videoPath))
    : null;
  let inserted = false;

  try {
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title,
          description,
          tags: sanitizeTags(options.tags),
          categoryId: String(options.category)
        },
        status: {
          privacyStatus: options.privacy,
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(videoPath)
      }
    });

    const videoId = response.data.id;
    if (!videoId) throw new Error('YouTube did not return an uploaded video ID');
    inserted = true;
    if (reservation) await markPublicShortUploaded(reservation.key);
    return {
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      privacyStatus: options.privacy,
      title
    };
  } catch (error) {
    if (reservation && !inserted) await releasePublicShort(reservation.key).catch(() => {});
    throw error;
  }
}

function printHelp() {
  console.log(`Usage:
  npm run short -- "your video prompt" [options]

Options:
  --upload                 Upload the generated MP4 to YouTube
  --privacy <value>        private (default), unlisted, or public
  --title <text>           YouTube title
  --description <text>     YouTube description
  --tags <a,b,c>           Comma-separated YouTube tags
  --category <id>          YouTube category ID (default: 24)
  --duration <seconds>     4, 6, 8, or 10 (default: 10)
  --aspect-ratio <ratio>   9:16 (default) or 16:9
  --model <model>          Gemini model (default: gemini-omni-flash-preview)
  --output <path>          Output MP4 path
  --help                   Show this help

Examples:
  npm run short -- "A golden retriever surfing at sunset"
  npm run short -- "A golden retriever surfing at sunset" --upload --privacy private
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  validateOptions(options);
  const credentialManager = new CredentialManager();
  await credentialManager.initialize();
  const generated = await generateShort(options, credentialManager.credentials);
  console.log(`Video saved to: ${generated.outputPath}`);

  if (options.upload) {
    const upload = await uploadToYouTube(options, generated.outputPath);
    console.log(`Uploaded to YouTube as ${upload.privacyStatus}: ${upload.url}`);
  } else {
    console.log('Upload skipped. Add --upload after reviewing the MP4.');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Short workflow failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildShortPrompt,
  createDefaultTitle,
  extractVideoPart,
  isExplicitShort,
  parseArgs,
  sanitizeTags,
  uploadToYouTube,
  validateOptions
};
