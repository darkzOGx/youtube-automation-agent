const fs = require('fs').promises;
const path = require('path');
const { runFFmpeg } = require('./ffmpeg');
const { Logger } = require('./logger');

const LAYOUTS = new Set(['blur', 'crop', 'stacked']);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || minimum));
}

function sentence(value = '') {
  return String(value).trim().split(/(?<=[.!?])\s+/)[0]?.trim() || '';
}

function truncate(value, maximum) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(0, maximum - 1)).trim()}…`;
}

function srtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

class ShortsRepurposingService {
  constructor(db, publishing, options = {}) {
    this.db = db;
    this.publishing = publishing;
    this.logger = options.logger || new Logger('ShortsRepurposing');
    this.dataRoot = options.dataRoot || path.join(__dirname, '..', 'data', 'shorts');
    this.width = Number(options.width || 1080);
    this.height = Number(options.height || 1920);
    this.runFFmpeg = options.runFFmpeg || runFFmpeg;
  }

  async propose(productionId, input = {}) {
    const bundle = await this.requireSource(productionId);
    const existing = await this.db.listShortClips(productionId);
    if (existing.length && input.replace !== true) return existing;
    if (existing.some(clip => ['approved', 'scheduled', 'uploading', 'published', 'reconciliation_required'].includes(clip.status))) {
      const error = new Error('Approved, scheduled, or published Shorts cannot be replaced');
      error.status = 409;
      throw error;
    }

    const count = Math.round(clamp(input.count || 3, 1, 5));
    const sourceScenes = bundle.scenes || [];
    const scenes = sourceScenes.filter(scene =>
      scene.assetPath && scene.status === 'ready' &&
      ['current', 'intentional_silence'].includes(scene.narrationStatus)
    );
    if (!scenes.length || scenes.length !== sourceScenes.length) {
      const error = new Error('Every source scene must be rebuilt and current before creating Short drafts');
      error.status = 409;
      throw error;
    }

    const sourceTitle = bundle.editorData?.title || bundle.seo?.title || bundle.script?.title || bundle.strategy?.topic || 'Untitled video';
    const windows = this.selectWindows(scenes, count);
    const baseTime = this.nextPublishBase(bundle);
    const inheritedEvidence = this.inheritedEvidence(bundle);
    const clips = windows.map((window, position) => {
      const lead = window.scenes[0];
      const hook = sentence(lead.scriptText) || lead.label || sourceTitle;
      const title = truncate(hook, 96);
      return {
        productionId,
        position,
        title,
        description: truncate(`A quick takeaway from ${sourceTitle}. Watch the full video on this channel. #Shorts`, 5000),
        tags: [...new Set([...(bundle.seo?.tags || []), 'Shorts'])].slice(0, 15),
        sourceSceneIds: window.scenes.map(scene => scene.id),
        startSeconds: window.startSeconds,
        duration: window.duration,
        layout: position === 1 ? 'crop' : position === 2 ? 'stacked' : 'blur',
        rationale: `Selected from ${window.scenes.map(scene => scene.label).join(', ')} as a self-contained vertical excerpt.`,
        status: 'proposed',
        publishTime: new Date(baseTime.getTime() + position * 86400000).toISOString(),
        privacyStatus: 'private',
        inheritedEvidence
      };
    });
    return this.db.replaceShortClips(productionId, clips);
  }

  selectWindows(scenes, requestedCount) {
    const timeline = [];
    let cursor = 0;
    for (const scene of scenes) {
      const duration = clamp(scene.duration || 5, 1, 180);
      timeline.push({ ...scene, startSeconds: cursor, duration });
      cursor += duration;
    }
    const count = Math.min(requestedCount, timeline.length);
    const anchorIndexes = [];
    for (let index = 0; index < count; index++) {
      anchorIndexes.push(Math.min(timeline.length - 1, Math.floor(index * timeline.length / count)));
    }
    return [...new Set(anchorIndexes)].map(anchorIndex => {
      const selected = [timeline[anchorIndex]];
      let total = selected[0].duration;
      let next = anchorIndex + 1;
      while (total < 20 && next < timeline.length && total + timeline[next].duration <= 60) {
        selected.push(timeline[next]);
        total += timeline[next].duration;
        next++;
      }
      let previous = anchorIndex - 1;
      while (total < 15 && previous >= 0 && total + timeline[previous].duration <= 60) {
        selected.unshift(timeline[previous]);
        total += timeline[previous].duration;
        previous--;
      }
      return {
        scenes: selected,
        startSeconds: selected[0].startSeconds,
        duration: Math.min(180, total)
      };
    });
  }

  async update(productionId, clipId, input = {}) {
    const clip = await this.requireClip(productionId, clipId);
    if (['approved', 'scheduled', 'uploading', 'published', 'reconciliation_required'].includes(clip.status)) {
      const error = new Error('This Short is locked after approval');
      error.status = 409;
      throw error;
    }
    const changes = {};
    if (input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title || title.length > 100) throw new Error('Short title must be between 1 and 100 characters');
      changes.title = title;
    }
    if (input.description !== undefined) changes.description = String(input.description).trim().slice(0, 5000);
    if (input.tags !== undefined) {
      const tags = Array.isArray(input.tags) ? input.tags : String(input.tags).split(',');
      changes.tags = [...new Set(tags.map(tag => String(tag).trim()).filter(Boolean))].slice(0, 30);
    }
    if (input.layout !== undefined) {
      if (!LAYOUTS.has(input.layout)) throw new Error('Short layout must be blur, crop, or stacked');
      changes.layout = input.layout;
    }
    if (input.publishTime !== undefined) {
      const date = new Date(input.publishTime);
      if (Number.isNaN(date.getTime())) throw new Error('Short publish time is invalid');
      changes.publishTime = date.toISOString();
    }
    if (input.privacyStatus !== undefined) {
      if (!['private', 'unlisted', 'public'].includes(input.privacyStatus)) throw new Error('Short privacy is invalid');
      changes.privacyStatus = input.privacyStatus;
    }
    if (clip.status === 'rendered' && Object.keys(changes).some(key => ['layout'].includes(key))) {
      changes.status = 'proposed';
      changes.outputPath = null;
      changes.captionsPath = null;
    }
    return this.db.updateShortClip(clipId, changes);
  }

  async render(productionId, clipId) {
    const bundle = await this.requireSource(productionId);
    const clip = await this.requireClip(productionId, clipId);
    if (['approved', 'scheduled', 'uploading', 'published', 'reconciliation_required'].includes(clip.status)) {
      const error = new Error('This Short is locked after approval');
      error.status = 409;
      throw error;
    }
    const sourceVideo = bundle.assets?.finalVideo?.path;
    await this.requireFile(sourceVideo, 'The approved source MP4 is missing');
    const sourceScenes = (bundle.scenes || []).filter(scene => clip.sourceSceneIds.includes(scene.id));
    if (!sourceScenes.length) throw new Error('The selected source scenes no longer exist');

    const directory = path.join(this.dataRoot, productionId);
    await fs.mkdir(directory, { recursive: true });
    const outputPath = path.join(directory, `${clip.id}.mp4`);
    const captionsPath = path.join(directory, `${clip.id}.srt`);
    await fs.writeFile(captionsPath, this.buildCaptions(sourceScenes, clip.duration), 'utf8');
    await this.db.updateShortClip(clip.id, { status: 'rendering', error: null });

    try {
      const filter = this.videoFilter(clip.layout, captionsPath);
      await this.runFFmpeg([
        '-y', '-ss', String(clip.startSeconds), '-i', sourceVideo, '-t', String(clip.duration),
        '-filter_complex', filter, '-map', '[shortv]', '-map', '0:a:0?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', outputPath
      ]);
      await this.runFFmpeg(['-v', 'error', '-i', outputPath, '-f', 'null', '-']);
      const stats = await fs.stat(outputPath);
      if (!stats.isFile() || stats.size <= 0) throw new Error('FFmpeg returned an empty Short');
      return this.db.updateShortClip(clip.id, {
        status: 'rendered', outputPath, captionsPath, error: null,
        renderedAt: new Date().toISOString()
      });
    } catch (error) {
      await this.db.updateShortClip(clip.id, { status: 'failed', error: error.message });
      throw error;
    }
  }

  videoFilter(layout, captionsPath) {
    const escapedCaptions = path.resolve(captionsPath)
      .replaceAll('\\', '/')
      .replace(':', '\\:')
      .replaceAll("'", "\\'");
    const subtitles = `subtitles='${escapedCaptions}':force_style='FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=170'`;
    if (layout === 'crop') {
      return `[0:v]scale=${this.width}:${this.height}:force_original_aspect_ratio=increase,crop=${this.width}:${this.height},${subtitles},fps=30,format=yuv420p[shortv]`;
    }
    if (layout === 'stacked') {
      const foregroundHeight = Math.round(this.height * 0.56);
      const y = Math.round(this.height * 0.13);
      return `[0:v]split=2[bg][fg];` +
        `[bg]scale=${this.width}:${this.height}:force_original_aspect_ratio=increase,crop=${this.width}:${this.height},boxblur=28:3[soft];` +
        `[fg]scale=${this.width}:${foregroundHeight}:force_original_aspect_ratio=decrease[front];` +
        `[soft][front]overlay=(W-w)/2:${y},${subtitles},fps=30,format=yuv420p[shortv]`;
    }
    return `[0:v]split=2[bg][fg];` +
      `[bg]scale=${this.width}:${this.height}:force_original_aspect_ratio=increase,crop=${this.width}:${this.height},boxblur=28:3[soft];` +
      `[fg]scale=${this.width}:${this.height}:force_original_aspect_ratio=decrease[front];` +
      `[soft][front]overlay=(W-w)/2:(H-h)/2,${subtitles},fps=30,format=yuv420p[shortv]`;
  }

  buildCaptions(scenes, duration) {
    const chunks = [];
    for (const scene of scenes) {
      const words = String(scene.scriptText || scene.label || '').trim().split(/\s+/).filter(Boolean);
      for (let index = 0; index < words.length; index += 7) chunks.push(words.slice(index, index + 7).join(' '));
    }
    if (!chunks.length) chunks.push('Watch the full video for more.');
    const segment = Number(duration || 1) / chunks.length;
    return chunks.map((text, index) => {
      const start = index * segment;
      const end = Math.min(Number(duration || 1), (index + 1) * segment);
      const captionEnd = Math.min(Number(duration || 1), Math.max(start + 0.5, end));
      return `${index + 1}\n${srtTime(start)} --> ${srtTime(captionEnd)}\n${text}\n`;
    }).join('\n');
  }

  async approve(productionId, clipId, input = {}) {
    if (input.confirmed !== true) {
      const error = new Error('Confirm the inherited evidence and Short schedule before approval');
      error.status = 409;
      error.code = 'SHORT_APPROVAL_REQUIRED';
      throw error;
    }
    const bundle = await this.requireSource(productionId);
    const clip = await this.requireClip(productionId, clipId);
    if (bundle.review_status !== 'approved') {
      const error = new Error('Approve the source production before scheduling its Shorts');
      error.status = 409;
      throw error;
    }
    const evidence = this.inheritedEvidence(bundle);
    if (!evidence.ready) {
      const error = new Error(`Source evidence is incomplete: ${evidence.blockingReasons.join(', ')}`);
      error.status = 409;
      throw error;
    }
    if (clip.status !== 'rendered') {
      const error = new Error('Render the current Short draft before approval');
      error.status = 409;
      throw error;
    }
    await this.requireFile(clip.outputPath, 'The rendered Short MP4 is missing');
    const publishTime = new Date(input.publishTime || clip.publishTime);
    if (Number.isNaN(publishTime.getTime())) throw new Error('Choose a valid Short publish time');
    const privacyStatus = input.privacyStatus || clip.privacyStatus || 'private';
    if (!['private', 'unlisted', 'public'].includes(privacyStatus)) throw new Error('Short privacy is invalid');
    const parentUrl = bundle.schedule?.youtube_url || bundle.schedule?.youtubeUrl;
    const description = parentUrl && !clip.description.includes(parentUrl)
      ? `${clip.description}\n\nWatch the full video: ${parentUrl}`.slice(0, 5000)
      : clip.description;
    const audio = bundle.assets?.audio || {};
    const schedule = await this.publishing.scheduleContent({
      id: clip.id,
      script: { title: clip.title },
      seo: {
        title: clip.title,
        description,
        tags: [...new Set([...(clip.tags || []), 'Shorts'])]
      },
      assets: {
        finalVideo: { path: clip.outputPath, simulated: false, aspectRatio: '9:16', duration: clip.duration },
        audio,
        captions: clip.captionsPath ? { path: clip.captionsPath } : null,
        thumbnail: null
      },
      scheduledPublishTime: publishTime.toISOString(),
      priority: 60,
      privacyStatus,
      containsSyntheticMedia: evidence.containsSyntheticMedia,
      contentType: 'short',
      sourceProductionId: productionId,
      shortClipId: clip.id
    });
    if (!schedule) {
      const error = new Error('The Short could not be scheduled because its rendered media or narration evidence is incomplete');
      error.status = 409;
      throw error;
    }
    return this.db.updateShortClip(clip.id, {
      status: 'scheduled', publishTime: publishTime.toISOString(), privacyStatus,
      inheritedEvidence: evidence, approvedAt: new Date().toISOString(), scheduleId: schedule.id,
      error: null
    });
  }

  inheritedEvidence(bundle) {
    const blockingReasons = [];
    if (bundle.review_status !== 'approved') blockingReasons.push('source approval');
    if (!['verified', 'not_required'].includes(bundle.provenance?.status || 'not_required')) blockingReasons.push('provenance review');
    const unlicensed = (bundle.scenes || []).filter(scene => scene.assetOrigin === 'uploaded' && !scene.rightsConfirmed);
    if (unlicensed.length) blockingReasons.push('media rights');
    const stale = (bundle.scenes || []).filter(scene =>
      !['ready'].includes(scene.status) || !['current', 'intentional_silence'].includes(scene.narrationStatus)
    );
    if (stale.length) blockingReasons.push('current scene evidence');
    return {
      ready: blockingReasons.length === 0,
      blockingReasons,
      sourceReviewStatus: bundle.review_status || 'needs_review',
      provenanceStatus: bundle.provenance?.status || 'not_required',
      rightsConfirmed: unlicensed.length === 0,
      containsSyntheticMedia: bundle.provenance?.containsSyntheticMedia === true,
      capturedAt: new Date().toISOString()
    };
  }

  nextPublishBase(bundle) {
    const sourceTime = new Date(bundle.schedule?.publish_time || bundle.schedule?.published_at || bundle.scheduled_publish_time || Date.now());
    const minimum = new Date(Date.now() + 3600000);
    const candidate = Number.isNaN(sourceTime.getTime()) ? minimum : new Date(sourceTime.getTime() + 86400000);
    return candidate > minimum ? candidate : minimum;
  }

  async requireSource(productionId) {
    const bundle = await this.db.getProductionBundle(productionId);
    if (!bundle) {
      const error = new Error('Source production not found');
      error.status = 404;
      throw error;
    }
    if (!bundle.assets?.finalVideo?.path || bundle.assets.finalVideo.simulated) {
      const error = new Error('A real source MP4 is required before creating Shorts');
      error.status = 409;
      throw error;
    }
    return bundle;
  }

  async requireClip(productionId, clipId) {
    const clip = await this.db.getShortClip(clipId);
    if (!clip || clip.productionId !== productionId) {
      const error = new Error('Short draft not found');
      error.status = 404;
      throw error;
    }
    return clip;
  }

  async requireFile(filePath, message) {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size <= 0) throw new Error(message);
    } catch (_error) {
      const error = new Error(message);
      error.status = 409;
      throw error;
    }
  }
}

module.exports = { ShortsRepurposingService, LAYOUTS };
