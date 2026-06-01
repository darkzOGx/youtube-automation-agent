const { google } = require('googleapis');
const { Logger } = require('../utils/logger');

class AnalyticsOptimizationAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('AnalyticsOptimization');
    this.youtubeAnalytics = null;
    this.youtube = null;
    this.performanceData = new Map();
    this.apiCache = new Map();
  }

  async initialize() {
    this.logger.info('Initializing Analytics & Optimization Agent...');
    await this.setupAnalyticsAPI();
    await this.loadHistoricalData();
    return true;
  }

  async setupAnalyticsAPI() {
    try {
      const auth = this.credentials.getYouTubeAuth();
      this.youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
      this.youtube = google.youtube({ version: 'v3', auth });
      this.logger.info('YouTube Analytics API initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Analytics API:', error);
      throw error;
    }
  }

  async loadHistoricalData() {
    try {
      const history = await this.db.getAnalyticsHistory();
      history.forEach(record => {
        this.performanceData.set(record.videoId, record);
      });
      this.logger.info(`Loaded ${this.performanceData.size} historical records`);
    } catch (error) {
      this.logger.warn('No historical analytics data found');
    }
  }

  async analyzeVideoPerformance(videoId) {
    try {
      this.logger.info(`Analyzing performance for video: ${videoId}`);
      
      // Get video details
      const videoDetails = await this.getVideoDetails(videoId);
      
      // Get analytics data
      const analytics = await this.getVideoAnalytics(videoId);
      
      // Analyze thumbnail performance
      const thumbnailMetrics = await this.analyzeThumbnailPerformance(videoId);
      
      // Analyze title and SEO performance
      const seoMetrics = await this.analyzeSEOPerformance(videoDetails, analytics);
      
      // Generate insights and recommendations
      const insights = await this.generateInsights(videoDetails, analytics, thumbnailMetrics, seoMetrics);
      
      const performanceReport = {
        videoId,
        videoDetails,
        analytics,
        thumbnailMetrics,
        seoMetrics,
        insights,
        performance: this.calculatePerformanceScore(analytics),
        analyzedAt: new Date().toISOString()
      };
      
      // Store in performance data
      this.performanceData.set(videoId, performanceReport);
      
      // Save to database
      await this.db.saveAnalyticsReport(performanceReport);
      
      this.logger.info(`Analysis complete. Performance score: ${performanceReport.performance.score}/100`);
      return performanceReport;
    } catch (error) {
      this.logger.error(`Failed to analyze video ${videoId}:`, error);
      throw error;
    }
  }

  async getVideoDetails(videoId) {
    const cacheKey = `video_${videoId}`;
    if (this.apiCache.has(cacheKey)) {
      const cached = this.apiCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 3600000) return cached.data; // 1 hour
    }

    const response = await this.youtube.videos.list({
      part: 'snippet,statistics,contentDetails',
      id: videoId
    });
    
    if (!response.data.items.length) {
      throw new Error(`Video not found: ${videoId}`);
    }
    
    const video = response.data.items[0];
    return {
      id: videoId,
      title: video.snippet.title,
      description: video.snippet.description,
      tags: video.snippet.tags || [],
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      statistics: {
        viewCount: parseInt(video.statistics.viewCount) || 0,
        likeCount: parseInt(video.statistics.likeCount) || 0,
        commentCount: parseInt(video.statistics.commentCount) || 0
      }
    };
    
    this.apiCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  async getVideoAnalytics(videoId) {
    const cacheKey = `analytics_${videoId}`;
    if (this.apiCache.has(cacheKey)) {
      const cached = this.apiCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 3600000) return cached.data; // 1 hour
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    try {
      // Get various analytics metrics
      const [
        viewsData,
        watchTimeData,
        demographicsData,
        trafficSourcesData,
        deviceData
      ] = await Promise.all([
        this.getViewsAnalytics(videoId, startDate, endDate),
        this.getWatchTimeAnalytics(videoId, startDate, endDate),
        this.getDemographicsAnalytics(videoId, startDate, endDate),
        this.getTrafficSourcesAnalytics(videoId, startDate, endDate),
        this.getDeviceAnalytics(videoId, startDate, endDate)
      ]);
      
      const result = {
        period: { startDate, endDate },
        views: viewsData,
        watchTime: watchTimeData,
        demographics: demographicsData,
        trafficSources: trafficSourcesData,
        devices: deviceData,
        engagement: await this.calculateEngagementMetrics(videoId)
      };
      this.apiCache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    } catch (error) {
      this.logger.error(`Failed to get analytics for ${videoId}:`, error);
      return this.getSimulatedAnalytics(videoId);
    }
  }

  async getViewsAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,impressions,impressionClickThroughRate',
      dimensions: 'day',
      filters: `video==${videoId}`
    });
    
    return {
      totalViews: response.data.rows?.reduce((sum, row) => sum + row[1], 0) || 0,
      totalImpressions: response.data.rows?.reduce((sum, row) => sum + row[2], 0) || 0,
      averageCTR: this.calculateAverage(response.data.rows?.map(row => row[3]) || []),
      dailyData: response.data.rows || []
    };
  }

  async getWatchTimeAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
      filters: `video==${videoId}`
    });
    
    const data = response.data.rows?.[0] || [0, 0, 0];
    
    return {
      totalWatchTime: data[0] || 0,
      averageViewDuration: data[1] || 0,
      averageViewPercentage: data[2] || 0,
      retentionQuality: this.assessRetentionQuality(data[2])
    };
  }

  async getDemographicsAnalytics(videoId, startDate, endDate) {
    try {
      const [ageResponse, genderResponse] = await Promise.all([
        this.youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: 'viewerPercentage',
          dimensions: 'ageGroup',
          filters: `video==${videoId}`
        }),
        this.youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: 'viewerPercentage',
          dimensions: 'gender',
          filters: `video==${videoId}`
        })
      ]);
      
      return {
        ageGroups: ageResponse.data.rows || [],
        gender: genderResponse.data.rows || [],
        primaryAudience: this.identifyPrimaryAudience(ageResponse.data.rows, genderResponse.data.rows)
      };
    } catch (error) {
      return this.getSimulatedDemographics();
    }
  }

  async getTrafficSourcesAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'insightTrafficSourceType',
      filters: `video==${videoId}`
    });
    
    const sources = response.data.rows || [];
    const totalViews = sources.reduce((sum, row) => sum + row[1], 0);
    
    return {
      sources: sources.map(row => ({
        source: row[0],
        views: row[1],
        percentage: ((row[1] / totalViews) * 100).toFixed(1)
      })),
      topSource: sources.length > 0 ? sources[0][0] : 'unknown',
      organicPercentage: this.calculateOrganicPercentage(sources)
    };
  }

  async getDeviceAnalytics(videoId, startDate, endDate) {
    const response = await this.youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'deviceType',
      filters: `video==${videoId}`
    });
    
    const devices = response.data.rows || [];
    const totalViews = devices.reduce((sum, row) => sum + row[1], 0);
    
    return {
      devices: devices.map(row => ({
        device: row[0],
        views: row[1],
        percentage: ((row[1] / totalViews) * 100).toFixed(1)
      })),
      mobilePercentage: this.calculateMobilePercentage(devices)
    };
  }

  async calculateEngagementMetrics(videoId) {
    const videoDetails = await this.getVideoDetails(videoId);
    const stats = videoDetails.statistics;
    
    const engagementRate = ((stats.likeCount + stats.commentCount) / stats.viewCount * 100).toFixed(2);
    const likeRatio = (stats.likeCount / (stats.likeCount + (stats.dislikeCount || 0)) * 100).toFixed(2);
    
    return {
      engagementRate: parseFloat(engagementRate),
      likeRatio: parseFloat(likeRatio),
      commentsPerView: (stats.commentCount / stats.viewCount * 100).toFixed(4),
      engagementQuality: this.assessEngagementQuality(parseFloat(engagementRate))
    };
  }

  async analyzeThumbnailPerformance(videoId) {
    // Analyze thumbnail click-through rate and impressions
    try {
      const response = await this.youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        metrics: 'impressions,impressionClickThroughRate',
        filters: `video==${videoId}`
      });
      
      const data = response.data.rows?.[0] || [0, 0];
      
      const ctr = data[1] || 0;
      
      return {
        impressions: data[0] || 0,
        clickThroughRate: ctr,
        ctrQuality: this.assessCTRQuality(ctr),
        recommendations: this.generateThumbnailRecommendations(ctr)
      };
    } catch (error) {
      return {
        impressions: 0,
        clickThroughRate: 0,
        ctrQuality: 'unknown',
        recommendations: ['Unable to analyze thumbnail performance']
      };
    }
  }

  async analyzeSEOPerformance(videoDetails, analytics) {
    const title = videoDetails.title;
    const description = videoDetails.description;
    const tags = videoDetails.tags;
    
    // Analyze title effectiveness
    const titleScore = this.scoreTitleEffectiveness(title, analytics.views.totalViews);
    
    // Analyze description optimization
    const descriptionScore = this.scoreDescriptionOptimization(description);
    
    // Analyze tag relevance
    const tagScore = this.scoreTagRelevance(tags, title);
    
    // Search performance
    const searchPerformance = this.analyzeSearchPerformance(analytics.trafficSources);
    
    return {
      titleScore,
      descriptionScore,
      tagScore,
      searchPerformance,
      overallSEOScore: Math.round((titleScore + descriptionScore + tagScore) / 3),
      recommendations: this.generateSEORecommendations(titleScore, descriptionScore, tagScore, searchPerformance)
    };
  }

  async generateInsights(videoDetails, analytics, thumbnailMetrics, seoMetrics) {
    const insights = [];
    
    // Performance insights
    if (analytics.views.totalViews > 10000) {
      insights.push({
        type: 'success',
        category: 'views',
        message: 'Video berkinerja luar biasa di atas rata-rata penonton!',
        impact: 'high'
      });
    } else if (analytics.views.totalViews < 1000) {
      insights.push({
        type: 'warning',
        category: 'views',
        message: 'Jumlah penonton video saat ini berada di bawah target dasar',
        impact: 'high',
        recommendation: 'Coba promosikan video di media sosial atau tingkatkan optimasi SEO dongeng'
      });
    }
    
    // Retention insights
    if (analytics.watchTime.averageViewPercentage > 50) {
      insights.push({
        type: 'success',
        category: 'retention',
        message: 'Daya pertahanan penonton sangat luar biasa (anak-anak betah menyimak sampai akhir)!',
        impact: 'medium'
      });
    } else if (analytics.watchTime.averageViewPercentage < 30) {
      insights.push({
        type: 'critical',
        category: 'retention',
        message: 'Daya pertahanan penonton kurang optimal - anak-anak mulai bosan di awal cerita',
        impact: 'high',
        recommendation: 'Tinjau kembali struktur naskah dongeng dan percepat tempo penyampaian cerita'
      });
    }
    
    // Thumbnail insights
    if (thumbnailMetrics.clickThroughRate > 8) {
      insights.push({
        type: 'success',
        category: 'thumbnail',
        message: 'Gambar mini (thumbnail) sangat memikat dan efektif memicu klik anak-anak!',
        impact: 'high'
      });
    } else if (thumbnailMetrics.clickThroughRate < 3) {
      insights.push({
        type: 'warning',
        category: 'thumbnail',
        message: 'Gambar mini kurang memikat rasa penasaran penonton',
        impact: 'high',
        recommendation: 'Gunakan warna yang lebih cerah atau uji coba beberapa desain gambar mini baru'
      });
    }
    
    // SEO insights
    if (seoMetrics.overallSEOScore > 80) {
      insights.push({
        type: 'success',
        category: 'seo',
        message: 'Video teroptimasi dengan sangat baik untuk mesin pencari!',
        impact: 'medium'
      });
    } else if (seoMetrics.overallSEOScore < 50) {
      insights.push({
        type: 'warning',
        category: 'seo',
        message: 'Optimasi SEO video masih perlu banyak peningkatan',
        impact: 'medium',
        recommendation: 'Optimalkan kembali keselarasan judul, deskripsi, dan tag dongeng'
      });
    }
    
    // Engagement insights
    if (analytics.engagement.engagementRate > 5) {
      insights.push({
        type: 'success',
        category: 'engagement',
        message: 'Interaksi penonton sangat aktif (banyak menyukai dan berkomentar)!',
        impact: 'medium'
      });
    } else if (analytics.engagement.engagementRate < 1) {
      insights.push({
        type: 'warning',
        category: 'engagement',
        message: 'Interaksi penonton (like/comment) masih cukup rendah',
        impact: 'medium',
        recommendation: 'Berikan pertanyaan interaktif sederhana di akhir dongeng untuk memicu komentar anak-anak'
      });
    }
    
    return insights;
  }

  calculatePerformanceScore(analytics) {
    let score = 0;
    let maxScore = 0;
    
    // Views score (30 points max)
    const viewsScore = Math.min(30, (analytics.views.totalViews / 10000) * 30);
    score += viewsScore;
    maxScore += 30;
    
    // Retention score (25 points max)
    const retentionScore = (analytics.watchTime.averageViewPercentage / 100) * 25;
    score += retentionScore;
    maxScore += 25;
    
    // Engagement score (25 points max)
    const engagementScore = Math.min(25, analytics.engagement.engagementRate * 5);
    score += engagementScore;
    maxScore += 25;
    
    // CTR score (20 points max)
    const ctrScore = Math.min(20, analytics.views.averageCTR * 2);
    score += ctrScore;
    maxScore += 20;
    
    const finalScore = Math.round((score / maxScore) * 100);
    
    return {
      score: finalScore,
      breakdown: {
        views: Math.round(viewsScore),
        retention: Math.round(retentionScore),
        engagement: Math.round(engagementScore),
        ctr: Math.round(ctrScore)
      },
      grade: this.getPerformanceGrade(finalScore)
    };
  }

  getPerformanceGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }

  // Helper methods
  calculateAverage(values) {
    if (!values.length) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  assessRetentionQuality(percentage) {
    if (percentage > 60) return 'excellent';
    if (percentage > 40) return 'good';
    if (percentage > 25) return 'average';
    return 'poor';
  }

  assessEngagementQuality(rate) {
    if (rate > 8) return 'excellent';
    if (rate > 5) return 'good';
    if (rate > 2) return 'average';
    return 'poor';
  }

  assessCTRQuality(ctr) {
    if (ctr > 10) return 'excellent';
    if (ctr > 6) return 'good';
    if (ctr > 3) return 'average';
    return 'poor';
  }

  scoreTitleEffectiveness(title, views) {
    let score = 0;
    
    // Length check
    if (title.length >= 50 && title.length <= 70) score += 20;
    else if (title.length >= 40 && title.length <= 80) score += 15;
    else score += 10;
    
    // Power words
    const powerWords = ['ultimate', 'complete', 'secret', 'amazing', 'shocking', 'incredible'];
    if (powerWords.some(word => title.toLowerCase().includes(word))) score += 15;
    
    // Numbers
    if (/\d+/.test(title)) score += 10;
    
    // Emotional triggers
    const emotionalWords = ['how', 'why', 'what', 'best', 'worst', 'never', 'always'];
    if (emotionalWords.some(word => title.toLowerCase().includes(word))) score += 15;
    
    // Performance correlation
    if (views > 10000) score += 20;
    else if (views > 1000) score += 10;
    
    return Math.min(100, score);
  }

  scoreDescriptionOptimization(description) {
    let score = 0;
    
    if (description.length > 200) score += 20;
    if (description.includes('http')) score += 15; // Has links
    if (description.includes('TIMESTAMP') || description.includes('00:')) score += 15; // Has timestamps
    if (description.split('\n').length > 5) score += 15; // Well formatted
    if (description.length > 500) score += 10; // Comprehensive
    
    // Keyword density check (simplified)
    const wordCount = description.split(' ').length;
    if (wordCount > 100) score += 15;
    
    return Math.min(100, score);
  }

  scoreTagRelevance(tags, title) {
    let score = 0;
    
    if (tags.length >= 10) score += 20;
    if (tags.length >= 5) score += 10;
    
    // Tag-title relevance
    const titleWords = title.toLowerCase().split(' ');
    const relevantTags = tags.filter(tag => 
      titleWords.some(word => tag.toLowerCase().includes(word))
    );
    
    if (relevantTags.length > 0) {
      score += (relevantTags.length / tags.length) * 30;
    }
    
    // Long-tail keywords
    const longTailTags = tags.filter(tag => tag.split(' ').length > 2);
    if (longTailTags.length > 0) score += 20;
    
    return Math.min(100, score);
  }

  analyzeSearchPerformance(trafficSources) {
    const searchSources = trafficSources.sources.filter(source => 
      ['SEARCH', 'YOUTUBE_SEARCH'].includes(source.source)
    );
    
    const searchPercentage = searchSources.reduce((sum, source) => 
      sum + parseFloat(source.percentage), 0
    );
    
    return {
      searchPercentage,
      searchQuality: searchPercentage > 20 ? 'good' : searchPercentage > 10 ? 'average' : 'poor',
      organicDiscovery: searchPercentage > 30
    };
  }

  generateThumbnailRecommendations(ctr) {
    if (ctr > 8) return ['Performa gambar mini sangat luar biasa! 🌟', 'Pertahankan gaya desain ceria ini untuk video berikutnya.'];
    if (ctr > 5) return ['Performa gambar mini cukup baik 👍', 'Lakukan sedikit optimalisasi kontras warna agar lebih menarik.'];
    if (ctr > 3) return ['Performa gambar mini rata-rata ⚖️', 'Coba gunakan warna karakter yang lebih cerah atau teks dengan kontras lebih tinggi.'];
    return ['Performa gambar mini kurang optimal ⚠️', 'Coba perbesar ukuran teks judul di gambar mini', 'Gunakan visual karakter dongeng yang lebih ekspresif', 'Tingkatkan kontras warna latar belakang.'];
  }

  generateSEORecommendations(titleScore, descriptionScore, tagScore, searchPerformance) {
    const recommendations = [];
    
    if (titleScore < 70) {
      recommendations.push('Optimalkan judul dongeng agar lebih hangat, ajaib, dan memikat rasa penasaran anak-anak');
    }
    
    if (descriptionScore < 60) {
      recommendations.push('Lengkapi deskripsi dengan ringkasan dongeng yang manis, tautan playlist cerita, dan timestamps');
    }
    
    if (tagScore < 50) {
      recommendations.push('Gunakan kata kunci dongeng anak yang lebih populer (seperti fabel anak, cerita pengantar tidur)');
    }
    
    if (searchPerformance.searchPercentage < 15) {
      recommendations.push('Fokus pada optimasi kata kunci pencarian dongeng anak untuk meningkatkan penemuan organik');
    }
    
    return recommendations;
  }

  // Simulation methods for when API is not available
  getSimulatedAnalytics(videoId) {
    return {
      views: { totalViews: Math.floor(Math.random() * 50000), averageCTR: Math.random() * 10 },
      watchTime: { averageViewPercentage: Math.random() * 100 },
      engagement: { engagementRate: Math.random() * 10 },
      trafficSources: { sources: [{ source: 'SEARCH', percentage: '30' }] }
    };
  }

  getSimulatedDemographics() {
    return {
      ageGroups: [['18-24', 30], ['25-34', 40], ['35-44', 20]],
      gender: [['male', 60], ['female', 40]],
      primaryAudience: 'Males 25-34'
    };
  }

  identifyPrimaryAudience(ageGroups, gender) {
    const topAge = ageGroups?.[0]?.[0] || '25-34';
    const topGender = gender?.[0]?.[0] || 'male';
    return `${topGender}s ${topAge}`;
  }

  calculateOrganicPercentage(sources) {
    const organicSources = ['SEARCH', 'YOUTUBE_SEARCH', 'SUGGESTED_VIDEO'];
    return sources
      .filter(row => organicSources.includes(row[0]))
      .reduce((sum, row) => sum + row[1], 0);
  }

  calculateMobilePercentage(devices) {
    const mobileDevices = devices.filter(row => 
      ['MOBILE', 'TABLET'].includes(row[0])
    );
    const total = devices.reduce((sum, row) => sum + row[1], 0);
    const mobile = mobileDevices.reduce((sum, row) => sum + row[1], 0);
    
    return total > 0 ? ((mobile / total) * 100).toFixed(1) : '0';
  }

  async getRecentAnalytics(days = 7) {
    const recentReports = Array.from(this.performanceData.values())
      .filter(report => {
        const reportDate = new Date(report.analyzedAt);
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        return reportDate > cutoffDate;
      })
      .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
    
    return {
      totalVideos: recentReports.length,
      averagePerformanceScore: this.calculateAverageScore(recentReports),
      topPerformers: recentReports.slice(0, 5),
      insights: this.generateChannelInsights(recentReports)
    };
  }

  calculateAverageScore(reports) {
    if (!reports.length) return 0;
    const total = reports.reduce((sum, report) => sum + report.performance.score, 0);
    return Math.round(total / reports.length);
  }

  generateChannelInsights(reports) {
    if (!reports.length) return [];
    
    const insights = [];
    const avgScore = this.calculateAverageScore(reports);
    
    if (avgScore > 80) {
      insights.push('Channel is performing excellently across all metrics');
    } else if (avgScore < 50) {
      insights.push('Channel performance needs significant improvement');
    }
    
    // Analyze common issues
    const lowRetentionVideos = reports.filter(r => 
      r.analytics.watchTime.averageViewPercentage < 30
    ).length;
    
    if (lowRetentionVideos > reports.length * 0.5) {
      insights.push('Multiple videos showing poor retention - review content quality');
    }
    
    return insights;
  }

  getTopPerformingKeywords(limit = 10) {
    if (this.performanceData.size === 0) return [];
    const keywordScores = new Map();
    for (const [_, report] of this.performanceData.entries()) {
      const tags = report.videoDetails?.tags || [];
      const score = report.performance?.score || 0;
      for (const tag of tags) {
        keywordScores.set(tag, (keywordScores.get(tag) || 0) + score);
      }
    }
    return Array.from(keywordScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(entry => entry[0]);
  }

  getTopPerformingTopics(limit = 5) {
    if (this.performanceData.size === 0) return [];
    const topicScores = new Map();
    const commonStopWords = ['dan', 'yang', 'untuk', 'dengan', 'dari', 'pada', 'dalam', 'ini', 'itu', 'sebuah'];
    
    for (const [_, report] of this.performanceData.entries()) {
      const title = report.videoDetails?.title || '';
      const words = title.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !commonStopWords.includes(w));
        
      const score = report.performance?.score || 0;
      for (const word of words) {
        topicScores.set(word, (topicScores.get(word) || 0) + score);
      }
    }
    return Array.from(topicScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(entry => entry[0]);
  }

  async runABTestCheck(publishingAgent) {
    this.logger.info('Running A/B Test check on recent videos...');
    const recentVideos = Array.from(this.performanceData.values()).filter(report => {
      const publishedAt = new Date(report.videoDetails?.publishedAt || 0);
      const hoursSincePublish = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
      return hoursSincePublish >= 24 && hoursSincePublish <= 72; // Check videos between 1 and 3 days old
    });

    for (const report of recentVideos) {
      if (!report.thumbnailMetrics) continue;
      const ctr = report.thumbnailMetrics.clickThroughRate || 0;
      
      // If CTR is low, try to swap thumbnail
      if (ctr < 4.0) {
        this.logger.info(`Low CTR detected (${ctr}%) for video ${report.videoId}. Triggering A/B thumbnail swap.`);
        try {
          // Find the video in the db to get variantBPath
          const scheduleEntry = await this.db.getScheduleEntryByYouTubeId(report.videoId);
          if (scheduleEntry && scheduleEntry.metadata && scheduleEntry.metadata.thumbnail && scheduleEntry.metadata.thumbnail.variantBPath) {
             const variantBPath = scheduleEntry.metadata.thumbnail.variantBPath;
             await publishingAgent.uploadThumbnail(report.videoId, variantBPath);
             this.logger.info(`Swapped to Variant B thumbnail for video ${report.videoId}`);
          }
        } catch (error) {
          this.logger.error(`Failed to swap thumbnail for ${report.videoId}:`, error);
        }
      }
    }
  }
}

module.exports = { AnalyticsOptimizationAgent };