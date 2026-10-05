const fs = require('fs').promises;

const GENERATION_STAGES = [
  'strategy',
  'script',
  'thumbnail',
  'seo',
  'production',
  'quality_review'
];

class GenerationRecoveryService {
  constructor(db, options = {}) {
    this.db = db;
    this.updateJobStage = options.updateJobStage || (async () => null);
    this.logger = options.logger || { info() {}, warn() {} };
    this.maxAttempts = Math.max(1, Number(options.maxAttempts || process.env.GENERATION_STAGE_MAX_ATTEMPTS || 2));
    this.baseDelayMs = Math.max(0, Number(options.baseDelayMs ?? process.env.GENERATION_RETRY_BASE_MS ?? 1000));
  }

  async run(jobId, stage, progress, producer) {
    if (!GENERATION_STAGES.includes(stage)) throw new Error(`Unknown generation stage: ${stage}`);
    const checkpoint = await this.db.getGenerationCheckpoint(jobId, stage);
    if (checkpoint?.status === 'completed') {
      if (await this.validateArtifact(stage, checkpoint.artifact)) {
        await this.markReused(jobId, stage, progress);
        this.logger.info(`Reusing verified ${stage} checkpoint for ${jobId}`);
        return checkpoint.artifact;
      }
      const stageIndex = GENERATION_STAGES.indexOf(stage);
      await this.db.deleteGenerationCheckpoints(jobId, GENERATION_STAGES.slice(stageIndex + 1));
      await this.db.saveGenerationCheckpoint(jobId, stage, {
        status: 'invalid',
        error: 'The saved artifact is missing or no longer valid',
        completedAt: null
      });
    }

    let lastError;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      await this.updateJobStage(jobId, stage, progress, { attempt });
      const startedAt = new Date().toISOString();
      await this.db.saveGenerationCheckpoint(jobId, stage, {
        status: 'running',
        error: null,
        startedAt,
        completedAt: null,
        incrementAttempt: true
      });
      try {
        const artifact = await producer();
        if (!await this.validateArtifact(stage, artifact)) {
          throw new Error(`${stage} produced an incomplete or missing artifact`);
        }
        await this.db.saveGenerationCheckpoint(jobId, stage, {
          status: 'completed',
          artifact,
          error: null,
          completedAt: new Date().toISOString()
        });
        return artifact;
      } catch (error) {
        lastError = error;
        await this.db.saveGenerationCheckpoint(jobId, stage, {
          status: error.code === 'JOB_CANCELLED' ? 'cancelled' : 'failed',
          error: error.message,
          completedAt: new Date().toISOString()
        });
        if (error.code === 'JOB_CANCELLED' || attempt >= this.maxAttempts || !this.isRetryable(error)) throw error;
        const delayMs = this.baseDelayMs * (2 ** (attempt - 1));
        this.logger.warn(`${stage} failed transiently; retrying in ${delayMs}ms: ${error.message}`);
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }

  async validateArtifact(stage, artifact) {
    if (!artifact || typeof artifact !== 'object') return false;
    if (stage === 'strategy') return Boolean(artifact.topic);
    if (stage === 'script') return Boolean(artifact.title && (artifact.fullScript || artifact.mainContent));
    if (stage === 'thumbnail') return this.validatePathArtifact(artifact.path);
    if (stage === 'seo') return Boolean(artifact.title && artifact.description && Array.isArray(artifact.tags));
    if (stage === 'production') {
      const finalVideo = artifact.assets?.finalVideo;
      return Boolean(artifact.id && finalVideo?.path && await this.pathExists(finalVideo.path));
    }
    if (stage === 'quality_review') return Boolean(artifact.contentId && artifact.reviewStatus);
    return false;
  }

  async validatePathArtifact(filePath) {
    return Boolean(filePath && await this.pathExists(filePath));
  }

  async pathExists(filePath) {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile() && stat.size > 0;
    } catch (_error) {
      return false;
    }
  }

  isRetryable(error) {
    const status = Number(error.status || error.statusCode || error.response?.status || 0);
    if ([408, 425, 429].includes(status) || status >= 500) return true;
    const code = String(error.code || '').toUpperCase();
    return ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN'].includes(code);
  }

  async markReused(jobId, stage, progress) {
    const job = await this.db.getGenerationJob(jobId);
    const reusedStages = Array.from(new Set([...(job?.details?.reusedStages || []), stage]));
    await this.updateJobStage(jobId, stage, progress, { reusedStages });
  }

  resumePoint(checkpoints = []) {
    const byStage = new Map(checkpoints.map(checkpoint => [checkpoint.stage, checkpoint]));
    return GENERATION_STAGES.find(stage => byStage.get(stage)?.status !== 'completed') || 'quality_review';
  }

  async resetFrom(jobId, requestedStage) {
    if (!GENERATION_STAGES.includes(requestedStage)) throw new Error('Resume stage is not supported');
    const index = GENERATION_STAGES.indexOf(requestedStage);
    await this.db.deleteGenerationCheckpoints(jobId, GENERATION_STAGES.slice(index));
  }
}

module.exports = { GenerationRecoveryService, GENERATION_STAGES };
