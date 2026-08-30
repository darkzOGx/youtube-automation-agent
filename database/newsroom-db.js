const NEWSROOM_TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS news_events (
    id TEXT PRIMARY KEY,
    canonical_key TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    company TEXT,
    product TEXT,
    event_type TEXT,
    event_at TEXT,
    status TEXT DEFAULT 'discovered',
    verification_status TEXT DEFAULT 'discovered',
    score INTEGER DEFAULT 0,
    content_route TEXT,
    urgency TEXT,
    content_idea_id TEXT,
    related_event_id TEXT,
    hold_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS news_event_sources (
    id TEXT PRIMARY KEY,
    news_event_id TEXT NOT NULL,
    url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    title TEXT,
    publisher TEXT,
    source_tier INTEGER,
    source_type TEXT,
    source_id TEXT,
    adapter TEXT,
    published_at TEXT,
    verification_status TEXT DEFAULT 'pending',
    discovery_only INTEGER DEFAULT 0,
    hn_item_id INTEGER,
    hn_score INTEGER DEFAULT 0,
    hn_comments INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (news_event_id) REFERENCES news_events(id),
    UNIQUE (news_event_id, normalized_url)
  )`,
  `CREATE TABLE IF NOT EXISTS news_event_scores (
    id TEXT PRIMARY KEY,
    news_event_id TEXT NOT NULL,
    freshness_score INTEGER NOT NULL,
    authority_score INTEGER NOT NULL,
    impact_score INTEGER NOT NULL,
    trend_score INTEGER NOT NULL,
    audience_fit_score INTEGER NOT NULL,
    verification_score INTEGER NOT NULL,
    total_score INTEGER NOT NULL,
    score_version TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (news_event_id) REFERENCES news_events(id)
  )`,
  `CREATE TABLE IF NOT EXISTS news_event_research (
    id TEXT PRIMARY KEY,
    news_event_id TEXT NOT NULL UNIQUE,
    facts_json TEXT NOT NULL DEFAULT '[]',
    claims_json TEXT NOT NULL DEFAULT '[]',
    sources_json TEXT NOT NULL DEFAULT '[]',
    conflicts_json TEXT NOT NULL DEFAULT '[]',
    research_summary TEXT,
    package_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (news_event_id) REFERENCES news_events(id)
  )`,
  `CREATE TABLE IF NOT EXISTS newsroom_runs (
    id TEXT PRIMARY KEY,
    run_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT DEFAULT 'running',
    signals_scanned INTEGER DEFAULT 0,
    events_created INTEGER DEFAULT 0,
    events_merged INTEGER DEFAULT 0,
    events_verified INTEGER DEFAULT 0,
    ideas_created INTEGER DEFAULT 0,
    errors_json TEXT NOT NULL DEFAULT '[]',
    metrics_json TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS news_source_health (
    source_id TEXT PRIMARY KEY,
    adapter TEXT,
    last_success_at TEXT,
    last_failure_at TEXT,
    last_error TEXT,
    items_collected INTEGER DEFAULT 0,
    latency_ms INTEGER,
    status TEXT DEFAULT 'unknown',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS news_event_publications (
    id TEXT PRIMARY KEY,
    news_event_id TEXT NOT NULL,
    content_idea_id TEXT,
    production_id TEXT,
    youtube_id TEXT,
    route TEXT,
    score INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (news_event_id) REFERENCES news_events(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_news_events_status ON news_events(status, verification_status, score)`,
  `CREATE INDEX IF NOT EXISTS idx_news_events_canonical ON news_events(canonical_key)`,
  `CREATE INDEX IF NOT EXISTS idx_news_event_sources_url ON news_event_sources(normalized_url)`,
  `CREATE INDEX IF NOT EXISTS idx_news_event_sources_event ON news_event_sources(news_event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_newsroom_runs_status ON newsroom_runs(status, started_at)`
];

const NEWSROOM_IDEA_COLUMNS = {
  source: 'TEXT',
  news_event_id: 'TEXT',
  content_route: 'TEXT',
  urgency: 'TEXT',
  research_json: 'TEXT',
  source_references: 'TEXT',
  suggested_title: 'TEXT',
  thumbnail_angle: 'TEXT',
  target_audience: 'TEXT',
  content_pillar: 'TEXT'
};

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function attachNewsroomStore(Database) {
  Database.prototype.parseNewsEvent = function parseNewsEvent(row) {
    if (!row) return null;
    return { ...row, score: Number(row.score || 0) };
  };

  Database.prototype.createNewsEvent = async function createNewsEvent(event = {}) {
    const id = event.id || this.generateId('news');
    await this.executeQuery(
      `INSERT INTO news_events (
        id, canonical_key, title, summary, company, product, event_type, event_at,
        status, verification_status, score, content_route, urgency, content_idea_id, related_event_id, hold_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        event.canonicalKey || event.canonical_key,
        event.title,
        event.summary || null,
        event.company || null,
        event.product || null,
        event.eventType || event.event_type || 'other',
        event.eventAt || event.event_at || null,
        event.status || 'discovered',
        event.verificationStatus || event.verification_status || 'discovered',
        event.score || 0,
        event.contentRoute || event.content_route || null,
        event.urgency || null,
        event.contentIdeaId || event.content_idea_id || null,
        event.relatedEventId || event.related_event_id || null,
        event.holdReason || event.hold_reason || null
      ]
    );
    return this.getNewsEvent(id);
  };

  Database.prototype.updateNewsEvent = async function updateNewsEvent(id, changes = {}) {
    const current = await this.getNewsEvent(id);
    if (!current) return null;
    await this.executeQuery(
      `UPDATE news_events SET
        canonical_key = ?, title = ?, summary = ?, company = ?, product = ?, event_type = ?,
        event_at = ?, status = ?, verification_status = ?, score = ?, content_route = ?,
        urgency = ?, content_idea_id = ?, related_event_id = ?, hold_reason = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        changes.canonicalKey ?? current.canonical_key,
        changes.title ?? current.title,
        changes.summary ?? current.summary,
        changes.company ?? current.company,
        changes.product ?? current.product,
        changes.eventType ?? current.event_type,
        changes.eventAt === undefined ? current.event_at : changes.eventAt,
        changes.status ?? current.status,
        changes.verificationStatus ?? current.verification_status,
        changes.score ?? current.score,
        changes.contentRoute === undefined ? current.content_route : changes.contentRoute,
        changes.urgency === undefined ? current.urgency : changes.urgency,
        changes.contentIdeaId === undefined ? current.content_idea_id : changes.contentIdeaId,
        changes.relatedEventId === undefined ? current.related_event_id : changes.relatedEventId,
        changes.holdReason === undefined ? current.hold_reason : changes.holdReason,
        id
      ]
    );
    return this.getNewsEvent(id);
  };

  Database.prototype.getNewsEvent = async function getNewsEvent(id) {
    return this.parseNewsEvent(await this.getRow('SELECT * FROM news_events WHERE id = ?', [id]));
  };

  Database.prototype.findNewsEventByCanonicalKey = async function findNewsEventByCanonicalKey(canonicalKey) {
    return this.parseNewsEvent(await this.getRow(
      'SELECT * FROM news_events WHERE canonical_key = ? ORDER BY created_at DESC LIMIT 1',
      [canonicalKey]
    ));
  };

  Database.prototype.findNewsEventByNormalizedUrl = async function findNewsEventByNormalizedUrl(normalizedUrl) {
    const row = await this.getRow(
      `SELECT e.* FROM news_events e
       INNER JOIN news_event_sources s ON s.news_event_id = e.id
       WHERE s.normalized_url = ?
       ORDER BY e.created_at DESC LIMIT 1`,
      [normalizedUrl]
    );
    return this.parseNewsEvent(row);
  };

  Database.prototype.listNewsEvents = async function listNewsEvents(filters = {}) {
    const where = [];
    const params = [];
    if (filters.status) {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters.verificationStatus) {
      where.push('verification_status = ?');
      params.push(filters.verificationStatus);
    }
    if (filters.route) {
      where.push('content_route = ?');
      params.push(filters.route);
    }
    if (filters.minScore != null) {
      where.push('score >= ?');
      params.push(Number(filters.minScore));
    }
    if (filters.q) {
      where.push('(title LIKE ? OR company LIKE ? OR summary LIKE ?)');
      const like = `%${filters.q}%`;
      params.push(like, like, like);
    }
    const sql = `SELECT * FROM news_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY datetime(COALESCE(event_at, created_at)) DESC, score DESC
                 LIMIT ?`;
    params.push(Math.min(200, Number(filters.limit || 50)));
    const rows = await this.getAllRows(sql, params);
    return rows.map(row => this.parseNewsEvent(row));
  };

  Database.prototype.listRecentNewsEvents = async function listRecentNewsEvents(hours = 168) {
    const rows = await this.getAllRows(
      `SELECT * FROM news_events
       WHERE datetime(created_at) >= datetime('now', ?)
       ORDER BY created_at DESC`,
      [`-${Number(hours)} hours`]
    );
    return rows.map(row => this.parseNewsEvent(row));
  };

  Database.prototype.addNewsEventSource = async function addNewsEventSource(eventId, source = {}) {
    const existing = await this.getRow(
      'SELECT * FROM news_event_sources WHERE news_event_id = ? AND normalized_url = ?',
      [eventId, source.normalizedUrl || source.normalized_url]
    );
    if (existing) {
      await this.executeQuery(
        `UPDATE news_event_sources SET
          title = COALESCE(?, title),
          publisher = COALESCE(?, publisher),
          source_tier = COALESCE(?, source_tier),
          hn_score = MAX(hn_score, ?),
          hn_comments = MAX(hn_comments, ?),
          notes = COALESCE(?, notes)
         WHERE id = ?`,
        [
          source.title || null,
          source.publisher || null,
          source.sourceTier || source.source_tier || null,
          Number(source.hnScore || source.hn_score || 0),
          Number(source.hnComments || source.hn_comments || 0),
          source.notes || null,
          existing.id
        ]
      );
      return this.getRow('SELECT * FROM news_event_sources WHERE id = ?', [existing.id]);
    }
    const id = source.id || this.generateId('nsrc');
    await this.executeQuery(
      `INSERT INTO news_event_sources (
        id, news_event_id, url, normalized_url, title, publisher, source_tier, source_type,
        source_id, adapter, published_at, verification_status, discovery_only, hn_item_id,
        hn_score, hn_comments, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        eventId,
        source.url,
        source.normalizedUrl || source.normalized_url,
        source.title || null,
        source.publisher || null,
        source.sourceTier || source.source_tier || 4,
        source.sourceType || source.source_type || null,
        source.sourceId || source.source_id || null,
        source.adapter || null,
        source.publishedAt || source.published_at || null,
        source.verificationStatus || source.verification_status || 'pending',
        source.discoveryOnly === true || source.discovery_only ? 1 : 0,
        source.hnItemId || source.hn_item_id || null,
        Number(source.hnScore || source.hn_score || 0),
        Number(source.hnComments || source.hn_comments || 0),
        source.notes || null
      ]
    );
    return this.getRow('SELECT * FROM news_event_sources WHERE id = ?', [id]);
  };

  Database.prototype.getNewsEventSources = async function getNewsEventSources(eventId) {
    const rows = await this.getAllRows(
      'SELECT * FROM news_event_sources WHERE news_event_id = ? ORDER BY source_tier ASC, created_at ASC',
      [eventId]
    );
    return rows.map(row => ({ ...row, discovery_only: Boolean(row.discovery_only) }));
  };

  Database.prototype.saveNewsEventScore = async function saveNewsEventScore(eventId, score = {}) {
    const id = this.generateId('nscore');
    await this.executeQuery(
      `INSERT INTO news_event_scores (
        id, news_event_id, freshness_score, authority_score, impact_score, trend_score,
        audience_fit_score, verification_score, total_score, score_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        eventId,
        score.freshness_score,
        score.authority_score,
        score.impact_score,
        score.trend_score,
        score.audience_fit_score,
        score.verification_score,
        score.total_score,
        score.score_version
      ]
    );
    await this.executeQuery('UPDATE news_events SET score = ?, updated_at = datetime(\'now\') WHERE id = ?', [score.total_score, eventId]);
    return this.getNewsEventScore(eventId);
  };

  Database.prototype.getNewsEventScore = async function getNewsEventScore(eventId) {
    return this.getRow(
      'SELECT * FROM news_event_scores WHERE news_event_id = ? ORDER BY created_at DESC LIMIT 1',
      [eventId]
    );
  };

  Database.prototype.saveNewsResearch = async function saveNewsResearch(eventId, research = {}) {
    const existing = await this.getRow('SELECT id FROM news_event_research WHERE news_event_id = ?', [eventId]);
    const payload = [
      JSON.stringify(research.facts || research.keyFacts || []),
      JSON.stringify(research.claims || []),
      JSON.stringify(research.sources || research.sourceEvidence || []),
      JSON.stringify(research.conflicts || []),
      research.researchSummary || research.summary || null,
      JSON.stringify(research)
    ];
    if (existing) {
      await this.executeQuery(
        `UPDATE news_event_research SET
          facts_json = ?, claims_json = ?, sources_json = ?, conflicts_json = ?,
          research_summary = ?, package_json = ?, updated_at = datetime('now')
         WHERE news_event_id = ?`,
        [...payload, eventId]
      );
    } else {
      await this.executeQuery(
        `INSERT INTO news_event_research (
          id, news_event_id, facts_json, claims_json, sources_json, conflicts_json, research_summary, package_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [this.generateId('nres'), eventId, ...payload]
      );
    }
    return this.getNewsResearch(eventId);
  };

  Database.prototype.getNewsResearch = async function getNewsResearch(eventId) {
    const row = await this.getRow('SELECT * FROM news_event_research WHERE news_event_id = ?', [eventId]);
    if (!row) return null;
    return {
      ...row,
      facts: parseJson(row.facts_json, []),
      claims: parseJson(row.claims_json, []),
      sources: parseJson(row.sources_json, []),
      conflicts: parseJson(row.conflicts_json, []),
      package: parseJson(row.package_json, {})
    };
  };

  Database.prototype.createNewsroomRun = async function createNewsroomRun(run = {}) {
    const id = run.id || this.generateId('nrun');
    await this.executeQuery(
      `INSERT INTO newsroom_runs (id, run_type, started_at, status, errors_json, metrics_json)
       VALUES (?, ?, ?, 'running', '[]', '{}')`,
      [id, run.runType || run.run_type || 'cycle', run.startedAt || new Date().toISOString()]
    );
    return this.getRow('SELECT * FROM newsroom_runs WHERE id = ?', [id]);
  };

  Database.prototype.finishNewsroomRun = async function finishNewsroomRun(id, result = {}) {
    await this.executeQuery(
      `UPDATE newsroom_runs SET
        finished_at = ?, status = ?, signals_scanned = ?, events_created = ?, events_merged = ?,
        events_verified = ?, ideas_created = ?, errors_json = ?, metrics_json = ?
       WHERE id = ?`,
      [
        result.finishedAt || new Date().toISOString(),
        result.status || 'completed',
        result.signalsScanned || 0,
        result.eventsCreated || 0,
        result.eventsMerged || 0,
        result.eventsVerified || 0,
        result.ideasCreated || 0,
        JSON.stringify(result.errors || []),
        JSON.stringify(result.metrics || {}),
        id
      ]
    );
    return this.getRow('SELECT * FROM newsroom_runs WHERE id = ?', [id]);
  };

  Database.prototype.getActiveNewsroomRun = async function getActiveNewsroomRun() {
    return this.getRow("SELECT * FROM newsroom_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1");
  };

  Database.prototype.listNewsroomRuns = async function listNewsroomRuns(limit = 20) {
    const rows = await this.getAllRows('SELECT * FROM newsroom_runs ORDER BY started_at DESC LIMIT ?', [limit]);
    return rows.map(row => ({
      ...row,
      errors: parseJson(row.errors_json, []),
      metrics: parseJson(row.metrics_json, {})
    }));
  };

  Database.prototype.upsertNewsSourceHealth = async function upsertNewsSourceHealth(record = {}) {
    await this.executeQuery(
      `INSERT INTO news_source_health (
        source_id, adapter, last_success_at, last_failure_at, last_error, items_collected, latency_ms, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source_id) DO UPDATE SET
        adapter = excluded.adapter,
        last_success_at = COALESCE(excluded.last_success_at, news_source_health.last_success_at),
        last_failure_at = COALESCE(excluded.last_failure_at, news_source_health.last_failure_at),
        last_error = excluded.last_error,
        items_collected = excluded.items_collected,
        latency_ms = excluded.latency_ms,
        status = excluded.status,
        updated_at = datetime('now')`,
      [
        record.sourceId,
        record.adapter || null,
        record.lastSuccessAt || null,
        record.lastFailureAt || null,
        record.lastError || null,
        Number(record.itemsCollected || 0),
        record.latencyMs == null ? null : Number(record.latencyMs),
        record.status || 'unknown'
      ]
    );
    return this.getRow('SELECT * FROM news_source_health WHERE source_id = ?', [record.sourceId]);
  };

  Database.prototype.listNewsSourceHealth = async function listNewsSourceHealth() {
    return this.getAllRows('SELECT * FROM news_source_health ORDER BY source_id');
  };

  Database.prototype.saveNewsEventPublication = async function saveNewsEventPublication(record = {}) {
    const id = record.id || this.generateId('npub');
    await this.executeQuery(
      `INSERT INTO news_event_publications (
        id, news_event_id, content_idea_id, production_id, youtube_id, route, score
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.newsEventId,
        record.contentIdeaId || null,
        record.productionId || null,
        record.youtubeId || null,
        record.route || null,
        record.score || null
      ]
    );
    return this.getRow('SELECT * FROM news_event_publications WHERE id = ?', [id]);
  };

  Database.prototype.listNewsEventPublications = async function listNewsEventPublications(eventId) {
    return this.getAllRows(
      'SELECT * FROM news_event_publications WHERE news_event_id = ? ORDER BY created_at DESC',
      [eventId]
    );
  };

  Database.prototype.getNewsroomSummary = async function getNewsroomSummary() {
    const counts = await this.getRow(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN content_route = 'breaking' THEN 1 ELSE 0 END) AS breaking,
         SUM(CASE WHEN content_route = 'ai_today' THEN 1 ELSE 0 END) AS ai_today,
         SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) AS verified,
         SUM(CASE WHEN verification_status = 'conflicted' THEN 1 ELSE 0 END) AS conflicted,
         SUM(CASE WHEN status = 'watchlist' OR content_route = 'watchlist' THEN 1 ELSE 0 END) AS watchlist
       FROM news_events`
    );
    return {
      counts: counts || { total: 0, breaking: 0, ai_today: 0, verified: 0, conflicted: 0, watchlist: 0 },
      latestRun: (await this.listNewsroomRuns(1))[0] || null,
      health: await this.listNewsSourceHealth()
    };
  };
}

module.exports = { NEWSROOM_TABLE_SQL, NEWSROOM_IDEA_COLUMNS, attachNewsroomStore };
