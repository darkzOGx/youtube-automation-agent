const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { AITextService } = require('./ai-text-service');
const { AIVideoGenerator } = require('./ai-video-generator');
const { checkFFmpeg, runFFmpeg } = require('./ffmpeg');
const { validateYouTubeMetadata } = require('./youtube-metadata-validator');
const { Logger } = require('./logger');
const { MediaGenerationService } = require('./media-generation-service');

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

class ProductionReadinessService {
  constructor(db, credentialManager, options = {}) {
    this.db = db;
    this.credentialManager = credentialManager;
    this.logger = options.logger || new Logger('ProductionReadiness');
    this.probes = options.probes || {};
    this.now = options.now || (() => new Date());
    this.activeRun = null;
  }

  async getSummary() {
    const latest = await this.db.getLatestReadinessRun();
    if (!latest) {
      return {
        status: 'unverified',
        stale: false,
        blockingFailures: [],
        checks: [],
        message: 'Run the verified readiness check before relying on autonomous production.'
      };
    }
    const age = this.now().getTime() - new Date(latest.completed_at || latest.created_at).getTime();
    return {
      ...latest,
      stale: age > STALE_AFTER_MS,
      blockingFailures: latest.checks.filter(check => check.blocking && check.status === 'failed').map(check => check.id)
    };
  }

  async assertReady(action) {
    const summary = await this.getSummary();
    if (summary.status === 'failed') {
      const error = new Error(`${action} is blocked by the production readiness gate. Fix ${summary.blockingFailures.join(', ')} and run the check again.`);
      error.status = 409;
      error.readiness = summary;
      throw error;
    }
    return summary;
  }

  async run(options = {}) {
    if (this.activeRun) {
      const error = new Error('A production readiness check is already running');
      error.status = 409;
      throw error;
    }

    this.activeRun = this.executeRun(options).finally(() => {
      this.activeRun = null;
    });
    return this.activeRun;
  }

  async executeRun(options) {
    const startedAt = this.now().toISOString();
    const id = this.db.generateId ? this.db.generateId('readiness') : `readiness_${Date.now()}`;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yaa-readiness-'));
    const checks = [];

    try {
      checks.push(await this.executeCheck('text_provider', 'AI text provider', true, () => this.probeText()));
      checks.push(await this.executeCheck('image_provider', 'Image provider', false, () => this.probeImage(tempDir, Boolean(options.includePaidMedia))));
      checks.push(await this.executeCheck('video_provider', 'AI video provider', true, () => this.probeVideoProvider(tempDir, Boolean(options.includePaidVideo))));
      checks.push(await this.executeCheck('voice_narration', 'Voice narration', true, () => this.probeNarration(tempDir)));
      checks.push(await this.executeCheck('video_assembly', 'Audio/video assembly', true, () => this.probeVideoAssembly(tempDir)));
      checks.push(await this.executeCheck('youtube_access', 'YouTube channel access', true, () => this.probeYouTube()));
      checks.push(await this.executeCheck('upload_metadata', 'Upload metadata', true, () => this.probeMetadata()));

      const blockingFailures = checks.filter(check => check.blocking && check.status === 'failed');
      const warnings = checks.filter(check =>
        ['warning', 'skipped'].includes(check.status) || (!check.blocking && check.status === 'failed')
      );
      const status = blockingFailures.length ? 'failed' : warnings.length ? 'warning' : 'passed';
      const completedAt = this.now().toISOString();
      const result = {
        id,
        status,
        checks,
        summary: {
          passed: checks.filter(check => check.status === 'passed').length,
          warnings: warnings.length,
          failed: checks.filter(check => check.status === 'failed').length,
          blockingFailures: blockingFailures.map(check => check.id)
        },
        startedAt,
        completedAt
      };
      await this.db.saveReadinessRun(result);
      return { ...result, stale: false, blockingFailures: result.summary.blockingFailures };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async executeCheck(id, label, blocking, probe) {
    const started = Date.now();
    try {
      const result = await probe();
      return {
        id,
        label,
        blocking,
        status: result.status || 'passed',
        message: result.message,
        remediation: result.remediation || null,
        details: result.details || {},
        durationMs: Date.now() - started
      };
    } catch (error) {
      const safeMessage = this.safeError(error);
      this.logger.warn(`${label} readiness probe failed: ${safeMessage}`);
      return {
        id,
        label,
        blocking,
        status: 'failed',
        message: safeMessage,
        remediation: this.remediationFor(id),
        details: {},
        durationMs: Date.now() - started
      };
    }
  }

  async probeText() {
    if (this.probes.text) return this.probes.text();
    const service = new AITextService(this.credentialManager.credentials || {});
    if (!service.isAvailable()) throw new Error('No AI text provider is configured');
    const response = await service.generateText('Reply with exactly READY.', { maxTokens: 16, temperature: 0 });
    return { message: `${service.providerName} returned a live response.`, details: { provider: service.providerName, responseReceived: Boolean(response) } };
  }

  async probeImage(tempDir, includePaidMedia) {
    if (this.probes.image) return this.probes.image({ tempDir, includePaidMedia });
    const generator = new AIVideoGenerator(this.credentialManager.credentials || {});
    if (!generator.openai && !generator.gemini) {
      return { status: 'warning', message: 'No AI image provider is configured; gradient visuals will be used.', remediation: 'Configure OpenAI or Gemini image access if generated visuals are required.' };
    }
    if (!includePaidMedia) {
      return { status: 'skipped', message: 'Provider is configured; the paid live image probe was not requested.', remediation: 'Enable “Include paid image probe” on the next readiness run to verify image generation.' };
    }
    const outputPath = path.join(tempDir, 'readiness-image.png');
    await generator.generateImage('Simple red circle centered on a plain dark background, no text', outputPath);
    const stats = await fs.stat(outputPath);
    if (stats.size < 100) throw new Error('Image provider returned an empty or invalid asset');
    return { message: 'Image provider created a real test asset.', details: { bytes: stats.size } };
  }

  async probeNarration(tempDir) {
    if (this.probes.narration) return this.probes.narration({ tempDir });
    const generator = new AIVideoGenerator(this.credentialManager.credentials || {});
    const outputPath = path.join(tempDir, 'readiness-narration.mp3');
    const resultPath = await generator.generateTTSAudio('Production readiness audio check.', outputPath);
    if (path.extname(resultPath).toLowerCase() === '.info') throw new Error('No live narration provider is available; the pipeline returned a simulation');
    const stats = await fs.stat(resultPath);
    if (stats.size < 100) throw new Error('Narration provider returned an empty audio file');
    return { message: 'A live narration sample was generated.', details: { bytes: stats.size } };
  }

  async probeVideoProvider(tempDir, includePaidVideo) {
    if (this.probes.videoProvider) return this.probes.videoProvider({ tempDir, includePaidVideo });
    const service = new MediaGenerationService(this.db, this.credentialManager.credentials || {});
    const settings = await service.settings();
    const requested = settings.provider;
    const configured = requested === 'auto' ? service.registry.select('auto', settings.order) : service.registry.get(requested);
    if (!configured || !configured.isAvailable()) {
      if (requested === 'slideshow') {
        return { message: 'Local slideshow video generation is selected; no paid AI video provider is required.', details: { provider: 'slideshow' } };
      }
      throw new Error(`${requested} is selected but its credentials are not configured`);
    }
    if (configured.id === 'slideshow') {
      return { message: 'Local slideshow video generation is selected; no paid AI video provider is required.', details: { provider: 'slideshow' } };
    }
    if (!includePaidVideo) {
      return {
        status: 'skipped',
        message: `${configured.id} is configured; the paid live video probe was not requested.`,
        remediation: 'Enable “Include paid video probe” on the next readiness run to verify the selected model.',
        details: { provider: configured.id, model: configured.model }
      };
    }
    const outputPath = path.join(tempDir, 'readiness-provider.mp4');
    const result = await service.generateClip({
      jobId: null,
      productionId: `readiness_${Date.now()}`,
      scene: { index: Date.now() },
      provider: configured,
      outputPath,
      request: {
        prompt: 'A small red ball rolls slowly across a plain dark studio floor, static camera, no text.',
        duration: configured.capabilities.minDuration || 4,
        resolution: settings.resolution,
        aspectRatio: settings.aspectRatio,
        generateAudio: false
      }
    });
    const stats = await fs.stat(result.outputPath);
    return {
      message: `${configured.id} created and returned a decodable MP4.`,
      details: { provider: configured.id, model: configured.model, bytes: stats.size, taskId: result.task.external_task_id }
    };
  }

  async probeVideoAssembly(tempDir) {
    if (this.probes.videoAssembly) return this.probes.videoAssembly({ tempDir });
    if (!await checkFFmpeg()) throw new Error('FFmpeg is not available');
    const outputPath = path.join(tempDir, 'readiness-av.mp4');
    await runFFmpeg([
      '-y', '-f', 'lavfi', '-i', 'color=c=0x111827:s=320x180:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'mpeg4', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', outputPath
    ]);
    const buffer = await fs.readFile(outputPath);
    if (buffer.length < 1000 || buffer.subarray(4, 12).toString('ascii').indexOf('ftyp') === -1) {
      throw new Error('FFmpeg did not produce a valid MP4 container');
    }
    await runFFmpeg(['-v', 'error', '-i', outputPath, '-f', 'null', '-']);
    return { message: 'FFmpeg created and decoded a local MP4 containing audio and video.', details: { bytes: buffer.length } };
  }

  async probeYouTube() {
    if (this.probes.youtube) return this.probes.youtube();
    const youtube = this.credentialManager.getYouTubeClient();
    const response = await youtube.channels.list({ part: 'snippet,status', mine: true, maxResults: 1 });
    const channel = response.data?.items?.[0];
    if (!channel) throw new Error('The authorized Google account does not expose a YouTube channel');
    return {
      message: `Authorized channel access verified for ${channel.snippet?.title || 'the connected channel'}.`,
      details: { channelId: channel.id, channelTitle: channel.snippet?.title || null }
    };
  }

  async probeMetadata() {
    if (this.probes.metadata) return this.probes.metadata();
    const queue = await this.db.getPublishQueue();
    const candidates = queue.length ? queue : [{ title: 'Production readiness test', metadata: { seo: { title: 'Production readiness test', description: 'A safe local metadata validation sample for YouTube upload readiness.', tags: ['readiness', 'youtube', 'automation'], metadata: { category: 22, language: 'en' } } } }];
    const invalid = [];
    let warnings = 0;
    for (const item of candidates) {
      const result = validateYouTubeMetadata(item.metadata?.seo || item.metadata || { title: item.title });
      warnings += result.warnings.length;
      if (!result.valid) invalid.push({ productionId: item.productionId || null, title: item.title, errors: result.errors });
    }
    if (invalid.length) {
      const error = new Error(`${invalid.length} queued upload(s) have invalid YouTube metadata`);
      error.invalid = invalid;
      throw error;
    }
    return {
      status: warnings ? 'warning' : 'passed',
      message: queue.length ? `${queue.length} queued upload(s) passed metadata validation.` : 'Metadata rules passed with a safe local sample.',
      remediation: warnings ? 'Review queued descriptions and tags before publishing.' : null,
      details: { validated: candidates.length, queued: queue.length, warnings }
    };
  }

  safeError(error) {
    return String(error?.message || 'Probe failed')
      .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/AIza[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
      .replace(/(access_token|refresh_token|api[_-]?key|token)=([^\s&]+)/gi, '$1=[redacted]')
      .slice(0, 500);
  }

  remediationFor(id) {
    const messages = {
      text_provider: 'Run npm run walkthrough, verify the selected model, and confirm provider credits or quota.',
      image_provider: 'Verify paid image access or rely on the built-in gradient visual fallback.',
      video_provider: 'Configure the selected provider credentials, choose local slideshow, or rerun with the paid video probe enabled.',
      voice_narration: 'Configure OpenAI, Gemini TTS, ElevenLabs with a voice ID, or Azure Speech, then rerun.',
      video_assembly: 'Run npm install to restore ffmpeg-static, or configure FFMPEG_PATH to a working binary.',
      youtube_access: 'Reconnect YouTube in npm run walkthrough and ensure the Google account owns a channel.',
      upload_metadata: 'Edit the queued title, description, category, language, and tags before publishing.'
    };
    return messages[id] || 'Correct the configuration and rerun the readiness check.';
  }
}

module.exports = { ProductionReadinessService, STALE_AFTER_MS };
