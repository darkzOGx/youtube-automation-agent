const crypto = require('crypto');
const { Logger } = require('./logger');
const { DarkzSEOAdapter } = require('./discoverability-adapters/darkzseo');

class DiscoverabilityService {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = options.logger || new Logger('Discoverability');
    this.adapter = options.adapter || new DarkzSEOAdapter(options.darkzseo || {});
  }

  contentPackage(production, profile = {}, platform = 'youtube') {
    const script = production.script || {};
    const seo = production.seo || {};
    const provenance = production.provenance || {};
    const sourceSections = Array.isArray(script.sections)
      ? script.sections
      : Array.isArray(script.mainContent) ? script.mainContent : [];
    const sections = sourceSections.length
      ? sourceSections.map(section => ({
          title: section.title || section.heading || '',
          content: section.content || section.text || section.script || ''
        }))
      : [];
    return {
      id: production.id,
      platform,
      brand: profile.channel_name || profile.channelName || 'Brand',
      title: seo.title || script.title || '',
      description: seo.description || '',
      transcript: script.fullScript || '',
      sections,
      chapters: Array.isArray(seo.chapters) ? seo.chapters : [],
      sources: (provenance.sources || [])
        .filter(source => source.status === 'verified')
        .map(source => ({ url: source.url, title: source.title, publisher: source.publisher })),
      hasComparisonTable: Boolean(script.hasComparisonTable),
      unitsExplained: Boolean(script.unitsExplained)
    };
  }

  fingerprint(platform, finding) {
    return crypto.createHash('sha256')
      .update([platform, finding.ruleId, finding.message].join('\u0000'))
      .digest('hex');
  }

  normalizeReport(report, platform) {
    return {
      ...report,
      findings: (report.findings || []).map(finding => ({
        ruleId: String(finding.ruleId || 'unknown'),
        category: String(finding.category || 'SEO').toUpperCase(),
        severity: String(finding.severity || 'INFO').toUpperCase(),
        applicability: Array.isArray(finding.applicability) ? finding.applicability : [platform, 'content'],
        message: String(finding.message || 'Discoverability review required'),
        remediation: finding.remediation ? String(finding.remediation) : null,
        fingerprint: this.fingerprint(platform, finding)
      }))
    };
  }

  unavailableReport(error) {
    return {
      schemaVersion: '1.0',
      engine: { name: 'darkzseo', version: null },
      mode: 'content',
      status: 'unavailable',
      summary: {
        severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
        category: { SEO: 0, GEO: 0, AIO: 0, AEO: 0 }
      },
      findings: [],
      errorCode: error.code || 'DARKZSEO_UNAVAILABLE',
      error: error.message
    };
  }

  async auditProduction(production, profile = {}, platform = 'youtube') {
    if (!production?.id) throw this.error('A saved production is required for discoverability auditing', 400);
    if (platform !== 'youtube') throw this.error(`Platform "${platform}" is not enabled yet`, 400);
    let report;
    try {
      report = this.normalizeReport(
        await this.adapter.audit(this.contentPackage(production, profile, platform)),
        platform
      );
    } catch (error) {
      this.logger.warn(`DarkzSEO audit unavailable for ${production.id}: ${error.message}`);
      report = this.unavailableReport(error);
    }
    return this.db.saveDiscoverabilityAudit(production.id, platform, report);
  }

  async reviewFinding(findingId, input = {}) {
    const finding = await this.db.getDiscoverabilityFinding(findingId);
    if (!finding) throw this.error('Discoverability finding not found', 404);
    const status = String(input.status || '').toLowerCase();
    if (!['accepted', 'dismissed'].includes(status)) {
      throw this.error('Choose accepted or dismissed', 400);
    }
    const reason = String(input.reason || '').trim();
    if (status === 'dismissed' && reason.length < 5) {
      throw this.error('Dismissed findings require a reason of at least 5 characters', 400);
    }
    return this.db.reviewDiscoverabilityFinding(findingId, status, reason || null);
  }

  error(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
  }
}

module.exports = { DiscoverabilityService };
