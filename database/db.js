const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const { Logger } = require('../utils/logger');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'youtube_automation.db');
    this.db = null;
    this.logger = new Logger('Database');
  }

  async initialize() {
    try {
      this.logger.info('Initializing database...');
      
      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
      
      // Connect to database
      this.db = new sqlite3.Database(this.dbPath);
      
      // Create tables
      await this.createTables();
      
      this.logger.success('Database initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async createTables() {
    const tables = [
      // Content Strategy
      `CREATE TABLE IF NOT EXISTS content_strategies (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        angle TEXT NOT NULL,
        target_audience TEXT NOT NULL,
        content_type TEXT NOT NULL,
        keywords TEXT NOT NULL,
        estimated_views INTEGER DEFAULT 0,
        best_publish_time TEXT,
        competitor_analysis TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Scripts
      `CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        strategy_id TEXT,
        title TEXT NOT NULL,
        hook TEXT,
        introduction TEXT,
        main_content TEXT NOT NULL,
        conclusion TEXT,
        call_to_action TEXT,
        full_script TEXT,
        duration TEXT,
        tone TEXT,
        pacing TEXT,
        keywords TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (strategy_id) REFERENCES content_strategies(id)
      )`,
      
      // Thumbnails
      `CREATE TABLE IF NOT EXISTS thumbnails (
        id TEXT PRIMARY KEY,
        script_id TEXT,
        path TEXT NOT NULL,
        concept TEXT,
        prompt TEXT,
        dimensions TEXT,
        file_size INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id)
      )`,
      
      // SEO Data
      `CREATE TABLE IF NOT EXISTS seo_data (
        id TEXT PRIMARY KEY,
        script_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT NOT NULL,
        hashtags TEXT,
        chapters TEXT,
        end_screen TEXT,
        seo_score INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id)
      )`,
      
      // Production Data
      `CREATE TABLE IF NOT EXISTS productions (
        id TEXT PRIMARY KEY,
        strategy_id TEXT,
        script_id TEXT,
        thumbnail_id TEXT,
        seo_id TEXT,
        status TEXT DEFAULT 'processing',
        assets TEXT,
        timeline TEXT,
        scheduled_publish_time TEXT,
        priority INTEGER DEFAULT 50,
        estimated_duration TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (strategy_id) REFERENCES content_strategies(id),
        FOREIGN KEY (script_id) REFERENCES scripts(id),
        FOREIGN KEY (thumbnail_id) REFERENCES thumbnails(id),
        FOREIGN KEY (seo_id) REFERENCES seo_data(id)
      )`,
      
      // Publishing Schedule
      `CREATE TABLE IF NOT EXISTS publish_schedule (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        title TEXT NOT NULL,
        publish_time TEXT NOT NULL,
        status TEXT DEFAULT 'scheduled',
        priority INTEGER DEFAULT 50,
        metadata TEXT,
        youtube_id TEXT,
        youtube_url TEXT,
        published_at TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      
      // Analytics Reports
      `CREATE TABLE IF NOT EXISTS analytics_reports (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        youtube_id TEXT,
        video_details TEXT,
        analytics_data TEXT,
        thumbnail_metrics TEXT,
        seo_metrics TEXT,
        insights TEXT,
        performance_score INTEGER DEFAULT 0,
        performance_grade TEXT,
        analyzed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,

      // Evidence-backed channel learning
      `CREATE TABLE IF NOT EXISTS performance_snapshots (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        production_id TEXT,
        measurement_window TEXT NOT NULL,
        published_at TEXT,
        metrics TEXT NOT NULL,
        content_attributes TEXT NOT NULL,
        baseline TEXT,
        deltas TEXT,
        confidence TEXT DEFAULT 'low',
        simulated INTEGER DEFAULT 0,
        measured_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(video_id, measurement_window)
      )`,
      `CREATE TABLE IF NOT EXISTS learning_recommendations (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        rationale TEXT NOT NULL,
        evidence TEXT NOT NULL,
        proposed_change TEXT NOT NULL,
        confidence TEXT DEFAULT 'low',
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS growth_experiments (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        recommendation_id TEXT,
        title TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        primary_metric TEXT NOT NULL DEFAULT 'ctr',
        status TEXT NOT NULL DEFAULT 'draft',
        arm_duration_hours INTEGER NOT NULL DEFAULT 48,
        min_impressions INTEGER NOT NULL DEFAULT 1000,
        guardrails TEXT NOT NULL DEFAULT '{}',
        current_arm_id TEXT,
        winning_arm_id TEXT,
        result TEXT NOT NULL DEFAULT '{}',
        approved_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        adopted_at TEXT,
        cancelled_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS experiment_arms (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL,
        arm_index INTEGER NOT NULL,
        label TEXT NOT NULL,
        title TEXT NOT NULL,
        thumbnail_path TEXT NOT NULL,
        is_control INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        baseline_metrics TEXT NOT NULL DEFAULT '{}',
        final_metrics TEXT NOT NULL DEFAULT '{}',
        result TEXT NOT NULL DEFAULT '{}',
        started_at TEXT,
        ended_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(experiment_id, arm_index),
        FOREIGN KEY (experiment_id) REFERENCES growth_experiments(id)
      )`,
      `CREATE TABLE IF NOT EXISTS experiment_samples (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL,
        arm_id TEXT NOT NULL,
        metrics TEXT NOT NULL,
        traffic_sources TEXT NOT NULL DEFAULT '[]',
        captured_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (experiment_id) REFERENCES growth_experiments(id),
        FOREIGN KEY (arm_id) REFERENCES experiment_arms(id)
      )`,
      `CREATE TABLE IF NOT EXISTS retention_snapshots (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        production_id TEXT,
        short_clip_id TEXT,
        title TEXT,
        surface TEXT NOT NULL DEFAULT 'long_form',
        measurement_window TEXT NOT NULL,
        published_at TEXT,
        duration_seconds REAL NOT NULL,
        points TEXT NOT NULL,
        scene_metrics TEXT NOT NULL,
        summary TEXT NOT NULL,
        confidence TEXT DEFAULT 'low',
        measured_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(video_id, measurement_window)
      )`,

      `CREATE TABLE IF NOT EXISTS audience_comments (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL UNIQUE,
        video_id TEXT NOT NULL,
        parent_comment_id TEXT,
        author_name TEXT,
        author_channel_id TEXT,
        is_channel_owner INTEGER DEFAULT 0,
        text TEXT NOT NULL,
        like_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        published_at TEXT,
        updated_at_youtube TEXT,
        flags TEXT NOT NULL DEFAULT '[]',
        analysis_state TEXT DEFAULT 'pending',
        replied_by_agent INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS engagement_insights (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL UNIQUE,
        production_id TEXT,
        title TEXT,
        comment_count INTEGER DEFAULT 0,
        analyzed_count INTEGER DEFAULT 0,
        sentiment TEXT NOT NULL DEFAULT '{}',
        themes TEXT NOT NULL DEFAULT '[]',
        attention_flags TEXT NOT NULL DEFAULT '[]',
        analysis_method TEXT DEFAULT 'ai',
        analyzed_at TEXT,
        last_synced_at TEXT,
        newest_comment_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS reply_drafts (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL UNIQUE,
        video_id TEXT NOT NULL,
        draft_text TEXT NOT NULL,
        edited_text TEXT,
        status TEXT DEFAULT 'proposed',
        rationale TEXT,
        posted_comment_id TEXT,
        posted_at TEXT,
        failure_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,

      // Keywords Performance
      `CREATE TABLE IF NOT EXISTS keyword_performance (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL UNIQUE,
        total_uses INTEGER DEFAULT 0,
        total_views INTEGER DEFAULT 0,
        average_views INTEGER DEFAULT 0,
        best_performing_video TEXT,
        last_used TEXT,
        performance_score INTEGER DEFAULT 0
      )`,
      
      // Content Performance History
      `CREATE TABLE IF NOT EXISTS content_history (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        topic TEXT NOT NULL,
        content_type TEXT NOT NULL,
        publish_date TEXT NOT NULL,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        watch_time INTEGER DEFAULT 0,
        ctr REAL DEFAULT 0,
        retention_rate REAL DEFAULT 0,
        performance_score INTEGER DEFAULT 0,
        youtube_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Automation Events
      `CREATE TABLE IF NOT EXISTS automation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS generation_jobs (
        id TEXT PRIMARY KEY,
        topic TEXT,
        style TEXT,
        length TEXT DEFAULT 'medium',
        source TEXT DEFAULT 'manual',
        status TEXT DEFAULT 'queued',
        stage TEXT DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        production_id TEXT,
        title TEXT,
        error TEXT,
        details TEXT,
        cancel_requested INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS generation_checkpoints (
        job_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        artifact TEXT,
        attempt_count INTEGER DEFAULT 0,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (job_id, stage),
        FOREIGN KEY (job_id) REFERENCES generation_jobs(id)
      )`,
      `CREATE TABLE IF NOT EXISTS media_generation_tasks (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        production_id TEXT,
        scene_index INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        external_task_id TEXT,
        status TEXT DEFAULT 'submitting',
        request TEXT NOT NULL DEFAULT '{}',
        provider_data TEXT NOT NULL DEFAULT '{}',
        output_path TEXT,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        UNIQUE(job_id, scene_index, provider),
        FOREIGN KEY (job_id) REFERENCES generation_jobs(id)
      )`,
      `CREATE TABLE IF NOT EXISTS production_snapshots (
        production_id TEXT PRIMARY KEY,
        strategy TEXT,
        script TEXT,
        thumbnail TEXT,
        seo TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS content_reviews (
        production_id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'needs_review',
        editor_data TEXT,
        quality_checks TEXT,
        review_notes TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS content_provenance (
        production_id TEXT PRIMARY KEY,
        sources TEXT NOT NULL DEFAULT '[]',
        claims TEXT NOT NULL DEFAULT '[]',
        contains_synthetic_media INTEGER DEFAULT 0,
        status TEXT DEFAULT 'not_required',
        summary TEXT NOT NULL DEFAULT '{}',
        reviewed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS discoverability_audits (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'youtube',
        mode TEXT NOT NULL DEFAULT 'content',
        engine TEXT NOT NULL DEFAULT 'darkzseo',
        engine_version TEXT,
        schema_version TEXT,
        status TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '{}',
        error_code TEXT,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS discoverability_findings (
        id TEXT PRIMARY KEY,
        audit_id TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        applicability TEXT NOT NULL DEFAULT '[]',
        message TEXT NOT NULL,
        remediation TEXT,
        fingerprint TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'pending',
        review_reason TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_id) REFERENCES discoverability_audits(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_discoverability_audits_production
       ON discoverability_audits(production_id, platform, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_discoverability_findings_audit
       ON discoverability_findings(audit_id, severity, review_status)`,
      `CREATE TABLE IF NOT EXISTS production_scenes (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        label TEXT NOT NULL,
        script_text TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        duration REAL NOT NULL DEFAULT 5,
        asset_type TEXT DEFAULT 'missing',
        asset_origin TEXT DEFAULT 'generated',
        asset_path TEXT,
        audio_path TEXT,
        narration_provider TEXT,
        narration_model TEXT,
        narration_task_id TEXT,
        narration_error TEXT,
        narration_generated_at TEXT,
        narration_cost TEXT NOT NULL DEFAULT '{}',
        provider TEXT,
        model TEXT,
        external_task_id TEXT,
        status TEXT DEFAULT 'ready',
        narration_status TEXT DEFAULT 'current',
        revision INTEGER DEFAULT 1,
        locked INTEGER DEFAULT 0,
        rights_confirmed INTEGER DEFAULT 0,
        provenance_source_ids TEXT NOT NULL DEFAULT '[]',
        contains_synthetic_media INTEGER DEFAULT 0,
        estimated_cost TEXT NOT NULL DEFAULT '{}',
        actual_cost TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(production_id, position),
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS production_scene_revisions (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT DEFAULT 'completed',
        before_state TEXT NOT NULL DEFAULT '{}',
        after_state TEXT NOT NULL DEFAULT '{}',
        cost_evidence TEXT NOT NULL DEFAULT '{}',
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        FOREIGN KEY (production_id) REFERENCES productions(id),
        FOREIGN KEY (scene_id) REFERENCES production_scenes(id)
      )`,
      `CREATE TABLE IF NOT EXISTS shorts_clips (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        source_scene_ids TEXT NOT NULL DEFAULT '[]',
        start_seconds REAL NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 30,
        layout TEXT NOT NULL DEFAULT 'blur',
        rationale TEXT,
        status TEXT NOT NULL DEFAULT 'proposed',
        output_path TEXT,
        captions_path TEXT,
        publish_time TEXT,
        privacy_status TEXT DEFAULT 'private',
        inherited_evidence TEXT NOT NULL DEFAULT '{}',
        rendered_at TEXT,
        approved_at TEXT,
        schedule_id TEXT,
        youtube_id TEXT,
        youtube_url TEXT,
        error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(production_id, position),
        FOREIGN KEY (production_id) REFERENCES productions(id)
      )`,
      `CREATE TABLE IF NOT EXISTS channel_profiles (
        id TEXT PRIMARY KEY,
        channel_name TEXT,
        goal TEXT,
        target_audience TEXT,
        brand_voice TEXT,
        default_style TEXT,
        call_to_action TEXT,
        banned_topics TEXT,
        visual_style TEXT,
        timezone TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS content_ideas (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        angle TEXT,
        style TEXT,
        status TEXT DEFAULT 'backlog',
        rationale TEXT,
        scheduled_for TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS channel_strategies (
        id TEXT PRIMARY KEY,
        objective TEXT NOT NULL,
        audience TEXT NOT NULL,
        value_proposition TEXT,
        content_pillars TEXT NOT NULL,
        cadence_per_week INTEGER DEFAULT 1,
        videos_per_run INTEGER DEFAULT 1,
        default_format TEXT DEFAULT 'explainer',
        default_length TEXT DEFAULT 'medium',
        success_metric TEXT,
        primary_kpi TEXT DEFAULT 'views',
        target_value REAL,
        target_window_days INTEGER DEFAULT 28,
        monthly_budget REAL,
        outcome_currency TEXT DEFAULT 'USD',
        constraints TEXT,
        status TEXT DEFAULT 'draft',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS operator_runs (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        stage TEXT DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        research TEXT,
        plan TEXT,
        generated_jobs TEXT,
        summary TEXT,
        error TEXT,
        cancel_requested INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        FOREIGN KEY (strategy_id) REFERENCES channel_strategies(id)
      )`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        level TEXT DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        status TEXT DEFAULT 'unread',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS readiness_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        checks TEXT NOT NULL,
        summary TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
            // System Settings
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const tableQuery of tables) {
      await this.executeQuery(tableQuery);
    }

    await this.ensureColumns('production_scenes', {
      narration_provider: 'TEXT',
      narration_model: 'TEXT',
      narration_task_id: 'TEXT',
      narration_error: 'TEXT',
      narration_generated_at: 'TEXT',
      narration_cost: "TEXT NOT NULL DEFAULT '{}'"
    });
    await this.ensureColumns('channel_strategies', {
      primary_kpi: "TEXT DEFAULT 'views'",
      target_value: 'REAL',
      target_window_days: 'INTEGER DEFAULT 28',
      monthly_budget: 'REAL',
      outcome_currency: "TEXT DEFAULT 'USD'"
    });
    await this.ensureColumns('discoverability_audits', {
      error_code: 'TEXT'
    });

    // Insert default settings
    await this.insertDefaultSettings();
  }

  async ensureColumns(tableName, columns) {
    const allowedTables = new Set(['production_scenes', 'channel_strategies', 'discoverability_audits']);
    if (!allowedTables.has(tableName)) throw new Error(`Unsupported migration table: ${tableName}`);
    const existing = new Set((await this.getAllRows(`PRAGMA table_info(${tableName})`)).map(column => column.name));
    for (const [columnName, definition] of Object.entries(columns)) {
      if (!existing.has(columnName)) {
        await this.executeQuery(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
      }
    }
  }

  async insertDefaultSettings() {
    const defaultSettings = [
      ['daily_content_enabled', 'true', 'Enable daily content generation'],
      ['auto_publish_enabled', 'true', 'Enable automatic publishing'],
      ['analytics_enabled', 'true', 'Enable analytics collection'],
      ['optimization_enabled', 'true', 'Enable automatic optimization'],
      ['publish_time_optimization', 'true', 'Optimize publishing times automatically'],
      ['thumbnail_ab_testing', 'false', 'Enable thumbnail A/B testing'],
      ['content_backup_enabled', 'true', 'Enable content backup'],
      ['notification_enabled', 'true', 'Enable system notifications'],
      ['approval_required', 'true', 'Require human approval before scheduling generated content'],
      ['automation_paused', 'false', 'Pause generation and publishing automation'],
      ['channel_timezone', 'America/Chicago', 'Timezone used to present channel schedules'],
      ['max_daily_posts', '1', 'Maximum posts per day'],
      ['content_buffer_days', '3', 'Days of content to keep in buffer'],
      ['video_provider', 'slideshow', 'Video provider: slideshow, auto, seedance, minimax_h3, google_omni, kling, or wan'],
      ['video_provider_order', 'seedance,minimax_h3,google_omni,kling,wan,slideshow', 'Provider priority used by automatic routing'],
      ['video_generation_mode', 'hybrid', 'Use provider clips within a locally assembled long-form video'],
      ['video_clip_duration', '8', 'Requested duration for each generated provider clip'],
      ['video_max_generated_seconds', '60', 'Maximum paid provider seconds per production'],
      ['video_resolution', '720p', 'Requested generated clip resolution'],
      ['video_aspect_ratio', '16:9', 'Requested generated clip aspect ratio']
    ];

    for (const [key, value, description] of defaultSettings) {
      await this.executeQuery(
        'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)',
        [key, value, description]
      );
    }

    await this.executeQuery(
      `INSERT OR IGNORE INTO channel_profiles (
        id, channel_name, goal, target_audience, brand_voice, default_style,
        call_to_action, banned_topics, visual_style, timezone
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        process.env.CHANNEL_NAME || 'My YouTube Channel',
        'Grow a trusted, useful YouTube channel',
        process.env.TARGET_AUDIENCE || 'General audience',
        'Clear, credible, and engaging',
        'explainer',
        'Subscribe for more useful videos.',
        '[]',
        'Clean, high-contrast, and readable',
        process.env.CHANNEL_TIMEZONE || 'America/Chicago'
      ]
    );
  }

  // Content Strategy methods
  async saveContentStrategy(strategy) {
    const id = this.generateId('strategy');
    await this.executeQuery(
      `INSERT INTO content_strategies (
        id, topic, angle, target_audience, content_type, keywords, 
        estimated_views, best_publish_time, competitor_analysis
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        strategy.topic,
        strategy.angle,
        strategy.targetAudience,
        strategy.contentType,
        JSON.stringify(strategy.keywords),
        strategy.estimatedViews,
        strategy.bestPublishTime,
        JSON.stringify(strategy.competitorAnalysis)
      ]
    );
    return id;
  }

  async getContentHistory() {
    const rows = await this.getAllRows('SELECT * FROM content_history ORDER BY publish_date DESC');
    return rows;
  }

  // Script methods
  async saveScript(script) {
    const id = this.generateId('script');
    await this.executeQuery(
      `INSERT INTO scripts (
        id, title, hook, introduction, main_content, conclusion, 
        call_to_action, full_script, duration, tone, pacing, keywords
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        script.title,
        JSON.stringify(script.hook),
        JSON.stringify(script.introduction),
        JSON.stringify(script.mainContent),
        JSON.stringify(script.conclusion),
        JSON.stringify(script.callToAction),
        script.fullScript,
        script.duration,
        script.tone,
        script.pacing,
        JSON.stringify(script.keywords)
      ]
    );
    return id;
  }

  // Thumbnail methods
  async saveThumbnail(thumbnail) {
    const id = this.generateId('thumbnail');
    await this.executeQuery(
      `INSERT INTO thumbnails (
        id, path, concept, prompt, dimensions, file_size
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        thumbnail.path,
        JSON.stringify(thumbnail.concept),
        thumbnail.prompt,
        JSON.stringify(thumbnail.dimensions),
        thumbnail.fileSize
      ]
    );
    return id;
  }

  // SEO methods
  async saveSEOData(seoData) {
    const id = this.generateId('seo');
    await this.executeQuery(
      `INSERT INTO seo_data (
        id, title, description, tags, hashtags, chapters, 
        end_screen, seo_score, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        seoData.title,
        seoData.description,
        JSON.stringify(seoData.tags),
        JSON.stringify(seoData.hashtags),
        JSON.stringify(seoData.chapters),
        JSON.stringify(seoData.endScreen),
        seoData.seoScore,
        JSON.stringify(seoData.metadata)
      ]
    );
    return id;
  }

  // Production methods
  async saveProductionData(production) {
    await this.executeQuery(
      `INSERT OR REPLACE INTO productions (
        id, status, assets, timeline, scheduled_publish_time, 
        priority, estimated_duration
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        production.id,
        production.status,
        JSON.stringify(production.assets),
        JSON.stringify(production.timeline),
        production.scheduledPublishTime,
        production.priority,
        production.estimatedDuration
      ]
    );
  
    return production.id;
  }

  async updateProductionData(production) {
    await this.executeQuery(
      `UPDATE productions SET 
        status = ?, assets = ?, timeline = ?, 
        scheduled_publish_time = ?, priority = ?
      WHERE id = ?`,
      [
        production.status,
        JSON.stringify(production.assets),
        JSON.stringify(production.timeline),
        production.scheduledPublishTime,
        production.priority,
        production.id
      ]
    );
  }

  async getProductionPipeline() {
    const rows = await this.getAllRows(
      'SELECT * FROM productions ORDER BY priority DESC, created_at ASC'
    );
    return rows.map(row => ({
      ...row,
      assets: JSON.parse(row.assets || '{}'),
      timeline: JSON.parse(row.timeline || '{}')
    }));
  }

  async saveProductionSnapshot(production) {
    await this.executeQuery(
      `INSERT OR REPLACE INTO production_snapshots (
        production_id, strategy, script, thumbnail, seo
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        production.id,
        JSON.stringify(production.strategy || {}),
        JSON.stringify(production.script || {}),
        JSON.stringify(production.thumbnail || {}),
        JSON.stringify(production.seo || {})
      ]
    );
  }

  async updateProductionStatus(productionId, status) {
    await this.executeQuery('UPDATE productions SET status = ? WHERE id = ?', [status, productionId]);
  }

  async getProductionBundle(productionId) {
    const row = await this.getRow(
      `SELECT p.*, ps.strategy, ps.script, ps.thumbnail, ps.seo,
              cr.status AS review_status, cr.editor_data, cr.quality_checks,
              cr.review_notes, cr.reviewed_at
       FROM productions p
       LEFT JOIN production_snapshots ps ON ps.production_id = p.id
       LEFT JOIN content_reviews cr ON cr.production_id = p.id
       WHERE p.id = ?`,
      [productionId]
    );
    if (!row) return null;

    const schedule = await this.getRow(
      'SELECT * FROM publish_schedule WHERE production_id = ? ORDER BY created_at DESC LIMIT 1',
      [productionId]
    );
    const provenance = await this.getContentProvenance(productionId);
    const discoverability = await this.getLatestDiscoverabilityAudit(productionId, 'youtube');
    const scenes = await this.listProductionScenes(productionId);
    const sceneRevisions = scenes.length ? await this.listProductionSceneRevisions(productionId, 50) : [];
    const shorts = await this.listShortClips(productionId);
    return {
      ...row,
      assets: JSON.parse(row.assets || '{}'),
      timeline: JSON.parse(row.timeline || '{}'),
      strategy: JSON.parse(row.strategy || '{}'),
      script: JSON.parse(row.script || '{}'),
      thumbnail: JSON.parse(row.thumbnail || '{}'),
      seo: JSON.parse(row.seo || '{}'),
      editorData: JSON.parse(row.editor_data || '{}'),
      qualityChecks: JSON.parse(row.quality_checks || '[]'),
      schedule: schedule ? { ...schedule, metadata: JSON.parse(schedule.metadata || '{}') } : null,
      provenance: provenance || {
        sources: [], claims: [], containsSyntheticMedia: false, status: 'not_required',
        summary: { sourceCount: 0, verifiedSources: 0, claimCount: 0, resolvedClaims: 0, highRiskClaims: 0, unresolvedClaims: 0 }
      },
      discoverability,
      scenes,
      sceneRevisions,
      shorts
    };
  }

  async getPipelineOverview(limit = 50) {
    const rows = await this.getAllRows(
      `SELECT p.id, p.status, p.assets, p.timeline, p.scheduled_publish_time,
              p.priority, p.estimated_duration, p.created_at,
              ps.strategy, ps.script, ps.seo,
              cr.status AS review_status, cr.quality_checks,
              sch.id AS schedule_id, sch.status AS schedule_status,
              sch.publish_time, sch.youtube_url, sch.error_message
       FROM productions p
       LEFT JOIN production_snapshots ps ON ps.production_id = p.id
       LEFT JOIN content_reviews cr ON cr.production_id = p.id
       LEFT JOIN publish_schedule sch ON sch.id = (
         SELECT id FROM publish_schedule WHERE production_id = p.id ORDER BY created_at DESC LIMIT 1
       )
       ORDER BY p.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows.map(row => {
      const strategy = JSON.parse(row.strategy || '{}');
      const script = JSON.parse(row.script || '{}');
      const seo = JSON.parse(row.seo || '{}');
      const assets = JSON.parse(row.assets || '{}');
      return {
        ...row,
        strategy,
        script,
        seo,
        assets,
        timeline: JSON.parse(row.timeline || '{}'),
        qualityChecks: JSON.parse(row.quality_checks || '[]'),
        title: seo.title || script.title || strategy.topic || row.id,
        topic: strategy.topic || '',
        hasVideo: Boolean(assets.finalVideo?.path && !assets.finalVideo?.simulated),
        hasThumbnail: Boolean(assets.thumbnail?.path)
      };
    });
  }

  async createGenerationJob(input = {}) {
    const id = this.generateId('job');
    const details = {
      strategyContext: input.strategyContext || {},
      resumeCount: 0,
      reusedStages: []
    };
    await this.executeQuery(
      `INSERT INTO generation_jobs (
        id, topic, style, length, source, status, stage, progress, details
      ) VALUES (?, ?, ?, ?, ?, 'queued', 'queued', 0, ?)`,
      [id, input.topic || null, input.style || null, input.length || 'medium', input.source || 'manual', JSON.stringify(details)]
    );
    return this.getGenerationJob(id);
  }

  async getGenerationJob(id) {
    const row = await this.getRow('SELECT * FROM generation_jobs WHERE id = ?', [id]);
    return row ? { ...row, details: JSON.parse(row.details || '{}'), cancelRequested: Boolean(row.cancel_requested) } : null;
  }

  async updateGenerationJob(id, changes = {}) {
    const current = await this.getGenerationJob(id);
    if (!current) return null;
    const details = { ...(current.details || {}), ...(changes.details || {}) };
    await this.executeQuery(
      `UPDATE generation_jobs SET status = ?, stage = ?, progress = ?, production_id = ?,
        title = ?, error = ?, details = ?, cancel_requested = ?, updated_at = datetime('now'),
        completed_at = ? WHERE id = ?`,
      [
        changes.status ?? current.status,
        changes.stage ?? current.stage,
        changes.progress ?? current.progress,
        changes.productionId ?? current.production_id,
        changes.title ?? current.title,
        changes.error === undefined ? current.error : changes.error,
        JSON.stringify(details),
        changes.cancelRequested === undefined ? current.cancel_requested : Number(changes.cancelRequested),
        changes.completedAt === undefined ? current.completed_at : changes.completedAt,
        id
      ]
    );
    return this.getGenerationJob(id);
  }

  async listGenerationJobs(limit = 30) {
    const rows = await this.getAllRows('SELECT * FROM generation_jobs ORDER BY created_at DESC LIMIT ?', [limit]);
    return Promise.all(rows.map(async row => {
      const job = { ...row, details: JSON.parse(row.details || '{}'), cancelRequested: Boolean(row.cancel_requested) };
      job.checkpoints = await this.listGenerationCheckpoints(job.id);
      job.mediaTasks = await this.listMediaGenerationTasks(job.id);
      return job;
    }));
  }

  async saveGenerationCheckpoint(jobId, stage, changes = {}) {
    const current = await this.getGenerationCheckpoint(jobId, stage);
    const artifact = changes.artifact === undefined ? current?.artifact : changes.artifact;
    const attemptCount = changes.incrementAttempt
      ? Number(current?.attempt_count || 0) + 1
      : changes.attemptCount ?? current?.attempt_count ?? 0;
    await this.executeQuery(
      `INSERT INTO generation_checkpoints (
        job_id, stage, status, artifact, attempt_count, error, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(job_id, stage) DO UPDATE SET
        status = excluded.status, artifact = excluded.artifact,
        attempt_count = excluded.attempt_count, error = excluded.error,
        started_at = excluded.started_at, completed_at = excluded.completed_at,
        updated_at = datetime('now')`,
      [
        jobId,
        stage,
        changes.status ?? current?.status ?? 'pending',
        artifact === undefined ? null : JSON.stringify(artifact),
        attemptCount,
        changes.error === undefined ? current?.error ?? null : changes.error,
        changes.startedAt === undefined ? current?.started_at ?? null : changes.startedAt,
        changes.completedAt === undefined ? current?.completed_at ?? null : changes.completedAt
      ]
    );
    return this.getGenerationCheckpoint(jobId, stage);
  }

  async getGenerationCheckpoint(jobId, stage) {
    const row = await this.getRow(
      'SELECT * FROM generation_checkpoints WHERE job_id = ? AND stage = ?',
      [jobId, stage]
    );
    return row ? { ...row, artifact: JSON.parse(row.artifact || 'null') } : null;
  }

  async listGenerationCheckpoints(jobId) {
    const rows = await this.getAllRows(
      'SELECT * FROM generation_checkpoints WHERE job_id = ? ORDER BY updated_at, stage',
      [jobId]
    );
    return rows.map(row => ({ ...row, artifact: JSON.parse(row.artifact || 'null') }));
  }

  async deleteGenerationCheckpoints(jobId, stages = []) {
    if (!stages.length) return;
    const placeholders = stages.map(() => '?').join(', ');
    await this.executeQuery(
      `DELETE FROM generation_checkpoints WHERE job_id = ? AND stage IN (${placeholders})`,
      [jobId, ...stages]
    );
  }

  async createMediaGenerationTask(input = {}) {
    const id = this.generateId('media');
    await this.executeQuery(
      `INSERT INTO media_generation_tasks (
        id, job_id, production_id, scene_index, provider, model, status, request, provider_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')
      ON CONFLICT(job_id, scene_index, provider) DO UPDATE SET
        production_id = excluded.production_id, request = excluded.request, updated_at = datetime('now')`,
      [id, input.jobId || null, input.productionId || null, input.sceneIndex, input.provider, input.model, input.status || 'submitting', JSON.stringify(input.request || {})]
    );
    return this.findMediaGenerationTask(input.jobId, input.sceneIndex, input.provider);
  }

  async findMediaGenerationTask(jobId, sceneIndex, provider) {
    const row = await this.getRow(
      'SELECT * FROM media_generation_tasks WHERE job_id IS ? AND scene_index = ? AND provider = ?',
      [jobId || null, sceneIndex, provider]
    );
    return this.parseMediaGenerationTask(row);
  }

  async updateMediaGenerationTask(id, changes = {}) {
    const current = this.parseMediaGenerationTask(await this.getRow('SELECT * FROM media_generation_tasks WHERE id = ?', [id]));
    if (!current) return null;
    await this.executeQuery(
      `UPDATE media_generation_tasks SET model = ?, external_task_id = ?, status = ?, provider_data = ?,
       output_path = ?, error = ?, completed_at = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        changes.model ?? current.model,
        changes.externalTaskId ?? current.external_task_id,
        changes.status ?? current.status,
        JSON.stringify(changes.providerData ?? current.providerData ?? {}),
        changes.outputPath ?? current.output_path,
        changes.error === undefined ? current.error : changes.error,
        changes.completedAt === undefined ? current.completed_at : changes.completedAt,
        id
      ]
    );
    return this.parseMediaGenerationTask(await this.getRow('SELECT * FROM media_generation_tasks WHERE id = ?', [id]));
  }

  async listMediaGenerationTasks(jobId) {
    const rows = await this.getAllRows('SELECT * FROM media_generation_tasks WHERE job_id = ? ORDER BY scene_index, created_at', [jobId]);
    return rows.map(row => this.parseMediaGenerationTask(row));
  }

  parseMediaGenerationTask(row) {
    return row ? {
      ...row,
      request: JSON.parse(row.request || '{}'),
      providerData: JSON.parse(row.provider_data || '{}')
    } : null;
  }

  async replaceProductionScenes(productionId, scenes = []) {
    await this.executeQuery('DELETE FROM production_scenes WHERE production_id = ?', [productionId]);
    for (const [position, scene] of scenes.entries()) {
      const id = scene.id || this.generateId('scene');
      await this.executeQuery(
        `INSERT INTO production_scenes (
          id, production_id, position, label, script_text, prompt, duration,
          asset_type, asset_origin, asset_path, audio_path,
          narration_provider, narration_model, narration_task_id, narration_error,
          narration_generated_at, narration_cost, provider, model,
          external_task_id, status, narration_status, revision, locked,
          rights_confirmed, provenance_source_ids, contains_synthetic_media,
          estimated_cost, actual_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, productionId, position, scene.label, scene.scriptText || '', scene.prompt || '', scene.duration,
          scene.assetType || 'missing', scene.assetOrigin || 'generated', scene.assetPath || null,
          scene.audioPath || null, scene.narrationProvider || null, scene.narrationModel || null,
          scene.narrationTaskId || null, scene.narrationError || null, scene.narrationGeneratedAt || null,
          JSON.stringify(scene.narrationCost || {}), scene.provider || null, scene.model || null, scene.externalTaskId || null,
          scene.status || 'ready', scene.narrationStatus || 'current', scene.revision || 1,
          scene.locked ? 1 : 0, scene.rightsConfirmed ? 1 : 0,
          JSON.stringify(scene.provenanceSourceIds || []), scene.containsSyntheticMedia ? 1 : 0,
          JSON.stringify(scene.estimatedCost || {}), JSON.stringify(scene.actualCost || {})
        ]
      );
    }
    return this.listProductionScenes(productionId);
  }

  async listProductionScenes(productionId) {
    const rows = await this.getAllRows(
      'SELECT * FROM production_scenes WHERE production_id = ? ORDER BY position, created_at',
      [productionId]
    );
    return rows.map(row => this.parseProductionScene(row));
  }

  async getProductionScene(productionId, sceneId) {
    return this.parseProductionScene(await this.getRow(
      'SELECT * FROM production_scenes WHERE production_id = ? AND id = ?',
      [productionId, sceneId]
    ));
  }

  async updateProductionScene(productionId, sceneId, changes = {}) {
    const current = await this.getProductionScene(productionId, sceneId);
    if (!current) return null;
    const next = { ...current, ...changes };
    await this.executeQuery(
      `UPDATE production_scenes SET
        position = ?, label = ?, script_text = ?, prompt = ?, duration = ?,
        asset_type = ?, asset_origin = ?, asset_path = ?, audio_path = ?,
        narration_provider = ?, narration_model = ?, narration_task_id = ?, narration_error = ?,
        narration_generated_at = ?, narration_cost = ?, provider = ?,
        model = ?, external_task_id = ?, status = ?, narration_status = ?, revision = ?,
        locked = ?, rights_confirmed = ?, provenance_source_ids = ?,
        contains_synthetic_media = ?, estimated_cost = ?, actual_cost = ?,
        updated_at = datetime('now')
       WHERE production_id = ? AND id = ?`,
      [
        next.position, next.label, next.scriptText || '', next.prompt || '', next.duration,
        next.assetType || 'missing', next.assetOrigin || 'generated', next.assetPath || null,
        next.audioPath || null, next.narrationProvider || null, next.narrationModel || null,
        next.narrationTaskId || null, next.narrationError || null, next.narrationGeneratedAt || null,
        JSON.stringify(next.narrationCost || {}), next.provider || null, next.model || null, next.externalTaskId || null,
        next.status || 'ready', next.narrationStatus || 'current', next.revision || 1,
        next.locked ? 1 : 0, next.rightsConfirmed ? 1 : 0,
        JSON.stringify(next.provenanceSourceIds || []), next.containsSyntheticMedia ? 1 : 0,
        JSON.stringify(next.estimatedCost || {}), JSON.stringify(next.actualCost || {}),
        productionId, sceneId
      ]
    );
    return this.getProductionScene(productionId, sceneId);
  }

  async reorderProductionScenes(productionId, orderedIds = []) {
    const scenes = await this.listProductionScenes(productionId);
    if (orderedIds.length !== scenes.length || new Set(orderedIds).size !== scenes.length ||
      scenes.some(scene => !orderedIds.includes(scene.id))) {
      throw new Error('Scene order must contain every scene exactly once');
    }
    // Move through temporary negative positions to preserve the unique constraint.
    for (const scene of scenes) {
      await this.executeQuery('UPDATE production_scenes SET position = ? WHERE id = ?', [-(scene.position + 1), scene.id]);
    }
    for (const [position, sceneId] of orderedIds.entries()) {
      await this.executeQuery(
        `UPDATE production_scenes SET position = ?, status = 'needs_rebuild', updated_at = datetime('now') WHERE id = ?`,
        [position, sceneId]
      );
    }
    return this.listProductionScenes(productionId);
  }

  async saveProductionSceneRevision(input = {}) {
    const id = this.generateId('scene_revision');
    await this.executeQuery(
      `INSERT INTO production_scene_revisions (
        id, production_id, scene_id, action, status, before_state, after_state,
        cost_evidence, error, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.productionId, input.sceneId, input.action, input.status || 'completed',
        JSON.stringify(input.before || {}), JSON.stringify(input.after || {}),
        JSON.stringify(input.costEvidence || {}), input.error || null,
        input.completedAt || new Date().toISOString()
      ]
    );
    return this.getProductionSceneRevision(id);
  }

  async getProductionSceneRevision(id) {
    return this.parseProductionSceneRevision(await this.getRow('SELECT * FROM production_scene_revisions WHERE id = ?', [id]));
  }

  async listProductionSceneRevisions(productionId, limit = 100) {
    const rows = await this.getAllRows(
      'SELECT * FROM production_scene_revisions WHERE production_id = ? ORDER BY created_at DESC LIMIT ?',
      [productionId, limit]
    );
    return rows.map(row => this.parseProductionSceneRevision(row));
  }

  parseProductionScene(row) {
    if (!row) return null;
    return {
      ...row,
      position: Number(row.position),
      duration: Number(row.duration),
      scriptText: row.script_text || '',
      assetType: row.asset_type || 'missing',
      assetOrigin: row.asset_origin || 'generated',
      assetPath: row.asset_path || null,
      audioPath: row.audio_path || null,
      narrationProvider: row.narration_provider || null,
      narrationModel: row.narration_model || null,
      narrationTaskId: row.narration_task_id || null,
      narrationError: row.narration_error || null,
      narrationGeneratedAt: row.narration_generated_at || null,
      narrationCost: JSON.parse(row.narration_cost || '{}'),
      externalTaskId: row.external_task_id || null,
      narrationStatus: row.narration_status || 'current',
      revision: Number(row.revision || 1),
      locked: Boolean(row.locked),
      rightsConfirmed: Boolean(row.rights_confirmed),
      provenanceSourceIds: JSON.parse(row.provenance_source_ids || '[]'),
      containsSyntheticMedia: Boolean(row.contains_synthetic_media),
      estimatedCost: JSON.parse(row.estimated_cost || '{}'),
      actualCost: JSON.parse(row.actual_cost || '{}')
    };
  }

  parseProductionSceneRevision(row) {
    return row ? {
      ...row,
      before: JSON.parse(row.before_state || '{}'),
      after: JSON.parse(row.after_state || '{}'),
      costEvidence: JSON.parse(row.cost_evidence || '{}')
    } : null;
  }

  async replaceShortClips(productionId, clips = []) {
    await this.executeQuery('DELETE FROM shorts_clips WHERE production_id = ?', [productionId]);
    for (const [position, clip] of clips.entries()) {
      const id = clip.id || this.generateId('short');
      await this.executeQuery(
        `INSERT INTO shorts_clips (
          id, production_id, position, title, description, tags, source_scene_ids,
          start_seconds, duration, layout, rationale, status, output_path, captions_path,
          publish_time, privacy_status, inherited_evidence, rendered_at, approved_at,
          schedule_id, youtube_id, youtube_url, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, productionId, position, clip.title, clip.description || '', JSON.stringify(clip.tags || []),
          JSON.stringify(clip.sourceSceneIds || []), Number(clip.startSeconds || 0), Number(clip.duration || 30),
          clip.layout || 'blur', clip.rationale || null, clip.status || 'proposed', clip.outputPath || null,
          clip.captionsPath || null, clip.publishTime || null, clip.privacyStatus || 'private',
          JSON.stringify(clip.inheritedEvidence || {}), clip.renderedAt || null, clip.approvedAt || null,
          clip.scheduleId || null, clip.youtubeId || null, clip.youtubeUrl || null, clip.error || null
        ]
      );
    }
    return this.listShortClips(productionId);
  }

  async listShortClips(productionId) {
    const rows = await this.getAllRows(
      'SELECT * FROM shorts_clips WHERE production_id = ? ORDER BY position, created_at',
      [productionId]
    );
    return rows.map(row => this.parseShortClip(row));
  }

  async getShortClip(id) {
    return this.parseShortClip(await this.getRow('SELECT * FROM shorts_clips WHERE id = ?', [id]));
  }

  async updateShortClip(id, changes = {}) {
    const current = await this.getShortClip(id);
    if (!current) return null;
    const next = { ...current, ...changes };
    await this.executeQuery(
      `UPDATE shorts_clips SET
        title = ?, description = ?, tags = ?, source_scene_ids = ?, start_seconds = ?,
        duration = ?, layout = ?, rationale = ?, status = ?, output_path = ?, captions_path = ?,
        publish_time = ?, privacy_status = ?, inherited_evidence = ?, rendered_at = ?, approved_at = ?,
        schedule_id = ?, youtube_id = ?, youtube_url = ?, error = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        next.title, next.description || '', JSON.stringify(next.tags || []), JSON.stringify(next.sourceSceneIds || []),
        Number(next.startSeconds || 0), Number(next.duration || 30), next.layout || 'blur', next.rationale || null,
        next.status || 'proposed', next.outputPath || null, next.captionsPath || null, next.publishTime || null,
        next.privacyStatus || 'private', JSON.stringify(next.inheritedEvidence || {}), next.renderedAt || null,
        next.approvedAt || null, next.scheduleId || null, next.youtubeId || null, next.youtubeUrl || null,
        next.error || null, id
      ]
    );
    return this.getShortClip(id);
  }

  parseShortClip(row) {
    if (!row) return null;
    return {
      ...row,
      productionId: row.production_id,
      position: Number(row.position),
      tags: JSON.parse(row.tags || '[]'),
      sourceSceneIds: JSON.parse(row.source_scene_ids || '[]'),
      startSeconds: Number(row.start_seconds || 0),
      duration: Number(row.duration || 0),
      outputPath: row.output_path || null,
      captionsPath: row.captions_path || null,
      publishTime: row.publish_time || null,
      privacyStatus: row.privacy_status || 'private',
      inheritedEvidence: JSON.parse(row.inherited_evidence || '{}'),
      renderedAt: row.rendered_at || null,
      approvedAt: row.approved_at || null,
      scheduleId: row.schedule_id || null,
      youtubeId: row.youtube_id || null,
      youtubeUrl: row.youtube_url || null
    };
  }

  async markInterruptedJobs() {
    await this.executeQuery(
      `UPDATE generation_jobs SET status = 'interrupted',
       error = 'The application restarted before this job finished', updated_at = datetime('now'),
       completed_at = datetime('now') WHERE status IN ('queued', 'running')`
    );
    await this.executeQuery(
      `UPDATE operator_runs SET status = 'interrupted', stage = 'interrupted',
       error = 'The application restarted before this operator run finished', updated_at = datetime('now'),
       completed_at = datetime('now') WHERE status IN ('queued', 'running', 'cancelling')`
    );
  }

  async saveContentReview(productionId, review = {}) {
    await this.executeQuery(
      `INSERT INTO content_reviews (
        production_id, status, editor_data, quality_checks, review_notes, reviewed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(production_id) DO UPDATE SET
        status = excluded.status, editor_data = excluded.editor_data,
        quality_checks = excluded.quality_checks, review_notes = excluded.review_notes,
        reviewed_at = excluded.reviewed_at, updated_at = datetime('now')`,
      [
        productionId,
        review.status || 'needs_review',
        JSON.stringify(review.editorData || {}),
        JSON.stringify(review.qualityChecks || []),
        review.reviewNotes || null,
        review.reviewedAt || null
      ]
    );
    return this.getProductionBundle(productionId);
  }

  async saveContentProvenance(productionId, provenance = {}) {
    await this.executeQuery(
      `INSERT INTO content_provenance (
        production_id, sources, claims, contains_synthetic_media, status, summary, reviewed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(production_id) DO UPDATE SET
        sources = excluded.sources, claims = excluded.claims,
        contains_synthetic_media = excluded.contains_synthetic_media,
        status = excluded.status, summary = excluded.summary,
        reviewed_at = excluded.reviewed_at, updated_at = datetime('now')`,
      [
        productionId,
        JSON.stringify(provenance.sources || []),
        JSON.stringify(provenance.claims || []),
        Number(provenance.containsSyntheticMedia === true),
        provenance.status || 'not_required',
        JSON.stringify(provenance.summary || {}),
        provenance.reviewedAt || null
      ]
    );
    return this.getContentProvenance(productionId);
  }

  async getContentProvenance(productionId) {
    const row = await this.getRow('SELECT * FROM content_provenance WHERE production_id = ?', [productionId]);
    return row ? {
      ...row,
      sources: JSON.parse(row.sources || '[]'),
      claims: JSON.parse(row.claims || '[]'),
      containsSyntheticMedia: Boolean(row.contains_synthetic_media),
      summary: JSON.parse(row.summary || '{}'),
      reviewedAt: row.reviewed_at
    } : null;
  }

  async saveDiscoverabilityAudit(productionId, platform, report = {}) {
    const auditId = this.generateId('discoverability');
    const findings = Array.isArray(report.findings) ? report.findings : [];
    await this.executeQuery('BEGIN TRANSACTION');
    try {
      await this.executeQuery(
        `INSERT INTO discoverability_audits (
          id, production_id, platform, mode, engine, engine_version,
          schema_version, status, summary, error_code, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auditId,
          productionId,
          platform || 'youtube',
          report.mode || 'content',
          report.engine?.name || 'darkzseo',
          report.engine?.version || null,
          report.schemaVersion || null,
          report.status || 'unavailable',
          JSON.stringify(report.summary || {}),
          report.errorCode || null,
          report.error || null
        ]
      );

      for (const finding of findings) {
        const previous = await this.getRow(
          `SELECT df.review_status, df.review_reason, df.reviewed_at
           FROM discoverability_findings df
           JOIN discoverability_audits da ON da.id = df.audit_id
           WHERE da.production_id = ? AND da.platform = ? AND df.fingerprint = ?
           ORDER BY df.created_at DESC, df.rowid DESC LIMIT 1`,
          [productionId, platform || 'youtube', finding.fingerprint]
        );
        await this.executeQuery(
          `INSERT INTO discoverability_findings (
            id, audit_id, rule_id, category, severity, applicability,
            message, remediation, fingerprint, review_status, review_reason, reviewed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.generateId('finding'), auditId, finding.ruleId, finding.category,
            finding.severity, JSON.stringify(finding.applicability || []), finding.message,
            finding.remediation || null, finding.fingerprint,
            previous?.review_status || 'pending', previous?.review_reason || null,
            previous?.reviewed_at || null
          ]
        );
      }
      await this.executeQuery('COMMIT');
    } catch (error) {
      await this.executeQuery('ROLLBACK');
      throw error;
    }
    return this.getDiscoverabilityAudit(auditId);
  }

  async getDiscoverabilityAudit(auditId) {
    const row = await this.getRow('SELECT * FROM discoverability_audits WHERE id = ?', [auditId]);
    if (!row) return null;
    const findings = await this.getAllRows(
      'SELECT * FROM discoverability_findings WHERE audit_id = ? ORDER BY CASE severity WHEN \'CRITICAL\' THEN 0 WHEN \'HIGH\' THEN 1 WHEN \'MEDIUM\' THEN 2 WHEN \'LOW\' THEN 3 ELSE 4 END, created_at ASC',
      [auditId]
    );
    return this.deserializeDiscoverabilityAudit(row, findings);
  }

  async getLatestDiscoverabilityAudit(productionId, platform = 'youtube') {
    const row = await this.getRow(
      `SELECT * FROM discoverability_audits
       WHERE production_id = ? AND platform = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      [productionId, platform]
    );
    if (!row) return null;
    const findings = await this.getAllRows(
      'SELECT * FROM discoverability_findings WHERE audit_id = ? ORDER BY CASE severity WHEN \'CRITICAL\' THEN 0 WHEN \'HIGH\' THEN 1 WHEN \'MEDIUM\' THEN 2 WHEN \'LOW\' THEN 3 ELSE 4 END, created_at ASC',
      [row.id]
    );
    return this.deserializeDiscoverabilityAudit(row, findings);
  }

  deserializeDiscoverabilityAudit(row, findings = []) {
    const parsedFindings = findings.map(finding => ({
      ...finding,
      ruleId: finding.rule_id,
      applicability: JSON.parse(finding.applicability || '[]'),
      reviewStatus: finding.review_status,
      reviewReason: finding.review_reason,
      reviewedAt: finding.reviewed_at
    }));
    return {
      ...row,
      productionId: row.production_id,
      engineVersion: row.engine_version,
      schemaVersion: row.schema_version,
      errorCode: row.error_code,
      summary: JSON.parse(row.summary || '{}'),
      findings: parsedFindings,
      pendingCount: parsedFindings.filter(finding => finding.reviewStatus === 'pending').length
    };
  }

  async getDiscoverabilityFinding(findingId) {
    const row = await this.getRow(
      `SELECT df.*, da.production_id, da.platform
       FROM discoverability_findings df
       JOIN discoverability_audits da ON da.id = df.audit_id WHERE df.id = ?`,
      [findingId]
    );
    return row ? {
      ...row,
      ruleId: row.rule_id,
      applicability: JSON.parse(row.applicability || '[]'),
      reviewStatus: row.review_status,
      reviewReason: row.review_reason,
      reviewedAt: row.reviewed_at
    } : null;
  }

  async reviewDiscoverabilityFinding(findingId, status, reason) {
    await this.executeQuery(
      `UPDATE discoverability_findings SET review_status = ?, review_reason = ?, reviewed_at = datetime('now')
       WHERE id = ?`,
      [status, reason || null, findingId]
    );
    return this.getDiscoverabilityFinding(findingId);
  }

  async getChannelProfile() {
    const row = await this.getRow("SELECT * FROM channel_profiles WHERE id = 'default'");
    return row ? { ...row, bannedTopics: JSON.parse(row.banned_topics || '[]') } : null;
  }

  async saveChannelProfile(profile) {
    const current = await this.getChannelProfile() || {};
    await this.executeQuery(
      `INSERT OR REPLACE INTO channel_profiles (
        id, channel_name, goal, target_audience, brand_voice, default_style,
        call_to_action, banned_topics, visual_style, timezone, created_at, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))`,
      [
        profile.channelName ?? current.channel_name ?? '',
        profile.goal ?? current.goal ?? '',
        profile.targetAudience ?? current.target_audience ?? '',
        profile.brandVoice ?? current.brand_voice ?? '',
        profile.defaultStyle ?? current.default_style ?? 'explainer',
        profile.callToAction ?? current.call_to_action ?? '',
        JSON.stringify(profile.bannedTopics ?? current.bannedTopics ?? []),
        profile.visualStyle ?? current.visual_style ?? '',
        profile.timezone ?? current.timezone ?? 'America/Chicago',
        current.created_at || null
      ]
    );
    return this.getChannelProfile();
  }

  async createContentIdea(idea) {
    const id = this.generateId('idea');
    await this.executeQuery(
      `INSERT INTO content_ideas (id, topic, angle, style, status, rationale, scheduled_for)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, idea.topic, idea.angle || null, idea.style || 'explainer', idea.status || 'backlog', idea.rationale || null, idea.scheduledFor || null]
    );
    return this.getRow('SELECT * FROM content_ideas WHERE id = ?', [id]);
  }

  async listContentIdeas() {
    return this.getAllRows("SELECT * FROM content_ideas WHERE status != 'archived' ORDER BY COALESCE(scheduled_for, '9999-12-31'), created_at DESC");
  }

  async updateContentIdea(id, changes) {
    const current = await this.getRow('SELECT * FROM content_ideas WHERE id = ?', [id]);
    if (!current) return null;
    await this.executeQuery(
      `UPDATE content_ideas SET topic = ?, angle = ?, style = ?, status = ?,
       rationale = ?, scheduled_for = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        changes.topic ?? current.topic,
        changes.angle ?? current.angle,
        changes.style ?? current.style,
        changes.status ?? current.status,
        changes.rationale ?? current.rationale,
        changes.scheduledFor === undefined ? current.scheduled_for : changes.scheduledFor,
        id
      ]
    );
    return this.getRow('SELECT * FROM content_ideas WHERE id = ?', [id]);
  }

  async getChannelStrategy() {
    const row = await this.getRow("SELECT * FROM channel_strategies WHERE id = 'default'");
    return row ? this.deserializeChannelStrategy(row) : null;
  }

  async saveChannelStrategy(strategy) {
    const current = await this.getChannelStrategy() || {};
    await this.executeQuery(
      `INSERT INTO channel_strategies (
        id, objective, audience, value_proposition, content_pillars, cadence_per_week,
        videos_per_run, default_format, default_length, success_metric, primary_kpi,
        target_value, target_window_days, monthly_budget, outcome_currency, constraints,
        status, created_at, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        objective = excluded.objective, audience = excluded.audience,
        value_proposition = excluded.value_proposition, content_pillars = excluded.content_pillars,
        cadence_per_week = excluded.cadence_per_week, videos_per_run = excluded.videos_per_run,
        default_format = excluded.default_format, default_length = excluded.default_length,
        success_metric = excluded.success_metric, primary_kpi = excluded.primary_kpi,
        target_value = excluded.target_value, target_window_days = excluded.target_window_days,
        monthly_budget = excluded.monthly_budget, outcome_currency = excluded.outcome_currency,
        constraints = excluded.constraints,
        status = excluded.status, updated_at = datetime('now')`,
      [
        strategy.objective ?? current.objective ?? '',
        strategy.audience ?? current.audience ?? '',
        strategy.valueProposition ?? current.value_proposition ?? '',
        JSON.stringify(strategy.contentPillars ?? current.contentPillars ?? []),
        strategy.cadencePerWeek ?? current.cadence_per_week ?? 1,
        strategy.videosPerRun ?? current.videos_per_run ?? 1,
        strategy.defaultFormat ?? current.default_format ?? 'explainer',
        strategy.defaultLength ?? current.default_length ?? 'medium',
        strategy.successMetric ?? current.success_metric ?? '',
        strategy.primaryKpi ?? current.primary_kpi ?? 'views',
        strategy.targetValue ?? current.target_value ?? null,
        strategy.targetWindowDays ?? current.target_window_days ?? 28,
        strategy.monthlyBudget ?? current.monthly_budget ?? null,
        strategy.outcomeCurrency ?? current.outcome_currency ?? 'USD',
        strategy.constraints ?? current.constraints ?? '',
        strategy.status ?? current.status ?? 'draft',
        current.created_at || null
      ]
    );
    return this.getChannelStrategy();
  }

  deserializeChannelStrategy(row) {
    return {
      ...row,
      contentPillars: JSON.parse(row.content_pillars || '[]')
    };
  }

  async createOperatorRun(strategyId = 'default') {
    const id = this.generateId('operator');
    await this.executeQuery(
      `INSERT INTO operator_runs (id, strategy_id, research, plan, generated_jobs, summary)
       VALUES (?, ?, '{}', '[]', '[]', '{}')`,
      [id, strategyId]
    );
    return this.getOperatorRun(id);
  }

  async getOperatorRun(id) {
    const row = await this.getRow('SELECT * FROM operator_runs WHERE id = ?', [id]);
    return row ? this.deserializeOperatorRun(row) : null;
  }

  async getActiveOperatorRun() {
    const row = await this.getRow(
      "SELECT * FROM operator_runs WHERE status IN ('queued', 'running', 'cancelling') ORDER BY created_at DESC LIMIT 1"
    );
    return row ? this.deserializeOperatorRun(row) : null;
  }

  async listOperatorRuns(limit = 10) {
    const rows = await this.getAllRows('SELECT * FROM operator_runs ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map(row => this.deserializeOperatorRun(row));
  }

  async updateOperatorRun(id, changes = {}) {
    const current = await this.getOperatorRun(id);
    if (!current) return null;
    await this.executeQuery(
      `UPDATE operator_runs SET status = ?, stage = ?, progress = ?, research = ?, plan = ?,
       generated_jobs = ?, summary = ?, error = ?, cancel_requested = ?,
       updated_at = datetime('now'), completed_at = ? WHERE id = ?`,
      [
        changes.status ?? current.status,
        changes.stage ?? current.stage,
        changes.progress ?? current.progress,
        JSON.stringify(changes.research ?? current.research ?? {}),
        JSON.stringify(changes.plan ?? current.plan ?? []),
        JSON.stringify(changes.generatedJobs ?? current.generatedJobs ?? []),
        JSON.stringify(changes.summary ?? current.summary ?? {}),
        changes.error === undefined ? current.error : changes.error,
        changes.cancelRequested === undefined ? current.cancel_requested : Number(changes.cancelRequested),
        changes.completedAt === undefined ? current.completed_at : changes.completedAt,
        id
      ]
    );
    return this.getOperatorRun(id);
  }

  deserializeOperatorRun(row) {
    return {
      ...row,
      research: JSON.parse(row.research || '{}'),
      plan: JSON.parse(row.plan || '[]'),
      generatedJobs: JSON.parse(row.generated_jobs || '[]'),
      summary: JSON.parse(row.summary || '{}'),
      cancelRequested: Boolean(row.cancel_requested)
    };
  }

  async createNotification(notification) {
    const id = this.generateId('notice');
    await this.executeQuery(
      `INSERT INTO notifications (id, type, level, title, message, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, notification.type || 'system', notification.level || 'info', notification.title, notification.message, JSON.stringify(notification.data || {})]
    );
    return id;
  }

  async listNotifications(limit = 20) {
    const rows = await this.getAllRows('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map(row => ({ ...row, data: JSON.parse(row.data || '{}') }));
  }

  async markNotificationRead(id) {
    await this.executeQuery("UPDATE notifications SET status = 'read' WHERE id = ?", [id]);
  }

  async getRecentAutomationEvents(limit = 30) {
    const rows = await this.getAllRows('SELECT * FROM automation_events ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map(row => ({ ...row, data: JSON.parse(row.data || '{}') }));
  }

  // Publishing methods
  async saveScheduleEntry(entry) {
    const existing = await this.getLatestScheduleEntry(entry.productionId);
    if (existing) return existing;
    const id = this.generateId('schedule');
    entry.id = id;
    
    await this.executeQuery(
      `INSERT INTO publish_schedule (
        id, production_id, title, publish_time, status, 
        priority, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.productionId,
        entry.title,
        entry.publishTime,
        entry.status,
        entry.priority,
        JSON.stringify(entry.metadata)
      ]
    );
    
    return entry;
  }

  async updateScheduleEntry(entry) {
    await this.executeQuery(
      `UPDATE publish_schedule SET 
        title = COALESCE(?, title), publish_time = COALESCE(?, publish_time),
        status = ?, priority = COALESCE(?, priority), metadata = COALESCE(?, metadata),
        youtube_id = ?, youtube_url = ?, published_at = ?, error_message = ?
      WHERE id = ?`,
      [
        entry.title || null,
        entry.publishTime || entry.publish_time || null,
        entry.status,
        entry.priority ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.youtubeId || null,
        entry.youtubeUrl || null,
        entry.publishedAt || null,
        entry.error || null,
        entry.id
      ]
    );
  }

  async getLatestScheduleEntry(productionId) {
    const row = await this.getRow(
      'SELECT * FROM publish_schedule WHERE production_id = ? ORDER BY created_at DESC LIMIT 1',
      [productionId]
    );
    return row ? this.deserializeScheduleEntry(row) : null;
  }

  deserializeScheduleEntry(row) {
    return {
      ...row,
      productionId: row.production_id,
      publishTime: row.publish_time,
      youtubeId: row.youtube_id,
      youtubeUrl: row.youtube_url,
      publishedAt: row.published_at,
      error: row.error_message,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }

  async getPublishQueue() {
    const rows = await this.getAllRows(
      `SELECT * FROM publish_schedule
       WHERE status IN ('scheduled', 'paused')
       ORDER BY publish_time ASC`
    );

    return rows.map(row => this.deserializeScheduleEntry(row));
  }

  async getUpcomingSchedule(days = 7) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    const rows = await this.getAllRows(
      `SELECT * FROM publish_schedule 
       WHERE publish_time BETWEEN datetime('now') AND datetime(?)
       ORDER BY publish_time ASC`,
      [endDate.toISOString()]
    );
    
    return rows.map(row => this.deserializeScheduleEntry(row));
  }

  // Analytics methods
  async saveAnalyticsReport(report) {
    const id = this.generateId('analytics');
    
    await this.executeQuery(
      `INSERT INTO analytics_reports (
        id, video_id, youtube_id, video_details, analytics_data,
        thumbnail_metrics, seo_metrics, insights, performance_score,
        performance_grade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        report.videoId,
        report.youtubeId || null,
        JSON.stringify(report.videoDetails),
        JSON.stringify(report.analytics),
        JSON.stringify(report.thumbnailMetrics),
        JSON.stringify(report.seoMetrics),
        JSON.stringify(report.insights),
        report.performance.score,
        report.performance.grade
      ]
    );
    
    return id;
  }

  async getAnalyticsHistory() {
    const rows = await this.getAllRows(
      'SELECT * FROM analytics_reports ORDER BY analyzed_at DESC'
    );
    
    return rows.map(row => ({
      ...row,
      videoDetails: JSON.parse(row.video_details || '{}'),
      analytics: JSON.parse(row.analytics_data || '{}'),
      thumbnailMetrics: JSON.parse(row.thumbnail_metrics || '{}'),
      seoMetrics: JSON.parse(row.seo_metrics || '{}'),
      insights: JSON.parse(row.insights || '[]')
    }));
  }

  async savePerformanceSnapshot(snapshot) {
    const existing = await this.getRow(
      'SELECT id FROM performance_snapshots WHERE video_id = ? AND measurement_window = ?',
      [snapshot.videoId, snapshot.measurementWindow]
    );
    const id = existing?.id || this.generateId('snapshot');
    await this.executeQuery(
      `INSERT INTO performance_snapshots (
        id, video_id, production_id, measurement_window, published_at, metrics,
        content_attributes, baseline, deltas, confidence, simulated, measured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id, measurement_window) DO UPDATE SET
        production_id = excluded.production_id,
        published_at = excluded.published_at,
        metrics = excluded.metrics,
        content_attributes = excluded.content_attributes,
        baseline = excluded.baseline,
        deltas = excluded.deltas,
        confidence = excluded.confidence,
        simulated = excluded.simulated,
        measured_at = excluded.measured_at`,
      [
        id,
        snapshot.videoId,
        snapshot.productionId || null,
        snapshot.measurementWindow,
        snapshot.publishedAt || null,
        JSON.stringify(snapshot.metrics || {}),
        JSON.stringify(snapshot.contentAttributes || {}),
        JSON.stringify(snapshot.baseline || {}),
        JSON.stringify(snapshot.deltas || {}),
        snapshot.confidence || 'low',
        snapshot.simulated ? 1 : 0,
        snapshot.measuredAt || new Date().toISOString()
      ]
    );
    return this.getPerformanceSnapshot(id);
  }

  async getPerformanceSnapshot(id) {
    const row = await this.getRow('SELECT * FROM performance_snapshots WHERE id = ?', [id]);
    return this.parsePerformanceSnapshot(row);
  }

  async listPerformanceSnapshots(options = {}) {
    const conditions = [];
    const params = [];
    if (options.videoId) {
      conditions.push('video_id = ?');
      params.push(options.videoId);
    }
    if (options.excludeVideoId) {
      conditions.push('video_id != ?');
      params.push(options.excludeVideoId);
    }
    if (options.measurementWindow) {
      conditions.push('measurement_window = ?');
      params.push(options.measurementWindow);
    }
    if (options.reliableOnly) conditions.push('simulated = 0');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.getAllRows(
      `SELECT * FROM performance_snapshots ${where} ORDER BY measured_at DESC`,
      params
    );
    return rows.map(row => this.parsePerformanceSnapshot(row));
  }

  parsePerformanceSnapshot(row) {
    if (!row) return null;
    return {
      ...row,
      videoId: row.video_id,
      productionId: row.production_id,
      measurementWindow: row.measurement_window,
      publishedAt: row.published_at,
      measuredAt: row.measured_at,
      simulated: Boolean(row.simulated),
      metrics: JSON.parse(row.metrics || '{}'),
      contentAttributes: JSON.parse(row.content_attributes || '{}'),
      baseline: JSON.parse(row.baseline || '{}'),
      deltas: JSON.parse(row.deltas || '{}')
    };
  }

  async saveRetentionSnapshot(snapshot) {
    const existing = await this.getRow(
      'SELECT id FROM retention_snapshots WHERE video_id = ? AND measurement_window = ?',
      [snapshot.videoId, snapshot.measurementWindow]
    );
    const id = existing?.id || this.generateId('retention');
    await this.executeQuery(
      `INSERT INTO retention_snapshots (
        id, video_id, production_id, short_clip_id, title, surface,
        measurement_window, published_at, duration_seconds, points,
        scene_metrics, summary, confidence, measured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id, measurement_window) DO UPDATE SET
        production_id = excluded.production_id,
        short_clip_id = excluded.short_clip_id,
        title = excluded.title,
        surface = excluded.surface,
        published_at = excluded.published_at,
        duration_seconds = excluded.duration_seconds,
        points = excluded.points,
        scene_metrics = excluded.scene_metrics,
        summary = excluded.summary,
        confidence = excluded.confidence,
        measured_at = excluded.measured_at`,
      [
        id,
        snapshot.videoId,
        snapshot.productionId || null,
        snapshot.shortClipId || null,
        snapshot.title || null,
        snapshot.surface || 'long_form',
        snapshot.measurementWindow,
        snapshot.publishedAt || null,
        Number(snapshot.durationSeconds || 0),
        JSON.stringify(snapshot.points || []),
        JSON.stringify(snapshot.sceneMetrics || []),
        JSON.stringify(snapshot.summary || {}),
        snapshot.confidence || 'low',
        snapshot.measuredAt || new Date().toISOString()
      ]
    );
    return this.getRetentionSnapshot(id);
  }

  async getRetentionSnapshot(id) {
    const row = await this.getRow('SELECT * FROM retention_snapshots WHERE id = ?', [id]);
    return this.parseRetentionSnapshot(row);
  }

  async listRetentionSnapshots(options = {}) {
    const conditions = [];
    const params = [];
    if (options.videoId) {
      conditions.push('video_id = ?');
      params.push(options.videoId);
    }
    if (options.surface) {
      conditions.push('surface = ?');
      params.push(options.surface);
    }
    if (options.measurementWindow) {
      conditions.push('measurement_window = ?');
      params.push(options.measurementWindow);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(50, Number(options.limit || 12)));
    const rows = await this.getAllRows(
      `SELECT * FROM retention_snapshots ${where} ORDER BY measured_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map(row => this.parseRetentionSnapshot(row));
  }

  parseRetentionSnapshot(row) {
    if (!row) return null;
    return {
      ...row,
      videoId: row.video_id,
      productionId: row.production_id,
      shortClipId: row.short_clip_id,
      measurementWindow: row.measurement_window,
      publishedAt: row.published_at,
      durationSeconds: Number(row.duration_seconds || 0),
      measuredAt: row.measured_at,
      points: JSON.parse(row.points || '[]'),
      sceneMetrics: JSON.parse(row.scene_metrics || '[]'),
      summary: JSON.parse(row.summary || '{}')
    };
  }

  async saveLearningRecommendation(recommendation) {
    const existing = await this.getRow(
      'SELECT id FROM learning_recommendations WHERE fingerprint = ?',
      [recommendation.fingerprint]
    );
    const id = existing?.id || this.generateId('learning');
    await this.executeQuery(
      `INSERT INTO learning_recommendations (
        id, fingerprint, category, title, rationale, evidence, proposed_change, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        category = excluded.category,
        title = excluded.title,
        rationale = excluded.rationale,
        evidence = excluded.evidence,
        proposed_change = excluded.proposed_change,
        confidence = excluded.confidence,
        updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        recommendation.fingerprint,
        recommendation.category,
        recommendation.title,
        recommendation.rationale,
        JSON.stringify(recommendation.evidence || {}),
        JSON.stringify(recommendation.proposedChange || {}),
        recommendation.confidence || 'low'
      ]
    );
    return this.getLearningRecommendation(id);
  }

  async getLearningRecommendation(id) {
    const row = await this.getRow('SELECT * FROM learning_recommendations WHERE id = ?', [id]);
    return this.parseLearningRecommendation(row);
  }

  async listLearningRecommendations(options = {}) {
    const conditions = [];
    const params = [];
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
    const rows = await this.getAllRows(
      `SELECT * FROM learning_recommendations ${where}
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                updated_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map(row => this.parseLearningRecommendation(row));
  }

  async reviewLearningRecommendation(id, status) {
    if (!['approved', 'rejected'].includes(status)) return null;
    await this.executeQuery(
      `UPDATE learning_recommendations
       SET status = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, id]
    );
    return this.getLearningRecommendation(id);
  }

  parseLearningRecommendation(row) {
    if (!row) return null;
    return {
      ...row,
      proposedChange: JSON.parse(row.proposed_change || '{}'),
      evidence: JSON.parse(row.evidence || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewedAt: row.reviewed_at
    };
  }

  async createGrowthExperiment(experiment, arms) {
    const id = experiment.id || this.generateId('experiment');
    await this.executeQuery(
      `INSERT INTO growth_experiments (
        id, production_id, video_id, recommendation_id, title, hypothesis,
        primary_metric, status, arm_duration_hours, min_impressions, guardrails
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, experiment.productionId, experiment.videoId, experiment.recommendationId || null,
        experiment.title, experiment.hypothesis, experiment.primaryMetric || 'ctr',
        experiment.status || 'draft', experiment.armDurationHours || 48,
        experiment.minImpressions || 1000, JSON.stringify(experiment.guardrails || {})
      ]
    );
    for (const [index, arm] of arms.entries()) {
      await this.executeQuery(
        `INSERT INTO experiment_arms (
          id, experiment_id, arm_index, label, title, thumbnail_path, is_control
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          arm.id || this.generateId('arm'), id, index, arm.label,
          arm.title, arm.thumbnailPath, arm.isControl ? 1 : 0
        ]
      );
    }
    return this.getGrowthExperiment(id);
  }

  async getGrowthExperiment(id) {
    const row = await this.getRow('SELECT * FROM growth_experiments WHERE id = ?', [id]);
    if (!row) return null;
    const arms = await this.getAllRows(
      'SELECT * FROM experiment_arms WHERE experiment_id = ? ORDER BY arm_index ASC',
      [id]
    );
    return this.parseGrowthExperiment(row, arms);
  }

  async listGrowthExperiments(options = {}) {
    const conditions = [];
    const params = [];
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      conditions.push(`status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
    if (options.productionId) {
      conditions.push('production_id = ?');
      params.push(options.productionId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
    const rows = await this.getAllRows(
      `SELECT * FROM growth_experiments ${where} ORDER BY updated_at DESC LIMIT ?`,
      [...params, limit]
    );
    return Promise.all(rows.map(async row => {
      const arms = await this.getAllRows(
        'SELECT * FROM experiment_arms WHERE experiment_id = ? ORDER BY arm_index ASC',
        [row.id]
      );
      return this.parseGrowthExperiment(row, arms);
    }));
  }

  async updateGrowthExperiment(id, changes = {}) {
    const allowed = {
      status: 'status', currentArmId: 'current_arm_id', winningArmId: 'winning_arm_id',
      result: 'result', approvedAt: 'approved_at', startedAt: 'started_at',
      completedAt: 'completed_at', adoptedAt: 'adopted_at', cancelledAt: 'cancelled_at'
    };
    const assignments = [];
    const params = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (changes[key] === undefined) continue;
      assignments.push(`${column} = ?`);
      params.push(key === 'result' ? JSON.stringify(changes[key] || {}) : changes[key]);
    }
    if (!assignments.length) return this.getGrowthExperiment(id);
    assignments.push('updated_at = CURRENT_TIMESTAMP');
    await this.executeQuery(
      `UPDATE growth_experiments SET ${assignments.join(', ')} WHERE id = ?`,
      [...params, id]
    );
    return this.getGrowthExperiment(id);
  }

  async updateExperimentArm(id, changes = {}) {
    const allowed = {
      status: 'status', baselineMetrics: 'baseline_metrics', finalMetrics: 'final_metrics',
      result: 'result', startedAt: 'started_at', endedAt: 'ended_at'
    };
    const assignments = [];
    const params = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (changes[key] === undefined) continue;
      assignments.push(`${column} = ?`);
      params.push(['baselineMetrics', 'finalMetrics', 'result'].includes(key)
        ? JSON.stringify(changes[key] || {})
        : changes[key]);
    }
    if (!assignments.length) return null;
    assignments.push('updated_at = CURRENT_TIMESTAMP');
    await this.executeQuery(`UPDATE experiment_arms SET ${assignments.join(', ')} WHERE id = ?`, [...params, id]);
    const row = await this.getRow('SELECT * FROM experiment_arms WHERE id = ?', [id]);
    return this.parseExperimentArm(row);
  }

  async saveExperimentSample(sample) {
    const id = this.generateId('sample');
    await this.executeQuery(
      `INSERT INTO experiment_samples (
        id, experiment_id, arm_id, metrics, traffic_sources, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id, sample.experimentId, sample.armId, JSON.stringify(sample.metrics || {}),
        JSON.stringify(sample.trafficSources || []), sample.capturedAt || new Date().toISOString()
      ]
    );
    return id;
  }

  async listExperimentSamples(experimentId, limit = 250) {
    const rows = await this.getAllRows(
      `SELECT * FROM experiment_samples WHERE experiment_id = ?
       ORDER BY captured_at ASC LIMIT ?`,
      [experimentId, Math.max(1, Math.min(1000, Number(limit || 250)))]
    );
    return rows.map(row => ({
      ...row,
      experimentId: row.experiment_id,
      armId: row.arm_id,
      capturedAt: row.captured_at,
      metrics: JSON.parse(row.metrics || '{}'),
      trafficSources: JSON.parse(row.traffic_sources || '[]')
    }));
  }

  parseExperimentArm(row) {
    if (!row) return null;
    return {
      ...row,
      experimentId: row.experiment_id,
      index: Number(row.arm_index),
      thumbnailPath: row.thumbnail_path,
      isControl: Boolean(row.is_control),
      baselineMetrics: JSON.parse(row.baseline_metrics || '{}'),
      finalMetrics: JSON.parse(row.final_metrics || '{}'),
      result: JSON.parse(row.result || '{}'),
      startedAt: row.started_at,
      endedAt: row.ended_at
    };
  }

  parseGrowthExperiment(row, arms = []) {
    return {
      ...row,
      productionId: row.production_id,
      videoId: row.video_id,
      recommendationId: row.recommendation_id,
      primaryMetric: row.primary_metric,
      armDurationHours: Number(row.arm_duration_hours),
      minImpressions: Number(row.min_impressions),
      currentArmId: row.current_arm_id,
      winningArmId: row.winning_arm_id,
      approvedAt: row.approved_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      adoptedAt: row.adopted_at,
      cancelledAt: row.cancelled_at,
      guardrails: JSON.parse(row.guardrails || '{}'),
      result: JSON.parse(row.result || '{}'),
      arms: arms.map(arm => this.parseExperimentArm(arm))
    };
  }

  async upsertAudienceComment(comment) {
    const existing = await this.getRow(
      'SELECT id FROM audience_comments WHERE comment_id = ?',
      [comment.commentId]
    );
    const id = existing?.id || this.generateId('comment');
    await this.executeQuery(
      `INSERT INTO audience_comments (
        id, comment_id, video_id, parent_comment_id, author_name, author_channel_id,
        is_channel_owner, text, like_count, reply_count, published_at, updated_at_youtube
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(comment_id) DO UPDATE SET
        text = excluded.text,
        like_count = excluded.like_count,
        reply_count = excluded.reply_count,
        updated_at_youtube = excluded.updated_at_youtube,
        updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        comment.commentId,
        comment.videoId,
        comment.parentCommentId || null,
        comment.authorName || null,
        comment.authorChannelId || null,
        comment.isChannelOwner ? 1 : 0,
        comment.text,
        Number(comment.likeCount || 0),
        Number(comment.replyCount || 0),
        comment.publishedAt || null,
        comment.updatedAtYouTube || null
      ]
    );
    return this.getAudienceComment(comment.commentId);
  }

  async getAudienceComment(commentId) {
    const row = await this.getRow('SELECT * FROM audience_comments WHERE comment_id = ?', [commentId]);
    return this.parseAudienceComment(row);
  }

  async listAudienceComments(options = {}) {
    const conditions = ['video_id = ?'];
    const params = [options.videoId];
    if (options.topLevelOnly) conditions.push('parent_comment_id IS NULL');
    if (options.analysisState) {
      conditions.push('analysis_state = ?');
      params.push(options.analysisState);
    }
    const limit = Math.max(1, Math.min(500, Number(options.limit || 200)));
    const rows = await this.getAllRows(
      `SELECT * FROM audience_comments WHERE ${conditions.join(' AND ')}
       ORDER BY like_count DESC, published_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map(row => this.parseAudienceComment(row));
  }

  async countAudienceComments(videoId) {
    const row = await this.getRow(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN parent_comment_id IS NULL THEN 1 ELSE 0 END) AS top_level
       FROM audience_comments WHERE video_id = ?`,
      [videoId]
    );
    return { total: Number(row?.total || 0), topLevel: Number(row?.top_level || 0) };
  }

  async setAudienceCommentAnalysis(commentId, flags) {
    await this.executeQuery(
      `UPDATE audience_comments
       SET flags = ?, analysis_state = 'analyzed', updated_at = CURRENT_TIMESTAMP
       WHERE comment_id = ?`,
      [JSON.stringify(flags || []), commentId]
    );
    return this.getAudienceComment(commentId);
  }

  async markAudienceCommentReplied(commentId) {
    await this.executeQuery(
      `UPDATE audience_comments SET replied_by_agent = 1, updated_at = CURRENT_TIMESTAMP WHERE comment_id = ?`,
      [commentId]
    );
    return this.getAudienceComment(commentId);
  }

  parseAudienceComment(row) {
    if (!row) return null;
    return {
      ...row,
      commentId: row.comment_id,
      videoId: row.video_id,
      parentCommentId: row.parent_comment_id,
      authorName: row.author_name,
      authorChannelId: row.author_channel_id,
      isChannelOwner: Boolean(row.is_channel_owner),
      likeCount: Number(row.like_count || 0),
      replyCount: Number(row.reply_count || 0),
      publishedAt: row.published_at,
      updatedAtYouTube: row.updated_at_youtube,
      flags: JSON.parse(row.flags || '[]'),
      analysisState: row.analysis_state,
      repliedByAgent: Boolean(row.replied_by_agent)
    };
  }

  async saveEngagementInsight(insight) {
    const existing = await this.getEngagementInsight(insight.videoId);
    const merged = { ...(existing || {}), ...insight };
    const id = existing?.id || this.generateId('insight');
    await this.executeQuery(
      `INSERT INTO engagement_insights (
        id, video_id, production_id, title, comment_count, analyzed_count,
        sentiment, themes, attention_flags, analysis_method, analyzed_at,
        last_synced_at, newest_comment_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET
        production_id = excluded.production_id,
        title = excluded.title,
        comment_count = excluded.comment_count,
        analyzed_count = excluded.analyzed_count,
        sentiment = excluded.sentiment,
        themes = excluded.themes,
        attention_flags = excluded.attention_flags,
        analysis_method = excluded.analysis_method,
        analyzed_at = excluded.analyzed_at,
        last_synced_at = excluded.last_synced_at,
        newest_comment_at = excluded.newest_comment_at,
        updated_at = CURRENT_TIMESTAMP`,
      [
        id,
        insight.videoId,
        merged.productionId || null,
        merged.title || null,
        Number(merged.commentCount || 0),
        Number(merged.analyzedCount || 0),
        JSON.stringify(merged.sentiment || {}),
        JSON.stringify(merged.themes || []),
        JSON.stringify(merged.attentionFlags || []),
        merged.analysisMethod || 'ai',
        merged.analyzedAt || null,
        merged.lastSyncedAt || null,
        merged.newestCommentAt || null
      ]
    );
    return this.getEngagementInsight(insight.videoId);
  }

  async getEngagementInsight(videoId) {
    const row = await this.getRow('SELECT * FROM engagement_insights WHERE video_id = ?', [videoId]);
    return this.parseEngagementInsight(row);
  }

  async listEngagementInsights(options = {}) {
    const limit = Math.max(1, Math.min(50, Number(options.limit || 12)));
    const rows = await this.getAllRows(
      'SELECT * FROM engagement_insights ORDER BY updated_at DESC LIMIT ?',
      [limit]
    );
    return rows.map(row => this.parseEngagementInsight(row));
  }

  parseEngagementInsight(row) {
    if (!row) return null;
    return {
      ...row,
      videoId: row.video_id,
      productionId: row.production_id,
      commentCount: Number(row.comment_count || 0),
      analyzedCount: Number(row.analyzed_count || 0),
      sentiment: JSON.parse(row.sentiment || '{}'),
      themes: JSON.parse(row.themes || '[]'),
      attentionFlags: JSON.parse(row.attention_flags || '[]'),
      analysisMethod: row.analysis_method,
      analyzedAt: row.analyzed_at,
      lastSyncedAt: row.last_synced_at,
      newestCommentAt: row.newest_comment_at
    };
  }

  async saveReplyDraft(draft) {
    const existing = await this.getRow('SELECT id, status FROM reply_drafts WHERE comment_id = ?', [draft.commentId]);
    if (existing?.status === 'posted') {
      const error = new Error('A posted reply cannot be replaced');
      error.status = 409;
      throw error;
    }
    const id = existing?.id || this.generateId('reply');
    await this.executeQuery(
      `INSERT INTO reply_drafts (id, comment_id, video_id, draft_text, rationale)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(comment_id) DO UPDATE SET
         draft_text = excluded.draft_text,
         rationale = excluded.rationale,
         edited_text = NULL,
         status = 'proposed',
         posted_comment_id = NULL,
         posted_at = NULL,
         failure_reason = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [id, draft.commentId, draft.videoId, draft.draftText, draft.rationale || null]
    );
    return this.getReplyDraft(id);
  }

  async getReplyDraft(id) {
    const row = await this.getRow('SELECT * FROM reply_drafts WHERE id = ?', [id]);
    return this.parseReplyDraft(row);
  }

  async listReplyDrafts(options = {}) {
    const conditions = [];
    const params = [];
    if (options.videoId) {
      conditions.push('video_id = ?');
      params.push(options.videoId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(100, Number(options.limit || 50)));
    const rows = await this.getAllRows(
      `SELECT * FROM reply_drafts ${where} ORDER BY updated_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map(row => this.parseReplyDraft(row));
  }

  async updateReplyDraft(id, changes = {}) {
    const columns = {
      editedText: 'edited_text',
      status: 'status',
      postedCommentId: 'posted_comment_id',
      postedAt: 'posted_at',
      failureReason: 'failure_reason'
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(columns)) {
      if (key in changes) {
        sets.push(`${column} = ?`);
        params.push(changes[key]);
      }
    }
    if (sets.length) {
      await this.executeQuery(
        `UPDATE reply_drafts SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...params, id]
      );
    }
    return this.getReplyDraft(id);
  }

  async countReplyDraftsPostedSince(isoTime) {
    const row = await this.getRow(
      "SELECT COUNT(*) AS posted FROM reply_drafts WHERE status = 'posted' AND posted_at >= ?",
      [isoTime]
    );
    return Number(row?.posted || 0);
  }

  parseReplyDraft(row) {
    if (!row) return null;
    return {
      ...row,
      commentId: row.comment_id,
      videoId: row.video_id,
      draftText: row.draft_text,
      editedText: row.edited_text,
      postedCommentId: row.posted_comment_id,
      postedAt: row.posted_at,
      failureReason: row.failure_reason
    };
  }

  async getPublishedContentContext(youtubeId) {
    const schedule = await this.getRow(
      `SELECT production_id, published_at, title, metadata
       FROM publish_schedule WHERE youtube_id = ? ORDER BY published_at DESC LIMIT 1`,
      [youtubeId]
    );
    if (!schedule) return {};
    const metadata = JSON.parse(schedule.metadata || '{}');
    const sourceProductionId = metadata.sourceProductionId || schedule.production_id;
    const row = await this.getRow(
      `SELECT ps.strategy, ps.script, ps.thumbnail, ps.seo, cr.editor_data
       FROM production_snapshots ps
       LEFT JOIN content_reviews cr ON cr.production_id = ps.production_id
       WHERE ps.production_id = ?`,
      [sourceProductionId]
    ) || {};
    const editorData = JSON.parse(row.editor_data || '{}');
    const thumbnail = JSON.parse(row.thumbnail || '{}');
    const selectedThumbnail = editorData.packagingExperiment?.thumbnailVariants?.[editorData.selectedThumbnailVariant];
    const isShort = metadata.contentType === 'short';
    const strategy = JSON.parse(row.strategy || '{}');
    const sourceScenes = await this.listProductionScenes(sourceProductionId);
    const shortClip = isShort && metadata.shortClipId ? await this.getShortClip(metadata.shortClipId) : null;
    return {
      productionId: sourceProductionId,
      shortClipId: metadata.shortClipId || null,
      contentFormat: isShort ? 'short' : 'long_form',
      publishedAt: schedule.published_at,
      title: isShort ? schedule.title : editorData.title || schedule.title,
      strategy: isShort
        ? { ...strategy, contentType: 'shorts', requestedStyle: 'shorts', requestedLengthKey: 'short' }
        : strategy,
      script: JSON.parse(row.script || '{}'),
      thumbnail: selectedThumbnail?.concept ? { ...thumbnail, concept: selectedThumbnail.concept } : thumbnail,
      seo: JSON.parse(row.seo || '{}'),
      productionCost: this.summarizeProductionCost(sourceScenes),
      retentionScenes: this.buildRetentionSceneContext(sourceScenes, shortClip),
      retentionDuration: isShort ? shortClip?.duration || null : sourceScenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0)
    };
  }

  summarizeProductionCost(scenes = []) {
    const entries = scenes.flatMap(scene => [scene.actualCost, scene.narrationCost]).filter(entry => entry && (
      entry.amount !== undefined || entry.billed !== undefined || entry.invoiceRequired || entry.provider || entry.generatedSeconds
    ));
    const currencies = new Set();
    const providers = new Set();
    let amount = 0;
    let knownEntries = 0;
    let unknownEntries = 0;
    let freeEntries = 0;
    for (const entry of entries) {
      if (entry.provider) providers.add(String(entry.provider));
      if (entry.billed === false) {
        freeEntries++;
        continue;
      }
      const numericAmount = Number(entry.amount);
      if (Number.isFinite(numericAmount) && numericAmount >= 0) {
        amount += numericAmount;
        knownEntries++;
        if (entry.currency) currencies.add(String(entry.currency).toUpperCase());
      } else if (entry.invoiceRequired || entry.billed !== false) {
        unknownEntries++;
      }
    }
    return {
      amount: currencies.size > 1 ? null : knownEntries ? Number(amount.toFixed(4)) : freeEntries && unknownEntries === 0 ? 0 : null,
      currency: currencies.size === 1 ? [...currencies][0] : null,
      complete: unknownEntries === 0 && currencies.size <= 1,
      knownEntries,
      unknownEntries,
      freeEntries,
      providers: [...providers]
    };
  }

  buildRetentionSceneContext(scenes = [], shortClip = null) {
    let cursor = 0;
    const timeline = scenes.map(scene => {
      const duration = Math.max(0, Number(scene.duration || 0));
      const item = { ...scene, startSeconds: cursor, endSeconds: cursor + duration };
      cursor += duration;
      return item;
    });
    if (!shortClip) return timeline;

    const clipStart = Math.max(0, Number(shortClip.startSeconds || 0));
    const clipEnd = clipStart + Math.max(0, Number(shortClip.duration || 0));
    const allowed = new Set(shortClip.sourceSceneIds || []);
    return timeline.flatMap(scene => {
      if (allowed.size && !allowed.has(scene.id)) return [];
      const start = Math.max(scene.startSeconds, clipStart);
      const end = Math.min(scene.endSeconds, clipEnd);
      if (end <= start) return [];
      return [{
        ...scene,
        sourceStartSeconds: start,
        startSeconds: start - clipStart,
        endSeconds: end - clipStart,
        duration: end - start
      }];
    });
  }

  // Keyword performance
  async updateKeywordPerformance(keyword, views, videoId) {
    const existing = await this.getRow(
      'SELECT * FROM keyword_performance WHERE keyword = ?',
      [keyword]
    );
    
    if (existing) {
      await this.executeQuery(
        `UPDATE keyword_performance SET 
          total_uses = total_uses + 1,
          total_views = total_views + ?,
          average_views = (total_views + ?) / (total_uses + 1),
          best_performing_video = CASE 
            WHEN ? > (total_views / total_uses) THEN ?
            ELSE best_performing_video
          END,
          last_used = datetime('now')
        WHERE keyword = ?`,
        [views, views, views, videoId, keyword]
      );
    } else {
      await this.executeQuery(
        `INSERT INTO keyword_performance (
          keyword, total_uses, total_views, average_views,
          best_performing_video, last_used, performance_score
        ) VALUES (?, 1, ?, ?, ?, datetime('now'), ?)`,
        [keyword, views, views, videoId, Math.min(100, views / 1000)]
      );
    }
  }

  async getKeywordHistory() {
    const rows = await this.getAllRows(
      'SELECT * FROM keyword_performance ORDER BY performance_score DESC'
    );
    return rows;
  }

  // Settings
  async getSetting(key) {
    const row = await this.getRow(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return row ? row.value : null;
  }

  async setSetting(key, value, description = null) {
    await this.executeQuery(
      `INSERT OR REPLACE INTO settings (key, value, description, updated_at) 
       VALUES (?, ?, COALESCE(?, (SELECT description FROM settings WHERE key = ?)), datetime('now'))`,
      [key, value, description, key]
    );
  }

  async getAllSettings() {
    const rows = await this.getAllRows('SELECT * FROM settings ORDER BY key');
    return rows.reduce((settings, row) => {
      settings[row.key] = row.value;
      return settings;
    }, {});
  }

  // Production readiness
  async saveReadinessRun(run) {
    await this.executeQuery(
      `INSERT OR REPLACE INTO readiness_runs (
        id, status, checks, summary, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.status,
        JSON.stringify(run.checks || []),
        JSON.stringify(run.summary || {}),
        run.startedAt,
        run.completedAt
      ]
    );
    return this.getReadinessRun(run.id);
  }

  async getReadinessRun(id) {
    const row = await this.getRow('SELECT * FROM readiness_runs WHERE id = ?', [id]);
    return this.parseReadinessRun(row);
  }

  async getLatestReadinessRun() {
    const row = await this.getRow('SELECT * FROM readiness_runs ORDER BY completed_at DESC LIMIT 1');
    return this.parseReadinessRun(row);
  }

  parseReadinessRun(row) {
    if (!row) return null;
    return {
      ...row,
      checks: JSON.parse(row.checks || '[]'),
      summary: JSON.parse(row.summary || '{}')
    };
  }

  // Utility methods
  generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  async executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(error) {
        if (error) {
          reject(error);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async getRow(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (error, row) => {
        if (error) {
          reject(error);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getAllRows(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (error, rows) => {
        if (error) {
          reject(error);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((error) => {
          if (error) {
            this.logger.error('Error closing database:', error);
          }
          resolve();
        });
      });
    }
  }

  async backup() {
    try {
      const backupPath = path.join(
        path.dirname(this.dbPath),
        `backup_${Date.now()}.db`
      );
      
      const fs = require('fs').promises;
      await fs.copyFile(this.dbPath, backupPath);
      
      this.logger.info(`Database backed up to: ${backupPath}`);
      return backupPath;
    } catch (error) {
      this.logger.error('Database backup failed:', error);
      throw error;
    }
  }

  async getStats() {
    const [
      strategiesCount,
      scriptsCount,
      productionsCount,
      publishedCount,
      analyticsCount
    ] = await Promise.all([
      this.getRow('SELECT COUNT(*) as count FROM content_strategies'),
      this.getRow('SELECT COUNT(*) as count FROM scripts'),
      this.getRow('SELECT COUNT(*) as count FROM productions'),
      this.getRow('SELECT COUNT(*) as count FROM publish_schedule WHERE status = "published"'),
      this.getRow('SELECT COUNT(*) as count FROM analytics_reports')
    ]);

    return {
      strategies: strategiesCount.count,
      scripts: scriptsCount.count,
      productions: productionsCount.count,
      published: publishedCount.count,
      analytics: analyticsCount.count,
      dbSize: await this.getDatabaseSize()
    };
  }

  async getDatabaseSize() {
    try {
      const fs = require('fs').promises;
      const stats = await fs.stat(this.dbPath);
      return `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
    } catch (error) {
      return 'Unknown';
    }
  }
}

module.exports = { Database };
