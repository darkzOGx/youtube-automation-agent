const crypto = require('crypto');
const { Logger } = require('./logger');

class SceneRetentionEngine {
  constructor(db) {
    this.db = db;
    this.logger = new Logger('SceneRetention');
  }

  async capture(retentionReport = {}, context = {}, measurementWindow = 'rolling', exposure = {}) {
    if (retentionReport.simulated || retentionReport.available === false) return null;
    const points = this.normalizePoints(retentionReport.points || []);
    const sourceScenes = Array.isArray(context.retentionScenes) ? context.retentionScenes : [];
    if (points.length < 10 || !sourceScenes.length) {
      this.logger.warn(`Retention curve for ${retentionReport.videoId || 'unknown video'} was not stored because it lacks real curve or scene evidence`);
      return null;
    }

    const durationSeconds = Math.max(
      1,
      this.number(retentionReport.durationSeconds) ||
      this.number(context.retentionDuration) ||
      sourceScenes.reduce((sum, scene) => sum + this.number(scene.duration), 0)
    );
    const timeline = this.scaleTimeline(sourceScenes, durationSeconds);
    const sceneMetrics = this.mapPointsToScenes(points, timeline, durationSeconds);
    if (!sceneMetrics.length) return null;

    const confidence = this.confidenceFor(points, exposure);
    const summary = this.summarize(sceneMetrics, points);
    const snapshot = await this.db.saveRetentionSnapshot({
      videoId: retentionReport.videoId,
      productionId: context.productionId || null,
      shortClipId: context.shortClipId || null,
      title: retentionReport.title || context.title || '',
      surface: context.contentFormat === 'short' ? 'shorts' : 'long_form',
      measurementWindow,
      publishedAt: retentionReport.publishedAt || context.publishedAt || null,
      durationSeconds,
      points: points.map(point => ({
        ...point,
        elapsedSeconds: Number((point.elapsedRatio * durationSeconds).toFixed(2))
      })),
      sceneMetrics,
      summary,
      confidence
    });

    const recommendation = this.buildRecommendation(snapshot, exposure);
    if (recommendation) {
      await this.db.saveLearningRecommendation({
        ...recommendation,
        fingerprint: this.fingerprint(recommendation)
      });
    }
    return snapshot;
  }

  normalizePoints(points) {
    return points.map(point => ({
      elapsedRatio: this.clamp(this.number(point.elapsedRatio), 0, 1),
      audienceWatchRatio: Math.max(0, this.number(point.audienceWatchRatio)),
      relativeRetentionPerformance: this.clamp(this.number(point.relativeRetentionPerformance), 0, 1),
      startedWatching: Math.max(0, this.number(point.startedWatching)),
      stoppedWatching: Math.max(0, this.number(point.stoppedWatching)),
      totalSegmentImpressions: Math.max(0, this.number(point.totalSegmentImpressions))
    }))
      .filter(point => point.elapsedRatio > 0)
      .sort((a, b) => a.elapsedRatio - b.elapsedRatio)
      .filter((point, index, all) => index === 0 || point.elapsedRatio !== all[index - 1].elapsedRatio);
  }

  scaleTimeline(scenes, durationSeconds) {
    const total = scenes.reduce((sum, scene) => sum + Math.max(0, this.number(scene.duration)), 0);
    if (!total) return [];
    const scale = durationSeconds / total;
    let cursor = 0;
    return scenes.map((scene, index) => {
      const duration = Math.max(0.01, this.number(scene.duration) * scale);
      const item = {
        id: scene.id || `scene_${index}`,
        position: Number.isFinite(Number(scene.position)) ? Number(scene.position) : index,
        label: String(scene.label || `Scene ${index + 1}`),
        startSeconds: Number(cursor.toFixed(2)),
        endSeconds: Number(Math.min(durationSeconds, cursor + duration).toFixed(2)),
        duration: Number(duration.toFixed(2))
      };
      cursor += duration;
      if (index === scenes.length - 1) item.endSeconds = durationSeconds;
      return item;
    });
  }

  mapPointsToScenes(points, timeline, durationSeconds) {
    return timeline.map((scene, sceneIndex) => {
      const selected = points.filter(point => {
        const second = point.elapsedRatio * durationSeconds;
        return second > scene.startSeconds && (second <= scene.endSeconds || sceneIndex === timeline.length - 1);
      });
      if (!selected.length) return null;
      const firstPointIndex = points.indexOf(selected[0]);
      const preceding = firstPointIndex > 0 ? points[firstPointIndex - 1] : selected[0];
      let largestDrop = Math.max(0, preceding.audienceWatchRatio - selected[0].audienceWatchRatio);
      let largestLift = 0;
      for (let index = 1; index < selected.length; index++) {
        largestDrop = Math.max(largestDrop, selected[index - 1].audienceWatchRatio - selected[index].audienceWatchRatio);
        largestLift = Math.max(largestLift, selected[index].audienceWatchRatio - selected[index - 1].audienceWatchRatio);
      }
      const start = selected[0].audienceWatchRatio;
      const end = selected.at(-1).audienceWatchRatio;
      const stopped = selected.reduce((sum, point) => sum + point.stoppedWatching, 0);
      const impressions = selected.reduce((sum, point) => sum + point.totalSegmentImpressions, 0);
      const metric = {
        ...scene,
        pointCount: selected.length,
        startWatchRatio: this.round(start),
        endWatchRatio: this.round(end),
        averageWatchRatio: this.round(this.average(selected.map(point => point.audienceWatchRatio))),
        averageRelativeRetention: this.round(this.average(selected.map(point => point.relativeRetentionPerformance))),
        changePoints: this.round((end - start) * 100, 1),
        largestDropPoints: this.round(largestDrop * 100, 1),
        largestLiftPoints: this.round(largestLift * 100, 1),
        stopRate: impressions > 0 ? this.round((stopped / impressions) * 100, 1) : null,
        replayPeak: this.round(Math.max(...selected.map(point => point.audienceWatchRatio)) * 100, 1)
      };
      metric.signal = this.classify(metric);
      return metric;
    }).filter(Boolean);
  }

  classify(scene) {
    if (scene.pointCount < 2) return 'insufficient';
    if (scene.changePoints <= -8 || scene.largestDropPoints >= 10 || scene.stopRate >= 12) return 'drop_off';
    if (scene.replayPeak >= 105 || scene.largestLiftPoints >= 8) return 'rewatch';
    if (scene.changePoints >= -4 && scene.averageRelativeRetention >= 0.6) return 'strong_hold';
    return 'steady';
  }

  summarize(sceneMetrics, points) {
    const dropoffs = sceneMetrics.filter(scene => scene.signal === 'drop_off')
      .sort((a, b) => this.dropSeverity(b) - this.dropSeverity(a));
    const positive = sceneMetrics.filter(scene => ['strong_hold', 'rewatch'].includes(scene.signal))
      .sort((a, b) => (b.averageRelativeRetention + b.replayPeak / 100) - (a.averageRelativeRetention + a.replayPeak / 100));
    return {
      pointCount: points.length,
      sceneCount: sceneMetrics.length,
      dropoffCount: dropoffs.length,
      rewatchCount: sceneMetrics.filter(scene => scene.signal === 'rewatch').length,
      strongHoldCount: sceneMetrics.filter(scene => scene.signal === 'strong_hold').length,
      primaryDropoff: dropoffs[0] || null,
      strongestScene: positive[0] || null
    };
  }

  buildRecommendation(snapshot, exposure = {}) {
    if (this.number(exposure.views) < 20 || snapshot.points.length < 20) return null;
    const drop = snapshot.summary?.primaryDropoff;
    const strong = snapshot.summary?.strongestScene;
    if (!drop && !strong) return null;
    const source = drop || strong;
    const surface = snapshot.surface === 'shorts' ? 'Shorts' : 'long-form videos';
    const sourceIdentity = {
      sourceVideoId: snapshot.videoId,
      measurementWindow: snapshot.measurementWindow,
      sceneId: source.id
    };

    if (drop) {
      return {
        category: 'scene_retention',
        title: `Rework the ${drop.label} beat in future ${surface}`,
        rationale: `${drop.label} lost ${Math.abs(drop.changePoints).toFixed(1)} audience percentage points across ${drop.pointCount} measured curve segments; its sharpest single decline was ${drop.largestDropPoints.toFixed(1)} points.`,
        evidence: {
          metric: 'audience_retention_curve',
          ...sourceIdentity,
          surface: snapshot.surface,
          scene: drop
        },
        proposedChange: {
          target: 'future_scripts',
          experiment: 'scene_retention',
          surface: snapshot.surface,
          sceneRole: this.slug(drop.label),
          action: /hook|intro/i.test(drop.label) ? 'shorten_and_front_load_value' : 'tighten_transition_and_pacing',
          autoEditPublishedContent: false,
          ...sourceIdentity
        },
        confidence: snapshot.confidence
      };
    }

    return {
      category: 'scene_retention',
      title: `Reuse the ${strong.label} pattern in future ${surface}`,
      rationale: `${strong.label} held viewers with ${(strong.averageWatchRatio * 100).toFixed(1)}% average absolute retention and ${(strong.averageRelativeRetention * 100).toFixed(1)}% relative retention across ${strong.pointCount} curve segments.`,
      evidence: {
        metric: 'audience_retention_curve',
        ...sourceIdentity,
        surface: snapshot.surface,
        scene: strong
      },
      proposedChange: {
        target: 'future_scripts',
        experiment: 'scene_retention',
        surface: snapshot.surface,
        sceneRole: this.slug(strong.label),
        action: 'reuse_structure_and_pacing',
        autoEditPublishedContent: false,
        ...sourceIdentity
      },
      confidence: snapshot.confidence
    };
  }

  confidenceFor(points, exposure = {}) {
    const views = this.number(exposure.views);
    if (points.length >= 80 && views >= 500) return 'high';
    if (points.length >= 40 && views >= 100) return 'medium';
    return 'low';
  }

  fingerprint(candidate) {
    const identity = {
      category: candidate.category,
      title: candidate.title,
      proposedChange: candidate.proposedChange
    };
    return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }

  dropSeverity(scene) {
    return Math.abs(Math.min(0, scene.changePoints)) + scene.largestDropPoints + (scene.stopRate || 0);
  }

  average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  round(value, precision = 4) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  slug(value) {
    return String(value || 'scene').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'scene';
  }
}

module.exports = { SceneRetentionEngine };
