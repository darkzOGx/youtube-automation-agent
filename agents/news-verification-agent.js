const { Logger } = require('../utils/logger');

const NUMBER_PATTERN = /(\$?\d+(?:\.\d+)?%?|\b\d{4}\b)/g;

function extractNumbers(text) {
  return Array.from(new Set(String(text || '').match(NUMBER_PATTERN) || []));
}

class NewsVerificationAgent {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = options.logger || new Logger('NewsVerification');
  }

  async initialize() {
    this.logger.info('Initializing News Verification Agent...');
    return true;
  }

  classifySources(sources = []) {
    const primary = sources.filter(source => Number(source.source_tier) === 1 && !source.discovery_only);
    const secondary = sources.filter(source => Number(source.source_tier) === 2);
    const media = sources.filter(source => Number(source.source_tier) === 3);
    const community = sources.filter(source => Number(source.source_tier) === 4 || source.notes === 'community_signal');
    return { primary, secondary, media, community };
  }

  findConflicts(sources = []) {
    const conflicts = [];
    const numericClaims = sources
      .map(source => ({ source, numbers: extractNumbers(`${source.title} ${source.notes || ''}`) }))
      .filter(item => item.numbers.length);
    for (let i = 0; i < numericClaims.length; i += 1) {
      for (let j = i + 1; j < numericClaims.length; j += 1) {
        const left = numericClaims[i];
        const right = numericClaims[j];
        const uniqueLeft = left.numbers.filter(value => !right.numbers.includes(value));
        const uniqueRight = right.numbers.filter(value => !left.numbers.includes(value));
        if (uniqueLeft.length && uniqueRight.length && left.source.publisher !== right.source.publisher) {
          conflicts.push({
            type: 'numeric_mismatch',
            left: { publisher: left.source.publisher, url: left.source.url, values: uniqueLeft },
            right: { publisher: right.source.publisher, url: right.source.url, values: uniqueRight }
          });
        }
      }
    }
    return conflicts;
  }

  decideStatus(groups, conflicts, sources) {
    if (conflicts.length) {
      return {
        verificationStatus: 'conflicted',
        status: 'needs_review',
        notes: 'Sources disagree on material numeric claims. Human review is required.'
      };
    }
    if (groups.primary.length) {
      return {
        verificationStatus: 'verified',
        status: 'verified',
        notes: 'At least one non-discovery official/primary source supports this event.'
      };
    }
    if (groups.secondary.length + groups.media.length >= 2) {
      return {
        verificationStatus: 'verified',
        status: 'verified',
        notes: 'Corroborated by multiple technical or reputable media sources. Still not Breaking-eligible without a primary source.'
      };
    }
    if (sources.every(source => source.discovery_only) && sources.length) {
      return {
        verificationStatus: 'discovered',
        status: 'discovered',
        notes: 'HTML listing discovery is not factual verification.'
      };
    }
    if (groups.community.length && !groups.primary.length && !groups.secondary.length && !groups.media.length) {
      return {
        verificationStatus: 'discovered',
        status: 'discovered',
        notes: 'Community signal only. Not sufficient to confirm Breaking News.'
      };
    }
    return {
      verificationStatus: 'verifying',
      status: 'verifying',
      notes: 'Awaiting additional corroboration.'
    };
  }

  async verifyEvent(eventId) {
    const event = await this.db.getNewsEvent(eventId);
    if (!event) throw new Error('News event not found');
    await this.db.updateNewsEvent(eventId, { verificationStatus: 'verifying', status: 'verifying' });
    const sources = await this.db.getNewsEventSources(eventId);
    const groups = this.classifySources(sources);
    const conflicts = this.findConflicts(sources);
    const decision = this.decideStatus(groups, conflicts, sources);
    const verifiedClaims = groups.primary.map(source => ({
      text: source.title,
      sourceUrl: source.url,
      publisher: source.publisher,
      status: 'verified'
    }));
    const unverifiedClaims = sources
      .filter(source => Number(source.source_tier) >= 4 || source.discovery_only)
      .map(source => ({
        text: source.title,
        sourceUrl: source.url,
        publisher: source.publisher,
        status: 'unverified'
      }));

    await this.db.updateNewsEvent(eventId, {
      verificationStatus: decision.verificationStatus,
      status: decision.status,
      holdReason: conflicts.length ? 'material_conflict' : event.hold_reason
    });

    return {
      eventId,
      verificationStatus: decision.verificationStatus,
      primarySourceCount: groups.primary.length,
      secondarySourceCount: groups.secondary.length + groups.media.length,
      communitySignalCount: groups.community.length,
      conflicts,
      verifiedClaims,
      unverifiedClaims,
      verificationNotes: decision.notes,
      event: await this.db.getNewsEvent(eventId)
    };
  }

  async verifyPending(limit = 50) {
    const pending = await this.db.listNewsEvents({ limit: 200 });
    const targets = pending.filter(event => ['discovered', 'verifying'].includes(event.verification_status)).slice(0, limit);
    const results = [];
    for (const event of targets) {
      results.push(await this.verifyEvent(event.id));
    }
    return results;
  }
}

module.exports = { NewsVerificationAgent };
