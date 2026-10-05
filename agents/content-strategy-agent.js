const { Logger } = require('../utils/logger');
const { LLMClient } = require('../utils/llm-client');
const { AITextService } = require('../utils/ai-text-service');

class ContentStrategyAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ContentStrategy');
    this.trendingTopics = [];
    this.competitorData = [];
    this.contentCalendar = [];
    // Primary text generation: LLMClient router. AITextService is a fallback used only
    // when LLMClient has no providers configured.
    this.llm = new LLMClient(credentials);
    this.aiTextService = new AITextService(credentials?.credentials || credentials || {});
  }

  isAITextAvailable() {
    return this.llm.isAvailable() || this.aiTextService.isAvailable();
  }

  getAITextProviderName() {
    return this.llm.isAvailable() ? this.llm.describe() : this.aiTextService.providerName;
  }

  // LLMClient first (user's router + fallback chain); AITextService only when LLMClient has no providers.
  async generateAIText(prompt, options = {}) {
    if (this.llm.isAvailable()) {
      return this.llm.generate({
        system: options.system || 'You are a YouTube content strategist. Return only valid JSON when JSON is requested.',
        prompt,
        json: options.json !== false
      });
    }
    return this.aiTextService.generateText(prompt, options);
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
      this.competitorData = competitors;
      
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
          videoId: video.id,
          title: video.snippet.title,
          tags: video.snippet.tags || [],
          viewCount: parseInt(video.statistics?.viewCount, 10) || 0,
          category: video.snippet.categoryId,
          publishedAt: video.snippet.publishedAt,
          publisher: video.snippet.channelTitle || 'YouTube',
          url: `https://www.youtube.com/watch?v=${video.id}`
        }));
      }

      // Step 2: Fetch detailed statistics for these specific niche videos
      const detailsResponse = await this.executeWithFallback((youtube) => youtube.videos.list({
        part: 'snippet,statistics',
        id: videoIds.join(',')
      }));

      const finalData = detailsResponse.data.items.map(video => ({
        videoId: video.id,
        title: video.snippet.title,
        tags: video.snippet.tags || [],
        viewCount: parseInt(video.statistics?.viewCount, 10) || 0,
        category: video.snippet.categoryId,
        publishedAt: video.snippet.publishedAt,
        publisher: video.snippet.channelTitle || 'YouTube',
        url: `https://www.youtube.com/watch?v=${video.id}`
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
      const views = parseInt(video.statistics?.viewCount, 10) || 0;
      totalViews += views;

      // Extract topics from title
      const keywords = this.extractKeywords(title);
      keywords.forEach(keyword => {
        if (!topics.has(keyword)) topics.set(keyword, { count: 0, views: 0, evidence: [] });
        const entry = topics.get(keyword);
        entry.count++;
        entry.views += views;
        entry.evidence.push({
          url: `https://www.youtube.com/watch?v=${video.id}`,
          title: video.snippet.title,
          publisher: video.snippet.channelTitle || 'Configured competitor channel',
          publishedAt: video.snippet.publishedAt,
          sourceType: 'video'
        });
      });
    });

    const topTopics = Array.from(topics.entries())
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 10)
      .map(([topic, data]) => ({ topic, avgViews: data.views / data.count, evidence: data.evidence.slice(0, 5) }));

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
          mergedTopics.set(keyword, { score: 0, sources: [], evidence: [] });
        }
        const topic = mergedTopics.get(keyword);
        topic.score += trend.viewCount / 1000000; // Normalize by millions
        topic.sources.push('trending');
        topic.evidence.push({
          url: trend.url,
          title: trend.title,
          publisher: trend.publisher,
          publishedAt: trend.publishedAt,
          sourceType: 'video'
        });
      });
    });

    // Add competitor topics
    competitors.forEach(competitor => {
      if (competitor.topPerformingTopics) {
        competitor.topPerformingTopics.forEach(({ topic, avgViews, evidence = [] }) => {
          if (!mergedTopics.has(topic)) {
            mergedTopics.set(topic, { score: 0, sources: [], evidence: [] });
          }
          const topicData = mergedTopics.get(topic);
          topicData.score += avgViews / 100000; // Normalize
          topicData.sources.push('competitor');
          topicData.evidence.push(...evidence);
        });
      }
    });

    // Convert to array and sort by score
    return Array.from(mergedTopics.entries())
      .map(([topic, data]) => ({ topic, ...data }))
      .map(item => ({
        ...item,
        evidence: [...new Map(item.evidence.filter(source => source.url).map(source => [source.url, source])).values()].slice(0, 5)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  async generateContentStrategy(requestedTopic = null, analyticsData = {}) {
    try {
      let topic, angle, targetAudience, contentType;

      const aiStrategy = await this.generateContentStrategyWithAI(requestedTopic, analyticsData);
      if (aiStrategy) {
        await this.db.saveContentStrategy(aiStrategy);
        this.logger.info(`Generated AI strategy for: ${aiStrategy.topic}`);
        return aiStrategy;
      }

      this.logger.info('Using template content strategy generation');
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

  async researchAndPlanChannel(channelStrategy) {
    const targetCount = Math.max(1, Math.min(5, Number(channelStrategy.videos_per_run || 1)));
    await this.analyzeTrends();

    const recentRows = await this.db.getAllRows(
      "SELECT topic, created_at FROM content_strategies WHERE created_at >= datetime('now', '-90 days') ORDER BY created_at DESC LIMIT 50"
    );
    const approvedLearnings = this.db.listLearningRecommendations
      ? await this.db.listLearningRecommendations({ status: 'approved', limit: 10 })
      : [];
    const signals = this.trendingTopics.slice(0, 15).map(item => ({
      topic: item.topic,
      score: Number(item.score || 0),
      sources: [...new Set(item.sources || [])],
      evidence: item.evidence || []
    }));
    const sourceCatalog = [...new Map(
      signals.flatMap(signal => signal.evidence || []).map(source => [source.url, source])
    ).values()].slice(0, 30);
    const signalSources = new Set(signals.flatMap(signal => signal.sources));
    const researchSources = [
      ...(signalSources.has('trending') ? ['YouTube most-popular videos'] : []),
      ...(signalSources.has('competitor') ? ['Configured competitor channels'] : []),
      ...(recentRows.length ? ['Channel content history'] : []),
      ...(approvedLearnings.length ? ['Operator-approved channel performance learnings'] : [])
    ];
    const research = {
      generatedAt: new Date().toISOString(),
      sources: researchSources.length ? researchSources : ['No usable live signals returned; evergreen strategy fallback'],
      signals,
      sourceCatalog,
      recentTopics: recentRows.map(row => row.topic),
      competitorChannelsAnalyzed: this.competitorData.length,
      approvedLearnings: approvedLearnings.map(item => ({
        category: item.category,
        title: item.title,
        rationale: item.rationale,
        confidence: item.confidence,
        proposedChange: item.proposedChange
      }))
    };

    let plan = await this.generateAutonomousPlanWithAI(channelStrategy, research, targetCount);
    plan = this.normalizeAutonomousPlan(plan, channelStrategy, targetCount, research);
    if (plan.length < targetCount) {
      const fallback = this.buildFallbackAutonomousPlan(channelStrategy, research, targetCount);
      plan = this.normalizeAutonomousPlan([...plan, ...fallback], channelStrategy, targetCount, research);
    }

    return { research, plan };
  }

  async generateAutonomousPlanWithAI(channelStrategy, research, targetCount) {
    if (!this.isAITextAvailable()) return [];
    const prompt = `You are the strategy lead for an autonomous YouTube channel.
Turn the channel strategy and the supplied research signals into a focused content plan.
Return only a valid JSON array with exactly ${targetCount} items using this shape:
[{"topic":"specific video topic","pillar":"one exact content pillar from the supplied strategy","angle":"distinct audience-relevant angle","rationale":"why this advances the channel objective using the supplied evidence","format":"explainer|tutorial|list|review|story","length":"short|medium|long","sourceUrls":["exact URL from the supplied source catalog"]}]

Channel objective: ${channelStrategy.objective}
Audience: ${channelStrategy.audience}
Value proposition: ${channelStrategy.value_proposition || 'not specified'}
Content pillars: ${(channelStrategy.contentPillars || []).join(', ')}
Preferred format: ${channelStrategy.default_format}
Preferred length: ${channelStrategy.default_length}
Success metric: ${channelStrategy.success_metric || 'not specified'}
Primary KPI: ${channelStrategy.primary_kpi || 'views'}
Target: ${channelStrategy.target_value || 'not set'} per ${channelStrategy.target_window_days || 28} days
Monthly production budget: ${channelStrategy.monthly_budget ?? 'not set'} ${channelStrategy.outcome_currency || 'USD'}
Constraints: ${channelStrategy.constraints || 'none'}
Research signals: ${JSON.stringify(research.signals)}
Allowed source catalog: ${JSON.stringify(research.sourceCatalog)}
Recent topics to avoid repeating: ${JSON.stringify(research.recentTopics)}
Operator-approved performance learnings to apply: ${JSON.stringify(research.approvedLearnings)}

Do not invent trend data, statistics, sources, URLs, or factual claims. Use only exact URLs from the supplied source catalog. Apply only the supplied approved learnings; pending or rejected recommendations are not authorized. Prefer evergreen topics when the supplied signals are weak. Learnings with category "audience_demand" are audience-requested topics mined from real comments on published videos; prefer planning a video that directly answers one when it fits the channel objective, and cite it in the rationale.`;

    try {
      // json: false — the plan is a JSON array, which json_object response modes reject.
      const response = await this.generateAIText(prompt, { maxTokens: 1800, temperature: 0.65, json: false });
      const parsed = this.parseAIJsonResponse(response);
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed.plan) ? parsed.plan : [];
    } catch (error) {
      this.logger.warn(`AI channel plan failed; using evidence-aware fallback: ${error.message}`);
      return [];
    }
  }

  buildFallbackAutonomousPlan(channelStrategy, research, targetCount) {
    const recent = new Set(research.recentTopics.map(topic => String(topic).toLowerCase()));
    const readableSignals = research.signals
      .map(signal => signal.topic)
      .filter(topic => topic.includes(' ') && topic.length >= 8 && !recent.has(topic.toLowerCase()));
    const pillars = channelStrategy.contentPillars || [];
    const pillarTopics = pillars.map(pillar => `${pillar}: a practical guide for ${channelStrategy.audience}`);
    const candidates = [...readableSignals, ...pillarTopics, ...this.getEvergreenFallbackTopics()];

    return candidates.slice(0, targetCount).map((topic, index) => ({
      topic,
      pillar: pillars.find(pillar => topic.toLowerCase().includes(String(pillar).toLowerCase())) || pillars[index % Math.max(1, pillars.length)] || '',
      angle: `${topic} through the lens of ${channelStrategy.value_proposition || channelStrategy.objective}`,
      rationale: readableSignals.includes(topic)
        ? 'Matches a current YouTube or configured competitor signal and fits the channel strategy.'
        : research.approvedLearnings.length
          ? `Builds an evergreen topic from the channel strategy while applying approved learning: ${research.approvedLearnings[0].title}.`
          : 'Builds an evergreen topic from the channel strategy when live research signals are limited.',
      format: index === 0 ? channelStrategy.default_format : ['explainer', 'tutorial', 'list'][index % 3],
      length: channelStrategy.default_length,
      sourceUrls: research.signals.find(signal => signal.topic === topic)?.evidence?.map(source => source.url) || []
    }));
  }

  normalizeAutonomousPlan(plan, channelStrategy, targetCount, research = {}) {
    const formats = new Set(['explainer', 'tutorial', 'list', 'review', 'story']);
    const lengths = new Set(['short', 'medium', 'long']);
    const allowedSourceUrls = new Set((research.sourceCatalog || []).map(source => source.url));
    const pillars = channelStrategy.contentPillars || [];
    const seen = new Set();
    return plan
      .map(item => ({
        topic: String(item.topic || '').trim().slice(0, 200),
        pillar: pillars.find(pillar => String(pillar).toLowerCase() === String(item.pillar || '').trim().toLowerCase()) || '',
        angle: String(item.angle || '').trim().slice(0, 500),
        rationale: String(item.rationale || '').trim().slice(0, 1000),
        format: formats.has(String(item.format || '').toLowerCase())
          ? String(item.format).toLowerCase()
          : channelStrategy.default_format,
        length: lengths.has(String(item.length || '').toLowerCase())
          ? String(item.length).toLowerCase()
          : channelStrategy.default_length,
        sourceUrls: [...new Set((Array.isArray(item.sourceUrls) ? item.sourceUrls : [])
          .map(url => String(url))
          .filter(url => allowedSourceUrls.has(url)))]
      }))
      .filter(item => {
        const key = item.topic.toLowerCase();
        if (!item.topic || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, targetCount);
  }

  async generateContentStrategyWithAI(requestedTopic = null, analyticsData = {}) {
    if (!this.isAITextAvailable()) {
      this.logger.info('Using template content strategy generation because no AI text provider is configured');
      return null;
    }

    const trendingTopics = this.trendingTopics
      .slice(0, 10)
      .map(topic => topic.topic)
      .join(', ');
    const prompt = `You are selecting a YouTube content strategy.
Return only valid JSON with this exact shape:
{
  "topic": "specific video topic",
  "angle": "distinct content angle",
  "targetAudience": "specific audience",
  "contentType": "Tutorial|Explainer|List|Review|Story|News",
  "keywords": ["keyword"]
}

Requested topic: ${requestedTopic || 'none'}
Trending topics available: ${trendingTopics || 'Technology Trends'}
Channel target audience: ${process.env.TARGET_AUDIENCE || 'General audience interested in educational content'}
Top performing topics from past analytics (prefer topics related to these): ${(analyticsData.topTopics || []).join(', ') || 'none yet'}
Recent topics to avoid repeating: ${(this.historicalPerformance ? this.getRecentTopics() : []).slice(0, 20).join(', ') || 'none'}
${(process.env.YOUTUBE_REGION || 'ID') === 'ID'
    ? `This is an Indonesian children's storytelling channel (dongeng anak, ages 3-8). Write topic, angle, targetAudience, and keywords in Bahasa Indonesia, use contentType "Story", and keep the topic a natural dongeng-style subject. Do not add years or words like "Resmi", "Ultimate", "Terbaik".`
    : ''}
Avoid fabricated claims and unsupported numbers.`;

    try {
      const response = await this.generateAIText(prompt, {
        maxTokens: 1000,
        temperature: 0.7
      });
      const parsed = this.parseAIJsonResponse(response);
      const topic = String(parsed.topic || requestedTopic || '').trim();

      if (!topic) {
        throw new Error('AI strategy response missing topic');
      }

      const contentType = this.normalizeContentType(parsed.contentType, topic);
      const keywords = Array.isArray(parsed.keywords) && parsed.keywords.length > 0
        ? parsed.keywords.map(keyword => String(keyword).trim()).filter(Boolean)
        : this.extractKeywords(topic);

      this.logger.info(`Using AI content strategy via ${this.getAITextProviderName()}`);
      return {
        topic,
        angle: String(parsed.angle || await this.generateAngle(topic)).trim(),
        targetAudience: String(parsed.targetAudience || await this.identifyTargetAudience(topic)).trim(),
        contentType,
        keywords,
        estimatedViews: this.predictViews(topic),
        bestPublishTime: this.calculateBestPublishTime(),
        competitorAnalysis: this.getCompetitorInsights(topic),
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.warn(`AI content strategy failed; using template fallback: ${error.message}`);
      return null;
    }
  }

  parseAIJsonResponse(response) {
    const text = String(response || '').trim();
    const withoutFences = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(withoutFences);
    } catch (error) {
      const match = withoutFences.match(/\{[\s\S]*\}/);
      if (!match) {
        throw error;
      }
      return JSON.parse(match[0]);
    }
  }

  normalizeContentType(contentType, topic) {
    const allowed = new Set(['Tutorial', 'Explainer', 'List', 'Review', 'Story', 'News']);
    const normalized = String(contentType || '').trim();
    const titleCased = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();

    return allowed.has(titleCased) ? titleCased : this.selectContentType(topic);
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

    // Single keywords scraped from trending titles ("crown", "official") make
    // meaningless video topics — only use a trend that reads like a real subject.
    const readable = scoredTopics.find(t => t.topic.trim().includes(' ') && t.topic.trim().length >= 8);
    if (readable) {
      return readable;
    }

    const fallbackTopics = this.getEvergreenFallbackTopics();
    const pick = fallbackTopics.at(Math.floor(Math.random() * fallbackTopics.length));
    this.logger.info(`Template mode: no readable trending topic available — using evergreen topic "${pick}"`);
    return { topic: pick, score: 1 };
  }

  getEvergreenFallbackTopics() {
    const region = process.env.YOUTUBE_REGION || 'ID';
    if (region === 'ID') {
      // Fallback pool: Indonesian children's story characters & themes
      return [
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
    }

    return [
      'Time Management Strategies That Actually Work',
      'Beginner Mistakes to Avoid When Learning a New Skill',
      'How to Start a Side Project With Zero Budget',
      'Simple Habits That Improve Focus and Productivity',
      'How to Learn Anything Faster Using Proven Study Techniques',
      'Practical Ways to Save Money Every Month',
      'How Artificial Intelligence Is Changing Everyday Life',
      'The Science of Building Habits That Stick',
      'How to Give a Presentation People Actually Remember',
      'Getting Started With Investing: A Beginner Roadmap',
      'Digital Minimalism: Reclaiming Your Attention',
      'How to Negotiate Anything: Tactics That Work',
      'The Psychology of Procrastination and How to Beat It',
      'Remote Work Productivity: Setting Up for Success',
      'How to Read More Books Without Finding Extra Time'
    ];
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
