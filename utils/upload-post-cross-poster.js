const fs = require('fs').promises;
const path = require('path');
const { Blob } = require('buffer');

const SUPPORTED_PLATFORMS = new Set(['tiktok', 'instagram']);
const DEFAULT_BASE_URL = 'https://api.upload-post.com';

function parsePlatforms(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map(item => String(item).trim().toLowerCase()).filter(Boolean))].sort();
}

// Optional adapter that sends an already-published Short to TikTok and Instagram Reels
// through the Upload-Post API (https://docs.upload-post.com). Disabled unless
// UPLOAD_POST_API_KEY and UPLOAD_POST_USER are set.
class UploadPostCrossPoster {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? process.env.UPLOAD_POST_API_KEY ?? '';
    this.user = options.user ?? process.env.UPLOAD_POST_USER ?? '';
    this.platforms = parsePlatforms(options.platforms ?? process.env.UPLOAD_POST_PLATFORMS ?? 'tiktok,instagram');
    this.baseUrl = (options.baseUrl || process.env.UPLOAD_POST_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetch = options.fetchImpl || globalThis.fetch;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.user);
  }

  resolvePlatforms(requested) {
    const platforms = requested === undefined ? this.platforms : parsePlatforms(requested);
    const unsupported = platforms.filter(platform => !SUPPORTED_PLATFORMS.has(platform));
    if (!platforms.length || unsupported.length) {
      const error = new Error(`Cross-posting supports ${[...SUPPORTED_PLATFORMS].join(' and ')}${unsupported.length ? `, not ${unsupported.join(', ')}` : ''}`);
      error.status = 400;
      throw error;
    }
    return platforms;
  }

  async publishShort({ clipId, videoPath, title, description, platforms, aiGenerated }) {
    const form = new FormData();
    form.append('user', this.user);
    for (const platform of platforms) form.append('platform[]', platform);
    form.append('title', title);
    if (description) form.append('description', description);
    form.append('async_upload', 'true');
    form.append('external_id', `agenttube-short-${clipId}`);
    if (platforms.includes('instagram')) form.append('media_type', 'REELS');
    // Disclosure comes from AgentTube's own provenance record, not from file metadata:
    // is_ai_generated covers every platform and is_aigc is TikTok's explicit flag.
    if (aiGenerated) form.append('is_ai_generated', 'true');
    if (aiGenerated && platforms.includes('tiktok')) form.append('is_aigc', 'true');
    const video = await fs.readFile(videoPath);
    form.append('video', new Blob([video], { type: 'video/mp4' }), path.basename(videoPath));

    const response = await this.fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Apikey ${this.apiKey}`,
        // The same Short sent to the same platforms always maps to one Upload-Post job,
        // so a retried request after a timeout cannot publish twice.
        'Idempotency-Key': `agenttube-short-${clipId}-${platforms.join('-')}`
      },
      body: form
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      const error = new Error(`Upload-Post rejected the Short: ${body.message || body.error || `HTTP ${response.status}`}`);
      error.status = response.status >= 500 ? 502 : 409;
      throw error;
    }
    return { requestId: body.request_id || null, jobId: body.job_id || null };
  }

  async getStatus(requestId) {
    const url = `${this.baseUrl}/api/uploadposts/status?request_id=${encodeURIComponent(requestId)}`;
    const response = await this.fetch(url, { headers: { Authorization: `Apikey ${this.apiKey}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Upload-Post status check failed: ${body.message || `HTTP ${response.status}`}`);
    return body;
  }
}

module.exports = { UploadPostCrossPoster, SUPPORTED_PLATFORMS };
