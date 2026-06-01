const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { Logger } = require('../utils/logger');

class ThumbnailDesignerAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ThumbnailDesigner');
    this.templatesPath = path.join(__dirname, '..', 'data', 'thumbnail-templates');
  }

  async initialize() {
    this.logger.info('Initializing Thumbnail Designer Agent...');
    await this.ensureTemplatesDirectory();
    return true;
  }

  async ensureTemplatesDirectory() {
    try {
      await fs.mkdir(this.templatesPath, { recursive: true });
      await fs.mkdir(path.join(__dirname, '..', 'uploads', 'thumbnails'), { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create directories:', error);
    }
  }
  async generateThumbnail(script) {
    try {
      this.logger.info(`Generating thumbnail for: ${script.title}`);

      // --- FUTURE DEVELOPMENT: A/B Testing ---
      // // Variant A
      // const conceptA = await this.generateConcept(script);
      // const promptA = await this.createPrompt(conceptA);
      // const thumbnailPathA = await this.createThumbnail(conceptA, script);
      // const finalThumbnailA = await this.addTextOverlay(thumbnailPathA, conceptA);
      // const optimizedThumbnailA = await this.optimizeForYouTube(finalThumbnailA);
      //
      // // Variant B
      // const conceptB = await this.generateConcept(script); // generates a different random concept
      // const promptB = await this.createPrompt(conceptB);
      // const thumbnailPathB = await this.createThumbnail(conceptB, script);
      // const finalThumbnailB = await this.addTextOverlay(thumbnailPathB, conceptB);
      // const optimizedThumbnailB = await this.optimizeForYouTube(finalThumbnailB);
      // 
      // const thumbnailData = {
      //   path: optimizedThumbnailA,
      //   variantBPath: optimizedThumbnailB,
      //   concept: conceptA,
      //   conceptB: conceptB,
      //   prompt: promptA,
      //   dimensions: { width: 1280, height: 720 },
      //   fileSize: await this.getFileSize(optimizedThumbnailA),
      //   createdAt: new Date().toISOString()
      // };
      // ---------------------------------------

      // CURRENT: Single thumbnail generation
      const concept = await this.generateConcept(script);
      const prompt = await this.createPrompt(concept);
      const thumbnailPath = await this.createThumbnail(concept, script);
      const finalThumbnail = await this.addTextOverlay(thumbnailPath, concept);
      const optimizedThumbnail = await this.optimizeForYouTube(finalThumbnail);

      const thumbnailData = {
        path: optimizedThumbnail,
        concept,
        prompt,
        dimensions: { width: 1280, height: 720 },
        fileSize: await this.getFileSize(optimizedThumbnail),
        createdAt: new Date().toISOString()
      };

      // Save to database
      await this.db.saveThumbnail(thumbnailData);

      this.logger.info('Thumbnail generated successfully');
      return thumbnailData;
    } catch (error) {
      this.logger.error('Failed to generate thumbnail:', error);
      throw error;
    }
  }

  async generateConcept(script) {
    const concepts = new Map([
      ['tutorial', {
        style: 'clean',
        elements: ['step numbers', 'arrows', 'progress indicators'],
        colors: ['blue', 'white', 'green'],
        emotion: 'helpful'
      }],
      ['explainer', {
        style: 'informative',
        elements: ['icons', 'diagrams', 'question marks'],
        colors: ['purple', 'yellow', 'white'],
        emotion: 'curious'
      }],
      ['list', {
        style: 'numbered',
        elements: ['large numbers', 'countdown', 'highlights'],
        colors: ['red', 'yellow', 'black'],
        emotion: 'exciting'
      }],
      ['review', {
        style: 'comparative',
        elements: ['product image', 'rating stars', 'vs symbol'],
        colors: ['orange', 'gray', 'white'],
        emotion: 'analytical'
      }],
      ['story', {
        style: 'dramatic',
        elements: ['faces', 'emotion', 'journey path'],
        colors: ['dark blue', 'gold', 'white'],
        emotion: 'intriguing'
      }]
    ]);

    const baseConcept = concepts.get(script.metadata?.strategy?.contentType?.toLowerCase()) || concepts.get('explainer');

    return {
      title: this.formatThumbnailTitle(script.title),
      style: baseConcept.style,
      primaryText: this.extractPrimaryText(script.title),
      secondaryText: this.generateSecondaryText(script),
      elements: baseConcept.elements,
      colors: {
        primary: baseConcept.colors[0],
        secondary: baseConcept.colors[1],
        accent: baseConcept.colors[2]
      },
      emotion: baseConcept.emotion,
      composition: this.selectComposition(),
      effects: this.selectEffects()
    };
  }

  formatThumbnailTitle(title) {
    // Shorten title for thumbnail
    const words = title.split(' ');
    if (words.length > 5) {
      return words.slice(0, 5).join(' ') + '...';
    }
    return title;
  }

  extractPrimaryText(title) {
    // Extract most impactful children story words in Indonesian
    const impactWords = ['ajaib', 'rahasia', 'kisah', 'dongeng', 'seru', 'indah', 'hebat', 'pintar', 'sahabat', 'petualangan'];
    const titleWords = title.toLowerCase().split(' ');

    const foundImpactWords = titleWords.filter(word => impactWords.includes(word));

    if (foundImpactWords.length > 0) {
      return foundImpactWords[0].toUpperCase();
    }

    // Extract numbers if present
    const numbers = title.match(/\d+/);
    if (numbers) {
      return numbers[0];
    }

    // Use first significant word or fallback
    return titleWords.find(word => word.length > 4)?.toUpperCase() || 'DONGENG';
  }

  generateSecondaryText(script) {
    if (script.metadata && script.metadata.strategy) {
      const strategy = script.metadata.strategy;

      if (strategy.contentType === 'Tutorial') {
        return 'BELAJAR BERSAMA';
      } else if (strategy.contentType === 'List') {
        return 'MIMPI INDAH';
      } else if (strategy.contentType === 'Review') {
        return 'CERITA SERU';
      }
    }

    return 'TONTON SEKARANG';
  }

  selectComposition() {
    const compositions = [
      'rule-of-thirds',
      'centered',
      'diagonal',
      'golden-ratio',
      'symmetrical'
    ];

    return compositions.at(Math.floor(Math.random() * compositions.length));
  }

  selectEffects() {
    return {
      blur: Math.random() > 0.5,
      vignette: Math.random() > 0.7,
      glow: Math.random() > 0.6,
      shadow: true,
      border: Math.random() > 0.8
    };
  }

  async createPrompt(concept) {
    const prompt = `Create a youtube thumbnail background image with the following specifications:
    Style: ${concept.style}
    Color Scheme: ${concept.colors.primary}, ${concept.colors.secondary}, ${concept.colors.accent}
    Elements to include: ${concept.elements.join(', ')}
    Emotional tone: ${concept.emotion}
    Composition: ${concept.composition}
    
    The image must be a clean BACKGROUND ONLY. DO NOT include any text, letters, words, logos, or watermarks.
    Leave space on the left or top for text to be added later.
    Resolution: 1280x720px
    Format: High contrast, clear imagery`;

    return prompt;
  }

  async createThumbnail(concept, script) {
    const width = 1280;
    const height = 720;
    
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_${Date.now()}.png`);
    try {
      const promptText = `Cute children's book cartoon scene: ${script.title}, vibrant colors, epic fantasy lighting, extremely eye-catching, no text, no words, no letters, clear focus, 16:9 aspect ratio`;
      
      const imageProvider = script.imageProvider || 'gemini';
      const imageModel = script.imageModel || 'imagen-4.0-generate-001';
      
      const geminiKey = this.credentials?.credentials?.gemini?.apiKey;
      if (imageProvider === 'openai' && openaiKey && openaiKey !== 'YOUR_OPENAI_API_KEY') {
        this.logger.info(`Generating base AI thumbnail via OpenAI (${imageModel})...`);
        const openai = new OpenAI({ apiKey: openaiKey });
        const response = await openai.images.generate({
          model: imageModel,
          prompt: promptText,
          n: 1,
          size: "1792x1024",
          quality: "hd",
          style: "natural"
        });
        const imageUrl = response.data[0].url;
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        await fs.writeFile(outputPath, imgRes.data);
      } else if (imageProvider === 'openrouter' && openRouterKey && openRouterKey !== 'YOUR_OPENROUTER_API_KEY') {
        this.logger.info(`Generating base AI thumbnail via OpenRouter (${imageModel})...`);
        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: imageModel,
            messages: [{ role: 'user', content: promptText }]
          },
          {
            headers: {
              'Authorization': `Bearer ${openRouterKey}`,
              'HTTP-Referer': 'http://localhost:3456',
              'X-Title': 'Youtube Automation Agent'
            }
          }
        );
        
        const message = response.data.choices[0].message;
        if (message.refusal) {
            throw new Error(`OpenRouter refused request: ${message.refusal}`);
        }
        const content = message.content;
        const urlMatch = content.match(/https?:\/\/[^\s\)]+/);
        if (urlMatch) {
            const imgRes = await axios.get(urlMatch[0], { responseType: 'arraybuffer' });
            await fs.writeFile(outputPath, imgRes.data);
        } else {
            throw new Error(`OpenRouter did not return an image URL. Response: ${content}`);
        }
      } else if (imageProvider === 'gemini' && geminiKey) {
        // Use Gemini Developer API (Imagen)
        this.logger.info(`Generating base AI thumbnail via Gemini ${imageModel}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${geminiKey}`;
        const response = await axios.post(
          url,
          {
            instances: [{ prompt: promptText }],
            parameters: { sampleCount: 1, aspectRatio: "16:9" }
          },
          { headers: { 'Content-Type': 'application/json' } }
        );
        
        const base64Data = response.data.predictions[0].bytesBase64Encoded;
        await fs.writeFile(outputPath, Buffer.from(base64Data, 'base64'));
      } else {
        // Fallback to pollinations.ai
        const prompt = encodeURIComponent(promptText);
        const url = `https://image.pollinations.ai/prompt/${prompt}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
        
        this.logger.info(`Downloading base AI thumbnail from: ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        await fs.writeFile(outputPath, response.data);
      }
    } catch (err) {
      this.logger.warn('Failed to generate AI base thumbnail, falling back to gradient', err);
      // Fallback: Create gradient background
      const svg = `
        <svg width="${width}" height="${height}">
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${this.hexToRgb(concept.colors.primary)};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${this.hexToRgb(concept.colors.secondary)};stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="url(#gradient)" />
        </svg>
      `;
      
      await sharp(Buffer.from(svg))
        .resize(width, height)
        .png()
        .toFile(outputPath);
    }
    
    return outputPath;
  }

  hexToRgb(color) {
    // Color name to hex mapping
    const colors = new Map([
      ['blue', '#0066CC'],
      ['red', '#CC0000'],
      ['green', '#00CC66'],
      ['yellow', '#FFCC00'],
      ['purple', '#6600CC'],
      ['orange', '#FF6600'],
      ['white', '#FFFFFF'],
      ['black', '#000000'],
      ['gray', '#808080'],
      ['dark blue', '#003366'],
      ['gold', '#FFD700']
    ]);

    return colors.get(color) || '#000000';
  }

  async addTextOverlay(imagePath, concept) {
    try {
      this.logger.info(`Adding text overlay to thumbnail using Canvas: ${concept.primaryText}`);
      
      const width = 1280;
      const height = 720;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      
      // Register font if not already registered
      try {
        registerFont(path.resolve(__dirname, '../assets/fonts/Bangers-Regular.ttf'), { family: 'Bangers' });
      } catch (e) {
        this.logger.warn('Could not register Bangers font, falling back to sans-serif', e);
      }
      
      // Draw base image
      const image = await loadImage(imagePath);
      ctx.drawImage(image, 0, 0, width, height);
      
      // Configure text style
      const text = (concept.primaryText || 'CERITA SERU!').toUpperCase();
      ctx.font = '100px "Bangers", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const x = width / 2;
      const y = height * 0.82; // bottom-center
      
      // Draw text shadow
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 8;
      ctx.shadowOffsetY = 8;
      
      // Draw text stroke
      ctx.lineWidth = 15;
      ctx.strokeStyle = '#000000';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      
      // Draw text fill
      ctx.shadowColor = 'transparent'; // Reset shadow for fill
      ctx.fillStyle = '#FFD700'; // Gold/Yellow
      ctx.fillText(text, x, y);
      
      // Save canvas to file
      const outputPath = imagePath.replace(/\\.(jpg|png)$/i, '_text.jpg');
      const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
      await fs.writeFile(outputPath, buffer);
      
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to add text overlay:', error);
      return imagePath; // Return original on failure
    }
  }

  async optimizeForYouTube(imagePath) {
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_optimized_${Date.now()}.jpg`);

    // YouTube optimization: JPEG format, proper compression
    await sharp(imagePath)
      .resize(1280, 720, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({
        quality: 90,
        progressive: true,
        optimizeScans: true
      })
      .toFile(outputPath);

    // Verify file size (YouTube limit is 2MB)
    const stats = await fs.stat(outputPath);
    if (stats.size > 2 * 1024 * 1024) {
      // Re-compress if too large
      await sharp(imagePath)
        .resize(1280, 720)
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    }

    return outputPath;
  }

  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  async generateABVariants(concept) {
    // Generate multiple thumbnail variants for A/B testing
    const variants = [];

    // Variant 1: Different color scheme
    const variant1 = { ...concept };
    variant1.colors = {
      primary: concept.colors.secondary,
      secondary: concept.colors.primary,
      accent: concept.colors.accent
    };
    variants.push(await this.createThumbnail(variant1));

    // Variant 2: Different text 
    const variant2 = { ...concept };
    variant2.primaryText = this.generateAlternativeText(concept.primaryText);
    variants.push(await this.createThumbnail(variant2));

    // Variant 3: Different composition
    const variant3 = { ...concept };
    variant3.composition = 'centered';
    variants.push(await this.createThumbnail(variant3));

    return variants;
  }

  generateAlternativeText(originalText) {
    const alternatives = new Map([
      ['HOW', 'WHY'],
      ['BEST', 'TOP'],
      ['GUIDE', 'SECRETS'],
      ['TRUTH', 'FACTS'],
      ['ULTIMATE', 'COMPLETE'],
      // Indonesian warm children story terms
      ['AJAIB', 'INDAH'],
      ['RAHASIA', 'MISTERI'],
      ['KISAH', 'DONGENG'],
      ['SERU', 'HEBAT'],
      ['PINTAR', 'HEBAT']
    ]);

    return alternatives.get(originalText) || originalText + '!';
  }
}

module.exports = { ThumbnailDesignerAgent };