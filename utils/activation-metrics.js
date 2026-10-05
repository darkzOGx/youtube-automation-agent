const fs = require('fs').promises;
const path = require('path');

class ActivationMetrics {
  constructor(db) {
    this.db = db;
  }

  async markSetupReady(details = {}) {
    const existing = await this.db.getSetting('setup_completed_at');
    if (existing) return existing;

    const completedAt = new Date().toISOString();
    await this.db.setSetting(
      'setup_completed_at',
      completedAt,
      'First time credentials, YouTube authorization, and local video assembly were ready'
    );
    await this.db.executeQuery(
      'INSERT INTO automation_events (event_type, status, data, created_at) VALUES (?, ?, ?, ?)',
      ['activation_setup_ready', 'success', JSON.stringify({
        hasText: Boolean(details.hasText),
        hasMedia: Boolean(details.hasImages || details.hasTTS),
        hasFFmpeg: Boolean(details.hasFFmpeg),
        hasUpload: Boolean(details.hasUpload)
      }), completedAt]
    );
    return completedAt;
  }

  async validRealVideo(production) {
    const video = production.assets?.finalVideo;
    if (!video?.path || video.simulated || path.extname(video.path).toLowerCase() !== '.mp4') return false;
    let handle;
    try {
      const stats = await fs.stat(video.path);
      if (!stats.isFile() || stats.size < 12) return false;

      handle = await fs.open(video.path, 'r');
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      return bytesRead === header.length && header.toString('ascii', 4, 8) === 'ftyp';
    } catch (_error) {
      return false;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async getSummary() {
    const [setupCompletedAt, jobs, productions, approvedRows, publishedRows] = await Promise.all([
      this.db.getSetting('setup_completed_at'),
      this.db.listGenerationJobs(1000),
      this.db.getProductionPipeline(),
      this.db.getAllRows(
        "SELECT production_id, reviewed_at, created_at FROM content_reviews WHERE status = 'approved' ORDER BY COALESCE(reviewed_at, created_at) ASC"
      ),
      this.db.getAllRows(
        "SELECT production_id, published_at, youtube_url FROM publish_schedule WHERE status = 'published' AND youtube_url IS NOT NULL ORDER BY published_at ASC"
      )
    ]);

    const realVideos = [];
    for (const production of productions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
      if (await this.validRealVideo(production)) realVideos.push(production);
    }

    const completedJobs = jobs.filter(job => job.status === 'completed');
    const failedJobs = jobs.filter(job => job.status === 'failed');
    const firstRealVideoAt = realVideos[0]?.timeline?.readyForUpload || realVideos[0]?.created_at || null;
    const secondRealVideoAt = realVideos[1]?.timeline?.readyForUpload || realVideos[1]?.created_at || null;
    const firstApprovedAt = approvedRows[0]?.reviewed_at || approvedRows[0]?.created_at || null;
    const firstPublishedAt = publishedRows[0]?.published_at || null;

    return {
      schemaVersion: 1,
      privacy: 'local-only',
      definition: 'A real video is a non-simulated .mp4 with an MP4 container signature that still exists on disk.',
      counts: {
        generationJobs: jobs.length,
        completedJobs: completedJobs.length,
        failedJobs: failedJobs.length,
        realVideos: realVideos.length,
        approvedVideos: approvedRows.length,
        publishedVideos: publishedRows.length
      },
      milestones: {
        setupReady: { achieved: Boolean(setupCompletedAt), at: setupCompletedAt },
        firstRealVideo: { achieved: Boolean(firstRealVideoAt), at: firstRealVideoAt },
        firstApproval: { achieved: Boolean(firstApprovedAt), at: firstApprovedAt },
        firstPublish: { achieved: Boolean(firstPublishedAt), at: firstPublishedAt },
        secondRealVideo: { achieved: Boolean(secondRealVideoAt), at: secondRealVideoAt }
      }
    };
  }
}

module.exports = { ActivationMetrics };
