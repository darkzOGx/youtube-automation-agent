const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

/**
 * Image generation through an OpenAI-compatible router (`POST {base}/images/generations`),
 * e.g. 9router with model `ag/gemini-3.1-flash-image`.
 *
 * Config (env):
 *   IMAGE_BASE_URL  - defaults to LLM_FALLBACK_BASE_URL (9router)
 *   IMAGE_API_KEY   - defaults to LLM_FALLBACK_API_KEY
 *   IMAGE_MODEL     - default model when the caller passes none
 *
 * The router decides the output size, so the result is center-cropped to the
 * requested aspect (1920x1080 or 1080x1920) before saving.
 */
function isRouterImageConfigured() {
  return !!(process.env.IMAGE_BASE_URL || process.env.LLM_FALLBACK_BASE_URL);
}

// The router passes upstream quota errors through as 429/502 with a "reset after Ns" hint.
async function postWithRetry(url, body, options, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await axios.post(url, body, options);
    } catch (error) {
      const status = error.response?.status;
      if (i >= attempts || ![429, 502, 503].includes(status)) throw error;
      const hint = JSON.stringify(error.response?.data || '').match(/reset after (\d+)s/);
      const waitSeconds = hint ? Number(hint[1]) + 5 : 30;
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    }
  }
}

async function generateRouterImage({ prompt, model, outputPath, isPortrait = false }) {
  const baseURL = (process.env.IMAGE_BASE_URL || process.env.LLM_FALLBACK_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.IMAGE_API_KEY || process.env.LLM_FALLBACK_API_KEY;
  if (!baseURL) throw new Error('IMAGE_BASE_URL is not configured');

  const response = await postWithRetry(
    `${baseURL}/images/generations`,
    {
      model: model || process.env.IMAGE_MODEL || 'ag/gemini-3.1-flash-image',
      prompt,
      n: 1,
      size: 'auto',
      quality: 'auto',
      background: 'auto',
      image_detail: 'high',
      output_format: 'png'
    },
    {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` })
      },
      timeout: 180000
    }
  );

  const item = response.data?.data?.[0];
  let buffer;
  if (item?.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    const img = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 60000 });
    buffer = Buffer.from(img.data);
  } else {
    throw new Error(`Image router returned no image (keys: ${Object.keys(response.data || {}).join(', ')})`);
  }

  const [width, height] = isPortrait ? [1080, 1920] : [1920, 1080];
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(buffer).resize(width, height, { fit: 'cover' }).png().toFile(outputPath);
  return outputPath;
}

module.exports = { generateRouterImage, isRouterImageConfigured };
