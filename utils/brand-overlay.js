const fs = require('fs');

const POSITIONS = {
  'top-right': 'W-w-{m}:{m}',
  'top-left': '{m}:{m}',
  'bottom-right': 'W-w-{m}:H-h-{m}',
  'bottom-left': '{m}:H-h-{m}'
};

function numberSetting(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/**
 * Brand logo settings from the environment, or null when no usable logo is configured.
 * BRAND_LOGO_PATH must point to an existing PNG/JPG (a transparent PNG works best).
 */
function getBrandOverlay(env = process.env) {
  const logoPath = String(env.BRAND_LOGO_PATH || '').trim();
  if (!logoPath || !fs.existsSync(logoPath)) return null;
  const position = POSITIONS[env.BRAND_LOGO_POSITION] ? env.BRAND_LOGO_POSITION : 'top-right';
  return {
    logoPath,
    position,
    height: Math.round(numberSetting(env.BRAND_LOGO_HEIGHT, 72, 16, 400)),
    margin: Math.round(numberSetting(env.BRAND_LOGO_MARGIN, 24, 0, 200)),
    opacity: numberSetting(env.BRAND_LOGO_OPACITY, 0.85, 0.05, 1)
  };
}

/**
 * filter_complex graph that scales the logo (input index `logoInput`) and overlays it on
 * video input 0 for the whole video, writing the result to [vbrand].
 */
function buildOverlayFilter(overlay, logoInput = 2) {
  const xy = POSITIONS[overlay.position].replace(/\{m\}/g, String(overlay.margin));
  return [
    `[${logoInput}:v]scale=-1:${overlay.height},format=rgba,colorchannelmixer=aa=${overlay.opacity}[brandlogo]`,
    `[0:v][brandlogo]overlay=${xy}:format=auto,format=yuv420p[vbrand]`
  ].join(';');
}

module.exports = { getBrandOverlay, buildOverlayFilter, POSITIONS };
