const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const Replicate = require('replicate');

const DEFAULT_PROVIDER_ORDER = ['seedance', 'minimax_h3', 'google_omni', 'kling', 'wan', 'slideshow'];

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

function normalizeCredentials(input = {}) {
  return input.credentials || input;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function safeModelError(error) {
  return String(error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || error || 'Video provider request failed')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|secret)=([^\s&]+)/gi, '$1=[redacted]')
    .slice(0, 500);
}

async function fileToDataUrl(filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath) || /^data:/i.test(filePath)) return filePath;
  const extension = path.extname(filePath).toLowerCase();
  const mime = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
  }[extension] || 'application/octet-stream';
  return `data:${mime};base64,${(await fs.readFile(filePath)).toString('base64')}`;
}

async function fileToReplicateInput(filePath) {
  if (!filePath || /^https?:\/\//i.test(filePath) || /^data:/i.test(filePath)) return filePath;
  return fs.readFile(filePath);
}

class VideoProvider {
  constructor(id, options = {}) {
    this.id = id;
    this.model = options.model;
    this.capabilities = options.capabilities || {};
  }

  isAvailable() { return false; }

  supports(request = {}) {
    const duration = Number(request.duration || 0);
    if (duration && this.capabilities.minDuration && duration < this.capabilities.minDuration) return false;
    if (duration && Number.isFinite(this.capabilities.maxDuration) && duration > this.capabilities.maxDuration) return false;
    if (request.firstFrame && !this.capabilities.firstFrame) return false;
    if (request.lastFrame && !this.capabilities.lastFrame) return false;
    if (request.generateAudio && !this.capabilities.nativeAudio) return false;
    if ((request.referenceImages || []).length > Number(this.capabilities.referenceImages || 0)) return false;
    if ((request.referenceVideos || []).length > Number(this.capabilities.referenceVideos || 0)) return false;
    if ((request.referenceAudios || []).length > Number(this.capabilities.referenceAudios || 0)) return false;
    return true;
  }

  describe() {
    return {
      id: this.id,
      model: this.model,
      available: this.isAvailable(),
      capabilities: this.capabilities
    };
  }

  normalizeRequest(request = {}) {
    const minimum = this.capabilities.minDuration || 4;
    const maximum = this.capabilities.maxDuration || 10;
    return {
      ...request,
      prompt: String(request.prompt || '').slice(0, this.capabilities.maxPromptLength || 2000),
      duration: clamp(request.duration || minimum, minimum, maximum),
      aspectRatio: request.aspectRatio || '16:9',
      resolution: request.resolution || this.capabilities.defaultResolution || '720p',
      generateAudio: request.generateAudio === true,
      referenceImages: request.referenceImages || [],
      referenceVideos: request.referenceVideos || [],
      referenceAudios: request.referenceAudios || []
    };
  }

  async downloadResult(task, outputPath) {
    if (!task.outputUrl) throw new Error(`${this.id} completed without a downloadable video`);
    const response = await axios.get(task.outputUrl, { responseType: 'arraybuffer', timeout: 120000 });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(response.data));
    return outputPath;
  }

  async cancelTask() { return false; }
}

class SeedanceProvider extends VideoProvider {
  constructor(credentials, options = {}) {
    const key = normalizeCredentials(credentials).replicate?.apiKey || process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    super('seedance', {
      model: options.model || process.env.SEEDANCE_MODEL || 'bytedance/seedance-2.5',
      capabilities: {
        minDuration: 4, maxDuration: 30, defaultResolution: '720p', maxPromptLength: 2000,
        text: true, firstFrame: true, lastFrame: true, referenceImages: 30,
        referenceVideos: 10, referenceAudios: 10, nativeAudio: true, cancellation: true
      }
    });
    this.client = options.client || (key ? new Replicate({ auth: key }) : null);
  }

  isAvailable() { return Boolean(this.client); }

  async createTask(input) {
    const request = this.normalizeRequest(input);
    const firstFrame = await fileToReplicateInput(request.firstFrame);
    const lastFrame = await fileToReplicateInput(request.lastFrame);
    const hasFrames = Boolean(firstFrame || lastFrame);
    const payload = {
      prompt: request.prompt,
      duration: request.duration,
      resolution: request.resolution,
      aspect_ratio: hasFrames ? 'adaptive' : request.aspectRatio,
      output_format: 'mp4',
      generate_audio: request.generateAudio,
      watermark: request.watermark === true,
      ...(request.seed === undefined ? {} : { seed: request.seed })
    };
    if (firstFrame) payload.image = firstFrame;
    if (lastFrame) payload.last_frame_image = lastFrame;
    if (!hasFrames) {
      payload.reference_images = await Promise.all(request.referenceImages.slice(0, 30).map(fileToReplicateInput));
      payload.reference_videos = await Promise.all(request.referenceVideos.slice(0, 10).map(fileToReplicateInput));
      payload.reference_audios = await Promise.all(request.referenceAudios.slice(0, 10).map(fileToReplicateInput));
    }
    const prediction = await this.client.predictions.create({ model: this.model, input: payload });
    return this.normalizeTask(prediction);
  }

  async getTask(id) { return this.normalizeTask(await this.client.predictions.get(id)); }

  async cancelTask(id) {
    await this.client.predictions.cancel(id);
    return true;
  }

  normalizeTask(task = {}) {
    const status = { starting: 'queued', processing: 'running', succeeded: 'succeeded', successful: 'succeeded', failed: 'failed', canceled: 'cancelled' }[task.status] || task.status || 'queued';
    const output = task.output;
    const outputUrl = typeof output === 'string'
      ? output
      : Array.isArray(output) ? String(output[0] || '')
        : typeof output?.url === 'function' ? String(output.url()) : output?.url || null;
    return { externalTaskId: task.id, status, outputUrl, error: task.error ? safeModelError(task.error) : null };
  }
}

class MiniMaxH3Provider extends VideoProvider {
  constructor(credentials, options = {}) {
    const creds = normalizeCredentials(credentials);
    super('minimax_h3', {
      model: options.model || process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-H3',
      capabilities: {
        minDuration: 4, maxDuration: 15, defaultResolution: '768P', maxPromptLength: 7000,
        text: true, firstFrame: true, lastFrame: true, referenceImages: 9,
        referenceVideos: 3, referenceAudios: 3, nativeAudio: true, resolution2k: true
      }
    });
    this.apiKey = options.apiKey || creds.minimax?.apiKey || process.env.MINIMAX_API_KEY;
    this.baseUrl = options.baseUrl || process.env.MINIMAX_API_BASE || 'https://api.minimax.io';
    this.http = options.http || axios;
  }

  isAvailable() { return Boolean(this.apiKey); }
  headers() { return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }; }

  async createTask(input) {
    const request = this.normalizeRequest(input);
    const content = [{ type: 'text', text: request.prompt }];
    const add = async (type, role, item) => content.push({ type, [type]: { url: await fileToDataUrl(item) }, role });
    if (request.firstFrame) await add('image_url', 'first_frame', request.firstFrame);
    if (request.lastFrame) await add('image_url', 'last_frame', request.lastFrame);
    for (const item of request.referenceImages.slice(0, 9)) await add('image_url', 'reference_image', item);
    for (const item of request.referenceVideos.slice(0, 3)) await add('video_url', 'reference_video', item);
    for (const item of request.referenceAudios.slice(0, 3)) await add('audio_url', 'reference_audio', item);
    const body = { model: this.model, content, duration: request.duration, resolution: request.resolution };
    if (!request.firstFrame && !request.lastFrame) body.ratio = request.aspectRatio;
    const response = await this.http.post(`${this.baseUrl}/v2/video_generation`, body, { headers: this.headers(), timeout: 120000 });
    return { externalTaskId: response.data.task_id, status: 'queued', outputUrl: null, error: null };
  }

  async getTask(id) {
    const response = await this.http.get(`${this.baseUrl}/v2/query/video_generation/${id}`, { headers: this.headers(), timeout: 30000 });
    const task = response.data.task || response.data;
    return {
      externalTaskId: id,
      status: { success: 'succeeded', succeeded: 'succeeded', failed: 'failed', processing: 'running', running: 'running', queued: 'queued' }[task.status] || task.status,
      outputUrl: task.content?.url || task.video_url || null,
      error: task.error ? safeModelError(task.error) : null
    };
  }
}

class GoogleOmniProvider extends VideoProvider {
  constructor(credentials, options = {}) {
    const creds = normalizeCredentials(credentials);
    super('google_omni', {
      model: options.model || process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-flash-preview',
      capabilities: {
        minDuration: 3, maxDuration: 10, defaultResolution: '720p', maxPromptLength: 7000,
        text: true, firstFrame: true, referenceImages: 8, referenceVideos: 1,
        nativeAudio: true, conversationalEditing: true
      }
    });
    const key = options.apiKey || creds.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (options.client) this.client = options.client;
    else if (key) {
      const { GoogleGenAI } = require('@google/genai');
      this.client = new GoogleGenAI({ apiKey: key });
    }
  }

  isAvailable() { return Boolean(this.client); }

  async createTask(input) {
    const request = this.normalizeRequest(input);
    const media = [request.firstFrame, ...request.referenceImages].filter(Boolean).slice(0, 8);
    const content = [];
    for (const item of media) {
      const dataUrl = await fileToDataUrl(item);
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      content.push(match ? { type: 'image', mime_type: match[1], data: match[2] } : { type: 'image', uri: dataUrl });
    }
    content.push({ type: 'text', text: request.prompt });
    const interaction = await this.client.interactions.create({
      model: this.model,
      input: content.length === 1 ? request.prompt : content,
      response_format: { type: 'video', aspect_ratio: request.aspectRatio, delivery: 'uri' }
    });
    const video = interaction.output_video || interaction.outputVideo || this.findVideo(interaction.steps);
    const outputUrl = video?.uri || null;
    const inlineData = video?.data || null;
    return {
      externalTaskId: outputUrl || interaction.id,
      status: inlineData ? 'succeeded' : 'queued',
      outputUrl,
      inlineData,
      error: null
    };
  }

  findVideo(steps = []) {
    for (const step of steps || []) {
      const found = (step.content || []).find(item => item.type === 'video');
      if (found) return found;
    }
    return null;
  }

  async getTask(id) {
    if (!String(id).includes('files/')) return { externalTaskId: id, status: 'running', outputUrl: null, error: null };
    const match = String(id).match(/files\/([A-Za-z0-9_-]+)/);
    if (!match) return { externalTaskId: id, status: 'failed', outputUrl: null, error: 'Gemini returned an invalid file URI' };
    const name = `files/${match[1]}`;
    const file = await this.client.files.get({ name });
    const state = String(file.state?.name || file.state || '').toUpperCase();
    return {
      externalTaskId: id,
      status: state === 'ACTIVE' ? 'succeeded' : state === 'FAILED' ? 'failed' : 'running',
      outputUrl: id,
      error: state === 'FAILED' ? 'Gemini video processing failed' : null
    };
  }

  async downloadResult(task, outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    if (task.inlineData) {
      await fs.writeFile(outputPath, Buffer.from(task.inlineData, 'base64'));
      return outputPath;
    }
    await this.client.files.download({ file: { uri: task.outputUrl, mimeType: 'video/mp4' }, downloadPath: outputPath });
    return outputPath;
  }
}

class KlingProvider extends VideoProvider {
  constructor(credentials, options = {}) {
    const creds = normalizeCredentials(credentials);
    super('kling', {
      model: options.model || process.env.KLING_VIDEO_MODEL || 'kling-v3-omni',
      capabilities: {
        minDuration: 3, maxDuration: 15, defaultResolution: '1080p', maxPromptLength: 2500,
        text: true, firstFrame: true, lastFrame: true, referenceImages: 4,
        referenceVideos: 1, nativeAudio: true, storyboard: true
      }
    });
    this.accessKey = options.accessKey || creds.kling?.accessKey || process.env.KLING_ACCESS_KEY;
    this.secretKey = options.secretKey || creds.kling?.secretKey || process.env.KLING_SECRET_KEY;
    this.baseUrl = options.baseUrl || process.env.KLING_API_BASE_URL || 'https://api.klingai.com';
    this.http = options.http || axios;
  }

  isAvailable() { return Boolean(this.accessKey && this.secretKey); }

  token() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({ iss: this.accessKey, exp: now + 1800, nbf: now - 5 }));
    const signature = crypto.createHmac('sha256', this.secretKey).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  headers() { return { Authorization: `Bearer ${this.token()}`, 'Content-Type': 'application/json' }; }

  async createTask(input) {
    const request = this.normalizeRequest(input);
    const imageMode = Boolean(request.firstFrame);
    const endpoint = imageMode ? 'image2video' : 'text2video';
    const body = {
      model_name: this.model,
      prompt: request.prompt,
      duration: String(request.duration),
      aspect_ratio: request.aspectRatio,
      mode: request.resolution === '4k' ? 'pro' : 'std',
      sound: request.generateAudio ? 'on' : 'off'
    };
    if (imageMode) body.image = (await fileToDataUrl(request.firstFrame)).replace(/^data:[^;]+;base64,/, '');
    if (request.lastFrame) body.image_tail = (await fileToDataUrl(request.lastFrame)).replace(/^data:[^;]+;base64,/, '');
    const response = await this.http.post(`${this.baseUrl}/v1/videos/${endpoint}`, body, { headers: this.headers(), timeout: 120000 });
    const data = response.data.data || response.data;
    return { externalTaskId: data.task_id, status: 'queued', outputUrl: null, error: null, taskType: endpoint };
  }

  async getTask(id, context = {}) {
    const taskType = context.taskType || 'text2video';
    const response = await this.http.get(`${this.baseUrl}/v1/videos/${taskType}/${id}`, { headers: this.headers(), timeout: 30000 });
    const data = response.data.data || response.data;
    const status = { submitted: 'queued', processing: 'running', succeed: 'succeeded', succeeded: 'succeeded', failed: 'failed' }[data.task_status] || data.task_status;
    return {
      externalTaskId: id,
      status,
      outputUrl: data.task_result?.videos?.[0]?.url || null,
      error: data.task_status_msg || null,
      taskType
    };
  }
}

class WanProvider extends VideoProvider {
  constructor(credentials, options = {}) {
    const creds = normalizeCredentials(credentials);
    super('wan', {
      model: options.model || process.env.WAN_VIDEO_MODEL || 'wan2.7-t2v-2026-06-12',
      capabilities: {
        minDuration: 2, maxDuration: 15, defaultResolution: '720P', maxPromptLength: 2000,
        text: true, firstFrame: true, lastFrame: true, referenceImages: 4,
        referenceVideos: 3, referenceAudios: 3, nativeAudio: true, continuation: true
      }
    });
    this.apiKey = options.apiKey || creds.wan?.apiKey || process.env.DASHSCOPE_API_KEY;
    this.baseUrl = (options.baseUrl || process.env.DASHSCOPE_VIDEO_ENDPOINT || 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis').replace(/\/$/, '');
    this.taskBaseUrl = (options.taskBaseUrl || process.env.DASHSCOPE_TASK_ENDPOINT || 'https://dashscope-intl.aliyuncs.com/api/v1/tasks').replace(/\/$/, '');
    this.http = options.http || axios;
  }

  isAvailable() { return Boolean(this.apiKey); }
  headers() { return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' }; }

  async createTask(input) {
    const request = this.normalizeRequest(input);
    const references = [...request.referenceImages, ...request.referenceVideos, ...request.referenceAudios];
    let model = 'wan2.7-t2v-2026-06-12';
    if (references.length) model = 'wan2.7-r2v-2026-06-12';
    else if (request.firstFrame || request.lastFrame) model = 'wan2.7-i2v-2026-04-25';
    const media = [];
    if (request.firstFrame) media.push({ type: 'first_frame', url: await fileToDataUrl(request.firstFrame) });
    if (request.lastFrame) media.push({ type: 'last_frame', url: await fileToDataUrl(request.lastFrame) });
    for (const item of request.referenceImages) media.push({ type: 'reference_image', url: await fileToDataUrl(item) });
    for (const item of request.referenceVideos) media.push({ type: 'reference_video', url: await fileToDataUrl(item) });
    for (let index = 0; index < request.referenceAudios.length; index++) {
      if (!media[index] || !['reference_image', 'reference_video'].includes(media[index].type)) break;
      media[index].reference_voice = await fileToDataUrl(request.referenceAudios[index]);
    }
    const body = {
      model,
      input: { prompt: request.prompt, ...(media.length ? { media } : {}) },
      parameters: {
        resolution: String(request.resolution).toUpperCase(), duration: request.duration,
        ratio: request.aspectRatio, prompt_extend: true, watermark: request.watermark === true
      }
    };
    const response = await this.http.post(this.baseUrl, body, { headers: this.headers(), timeout: 120000 });
    const data = response.data.output || response.data;
    return { externalTaskId: data.task_id, status: 'queued', outputUrl: null, error: null, model };
  }

  async getTask(id) {
    const response = await this.http.get(`${this.taskBaseUrl}/${id}`, { headers: { Authorization: `Bearer ${this.apiKey}` }, timeout: 30000 });
    const data = response.data.output || response.data;
    const status = { PENDING: 'queued', RUNNING: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed', CANCELED: 'cancelled', UNKNOWN: 'failed' }[data.task_status] || String(data.task_status || '').toLowerCase();
    return {
      externalTaskId: id,
      status,
      outputUrl: data.video_url || data.results?.[0]?.url || null,
      error: data.message || null
    };
  }
}

class SlideshowProvider extends VideoProvider {
  constructor() {
    super('slideshow', { model: 'local-ffmpeg', capabilities: { local: true, text: true, maxDuration: Infinity } });
  }
  isAvailable() { return true; }
}

class VideoProviderRegistry {
  constructor(credentials = {}, options = {}) {
    const injected = options.providers || {};
    this.providers = new Map([
      ['seedance', injected.seedance || new SeedanceProvider(credentials, options.seedance)],
      ['minimax_h3', injected.minimax_h3 || new MiniMaxH3Provider(credentials, options.minimax_h3)],
      ['google_omni', injected.google_omni || new GoogleOmniProvider(credentials, options.google_omni)],
      ['kling', injected.kling || new KlingProvider(credentials, options.kling)],
      ['wan', injected.wan || new WanProvider(credentials, options.wan)],
      ['slideshow', injected.slideshow || new SlideshowProvider()]
    ]);
  }

  get(id) { return this.providers.get(id); }
  list() { return Array.from(this.providers.values()).map(provider => provider.describe()); }

  select(requested = 'slideshow', order = DEFAULT_PROVIDER_ORDER, request = {}) {
    if (requested && requested !== 'auto') {
      const provider = this.get(requested);
      return provider?.isAvailable() ? provider : this.get('slideshow');
    }
    for (const id of order) {
      const provider = this.get(id);
      if (provider?.isAvailable() && provider.supports(request)) return provider;
    }
    return this.get('slideshow');
  }
}

module.exports = {
  DEFAULT_PROVIDER_ORDER,
  VideoProvider,
  VideoProviderRegistry,
  SeedanceProvider,
  MiniMaxH3Provider,
  GoogleOmniProvider,
  KlingProvider,
  WanProvider,
  SlideshowProvider,
  safeModelError
};
