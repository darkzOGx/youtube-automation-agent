const OpenAI = require('openai');
const Replicate = require('replicate');
const { LLMClient } = require('./llm-client');
const { generateRouterImage, isRouterImageConfigured } = require('./image-router');
const fs = require('fs').promises;
const standardFs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { Logger } = require('./logger');
const { runFFmpeg, getMediaDuration, checkFFmpeg, ffmpegInstallHint } = require('./ffmpeg');
const { MediaGenerationService } = require('./media-generation-service');

// Image providers handled by the fork's narration-driven scene pipeline
// (LLM scene prompt + router / OpenRouter / Gemini Imagen REST, pollinations.ai fallback).
const SCENE_IMAGE_PROVIDERS = new Set(['router', 'openrouter', 'gemini']);

class AIVideoGenerator {
  constructor(credentials, options = {}) {
    this.logger = new Logger('AIVideoGenerator');
    // Support either raw credentials JSON or the CredentialManager instance
    const resolvedCredentials = credentials?.credentials || credentials || {};
    this.db = options.db || null;
    this.getMediaDuration = options.getMediaDuration || getMediaDuration;
    this.lastVideoResult = null;
    this.lastNarrationResult = null;

    // Initialize AI services with graceful fallback
    const openaiKey = resolvedCredentials.openai?.apiKey || process.env.OPENAI_API_KEY;
    const replicateKey = resolvedCredentials.replicate?.apiKey || process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    const geminiKey = resolvedCredentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    const openRouterKey = resolvedCredentials.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;

    this.openRouterKey = openRouterKey;
    if (openaiKey && !openaiKey.includes('YOUR_OPENAI_API_KEY')) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.logger.info('OpenAI service initialized');
    } else {
      this.logger.warn('OpenAI API key not found or placeholder');
    }

    // Gemini key is kept for Imagen image generation; text goes through the shared LLM client.
    this.geminiKey = geminiKey;
    this.llm = new LLMClient(credentials || {});

    if (replicateKey) {
      this.replicate = new Replicate({ auth: replicateKey });
      this.logger.info('Replicate service initialized');
    } else {
      this.logger.warn('Replicate API key not found - advanced video generation unavailable');
    }

    // Gemini media generation (images + native TTS) — free-tier alternative to OpenAI
    if (geminiKey) {
      try {
        const { GoogleGenAI } = require('@google/genai');
        this.gemini = new GoogleGenAI({ apiKey: geminiKey });
        this.logger.info('Gemini media service initialized (images + TTS)');
      } catch (error) {
        this.logger.warn('Failed to initialize Gemini media service:', error.message);
      }
    }

    // ElevenLabs configuration
    this.elevenLabsApiKey = resolvedCredentials.elevenLabs?.apiKey || process.env.ELEVENLABS_API_KEY;
    this.elevenLabsVoiceId = resolvedCredentials.elevenLabs?.voiceId || process.env.ELEVENLABS_VOICE_ID;
    this.elevenLabsModel = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3';

    // Azure Speech configuration
    this.azureSpeechKey = resolvedCredentials.azure?.speechKey || process.env.AZURE_SPEECH_KEY;
    this.azureSpeechRegion = resolvedCredentials.azure?.speechRegion || process.env.AZURE_SPEECH_REGION;
    this.mediaGeneration = options.mediaGeneration || (this.db
      ? new MediaGenerationService(this.db, resolvedCredentials, { logger: this.logger })
      : null);
  }

  async generateTTSAudio(text, outputPath) {
    this.logger.info('Generating TTS audio...');
    this.lastNarrationResult = null;

    // Providers are tried in order; a failing provider falls through to the next one.
    // Microsoft Edge Neural TTS is free and keyless, so it is always the final live option.
    const attempts = [];
    if (this.elevenLabsApiKey && this.elevenLabsVoiceId) {
      attempts.push({ provider: 'elevenlabs', model: this.elevenLabsModel, run: () => this.generateElevenLabsTTS(text, outputPath) });
    }
    if (this.openai) {
      attempts.push({ provider: 'openai', model: 'gpt-4o-mini-tts', run: () => this.generateOpenAITTS(text, outputPath) });
    }
    if (this.gemini) {
      attempts.push({ provider: 'gemini', model: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview', run: () => this.generateGeminiTTS(text, outputPath) });
    }
    attempts.push({ provider: 'msedge', model: process.env.EDGE_TTS_VOICE || 'id-ID-GadisNeural', run: () => this.generateMsEdgeTTS(text, outputPath) });

    let lastError = null;
    let lastAttempt = null;
    for (const attempt of attempts) {
      lastAttempt = attempt;
      try {
        const generatedPath = await attempt.run();
        const usable = await this.isUsableAudioFile(generatedPath);
        if (!usable) throw new Error(`${attempt.provider} returned an empty audio file`);
        this.lastNarrationResult = {
          status: 'ready',
          path: generatedPath,
          provider: attempt.provider,
          model: attempt.model,
          externalTaskId: null,
          generatedAt: new Date().toISOString(),
          simulated: false,
          cost: { provider: attempt.provider, amount: null, currency: null, invoiceRequired: attempt.provider !== 'msedge' }
        };
        return generatedPath;
      } catch (error) {
        lastError = error;
        this.logger.warn(`${attempt.provider} TTS failed (${error.message}), trying the next provider...`);
      }
    }

    const provider = lastAttempt?.provider || 'simulation';
    this.lastNarrationResult = {
      status: 'failed', path: null, provider, model: lastAttempt?.model || null, externalTaskId: null,
      generatedAt: new Date().toISOString(), simulated: false, error: lastError?.message || 'No TTS provider succeeded',
      cost: { provider, amount: null, currency: null, invoiceRequired: false }
    };
    this.logger.error('All TTS generation methods failed:', lastError);
    throw lastError || new Error('No TTS provider succeeded');
  }

  async generateMsEdgeTTS(text, outputPath) {
    this.logger.info('Generating free Microsoft Edge Neural TTS audio...');

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      try {
        const tts = new MsEdgeTTS();
        const format = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3 || "audio-24khz-96kbitrate-mono-mp3";
        await tts.setMetadata(process.env.EDGE_TTS_VOICE || "id-ID-GadisNeural", format);

        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        const fileStream = standardFs.createWriteStream(outputPath);

        const { audioStream } = tts.toStream(text);
        audioStream.pipe(fileStream);

        fileStream.on("finish", () => {
          this.logger.info('Microsoft Edge Neural TTS generation complete');
          resolve(outputPath);
        });

        audioStream.on("error", (err) => {
          this.logger.error('Microsoft Edge Neural TTS stream error:', err);
          reject(err);
        });
        fileStream.on("error", reject);
      } catch (error) {
        this.logger.error('Microsoft Edge Neural TTS generation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Join per-segment narration files into one continuous narration track, so the
   * full-narration consumers (assembly gate, hybrid provider video, scene repair)
   * see the whole story rather than the first segment only.
   */
  async concatAudioFiles(audioPaths, outputPath) {
    const inputs = [];
    for (const audioPath of audioPaths) {
      if (await this.isUsableAudioFile(audioPath)) inputs.push(audioPath);
    }
    if (!inputs.length) throw new Error('No usable audio segments to join');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    if (inputs.length === 1) {
      if (inputs[0] !== outputPath) await fs.copyFile(inputs[0], outputPath);
      return outputPath;
    }
    const args = ['-y'];
    inputs.forEach(input => args.push('-i', input));
    const labels = inputs.map((_, index) => `[${index}:a]aresample=44100,aformat=channel_layouts=mono[a${index}]`);
    labels.push(`${inputs.map((_, index) => `[a${index}]`).join('')}concat=n=${inputs.length}:v=0:a=1[aout]`);
    args.push('-filter_complex', labels.join(';'), '-map', '[aout]', '-c:a', 'libmp3lame', '-b:a', '128k', outputPath);
    await runFFmpeg(args);
    return outputPath;
  }

  async generateElevenLabsTTS(text, outputPath) {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`;
    
    const data = {
      text: text,
      model_id: this.elevenLabsModel,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    };

    const response = await axios({
      method: 'POST',
      url: url,
      data: data,
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.elevenLabsApiKey
      },
      responseType: 'stream'
    });

    const writer = standardFs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        this.logger.info('ElevenLabs TTS generation complete');
        resolve(outputPath);
      });
      writer.on('error', reject);
    });
  }

  async generateOpenAITTS(text, outputPath) {
    const response = await this.openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: text,
      speed: 1.0
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);

    this.logger.info('OpenAI TTS generation complete');
    return outputPath;
  }

  async generateGeminiTTS(text, outputPath) {
    const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
    const voiceName = process.env.GEMINI_TTS_VOICE || 'Kore';

    const response = await this.gemini.models.generateContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error('Gemini TTS returned no audio data');
    }

    // Gemini returns raw PCM (24kHz, mono, 16-bit); encode to the requested container via FFmpeg
    const pcmPath = outputPath + '.pcm';
    await fs.writeFile(pcmPath, Buffer.from(audioData, 'base64'));
    await runFFmpeg(['-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcmPath, outputPath]);
    await fs.unlink(pcmPath).catch(() => {});

    this.logger.info('Gemini TTS generation complete');
    return outputPath;
  }

  resolveImageProvider(imageProvider = null) {
    const requested = String(imageProvider || process.env.IMAGE_PROVIDER || 'auto').trim().toLowerCase();
    if (requested === 'router' && !isRouterImageConfigured()) {
      this.logger.warn('IMAGE_PROVIDER=router but no image router is configured (IMAGE_BASE_URL / LLM_FALLBACK_BASE_URL); using automatic provider selection.');
      return 'auto';
    }
    return requested;
  }

  hasImageProvider() {
    return Boolean(this.openai || this.gemini || this.geminiKey || isRouterImageConfigured() || this.llm.isAvailable());
  }

  async generateVisualAssets(prompt, style = "ethereal", count = 1, imageProvider = null, imageModel = null, isShort = false) {
    const provider = this.resolveImageProvider(imageProvider);
    this.logger.info(`Generating ${count} visual assets with style: ${style} (provider: ${provider}, isShort: ${isShort})`);

    try {
      if (!this.hasImageProvider()) {
        return await this.simulateVisualAssets(prompt, style, count);
      }

      if (SCENE_IMAGE_PROVIDERS.has(provider)) {
        return await this.generateSceneVisualAssets(prompt, count, provider, imageModel, isShort);
      }

      // Automatic / OpenAI selection: style-enhanced prompt through the configured image provider chain.
      if (!this.openai && !this.gemini && !isRouterImageConfigured()) {
        // Only Gemini Imagen REST or the LLM + pollinations.ai path is available.
        return await this.generateSceneVisualAssets(prompt, count, 'gemini', imageModel, isShort);
      }

      const enhancedPrompt = this.enhanceVisualPrompt(prompt, style, isShort);
      const localPaths = [];

      for (let i = 0; i < count; i++) {
        const imagePath = path.join(__dirname, '..', 'data', 'assets', `visual_${Date.now()}_${i}.png`);
        await this.generateImage(enhancedPrompt, imagePath, { provider, model: imageModel, isPortrait: isShort });
        localPaths.push(imagePath);
      }

      this.logger.info(`Generated ${localPaths.length} visual assets`);
      return localPaths;
    } catch (error) {
      this.logger.error('Visual asset generation failed:', error);
      return await this.simulateVisualAssets(prompt, style, count);
    }
  }

  /**
   * Turn the (usually Indonesian) narration into an English image prompt that depicts
   * the main action being narrated, so the slide matches what the viewer hears.
   */
  async buildScenePrompt(prompt, isShort = false) {
    let sceneDescription = prompt;
    if (this.llm.isAvailable()) {
      try {
        const instruction = `You write prompts for an AI image generator that illustrates a children's storybook video. The text below is narration (often in Bahasa Indonesia) for one slide. Write one English image prompt, under 60 words, that depicts the main action the narration describes: who is doing what, where. Include each character's appearance so the scene can be drawn without the rest of the story. Reply with the prompt only.\n\nNarration:\n${prompt}`;
        const enhancedText = (await this.llm.generate({ prompt: instruction })).replace(/["']/g, '');
        if (enhancedText) sceneDescription = enhancedText;
        this.logger.info(`LLM scene prompt: "${sceneDescription}"`);
      } catch (enhanceError) {
        this.logger.warn(`Scene prompt enhancement failed, using raw narration: ${enhanceError.message}`);
      }
    }

    return `${sceneDescription}, cute children's book cartoon style, vibrant colors, highly detailed, no text, ${isShort ? '9:16' : '16:9'} aspect ratio`;
  }

  async generateSceneVisualAssets(prompt, count, imageProvider, imageModel, isShort) {
    const finalPrompt = await this.buildScenePrompt(prompt, isShort);
    const localPaths = [];

    for (let i = 0; i < count; i++) {
      const imagePath = path.join(__dirname, '..', 'data', 'assets', `visual_${Date.now()}_${i}.png`);
      await fs.mkdir(path.dirname(imagePath), { recursive: true });

      try {
        if (imageProvider === 'router') {
          this.logger.info(`Generating visual asset via image router (${imageModel || process.env.IMAGE_MODEL || 'default'})...`);
          await generateRouterImage({ prompt: finalPrompt, model: imageModel, outputPath: imagePath, isPortrait: isShort });
        } else if (imageProvider === 'openrouter' && this.openRouterKey && this.openRouterKey !== 'YOUR_OPENROUTER_API_KEY') {
          // Use OpenRouter
          this.logger.info(`Generating visual asset via OpenRouter (${imageModel})...`);
          const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model: imageModel,
              messages: [{ role: 'user', content: finalPrompt }]
            },
            {
              headers: {
                'Authorization': `Bearer ${this.openRouterKey}`,
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
          const urlMatch = content.match(/https?:\/\/[^\s)]+/);
          if (urlMatch) {
            const imgRes = await axios.get(urlMatch[0], { responseType: 'arraybuffer' });
            await fs.writeFile(imagePath, imgRes.data);
          } else {
            throw new Error(`OpenRouter did not return an image URL. Response: ${content}`);
          }
        } else if (this.geminiKey) {
          // Use Gemini Developer API (Imagen 4)
          const model = imageModel || process.env.GEMINI_IMAGEN_MODEL || 'imagen-4.0-fast-generate-001';
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${this.geminiKey}`;
          const response = await axios.post(
            url,
            {
              instances: [{ prompt: finalPrompt }],
              parameters: { sampleCount: 1, aspectRatio: isShort ? "9:16" : "16:9" }
            },
            { headers: { 'Content-Type': 'application/json' } }
          );

          const base64Data = response.data.predictions[0].bytesBase64Encoded;
          await fs.writeFile(imagePath, Buffer.from(base64Data, 'base64'));
        } else {
          throw new Error(`Image provider "${imageProvider}" is not configured`);
        }
      } catch (apiError) {
        this.logger.warn(`API Image generation failed (${imageProvider}), falling back to pollinations.ai: ${apiError.message}`);
        const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${isShort ? 720 : 1280}&height=${isShort ? 1280 : 720}&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
        await this.downloadImage(fallbackUrl, imagePath);
      }

      localPaths.push(imagePath);
    }

    this.logger.info(`Generated ${localPaths.length} visual assets via ${imageProvider}`);
    return localPaths;
  }

  async generateImage(prompt, imagePath, options = {}) {
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    const provider = this.resolveImageProvider(options.provider);
    const isPortrait = options.isPortrait === true;

    if (provider === 'router' && isRouterImageConfigured()) {
      return await generateRouterImage({ prompt, model: options.model || null, outputPath: imagePath, isPortrait });
    }

    if (this.openai) {
      return await this.generateOpenAIImage(prompt, imagePath, { model: options.model, isPortrait });
    }

    if (this.gemini) {
      return await this.generateGeminiImage(prompt, imagePath, { isPortrait });
    }

    if (isRouterImageConfigured()) {
      return await generateRouterImage({ prompt, model: options.model || null, outputPath: imagePath, isPortrait });
    }

    throw new Error('No image generation provider configured');
  }

  async generateOpenAIImage(prompt, imagePath, options = {}) {
    // Only honour OpenAI image models; other providers' model ids fall back to the default.
    const model = /^(gpt-image|dall-e)/i.test(options.model || '') ? options.model : 'gpt-image-2';
    const isDallE = /^dall-e/i.test(model);
    const request = isDallE
      ? { model, prompt, n: 1, size: options.isPortrait ? "1024x1792" : "1792x1024", quality: "hd", style: "natural" }
      : { model, prompt, n: 1, size: options.isPortrait ? "1024x1536" : "1536x1024", quality: "high" };
    const response = await this.openai.images.generate(request);

    if (response.data[0].b64_json) {
      const buffer = Buffer.from(response.data[0].b64_json, 'base64');
      await fs.writeFile(imagePath, buffer);
    } else {
      await this.downloadImage(response.data[0].url, imagePath);
    }

    return imagePath;
  }

  async generateGeminiImage(prompt, imagePath, options = {}) {
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

    const response = await this.gemini.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: options.isPortrait ? '9:16' : '16:9',
          imageSize: '1K'
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imageParts = parts.filter(part =>
      part.inlineData?.data && (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith('image/'))
    );
    const renderedImages = imageParts.filter(part => part.thought !== true);
    const imagePart = (renderedImages.length ? renderedImages : imageParts).at(-1);
    if (!imagePart) {
      throw new Error('Gemini image generation returned no image data');
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const metadata = await sharp(imageBuffer, { failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Gemini image generation returned an invalid image asset');
    }

    const extension = path.extname(imagePath).toLowerCase();
    const output = sharp(imageBuffer, { failOn: 'error' });
    if (extension === '.jpg' || extension === '.jpeg') {
      await output.jpeg({ quality: 92 }).toFile(imagePath);
    } else if (extension === '.webp') {
      await output.webp({ quality: 92 }).toFile(imagePath);
    } else {
      await output.png().toFile(imagePath);
    }
    return imagePath;
  }

  enhanceVisualPrompt(prompt, style, isShort = false) {
    const styleEnhancements = new Map([
      ['ethereal', "ethereal, dreamy, mystical, soft lighting, floating particles, cosmic background"],
      ['modern', "modern, clean, minimalist, professional, sleek design, contemporary"],
      ['animated', "animated style, cartoon, vibrant colors, expressive, dynamic"],
      ['cinematic', "cinematic lighting, dramatic, movie poster style, high contrast"],
      ['abstract', "abstract art, geometric shapes, gradient colors, artistic composition"]
    ]);

    const normalizedStyle = String(style || '').trim().toLowerCase();
    const enhancement = styleEnhancements.get(normalizedStyle) || String(style || '').trim() || styleEnhancements.get('ethereal');
    return `${prompt}, ${enhancement}, high quality, ${isShort ? '9:16' : '16:9'} aspect ratio, digital art`;
  }

  async downloadImage(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = standardFs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  /**
   * options: { jobId, productionId, estimatedDuration, videoFormat ('slideshow' | 'video_ai'), segments }
   * The fork's positional form generateVideo(script, assets, audio, out, videoFormat, segments)
   * is still accepted.
   */
  async generateVideo(script, visualAssets, audioPath, outputPath, options = {}, legacySegments = null) {
    if (typeof options === 'string') options = { videoFormat: options, segments: legacySegments };
    options = options || {};
    const videoFormat = options.videoFormat || 'slideshow';
    const segments = Array.isArray(options.segments) && options.segments.length ? options.segments : null;
    this.logger.info(`Generating video from assets... Format: ${videoFormat}`);
    this.lastVideoResult = null;
    let stage = 'provider';
    try {
      if (this.mediaGeneration && options.productionId) {
        const generated = await this.mediaGeneration.generateClips({
          jobId: options.jobId || null,
          productionId: options.productionId,
          script,
          visualAssets,
          outputDir: path.dirname(outputPath)
        });
        if (generated.clips.length) {
          const produced = await this.generateHybridVideo(
            generated.clips,
            visualAssets,
            audioPath,
            outputPath,
            options.estimatedDuration || this.calculateScriptDuration(script)
          );
          this.lastVideoResult = {
            requestedProvider: generated.requestedProvider,
            actualProvider: generated.actualProvider,
            model: generated.model,
            mode: generated.settings.mode,
            generatedSeconds: generated.clips.reduce((total, clip) => total + clip.duration, 0),
            tasks: generated.clips.map(clip => ({ scene: clip.index, taskId: clip.taskId, provider: clip.provider, model: clip.model })),
            scenes: generated.clips.map(clip => ({
              index: clip.index, label: clip.label, prompt: clip.prompt, duration: clip.duration,
              path: clip.path, taskId: clip.taskId, provider: clip.provider, model: clip.model
            }))
          };
          return produced;
        }
      }

      if (videoFormat === 'video_ai') {
        // Try Replicate for true AI video generation
        if (this.replicate && this.replicate.auth) {
          const produced = await this.generateReplicateVideo(script, visualAssets, audioPath, outputPath);
          this.lastVideoResult = { requestedProvider: 'replicate', actualProvider: 'replicate', model: 'wan-video/wan-2.7-i2v', mode: 'video_ai', generatedSeconds: 5, tasks: [], scenes: [] };
          return produced;
        }
        this.logger.warn('AI Video requested (video_ai) but Replicate API key is missing. Falling back to Slideshow.');
      }

      // Reliable FFmpeg slideshow (per-segment audio/visual sync when segments are supplied)
      stage = 'ffmpeg-slideshow';
      const produced = await this.generateFFmpegSlideshow(script, visualAssets, audioPath, outputPath, segments);
      this.lastVideoResult = { requestedProvider: videoFormat === 'video_ai' ? 'replicate' : 'slideshow', actualProvider: 'slideshow', model: 'local-ffmpeg', mode: 'slideshow', generatedSeconds: 0, tasks: [], scenes: [] };
      return produced;
    } catch (error) {
      // The Logger's console line only shows the message string, so put the real
      // reason inline. Previously the stack alone went to the file transport and
      // the console printed "Video generation failed:" with no detail.
      const reasons = [error && error.message ? error.message : String(error)];
      this.logger.error(`Video generation (${stage}) failed; using a local slideshow fallback: ${reasons[0]}`, error);

      const fallbacks = [];
      if (stage !== 'ffmpeg-slideshow') {
        fallbacks.push(() => this.generateFFmpegSlideshow(script, visualAssets, audioPath, outputPath, segments));
      }
      fallbacks.push(() => this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath));

      for (const fallback of fallbacks) {
        try {
          const produced = await fallback();
          this.lastVideoResult = {
            requestedProvider: this.lastVideoResult?.requestedProvider || 'configured-provider',
            actualProvider: 'slideshow', model: 'local-ffmpeg', mode: 'fallback', generatedSeconds: 0,
            fallbackReason: reasons.join('; '), tasks: [], scenes: []
          };
          return produced;
        } catch (fallbackError) {
          reasons.push(fallbackError.message);
          this.logger.error(`Local slideshow fallback failed: ${fallbackError.message}`, fallbackError);
        }
      }

      const produced = await this.simulateVideoGeneration(script, visualAssets, audioPath, outputPath);
      this.lastVideoResult = {
        requestedProvider: 'configured-provider', actualProvider: 'simulation', model: null,
        mode: 'simulation', generatedSeconds: 0, fallbackReason: reasons.join('; '), tasks: [], scenes: []
      };
      return produced;
    }
  }

  async generateHybridVideo(clips, visualAssets, audioPath, outputPath, totalDuration) {
    if (!(await checkFFmpeg())) throw new Error(ffmpegInstallHint());
    const validImages = await this.filterLocalImageAssets(visualAssets);
    const segments = clips.map(clip => ({ type: 'video', path: clip.path, duration: clip.duration }));
    const generatedDuration = segments.reduce((sum, item) => sum + item.duration, 0);
    const remaining = Math.max(0, this.parseDurationSeconds(totalDuration) - generatedDuration);
    if (remaining && validImages.length) {
      const perImage = Math.max(2, remaining / validImages.length);
      for (const imagePath of validImages) segments.push({ type: 'image', path: imagePath, duration: perImage });
    }
    if (!segments.length) throw new Error('No usable provider clips or still images were generated');

    const visualPath = outputPath.replace(/\.mp4$/i, '_hybrid_visual.mp4');
    await this.renderMediaTimeline(segments, visualPath);
    await this.addAudioToVideo(visualPath, audioPath, outputPath, { loopVideo: true });
    await fs.unlink(visualPath).catch(() => {});
    return outputPath;
  }

  async renderMediaTimeline(segments, outputPath) {
    const args = ['-y'];
    for (const segment of segments) {
      if (segment.type === 'image') args.push('-loop', '1', '-t', Number(segment.duration).toFixed(2), '-framerate', '30', '-i', segment.path);
      else args.push('-stream_loop', '-1', '-i', segment.path);
    }
    const filters = segments.map((segment, index) =>
      `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,trim=duration=${Number(segment.duration).toFixed(2)},setpts=PTS-STARTPTS[v${index}]`
    );
    filters.push(`${segments.map((_, index) => `[v${index}]`).join('')}concat=n=${segments.length}:v=1:a=0[vout]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath);
    await runFFmpeg(args);
    return outputPath;
  }

  async filterLocalImageAssets(visualAssets = []) {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const images = [];
    for (const asset of visualAssets) {
      if (typeof asset !== 'string' || !imageExtensions.has(path.extname(asset).toLowerCase())) continue;
      try {
        await fs.access(asset);
        images.push(asset);
      } catch (_error) { /* ignore missing assets */ }
    }
    return images;
  }

  parseDurationSeconds(value) {
    if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
    const parts = String(value || '').split(':').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 60 + parts[1]);
    if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    return 0;
  }

  async generateReplicateVideo(script, visualAssets, audioPath, outputPath) {
    const output = await this.replicate.run(
      "wan-video/wan-2.7-i2v",
      {
        input: {
          image: visualAssets[0],
          prompt: script.title || "smooth cinematic motion",
          duration: 5,
          resolution: "720p"
        }
      }
    );

    // Download the generated video
    if (output && output.length > 0) {
      await this.downloadVideo(output[0], outputPath);
      
      // Add audio track
      await this.addAudioToVideo(outputPath, audioPath, outputPath);
    }

    return outputPath;
  }

  async getSfxFile(keywords) {
    if (!keywords || keywords.length === 0) return null;
    try {
      const sfxDir = path.join(__dirname, '..', 'assets', 'sfx');
      const files = await fs.readdir(sfxDir).catch(() => []);
      const validFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));

      for (const keyword of keywords) {
        const lowerKw = keyword.toLowerCase();
        for (const file of validFiles) {
          if (file.toLowerCase().includes(lowerKw)) {
            return path.join(sfxDir, file);
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  isLocalImageFile(filePath) {
    return typeof filePath === 'string'
      && ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(filePath).toLowerCase())
      && standardFs.existsSync(filePath);
  }

  kenBurnsClipArgs(imagePath, slideDuration, targetW, targetH, fps, clipPath) {
    const totalFrames = Math.max(1, Math.ceil(slideDuration * fps));
    return [
      '-y', '-loop', '1', '-i', imagePath,
      '-vf', `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetW}x${targetH}:fps=${fps}`,
      '-t', slideDuration.toFixed(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-r', String(fps), clipPath
    ];
  }

  async generateFFmpegSlideshow(script, visualAssets, audioPath, outputPath, segments = null) {
    this.logger.info('Creating FFmpeg slideshow video with AI illustrations...');

    if (!(await checkFFmpeg())) {
      throw new Error(ffmpegInstallHint());
    }

    const framesDir = path.join(path.dirname(outputPath), `frames_${Date.now()}`);
    await fs.mkdir(framesDir, { recursive: true });

    try {
      const isShort = script.metadata?.strategy?.videoType === 'short';
      const targetW = isShort ? 720 : 1280;
      const targetH = isShort ? 1280 : 720;
      const fps = 25;
      const assets = Array.isArray(visualAssets) ? visualAssets : [];
      const hasNarration = await this.isUsableAudioFile(audioPath);

      const clipPaths = [];
      const sfxInputs = [];
      let totalVideoDuration = 0;
      let silentVideoPath = path.join(framesDir, 'silent_video.mp4');
      let isSegmented = false;

      if (segments && segments.length > 0) {
        this.logger.info('Using per-segment perfect synchronization logic');

        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          // Prefer the segment's own image; otherwise reuse another real image so its narration is not dropped.
          const imgPath = [seg.imagePath, assets.at(Math.min(i, assets.length - 1)), ...assets]
            .find(candidate => this.isLocalImageFile(candidate));
          if (!imgPath) continue;

          const segHasAudio = await this.isUsableAudioFile(seg.audioPath);
          let slideDuration = 4; // minimum fallback
          if (segHasAudio) {
            try {
              slideDuration = (await this.getMediaDuration(seg.audioPath)) + 0.3; // exact match + small padding
            } catch (e) {
              this.logger.warn(`Failed to probe audio duration for segment ${i}: ${e.message}`);
            }
          }

          const clipPath = path.join(framesDir, `clip_${i}.mp4`);
          await runFFmpeg(this.kenBurnsClipArgs(imgPath, slideDuration, targetW, targetH, fps, clipPath));

          // Normalise every clip's audio (44.1kHz stereo AAC) so the clips can be stream-copied together.
          const avClipPath = path.join(framesDir, `avclip_${i}.mp4`);
          if (segHasAudio) {
            await runFFmpeg(['-y', '-i', clipPath, '-i', seg.audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest', avClipPath]);
          } else {
            await runFFmpeg(['-y', '-i', clipPath, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest', avClipPath]);
          }
          clipPaths.push(avClipPath);

          if (seg.sfx_keywords) {
            const sfxPath = await this.getSfxFile(seg.sfx_keywords);
            if (sfxPath) {
              sfxInputs.push({ path: sfxPath, delayMs: Math.round(totalVideoDuration * 1000) });
            }
          }
          totalVideoDuration += slideDuration;
          this.logger.info(`Created synchronized clip ${i + 1}/${segments.length} (${slideDuration.toFixed(1)}s)`);
        }

        if (clipPaths.length > 0) {
          // Concat AV clips directly
          const concatListPath = path.join(framesDir, 'concat_list.txt');
          const listContent = clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
          await fs.writeFile(concatListPath, listContent);

          const mergedAVPath = path.join(framesDir, 'merged_av.mp4');
          await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', mergedAVPath]);

          // We will process this merged AV for BGM and SFX
          silentVideoPath = mergedAVPath; // reuse variable name for next step
          isSegmented = true;
        } else {
          this.logger.warn('No segment had a usable image; falling back to the whole-narration slideshow');
        }
      }

      if (!isSegmented) {
        this.logger.info('Using legacy monolithic synchronization logic');
        const realImages = assets.filter(p => this.isLocalImageFile(p));
        if (realImages.length === 0) {
          await this.cleanupDirectory(framesDir);
          return await this.generateTextOnlySlideshow(script, audioPath, outputPath);
        }

        // Match the slides to the real narration length (not a rounded-up estimate)
        const totalDuration = hasNarration
          ? await this.resolveSlideshowDuration(script, audioPath)
          : this.calculateScriptDuration(script);

        const slideDuration = Math.max(3, totalDuration / realImages.length);
        for (let i = 0; i < realImages.length; i++) {
          const clipPath = path.join(framesDir, `clip_${i}.mp4`);
          await runFFmpeg(this.kenBurnsClipArgs(realImages[i], slideDuration, targetW, targetH, fps, clipPath));
          clipPaths.push(clipPath);
        }

        const concatListPath = path.join(framesDir, 'concat_list.txt');
        await fs.writeFile(concatListPath, clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n'));
        await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', silentVideoPath]);
      }

      // Add BGM & SFX
      let hasBgm = false;
      let randomBgm = '';
      try {
        const bgmDir = path.join(__dirname, '..', 'assets', 'bgm');
        const bgmFiles = await fs.readdir(bgmDir).catch(() => []);
        const validBgm = bgmFiles.filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        if (validBgm.length > 0) {
          randomBgm = path.join(bgmDir, validBgm.at(Math.floor(Math.random() * validBgm.length)));
          hasBgm = true;
        }
      } catch (_) { /* no BGM file; continue without music */ }

      const inputs = ['-i', silentVideoPath];
      if (!isSegmented && hasNarration) {
        inputs.push('-i', audioPath); // Legacy: add monolithic audio
      }
      if (hasBgm) inputs.push('-stream_loop', '-1', '-i', randomBgm);

      sfxInputs.forEach(sfx => inputs.push('-i', sfx.path));

      let filterComplex = '';
      let amixInputs = '';
      let mixCount = 0;
      let inputIndex = 0; // 0 is always video

      if (isSegmented) {
        // Video already has audio stream from segments
        filterComplex += `[0:a]volume=1.0[a_base];`;
        amixInputs += '[a_base]';
        mixCount++;
      } else if (hasNarration) {
        inputIndex++; // 1 is TTS audio
        filterComplex += `[${inputIndex}:a]volume=1.0[a_base];`;
        amixInputs += '[a_base]';
        mixCount++;
      }

      if (hasBgm) {
        inputIndex++;
        filterComplex += `[${inputIndex}:a]volume=0.15[a_bgm];`;
        amixInputs += '[a_bgm]';
        mixCount++;
      }

      sfxInputs.forEach((sfx, index) => {
        inputIndex++;
        const sfxLabel = `sfx${index}`;
        filterComplex += `[${inputIndex}:a]adelay=${sfx.delayMs}|${sfx.delayMs},volume=0.8[${sfxLabel}];`;
        amixInputs += `[${sfxLabel}]`;
        mixCount++;
      });

      this.logger.info(`Mixing audio with ${hasBgm ? 'BGM' : 'no BGM'} and ${sfxInputs.length} SFX tracks`);
      if (mixCount > 0) {
        filterComplex += `${amixInputs}amix=inputs=${mixCount}:duration=first:dropout_transition=2[a]`;
        await runFFmpeg(['-y', ...inputs, '-filter_complex', filterComplex, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outputPath]);
      } else {
        // Completely silent video
        await fs.copyFile(silentVideoPath, outputPath);
        this.logger.warn('No audio file found, video exported without audio');
      }

      // Cleanup temp frames directory
      await this.cleanupDirectory(framesDir);

      this.logger.info(`FFmpeg slideshow video created: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('FFmpeg slideshow failed:', error.message);
      // Cleanup on failure
      try { await this.cleanupDirectory(framesDir); } catch (_) { /* best-effort cleanup */ }
      throw error;
    }
  }

  async generateTextOnlySlideshow(script, audioPath, outputPath) {
    this.logger.info('Generating text-only slideshow as fallback...');

    const sections = (script.mainContent && script.mainContent.sections) || [{ title: script.title }];
    const totalDuration = await this.isUsableAudioFile(audioPath)
      ? await this.resolveSlideshowDuration(script, audioPath)
      : this.calculateScriptDuration(script);
    const slideDuration = Math.max(5, totalDuration / sections.length);
    const framesDir = path.join(path.dirname(outputPath), `textframes_${Date.now()}`);
    await fs.mkdir(framesDir, { recursive: true });

    const clipPaths = [];
    const colors = ['0x1a1a2e', '0x16213e', '0x0f3460', '0x533483', '0x2d6a4f'];
    const isShort = script.metadata?.strategy?.videoType === 'short';
    const targetW = isShort ? 720 : 1280;
    const targetH = isShort ? 1280 : 720;
    const fps = 25;

    for (let i = 0; i < sections.length; i++) {
      const clipPath = path.join(framesDir, `tclip_${i}.mp4`);
      const color = colors.at(i % colors.length);
      const title = (sections.at(i).title || script.title || '').replace(/['":\\%]/g, ' ').replace(/[^\x20-\x7E]/g, '');
      await runFFmpeg([
        '-y', '-f', 'lavfi', '-i', `color=c=${color}:size=${targetW}x${targetH}:rate=${fps}`,
        '-vf', `drawtext=text='${title}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.3:boxborderw=20`,
        '-t', slideDuration.toFixed(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', clipPath
      ]);
      clipPaths.push(clipPath);
    }

    const concatListPath = path.join(framesDir, 'concat.txt');
    await fs.writeFile(concatListPath, clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n'));
    const silentPath = path.join(framesDir, 'silent.mp4');
    await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', silentPath]);

    if (await this.isUsableAudioFile(audioPath)) {
      await runFFmpeg(['-y', '-i', silentPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', outputPath]);
    } else {
      await fs.copyFile(silentPath, outputPath);
    }

    await this.cleanupDirectory(framesDir);
    return outputPath;
  }

  async generateSlideshowVideo(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Creating slideshow video...');

    if (!(await checkFFmpeg())) {
      throw new Error(ffmpegInstallHint());
    }

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const slidesDir = path.join(path.dirname(outputPath), 'slides');

    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Create HTML for slideshow (only real image files can be embedded)
      const imageAssets = await this.filterImageAssets(visualAssets);
      await page.setContent(this.createSlideshowHTML(script, imageAssets));

      // Freeze CSS transitions/animations so each still is captured fully rendered
      await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
      await page.waitForTimeout(1000); // Wait for assets to load

      // Capture ONE still per slide instead of screenshotting at 30fps —
      // FFmpeg turns the stills into a crossfaded video in seconds.
      const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
      await fs.mkdir(slidesDir, { recursive: true });

      const stills = [];
      for (let i = 0; i < slideCount; i++) {
        await page.evaluate((index) => {
          document.querySelectorAll('.slide').forEach((slide, s) => {
            slide.classList.toggle('active', s === index);
          });
        }, i);

        const stillPath = path.join(slidesDir, `slide_${String(i).padStart(3, '0')}.png`);
        await page.screenshot({ path: stillPath });
        stills.push(stillPath);
      }

      const videoPath = outputPath.replace('.mp4', '_visual.mp4');
      const duration = await this.resolveSlideshowDuration(script, audioPath);
      await this.renderSlidesToVideo(stills, duration, videoPath);

      // Add audio
      await this.addAudioToVideo(videoPath, audioPath, outputPath);

      return outputPath;
    } finally {
      await browser.close().catch(() => {});
      await this.cleanupDirectory(slidesDir);
    }
  }

  async resolveSlideshowDuration(script, audioPath) {
    try {
      return (await this.getMediaDuration(audioPath)) + 0.5;
    } catch (error) {
      this.logger.warn(`Could not read narration duration, falling back to word-count estimate: ${error.message}`);
      return this.calculateScriptDuration(script);
    }
  }

  async renderSlidesToVideo(stills, totalDuration, videoPath) {
    if (stills.length === 0) {
      throw new Error('No slides to render');
    }

    const fade = 0.5;
    const overlapDuration = fade * Math.max(0, stills.length - 1);
    const perSlide = Math.max(2, (totalDuration + overlapDuration) / stills.length);

    const args = ['-y'];
    for (const still of stills) {
      args.push('-loop', '1', '-t', perSlide.toFixed(2), '-framerate', '30', '-i', still);
    }

    if (stills.length === 1) {
      args.push('-vf', 'format=yuv420p', '-c:v', 'libx264', videoPath);
      await runFFmpeg(args);
      return videoPath;
    }

    // Chain crossfades: transition k starts fade seconds before slide k ends
    const filters = [];
    let prev = '[0:v]';
    for (let i = 1; i < stills.length; i++) {
      const out = `[v${i}]`;
      const offset = (i * (perSlide - fade)).toFixed(2);
      filters.push(`${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset}${out}`);
      prev = out;
    }
    filters.push(`${prev}format=yuv420p[vfinal]`);

    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[vfinal]',
      '-c:v', 'libx264',
      '-r', '30',
      videoPath
    );

    await runFFmpeg(args);
    return videoPath;
  }

  async filterImageAssets(visualAssets = []) {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const mimeTypes = new Map([
      ['jpeg', 'image/jpeg'],
      ['png', 'image/png'],
      ['webp', 'image/webp']
    ]);
    const images = [];

    for (const asset of visualAssets) {
      if (typeof asset !== 'string' || !imageExtensions.has(path.extname(asset).toLowerCase())) {
        continue;
      }

      try {
        const imageBuffer = await fs.readFile(asset);
        const metadata = await sharp(imageBuffer, { failOn: 'error' }).metadata();
        const mimeType = mimeTypes.get(metadata.format);
        if (mimeType && metadata.width && metadata.height) {
          images.push(`data:${mimeType};base64,${imageBuffer.toString('base64')}`);
        }
      } catch (_error) {
        // Skip missing or invalid image files
      }
    }

    return images;
  }

  createSlideshowHTML(script, visualAssets) {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            margin: 0;
            padding: 0;
            width: 1920px;
            height: 1080px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Arial', sans-serif;
            overflow: hidden;
        }
        
        .slide {
            position: absolute;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 2s ease-in-out;
        }
        
        .slide.active {
            opacity: 1;
        }
        
        .content {
            text-align: center;
            color: white;
            max-width: 80%;
        }
        
        h1 {
            font-size: 72px;
            margin-bottom: 30px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        
        h2 {
            font-size: 48px;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        
        p {
            font-size: 36px;
            line-height: 1.4;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
        }
        
        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.3;
            z-index: -1;
        }
        
        .particles {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            z-index: -1;
        }
        
        .particle {
            position: absolute;
            background: rgba(255,255,255,0.8);
            border-radius: 50%;
            animation: float 6s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
        }
    </style>
</head>
<body>
    <div class="particles"></div>
    
    <!-- Title Slide -->
    <div class="slide active">
        ${visualAssets[0] ? `<img class="background-image" src="${visualAssets[0]}" />` : ''}
        <div class="content">
            <h1>${script.title}</h1>
            <p>Ethereal Dreamscript</p>
        </div>
    </div>
    
    ${this.generateContentSlides(script, visualAssets).join('')}
    
    <!-- Subscribe Slide -->
    <div class="slide">
        <div class="content">
            <h2>✨ Subscribe for More Stories ✨</h2>
            <p>New content daily at 2:00 PM</p>
        </div>
    </div>
    
    <script>
        // Create floating particles
        function createParticles() {
            const container = document.querySelector('.particles');
            for (let i = 0; i < 20; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.top = Math.random() * 100 + '%';
                particle.style.width = (Math.random() * 4 + 2) + 'px';
                particle.style.height = particle.style.width;
                particle.style.animationDelay = Math.random() * 6 + 's';
                container.appendChild(particle);
            }
        }
        
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        
        function advanceAnimation() {
            slides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % slides.length;
            slides[currentSlide].classList.add('active');
        }
        
        window.advanceAnimation = advanceAnimation;
        createParticles();
    </script>
</body>
</html>`;
  }

  generateContentSlides(script, visualAssets) {
    const slides = [];
    
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach((section, index) => {
        const assetIndex = Math.min(index + 1, visualAssets.length - 1);
        
        slides.push(`
        <div class="slide">
            ${visualAssets[assetIndex] ? `<img class="background-image" src="${visualAssets[assetIndex]}" />` : ''}
            <div class="content">
                <h2>${section.title}</h2>
                ${this.formatSectionContent(section)}
            </div>
        </div>`);
      });
    }
    
    return slides;
  }

  formatSectionContent(section) {
    if (section.items && Array.isArray(section.items)) {
      return section.items.slice(0, 3).map(item => 
        `<p>${item.number}. ${item.title}</p>`
      ).join('');
    }
    
    if (section.steps && Array.isArray(section.steps)) {
      return section.steps.slice(0, 3).map(step => 
        `<p>${step.title}</p>`
      ).join('');
    }
    
    if (typeof section.content === 'string') {
      return `<p>${section.content.slice(0, 200)}${section.content.length > 200 ? '...' : ''}</p>`;
    }
    
    return '<p>Content coming soon...</p>';
  }

  calculateScriptDuration(script) {
    // Estimate duration based on word count (average 150 words per minute)
    let totalWords = 0;
    
    if (script.hook) totalWords += script.hook.text.split(' ').length;
    if (script.introduction) {
      totalWords += (script.introduction.greeting || '').split(' ').length;
      totalWords += (script.introduction.topicIntro || '').split(' ').length;
    }
    
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        if (typeof section.content === 'string') {
          totalWords += section.content.split(' ').length;
        }
        if (section.items) {
          section.items.forEach(item => {
            totalWords += (item.title + ' ' + item.description).split(' ').length;
          });
        }
        if (section.steps) {
          section.steps.forEach(step => {
            totalWords += (step.title + ' ' + step.description).split(' ').length;
          });
        }
      });
    }
    
    if (script.conclusion) {
      totalWords += script.conclusion.finalThought.split(' ').length;
    }
    
    // Convert to duration (150 words per minute)
    return Math.max(30, Math.ceil((totalWords / 150) * 60));
  }

  async addAudioToVideo(videoPath, audioPath, outputPath, options = {}) {
    const hasRealAudio = await this.isUsableAudioFile(audioPath);

    if (!hasRealAudio) {
      if (options.allowSilent === true) {
        this.logger.warn('Creating an intentionally silent video from an operator-confirmed override.');
        if (videoPath !== outputPath) await fs.copyFile(videoPath, outputPath);
        return outputPath;
      }
      const error = new Error('Narration audio is required. Regenerate narration or explicitly confirm an intentional silent video.');
      error.code = 'NARRATION_REQUIRED';
      throw error;
    }

    // FFmpeg cannot write to its own input, so mux to a temp file when paths collide
    const muxPath = outputPath === videoPath
      ? outputPath.replace(/\.mp4$/i, '_muxed.mp4')
      : outputPath;

    const videoInput = options.loopVideo ? ['-stream_loop', '-1', '-i', videoPath] : ['-i', videoPath];
    await runFFmpeg(['-y', ...videoInput, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', muxPath]);

    if (muxPath !== outputPath) {
      await fs.rename(muxPath, outputPath);
    }

    this.logger.info('Audio added to video successfully');
    return outputPath;
  }

  async isUsableAudioFile(audioPath) {
    if (typeof audioPath !== 'string' || audioPath.endsWith('.info')) {
      return false;
    }

    try {
      const stats = await fs.stat(audioPath);
      return stats.isFile() && stats.size > 0;
    } catch (error) {
      return false;
    }
  }

  async downloadVideo(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = standardFs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async generateShortVideo(mainVideoPath, outputPath) {
    this.logger.info(`Extracting YouTube Shorts from ${mainVideoPath}`);
    // Crop center for 9:16 vertical ratio (1080x1920) from horizontal (1920x1080)
    // Trim to 59 seconds max length
    try {
      await runFFmpeg(['-y', '-i', mainVideoPath, '-vf', 'crop=ih*(9/16):ih,scale=1080:1920', '-t', '59', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '192k', outputPath]);
      this.logger.success(`YouTube Shorts generated: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to generate YouTube Shorts:', error);
      return null;
    }
  }

  async cleanupDirectory(dirPath) {
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        await fs.unlink(path.join(dirPath, file));
      }
      await fs.rmdir(dirPath);
    } catch (error) {
      this.logger.warn('Cleanup failed:', error.message);
    }
  }

  async generateThumbnail(script, style = "ethereal") {
    this.logger.info('Generating custom thumbnail...');

    try {
      const routerReady = isRouterImageConfigured();
      if (!this.openai && !this.gemini && !routerReady && !this.llm.isAvailable()) {
        return await this.simulateThumbnailGeneration(script, style);
      }

      const prompt = `YouTube thumbnail for "${script.title}", ${style} style, eye-catching, high contrast text, professional design, clickable, engaging`;
      const thumbnailPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_${Date.now()}.png`);
      await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });

      if (this.openai || this.gemini || routerReady) {
        await this.generateImage(prompt, thumbnailPath);
        const metadata = await sharp(thumbnailPath).metadata();

        return {
          path: thumbnailPath,
          dimensions: { width: metadata.width, height: metadata.height },
          fileSize: await this.getFileSize(thumbnailPath)
        };
      }

      // Use the LLM to generate a highly engaging thumbnail concept, rendered via pollinations.ai
      const systemPrompt = `You are a professional YouTube thumbnail designer specializing in high CTR children's stories/educational channels. Create an extremely vivid, clickable, and cute thumbnail description for a video titled "${script.title}". Describe only the visual scene, characters, and bold emotional elements. Keep it short (max 40 words) and list key elements separated by commas. Do not include any meta-talk or introductory text. Concept: `;
      const enhancedText = (await this.llm.generate({ prompt: systemPrompt + script.title })).replace(/["']/g, '');

      // Remove "YouTube thumbnail" and add "no text, no words" to prevent gibberish text generation
      const finalPrompt = encodeURIComponent(`Cute children's book cartoon scene: ${enhancedText}, vibrant colors, epic fantasy lighting, extremely eye-catching, no text, no words, no letters, clear focus, 16:9 aspect ratio`);
      const pollUrl = `https://image.pollinations.ai/prompt/${finalPrompt}?width=1280&height=720&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

      await this.downloadImage(pollUrl, thumbnailPath);

      return {
        path: thumbnailPath,
        url: pollUrl,
        dimensions: { width: 1280, height: 720 },
        fileSize: await this.getFileSize(thumbnailPath)
      };
    } catch (error) {
      this.logger.error('Thumbnail generation failed:', error);
      return await this.simulateThumbnailGeneration(script, style);
    }
  }

  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  // Simulation methods for when APIs are not available
  async simulateTTSGeneration(text, outputPath) {
    this.logger.info('Simulating TTS generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI TTS audio would be generated here',
      text: text.substring(0, 100) + '...',
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

  async simulateVisualAssets(prompt, style, count) {
    this.logger.info(`Simulating ${count} visual assets...`);
    
    const paths = [];
    for (let i = 0; i < count; i++) {
      const assetPath = path.join(__dirname, '..', 'data', 'assets', `visual_sim_${Date.now()}_${i}.info`);
      
      await fs.writeFile(assetPath, JSON.stringify({
        message: 'AI visual asset would be generated here',
        prompt: prompt,
        style: style,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      paths.push(assetPath);
    }
    
    return paths;
  }

  async simulateVideoGeneration(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Simulating video generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI video would be generated here',
      script: script.title,
      visualAssets: visualAssets.length,
      audioPath: audioPath,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

  async simulateThumbnailGeneration(script, style) {
    this.logger.info('Simulating thumbnail generation...');
    
    const thumbnailPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_sim_${Date.now()}.info`);
    await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
    
    await fs.writeFile(thumbnailPath, JSON.stringify({
      message: 'AI thumbnail would be generated here',
      title: script.title,
      style: style,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return {
      path: thumbnailPath,
      dimensions: { width: 1792, height: 1024 },
      fileSize: 1024,
      simulated: true
    };
  }
}

module.exports = { AIVideoGenerator };
