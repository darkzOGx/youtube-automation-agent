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

    // Insert default settings
    await this.insertDefaultSettings();
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
      ['max_daily_posts', '1', 'Maximum posts per day'],
      ['content_buffer_days', '3', 'Days of content to keep in buffer']
    ];

    for (const [key, value, description] of defaultSettings) {
      await this.executeQuery(
        'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)',
        [key, value, description]
      );
    }
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

  // Publishing methods
  async saveScheduleEntry(entry) {
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
        status = ?, youtube_id = ?, youtube_url = ?, 
        published_at = ?, error_message = ?
      WHERE id = ?`,
      [
        entry.status,
        entry.youtubeId || null,
        entry.youtubeUrl || null,
        entry.publishedAt || null,
        entry.error || null,
        entry.id
      ]
    );
  }

  async getPublishQueue() {
    const rows = await this.getAllRows(
      `SELECT * FROM publish_schedule 
       WHERE status IN ('scheduled', 'paused') 
       ORDER BY publish_time ASC`
    );
    
    return rows.map(row => ({
      ...row,
      productionId: row.production_id,
      publishTime: row.publish_time,
      youtubeId: row.youtube_id,
      youtubeUrl: row.youtube_url,
      publishedAt: row.published_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}')
    }));
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
    
    return rows.map(row => ({
      ...row,
      productionId: row.production_id,
      publishTime: row.publish_time,
      youtubeId: row.youtube_id,
      youtubeUrl: row.youtube_url,
      publishedAt: row.published_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  async getPublishHistory() {
    const rows = await this.getAllRows(
      `SELECT * FROM publish_schedule 
       ORDER BY 
         CASE 
           WHEN status = 'scheduled' THEN 1 
           WHEN status = 'paused' THEN 2
           WHEN status = 'published' THEN 3
           ELSE 4 
         END, 
         publish_time DESC`
    );
    
    return rows.map(row => ({
      ...row,
      productionId: row.production_id,
      publishTime: row.publish_time,
      youtubeId: row.youtube_id,
      youtubeUrl: row.youtube_url,
      publishedAt: row.published_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}')
    }));
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