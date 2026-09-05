const fs = require('fs').promises;
const { Logger } = require('./logger');

const ACTIVE_STATUSES = new Set(['draft', 'approved', 'running', 'awaiting_winner', 'action_required']);

class GrowthExperimentService {
  constructor(db, analytics, publishing, options = {}) {
    this.db = db;
    this.analytics = analytics;
    this.publishing = publishing;
    this.logger = options.logger || new Logger('GrowthExperiments');
    this.now = options.now || (() => new Date());
    this.activeRefreshes = new Set();
  }

  error(message, status = 400, code = 'EXPERIMENT_INVALID') {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
  }

  async create(input = {}) {
    const productionId = String(input.productionId || '').trim();
    if (!productionId) throw this.error('Choose a published production to test');
    const armDurationHours = Number(input.armDurationHours || 48);
    const minImpressions = Number(input.minImpressions || 1000);
    if (!Number.isInteger(armDurationHours) || armDurationHours < 24 || armDurationHours > 168) {
      throw this.error('Each experiment arm must run for 24 to 168 hours');
    }
    if (!Number.isInteger(minImpressions) || minImpressions < 100 || minImpressions > 1000000) {
      throw this.error('Minimum impressions must be an integer from 100 to 1,000,000');
    }

    const existing = await this.db.listGrowthExperiments({ productionId, limit: 20 });
    if (existing.some(experiment => ACTIVE_STATUSES.has(experiment.status))) {
      throw this.error('This production already has an unfinished growth experiment', 409, 'EXPERIMENT_EXISTS');
    }
    const bundle = await this.db.getProductionBundle(productionId);
    const schedule = bundle?.schedule;
    if (!bundle || schedule?.status !== 'published' || !schedule.youtube_id) {
      throw this.error('Growth experiments require a published YouTube production', 409, 'EXPERIMENT_NOT_PUBLISHED');
    }
    const packaging = bundle.editorData?.packagingExperiment;
    if (!packaging?.titleVariants?.length || !packaging?.thumbnailVariants?.length) {
      throw this.error('This production has no approved-learning packaging variants to test', 409, 'EXPERIMENT_VARIANTS_MISSING');
    }
    const sourceRecommendation = packaging.sourceRecommendationId
      ? await this.db.getLearningRecommendation(packaging.sourceRecommendationId)
      : null;
    if (!sourceRecommendation || sourceRecommendation.status !== 'approved') {
      throw this.error('The source packaging recommendation is no longer approved', 409, 'EXPERIMENT_LEARNING_NOT_APPROVED');
    }

    const control = {
      label: 'Control',
      title: schedule.metadata?.seo?.title || schedule.title || bundle.seo?.title || bundle.script?.title,
      thumbnailPath: schedule.metadata?.thumbnail?.path || bundle.assets?.thumbnail?.path || bundle.thumbnail?.path,
      isControl: true
    };
    const variants = packaging.titleVariants
      .map((variant, index) => ({
        label: variant.label === 'Control' ? 'Original package' : (variant.label || `Variant ${index + 1}`),
        title: variant.title,
        thumbnailPath: packaging.thumbnailVariants[index]?.path,
        isControl: false
      }))
      .filter(arm => arm.title && arm.thumbnailPath)
      .filter(arm => arm.title !== control.title || arm.thumbnailPath !== control.thumbnailPath);
    const arms = [control, ...variants].filter((arm, index, list) =>
      arm.title && arm.thumbnailPath && list.findIndex(candidate =>
        candidate.title === arm.title && candidate.thumbnailPath === arm.thumbnailPath
      ) === index
    ).slice(0, 3);
    if (arms.length < 2) {
      throw this.error('At least one complete title and thumbnail variant is required', 409, 'EXPERIMENT_VARIANTS_MISSING');
    }
    for (const arm of arms) {
      if (arm.title.length > 100) throw this.error(`${arm.label} title exceeds YouTube's 100-character limit`);
      await this.requireFile(arm.thumbnailPath, `${arm.label} thumbnail is missing from disk`);
    }

    return this.db.createGrowthExperiment({
      productionId,
      videoId: schedule.youtube_id,
      recommendationId: packaging.sourceRecommendationId || null,
      title: `Packaging test: ${control.title}`,
      hypothesis: packaging.hypothesis || 'A new title and thumbnail package will improve qualified click-through rate.',
      armDurationHours,
      minImpressions,
      guardrails: {
        maximumRetentionDropPoints: 5,
        maximumTrafficSourceShiftPoints: 20,
        simulatedEvidenceAllowed: false,
        automaticWinnerAdoption: false
      }
    }, arms);
  }

  async approve(id, input = {}) {
    const experiment = await this.requireExperiment(id);
    if (experiment.status !== 'draft') throw this.error('Only a draft experiment can be approved', 409);
    if (input.confirmed !== true) throw this.error('Confirm the complete experiment plan before approval', 409, 'EXPERIMENT_CONFIRMATION_REQUIRED');
    return this.db.updateGrowthExperiment(id, { status: 'approved', approvedAt: this.isoNow() });
  }

  async start(id, input = {}) {
    const experiment = await this.requireExperiment(id);
    if (experiment.status !== 'approved' || !experiment.approvedAt) {
      throw this.error('Approve the experiment plan before starting it', 409, 'EXPERIMENT_APPROVAL_REQUIRED');
    }
    if (input.confirmed !== true) throw this.error('Confirm activation before changing live YouTube packaging', 409, 'EXPERIMENT_CONFIRMATION_REQUIRED');
    const baseline = await this.captureMetrics(experiment.videoId);
    const arm = experiment.arms[0];
    const startedAt = this.isoNow();
    await this.db.updateExperimentArm(arm.id, {
      status: 'running', baselineMetrics: baseline.metrics, startedAt
    });
    await this.db.saveExperimentSample({
      experimentId: experiment.id, armId: arm.id,
      metrics: baseline.metrics, trafficSources: baseline.trafficSources, capturedAt: startedAt
    });
    try {
      await this.applyArm(experiment, arm, arm);
    } catch (error) {
      await this.db.updateExperimentArm(arm.id, { status: 'failed' });
      await this.db.updateGrowthExperiment(id, {
        status: 'action_required', currentArmId: arm.id, startedAt,
        result: { activationError: error.message }
      });
      throw error;
    }
    return this.db.updateGrowthExperiment(id, {
      status: 'running', currentArmId: arm.id, startedAt
    });
  }

  async refresh(id, options = {}) {
    if (this.activeRefreshes.has(id)) {
      throw this.error('This experiment is already refreshing', 409, 'EXPERIMENT_BUSY');
    }
    this.activeRefreshes.add(id);
    try {
      return await this.refreshUnlocked(id, options);
    } finally {
      this.activeRefreshes.delete(id);
    }
  }

  async refreshUnlocked(id, options = {}) {
    const experiment = await this.requireExperiment(id);
    if (experiment.status !== 'running') throw this.error('Only a running experiment can collect evidence', 409);
    const arm = experiment.arms.find(candidate => candidate.id === experiment.currentArmId);
    if (!arm) throw this.error('The running experiment has no active arm', 409, 'EXPERIMENT_STATE_INVALID');
    const capturedAt = this.isoNow();
    const evidence = await this.captureMetrics(experiment.videoId);
    await this.db.saveExperimentSample({
      experimentId: experiment.id, armId: arm.id,
      metrics: evidence.metrics, trafficSources: evidence.trafficSources, capturedAt
    });

    const elapsedHours = (this.now().getTime() - new Date(arm.startedAt).getTime()) / 3600000;
    if (!options.forceAdvance && elapsedHours < experiment.armDurationHours) {
      return this.db.getGrowthExperiment(id);
    }

    const armResult = this.calculateArmResult(arm.baselineMetrics, evidence.metrics);
    await this.db.updateExperimentArm(arm.id, {
      status: 'completed', finalMetrics: evidence.metrics, result: armResult, endedAt: capturedAt
    });
    const next = experiment.arms.find(candidate => candidate.index === arm.index + 1);
    if (next) {
      await this.db.updateExperimentArm(next.id, {
        status: 'running', baselineMetrics: evidence.metrics, startedAt: capturedAt
      });
      await this.db.saveExperimentSample({
        experimentId: experiment.id, armId: next.id,
        metrics: evidence.metrics, trafficSources: evidence.trafficSources, capturedAt
      });
      await this.db.updateGrowthExperiment(id, { currentArmId: next.id });
      try {
        await this.applyArm(experiment, next, arm);
      } catch (error) {
        await this.failRestore(experiment, error);
        throw error;
      }
      return this.db.getGrowthExperiment(id);
    }

    const completed = await this.db.getGrowthExperiment(id);
    const result = await this.evaluate(completed);
    const control = completed.arms.find(candidate => candidate.isControl);
    try {
      await this.applyArm(completed, control, arm);
    } catch (error) {
      await this.failRestore(completed, error, result);
      throw error;
    }
    return this.db.updateGrowthExperiment(id, {
      status: result.winnerArmId ? 'awaiting_winner' : 'inconclusive',
      currentArmId: null,
      winningArmId: result.winnerArmId || null,
      result,
      completedAt: capturedAt
    });
  }

  async adoptWinner(id, input = {}) {
    const experiment = await this.requireExperiment(id);
    if (experiment.status !== 'awaiting_winner' || !experiment.winningArmId) {
      throw this.error('This experiment has no evidence-backed winner to adopt', 409);
    }
    if (input.confirmed !== true) throw this.error('Confirm the winner before changing live YouTube packaging', 409, 'EXPERIMENT_CONFIRMATION_REQUIRED');
    const winner = experiment.arms.find(arm => arm.id === experiment.winningArmId);
    const control = experiment.arms.find(arm => arm.isControl);
    await this.applyArm(experiment, winner, control);
    const recommendation = await this.db.saveLearningRecommendation({
      fingerprint: `growth-experiment:${experiment.id}:winner`,
      category: 'packaging_experiment',
      title: `Reuse the ${winner.label} packaging pattern`,
      rationale: `${winner.label} produced ${winner.result.ctr.toFixed(2)}% CTR across ${winner.result.impressions} qualified impressions in a controlled test.`,
      evidence: {
        experimentId: experiment.id,
        videoId: experiment.videoId,
        winnerArmId: winner.id,
        liftPercent: experiment.result.liftPercent,
        zScore: experiment.result.zScore,
        guardrails: experiment.result.guardrails
      },
      proposedChange: {
        target: 'future_packaging',
        experiment: 'validated_title_thumbnail_pattern',
        winningTitle: winner.title,
        hypothesis: experiment.hypothesis,
        autoApply: false
      },
      confidence: experiment.result.confidence || 'medium'
    });
    await this.db.reviewLearningRecommendation(recommendation.id, 'approved');
    return this.db.updateGrowthExperiment(id, {
      status: 'adopted', adoptedAt: this.isoNow(), currentArmId: winner.id
    });
  }

  async cancel(id, input = {}) {
    const experiment = await this.requireExperiment(id);
    if (!['draft', 'approved', 'running', 'action_required'].includes(experiment.status)) {
      throw this.error('This experiment can no longer be cancelled', 409);
    }
    if (input.confirmed !== true) throw this.error('Confirm cancellation before restoring the control packaging', 409, 'EXPERIMENT_CONFIRMATION_REQUIRED');
    if (['running', 'action_required'].includes(experiment.status)) {
      const control = experiment.arms.find(arm => arm.isControl);
      const current = experiment.arms.find(arm => arm.id === experiment.currentArmId) || control;
      await this.applyArm(experiment, control, current);
    }
    return this.db.updateGrowthExperiment(id, {
      status: 'cancelled', currentArmId: null, cancelledAt: this.isoNow()
    });
  }

  async refreshDue() {
    const running = await this.db.listGrowthExperiments({ status: 'running', limit: 50 });
    let refreshed = 0;
    let failed = 0;
    for (const experiment of running) {
      const samples = await this.db.listExperimentSamples(experiment.id, 250);
      const latest = samples.at(-1);
      const ageHours = latest ? (this.now().getTime() - new Date(latest.capturedAt).getTime()) / 3600000 : Infinity;
      if (ageHours < 4) continue;
      try {
        await this.refresh(experiment.id);
        refreshed++;
      } catch (error) {
        failed++;
        this.logger.error(`Growth experiment refresh failed for ${experiment.id}: ${error.message}`);
      }
    }
    return { running: running.length, refreshed, failed };
  }

  async getSummary() {
    const experiments = await this.db.listGrowthExperiments({ limit: 25 });
    const rows = await this.db.getAllRows(
      `SELECT p.id AS production_id, ps.title, ps.youtube_id, cr.editor_data
       FROM publish_schedule ps
       JOIN productions p ON p.id = ps.production_id
       JOIN content_reviews cr ON cr.production_id = p.id
       WHERE ps.status = 'published' AND ps.youtube_id IS NOT NULL
       ORDER BY ps.published_at DESC LIMIT 50`
    );
    const activeProductionIds = new Set(experiments.filter(item => ACTIVE_STATUSES.has(item.status)).map(item => item.productionId));
    const candidates = (await Promise.all(rows.map(async row => {
      const packaging = this.parseJSON(row.editor_data, {}).packagingExperiment;
      if (!packaging?.sourceRecommendationId || activeProductionIds.has(row.production_id)) return null;
      const recommendation = await this.db.getLearningRecommendation(packaging.sourceRecommendationId);
      if (recommendation?.status !== 'approved') return null;
      return { productionId: row.production_id, videoId: row.youtube_id, title: row.title };
    }))).filter(Boolean);
    return {
      experiments,
      candidates,
      activeCount: experiments.filter(item => item.status === 'running').length,
      awaitingDecisionCount: experiments.filter(item => item.status === 'awaiting_winner').length,
      evidencePolicy: 'Only real YouTube evidence counts. Plan approval authorizes bounded arm rotations; adopting a winner always requires a separate confirmation.'
    };
  }

  async evaluate(experiment) {
    const samples = await this.db.listExperimentSamples(experiment.id, 1000);
    const arms = experiment.arms.map(arm => {
      const armSamples = samples.filter(sample => sample.armId === arm.id);
      const trafficShift = this.trafficSourceShift(armSamples.at(0)?.trafficSources, armSamples.at(-1)?.trafficSources);
      return { ...arm, result: { ...arm.result, trafficSourceShiftPoints: trafficShift } };
    });
    await Promise.all(arms.map(arm => this.db.updateExperimentArm(arm.id, { result: arm.result })));
    const eligible = arms.filter(arm => arm.result.impressions >= experiment.minImpressions && arm.result.clicks >= 10);
    const result = {
      primaryMetric: 'ctr',
      minImpressions: experiment.minImpressions,
      eligibleArms: eligible.length,
      totalArms: arms.length,
      winnerArmId: null,
      confidence: 'low',
      reason: '',
      guardrails: { passed: false }
    };
    if (eligible.length !== arms.length) {
      result.reason = 'Inconclusive: every arm must reach the minimum qualified impressions and clicks.';
      return result;
    }
    const ranked = [...eligible].sort((a, b) => b.result.ctr - a.result.ctr);
    const [best, runnerUp] = ranked;
    const zScore = this.twoProportionZ(best.result, runnerUp.result);
    const control = arms.find(arm => arm.isControl);
    const retentionDrop = control && best.id !== control.id
      ? Number((best.result.averageViewPercentage - control.result.averageViewPercentage).toFixed(2))
      : 0;
    const trafficShift = Number(best.result.trafficSourceShiftPoints || 0);
    const guardrailsPassed = retentionDrop >= -Number(experiment.guardrails.maximumRetentionDropPoints || 5)
      && trafficShift <= Number(experiment.guardrails.maximumTrafficSourceShiftPoints || 20);
    Object.assign(result, {
      zScore: Number(zScore.toFixed(3)),
      liftPercent: runnerUp.result.ctr > 0
        ? Number((((best.result.ctr - runnerUp.result.ctr) / runnerUp.result.ctr) * 100).toFixed(1))
        : null,
      guardrails: { passed: guardrailsPassed, retentionDropPoints: retentionDrop, trafficSourceShiftPoints: trafficShift }
    });
    if (zScore < 1.96) {
      result.reason = 'Inconclusive: the leading arm did not clear the 95% evidence threshold.';
    } else if (!guardrailsPassed) {
      result.reason = 'Inconclusive: the leading arm regressed a retention or traffic-mix guardrail.';
    } else {
      result.winnerArmId = best.id;
      result.confidence = zScore >= 2.576 ? 'high' : 'medium';
      result.reason = `${best.label} cleared the evidence and guardrail thresholds.`;
    }
    return result;
  }

  calculateArmResult(start = {}, end = {}) {
    const impressions = Math.max(0, Number(end.impressions || 0) - Number(start.impressions || 0));
    const clicks = Math.max(0, Number(end.clicks || 0) - Number(start.clicks || 0));
    const views = Math.max(0, Number(end.views || 0) - Number(start.views || 0));
    const intervalAverage = key => {
      if (!views) return Number(end[key] || 0);
      const weighted = (Number(end[key] || 0) * Number(end.views || 0))
        - (Number(start[key] || 0) * Number(start.views || 0));
      return Number(Math.max(0, weighted / views).toFixed(3));
    };
    return {
      impressions,
      clicks: Number(clicks.toFixed(3)),
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(3)) : 0,
      views,
      watchMinutes: Math.max(0, Number(end.watchMinutes || 0) - Number(start.watchMinutes || 0)),
      netSubscribers: Number(end.netSubscribers || 0) - Number(start.netSubscribers || 0),
      estimatedRevenue: Number((Number(end.estimatedRevenue || 0) - Number(start.estimatedRevenue || 0)).toFixed(3)),
      averageViewPercentage: intervalAverage('averageViewPercentage'),
      engagementRate: intervalAverage('engagementRate')
    };
  }

  twoProportionZ(first, second) {
    const n1 = Number(first.impressions || 0);
    const n2 = Number(second.impressions || 0);
    if (!n1 || !n2) return 0;
    const p1 = Number(first.clicks || 0) / n1;
    const p2 = Number(second.clicks || 0) / n2;
    const pooled = (Number(first.clicks || 0) + Number(second.clicks || 0)) / (n1 + n2);
    const standardError = Math.sqrt(pooled * (1 - pooled) * ((1 / n1) + (1 / n2)));
    return standardError > 0 ? Math.abs(p1 - p2) / standardError : 0;
  }

  trafficSourceShift(start = [], end = []) {
    const toMap = sources => new Map((sources || []).map(source => [source.source, Number(source.percentage || 0)]));
    const a = toMap(start);
    const b = toMap(end);
    const keys = new Set([...a.keys(), ...b.keys()]);
    return Number(Math.max(0, ...[...keys].map(key => Math.abs((b.get(key) || 0) - (a.get(key) || 0)))).toFixed(2));
  }

  async captureMetrics(videoId) {
    const report = await this.analytics.analyzeVideoPerformance(videoId, { measurementWindow: 'rolling' });
    if (!report || report.analytics?.simulated) {
      throw this.error('Real YouTube analytics are unavailable; simulated evidence cannot advance an experiment', 409, 'EXPERIMENT_EVIDENCE_UNAVAILABLE');
    }
    const views = report.analytics?.views || {};
    const ctr = Number(report.thumbnailMetrics?.clickThroughRate ?? views.averageCTR ?? 0);
    const impressions = Number(report.thumbnailMetrics?.impressions ?? views.totalImpressions ?? 0);
    const dailyRows = Array.isArray(views.dailyData) ? views.dailyData : [];
    const clicks = dailyRows.length
      ? dailyRows.reduce((sum, row) => sum + (Number(row[2] || 0) * Number(row[3] || 0) / 100), 0)
      : impressions * ctr / 100;
    return {
      metrics: {
        impressions,
        clicks: Number(clicks.toFixed(3)),
        ctr,
        views: Number(views.totalViews || 0),
        watchMinutes: Number(report.analytics?.watchTime?.totalWatchTime || 0),
        averageViewPercentage: Number(report.analytics?.watchTime?.averageViewPercentage || 0),
        engagementRate: Number(report.analytics?.engagement?.engagementRate || 0),
        netSubscribers: Number(report.analytics?.outcomes?.netSubscribers || 0),
        estimatedRevenue: Number(report.analytics?.outcomes?.estimatedRevenue || 0)
      },
      trafficSources: report.analytics?.trafficSources?.sources || []
    };
  }

  async applyArm(experiment, arm, previousArm) {
    if (!arm) throw this.error('Experiment arm is missing', 409, 'EXPERIMENT_STATE_INVALID');
    await this.publishing.applyVideoPackaging(experiment.videoId, {
      title: arm.title,
      thumbnailPath: arm.thumbnailPath
    }, previousArm ? {
      title: previousArm.title,
      thumbnailPath: previousArm.thumbnailPath
    } : null);
  }

  async failRestore(experiment, error, result = {}) {
    await this.db.updateGrowthExperiment(experiment.id, {
      status: 'action_required',
      result: { ...result, restoreError: error.message },
      completedAt: this.isoNow()
    });
  }

  async requireExperiment(id) {
    const experiment = await this.db.getGrowthExperiment(String(id || ''));
    if (!experiment) throw this.error('Growth experiment not found', 404, 'EXPERIMENT_NOT_FOUND');
    return experiment;
  }

  async requireFile(filePath, message) {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size === 0) throw new Error('empty');
    } catch (_error) {
      throw this.error(message, 409, 'EXPERIMENT_ASSET_MISSING');
    }
  }

  isoNow() {
    return this.now().toISOString();
  }

  parseJSON(value, fallback) {
    try { return JSON.parse(value || ''); } catch (_error) { return fallback; }
  }
}

module.exports = { GrowthExperimentService };
