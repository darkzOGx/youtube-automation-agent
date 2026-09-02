require('dotenv').config();

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { CredentialManager } = require('./utils/credential-manager');
const {
  markPublicShortUploaded,
  reservePublicShort,
  releasePublicShort
} = require('./utils/youtube-rate-limit');

const ROOT = __dirname;
const OUTPUT_DIR = path.join(ROOT, 'data', 'finance-sample');
const STATE_PATH = path.join(OUTPUT_DIR, 'youtube-upload.json');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const EXPECTED_CHANNEL = process.env.CHANNEL_NAME || 'Nature Lover 2000';
const CATEGORY_ID = String(process.env.YOUTUBE_CATEGORY_ID || '27');
const SOURCE_URL = 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator';
const DISCLAIMER = 'This content is for general education only and is not personalized financial advice. Returns are not guaranteed. Fees, taxes, and inflation can affect results.';

const VIDEOS = [
  {
    key: 'long',
    file: 'compound-interest-long.mp4',
    captions: 'compound-interest-long.srt',
    title: 'How $100 a Month Could Grow With Compound Interest',
    description: `Compound interest is the process where returns can potentially earn additional returns over time.

This hypothetical illustration assumes $100 contributed monthly, an 8% annual return, and monthly compounding. The example is not a promise or prediction.

Source: ${SOURCE_URL}

${DISCLAIMER}

#PersonalFinance #CompoundInterest #FinancialLiteracy`,
    tags: ['personal finance', 'compound interest', 'financial literacy', 'saving money', 'investing basics', 'long term investing', 'money habits'],
  },
  {
    key: 'short',
    isShort: true,
    file: 'compound-interest-short.mp4',
    captions: 'compound-interest-short.srt',
    title: 'The $100 Habit That Could Become $59,000',
    description: `A hypothetical compound-growth illustration using $100 contributed every month and an assumed 8% annual return.

Source: ${SOURCE_URL}

${DISCLAIMER}

#Shorts #PersonalFinance #CompoundInterest`,
    tags: ['Shorts', 'personal finance', 'compound interest', 'saving money', 'financial literacy', 'investing basics'],
  },
];

function requirePublicApproval() {
  if (!process.argv.slice(2).includes('--public')) {
    throw new Error('Public upload is locked. Run: npm run finance:publish -- --public');
  }
}

async function readState() {
  try {
    const state = JSON.parse(await fsp.readFile(STATE_PATH, 'utf8'));
    state.videos ||= {};
    return state;
  } catch {
    return { privacyStatus: 'public', channelId: null, channelTitle: null, videos: {} };
  }
}

async function writeState(state) {
  await fsp.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

async function assertFile(fileName) {
  const filePath = path.join(OUTPUT_DIR, fileName);
  const stats = await fsp.stat(filePath);
  if (!stats.isFile() || stats.size === 0) throw new Error(`Missing or empty upload file: ${filePath}`);
  return filePath;
}

function sanitizeTags(tags) {
  const result = [];
  let total = 0;
  for (const tag of tags) {
    const value = String(tag).trim();
    if (!value || total + value.length + 1 > 500) continue;
    result.push(value);
    total += value.length + 1;
  }
  return result;
}

async function uploadVideo(youtube, video, thumbnailPath, state) {
  let checkpoint = state.videos[video.key];
  const captionsPath = await assertFile(video.captions);

  if (!checkpoint?.id) {
    const videoPath = await assertFile(video.file);
    const reservation = video.isShort === true
      ? await reservePublicShort(`finance-sample:${video.key}`)
      : null;
    let inserted = false;
    try {
      const response = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: video.title,
            description: video.description,
            tags: sanitizeTags(video.tags),
            categoryId: CATEGORY_ID,
            defaultLanguage: 'en',
            defaultAudioLanguage: 'en',
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        },
        media: { body: fs.createReadStream(videoPath) },
      });

      const id = response.data.id;
      if (!id) throw new Error(`YouTube did not return an ID for ${video.key}`);
      inserted = true;
      if (reservation) await markPublicShortUploaded(reservation.key);
      checkpoint = {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: video.title,
        privacyStatus: 'public',
        thumbnailAttached: false,
        captionsAttached: false,
        uploadedAt: new Date().toISOString(),
      };
      state.videos[video.key] = checkpoint;
      await writeState(state);
      console.log(`Uploaded ${video.key}: ${id}`);
    } catch (error) {
      if (reservation && !inserted) await releasePublicShort(reservation.key).catch(() => {});
      throw error;
    }
  } else {
    console.log(`Resuming ${video.key}; checkpointed as ${checkpoint.id}`);
  }

  if (!checkpoint.thumbnailAttached) {
    await youtube.thumbnails.set({
      videoId: checkpoint.id,
      media: { body: fs.createReadStream(thumbnailPath) },
    });
    checkpoint.thumbnailAttached = true;
    await writeState(state);
    console.log(`Thumbnail attached to ${video.key}`);
  }

  if (!checkpoint.captionsAttached) {
    try {
      await youtube.captions.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            videoId: checkpoint.id,
            language: 'en',
            name: 'English Captions',
            isDraft: false,
          },
        },
        media: { body: fs.createReadStream(captionsPath) },
      });
      checkpoint.captionsAttached = true;
      await writeState(state);
      console.log(`Captions attached to ${video.key}`);
    } catch (error) {
      if (!/insufficient authentication scopes/i.test(error.message || '')) throw error;
      console.warn(`Captions skipped for ${video.key}: the current OAuth token lacks the captions scope`);
    }
  }

  return checkpoint;
}

async function verifyPublishedVideos(youtube, state) {
  const ids = Object.values(state.videos).map(video => video.id).filter(Boolean);
  const response = await youtube.videos.list({ part: 'snippet,status', id: ids });
  return response.data.items.map(video => ({
    id: video.id,
    title: video.snippet.title,
    privacyStatus: video.status.privacyStatus,
    url: `https://www.youtube.com/watch?v=${video.id}`,
  }));
}

async function updateManifest(channel, published, state) {
  const manifest = JSON.parse(await fsp.readFile(MANIFEST_PATH, 'utf8'));
  const videos = {};
  for (const video of published) {
    const key = Object.entries(state.videos).find(([, value]) => value.id === video.id)?.[0];
    if (key) {
      videos[key] = {
        id: video.id,
        url: video.url,
        title: video.title,
        privacyStatus: video.privacyStatus,
        thumbnailAttached: state.videos[key].thumbnailAttached === true,
        captionsAttached: state.videos[key].captionsAttached === true,
      };
    }
  }

  if (Object.keys(videos).length !== VIDEOS.length || published.some(video => video.privacyStatus !== 'public')) {
    throw new Error('Published video verification did not confirm both videos are public');
  }

  manifest.status = 'published';
  manifest.publicUpload = true;
  manifest.publishedAt = new Date().toISOString();
  manifest.youtube = {
    channelId: channel.id,
    channelTitle: channel.snippet.title,
    videos,
  };
  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  requirePublicApproval();
  const thumbnailPath = await assertFile('thumbnail_final.jpg');
  const credentials = new CredentialManager();
  if (!(await credentials.initialize())) throw new Error('Could not load YouTube credentials');
  const youtube = credentials.getYouTubeClient();

  const channelResponse = await youtube.channels.list({ part: 'snippet', mine: true });
  const channel = channelResponse.data.items?.[0];
  if (!channel) throw new Error('No authenticated YouTube channel was found');
  if (channel.snippet.title !== EXPECTED_CHANNEL) {
    throw new Error(`Authenticated channel is "${channel.snippet.title}", expected "${EXPECTED_CHANNEL}"`);
  }
  console.log(`Verified channel: ${channel.snippet.title} (${channel.id})`);

  const state = await readState();
  state.channelId = channel.id;
  state.channelTitle = channel.snippet.title;
  state.privacyStatus = 'public';
  await writeState(state);

  for (const video of VIDEOS) {
    await uploadVideo(youtube, video, thumbnailPath, state);
  }

  const published = await verifyPublishedVideos(youtube, state);
  await updateManifest(channel, published, state);
  console.log(JSON.stringify({ channel: channel.snippet.title, videos: published }, null, 2));
}

main().catch(error => {
  console.error(`Finance publish failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
