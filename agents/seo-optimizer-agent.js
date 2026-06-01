const { Logger } = require('../utils/logger');

class SEOOptimizerAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('SEOOptimizer');
    this.keywordDatabase = new Map();
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

  async optimize(script, strategy, analyticsData = {}) {
    try {
      this.logger.info(`Optimizing SEO for: ${script.title}`);
      
      // Generate optimized title
      const title = await this.optimizeTitle(script.title, strategy);
      
      // Generate description
      const description = await this.generateDescription(script, strategy);
      
      // Extract and optimize tags
      const tags = await this.generateTags(script, strategy, analyticsData);
      
      // Generate hashtags
      const hashtags = await this.generateHashtags(strategy);
      
      // Create chapters/timestamps
      const chapters = await this.generateChapters(script);
      
      // Generate end screen elements
      const endScreen = await this.generateEndScreenStrategy();
      
      // Calculate SEO score
      const seoScore = await this.calculateSEOScore(title, description, tags);
      
      // Generate AB Testing alternative titles
      const abTitles = this.generateABTitles(title, strategy);
      
      const seoData = {
        title,
        abTitles,
        description,
        tags,
        hashtags,
        chapters,
        endScreen,
        seoScore,
        pinnedComment: script.callToAction?.comment || `Bagaimana pendapat kalian tentang kisah ini? Tulis di kolom komentar ya! 👇`,
        communityPost: `Halo Adik-adik dan Ayah Bunda! 🎉\n\nDongeng baru yang sangat seru tentang "${title}" sudah tayang lho! Yuk temani waktu bersantai sambil menonton petualangan luar biasa ini. Jangan lupa tinggalkan komentar ya!\n\nLink: [Video URL]`,
        metadata: {
          primaryKeyword: strategy.keywords[0],
          secondaryKeywords: strategy.keywords.slice(1, 5),
          targetLength: this.calculateOptimalLength(strategy.contentType),
          language: 'id',
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

  async optimizeTitle(originalTitle, strategy) {
    // YouTube title limit: 100 characters, optimal: 60-70
    // For Indonesian children's story channel — do NOT inject English power words or year.
    let optimizedTitle = originalTitle.trim();

    // Remove any accidental year already appended (e.g. "(2025)" or "(2026)")
    optimizedTitle = optimizedTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();

    // Clean up forbidden/awkward words (case-insensitive) anywhere in the title
    const forbiddenPatterns = [
      /\bResmi\b/gi,
      /\bLangsung\b/gi,
      /\bSiaran\b/gi,
      /\bLive\b/gi,
      /\bTerbaik\b/gi,
      /\bUltimate\b/gi,
      /\bComplete\b/gi,
      /\bEssential\b/gi,
      /\bProven\b/gi,
      /\bSecret\b/gi,
      /\bAmazing\b/gi,
      /\bPowerful\b/gi
    ];

    for (const pattern of forbiddenPatterns) {
      optimizedTitle = optimizedTitle.replace(pattern, '');
    }

    // Clean up multiple spaces and trailing/leading spaces or double spaces
    optimizedTitle = optimizedTitle.replace(/\s+/g, ' ').trim();

    // Truncate if too long (100 char YouTube limit)
    if (optimizedTitle.length > 100) {
      optimizedTitle = optimizedTitle.substring(0, 97) + '...';
    }

    return optimizedTitle;
  }

  generateABTitles(primaryTitle, strategy) {
    const titles = [primaryTitle];
    const baseWord = strategy.topic.split(' ')[0] || 'Kisah';
    
    titles.push(`Kisah Menarik: ${primaryTitle}`);
    titles.push(`${primaryTitle} - Dongeng ${baseWord} Lucu`);
    
    return titles;
  }


  calculateTextDuration(text) {
    if (!text) return 15;
    const words = text.split(/\s+/).length;
    return Math.max(5, Math.ceil(words / 2.5)); // ~150 words per minute
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
    const hook = `${script.title} - Dalam video dongeng anak ini, mari kita berpetualang bersama kisah manis tentang ${strategy.topic}!`;
    description += hook + '\n\n';
    
    // Video overview
    description += '📺 APA YANG AKAN KAMU TEMUKAN:\n';
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.slice(0, 5).forEach(section => {
        if (section.title) {
          description += `• ${section.title}\n`;
        }
      });
    }
    description += '\n';
    
    // Timestamps/Chapters
    description += '⏱️ BAB WAKTU (TIMESTAMPS):\n';
    description += '00:00 Awal Mula Kisah\n';
    let timestamp = 20; // Intro duration
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        const minutes = Math.floor(timestamp / 60);
        const seconds = timestamp % 60;
        description += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${section.title || 'Bagian Kisah'}\n`;
        
        let sectionText = '';
        if (typeof section.content === 'string') sectionText = section.content;
        else if (Array.isArray(section.content)) sectionText = section.content.join(' ');
        
        timestamp += this.calculateTextDuration(sectionText);
      });
    }
    description += '\n';
    
    // Keywords paragraph (SEO optimized)
    description += '📝 TENTANG DONGENG INI:\n';
    description += `Kisah dongeng pengantar tidur yang indah tentang ${strategy.topic} ini dirancang khusus untuk memeluk malam tidur anak-anak dengan penuh mimpi indah. `;
    description += `Dongeng manis ini sangat cocok untuk menemani petualangan tidur yang hangat bagi anak-anak pintar. `;
    description += `Sangat direkomendasikan untuk anak-anak, balita, dan pendamping keluarga.\n\n`;
    
    // Links section
    description += '🔗 TAUTAN BERMANFAAT:\n';
    description += `• Berlangganan (Subscribe): [Tautan Channel Anda]\n`;
    description += `• Situs Web: ${process.env.WEBSITE_URL || '[Situs Web Anda]'}\n`;
    description += `• Media Sosial: ${process.env.SOCIAL_LINKS || '[Media Sosial Anda]'}\n\n`;
    
    // Related videos
    description += '📹 VIDEO REKOMENDASI LAINNYA:\n';
    description += '• [Video Rekomendasi 1]\n';
    description += '• [Video Rekomendasi 2]\n';
    description += '• [Video Rekomendasi 3]\n\n';
    
    // Equipment/Tools (if applicable)
    if (strategy.contentType === 'Tutorial') {
      description += '🛠️ ALAT & SUMBER DAYA YANG DISEBUTKAN:\n';
      description += '• [Sumber Daya 1]\n';
      description += '• [Sumber Daya 2]\n\n';
    }
    
    // Contact/Business
    description += '📧 HUBUNGI KAMI / KERJASAMA:\n';
    description += `${process.env.BUSINESS_EMAIL || '[Email Kerja Sama Anda]'}\n\n`;
    
    // Tags/Hashtags
    description += '🏷️ TAG & HASHTAG:\n';
    const hashtags = await this.generateHashtags(strategy);
    description += hashtags.join(' ') + '\n\n';
    
    // Disclaimer if needed
    description += '⚠️ DISCLAIMER:\n';
    description += 'Video dongeng anak ini dibuat bertujuan untuk hiburan edukatif, moral, dan merangsang imajinasi kreatif anak-anak pengantar tidur.\n\n';
    
    // Copyright
    description += `© ${new Date().getFullYear()} Hak Cipta Dilindungi Undang-Undang\n`;
    
    // Music credits if applicable
    description += '\n🎵 MUSIK:\n';
    description += 'Musik latar belakang diproduksi dengan aman dari YouTube Audio Library\n';
    
    return description;
  }

  async generateTags(script, strategy, analyticsData = {}) {
    const tags = new Set();
    
    // Add primary keywords
    strategy.keywords.forEach(keyword => tags.add(keyword));
    
    // Add top performing historical keywords
    if (analyticsData.topKeywords) {
      analyticsData.topKeywords.slice(0, 5).forEach(kw => tags.add(kw));
    }
    
    // Add topic variations
    const topic = strategy.topic.toLowerCase();
    tags.add(topic);
    tags.add(topic.replace(/\s+/g, ''));
    tags.add(topic.replace(/\s+/g, '_'));
    
    // Add content type tags — Indonesian children's story specific
    const contentTypeTags = new Map([
      ['Tutorial', ['cara', 'panduan', 'langkah demi langkah', 'pelajaran', 'belajar']],
      ['Explainer', ['penjelasan', 'apa itu', 'mengenal', 'edukasi anak']],
      ['Review', ['ulasan', 'rekomendasi']],
      ['List', ['terbaik', 'pilihan', 'daftar']],
      ['Story', ['dongeng', 'kisah', 'cerita', 'fabel', 'petualangan']]
    ]);
    
    const typeTags = contentTypeTags.get(strategy.contentType) || ['dongeng', 'cerita anak'];
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
    // For Indonesian children's story channel, always use relevant Indonesian tags
    const baseTags = [
      'dongeng anak', 'cerita anak', 'dongeng bahasa Indonesia',
      'cerita sebelum tidur', 'dongeng pengantar tidur',
      'cerita anak Indonesia', 'dongeng fabel', 'animasi anak',
      'video anak', 'youtube anak'
    ];
    return baseTags;
  }

  generateLongTailKeywords(strategy) {
    const topic = strategy.topic;
    const topicLower = topic.toLowerCase();
    // Indonesian children's story long-tail keywords
    const longTailTemplates = [
      `dongeng ${topicLower}`,
      `cerita anak ${topicLower}`,
      `${topicLower} anak-anak`,
      `cerita sebelum tidur ${topicLower}`,
      `dongeng anak Indonesia`,
    ];
    return longTailTemplates;
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
        
        let sectionText = '';
        if (typeof section.content === 'string') sectionText = section.content;
        else if (Array.isArray(section.content)) sectionText = section.content.join(' ');
        
        currentTime += this.calculateTextDuration(sectionText);
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
    const optimalLengths = new Map([
      ['Tutorial', '10-15 minutes'],
      ['Explainer', '5-10 minutes'],
      ['Review', '8-12 minutes'],
      ['List', '8-15 minutes'],
      ['Story', '10-20 minutes']
    ]);
    
    return optimalLengths.get(contentType) || '8-12 minutes';
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