const OpenAI = require('openai');
const Replicate = require('replicate');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const standardFs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { Logger } = require('./logger');

const execAsync = promisify(exec);

class AIVideoGenerator {
  constructor(credentials) {
    this.logger = new Logger('AIVideoGenerator');
    
    // Support either raw credentials JSON or the CredentialManager instance
    const rawCredentials = credentials.credentials || credentials;
    
    // Initialize AI services with graceful fallback
    const openaiKey = rawCredentials.openai?.apiKey || process.env.OPENAI_API_KEY;
    const replicateKey = rawCredentials.replicate?.apiKey || process.env.REPLICATE_API_KEY;
    const geminiKey = rawCredentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    const openRouterKey = rawCredentials.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;
    
    this.openRouterKey = openRouterKey;
    if (openaiKey && !openaiKey.includes('YOUR_OPENAI_API_KEY')) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.logger.info('OpenAI service initialized');
    } else {
      this.logger.warn('OpenAI API key not found or placeholder');
    }
    
    if (geminiKey) {
      try {
        this.geminiKey = geminiKey;
        this.genAI = new GoogleGenerativeAI(geminiKey);
        this.gemini = this.genAI.getGenerativeModel({ 
          model: 'gemini-2.5-flash',
          systemInstruction: 'You are an AI assistant that generates creative content, scripts, and concepts for YouTube videos.'
        });
        this.logger.info('Google Gemini service initialized');
      } catch (error) {
        this.logger.error('Failed to initialize Google Gemini:', error);
      }
    } else {
      this.logger.warn('Google Gemini API key not found');
    }
    
    if (replicateKey) {
      this.replicate = new Replicate({ auth: replicateKey });
      this.logger.info('Replicate service initialized');
    } else {
      this.logger.warn('Replicate API key not found - advanced video generation unavailable');
    }
    
    // ElevenLabs configuration
    this.elevenLabsApiKey = rawCredentials.elevenLabs?.apiKey || process.env.ELEVENLABS_API_KEY;
    this.elevenLabsVoiceId = rawCredentials.elevenLabs?.voiceId || process.env.ELEVENLABS_VOICE_ID;
    
    // Azure Speech configuration
    this.azureSpeechKey = rawCredentials.azure?.speechKey || process.env.AZURE_SPEECH_KEY;
    this.azureSpeechRegion = rawCredentials.azure?.speechRegion || process.env.AZURE_SPEECH_REGION;
  }

  async generateTTSAudio(text, outputPath) {
    this.logger.info('Generating TTS audio...');
    
    // Try ElevenLabs first (higher quality)
    if (this.elevenLabsApiKey && this.elevenLabsVoiceId) {
      try {
        return await this.generateElevenLabsTTS(text, outputPath);
      } catch (e) {
        this.logger.warn(`ElevenLabs TTS failed (${e.message}), falling back to OpenAI...`);
      }
    }
    
    // Fallback to OpenAI TTS
    if (this.openai) {
      try {
        return await this.generateOpenAITTS(text, outputPath);
      } catch (e) {
        this.logger.warn(`OpenAI TTS failed (${e.message}), falling back to Edge TTS...`);
      }
    }
    
    // Fallback to Free Microsoft Edge Neural TTS
    try {
      return await this.generateMsEdgeTTS(text, outputPath);
    } catch (error) {
      this.logger.error('All TTS generation methods failed:', error);
      throw error;
    }
  }

  async generateMsEdgeTTS(text, outputPath) {
    this.logger.info('Generating free Microsoft Edge Neural TTS audio...');
    
    return new Promise(async (resolve, reject) => {
      try {
        const tts = new MsEdgeTTS();
        const format = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3 || "audio-24khz-96kbitrate-mono-mp3";
        await tts.setMetadata("id-ID-GadisNeural", format);
        
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        const fileStream = standardFs.createWriteStream(outputPath);
        
        const { audioStream } = tts.toStream(text);
        audioStream.pipe(fileStream);
        
        audioStream.on("end", () => {
          this.logger.info('Microsoft Edge Neural TTS generation complete');
          resolve(outputPath);
        });
        
        audioStream.on("error", (err) => {
          this.logger.error('Microsoft Edge Neural TTS stream error:', err);
          reject(err);
        });
      } catch (error) {
        this.logger.error('Microsoft Edge Neural TTS generation failed:', error);
        reject(error);
      }
    });
  }

  async generateElevenLabsTTS(text, outputPath) {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`;
    
    const data = {
      text: text,
      model_id: "eleven_monolingual_v1",
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
      model: "tts-1-hd",
      voice: "nova",
      input: text,
      speed: 1.0
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
    
    this.logger.info('OpenAI TTS generation complete');
    return outputPath;
  }

  async generateVisualAssets(prompt, style = "ethereal", count = 1, imageProvider = "gemini", imageModel = "imagen-4.0-generate-001", isShort = false) {
    this.logger.info(`Generating ${count} visual assets with style: ${style} (isShort: ${isShort})`);
    
    try {
      if (!this.openai && !this.gemini) {
        return await this.simulateVisualAssets(prompt, style, count);
      }

      let enhancedPrompt = this.enhanceVisualPrompt(prompt, style);
      
      if (imageProvider === 'openai' && this.openai) {
        // Use OpenAI DALL-E for high-quality images
        const response = await this.openai.images.generate({
          model: imageModel,
          prompt: enhancedPrompt,
          n: count,
          size: isShort ? "1024x1792" : "1792x1024",
          quality: "hd",
          style: "natural"
        });

        const imageUrls = response.data.map(img => img.url);
        const localPaths = [];

        // Download images locally
        for (let i = 0; i < imageUrls.length; i++) {
          const imagePath = path.join(__dirname, '..', 'data', 'assets', `visual_${Date.now()}_${i}.png`);
          await this.downloadImage(imageUrls[i], imagePath);
          localPaths.push(imagePath);
        }

        this.logger.info(`Generated ${localPaths.length} visual assets via OpenAI`);
        return localPaths;
      } else {
        // Use Gemini to generate a highly detailed prompt description for kids cartoon style
        const systemPrompt = `You are a creative prompt engineer for kids' cartoon and fairy tale illustrations. Enhance the following scene prompt to be extremely vivid, cute, colorful, and optimized for an AI image generator. Keep the output as a single, short, comma-separated visual prompt (max 50 words) without any meta-talk or introductory text. Scene to describe: `;
        const geminiResult = await this.gemini.generateContent(systemPrompt + prompt);
        const enhancedText = geminiResult.response.text().trim().replace(/["']/g, '');
        this.logger.info(`Gemini enhanced prompt: "${enhancedText}"`);
        
        const finalPrompt = `${enhancedPrompt}, cute children's book cartoon style, vector illustration, vibrant colors, highly detailed, ${isShort ? '9:16' : '16:9'} aspect ratio`;
        const localPaths = [];
        
        for (let i = 0; i < count; i++) {
          const imagePath = path.join(__dirname, '..', 'data', 'assets', `visual_${Date.now()}_${i}.png`);
          
          try {
            if (imageProvider === 'openrouter' && this.openRouterKey && this.openRouterKey !== 'YOUR_OPENROUTER_API_KEY') {
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
              const urlMatch = content.match(/https?:\/\/[^\s\)]+/);
              if (urlMatch) {
                  const imgRes = await axios.get(urlMatch[0], { responseType: 'arraybuffer' });
                  await fs.writeFile(imagePath, imgRes.data);
              } else {
                  throw new Error(`OpenRouter did not return an image URL. Response: ${content}`);
              }
            } else {
              // Use Gemini Developer API (Imagen 4)
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:predict?key=${this.geminiKey}`;
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
            }
          } catch (apiError) {
            this.logger.warn(`API Image generation failed (${imageProvider}), falling back to pollinations.ai: ${apiError.message}`);
            const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${isShort ? 720 : 1280}&height=${isShort ? 1280 : 720}&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
            await this.downloadImage(fallbackUrl, imagePath);
          }
          
          localPaths.push(imagePath);
        }
        
        this.logger.info(`Generated ${localPaths.length} visual assets via Gemini Imagen 4`);
        return localPaths;
      }
    } catch (error) {
      this.logger.error('Visual asset generation failed:', error);
      return await this.simulateVisualAssets(prompt, style, count);
    }
  }

  enhanceVisualPrompt(prompt, style) {
    const styleEnhancements = {
      ethereal: "ethereal, dreamy, mystical, soft lighting, floating particles, cosmic background",
      modern: "modern, clean, minimalist, professional, sleek design, contemporary",
      animated: "animated style, cartoon, vibrant colors, expressive, dynamic",
      cinematic: "cinematic lighting, dramatic, movie poster style, high contrast",
      abstract: "abstract art, geometric shapes, gradient colors, artistic composition"
    };

    const enhancement = styleEnhancements[style] || styleEnhancements.ethereal;
    return `${prompt}, ${enhancement}, high quality, 16:9 aspect ratio, digital art`;
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

  async generateVideo(script, visualAssets, audioPath, outputPath, videoFormat = 'slideshow', segments = null) {
    this.logger.info(`Generating video from assets... Format: ${videoFormat}`);
    
    try {
      if (videoFormat === 'video_ai') {
        // Try Replicate/Luma/Runway for true AI video generation
        if (this.replicate && this.replicate.auth) {
          return await this.generateReplicateVideo(script, visualAssets, audioPath, outputPath);
        } else {
          this.logger.warn('AI Video requested (video_ai) but Replicate API key is missing. Falling back to Slideshow.');
        }
      }
      
      // Use reliable FFmpeg slideshow (no Playwright needed)
      return await this.generateFFmpegSlideshow(script, visualAssets, audioPath, outputPath, segments);
    } catch (error) {
      this.logger.error('Video generation failed:', error);
      return await this.simulateVideoGeneration(script, visualAssets, audioPath, outputPath);
    }
  }

  async generateReplicateVideo(script, visualAssets, audioPath, outputPath) {
    // Use Stable Video Diffusion or similar model
    const output = await this.replicate.run(
      "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb1a4f46e66251bb3bfb18edd25d728dda8aa28ab7",
      {
        input: {
          cond_aug: 0.02,
          decoding_t: 7,
          input_image: visualAssets[0], // Use first image as base
          video_length: "14_frames_with_svd",
          sizing_strategy: "maintain_aspect_ratio",
          motion_bucket_id: 127,
          fps_id: 6
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

  async generateFFmpegSlideshow(script, visualAssets, audioPath, outputPath, segments = null) {
    this.logger.info('Creating FFmpeg slideshow video with AI illustrations...');

    const framesDir = path.join(path.dirname(outputPath), `frames_${Date.now()}`);
    await fs.mkdir(framesDir, { recursive: true });

    try {
      const isShort = script.metadata?.strategy?.videoType === 'short';
      const targetW = isShort ? 720 : 1280;
      const targetH = isShort ? 1280 : 720;
      const fps = 25;
      
      const clipPaths = [];
      const sfxInputs = [];
      let totalVideoDuration = 0;
      let silentVideoPath = path.join(framesDir, 'silent_video.mp4');
      
      if (segments && segments.length > 0) {
        this.logger.info('Using per-segment perfect synchronization logic');
        
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const imgPath = seg.imagePath || visualAssets[Math.min(i, visualAssets.length - 1)];
          if (!imgPath || !standardFs.existsSync(imgPath)) continue;
          
          let slideDuration = 4; // minimum fallback
          if (seg.audioPath && standardFs.existsSync(seg.audioPath)) {
            try {
              const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${seg.audioPath}"`;
              const { stdout } = await execAsync(probeCmd);
              const probed = parseFloat(stdout.trim());
              if (!isNaN(probed) && probed > 0) {
                slideDuration = probed + 0.3; // exact match + small padding
              }
            } catch (e) {
               this.logger.warn(`Failed to probe audio duration for segment ${i}`);
            }
          }
          
          const totalFrames = slideDuration * fps;
          const clipPath = path.join(framesDir, `clip_${i}.mp4`);
          const safeCmd = `ffmpeg -y -loop 1 -i "${imgPath}" -vf "scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetW}x${targetH}:fps=${fps}" -t ${slideDuration} -c:v libx264 -pix_fmt yuv420p -preset fast -r ${fps} "${clipPath}"`;
          await execAsync(safeCmd);
          
          const avClipPath = path.join(framesDir, `avclip_${i}.mp4`);
          if (seg.audioPath && standardFs.existsSync(seg.audioPath)) {
             await execAsync(`ffmpeg -y -i "${clipPath}" -i "${seg.audioPath}" -c:v copy -c:a aac -shortest "${avClipPath}"`);
          } else {
             await execAsync(`ffmpeg -y -i "${clipPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v copy -c:a aac -shortest "${avClipPath}"`);
          }
          clipPaths.push(avClipPath);
          
          if (seg.sfx_keywords) {
             const sfxPath = await this.getSfxFile(seg.sfx_keywords);
             if (sfxPath) {
                sfxInputs.push({ path: sfxPath, delayMs: totalVideoDuration * 1000 });
             }
          }
          totalVideoDuration += slideDuration;
          this.logger.info(`Created synchronized clip ${i + 1}/${segments.length} (${slideDuration.toFixed(1)}s)`);
        }
        
        // Concat AV clips directly
        const concatListPath = path.join(framesDir, 'concat_list.txt');
        const listContent = clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
        await fs.writeFile(concatListPath, listContent);
        
        const mergedAVPath = path.join(framesDir, 'merged_av.mp4');
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${mergedAVPath}"`);
        
        // We will process this merged AV for BGM and SFX
        silentVideoPath = mergedAVPath; // reuse variable name for next step
        
      } else {
        this.logger.info('Using legacy monolithic synchronization logic');
        const realImages = (visualAssets || []).filter(p => p && typeof p === 'string' && !p.endsWith('.info') && standardFs.existsSync(p));
        if (realImages.length === 0) return await this.generateTextOnlySlideshow(script, audioPath, outputPath);
        
        let totalDuration = this.calculateScriptDuration(script);
        if (audioPath && standardFs.existsSync(audioPath)) {
          try {
            const probeCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
            const { stdout } = await execAsync(probeCommand);
            const probedDuration = parseFloat(stdout.trim());
            if (!isNaN(probedDuration) && probedDuration > 0) totalDuration = probedDuration;
          } catch (e) {}
        }
        
        const slideDuration = Math.max(3, Math.ceil(totalDuration / realImages.length));
        for (let i = 0; i < realImages.length; i++) {
          const totalFrames = slideDuration * fps;
          const clipPath = path.join(framesDir, `clip_${i}.mp4`);
          const safeCmd = `ffmpeg -y -loop 1 -i "${realImages[i]}" -vf "scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetW}x${targetH}:fps=${fps}" -t ${slideDuration} -c:v libx264 -pix_fmt yuv420p -preset fast -r ${fps} "${clipPath}"`;
          await execAsync(safeCmd);
          clipPaths.push(clipPath);
        }
        
        const concatListPath = path.join(framesDir, 'concat_list.txt');
        await fs.writeFile(concatListPath, clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n'));
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${silentVideoPath}"`);
      }

      // Add BGM & SFX
      let bgmCommand = '';
      let hasBgm = false;
      let randomBgm = '';
      try {
        const bgmDir = path.join(__dirname, '..', 'assets', 'bgm');
        const bgmFiles = await fs.readdir(bgmDir).catch(() => []);
        const validBgm = bgmFiles.filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        if (validBgm.length > 0) {
          randomBgm = path.join(bgmDir, validBgm[Math.floor(Math.random() * validBgm.length)]);
          hasBgm = true;
        }
      } catch (e) {}
      
      const isSegmented = segments && segments.length > 0;
      
      let inputs = ` -i "${silentVideoPath}"`;
      if (!isSegmented && audioPath && standardFs.existsSync(audioPath)) {
         inputs += ` -i "${audioPath}"`; // Legacy: add monolithic audio
      }
      if (hasBgm) inputs += ` -stream_loop -1 -i "${randomBgm}"`;
      
      sfxInputs.forEach(sfx => inputs += ` -i "${sfx.path}"`);
      
      let filterComplex = '';
      let amixInputs = '';
      let mixCount = 0;
      let inputIndex = 0; // 0 is always video
      
      if (isSegmented) {
         // Video already has audio stream from segments
         filterComplex += `[0:a]volume=1.0[a_base];`;
         amixInputs += '[a_base]';
         mixCount++;
      } else if (audioPath && standardFs.existsSync(audioPath)) {
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
      
      if (mixCount > 0) {
         filterComplex += `${amixInputs}amix=inputs=${mixCount}:duration=first:dropout_transition=2[a]`;
         bgmCommand = `ffmpeg -y${inputs} -filter_complex "${filterComplex}" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest "${outputPath}"`;
      } else if (isSegmented || (audioPath && standardFs.existsSync(audioPath))) {
         // Has audio stream natively from segments or monolithic TTS, just copy
         bgmCommand = `ffmpeg -y${inputs} -c:v copy -c:a copy "${outputPath}"`;
      } else {
         // Completely silent video
         await fs.copyFile(silentVideoPath, outputPath);
         this.logger.warn('No audio file found, video exported without audio');
      }
      
      this.logger.info(`Mixing audio with ${hasBgm ? 'BGM' : 'no BGM'} and ${sfxInputs.length} SFX tracks`);
      if (bgmCommand) {
         await execAsync(bgmCommand);
      }

      // Cleanup temp frames directory
      await this.cleanupDirectory(framesDir);

      this.logger.info(`FFmpeg slideshow video created: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('FFmpeg slideshow failed:', error.message);
      // Cleanup on failure
      try { await this.cleanupDirectory(framesDir); } catch (_) {}
      throw error;
    }
  }

  async generateTextOnlySlideshow(script, audioPath, outputPath) {
    this.logger.info('Generating text-only slideshow as fallback...');

    const sections = (script.mainContent && script.mainContent.sections) || [{ title: script.title }];
    const totalDuration = this.calculateScriptDuration(script);
    const slideDuration = Math.max(5, Math.floor(totalDuration / sections.length));
    const framesDir = path.join(path.dirname(outputPath), `textframes_${Date.now()}`);
    await fs.mkdir(framesDir, { recursive: true });

    const clipPaths = [];
    const colors = ['0x1a1a2e', '0x16213e', '0x0f3460', '0x533483', '0x2d6a4f'];

    for (let i = 0; i < sections.length; i++) {
      const clipPath = path.join(framesDir, `tclip_${i}.mp4`);
      const color = colors[i % colors.length];
      const title = (sections[i].title || script.title || '').replace(/['":\\]/g, ' ').replace(/[^\x20-\x7E]/g, '');
      const fps = 25;
      const frames = slideDuration * fps;

      const isShort = script.metadata?.strategy?.videoType === 'short';
      const targetW = isShort ? 720 : 1280;
      const targetH = isShort ? 1280 : 720;
      const cmd = `ffmpeg -y -f lavfi -i "color=c=${color}:size=${targetW}x${targetH}:rate=${fps}" -vf "drawtext=text='${title}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.3:boxborderw=20" -t ${slideDuration} -c:v libx264 -pix_fmt yuv420p -preset fast "${clipPath}"`;
      await execAsync(cmd);
      clipPaths.push(clipPath);
    }

    const concatListPath = path.join(framesDir, 'concat.txt');
    await fs.writeFile(concatListPath, clipPaths.map(p => `file '${p}'`).join('\n'));
    const silentPath = path.join(framesDir, 'silent.mp4');
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${silentPath}"`);

    if (audioPath && standardFs.existsSync(audioPath)) {
      await execAsync(`ffmpeg -y -i "${silentPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}"`);
    } else {
      await fs.copyFile(silentPath, outputPath);
    }

    await this.cleanupDirectory(framesDir);
    return outputPath;
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

  async addAudioToVideo(videoPath, audioPath, outputPath) {
    const command = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}"`;
    await execAsync(command);
    this.logger.info('Audio added to video successfully');
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
    const command = `ffmpeg -y -i "${mainVideoPath}" -vf "crop=ih*(9/16):ih,scale=1080:1920" -t 59 -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k "${outputPath}"`;
    
    try {
      await execAsync(command);
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
      if (!this.openai && !this.gemini) {
        return await this.simulateThumbnailGeneration(script, style);
      }

      const promptText = `YouTube thumbnail for "${script.title}", ${style} style, eye-catching, high contrast text, professional design, clickable, engaging`;
      const thumbnailPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_${Date.now()}.png`);
      await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });

      if (this.openai) {
        const response = await this.openai.images.generate({
          model: "dall-e-3",
          prompt: promptText,
          n: 1,
          size: "1792x1024",
          quality: "hd"
        });

        await this.downloadImage(response.data[0].url, thumbnailPath);
        
        return {
          path: thumbnailPath,
          url: response.data[0].url,
          dimensions: { width: 1792, height: 1024 },
          fileSize: await this.getFileSize(thumbnailPath)
        };
      } else {
        // Use Gemini to generate a highly engaging thumbnail concept
        const systemPrompt = `You are a professional YouTube thumbnail designer specializing in high CTR children's stories/educational channels. Create an extremely vivid, clickable, and cute thumbnail description for a video titled "${script.title}". Describe only the visual scene, characters, and bold emotional elements. Keep it short (max 40 words) and list key elements separated by commas. Do not include any meta-talk or introductory text. Concept: `;
        const geminiResult = await this.gemini.generateContent(systemPrompt + script.title);
        const enhancedText = geminiResult.response.text().trim().replace(/["']/g, '');
        
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
      }
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