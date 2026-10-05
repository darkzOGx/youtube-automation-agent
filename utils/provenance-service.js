const crypto = require('crypto');

const SOURCE_TYPES = new Set(['article', 'video', 'dataset', 'official', 'asset', 'other']);
const SOURCE_STATUSES = new Set(['pending', 'verified', 'rejected']);
const CLAIM_RISKS = new Set(['standard', 'high']);
const CLAIM_STATUSES = new Set(['pending', 'supported', 'unsupported', 'waived']);

class ProvenanceService {
  constructor(db) {
    this.db = db;
  }

  async initialize(productionId, production = {}) {
    const existing = await this.db.getContentProvenance(productionId);
    if (existing) return existing;

    const sources = this.normalizeSources(production.strategy?.researchSources || []);
    const sourceIdByUrl = new Map(sources.map(source => [source.url, source.id]));
    const claims = this.normalizeClaims(production.script?.claims || [], sources, sourceIdByUrl);
    const provenance = this.build({ sources, claims, containsSyntheticMedia: production.containsSyntheticMedia === true });
    await this.db.saveContentProvenance(productionId, provenance);
    return this.db.getContentProvenance(productionId);
  }

  async review(productionId, input = {}) {
    const existing = await this.db.getContentProvenance(productionId) || {};
    const provenance = this.build({
      sources: input.sources ?? existing.sources ?? [],
      claims: input.claims ?? existing.claims ?? [],
      containsSyntheticMedia: input.containsSyntheticMedia ?? existing.containsSyntheticMedia ?? false
    });
    await this.db.saveContentProvenance(productionId, provenance);
    return this.db.getContentProvenance(productionId);
  }

  build(input = {}) {
    const sources = this.normalizeSources(input.sources || []);
    const sourceIds = new Set(sources.map(source => source.id));
    const claims = this.normalizeClaims(input.claims || [], sources);

    for (const claim of claims) {
      claim.sourceIds = claim.sourceIds.filter(id => sourceIds.has(id));
      if (claim.status === 'supported') {
        const hasVerifiedSource = claim.sourceIds.some(id =>
          sources.some(source => source.id === id && source.status === 'verified')
        );
        if (!hasVerifiedSource) throw this.invalid('A supported claim must link to at least one verified source');
      }
      if (claim.status === 'waived' && !claim.notes) {
        throw this.invalid('A waived claim requires a reviewer note');
      }
    }

    const unresolvedClaims = claims.filter(claim => !['supported', 'waived'].includes(claim.status));
    const status = claims.length === 0
      ? 'not_required'
      : unresolvedClaims.length === 0 ? 'verified' : 'blocked';

    return {
      sources,
      claims,
      containsSyntheticMedia: input.containsSyntheticMedia === true,
      status,
      reviewedAt: status === 'verified' ? new Date().toISOString() : null,
      summary: {
        sourceCount: sources.length,
        verifiedSources: sources.filter(source => source.status === 'verified').length,
        claimCount: claims.length,
        resolvedClaims: claims.length - unresolvedClaims.length,
        highRiskClaims: claims.filter(claim => claim.riskLevel === 'high').length,
        unresolvedClaims: unresolvedClaims.length
      }
    };
  }

  normalizeSources(items = []) {
    if (!Array.isArray(items)) throw this.invalid('Sources must be an array');
    const seenUrls = new Set();
    return items.slice(0, 50).map((item, index) => {
      const url = this.validUrl(item?.url);
      if (!url) throw this.invalid(`Source ${index + 1} requires a valid http or https URL`);
      if (seenUrls.has(url)) throw this.invalid(`Duplicate source URL: ${url}`);
      seenUrls.add(url);
      return {
        id: this.id(item?.id, 'source'),
        url,
        title: this.text(item?.title, 300) || url,
        publisher: this.text(item?.publisher, 200),
        publishedAt: this.date(item?.publishedAt),
        accessedAt: this.date(item?.accessedAt) || new Date().toISOString(),
        sourceType: SOURCE_TYPES.has(item?.sourceType) ? item.sourceType : 'other',
        status: SOURCE_STATUSES.has(item?.status) ? item.status : 'pending',
        notes: this.text(item?.notes, 1000)
      };
    });
  }

  normalizeClaims(items = [], sources = [], sourceIdByUrl = new Map()) {
    if (!Array.isArray(items)) throw this.invalid('Claims must be an array');
    const validSourceIds = new Set(sources.map(source => source.id));
    return items.slice(0, 100).map((item, index) => {
      const text = this.text(item?.text || item?.claim, 1000);
      if (!text) throw this.invalid(`Claim ${index + 1} requires text`);
      const mappedUrls = Array.isArray(item?.sourceUrls)
        ? item.sourceUrls.map(url => sourceIdByUrl.get(this.validUrl(url))).filter(Boolean)
        : [];
      const sourceIds = [...new Set([
        ...(Array.isArray(item?.sourceIds) ? item.sourceIds : []),
        ...mappedUrls
      ].map(value => String(value)).filter(id => validSourceIds.has(id)))];
      return {
        id: this.id(item?.id, 'claim'),
        text,
        riskLevel: CLAIM_RISKS.has(item?.riskLevel) ? item.riskLevel : 'standard',
        sourceIds,
        status: CLAIM_STATUSES.has(item?.status) ? item.status : 'pending',
        notes: this.text(item?.notes, 1000)
      };
    });
  }

  id(value, prefix) {
    const normalized = String(value || '').trim();
    if (/^[a-zA-Z0-9_-]{1,100}$/.test(normalized)) return normalized;
    return `${prefix}_${crypto.randomUUID()}`;
  }

  validUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch (_error) {
      return '';
    }
  }

  text(value, limit) {
    return String(value || '').trim().slice(0, limit);
  }

  date(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  invalid(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
  }
}

module.exports = { ProvenanceService };
