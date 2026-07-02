const { Logger } = require('../utils/logger');
const { AITextService } = require('../utils/ai-text-service');

class SEOOptimizerAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('SEOOptimizer');
    this.keywordDatabase = new Map();
    this.aiTextService = new AITextService(credentials?.credentials || credentials || {});
  }

  async initialize() {
    this.logger.info('Initializing SEO Optimizer Agent...');
    await this.loadKeywordDatabase();
    return true;
  }

  async loadKeywordDatabase() {
    try {
      const keywords = await this.db.getKeywordHistory();
      keywords.forEach(kw => {
        this.keywordDatabase.set(kw.keyword, kw.performance);
      });
    } catch (error) {
      this.logger.warn('No keyword history found');
    }
  }

  async optimize(script, strategy) {
    try {
      this.logger.info(`Optimizing SEO for: ${script.title}`);
      
      const aiSEO = await this.generateSEOWithAI(script, strategy);
      let title, description, tags;

      if (aiSEO) {
        ({ title, description, tags } = aiSEO);
      } else {
        this.logger.info('Using template SEO optimization');
        // Generate optimized title
        title = await this.optimizeTitle(script.title, strategy);
        
        // Generate description
        description = await this.generateDescription(script, strategy);
        
        // Extract and optimize tags
        tags = await this.generateTags(script, strategy);
      }
      
      // Generate hashtags
      const hashtags = await this.generateHashtags(strategy);
      
      // Create chapters/timestamps
      const chapters = await this.generateChapters(script);
      
      // Generate end screen elements
      const endScreen = await this.generateEndScreenStrategy();
      
      // Calculate SEO score
      const seoScore = await this.calculateSEOScore(title, description, tags);
      
      const seoData = {
        title,
        description,
        tags,
        hashtags,
        chapters,
        endScreen,
        seoScore,
        metadata: {
          primaryKeyword: strategy.keywords[0],
          secondaryKeywords: strategy.keywords.slice(1, 5),
          targetLength: this.calculateOptimalLength(strategy.contentType),
          language: 'en',
          category: this.selectCategory(strategy)
        },
        createdAt: new Date().toISOString()
      };
      
      // Save to database
      await this.db.saveSEOData(seoData);
      
      this.logger.info(`SEO optimization complete. Score: ${seoScore}/100`);
      return seoData;
    } catch (error) {
      this.logger.error('Failed to optimize SEO:', error);
      throw error;
    }
  }

  async generateSEOWithAI(script, strategy) {
    if (!this.aiTextService.isAvailable()) {
      this.logger.info('Using template SEO optimization because no AI text provider is configured');
      return null;
    }

    const prompt = `You are optimizing YouTube metadata.
Return only valid JSON with this exact shape:
{
  "title": "SEO title under 100 characters",
  "description": "YouTube description with useful summary and timestamps if relevant",
  "tags": ["tag"]
}

Video title: ${script.title}
Topic: ${strategy.topic}
Angle: ${strategy.angle}
Content type: ${strategy.contentType}
Target audience: ${strategy.targetAudience}
Keywords: ${(strategy.keywords || []).join(', ')}
Keep tags under YouTube's 500 character total guidance. Avoid fabricated statistics and unsupported claims.`;

    try {
      const response = await this.aiTextService.generateText(prompt, {
        maxTokens: 1400,
        temperature: 0.6
      });
      const parsed = this.parseAIJsonResponse(response);
      const tags = this.normalizeAITags(parsed.tags, strategy);

      if (!parsed.title || !parsed.description || tags.length === 0) {
        throw new Error('AI SEO response missing required fields');
      }

      this.logger.info(`Using AI SEO optimization via ${this.aiTextService.providerName}`);
      return {
        title: String(parsed.title).trim().slice(0, 100),
        description: String(parsed.description).trim().slice(0, 5000),
        tags
      };
    } catch (error) {
      this.logger.warn(`AI SEO optimization failed; using template fallback: ${error.message}`);
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

  normalizeAITags(tags, strategy) {
    const rawTags = Array.isArray(tags) ? tags : [];
    const fallbackTags = rawTags.length > 0 ? rawTags : strategy.keywords || [];
    const uniqueTags = [];
    let totalLength = 0;

    for (const tag of fallbackTags) {
      const cleaned = String(tag).trim();
      if (!cleaned || uniqueTags.includes(cleaned)) continue;
      if (totalLength + cleaned.length + 1 > 500) break;
      uniqueTags.push(cleaned);
      totalLength += cleaned.length + 1;
    }

    return uniqueTags;
  }
  async optimizeTitle(originalTitle, strategy) {
    // YouTube title limit: 100 characters, optimal: 60-70
    let optimizedTitle = originalTitle;
    
    // Add power words if not present
    const powerWords = ['Ultimate', 'Complete', 'Essential', 'Proven', 'Secret', 'Amazing', 'Powerful'];
    const hasPowerWord = powerWords.some(word => 
      originalTitle.toLowerCase().includes(word.toLowerCase())
    );
    
    if (!hasPowerWord && originalTitle.length < 60) {
      const randomPowerWord = powerWords[Math.floor(Math.random() * powerWords.length)];
      optimizedTitle = `${randomPowerWord} ${originalTitle}`;
    }
    
    // Add year if relevant and not present
    const currentYear = new Date().getFullYear();
    if (!optimizedTitle.includes(currentYear.toString()) && optimizedTitle.length < 70) {
      optimizedTitle = `${optimizedTitle} (${currentYear})`;
    }
    
    // Ensure primary keyword is in title
    const primaryKeyword = strategy.keywords[0];
    if (primaryKeyword && !optimizedTitle.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      optimizedTitle = `${optimizedTitle} - ${primaryKeyword}`;
    }
    
    // Truncate if too long
    if (optimizedTitle.length > 100) {
      optimizedTitle = optimizedTitle.substring(0, 97) + '...';
    }
    
    // Capitalize properly
    optimizedTitle = this.titleCase(optimizedTitle);
    
    return optimizedTitle;
  }

  titleCase(str) {
    const smallWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'of', 'on', 'or', 'the', 'to', 'via', 'vs'];
    
    return str.split(' ').map((word, index) => {
      if (index === 0 || !smallWords.includes(word.toLowerCase())) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word.toLowerCase();
    }).join(' ');
  }

  async generateDescription(script, strategy) {
    // YouTube description limit: 5000 characters, first 125 shown in search
    
    let description = '';
    
    // First 125 characters - most important for SEO
    const hook = `${script.title} - In this video, you'll discover ${strategy.angle.toLowerCase()}.`;
    description += hook + '\n\n';
    
    // Video overview
    description += '📺 WHAT YOU\'LL LEARN:\n';
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.slice(0, 5).forEach(section => {
        if (section.title) {
          description += `• ${section.title}\n`;
        }
      });
    }
    description += '\n';
    
    // Timestamps/Chapters
    description += '⏱️ TIMESTAMPS:\n';
    description += '00:00 Introduction\n';
    let timestamp = 20;
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        const minutes = Math.floor(timestamp / 60);
        const seconds = timestamp % 60;
        description += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${section.title || 'Section'}\n`;
        timestamp += section.duration || 60;
      });
    }
    description += '\n';
    
    // Keywords paragraph (SEO optimized)
    description += '📝 ABOUT THIS VIDEO:\n';
    description += `This comprehensive guide on ${strategy.topic} covers everything you need to know. `;
    description += `Whether you're a beginner or advanced, you'll find valuable insights about ${strategy.keywords.slice(0, 3).join(', ')}. `;
    description += `Perfect for ${strategy.targetAudience}.\n\n`;
    
    // Links section
    description += '🔗 USEFUL LINKS:\n';
    description += `• Subscribe: [Your Channel URL]\n`;
    description += `• Website: ${process.env.WEBSITE_URL || '[Your Website]'}\n`;
    description += `• Social Media: ${process.env.SOCIAL_LINKS || '[Your Social Media]'}\n\n`;
    
    // Related videos
    description += '📹 RELATED VIDEOS:\n';
    description += '• [Related Video 1]\n';
    description += '• [Related Video 2]\n';
    description += '• [Related Video 3]\n\n';
    
    // Equipment/Tools (if applicable)
    if (strategy.contentType === 'Tutorial') {
      description += '🛠️ TOOLS & RESOURCES MENTIONED:\n';
      description += '• [Tool/Resource 1]\n';
      description += '• [Tool/Resource 2]\n\n';
    }
    
    // Contact/Business
    description += '📧 BUSINESS INQUIRIES:\n';
    description += `${process.env.BUSINESS_EMAIL || '[Your Business Email]'}\n\n`;
    
    // Tags/Hashtags
    description += '🏷️ TAGS:\n';
    const hashtags = await this.generateHashtags(strategy);
    description += hashtags.join(' ') + '\n\n';
    
    // Disclaimer if needed
    description += '⚠️ DISCLAIMER:\n';
    description += 'This video is for educational purposes only.\n\n';
    
    // Copyright
    description += `© ${new Date().getFullYear()} All Rights Reserved\n`;
    
    // Music credits if applicable
    description += '\n🎵 MUSIC:\n';
    description += 'Background music from YouTube Audio Library\n';
    
    return description;
  }

  async generateTags(script, strategy) {
    const tags = new Set();
    
    // Add primary keywords
    strategy.keywords.forEach(keyword => tags.add(keyword));
    
    // Add topic variations
    const topic = strategy.topic.toLowerCase();
    tags.add(topic);
    tags.add(topic.replace(/\s+/g, ''));
    tags.add(topic.replace(/\s+/g, '_'));
    
    // Add content type tags
    const contentTypeTags = {
      'Tutorial': ['how to', 'tutorial', 'guide', 'step by step', 'learn'],
      'Explainer': ['explained', 'what is', 'understanding', 'explanation'],
      'Review': ['review', 'comparison', 'vs', 'best', 'top'],
      'List': ['top 10', 'best', 'list', 'countdown'],
      'Story': ['story', 'journey', 'experience', 'case study']
    };
    
    const typeTags = contentTypeTags[strategy.contentType] || [];
    typeTags.forEach(tag => tags.add(tag));
    
    // Add year tags
    const year = new Date().getFullYear();
    tags.add(year.toString());
    tags.add(`${topic} ${year}`);
    
    // Add niche-specific tags
    const niche = this.identifyNiche(strategy);
    const nicheTags = this.getNicheTags(niche);
    nicheTags.forEach(tag => tags.add(tag));
    
    // Add long-tail keywords
    const longTailKeywords = this.generateLongTailKeywords(strategy);
    longTailKeywords.forEach(keyword => tags.add(keyword));
    
    // Extract tags from script content
    if (script.keywords) {
      script.keywords.forEach(keyword => tags.add(keyword));
    }
    
    // Add channel branding tags
    if (process.env.CHANNEL_NAME) {
      tags.add(process.env.CHANNEL_NAME);
    }
    
    // YouTube allows max 500 characters in tags, prioritize most important
    const tagArray = Array.from(tags);
    const prioritizedTags = this.prioritizeTags(tagArray, strategy);
    
    // Ensure total character count doesn't exceed 500
    let totalLength = 0;
    const finalTags = [];
    
    for (const tag of prioritizedTags) {
      if (totalLength + tag.length + 1 <= 500) {
        finalTags.push(tag);
        totalLength += tag.length + 1; // +1 for comma separator
      }
    }
    
    return finalTags;
  }

  identifyNiche(strategy) {
    const topic = strategy.topic.toLowerCase();
    
    const niches = {
      'technology': ['tech', 'software', 'hardware', 'gadget', 'computer', 'phone', 'app'],
      'gaming': ['game', 'gaming', 'gamer', 'play', 'stream'],
      'education': ['learn', 'study', 'course', 'tutorial', 'education', 'teach'],
      'business': ['business', 'entrepreneur', 'startup', 'money', 'finance', 'invest'],
      'lifestyle': ['life', 'lifestyle', 'daily', 'routine', 'habit'],
      'health': ['health', 'fitness', 'workout', 'diet', 'nutrition', 'wellness'],
      'entertainment': ['fun', 'comedy', 'entertainment', 'funny', 'laugh']
    };
    
    for (const [niche, keywords] of Object.entries(niches)) {
      if (keywords.some(keyword => topic.includes(keyword))) {
        return niche;
      }
    }
    
    return 'general';
  }

  getNicheTags(niche) {
    const nicheTags = {
      'technology': ['tech', 'technology', 'innovation', 'future tech', 'tech news'],
      'gaming': ['gaming', 'gameplay', 'walkthrough', 'lets play', 'game review'],
      'education': ['educational', 'learning', 'study tips', 'online learning', 'edtech'],
      'business': ['business tips', 'entrepreneurship', 'startup', 'business strategy', 'success'],
      'lifestyle': ['lifestyle', 'life hacks', 'daily routine', 'productivity', 'self improvement'],
      'health': ['health tips', 'fitness', 'healthy living', 'wellness', 'nutrition'],
      'entertainment': ['entertainment', 'fun', 'viral', 'trending', 'must watch'],
      'general': ['video', 'youtube', 'content', 'new', 'latest']
    };
    
    return nicheTags[niche] || nicheTags.general;
  }

  generateLongTailKeywords(strategy) {
    const longTailTemplates = [
      `how to ${strategy.topic}`,
      `${strategy.topic} for beginners`,
      `${strategy.topic} tutorial`,
      `best ${strategy.topic}`,
      `${strategy.topic} tips and tricks`,
      `${strategy.topic} step by step`,
      `${strategy.topic} guide ${new Date().getFullYear()}`,
      `${strategy.topic} explained simply`,
      `everything about ${strategy.topic}`,
      `${strategy.topic} mistakes to avoid`
    ];
    
    return longTailTemplates.slice(0, 5);
  }

  prioritizeTags(tags, strategy) {
    // Score and sort tags by importance
    const scoredTags = tags.map(tag => {
      let score = 0;
      
      // Primary keyword gets highest score
      if (tag === strategy.keywords[0]) score += 10;
      
      // Other strategy keywords
      if (strategy.keywords.includes(tag)) score += 5;
      
      // Contains topic
      if (tag.includes(strategy.topic.toLowerCase())) score += 3;
      
      // Long-tail keywords
      if (tag.split(' ').length > 2) score += 2;
      
      // Current year
      if (tag.includes(new Date().getFullYear().toString())) score += 1;
      
      return { tag, score };
    });
    
    // Sort by score descending
    scoredTags.sort((a, b) => b.score - a.score);
    
    return scoredTags.map(item => item.tag);
  }

  async generateHashtags(strategy) {
    const hashtags = [];
    
    // Primary hashtag
    const primaryHashtag = `#${strategy.topic.replace(/\s+/g, '')}`;
    hashtags.push(primaryHashtag);
    
    // Content type hashtag
    hashtags.push(`#${strategy.contentType.toLowerCase()}`);
    
    // Trending hashtags
    const trendingHashtags = [
      '#youtube',
      '#youtuber',
      '#subscribe',
      '#video',
      '#viral',
      '#trending',
      '#new'
    ];
    
    // Niche hashtags
    const niche = this.identifyNiche(strategy);
    const nicheHashtags = {
      'technology': ['#tech', '#technology', '#innovation'],
      'gaming': ['#gaming', '#gamer', '#games'],
      'education': ['#education', '#learning', '#study'],
      'business': ['#business', '#entrepreneur', '#success'],
      'lifestyle': ['#lifestyle', '#life', '#daily'],
      'health': ['#health', '#fitness', '#wellness'],
      'entertainment': ['#entertainment', '#fun', '#funny']
    };
    
    const selectedNicheHashtags = nicheHashtags[niche] || [];
    hashtags.push(...selectedNicheHashtags.slice(0, 2));
    
    // Add 2-3 trending hashtags
    hashtags.push(...trendingHashtags.slice(0, 3));
    
    // Year hashtag
    hashtags.push(`#${new Date().getFullYear()}`);
    
    // Limit to 15 hashtags (YouTube recommendation)
    return hashtags.slice(0, 15);
  }

  async generateChapters(script) {
    const chapters = [];
    let currentTime = 0;
    
    // Introduction
    chapters.push({
      time: '00:00',
      title: 'Introduction',
      seconds: 0
    });
    
    currentTime = 20; // Intro duration
    
    // Main content chapters
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        const minutes = Math.floor(currentTime / 60);
        const seconds = currentTime % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        chapters.push({
          time: timeString,
          title: section.title || 'Section',
          seconds: currentTime
        });
        
        currentTime += section.duration || 60;
      });
    }
    
    // Conclusion
    const conclusionMinutes = Math.floor(currentTime / 60);
    const conclusionSeconds = currentTime % 60;
    chapters.push({
      time: `${conclusionMinutes.toString().padStart(2, '0')}:${conclusionSeconds.toString().padStart(2, '0')}`,
      title: 'Conclusion & Next Steps',
      seconds: currentTime
    });
    
    return chapters;
  }

  async generateEndScreenStrategy() {
    return {
      elements: [
        {
          type: 'video',
          position: 'left',
          title: 'Recommended Video',
          duration: 20
        },
        {
          type: 'playlist',
          position: 'right',
          title: 'Watch More',
          duration: 20
        },
        {
          type: 'subscribe',
          position: 'center-bottom',
          duration: 20
        }
      ],
      startTime: -20, // 20 seconds before end
      template: 'standard'
    };
  }

  async calculateSEOScore(title, description, tags) {
    let score = 0;
    
    // Title scoring (30 points max)
    if (title.length >= 60 && title.length <= 70) score += 10;
    else if (title.length >= 50 && title.length <= 100) score += 5;
    
    if (/\d/.test(title)) score += 5; // Contains number
    if (/[A-Z]/.test(title)) score += 5; // Proper capitalization
    if (title.includes(new Date().getFullYear().toString())) score += 5; // Current year
    if (['how', 'what', 'why', 'best', 'top'].some(word => title.toLowerCase().includes(word))) score += 5;
    
    // Description scoring (40 points max)
    if (description.length >= 200) score += 10;
    if (description.length >= 500) score += 10;
    if (description.includes('TIMESTAMPS')) score += 5;
    if (description.includes('http')) score += 5; // Contains links
    if (description.split('\n').length > 10) score += 5; // Well formatted
    if (description.substring(0, 125).includes(tags[0])) score += 5; // Primary keyword in first 125 chars
    
    // Tags scoring (30 points max)
    if (tags.length >= 10) score += 10;
    if (tags.length >= 15) score += 5;
    if (tags.some(tag => tag.split(' ').length > 2)) score += 5; // Long-tail keywords
    if (tags.join('').length <= 500) score += 5; // Within character limit
    if (new Set(tags).size === tags.length) score += 5; // No duplicates
    
    return Math.min(100, score);
  }

  calculateOptimalLength(contentType) {
    const optimalLengths = {
      'Tutorial': '10-15 minutes',
      'Explainer': '5-10 minutes',
      'Review': '8-12 minutes',
      'List': '8-15 minutes',
      'Story': '10-20 minutes'
    };
    
    return optimalLengths[contentType] || '8-12 minutes';
  }

  selectCategory(strategy) {
    const categories = {
      'technology': 28, // Science & Technology
      'gaming': 20, // Gaming
      'education': 27, // Education
      'business': 27, // Education (closest match)
      'lifestyle': 22, // People & Blogs
      'health': 26, // Howto & Style
      'entertainment': 24 // Entertainment
    };
    
    const niche = this.identifyNiche(strategy);
    return categories[niche] || 22; // Default to People & Blogs
  }
}

module.exports = { SEOOptimizerAgent };