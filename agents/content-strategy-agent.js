const axios = require('axios');
const { Logger } = require('../utils/logger');

class ContentStrategyAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ContentStrategy');
    this.trendingTopics = [];
    this.competitorData = [];
    this.contentCalendar = [];
  }

  async executeWithFallback(operation) {
    try {
      return await operation(this.credentials.getYouTubeClient());
    } catch (error) {
      if (error.code === 403 && (error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('exceeded'))) {
        this.logger.warn('Quota exceeded on YouTube API. Attempting fallback...');
        if (this.credentials.switchToNextYouTubeAuth()) {
          return await operation(this.credentials.getYouTubeClient());
        }
      }
      throw error;
    }
  }

  async initialize() {
    this.logger.info('Initializing Content Strategy Agent...');
    await this.loadHistoricalData();
    await this.analyzeTrends();
    return true;
  }

  async loadHistoricalData() {
    try {
      const history = await this.db.getContentHistory();
      this.historicalPerformance = history;
    } catch (error) {
      this.logger.warn('No historical data found, starting fresh');
      this.historicalPerformance = [];
    }
  }

  async analyzeTrends() {
    try {
      // Analyze YouTube trends
      const trends = await this.fetchYouTubeTrends();
      
      // Analyze competitor channels
      const competitors = await this.analyzeCompetitors();
      
      // Combine insights
      this.trendingTopics = this.mergeTrendData(trends, competitors);
      
      this.logger.info(`Identified ${this.trendingTopics.length} trending topics`);
    } catch (error) {
      this.logger.error('Error analyzing trends:', error);
    }
  }

  async fetchYouTubeTrends() {
    try {
      const cachedData = await this.db.getSetting('cached_youtube_trends_data');
      const cacheTimestamp = await this.db.getSetting('cached_youtube_trends_timestamp');
      if (cachedData && cacheTimestamp) {
        const ageInHours = (new Date() - new Date(cacheTimestamp)) / (1000 * 60 * 60);
        if (ageInHours < 24) {
          this.logger.info('Using cached YouTube trends to save API quota');
          return JSON.parse(cachedData);
        }
      }
    } catch (e) {
      this.logger.warn('Failed to read trends cache:', e.message);
    }

    const youtube = this.credentials.getYouTubeClient();
    const region = process.env.YOUTUBE_REGION || 'ID';
    
    // Niche search queries for target children's bedtime stories & fairy tales
    const searchQuery = region === 'ID' 
      ? 'dongeng anak OR cerita anak OR cerita tidur OR fabel anak' 
      : 'bedtime stories for kids OR fairy tales for children OR kids stories';
      
    try {
      this.logger.info(`Fetching YouTube search trends for niche: "${searchQuery}" in region: ${region}`);
      
      // Step 1: Search for high-view, niche-relevant videos
      const searchResponse = await this.executeWithFallback((youtube) => youtube.search.list({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        regionCode: region,
        maxResults: 15,
        order: 'viewCount', // Sort by view count to find top performers
        publishedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // Last 30 days
      }));

      const videoIds = searchResponse.data.items.map(item => item.id.videoId).filter(Boolean);
      if (videoIds.length === 0) {
        this.logger.warn('No recent videos found for this niche. Using broad fallback.');
        const fallbackResponse = await this.executeWithFallback((youtube) => youtube.videos.list({
          part: 'snippet,statistics',
          chart: 'mostPopular',
          regionCode: region,
          videoCategoryId: this.credentials.credentials.channel.defaultCategory || '24', // Entertainment/Kids
          maxResults: 15
        }));
        return fallbackResponse.data.items.map(video => ({
          title: video.snippet.title,
          tags: video.snippet.tags || [],
          viewCount: parseInt(video.statistics.viewCount) || 100000,
          category: video.snippet.categoryId,
          publishedAt: video.snippet.publishedAt
        }));
      }

      // Step 2: Fetch detailed statistics for these specific niche videos
      const detailsResponse = await this.executeWithFallback((youtube) => youtube.videos.list({
        part: 'snippet,statistics',
        id: videoIds.join(',')
      }));

      const finalData = detailsResponse.data.items.map(video => ({
        title: video.snippet.title,
        tags: video.snippet.tags || [],
        viewCount: parseInt(video.statistics.viewCount) || 100000,
        category: video.snippet.categoryId,
        publishedAt: video.snippet.publishedAt
      }));

      try {
        await this.db.setSetting('cached_youtube_trends_data', JSON.stringify(finalData));
        await this.db.setSetting('cached_youtube_trends_timestamp', new Date().toISOString());
      } catch (e) {
        this.logger.warn('Failed to save trends cache:', e.message);
      }

      return finalData;
    } catch (error) {
      this.logger.error('Failed to fetch YouTube trends:', error);
      return [];
    }
  }

  async analyzeCompetitors() {
    try {
      const cachedData = await this.db.getSetting('cached_competitor_data');
      const cacheTimestamp = await this.db.getSetting('cached_competitor_timestamp');
      if (cachedData && cacheTimestamp) {
        const ageInHours = (new Date() - new Date(cacheTimestamp)) / (1000 * 60 * 60);
        if (ageInHours < 24) {
          this.logger.info('Using cached competitor data to save API quota');
          return JSON.parse(cachedData);
        }
      }
    } catch (e) {
      this.logger.warn('Failed to read competitor cache:', e.message);
    }

    const competitorChannels = (process.env.COMPETITOR_CHANNELS || '').split(',');
    const competitorData = [];

    for (const channelId of competitorChannels) {
      if (!channelId) continue;
      
      try {
        const videos = await this.getChannelVideos(channelId);
        const analysis = this.analyzeVideoPerformance(videos);
        competitorData.push({
          channelId,
          topPerformingTopics: analysis.topTopics,
          averageViews: analysis.avgViews,
          uploadFrequency: analysis.frequency
        });
      } catch (error) {
        this.logger.error(`Failed to analyze competitor ${channelId}:`, error);
      }
    }

    try {
      await this.db.setSetting('cached_competitor_data', JSON.stringify(competitorData));
      await this.db.setSetting('cached_competitor_timestamp', new Date().toISOString());
    } catch (e) {
      this.logger.warn('Failed to save competitor cache:', e.message);
    }

    return competitorData;
  }

  async getChannelVideos(channelId) {
    const youtube = this.credentials.getYouTubeClient();
    
    try {
      const response = await this.executeWithFallback((youtube) => youtube.search.list({
        part: 'snippet',
        channelId: channelId,
        type: 'video',
        maxResults: 5,
        order: 'viewCount'
      }));

      const videoIds = response.data.items.map(item => item.id.videoId).join(',');
      if (!videoIds) return [];
      
      const videoDetails = await this.executeWithFallback((youtube) => youtube.videos.list({
        part: 'snippet,statistics',
        id: videoIds
      }));

      return videoDetails.data.items;
    } catch (error) {
      this.logger.error(`Failed to get videos for channel ${channelId}:`, error);
      return [];
    }
  }

  analyzeVideoPerformance(videos) {
    if (!videos || videos.length === 0) {
      return { topTopics: [], avgViews: 0, frequency: 0 };
    }

    const topics = new Map();
    let totalViews = 0;

    videos.forEach(video => {
      const title = video.snippet.title.toLowerCase();
      const views = parseInt(video.statistics.viewCount);
      totalViews += views;

      // Extract topics from title
      const keywords = this.extractKeywords(title);
      keywords.forEach(keyword => {
        if (!topics.has(keyword)) topics.set(keyword, { count: 0, views: 0 });
        const entry = topics.get(keyword);
        entry.count++;
        entry.views += views;
      });
    });

    const topTopics = Array.from(topics.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 10)
      .map(([topic, data]) => ({ topic, avgViews: data.views / data.count }));

    return {
      topTopics,
      avgViews: totalViews / videos.length,
      frequency: videos.length
    };
  }

  extractKeywords(text) {
    // Simple keyword extraction with English and Indonesian stop words
    const stopWords = [
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'could', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now',
      // Indonesian Stop Words and Adverbs
      'dan', 'yang', 'untuk', 'dengan', 'bisa', 'akan', 'telah', 'oleh', 'dari', 'ke', 'di', 'ini', 'itu', 'ada', 'saja', 'kita', 'kamu', 'saya', 'mereka', 'dia', 'langsung', 'resmi', 'terbaru', 'terbaik', 'adalah', 'atau', 'pada', 'juga', 'dalam', 'tidak', 'kami', 'seperti', 'hanya', 'tentang', 'banyak', 'beberapa', 'sangat', 'secara', 'lebih', 'paling', 'baru', 'lama', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'cara', 'buat', 'bikin', 'oleh', 'untuk', 'agar', 'supaya',
      // Niche-Generic/Metadata Terms to avoid generic topics
      'anak', 'anak-anak', 'dongeng', 'cerita', 'lagu', 'kartun', 'shorts', 'video', 'youtube', 'channel', 'menonton', 'tonton', 'film', 'episode', 'terbaru', 'indonesia'
    ];
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word));
  }

  mergeTrendData(trends, competitors) {
    const mergedTopics = new Map();

    // Add trending topics
    trends.forEach(trend => {
      const keywords = this.extractKeywords(trend.title);
      keywords.forEach(keyword => {
        if (!mergedTopics.has(keyword)) {
          mergedTopics.set(keyword, { score: 0, sources: [] });
        }
        const topic = mergedTopics.get(keyword);
        topic.score += trend.viewCount / 1000000; // Normalize by millions
        topic.sources.push('trending');
      });
    });

    // Add competitor topics
    competitors.forEach(competitor => {
      if (competitor.topPerformingTopics) {
        competitor.topPerformingTopics.forEach(({ topic, avgViews }) => {
          if (!mergedTopics.has(topic)) {
            mergedTopics.set(topic, { score: 0, sources: [] });
          }
          const topicData = mergedTopics.get(topic);
          topicData.score += avgViews / 100000; // Normalize
          topicData.sources.push('competitor');
        });
      }
    });

    // Convert to array and sort by score
    return Array.from(mergedTopics.entries())
      .map(([topic, data]) => ({ topic, ...data }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  async generateContentStrategy(requestedTopic = null, analyticsData = {}) {
    try {
      let topic, angle, targetAudience, contentType;

      if (requestedTopic) {
        topic = requestedTopic;
        angle = await this.generateAngle(topic);
      } else {
        // Select from trending topics
        const selectedTopic = this.selectOptimalTopic(analyticsData.topTopics || []);
        topic = selectedTopic.topic;
        angle = await this.generateAngle(topic);
      }

      // Determine target audience
      targetAudience = await this.identifyTargetAudience(topic);

      // Select content type
      contentType = this.selectContentType(topic);

      // Generate content calendar entry
      const strategy = {
        topic,
        angle,
        targetAudience,
        contentType,
        keywords: this.extractKeywords(topic),
        estimatedViews: this.predictViews(topic),
        bestPublishTime: this.calculateBestPublishTime(),
        competitorAnalysis: this.getCompetitorInsights(topic),
        createdAt: new Date().toISOString()
      };

      // Save to database
      await this.db.saveContentStrategy(strategy);

      this.logger.info(`Generated strategy for: ${topic}`);
      return strategy;
    } catch (error) {
      this.logger.error('Failed to generate content strategy:', error);
      throw error;
    }
  }

  selectOptimalTopic(topTopics = []) {
    // Use scoring algorithm to select best topic
    const recentTopics = this.getRecentTopics();
    
    const scoredTopics = this.trendingTopics
      .filter(topic => !recentTopics.includes(topic.topic))
      .map(topic => {
        let score = topic.score;
        // Bias score heavily if it contains top performing keywords from past analytics
        if (topTopics.length > 0) {
          const topicWords = topic.topic.toLowerCase().split(/\s+/);
          const hasTopTopic = topTopics.some(t => topicWords.includes(t.toLowerCase()));
          if (hasTopTopic) score += 50; // Big boost for proven topics
        }
        
        return {
          ...topic,
          finalScore: (score * this.getSeasonalMultiplier(topic.topic) * this.getAudienceMultiplier(topic.topic)) + (Math.random() * 10)
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    // Fallback pool: Indonesian children's story characters & themes
    const fallbackTopics = [
      'Kelinci Putih yang Jujur',
      'Kancil dan Buaya',
      'Gajah Kecil yang Berani',
      'Kucing dan Tikus Sahabat Sejati',
      'Burung Pipit yang Rajin',
      'Singa yang Baik Hati',
      'Rusa dan Kura-Kura',
      'Anak Katak yang Pemberani',
      'Pohon Apel yang Dermawan',
      'Bintang Kecil di Langit Malam',
      'Ulat yang Menjadi Kupu-Kupu',
      'Beruang dan Lebah Madu',
      'Tupai Kecil yang Suka Menolong',
      'Rubah dan Anggur Manis',
      'Ikan Kecil di Lautan Luas'
    ];

    const randomFallback = fallbackTopics.at(Math.floor(Math.random() * fallbackTopics.length));
    return scoredTopics[0] || { topic: randomFallback, score: 1 };
  }

  async generateAngle(topic) {
    // Generate unique angle for children's Indonesian story channel
    const angles = [
      `Kisah ${topic} yang Penuh Keajaiban`,
      `Petualangan Seru ${topic}`,
      `${topic} dan Pelajaran Hidup yang Berharga`,
      `Dongeng: ${topic} yang Baik Hati`,
      `${topic}: Persahabatan dan Keberanian`,
      `Si Kecil ${topic} yang Pemberani`,
      `Rahasia Kebaikan ${topic}`,
      `${topic} Belajar Berbagi dan Peduli`
    ];

    return angles.at(Math.floor(Math.random() * angles.length));
  }

  async identifyTargetAudience(topic) {
    // Simplified audience identification
    const audiences = {
      tech: 'Tech enthusiasts, developers, early adopters',
      business: 'Entrepreneurs, business owners, professionals',
      education: 'Students, educators, lifelong learners',
      entertainment: 'General audience, entertainment seekers',
      lifestyle: 'Lifestyle enthusiasts, self-improvement seekers'
    };

    const category = this.categorize(topic);
    return audiences[category] || audiences.entertainment;
  }

  categorize(topic) {
    const categories = {
      tech: ['technology', 'software', 'app', 'ai', 'code', 'programming', 'crypto', 'blockchain'],
      business: ['business', 'money', 'finance', 'startup', 'entrepreneur', 'marketing'],
      education: ['learn', 'tutorial', 'how to', 'guide', 'course', 'study'],
      lifestyle: ['life', 'health', 'fitness', 'food', 'travel', 'fashion']
    };

    const topicLower = topic.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => topicLower.includes(keyword))) {
        return category;
      }
    }

    return 'entertainment';
  }

  selectContentType(topic) {
    const types = [
      { type: 'Tutorial', suitableFor: ['how to', 'guide', 'learn', 'cara', 'panduan', 'belajar'] },
      { type: 'List', suitableFor: ['best', 'top', 'worst', 'terbaik', 'paling'] },
      { type: 'Review', suitableFor: ['review', 'vs', 'comparison', 'ulasan'] },
      { type: 'Explainer', suitableFor: ['what is', 'why', 'explained', 'apa itu', 'mengapa', 'penjelasan'] },
      { type: 'News', suitableFor: ['breaking', 'latest', 'new', 'terbaru', 'berita'] },
      { type: 'Story', suitableFor: ['story', 'journey', 'experience', 'cerita', 'dongeng', 'petualangan', 'kisah'] }
    ];

    const topicLower = topic.toLowerCase();
    
    for (const contentType of types) {
      if (contentType.suitableFor.some(keyword => topicLower.includes(keyword))) {
        return contentType.type;
      }
    }

    // Default to Story for children's channel
    return 'Story';
  }

  predictViews(topic) {
    // Simplified view prediction based on topic score
    const topicData = this.trendingTopics.find(t => t.topic === topic);
    const baseViews = topicData ? topicData.score * 10000 : 5000;
    const variance = baseViews * 0.3;
    return Math.floor(baseViews + (Math.random() * variance * 2) - variance);
  }

  calculateBestPublishTime() {
    // Analyze best publishing times (Prime Time Indonesia for kids/parents)
    // 16:00 WIB (After school / nap time)
    // 19:00 WIB (After dinner / before bedtime)
    const bestTimes = [
      { day: 'Monday', hour: 16 },
      { day: 'Monday', hour: 19 },
      { day: 'Tuesday', hour: 16 },
      { day: 'Tuesday', hour: 19 },
      { day: 'Wednesday', hour: 16 },
      { day: 'Wednesday', hour: 19 },
      { day: 'Thursday', hour: 16 },
      { day: 'Thursday', hour: 19 },
      { day: 'Friday', hour: 16 },
      { day: 'Friday', hour: 19 },
      { day: 'Saturday', hour: 10 }, // Weekend morning
      { day: 'Saturday', hour: 16 },
      { day: 'Sunday', hour: 10 },   // Weekend morning
      { day: 'Sunday', hour: 16 }
    ];

    const selected = bestTimes.at(Math.floor(Math.random() * bestTimes.length));
    const nextDate = this.getNextWeekday(selected.day);
    nextDate.setHours(selected.hour, 0, 0, 0);
    
    return nextDate.toISOString();
  }

  getNextWeekday(dayName) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDay = days.indexOf(dayName);
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntilTarget);
    return nextDate;
  }

  getCompetitorInsights(topic) {
    // Get insights from competitor analysis
    return this.competitorData
      .filter(competitor => 
        competitor.topPerformingTopics.some(t => 
          t.topic.toLowerCase().includes(topic.toLowerCase())
        )
      )
      .map(competitor => ({
        channelId: competitor.channelId,
        averageViews: competitor.averageViews,
        relevantVideos: competitor.topPerformingTopics.filter(t => 
          t.topic.toLowerCase().includes(topic.toLowerCase())
        )
      }));
  }

  getRecentTopics() {
    // Get topics used in last 7 days to avoid repetition
    return this.historicalPerformance
      .filter(content => {
        const contentDate = new Date(content.createdAt);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return contentDate > weekAgo;
      })
      .map(content => content.topic);
  }

  getSeasonalMultiplier(topic) {
    // Adjust score based on seasonal relevance
    const month = new Date().getMonth();
    const seasonalTopics = {
      winter: ['christmas', 'holiday', 'new year', 'winter'],
      spring: ['spring', 'easter', 'garden'],
      summer: ['summer', 'vacation', 'beach', 'travel'],
      fall: ['halloween', 'thanksgiving', 'autumn', 'back to school']
    };

    const season = month < 3 ? 'winter' : month < 6 ? 'spring' : month < 9 ? 'summer' : 'fall';
    const topicLower = topic.toLowerCase();
    
    if (seasonalTopics[season].some(keyword => topicLower.includes(keyword))) {
      return 1.5;
    }
    
    return 1.0;
  }

  getAudienceMultiplier(topic) {
    // Adjust score based on target audience size
    const category = this.categorize(topic);
    const multipliers = {
      tech: 1.2,
      business: 1.1,
      education: 1.0,
      entertainment: 1.3,
      lifestyle: 1.15
    };
    
    return multipliers[category] || 1.0;
  }
}

module.exports = { ContentStrategyAgent };