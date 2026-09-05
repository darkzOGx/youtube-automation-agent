const crypto = require('crypto');
const { version } = require('../package.json');

const ALLOWED_EVENTS = new Set([
  'setup_ready',
  'first_real_video',
  'first_approval',
  'first_publish',
  'second_real_video'
]);

class AnonymousTelemetry {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this.inFlight = new Set();
  }

  configuration() {
    const optedIn = String(process.env.ANONYMOUS_TELEMETRY_ENABLED || '').toLowerCase() === 'true';
    const endpoint = process.env.ANONYMOUS_TELEMETRY_ENDPOINT || '';
    if (!optedIn) return { enabled: false, reason: 'not_opted_in' };
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:') return { enabled: false, reason: 'https_endpoint_required' };
      return { enabled: true, endpoint: url.toString() };
    } catch (_error) {
      return { enabled: false, reason: 'valid_endpoint_required' };
    }
  }

  async installationId() {
    let id = await this.db.getSetting('anonymous_telemetry_installation_id');
    if (!id) {
      id = crypto.randomUUID();
      await this.db.setSetting(
        'anonymous_telemetry_installation_id',
        id,
        'Random installation ID used only when anonymous telemetry is explicitly enabled'
      );
    }
    return id;
  }

  async emit(event, occurredAt) {
    if (!ALLOWED_EVENTS.has(event)) throw new Error(`Anonymous telemetry event is not allowlisted: ${event}`);
    const config = this.configuration();
    if (!config.enabled) return { sent: false, reason: config.reason };

    const sentKey = `anonymous_telemetry_sent_${event}`;
    if (await this.db.getSetting(sentKey)) return { sent: false, reason: 'already_sent' };
    if (this.inFlight.has(event)) return { sent: false, reason: 'in_flight' };

    const payload = {
      schemaVersion: 1,
      event,
      occurredAt,
      appVersion: version,
      installationId: await this.installationId(),
      platform: process.platform,
      nodeMajor: Number(process.versions.node.split('.')[0])
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    this.inFlight.add(event);
    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Anonymous telemetry endpoint returned HTTP ${response.status}`);
      await this.db.setSetting(sentKey, new Date().toISOString(), `Anonymous ${event} milestone sent`);
      return { sent: true };
    } finally {
      clearTimeout(timeout);
      this.inFlight.delete(event);
    }
  }

  async sync(summary) {
    const config = this.configuration();
    if (!config.enabled) return config;

    const milestoneEvents = [
      ['setup_ready', summary.milestones.setupReady],
      ['first_real_video', summary.milestones.firstRealVideo],
      ['first_approval', summary.milestones.firstApproval],
      ['first_publish', summary.milestones.firstPublish],
      ['second_real_video', summary.milestones.secondRealVideo]
    ];
    const results = [];
    for (const [event, milestone] of milestoneEvents) {
      if (!milestone.achieved) continue;
      try {
        results.push({ event, ...(await this.emit(event, milestone.at)) });
      } catch (error) {
        this.logger?.warn(`Anonymous telemetry ${event} was not sent: ${error.message}`);
        results.push({ event, sent: false, reason: 'delivery_failed' });
      }
    }
    return { enabled: true, results };
  }
}

module.exports = { AnonymousTelemetry, ALLOWED_EVENTS };
