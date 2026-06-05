const path = require('path');
const fs = require('fs').promises;
const { Logger } = require('../utils/logger');
const { AIVideoGenerator } = require('../utils/ai-video-generator');

class ProductionManagementAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ProductionManagement');
    this.pipeline = [];
    this.assets = new Map();
    this.aiVideoGenerator = new AIVideoGenerator(credentials);
  }

  async initialize() {
    this.logger.info('Initializing Production Management Agent...');
    await this.setupDirectories();
    await this.loadPipeline();
    return true;
  }

  async setupDirectories() {
    const dirs = [
      'data/production',
      'data/assets',
      'data/videos',
      'data/audio',
      'data/scripts',
      'temp/processing'
    ];

    for (const dir of dirs) {
      await fs.mkdir(path.join(__dirname, '..', dir), { recursive: true });
    }
  }

  async loadPipeline() {
    try {
      const pipeline = await this.db.getProductionPipeline();
      this.pipeline = pipeline || [];
    } catch (error) {
      this.logger.warn('No existing pipeline found, starting fresh');
    }
  }

  async processContent(contentData) {
    try {
      this.logger.info('Processing content for production...');
      
      const { strategy, script, thumbnail, seo, videoFormat } = contentData;
      
      // Create production entry
      const productionId = this.generateProductionId();
      
      const productionData = {
        id: productionId,
        strategy,
        script,
        thumbnail,
        seo,
        status: 'processing',
        assets: {
          script: await this.processScript(script),
          thumbnail: await this.processThumbnail(thumbnail),
          audio: null, // Will be generated later
          video: null, // Will be generated later
          captions: null // Will be generated later
        },
        timeline: {
          created: new Date().toISOString(),
          scriptReady: new Date().toISOString(),
          thumbnailReady: new Date().toISOString(),
          audioGenerated: null,
          videoGenerated: null,
          captionsGenerated: null,
          readyForUpload: null
        },
        scheduledPublishTime: this.calculatePublishTime(strategy),
        priority: this.calculatePriority(strategy),
        estimatedDuration: script.duration,
        createdAt: new Date().toISOString()
      };
      
      // Add to pipeline
      this.pipeline.push(productionData);
      
      // Save to database
      await this.db.saveProductionData(productionData);
      
      if (contentData.testMode === 'audio_only') {
        this.logger.info('Test mode: audio_only. Skipping video rendering.');
        await this.generateAudioNarration(productionData);
        productionData.status = 'ready (audio-only)';
        productionData.timeline.readyForUpload = new Date().toISOString();
        await this.db.updateProductionData(productionData);
        return productionData;
      }
      
      // Generate video content
      await this.generateVideoContent(productionData);
      
      // Generate audio narration
      await this.generateAudioNarration(productionData);
      
      // Generate captions
      await this.generateCaptions(productionData);
      
      // Final assembly
      await this.assembleVideo(productionData, videoFormat);
      
      // Generate YouTube Shorts from main video
      if (productionData.assets.finalVideo && productionData.assets.finalVideo.path) {
        const shortVideoPath = productionData.assets.finalVideo.path.replace('.mp4', '_shorts.mp4');
        const generatedShort = await this.aiVideoGenerator.generateShortVideo(
          productionData.assets.finalVideo.path, 
          shortVideoPath
        );
        if (generatedShort) {
          productionData.assets.shortsVideo = { path: generatedShort };
        }
      }
      
      // Mark as ready
      productionData.status = 'ready';
      productionData.timeline.readyForUpload = new Date().toISOString();
      
      await this.db.updateProductionData(productionData);
      
      this.logger.info(`Content processing complete: ${productionId}`);
      return productionData;
    } catch (error) {
      this.logger.error('Failed to process content:', error);
      throw error;
    }
  }

  generateProductionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extra = Math.random().toString(36).substring(2, 15);
    return `prod_${timestamp}_${random}_${extra}`;
  }

  async processScript(script) {
    const scriptPath = path.join(__dirname, '..', 'data', 'scripts', `${Date.now()}_script.json`);
    
    // Create formatted script for TTS
    const ttsScript = this.formatScriptForTTS(script);
    
    // Save script files
    await fs.writeFile(scriptPath, JSON.stringify(script, null, 2));
    await fs.writeFile(
      scriptPath.replace('.json', '_tts.txt'), 
      ttsScript
    );
    
    return {
      originalPath: scriptPath,
      ttsPath: scriptPath.replace('.json', '_tts.txt'),
      duration: script.duration,
      sections: script.mainContent.sections.length
    };
  }

  formatScriptForTTS(script) {
    let ttsText = '';
    
    // Add hook
    if (script.hook) {
      ttsText += `${script.hook.text}\n\n`;
    }
    
    // Add introduction
    if (script.introduction) {
      ttsText += `${script.introduction.greeting}\n`;
      ttsText += `${script.introduction.topicIntro}\n`;
      ttsText += `${script.introduction.valueProposition}\n`;
      ttsText += `${script.introduction.credibility}\n\n`;
    }
    
    // Add main content
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach((section, index) => {
        // Skip adding explicit "Section X" to make the story flow naturally for children
        
        if (Array.isArray(section.content)) {
          section.content.forEach(line => {
            if (typeof line === 'string' && !line.startsWith('[')) {
              ttsText += `${line}\n`;
            }
          });
        } else if (section.steps) {
          section.steps.forEach(step => {
            ttsText += `${step.title}. ${step.description}\n`;
            ttsText += `${step.tip}\n`;
          });
        } else if (section.items) {
          section.items.forEach(item => {
            ttsText += `${item.title}. ${item.description}\n`;
          });
        } else if (typeof section.content === 'string') {
          ttsText += `${section.content}\n`;
        }
        
        ttsText += '\n';
      });
    }
    
    // Add conclusion
    if (script.conclusion) {
      script.conclusion.recap.forEach(line => {
        if (typeof line === 'string') {
          ttsText += `${line}\n`;
        }
      });
      ttsText += `\n${script.conclusion.finalThought}\n\n`;
    }
    
    // Add CTA
    if (script.callToAction) {
      ttsText += `${script.callToAction.subscribe}\n`;
      ttsText += `${script.callToAction.like}\n`;
      ttsText += `${script.callToAction.comment}\n`;
    }
    
    return ttsText;
  }

  async processThumbnail(thumbnail) {
    if (!thumbnail) return null; // Skip if no thumbnail is provided
    
    try {
      if (!thumbnail.path) {
        throw new Error('Thumbnail path is missing');
      }

      // We already have a beautifully designed thumbnail with text overlay from ThumbnailDesignerAgent!
      return {
        path: thumbnail.path,
        originalPath: thumbnail.path,
        dimensions: thumbnail.dimensions || { width: 1280, height: 720 },
        fileSize: thumbnail.fileSize || 0,
        generatedWith: 'ThumbnailDesigner'
      };
    } catch (error) {
      this.logger.error('AI thumbnail generation failed:', error);
      
      // Fallback to original processing
      const productionThumbnailPath = path.join(
        __dirname, '..', 'data', 'assets', 
        `thumbnail_${Date.now()}.jpg`
      );
      
      if (thumbnail.path && await fs.access(thumbnail.path).then(() => true).catch(() => false)) {
        const originalBuffer = await fs.readFile(thumbnail.path);
        await fs.writeFile(productionThumbnailPath, originalBuffer);
      } else {
        // Create placeholder
        await fs.writeFile(productionThumbnailPath + '.placeholder', 'Thumbnail placeholder');
      }
      
      return {
        path: productionThumbnailPath,
        originalPath: thumbnail.path,
        dimensions: thumbnail.dimensions || { width: 1792, height: 1024 },
        fileSize: thumbnail.fileSize || 0
      };
    }
  }

  calculatePublishTime(strategy) {
    // Use strategy's recommended time or calculate optimal time
    if (strategy.bestPublishTime) {
      return strategy.bestPublishTime;
    }
    
    // Default: next optimal publishing window
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0); // 2 PM default
    
    return tomorrow.toISOString();
  }

  calculatePriority(strategy) {
    let priority = 50; // Base priority
    
    // Adjust based on estimated views
    if (strategy.estimatedViews > 100000) priority += 30;
    else if (strategy.estimatedViews > 50000) priority += 20;
    else if (strategy.estimatedViews > 10000) priority += 10;
    
    // Adjust based on trend score
    if (strategy.competitorAnalysis && strategy.competitorAnalysis.length > 0) {
      priority += 10;
    }
    
    // Time sensitivity
    const hoursUntilPublish = (new Date(strategy.bestPublishTime) - new Date()) / (1000 * 60 * 60);
    if (hoursUntilPublish < 24) priority += 20;
    else if (hoursUntilPublish < 48) priority += 10;
    
    return Math.min(100, priority);
  }

  async generateVideoContent(productionData) {
    this.logger.info('Generating AI video content...');
    
    try {
      const { strategy, script } = productionData;
      
      // Extract script segments for per-slide generation
      const segments = this.extractScriptSegments(script);
      productionData.assets.segments = segments;
      
      const visualAssets = [];
      const imageProvider = script.imageProvider || 'gemini';
      const imageModel = script.imageModel || 'imagen-4.0-fast-generate-001';
      const isShort = productionData.strategy?.videoType === 'short';
      
      for (const segment of segments) {
        const assets = await this.aiVideoGenerator.generateVisualAssets(segment.prompt, 'ethereal', 1, imageProvider, imageModel, isShort);
        segment.imagePath = assets[0];
        visualAssets.push(...assets);
      }
      
      productionData.assets.video = {
        visualAssets: visualAssets,
        duration: productionData.estimatedDuration,
        format: 'mp4',
        resolution: '1920x1080',
        fps: 30,
        generatedWith: 'AI'
      };
      
      productionData.timeline.videoGenerated = new Date().toISOString();
      
      return visualAssets;
    } catch (error) {
      this.logger.error('AI video content generation failed:', error);
      // Fallback to placeholder
      return await this.createVideoElements(productionData);
    }
  }

  async createVideoElements(productionData) {
    const { script } = productionData;
    const elements = [];
    
    // Title slide
    elements.push({
      type: 'title_slide',
      content: script.title,
      duration: 3,
      style: 'modern',
      animation: 'fade_in'
    });
    
    // Content sections
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach((section, index) => {
        // Section title
        elements.push({
          type: 'section_title',
          content: section.title,
          duration: 2,
          style: 'minimal',
          animation: 'slide_in'
        });
        
        // Content visuals
        if (section.type === 'list_items' && section.items) {
          section.items.forEach(item => {
            elements.push({
              type: 'list_item',
              content: {
                number: item.number,
                title: item.title,
                description: item.description
              },
              duration: 15,
              style: 'countdown',
              animation: 'zoom_in'
            });
          });
        } else if (section.type === 'solution_steps' && section.steps) {
          section.steps.forEach(step => {
            elements.push({
              type: 'step',
              content: {
                number: step.number,
                title: step.title,
                description: step.description
              },
              duration: 20,
              style: 'tutorial',
              animation: 'step_by_step'
            });
          });
        } else {
          // Generic content slide
          elements.push({
            type: 'content_slide',
            content: section.title,
            duration: section.duration || 30,
            style: 'informative',
            animation: 'fade_transition'
          });
        }
      });
    }
    
    // Conclusion slide
    elements.push({
      type: 'conclusion',
      content: 'Key Takeaways',
      duration: 5,
      style: 'summary',
      animation: 'reveal'
    });
    
    // Subscribe reminder
    elements.push({
      type: 'subscribe_reminder',
      content: 'Subscribe for More!',
      duration: 3,
      style: 'call_to_action',
      animation: 'bounce'
    });
    
    return elements;
  }

  async generateAudioNarration(productionData) {
    this.logger.info('Generating AI audio narration...');
    
    try {
      const { script } = productionData;
      const audioPath = path.join(__dirname, '..', 'data', 'audio', `${productionData.id}_narration.mp3`);
      
      // Read the TTS script (we keep this for logging, but we will generate per-segment)
      const ttsText = await fs.readFile(productionData.assets.script.ttsPath, 'utf8');
      
      // Generate audio using AI TTS per segment
      const segments = productionData.assets.segments || this.extractScriptSegments(script);
      productionData.assets.segments = segments;
      
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segAudioPath = path.join(__dirname, '..', 'data', 'audio', `${productionData.id}_seg_${i}.mp3`);
        await this.aiVideoGenerator.generateTTSAudio(seg.text, segAudioPath);
        seg.audioPath = segAudioPath;
      }
      
      // We will still keep a main audio path if needed, but per-slide assembly will use seg.audioPath
      // Just write the first segment to audioPath to prevent errors in probing if anything falls back
      if (segments.length > 0 && segments[0].audioPath) {
        await fs.copyFile(segments[0].audioPath, audioPath);
      }
      
      productionData.assets.audio = {
        path: audioPath,
        duration: productionData.estimatedDuration,
        format: 'mp3',
        generatedWith: 'AI',
        quality: 'high'
      };
      
      productionData.timeline.audioGenerated = new Date().toISOString();
      
      return audioPath;
    } catch (error) {
      this.logger.error('AI audio generation failed:', error);
      // Fallback to simulation
      return await this.simulateAudioGeneration(productionData);
    }
  }

  async simulateTTSGeneration(scriptPath, outputPath, config) {
    // This is a simulation - in production, you'd integrate with actual TTS services
    this.logger.info(`Simulating TTS generation: ${config.voice}`);
    
    // Create a placeholder audio file reference
    await fs.writeFile(outputPath + '.info', JSON.stringify({
      message: 'TTS audio would be generated here',
      config,
      timestamp: new Date().toISOString()
    }, null, 2));
  }

  async generateCaptions(productionData) {
    this.logger.info('Generating captions...');
    
    const captionsPath = path.join(__dirname, '..', 'data', 'captions', `${productionData.id}_captions.srt`);
    
    // Generate SRT captions based on script timing
    const captions = await this.createSRTCaptions(productionData);
    
    await fs.mkdir(path.dirname(captionsPath), { recursive: true });
    await fs.writeFile(captionsPath, captions);
    
    productionData.assets.captions = {
      path: captionsPath,
      format: 'srt',
      language: 'en',
      autoGenerated: true
    };
    
    productionData.timeline.captionsGenerated = new Date().toISOString();
    
    return captionsPath;
  }

  async createSRTCaptions(productionData) {
    const { script } = productionData;
    let srt = '';
    let captionIndex = 1;
    let currentTime = 0;
    
    // Helper function to format time for SRT
    const formatSRTTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    
    // Process script sections for captions
    const processText = (text, startTime, duration) => {
      const words = text.split(' ');
      const wordsPerCaption = 8; // Optimal words per caption
      
      for (let i = 0; i < words.length; i += wordsPerCaption) {
        const captionWords = words.slice(i, i + wordsPerCaption);
        const captionDuration = (duration / Math.ceil(words.length / wordsPerCaption));
        const captionStartTime = startTime + (i / words.length) * duration;
        const captionEndTime = captionStartTime + captionDuration;
        
        srt += `${captionIndex}\n`;
        srt += `${formatSRTTime(captionStartTime)} --> ${formatSRTTime(captionEndTime)}\n`;
        srt += `${captionWords.join(' ')}\n\n`;
        
        captionIndex++;
      }
    };
    
    // Hook
    if (script.hook && script.hook.text) {
      processText(script.hook.text, currentTime, 5);
      currentTime += 5;
    }
    
    // Introduction
    if (script.introduction) {
      const introText = `${script.introduction.greeting} ${script.introduction.topicIntro} ${script.introduction.valueProposition}`;
      processText(introText, currentTime, 15);
      currentTime += 15;
    }
    
    // Main content
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        let sectionText = '';
        
        if (Array.isArray(section.content)) {
          sectionText = section.content.filter(line => 
            typeof line === 'string' && !line.startsWith('[')
          ).join(' ');
        } else if (section.steps) {
          sectionText = section.steps.map(step => 
            `${step.title}. ${step.description}`
          ).join(' ');
        } else if (section.items) {
          sectionText = section.items.map(item => 
            `Number ${item.number}: ${item.title}. ${item.description}`
          ).join(' ');
        } else if (typeof section.content === 'string') {
          sectionText = section.content;
        }
        
        if (sectionText) {
          processText(sectionText, currentTime, section.duration || 60);
          currentTime += section.duration || 60;
        }
      });
    }
    
    // Conclusion
    if (script.conclusion) {
      const conclusionText = script.conclusion.recap.join(' ') + ' ' + script.conclusion.finalThought;
      processText(conclusionText, currentTime, 30);
      currentTime += 30;
    }
    
    return srt;
  }

  async assembleVideo(productionData, videoFormat = 'slideshow') {
    this.logger.info(`Assembling final video using format: ${videoFormat}`);
    
    try {
      const finalVideoPath = path.join(__dirname, '..', 'data', 'videos', `${productionData.id}_final.mp4`);
      
      // Use AI Video Generator to create the final video
      await this.aiVideoGenerator.generateVideo(
        productionData.script,
        productionData.assets.video.visualAssets || [],
        productionData.assets.audio.path,
        finalVideoPath,
        videoFormat,
        productionData.assets.segments
      );
      
      // Get file stats
      const stats = await fs.stat(finalVideoPath);
      
      productionData.assets.finalVideo = {
        path: finalVideoPath,
        fileSize: stats.size,
        duration: productionData.estimatedDuration,
        generatedWith: 'AI',
        resolution: '1920x1080',
        format: 'mp4'
      };
      
      this.logger.info('AI video assembly complete');
      return finalVideoPath;
    } catch (error) {
      this.logger.error('AI video assembly failed:', error);
      // Fallback to simulation
      return await this.simulateVideoAssembly(productionData);
    }
  }

  async simulateVideoRendering(instructions) {
    this.logger.info('Simulating video rendering...');
    
    // Create a placeholder that indicates video would be rendered
    await fs.writeFile(instructions.outputPath + '.placeholder', JSON.stringify({
      message: 'Final video would be rendered here',
      instructions,
      timestamp: new Date().toISOString()
    }, null, 2));
  }

  async getPipelineStatus() {
    return this.pipeline.map(item => ({
      id: item.id,
      title: item.script?.title || 'Untitled',
      status: item.status,
      priority: item.priority,
      scheduledPublishTime: item.scheduledPublishTime,
      progress: this.calculateProgress(item)
    }));
  }

  calculateProgress(productionData) {
    const milestones = [
      'scriptReady',
      'thumbnailReady',
      'audioGenerated',
      'videoGenerated',
      'captionsGenerated',
      'readyForUpload'
    ];
    
    const completed = milestones.filter(milestone => 
      productionData.timeline[milestone] !== null
    ).length;
    
    return Math.round((completed / milestones.length) * 100);
  }

  async getNextReadyContent() {
    const ready = this.pipeline
      .filter(item => item.status === 'ready')
      .sort((a, b) => b.priority - a.priority);
    
    return ready[0] || null;
  }

  // Extract segments mapping 1-to-1 audio and visual for perfect synchronization
  extractScriptSegments(script) {
    const segments = [];
    
    // Add hook
    if (script.hook && script.hook.text) {
      segments.push({
        type: 'hook',
        text: script.hook.text,
        prompt: `${script.title}, ${script.hook.text}, vibrant children storybook illustration`
      });
    }
    
    // Add introduction
    if (script.introduction) {
      const introText = [
        script.introduction.greeting,
        script.introduction.topicIntro,
        script.introduction.valueProposition,
        script.introduction.credibility
      ].filter(Boolean).join('. ');
      if (introText.length > 5) {
        segments.push({
          type: 'intro',
          text: introText,
          prompt: `${script.title}, introduction scene, vibrant children storybook illustration`
        });
      }
    }
    
    // Add main content
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach((section) => {
        let text = '';
        if (Array.isArray(section.content)) {
          text = section.content.filter(line => typeof line === 'string' && !line.startsWith('[')).join(' ');
        } else if (section.steps) {
          text = section.steps.map(step => `${step.title}. ${step.description} ${step.tip}`).join(' ');
        } else if (section.items) {
          text = section.items.map(item => `${item.title}. ${item.description}`).join(' ');
        } else if (typeof section.content === 'string') {
          text = section.content;
        }
        
        if (text.length > 5) {
           const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
           let currentChunk = [];
           for (const sentence of sentences) {
             currentChunk.push(sentence);
             if (currentChunk.length >= 2) {
               const chunkText = currentChunk.join(' ');
               segments.push({
                 type: 'content',
                 text: chunkText,
                 prompt: `${chunkText}, vibrant children storybook illustration`,
                 sfx_keywords: section.sfx_keywords
               });
               currentChunk = [];
             }
           }
           if (currentChunk.length > 0) {
             const chunkText = currentChunk.join(' ');
             segments.push({
               type: 'content',
               text: chunkText,
               prompt: `${chunkText}, vibrant children storybook illustration`,
               sfx_keywords: section.sfx_keywords
             });
           }
        }
      });
    }
    
    // Add conclusion
    if (script.conclusion) {
      const recapText = Array.isArray(script.conclusion.recap) ? script.conclusion.recap.join(' ') : '';
      const concText = `${recapText} ${script.conclusion.finalThought || ''}`.trim();
      if (concText.length > 5) {
        segments.push({
          type: 'conclusion',
          text: concText,
          prompt: `Conclusion scene, ${script.title}, happy ending, vibrant children storybook illustration`
        });
      }
    }
    
    // Add CTA
    if (script.callToAction) {
      const ctaText = [
        script.callToAction.subscribe,
        script.callToAction.like,
        script.callToAction.comment
      ].filter(Boolean).join('. ');
      
      if (ctaText.length > 5) {
        segments.push({
          type: 'cta',
          text: ctaText,
          prompt: `Subscribe and like button, YouTube UI, happy characters waving goodbye, vibrant children storybook illustration`
        });
      }
    }
    
    // Minimum segments fallback just in case script parsing failed entirely
    if (segments.length === 0) {
       segments.push({
         type: 'fallback',
         text: script.title,
         prompt: `${script.title}, vibrant children storybook illustration`
       });
    }
    
    return segments;
  }

  // Fallback simulation methods
  async simulateAudioGeneration(productionData) {
    const audioPath = path.join(__dirname, '..', 'data', 'audio', `${productionData.id}_narration.mp3`);
    
    await fs.writeFile(audioPath + '.info', JSON.stringify({
      message: 'AI TTS audio would be generated here',
      timestamp: new Date().toISOString()
    }, null, 2));
    
    productionData.assets.audio = {
      path: audioPath + '.info',
      duration: productionData.estimatedDuration,
      format: 'mp3',
      simulated: true
    };
    
    return audioPath + '.info';
  }

  async simulateVideoAssembly(productionData) {
    const finalVideoPath = path.join(__dirname, '..', 'data', 'videos', `${productionData.id}_final.mp4`);
    
    const assemblyInstructions = {
      message: 'AI video would be assembled here',
      assets: productionData.assets,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(
      finalVideoPath + '.assembly.json',
      JSON.stringify(assemblyInstructions, null, 2)
    );
    
    productionData.assets.finalVideo = {
      path: finalVideoPath + '.assembly.json',
      fileSize: 0,
      duration: productionData.estimatedDuration,
      simulated: true
    };
    
    return finalVideoPath + '.assembly.json';
  }
}

module.exports = { ProductionManagementAgent };