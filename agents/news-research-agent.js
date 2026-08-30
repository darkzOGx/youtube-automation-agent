const { Logger } = require('../utils/logger');
const { AITextService } = require('../utils/ai-text-service');
const { loadNewsroomConfig } = require('../utils/newsroom-config');

class NewsResearchAgent {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = options.logger || new Logger('NewsResearch');
    this.config = options.config || loadNewsroomConfig();
    this.aiTextService = options.aiTextService || new AITextService(options.credentials || {});
  }

  async initialize() {
    this.logger.info('Initializing News Research Agent...');
    return true;
  }

  fallbackPackage(event, sources, verification = {}) {
    const keyFacts = sources
      .filter(source => Number(source.source_tier) <= 2 && !source.discovery_only)
      .map(source => ({
        text: source.title,
        sourceUrl: source.url,
        publisher: source.publisher,
        status: 'verified'
      }));
    const claims = (verification.verifiedClaims || keyFacts).map(claim => ({
      ...claim,
      kind: 'verified_fact'
    }));
    const unknowns = [];
    if (!keyFacts.length) {
      unknowns.push('No official/primary source has confirmed the details yet.');
    }
    return {
      event: {
        id: event.id,
        title: event.title,
        company: event.company,
        product: event.product,
        eventType: event.event_type
      },
      keyFacts,
      claims,
      timeline: sources
        .filter(source => source.published_at)
        .map(source => ({ at: source.published_at, title: source.title, url: source.url }))
        .sort((a, b) => new Date(a.at) - new Date(b.at)),
      whyItMatters: event.summary || 'Cần reviewer xác nhận tác động trước khi khẳng định trên video.',
      audienceImpact: this.config.channel?.audience || '',
      tutorialOpportunity: /tool|api|model|workflow|chatgpt|claude|gemini/i.test(`${event.title} ${event.summary || ''}`),
      comparisonOpportunity: /vs|versus|so sánh|benchmark/i.test(`${event.title} ${event.summary || ''}`),
      sourceEvidence: sources.map(source => ({
        url: source.url,
        publisher: source.publisher,
        tier: source.source_tier,
        type: source.source_type,
        verification: source.verification_status,
        discoveryOnly: Boolean(source.discovery_only)
      })),
      conflicts: verification.conflicts || [],
      unknowns,
      suggestedAngles: [
        event.title,
        event.company ? `${event.company}: điều gì vừa thay đổi` : event.title
      ],
      researchSummary: event.summary || event.title
    };
  }

  parseJson(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    try {
      return JSON.parse(raw);
    } catch (_error) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Research model did not return JSON');
      return JSON.parse(match[0]);
    }
  }

  async researchEvent(eventId, verification = {}) {
    const event = await this.db.getNewsEvent(eventId);
    if (!event) throw new Error('News event not found');
    const sources = await this.db.getNewsEventSources(eventId);
    let pack = this.fallbackPackage(event, sources, verification);

    if (this.aiTextService.isAvailable()) {
      try {
        const prompt = `You are a news researcher for a Vietnamese AI YouTube channel.
Return only JSON with keys: keyFacts, claims, timeline, whyItMatters, audienceImpact, tutorialOpportunity, comparisonOpportunity, conflicts, unknowns, suggestedAngles, researchSummary.
Each fact/claim must include sourceUrl from the supplied sources when possible.
Never invent benchmarks, prices, model capabilities, release dates, API features, or quotes.
If uncertain, put the item in unknowns.
Write whyItMatters, audienceImpact, researchSummary, and suggestedAngles in Vietnamese. Keep product/model names in original English.

Event: ${JSON.stringify({ title: event.title, company: event.company, product: event.product, type: event.event_type, summary: event.summary })}
Sources: ${JSON.stringify(sources.map(source => ({ url: source.url, title: source.title, publisher: source.publisher, tier: source.source_tier, discoveryOnly: source.discovery_only })))}
Conflicts: ${JSON.stringify(verification.conflicts || [])}`;
        const response = await this.aiTextService.generateText(prompt, { maxTokens: 1600, temperature: 0.2 });
        const parsed = this.parseJson(response);
        pack = {
          ...pack,
          ...parsed,
          event: pack.event,
          sourceEvidence: pack.sourceEvidence,
          keyFacts: parsed.keyFacts || pack.keyFacts,
          claims: parsed.claims || pack.claims,
          conflicts: parsed.conflicts || pack.conflicts,
          unknowns: parsed.unknowns || pack.unknowns
        };
      } catch (error) {
        this.logger.warn(`News research model fallback used: ${error.message}`);
      }
    }

    await this.db.saveNewsResearch(eventId, pack);
    return this.db.getNewsResearch(eventId);
  }
}

module.exports = { NewsResearchAgent };
