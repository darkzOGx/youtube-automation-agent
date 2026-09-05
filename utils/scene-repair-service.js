const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { runFFmpeg } = require('./ffmpeg');
const { ProvenanceService } = require('./provenance-service');

const VIDEO_EXTENSIONS = new Set(['.mp4']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function textFromSection(section = {}) {
  if (typeof section.content === 'string') return section.content;
  if (Array.isArray(section.content)) return section.content.filter(item => typeof item === 'string' && !item.startsWith('[')).join(' ');
  if (Array.isArray(section.items)) return section.items.map(item => `${item.title || ''}. ${item.description || ''}`).join(' ');
  if (Array.isArray(section.steps)) return section.steps.map(item => `${item.title || ''}. ${item.description || ''}`).join(' ');
  return '';
}

function scriptScenes(script = {}) {
  const scenes = [];
  if (script.hook?.text || script.title) {
    scenes.push({
      label: 'Hook',
      scriptText: script.hook?.text || script.title,
      prompt: `${script.hook?.text || script.title}. Cinematic opening shot, clear subject, intentional camera movement, no captions or on-screen text.`
    });
  }
  if (script.introduction) {
    const scriptText = [
      script.introduction.greeting,
      script.introduction.topicIntro,
      script.introduction.valueProposition,
      script.introduction.credibility
    ].filter(Boolean).join(' ');
    if (scriptText) scenes.push({
      label: 'Introduction', scriptText,
      prompt: `${scriptText}. Establishing visual, clear subject, coherent lighting, no captions or on-screen text.`
    });
  }
  for (const [index, section] of (script.mainContent?.sections || []).entries()) {
    const scriptText = textFromSection(section);
    scenes.push({
      label: section.title || `Scene ${index + 1}`,
      scriptText,
      prompt: `${section.title || ''}. ${scriptText}`.trim() + '. Cinematic explanatory B-roll, natural motion, coherent lighting, no captions or on-screen text.'
    });
  }
  if (script.conclusion) {
    const scriptText = [...(script.conclusion.recap || []), script.conclusion.finalThought].filter(Boolean).join(' ');
    if (scriptText) scenes.push({
      label: 'Conclusion', scriptText,
      prompt: `${scriptText}. Memorable cinematic closing shot, no captions or on-screen text.`
    });
  }
  if (script.callToAction) {
    const scriptText = Object.values(script.callToAction).filter(value => typeof value === 'string').join(' ');
    if (scriptText) scenes.push({
      label: 'Call to action', scriptText,
      prompt: `${scriptText}. Clean closing visual with open composition, no captions or on-screen text.`
    });
  }
  return scenes.length ? scenes : [{ label: script.title || 'Video', scriptText: script.fullScript || '', prompt: script.title || 'Video scene' }];
}

function durationSeconds(value, fallback = 60) {
  if (Number.isFinite(Number(value))) return Math.max(1, Number(value));
  const parts = String(value || '').split(':').map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(1, parts[0] * 60 + parts[1]);
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(1, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return fallback;
}

function buildInitialSceneManifest(production = {}, providerResult = {}) {
  const blueprints = scriptScenes(production.script || {});
  const totalDuration = durationSeconds(production.estimatedDuration || production.assets?.finalVideo?.duration, Math.max(30, blueprints.length * 8));
  const wordCounts = blueprints.map(scene => Math.max(8, scene.scriptText.trim().split(/\s+/).filter(Boolean).length));
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
  const generated = providerResult.scenes || [];
  const visualAssets = (production.assets?.video?.visualAssets || []).filter(Boolean);
  const audio = production.assets?.audio || {};
  const narrationStatus = audio.intentionalSilence === true
    ? 'intentional_silence'
    : audio.simulated || audio.status === 'unavailable' ? 'unavailable' : 'current';

  return blueprints.map((scene, position) => {
    const generatedScene = generated.find(item => String(item.label || '').toLowerCase() === scene.label.toLowerCase()) || generated[position];
    const imagePath = visualAssets[position % Math.max(1, visualAssets.length)] || null;
    const assetPath = generatedScene?.path || imagePath;
    const assetType = generatedScene?.path ? 'video' : imagePath ? 'image' : 'missing';
    const provider = generatedScene?.provider || (assetType === 'image' ? 'image-provider' : providerResult.actualProvider || 'slideshow');
    return {
      id: `scene_${crypto.randomUUID()}`,
      position,
      ...scene,
      duration: Math.max(2, Number(((wordCounts[position] / totalWords) * totalDuration).toFixed(2))),
      assetType,
      assetOrigin: 'generated',
      assetPath,
      audioPath: null,
      narrationProvider: audio.provider || null,
      narrationModel: audio.model || null,
      narrationTaskId: audio.externalTaskId || null,
      narrationError: audio.error || null,
      narrationGeneratedAt: audio.generatedAt || null,
      narrationCost: audio.cost || {},
      provider,
      model: generatedScene?.model || providerResult.model || null,
      externalTaskId: generatedScene?.taskId || null,
      status: assetPath ? 'ready' : 'missing_asset',
      narrationStatus,
      revision: 1,
      locked: false,
      rightsConfirmed: true,
      provenanceSourceIds: [],
      containsSyntheticMedia: Boolean(generatedScene?.path && !['slideshow', 'simulation'].includes(provider)),
      estimatedCost: generatedScene?.path ? { unit: 'generated_seconds', amount: generatedScene.duration || 0, pricing: 'provider-priced' } : {},
      actualCost: {}
    };
  });
}

class SceneRepairService {
  constructor(db, videoGenerator, options = {}) {
    this.db = db;
    this.videoGenerator = videoGenerator;
    this.mediaGeneration = videoGenerator?.mediaGeneration;
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this.dataRoot = options.dataRoot || path.join(__dirname, '..', 'data');
  }

  async ensureManifest(bundle) {
    if (bundle.scenes?.length) return bundle.scenes;
    const scenes = buildInitialSceneManifest(bundle, bundle.assets?.finalVideo?.provider || {});
    await this.initializeAudioSegments(bundle, scenes);
    return this.db.replaceProductionScenes(bundle.id, scenes);
  }

  async initializeProduction(production, providerResult = {}) {
    const scenes = buildInitialSceneManifest(production, providerResult);
    await this.initializeAudioSegments(production, scenes);
    const saved = await this.db.replaceProductionScenes(production.id, scenes);
    production.assets.sceneManifest = { count: saved.length, version: 1, updatedAt: new Date().toISOString() };
    return saved;
  }

  async initializeAudioSegments(production, scenes) {
    const audioPath = production.assets?.audio?.path;
    const audio = production.assets?.audio || {};
    if (!await this.videoGenerator?.isUsableAudioFile?.(audioPath)) {
      for (const scene of scenes) {
        scene.narrationStatus = audio.intentionalSilence === true ? 'intentional_silence' : 'unavailable';
        scene.narrationError = audio.intentionalSilence === true ? null : audio.error || 'Narration audio is unavailable';
      }
      return scenes;
    }
    const directory = path.join(this.dataRoot, 'audio', 'scenes', production.id);
    await fs.mkdir(directory, { recursive: true });
    let start = 0;
    for (const scene of scenes) {
      const output = path.join(directory, `${String(scene.position).padStart(3, '0')}_r1.mp3`);
      try {
        await runFFmpeg(['-y', '-ss', start.toFixed(2), '-t', Number(scene.duration).toFixed(2), '-i', audioPath, '-vn', '-c:a', 'libmp3lame', output]);
        scene.audioPath = output;
        scene.narrationStatus = 'current';
        scene.narrationProvider = audio.provider || null;
        scene.narrationModel = audio.model || null;
        scene.narrationTaskId = audio.externalTaskId || null;
        scene.narrationError = null;
        scene.narrationGeneratedAt = audio.generatedAt || null;
        scene.narrationCost = audio.cost || {};
      } catch (error) {
        this.logger.warn(`Could not split narration for scene ${scene.position + 1}: ${error.message}`);
        scene.audioPath = null;
        scene.narrationStatus = 'unavailable';
        scene.narrationError = `Narration segment could not be prepared: ${error.message}`;
      }
      start += Number(scene.duration);
    }
    return scenes;
  }

  async getEditableBundle(productionId) {
    const bundle = await this.db.getProductionBundle(productionId);
    if (!bundle) throw this.error('Content not found', 404);
    if (bundle.schedule || bundle.review_status === 'approved') {
      throw this.error('Scene repair is locked after content is approved or scheduled', 409);
    }
    if (!bundle.scenes?.length) {
      bundle.scenes = await this.ensureManifest(bundle);
    }
    return bundle;
  }

  async updateScene(productionId, sceneId, input = {}) {
    const bundle = await this.getEditableBundle(productionId);
    const scene = bundle.scenes.find(item => item.id === sceneId);
    if (!scene) throw this.error('Scene not found', 404);
    if (scene.locked && input.locked !== false) throw this.error('Unlock this scene before editing it', 409);

    const verifiedSourceIds = new Set((bundle.provenance?.sources || []).filter(source => source.status === 'verified').map(source => source.id));
    const provenanceSourceIds = input.provenanceSourceIds === undefined
      ? scene.provenanceSourceIds
      : [...new Set(this.array(input.provenanceSourceIds).filter(id => verifiedSourceIds.has(id)))];
    const scriptText = input.scriptText === undefined ? scene.scriptText : this.text(input.scriptText, 10000, 'Scene narration');
    const prompt = input.prompt === undefined ? scene.prompt : this.text(input.prompt, 2000, 'Scene prompt');
    const label = input.label === undefined ? scene.label : this.text(input.label, 120, 'Scene label');
    const duration = input.duration === undefined ? scene.duration : Number(input.duration);
    if (!Number.isFinite(duration) || duration < 2 || duration > 600) throw this.error('Scene duration must be between 2 and 600 seconds', 400);
    const scriptChanged = scriptText !== scene.scriptText;
    const promptChanged = prompt !== scene.prompt;
    const durationChanged = duration !== scene.duration;
    const next = await this.db.updateProductionScene(productionId, sceneId, {
      label, scriptText, prompt, duration, provenanceSourceIds,
      locked: input.locked === undefined ? scene.locked : input.locked === true,
      narrationStatus: scriptChanged ? 'stale' : scene.narrationStatus,
      status: promptChanged ? 'visual_stale' : scriptChanged || durationChanged ? 'needs_rebuild' : scene.status,
      revision: scriptChanged || promptChanged || durationChanged ? scene.revision + 1 : scene.revision
    });

    if (scriptChanged && input.factualChange !== false) {
      await this.markSceneClaimForReview(bundle, next, verifiedSourceIds);
    }
    await this.db.saveProductionSceneRevision({
      productionId, sceneId, action: 'edit', before: scene, after: next,
      costEvidence: { billed: false }
    });
    return next;
  }

  async markSceneClaimForReview(bundle, scene, verifiedSourceIds) {
    const provenance = bundle.provenance || { sources: [], claims: [], containsSyntheticMedia: false };
    const id = `scene_claim_${scene.id}_r${scene.revision}`;
    const sourceIds = scene.provenanceSourceIds.filter(sourceId => verifiedSourceIds.has(sourceId));
    const claims = [...(provenance.claims || []).filter(claim => !String(claim.id).startsWith(`scene_claim_${scene.id}_`)), {
      id,
      text: scene.scriptText,
      riskLevel: 'standard',
      sourceIds,
      status: sourceIds.length ? 'supported' : 'pending',
      notes: `Narration changed in ${scene.label}; review before approval.`
    }];
    await new ProvenanceService(this.db).review(bundle.id, {
      sources: provenance.sources || [], claims,
      containsSyntheticMedia: provenance.containsSyntheticMedia
    });
  }

  async reorder(productionId, orderedIds) {
    const bundle = await this.getEditableBundle(productionId);
    if (bundle.scenes.some(scene => scene.locked)) throw this.error('Unlock every scene before changing timeline order', 409);
    const before = bundle.scenes;
    const after = await this.db.reorderProductionScenes(productionId, this.array(orderedIds));
    await this.db.saveProductionSceneRevision({
      productionId, sceneId: after[0].id, action: 'reorder', before: { order: before.map(scene => scene.id) },
      after: { order: after.map(scene => scene.id) }, costEvidence: { billed: false }
    });
    return after;
  }

  async regenerateNarration(productionId, sceneId, input = {}) {
    const bundle = await this.getEditableBundle(productionId);
    const scene = bundle.scenes.find(item => item.id === sceneId);
    if (!scene) throw this.error('Scene not found', 404);
    if (scene.locked) throw this.error('Unlock this scene before regenerating narration', 409);
    if (input.confirmCost !== true) {
      throw this.error('Confirm that narration regeneration may consume provider credits', 409, 'NARRATION_COST_CONFIRMATION_REQUIRED');
    }

    const before = scene;
    const outputPath = path.join(this.dataRoot, 'audio', 'scenes', productionId, `${String(scene.position).padStart(3, '0')}_r${scene.revision + 1}.mp3`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    try {
      await this.db.updateProductionScene(productionId, sceneId, {
        narrationStatus: 'generating', narrationError: null
      });
      const generatedPath = await this.videoGenerator.generateTTSAudio(scene.scriptText, outputPath);
      const evidence = this.videoGenerator.lastNarrationResult || {};
      if (!await this.videoGenerator.isUsableAudioFile(generatedPath)) {
        throw this.error('Narration regeneration returned no usable audio; configure a live TTS provider and retry', 422, 'NARRATION_UNAVAILABLE');
      }
      const cost = evidence.cost || {
        provider: evidence.provider || 'configured-tts', amount: null, currency: null, invoiceRequired: true
      };
      const next = await this.db.updateProductionScene(productionId, sceneId, {
        audioPath: generatedPath,
        narrationStatus: 'current',
        narrationProvider: evidence.provider || 'configured-tts',
        narrationModel: evidence.model || null,
        narrationTaskId: evidence.externalTaskId || null,
        narrationError: null,
        narrationGeneratedAt: evidence.generatedAt || new Date().toISOString(),
        narrationCost: cost,
        status: scene.status === 'visual_stale' ? 'visual_stale' : 'needs_rebuild',
        revision: scene.revision + 1
      });
      await this.updateProductionAudioState(bundle, {
        status: 'partial', path: null, simulated: false, intentionalSilence: false,
        error: 'Scene narration changed; rebuild the final narration mix before approval'
      });
      await this.db.saveProductionSceneRevision({
        productionId, sceneId, action: 'regenerate_narration', before, after: next, costEvidence: cost
      });
      return next;
    } catch (error) {
      const evidence = this.videoGenerator.lastNarrationResult || {};
      await this.db.updateProductionScene(productionId, sceneId, {
        narrationStatus: 'failed', narrationProvider: evidence.provider || scene.narrationProvider,
        narrationModel: evidence.model || scene.narrationModel, narrationTaskId: evidence.externalTaskId || null,
        narrationError: error.message, narrationGeneratedAt: evidence.generatedAt || new Date().toISOString(),
        narrationCost: evidence.cost || scene.narrationCost || {}
      }).catch(() => {});
      await this.db.saveProductionSceneRevision({
        productionId, sceneId, action: 'regenerate_narration', status: 'failed', before, after: {},
        costEvidence: evidence.cost || {}, error: error.message
      }).catch(() => {});
      throw error;
    }
  }

  async setSilenceOverride(productionId, input = {}) {
    const bundle = await this.getEditableBundle(productionId);
    const enabled = input.enabled === true;
    const reason = String(input.reason || '').trim();
    if (enabled && input.confirmed !== true) {
      throw this.error('Confirm the intentional-silence override before applying it', 409, 'SILENCE_CONFIRMATION_REQUIRED');
    }
    if (enabled && reason.length < 10) {
      throw this.error('Explain why this production is intentionally silent using at least 10 characters', 400);
    }
    const changedAt = new Date().toISOString();
    const audioChanges = enabled
      ? {
          path: null, status: 'intentional_silence', simulated: false, intentionalSilence: true,
          silenceReason: reason, silenceConfirmedAt: changedAt, provider: 'operator-override', model: null,
          externalTaskId: null, generatedAt: changedAt, cost: { billed: false }, error: null
        }
      : {
          path: null, status: 'unavailable', simulated: true, intentionalSilence: false,
          silenceReason: null, silenceConfirmedAt: null, provider: null, model: null,
          externalTaskId: null, generatedAt: changedAt, cost: { billed: false },
          error: 'Narration is required; regenerate every missing scene before approval'
        };
    await this.updateProductionAudioState(bundle, audioChanges);
    const updated = [];
    for (const scene of bundle.scenes) {
      const before = scene;
      const hasAudio = !enabled && scene.audioPath && await this.pathExists(scene.audioPath);
      const next = await this.db.updateProductionScene(productionId, scene.id, {
        audioPath: enabled ? null : scene.audioPath,
        narrationStatus: enabled ? 'intentional_silence' : hasAudio ? 'current' : 'unavailable',
        narrationProvider: enabled ? 'operator-override' : scene.narrationProvider,
        narrationModel: enabled ? null : scene.narrationModel,
        narrationTaskId: enabled ? null : scene.narrationTaskId,
        narrationError: enabled || hasAudio ? null : 'Narration is required for this scene',
        narrationGeneratedAt: changedAt,
        narrationCost: enabled ? { billed: false } : scene.narrationCost,
        status: scene.status === 'visual_stale' ? 'visual_stale' : 'needs_rebuild',
        revision: scene.revision + 1
      });
      await this.db.saveProductionSceneRevision({
        productionId, sceneId: scene.id, action: enabled ? 'confirm_intentional_silence' : 'require_narration',
        before, after: next, costEvidence: { billed: false }
      });
      updated.push(next);
    }
    return { enabled, reason: enabled ? reason : null, scenes: updated };
  }

  async updateProductionAudioState(bundle, changes) {
    const assets = { ...bundle.assets, audio: { ...(bundle.assets?.audio || {}), ...changes } };
    await this.db.updateProductionData({
      id: bundle.id, status: bundle.status, assets, timeline: bundle.timeline,
      scheduledPublishTime: bundle.scheduled_publish_time, priority: bundle.priority
    });
    bundle.assets = assets;
    return assets.audio;
  }

  async regenerationEstimate(productionId, sceneId, input = {}) {
    const bundle = await this.getEditableBundle(productionId);
    const scene = bundle.scenes.find(item => item.id === sceneId);
    if (!scene) throw this.error('Scene not found', 404);
    const settings = await this.mediaGeneration?.settings?.() || { provider: 'slideshow', order: [], clipDuration: scene.duration };
    const requestedProvider = input.provider || (scene.provider && scene.provider !== 'image-provider' ? scene.provider : settings.provider);
    const provider = this.mediaGeneration?.registry?.select(requestedProvider, settings.order, { duration: Math.min(scene.duration, settings.clipDuration || scene.duration) });
    const paid = Boolean(provider && provider.id !== 'slideshow');
    const generatedSeconds = paid ? provider.normalizeRequest({ duration: Math.min(scene.duration, settings.clipDuration || scene.duration) }).duration : 0;
    return {
      provider: provider?.id || 'slideshow', model: provider?.model || 'local-image', paid,
      generatedSeconds, pricing: paid ? 'provider-priced' : 'no video-provider charge',
      warning: paid ? 'This regeneration can consume provider credits. The provider invoice is authoritative.' : null
    };
  }

  async regenerate(productionId, sceneId, input = {}) {
    const bundle = await this.getEditableBundle(productionId);
    const scene = bundle.scenes.find(item => item.id === sceneId);
    if (!scene) throw this.error('Scene not found', 404);
    if (scene.locked) throw this.error('Unlock this scene before regenerating it', 409);
    const estimate = await this.regenerationEstimate(productionId, sceneId, input);
    if (estimate.paid && input.confirmPaid !== true) throw this.error('Confirm the paid scene regeneration before starting it', 409, 'PAID_CONFIRMATION_REQUIRED', estimate);

    const before = scene;
    let visual = {};
    let narration = {};
    try {
      await this.db.updateProductionScene(productionId, sceneId, { status: 'generating' });
      if (estimate.paid) {
        const provider = this.mediaGeneration.registry.get(estimate.provider);
        const settings = await this.mediaGeneration.settings();
        const request = provider.normalizeRequest({
          prompt: scene.prompt, duration: estimate.generatedSeconds, resolution: settings.resolution,
          aspectRatio: settings.aspectRatio, generateAudio: false, referenceImages: []
        });
        const outputPath = path.join(this.dataRoot, 'videos', 'scenes', `${productionId}_${scene.id}_r${scene.revision + 1}.mp4`);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        const result = await this.mediaGeneration.generateClip({
          jobId: `repair_${productionId}_${scene.id}_${scene.revision + 1}`,
          productionId, scene: { index: scene.position, prompt: scene.prompt }, provider, outputPath, request
        });
        visual = {
          assetType: 'video', assetOrigin: 'generated', assetPath: result.outputPath,
          provider: provider.id, model: result.task.model, externalTaskId: result.task.external_task_id,
          containsSyntheticMedia: true
        };
      } else {
        const assets = await this.videoGenerator.generateVisualAssets(scene.prompt, 'ethereal', 1);
        const assetPath = assets[0];
        if (!assetPath || !IMAGE_EXTENSIONS.has(path.extname(assetPath).toLowerCase()) || !await this.pathExists(assetPath)) {
          throw this.error('No real replacement image was generated; configure an image provider or upload an asset', 422, 'SCENE_ASSET_UNAVAILABLE');
        }
        visual = { assetType: 'image', assetOrigin: 'generated', assetPath, provider: 'image-provider', model: null, externalTaskId: null, containsSyntheticMedia: true };
      }

      if (scene.narrationStatus === 'stale' || input.regenerateNarration === true) {
        const audioPath = path.join(this.dataRoot, 'audio', 'scenes', productionId, `${String(scene.position).padStart(3, '0')}_r${scene.revision + 1}.mp3`);
        await fs.mkdir(path.dirname(audioPath), { recursive: true });
        const generatedPath = await this.videoGenerator.generateTTSAudio(scene.scriptText, audioPath);
        if (!await this.videoGenerator.isUsableAudioFile(generatedPath)) {
          throw this.error('Narration regeneration returned a simulation; configure a live TTS provider before rebuilding edited narration', 422, 'NARRATION_UNAVAILABLE');
        }
        const evidence = this.videoGenerator.lastNarrationResult || {};
        narration = {
          audioPath: generatedPath, narrationStatus: 'current',
          narrationProvider: evidence.provider || 'configured-tts', narrationModel: evidence.model || null,
          narrationTaskId: evidence.externalTaskId || null, narrationError: null,
          narrationGeneratedAt: evidence.generatedAt || new Date().toISOString(), narrationCost: evidence.cost || {}
        };
      }

      const next = await this.db.updateProductionScene(productionId, sceneId, {
        ...visual, ...narration, status: 'needs_rebuild', revision: scene.revision + 1,
        estimatedCost: estimate,
        actualCost: { generatedSeconds: estimate.generatedSeconds, provider: estimate.provider, amount: null, currency: null, invoiceRequired: estimate.paid }
      });
      await this.db.saveProductionSceneRevision({
        productionId, sceneId, action: 'regenerate', before, after: next,
        costEvidence: next.actualCost
      });
      return { scene: next, estimate };
    } catch (error) {
      await this.db.updateProductionScene(productionId, sceneId, { status: 'failed' }).catch(() => {});
      await this.db.saveProductionSceneRevision({
        productionId, sceneId, action: 'regenerate', status: 'failed', before,
        after: {}, costEvidence: estimate, error: error.message
      }).catch(() => {});
      throw error;
    }
  }

  async replaceAsset(productionId, sceneId, file = {}) {
    const bundle = await this.getEditableBundle(productionId);
    const scene = bundle.scenes.find(item => item.id === sceneId);
    if (!scene) throw this.error('Scene not found', 404);
    if (scene.locked) throw this.error('Unlock this scene before replacing its asset', 409);
    if (file.rightsConfirmed !== true) throw this.error('Confirm that you have rights to the replacement asset', 400, 'RIGHTS_CONFIRMATION_REQUIRED');
    if (!Buffer.isBuffer(file.buffer) || !file.buffer.length) throw this.error('Replacement asset is empty', 400);

    const contentType = String(file.contentType || '').toLowerCase();
    const assetType = contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : null;
    if (!assetType) throw this.error('Replacement assets must be an image or video', 415);
    const suppliedExtension = path.extname(String(file.filename || '')).toLowerCase();
    const extension = suppliedExtension || (assetType === 'video' ? '.mp4' : '.png');
    if ((assetType === 'video' && !VIDEO_EXTENSIONS.has(extension)) || (assetType === 'image' && !IMAGE_EXTENSIONS.has(extension))) {
      throw this.error('Replacement asset file type is not supported', 415);
    }
    const directory = path.join(this.dataRoot, 'scene-assets', productionId);
    const outputPath = path.join(directory, `${scene.id}_r${scene.revision + 1}${extension}`);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(outputPath, file.buffer);
    try {
      if (assetType === 'video') {
        if (!await this.mediaGeneration?.isValidVideo?.(outputPath)) throw new Error('Video is not a valid, decodable MP4-compatible asset');
      } else {
        await sharp(outputPath).metadata();
      }
    } catch (error) {
      await fs.unlink(outputPath).catch(() => {});
      throw this.error(error.message || 'Replacement asset is invalid', 422);
    }

    const next = await this.db.updateProductionScene(productionId, sceneId, {
      assetType, assetOrigin: 'uploaded', assetPath: outputPath, provider: 'operator-upload', model: null,
      externalTaskId: null, rightsConfirmed: true, containsSyntheticMedia: file.containsSyntheticMedia === true,
      status: 'needs_rebuild', revision: scene.revision + 1,
      estimatedCost: {}, actualCost: { billed: false }
    });
    await this.db.saveProductionSceneRevision({
      productionId, sceneId, action: 'replace_asset', before: scene, after: next,
      costEvidence: { billed: false }
    });
    return next;
  }

  async rebuild(productionId) {
    const bundle = await this.getEditableBundle(productionId);
    const scenes = await this.db.listProductionScenes(productionId);
    if (!scenes.length) throw this.error('No scene manifest is available', 409);
    const missing = [];
    const fullNarrationReady = await this.videoGenerator.isUsableAudioFile(bundle.assets?.audio?.path);
    const currentSceneAudio = [];
    for (const scene of scenes) {
      if (!['current', 'intentional_silence'].includes(scene.narrationStatus)) {
        missing.push(`${scene.label}: narration is ${String(scene.narrationStatus || 'unavailable').replaceAll('_', ' ')}`);
      }
      if (scene.narrationStatus === 'current') currentSceneAudio.push(Boolean(scene.audioPath && await this.pathExists(scene.audioPath)));
      if (scene.status === 'visual_stale') missing.push(`${scene.label}: visual prompt changed but the asset was not regenerated or replaced`);
      if (['failed', 'generating', 'missing_asset'].includes(scene.status)) missing.push(`${scene.label}: scene status is ${scene.status.replaceAll('_', ' ')}`);
      if (!scene.assetPath || !await this.pathExists(scene.assetPath)) missing.push(`${scene.label}: visual asset is missing`);
      if (scene.assetOrigin === 'uploaded' && !scene.rightsConfirmed) missing.push(`${scene.label}: media rights are not confirmed`);
    }
    if (currentSceneAudio.some(Boolean) && currentSceneAudio.some(value => !value)) {
      missing.push('The scene narration mix is incomplete; regenerate every missing narration segment');
    } else if (currentSceneAudio.length && currentSceneAudio.every(value => !value) && !fullNarrationReady) {
      missing.push('No usable production or scene narration audio is available');
    }
    if (missing.length) throw this.error(`Cannot rebuild: ${missing.join('; ')}`, 409, 'SCENE_REBUILD_BLOCKED', { blockers: missing });

    const timestamp = Date.now();
    const visualPath = path.join(this.dataRoot, 'videos', `${productionId}_repair_${timestamp}_visual.mp4`);
    const finalPath = path.join(this.dataRoot, 'videos', `${productionId}_repair_${timestamp}.mp4`);
    const captionsPath = path.join(this.dataRoot, 'captions', `${productionId}_repair_${timestamp}.srt`);
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.mkdir(path.dirname(captionsPath), { recursive: true });
    await this.videoGenerator.renderMediaTimeline(scenes.map(scene => ({
      type: scene.assetType, path: scene.assetPath, duration: scene.duration
    })), visualPath);

    const audioPath = await this.rebuildNarration(productionId, scenes, bundle.assets?.audio?.path, timestamp);
    const allIntentionalSilence = scenes.every(scene => scene.narrationStatus === 'intentional_silence');
    await this.videoGenerator.addAudioToVideo(visualPath, audioPath, finalPath, { allowSilent: allIntentionalSilence });
    await fs.unlink(visualPath).catch(() => {});
    await fs.writeFile(captionsPath, this.buildSRT(scenes));
    const stats = await fs.stat(finalPath);
    const previousPath = bundle.assets?.finalVideo?.path || null;
    const containsSyntheticMedia = scenes.some(scene => scene.containsSyntheticMedia);
    const assets = {
      ...bundle.assets,
      audio: {
        ...(bundle.assets?.audio || {}), path: audioPath, simulated: false,
        status: allIntentionalSilence ? 'intentional_silence' : 'ready',
        intentionalSilence: allIntentionalSilence,
        provider: allIntentionalSilence ? 'operator-override' : 'scene-mix',
        model: allIntentionalSilence ? null : 'ffmpeg-concat',
        generatedAt: new Date().toISOString(), error: null,
        sceneMixed: scenes.some(scene => scene.audioPath) || scenes.some(scene => scene.narrationStatus === 'intentional_silence'),
        sceneEvidence: scenes.map(scene => ({
          sceneId: scene.id, status: scene.narrationStatus, provider: scene.narrationProvider,
          model: scene.narrationModel, externalTaskId: scene.narrationTaskId, generatedAt: scene.narrationGeneratedAt
        }))
      },
      captions: { path: captionsPath, format: 'srt', language: 'en', autoGenerated: true, sceneAware: true },
      finalVideo: {
        ...(bundle.assets?.finalVideo || {}), path: finalPath, previousPath, fileSize: stats.size,
        duration: scenes.reduce((sum, scene) => sum + scene.duration, 0), simulated: false,
        provider: { actualProvider: 'scene-repair', model: 'mixed-assets', scenes: scenes.length }
      },
      sceneManifest: { count: scenes.length, version: 1, updatedAt: new Date().toISOString() }
    };
    const timeline = { ...bundle.timeline, sceneRepairAt: new Date().toISOString(), captionsGenerated: new Date().toISOString(), readyForUpload: new Date().toISOString() };
    await this.db.updateProductionData({
      id: productionId, status: 'ready', assets, timeline,
      scheduledPublishTime: bundle.scheduled_publish_time, priority: bundle.priority
    });
    for (const scene of scenes) await this.db.updateProductionScene(productionId, scene.id, { status: 'ready' });
    if (containsSyntheticMedia && bundle.provenance && !bundle.provenance.containsSyntheticMedia) {
      await this.db.saveContentProvenance(productionId, { ...bundle.provenance, containsSyntheticMedia: true, reviewedAt: null });
    }
    await this.db.saveProductionSceneRevision({
      productionId, sceneId: scenes[0].id, action: 'rebuild', before: { finalVideo: previousPath },
      after: { finalVideo: finalPath, captions: captionsPath },
      costEvidence: { billed: false, reusedScenes: scenes.length }
    });
    return { productionId, finalVideo: finalPath, previousVideo: previousPath, captions: captionsPath, scenes: scenes.length };
  }

  async rebuildNarration(productionId, scenes, fallbackAudioPath, timestamp) {
    const hasSceneAudio = scenes.some(scene => scene.audioPath && scene.narrationStatus === 'current');
    const allCurrentWithoutSegments = scenes.every(scene => scene.narrationStatus === 'current' && !scene.audioPath);
    if (!hasSceneAudio && allCurrentWithoutSegments) return fallbackAudioPath;
    const outputPath = path.join(this.dataRoot, 'audio', `${productionId}_scene_mix_${timestamp}.m4a`);
    const args = ['-y'];
    for (const scene of scenes) {
      if (scene.narrationStatus === 'intentional_silence') {
        args.push('-f', 'lavfi', '-t', Number(scene.duration).toFixed(2), '-i', 'anullsrc=r=48000:cl=mono');
      } else {
        args.push('-i', scene.audioPath);
      }
    }
    const filters = scenes.map((scene, index) => `[${index}:a]aresample=48000,apad,atrim=duration=${Number(scene.duration).toFixed(2)},asetpts=PTS-STARTPTS[a${index}]`);
    filters.push(`${scenes.map((_, index) => `[a${index}]`).join('')}concat=n=${scenes.length}:v=0:a=1[aout]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[aout]', '-c:a', 'aac', outputPath);
    await runFFmpeg(args);
    return outputPath;
  }

  buildSRT(scenes) {
    const time = seconds => {
      const ms = Math.max(0, Math.round(seconds * 1000));
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      const millis = ms % 1000;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
    };
    let cursor = 0;
    let index = 1;
    const blocks = [];
    for (const scene of scenes) {
      const words = scene.scriptText.trim().split(/\s+/).filter(Boolean);
      const groups = [];
      for (let offset = 0; offset < words.length; offset += 8) groups.push(words.slice(offset, offset + 8).join(' '));
      const duration = Number(scene.duration);
      const perGroup = groups.length ? duration / groups.length : duration;
      for (const group of groups) {
        blocks.push(`${index++}\n${time(cursor)} --> ${time(cursor + perGroup)}\n${group}`);
        cursor += perGroup;
      }
      if (!groups.length) cursor += duration;
    }
    return blocks.join('\n\n') + (blocks.length ? '\n' : '');
  }

  decorateScene(scene, productionId) {
    return {
      ...scene,
      assetUrl: scene.assetPath ? `/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(scene.id)}/asset?v=${scene.revision}` : null
    };
  }

  text(value, limit, label) {
    const output = String(value || '').trim();
    if (!output) throw this.error(`${label} is required`, 400);
    if (output.length > limit) throw this.error(`${label} must be ${limit.toLocaleString()} characters or less`, 400);
    return output;
  }

  array(value) {
    return Array.isArray(value) ? value.map(item => String(item)) : [];
  }

  async pathExists(filePath) {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile() && stat.size > 0;
    } catch (_error) {
      return false;
    }
  }

  error(message, status = 400, code, details) {
    const error = new Error(message);
    error.status = status;
    if (code) error.code = code;
    if (details) error.details = details;
    return error;
  }
}

module.exports = { SceneRepairService, buildInitialSceneManifest, scriptScenes };
