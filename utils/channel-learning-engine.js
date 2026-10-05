const crypto = require('crypto');
const { Logger } = require('./logger');
const { SceneRetentionEngine } = require('./scene-retention-engine');

class ChannelLearningEngine {
  constructor(db) {
    this.db = db;
    this.logger = new Logger('ChannelLearning');
    this.sceneRetention = new SceneRetentionEngine(db);
  }

  async capture(performanceReport, context = {}, measurementWindow = 'rolling') {
    const metrics = this.normalizeMetrics(performanceReport, context);
    const attributes = this.extractAttributes(performanceReport, context);
    const prior = (await this.db.listPerformanceSnapshots({
      measurementWindow,
      reliableOnly: true,
      excludeVideoId: performanceReport.videoId
    })).filter(snapshot => (snapshot.contentAttributes?.surface || 'long_form') === attributes.surface);
    const baseline = this.calculateBaseline(prior);
    const simulated = Boolean(performanceReport.analytics?.simulated);
    const confidence = simulated ? 'unverified' : this.confidenceFor(metrics);
    const snapshot = await this.db.savePerformanceSnapshot({
      videoId: performanceReport.videoId,
      productionId: context.productionId || null,
      measurementWindow,
      publishedAt: performanceReport.videoDetails?.publishedAt || context.publishedAt || null,
      metrics,
      contentAttributes: attributes,
      baseline,
      deltas: this.calculateDeltas(metrics, baseline),
      confidence,
      simulated
    });

    if (simulated) {
      this.logger.warn(`Excluded simulated analytics for ${performanceReport.videoId} from channel learning`);
      return snapshot;
    }

    await this.refreshRecommendations();
    return snapshot;
  }

  normalizeMetrics(report, context = {}) {
    const analytics = report.analytics || {};
    const views = analytics.views || {};
    const watchTime = analytics.watchTime || {};
    const engagement = analytics.engagement || {};
    const outcomes = analytics.outcomes || {};
    const impressions = this.number(views.totalImpressions || report.thumbnailMetrics?.impressions);
    const totalViews = this.number(views.totalViews);
    const watchMinutes = this.number(watchTime.totalWatchTime);
    const netSubscribers = outcomes.subscribersAvailable ? this.optionalNumber(outcomes.netSubscribers) : null;
    const estimatedRevenue = outcomes.revenueAvailable ? this.optionalNumber(outcomes.estimatedRevenue) : null;
    const cost = context.productionCost || {};
    const productionCost = this.optionalNumber(cost.amount);
    const revenueCurrency = outcomes.currency || null;
    const costCurrency = cost.currency || null;
    const currencyCompatible = productionCost === 0 || (
      revenueCurrency && costCurrency && String(revenueCurrency).toUpperCase() === String(costCurrency).toUpperCase()
    );
    return {
      views: totalViews,
      impressions,
      ctr: this.number(report.thumbnailMetrics?.clickThroughRate ?? views.averageCTR),
      retention: this.number(watchTime.averageViewPercentage),
      averageViewDuration: this.number(watchTime.averageViewDuration),
      watchMinutes,
      watchHours: Number((watchMinutes / 60).toFixed(3)),
      engagementRate: this.number(engagement.engagementRate),
      performanceScore: this.number(report.performance?.score),
      subscribersGained: outcomes.subscribersAvailable ? this.optionalNumber(outcomes.subscribersGained) : null,
      subscribersLost: outcomes.subscribersAvailable ? this.optionalNumber(outcomes.subscribersLost) : null,
      netSubscribers,
      estimatedRevenue,
      revenueCurrency,
      monetizedPlaybacks: outcomes.revenueAvailable ? this.optionalNumber(outcomes.monetizedPlaybacks) : null,
      playbackBasedCpm: outcomes.revenueAvailable ? this.optionalNumber(outcomes.playbackBasedCpm) : null,
      subscribersPerThousandImpressions: netSubscribers !== null && impressions > 0
        ? Number(((netSubscribers / impressions) * 1000).toFixed(3))
        : null,
      watchHoursPerThousandViews: totalViews > 0 ? Number((((watchMinutes / 60) / totalViews) * 1000).toFixed(3)) : null,
      revenuePerThousandViews: estimatedRevenue !== null && totalViews > 0
        ? Number(((estimatedRevenue / totalViews) * 1000).toFixed(3))
        : null,
      productionCost,
      costCurrency,
      costComplete: cost.complete === true,
      netRevenue: estimatedRevenue !== null && productionCost !== null && cost.complete === true && currencyCompatible
        ? Number((estimatedRevenue - productionCost).toFixed(3))
        : null,
      roi: estimatedRevenue !== null && productionCost !== null && productionCost > 0 && cost.complete === true && currencyCompatible
        ? Number((((estimatedRevenue - productionCost) / productionCost) * 100).toFixed(1))
        : null
    };
  }

  extractAttributes(report, context) {
    const strategy = context.strategy || {};
    const script = context.script || {};
    const thumbnail = context.thumbnail || {};
    const title = report.videoDetails?.title || context.title || script.title || '';
    const hook = this.text(script.hook || script.introduction || '');
    return {
      topic: strategy.topic || '',
      pillar: strategy.contentPillar || strategy.pillar || 'unknown',
      surface: context.contentFormat === 'short' ? 'shorts' : 'long_form',
      format: context.contentFormat === 'short'
        ? 'shorts'
        : this.slug(strategy.requestedStyle || strategy.contentType || 'unknown'),
      length: this.slug(strategy.requestedLengthKey || strategy.requestedLength || 'unknown'),
      hookLength: hook ? (this.wordCount(hook) <= 40 ? 'concise' : 'extended') : 'unknown',
      titleLength: title ? (this.wordCount(title) <= 9 ? 'concise' : 'long') : 'unknown',
      thumbnailStyle: this.slug(
        thumbnail.concept?.composition || thumbnail.concept?.style || thumbnail.style || 'unknown'
      ),
      provider: context.productionCost?.providers?.length === 1 ? this.slug(context.productionCost.providers[0]) : 'mixed_or_unknown',
      source: strategy.planRationale ? 'autonomous_operator' : 'manual'
    };
  }

  calculateBaseline(snapshots) {
    const keys = [
      'views', 'impressions', 'ctr', 'retention', 'averageViewDuration', 'watchMinutes', 'watchHours',
      'engagementRate', 'performanceScore', 'netSubscribers', 'subscribersPerThousandImpressions',
      'estimatedRevenue', 'revenuePerThousandViews', 'productionCost', 'netRevenue', 'roi'
    ];
    return Object.fromEntries(keys.map(key => [key, this.median(
      snapshots.map(snapshot => this.optionalNumber(snapshot.metrics?.[key])).filter(value => value !== null)
    )]));
  }

  calculateDeltas(metrics, baseline) {
    return Object.fromEntries(Object.entries(metrics).map(([key, value]) => {
      const numericValue = this.optionalNumber(value);
      const reference = this.optionalNumber(baseline[key]);
      return [key, numericValue !== null && reference !== null && reference !== 0
        ? Number((((numericValue - reference) / Math.abs(reference)) * 100).toFixed(1))
        : null];
    }));
  }

  confidenceFor(metrics) {
    if (metrics.impressions >= 1000 && metrics.views >= 100) return 'high';
    if (metrics.impressions >= 100 && metrics.views >= 20) return 'medium';
    return 'low';
  }

  async refreshRecommendations() {
    const [all, strategy] = await Promise.all([
      this.db.listPerformanceSnapshots({ reliableOnly: true }),
      this.db.getChannelStrategy ? this.db.getChannelStrategy() : Promise.resolve(null)
    ]);
    const snapshots = this.preferredSnapshotPerVideo(all);
    if (snapshots.length < 2) return [];

    const candidates = [
      ...this.buildDimensionRecommendations(snapshots),
      ...this.buildChannelRecommendations(snapshots),
      ...this.buildOutcomeRecommendations(snapshots, strategy)
    ];
    const saved = [];
    for (const candidate of candidates) {
      saved.push(await this.db.saveLearningRecommendation({
        ...candidate,
        fingerprint: this.fingerprint(candidate)
      }));
    }
    return saved;
  }

  preferredSnapshotPerVideo(snapshots) {
    const rank = { '7d': 3, '24h': 2, rolling: 1 };
    const selected = new Map();
    for (const snapshot of snapshots) {
      const current = selected.get(snapshot.videoId);
      if (!current || (rank[snapshot.measurementWindow] || 0) > (rank[current.measurementWindow] || 0)) {
        selected.set(snapshot.videoId, snapshot);
      }
    }
    return [...selected.values()];
  }

  buildDimensionRecommendations(snapshots) {
    const dimensions = [
      { key: 'format', metric: 'performanceScore', label: 'format', minimumDifference: 10 },
      { key: 'length', metric: 'retention', label: 'video length', minimumDifference: 8 },
      { key: 'hookLength', metric: 'retention', label: 'hook style', minimumDifference: 8 },
      { key: 'titleLength', metric: 'ctr', label: 'title style', minimumDifference: 1.25 }
    ];
    const recommendations = [];

    for (const dimension of dimensions) {
      const groups = new Map();
      for (const snapshot of snapshots) {
        const value = snapshot.contentAttributes?.[dimension.key];
        const metric = this.number(snapshot.metrics?.[dimension.metric]);
        if (!value || value === 'unknown' || !Number.isFinite(metric)) continue;
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(metric);
      }
      const ranked = [...groups.entries()]
        .filter(([, values]) => values.length >= 2)
        .map(([value, values]) => ({ value, count: values.length, average: this.average(values) }))
        .sort((a, b) => b.average - a.average);
      if (ranked.length < 2 || ranked[0].average - ranked.at(-1).average < dimension.minimumDifference) continue;

      const best = ranked[0];
      const weakest = ranked.at(-1);
      const metricLabel = dimension.metric === 'ctr' ? 'CTR' : dimension.metric === 'retention' ? 'retention' : 'performance score';
      recommendations.push({
        category: dimension.key,
        title: `Favor ${this.readable(best.value)} over ${this.readable(weakest.value)} ${dimension.label}`,
        rationale: `${this.readable(best.value)} ${dimension.label} averaged ${this.metric(best.average, dimension.metric)} ${metricLabel} across ${best.count} videos versus ${this.metric(weakest.average, dimension.metric)} across ${weakest.count}.`,
        evidence: { dimension: dimension.key, metric: dimension.metric, best, weakest },
        proposedChange: { target: 'future_plans', dimension: dimension.key, prefer: best.value, deprioritize: weakest.value },
        confidence: best.count >= 4 && weakest.count >= 4 ? 'high' : 'medium'
      });
    }
    return recommendations;
  }

  buildChannelRecommendations(snapshots) {
    const sufficientlyExposed = snapshots.filter(snapshot => this.number(snapshot.metrics?.impressions) >= 100);
    if (sufficientlyExposed.length < 2) return [];
    const averageCTR = this.average(sufficientlyExposed.map(item => this.number(item.metrics.ctr)));
    const averageRetention = this.average(sufficientlyExposed.map(item => this.number(item.metrics.retention)));
    const recommendations = [];

    if (averageCTR < 4) {
      recommendations.push({
        category: 'packaging',
        title: 'Test new title and thumbnail packaging',
        rationale: `Channel CTR averaged ${averageCTR.toFixed(1)}% across ${sufficientlyExposed.length} sufficiently exposed videos.`,
        evidence: { metric: 'ctr', average: averageCTR, sampleSize: sufficientlyExposed.length, minimumImpressions: 100 },
        proposedChange: { target: 'review', experiment: 'title_thumbnail_variant' },
        confidence: sufficientlyExposed.length >= 5 ? 'high' : 'medium'
      });
    }
    if (averageRetention < 35) {
      recommendations.push({
        category: 'retention',
        title: 'Tighten hooks and early pacing',
        rationale: `Average view percentage was ${averageRetention.toFixed(1)}% across ${sufficientlyExposed.length} sufficiently exposed videos.`,
        evidence: { metric: 'retention', average: averageRetention, sampleSize: sufficientlyExposed.length },
        proposedChange: { target: 'future_scripts', prefer: 'concise_hook_and_faster_opening' },
        confidence: sufficientlyExposed.length >= 5 ? 'high' : 'medium'
      });
    }
    return recommendations;
  }

  buildOutcomeRecommendations(snapshots, strategy = {}) {
    const goal = this.outcomeGoal(strategy);
    if (!goal || snapshots.length < 4) return [];
    const eligible = snapshots.filter(snapshot => this.outcomeMetricValue(snapshot, goal) !== null);
    if (eligible.length < 4) return [];
    const candidates = [];
    for (const dimension of ['pillar', 'format']) {
      const groups = new Map();
      for (const snapshot of eligible) {
        const value = snapshot.contentAttributes?.[dimension];
        const metric = this.outcomeMetricValue(snapshot, goal);
        if (!value || value === 'unknown' || value === 'mixed_or_unknown' || metric === null) continue;
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(metric);
      }
      const ranked = [...groups.entries()]
        .filter(([, values]) => values.length >= 2)
        .map(([value, values]) => ({ value, count: values.length, average: this.average(values) }))
        .sort((a, b) => b.average - a.average);
      if (ranked.length < 2) continue;
      const best = ranked[0];
      const weakest = ranked.at(-1);
      const meaningfulDifference = best.average - weakest.average;
      const relativeDifference = Math.abs(weakest.average) > 0
        ? meaningfulDifference / Math.abs(weakest.average)
        : best.average > 0 ? 1 : 0;
      if (meaningfulDifference <= 0 || relativeDifference < 0.2) continue;
      candidates.push({
        category: 'outcome_alignment',
        title: `Allocate more ${dimension} capacity to ${this.readable(best.value)}`,
        rationale: `${this.readable(best.value)} averaged ${this.formatOutcome(best.average, goal)} across ${best.count} videos versus ${this.formatOutcome(weakest.average, goal)} for ${this.readable(weakest.value)}, aligned to the configured ${goal.label.toLowerCase()} goal.`,
        evidence: { primaryKpi: goal.id, metric: goal.metric, dimension, best, weakest, minimumSamplesPerGroup: 2 },
        proposedChange: {
          target: 'future_plans', dimension, prefer: best.value, deprioritize: weakest.value,
          primaryKpi: goal.id, autoApply: false
        },
        confidence: best.count >= 4 && weakest.count >= 4 ? 'high' : 'medium'
      });
    }
    return candidates;
  }

  async getSummary() {
    const [snapshots, recommendations, retentionSnapshots, strategy] = await Promise.all([
      this.db.listPerformanceSnapshots({ reliableOnly: true }),
      this.db.listLearningRecommendations({ limit: 50 }),
      this.db.listRetentionSnapshots ? this.db.listRetentionSnapshots({ limit: 12 }) : Promise.resolve([]),
      this.db.getChannelStrategy ? this.db.getChannelStrategy() : Promise.resolve(null)
    ]);
    const preferred = this.preferredSnapshotPerVideo(snapshots);
    return {
      measuredVideos: preferred.length,
      snapshotCount: snapshots.length,
      baseline: this.calculateBaseline(preferred),
      windows: snapshots.reduce((counts, snapshot) => {
        counts[snapshot.measurementWindow] = (counts[snapshot.measurementWindow] || 0) + 1;
        return counts;
      }, {}),
      recommendations,
      approvedCount: recommendations.filter(item => item.status === 'approved').length,
      pendingCount: recommendations.filter(item => item.status === 'pending').length,
      lastMeasuredAt: snapshots[0]?.measuredAt || null,
      evidencePolicy: 'Only real YouTube analytics are eligible; simulated fallbacks are excluded.',
      outcome: this.buildOutcomeSummary(preferred, strategy),
      retention: {
        snapshotCount: retentionSnapshots.length,
        longFormCount: retentionSnapshots.filter(item => item.surface === 'long_form').length,
        shortsCount: retentionSnapshots.filter(item => item.surface === 'shorts').length,
        snapshots: retentionSnapshots
      }
    };
  }

  outcomeGoal(strategy = {}) {
    if (!strategy) return null;
    const definitions = {
      views: { id: 'views', metric: 'views', label: 'Views', unit: 'count', aggregation: 'sum' },
      watch_hours: { id: 'watch_hours', metric: 'watchHours', label: 'Watch hours', unit: 'hours', aggregation: 'sum' },
      subscribers: { id: 'subscribers', metric: 'netSubscribers', label: 'Net subscribers', unit: 'count', aggregation: 'sum' },
      engagement: { id: 'engagement', metric: 'engagementRate', label: 'Engagement rate', unit: 'percent', aggregation: 'average' },
      revenue: { id: 'revenue', metric: 'estimatedRevenue', label: 'Estimated revenue', unit: 'currency', aggregation: 'sum' }
    };
    const definition = definitions[strategy.primary_kpi] || definitions.views;
    return {
      ...definition,
      targetValue: this.optionalNumber(strategy.target_value),
      windowDays: Math.max(7, Math.min(365, Number(strategy.target_window_days || 28))),
      currency: String(strategy.outcome_currency || 'USD').toUpperCase(),
      monthlyBudget: this.optionalNumber(strategy.monthly_budget),
      description: strategy.success_metric || ''
    };
  }

  buildOutcomeSummary(snapshots = [], strategy = null) {
    const goal = this.outcomeGoal(strategy);
    if (!goal) {
      return { configured: false, available: false, goal: null, evidencePolicy: 'Configure a channel strategy to activate outcome tracking.' };
    }
    const cutoff = Date.now() - goal.windowDays * 86400000;
    const recent = snapshots.filter(snapshot => {
      const measured = new Date(snapshot.measuredAt || snapshot.measured_at || 0).getTime();
      return Number.isFinite(measured) && measured >= cutoff;
    });
    const values = recent
      .map(snapshot => this.outcomeMetricValue(snapshot, goal))
      .filter(value => value !== null);
    const observed = values.length
      ? goal.aggregation === 'average' ? this.average(values) : values.reduce((sum, value) => sum + value, 0)
      : null;
    const progressPercent = observed !== null && goal.targetValue !== null && goal.targetValue > 0
      ? Number(Math.max(0, Math.min(999, (observed / goal.targetValue) * 100)).toFixed(1))
      : null;
    const sumAvailable = key => {
      const available = recent.map(snapshot => this.optionalNumber(snapshot.metrics?.[key])).filter(value => value !== null);
      return { value: available.length ? available.reduce((sum, value) => sum + value, 0) : null, count: available.length };
    };
    const subscribers = sumAvailable('netSubscribers');
    const watchHours = sumAvailable('watchHours');
    const revenueValues = recent
      .filter(snapshot => String(snapshot.metrics?.revenueCurrency || 'USD').toUpperCase() === goal.currency)
      .map(snapshot => this.optionalNumber(snapshot.metrics?.estimatedRevenue)).filter(value => value !== null);
    const revenue = { value: revenueValues.length ? revenueValues.reduce((sum, value) => sum + value, 0) : null, count: revenueValues.length };
    const costValues = recent
      .filter(snapshot => this.optionalNumber(snapshot.metrics?.productionCost) === 0 || String(snapshot.metrics?.costCurrency || '').toUpperCase() === goal.currency)
      .map(snapshot => this.optionalNumber(snapshot.metrics?.productionCost)).filter(value => value !== null);
    const cost = { value: costValues.length ? costValues.reduce((sum, value) => sum + value, 0) : null, count: costValues.length };
    const costsComplete = recent.length > 0 && cost.count === recent.length && recent.every(snapshot => snapshot.metrics?.costComplete === true);
    const roi = revenue.count === recent.length && costsComplete && cost.value > 0
      ? Number((((revenue.value - cost.value) / cost.value) * 100).toFixed(1))
      : null;
    const breakdowns = {};
    for (const dimension of ['pillar', 'format', 'provider']) {
      const groups = new Map();
      for (const snapshot of recent) {
        const name = snapshot.contentAttributes?.[dimension];
        const value = this.outcomeMetricValue(snapshot, goal);
        if (!name || name === 'unknown' || name === 'mixed_or_unknown' || value === null) continue;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(value);
      }
      breakdowns[dimension] = [...groups.entries()]
        .map(([name, groupValues]) => ({
          name,
          count: groupValues.length,
          average: Number(this.average(groupValues).toFixed(3)),
          total: Number(groupValues.reduce((sum, value) => sum + value, 0).toFixed(3))
        }))
        .sort((a, b) => b.average - a.average);
    }
    return {
      configured: true,
      available: observed !== null,
      goal,
      observed: observed === null ? null : Number(observed.toFixed(3)),
      formattedObserved: observed === null ? 'Unavailable' : this.formatOutcome(observed, goal),
      progressPercent,
      snapshotCount: recent.length,
      measuredVideoCount: values.length,
      economics: {
        currency: goal.currency,
        netSubscribers: subscribers.value,
        watchHours: watchHours.value === null ? null : Number(watchHours.value.toFixed(3)),
        estimatedRevenue: revenue.value === null ? null : Number(revenue.value.toFixed(3)),
        knownProductionCost: cost.value === null ? null : Number(cost.value.toFixed(3)),
        costsComplete,
        roi,
        monthlyBudget: goal.monthlyBudget,
        budgetUsedPercent: goal.monthlyBudget > 0 && cost.value !== null
          ? Number(((cost.value / goal.monthlyBudget) * 100).toFixed(1))
          : null
      },
      coverage: {
        subscribers: { measured: subscribers.count, total: recent.length },
        revenue: { measured: revenue.count, total: recent.length },
        cost: { measured: cost.count, total: recent.length }
      },
      breakdowns,
      evidencePolicy: 'Only real YouTube measurements are included. Missing subscriber, revenue, or cost evidence remains unavailable and is never converted to zero.'
    };
  }

  captureRetention(retentionReport, context = {}, measurementWindow = 'rolling', exposure = {}) {
    return this.sceneRetention.capture(retentionReport, context, measurementWindow, exposure);
  }

  async getDueMeasurementWindows(video) {
    const published = new Date(video.published_at || video.publishedAt);
    if (Number.isNaN(published.getTime())) return [];
    const ageHours = (Date.now() - published.getTime()) / 3600000;
    const existing = await this.db.listPerformanceSnapshots({
      videoId: video.youtube_id || video.youtubeId,
      reliableOnly: true
    });
    const windows = new Set(existing.map(item => item.measurementWindow));
    return [
      ...(ageHours >= 24 && !windows.has('24h') ? ['24h'] : []),
      ...(ageHours >= 168 && !windows.has('7d') ? ['7d'] : [])
    ];
  }

  measurementPeriod(publishedAt, measurementWindow) {
    if (!['24h', '7d'].includes(measurementWindow) || !publishedAt) return null;
    const start = new Date(publishedAt);
    if (Number.isNaN(start.getTime())) return null;
    const days = measurementWindow === '24h' ? 1 : 7;
    const end = new Date(Math.min(Date.now(), start.getTime() + days * 86400000));
    return { startDate: this.date(start), endDate: this.date(end) };
  }

  fingerprint(candidate) {
    const identity = {
      category: candidate.category,
      title: candidate.title,
      proposedChange: candidate.proposedChange
    };
    return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }

  median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  metric(value, metric) {
    return metric === 'performanceScore' ? value.toFixed(0) : `${value.toFixed(1)}%`;
  }

  number(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  optionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  outcomeMetricValue(snapshot, goal) {
    if (goal.id === 'revenue' && String(snapshot.metrics?.revenueCurrency || 'USD').toUpperCase() !== goal.currency) {
      return null;
    }
    return this.optionalNumber(snapshot.metrics?.[goal.metric]);
  }

  formatOutcome(value, goal) {
    if (goal.unit === 'currency') {
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: goal.currency, maximumFractionDigits: 2 }).format(value);
      } catch (_error) {
        return `${goal.currency} ${Number(value).toFixed(2)}`;
      }
    }
    if (goal.unit === 'percent') return `${Number(value).toFixed(1)}%`;
    if (goal.unit === 'hours') return `${Number(value).toFixed(1)} hours`;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
  }

  text(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => this.text(item)).join(' ');
    if (value && typeof value === 'object') return Object.values(value).map(item => this.text(item)).join(' ');
    return '';
  }

  wordCount(value) {
    return String(value).trim().split(/\s+/).filter(Boolean).length;
  }

  slug(value) {
    return String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
  }

  readable(value) {
    return String(value).replaceAll('_', ' ');
  }

  date(value) {
    return value.toISOString().slice(0, 10);
  }
}

module.exports = { ChannelLearningEngine };
