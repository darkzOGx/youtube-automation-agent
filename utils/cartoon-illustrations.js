const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const ILLUSTRATION_WIDTH = 720;
const ILLUSTRATION_HEIGHT = 1280;

const PALETTES = Object.freeze([
  Object.freeze({ background: '#10233f', panel: '#173d63', ink: '#f7fbff', muted: '#b7c9dc', primary: '#f6c75d', secondary: '#7dd3fc', good: '#68d391', danger: '#fb7185' }),
  Object.freeze({ background: '#2b1738', panel: '#4b265d', ink: '#fff8fb', muted: '#dfbed8', primary: '#f59e9e', secondary: '#c4b5fd', good: '#86efac', danger: '#fb7185' }),
  Object.freeze({ background: '#12362f', panel: '#1d5a4d', ink: '#f4fffb', muted: '#b8d9d0', primary: '#facc15', secondary: '#67e8f9', good: '#86efac', danger: '#fda4af' }),
  Object.freeze({ background: '#382617', panel: '#62401f', ink: '#fffaf0', muted: '#e5cda9', primary: '#fb923c', secondary: '#fde68a', good: '#a7f3d0', danger: '#fca5a5' }),
  Object.freeze({ background: '#202844', panel: '#303c68', ink: '#f6f8ff', muted: '#c2cbe4', primary: '#a7f3d0', secondary: '#93c5fd', good: '#bef264', danger: '#fda4af' }),
  Object.freeze({ background: '#321c2c', panel: '#5b2e47', ink: '#fff7fb', muted: '#e4bdcf', primary: '#f9a8d4', secondary: '#fde68a', good: '#86efac', danger: '#fb7185' })
]);

const SUPPORTED_KINDS = Object.freeze([
  'cash',
  'jar',
  'calendar',
  'shield',
  'credit-card',
  'scale',
  'chart',
  'house',
  'receipt',
  'warning',
  'target',
  'clock',
  'people',
  'tax',
  'scam',
  'lock',
  'document',
  'coins',
  'bucket',
  'ladder'
]);

const KIND_ALIASES = Object.freeze({
  'creditcard': 'credit-card',
  'credit-card': 'credit-card',
  'piggy-bank': 'jar',
  money: 'cash',
  bill: 'receipt',
  'calendar-check': 'calendar',
  graph: 'chart',
  home: 'house',
  identity: 'people',
  fraud: 'scam'
});

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeKind(kind) {
  const value = String(kind || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  const normalized = KIND_ALIASES[value] || value;
  if (!SUPPORTED_KINDS.includes(normalized)) {
    throw new Error(`Unsupported cartoon illustration kind: ${kind}`);
  }
  return normalized;
}

function isSupportedKind(kind) {
  try {
    normalizeKind(kind);
    return true;
  } catch {
    return false;
  }
}

function getPalette(seed = '') {
  return PALETTES[hashString(seed) % PALETTES.length];
}

function colorsFor(theme = {}) {
  return {
    background: escapeXml(theme.background || PALETTES[0].background),
    panel: escapeXml(theme.panel || PALETTES[0].panel),
    ink: escapeXml(theme.ink || PALETTES[0].ink),
    muted: escapeXml(theme.muted || PALETTES[0].muted),
    primary: escapeXml(theme.primary || PALETTES[0].primary),
    secondary: escapeXml(theme.secondary || PALETTES[0].secondary),
    good: escapeXml(theme.good || PALETTES[0].good),
    danger: escapeXml(theme.danger || PALETTES[0].danger)
  };
}

function wrapText(value, maxCharacters) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCash(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <rect x="-220" y="-80" width="440" height="170" rx="24" fill="${c.primary}"/>
      <rect x="-190" y="-50" width="380" height="110" rx="14" fill="${c.secondary}" opacity="0.35"/>
      <circle cx="0" cy="5" r="43" fill="${c.panel}"/>
      <text x="0" y="24" text-anchor="middle" fill="${c.ink}" stroke="none" font-family="Arial, sans-serif" font-size="54" font-weight="900">$</text>
      <path d="M-190 24 H-118 M118 24 H190" fill="none"/>
      <rect x="-140" y="130" width="280" height="78" rx="18" fill="${c.good}"/>
      <path d="M-96 169 H96" fill="none"/>
    </g>`;
}

function drawJar(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <path d="M-150 -110 H150 L130 170 Q0 235 -130 170 Z" fill="${c.secondary}"/>
      <rect x="-168" y="-145" width="336" height="58" rx="16" fill="${c.primary}"/>
      <path d="M-94 -88 V-124 M0 -88 V-124 M94 -88 V-124" fill="none"/>
      <circle cx="-72" cy="20" r="35" fill="${c.primary}"/>
      <circle cx="20" cy="62" r="35" fill="${c.good}"/>
      <circle cx="82" cy="-8" r="35" fill="${c.primary}"/>
      <text x="-72" y="35" text-anchor="middle" fill="${c.panel}" stroke="none" font-family="Arial, sans-serif" font-size="35" font-weight="900">$</text>
      <text x="20" y="77" text-anchor="middle" fill="${c.panel}" stroke="none" font-family="Arial, sans-serif" font-size="35" font-weight="900">$</text>
    </g>`;
}

function drawCalendar(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <rect x="-220" y="-170" width="440" height="390" rx="28" fill="${c.ink}"/>
      <rect x="-208" y="-158" width="416" height="104" rx="18" fill="${c.primary}"/>
      <rect x="-170" y="-207" width="38" height="86" rx="18" fill="${c.secondary}"/>
      <rect x="132" y="-207" width="38" height="86" rx="18" fill="${c.secondary}"/>
      <g fill="${c.panel}" stroke="none">
        <rect x="-156" y="-5" width="52" height="52" rx="10"/>
        <rect x="-26" y="-5" width="52" height="52" rx="10"/>
        <rect x="104" y="-5" width="52" height="52" rx="10"/>
        <rect x="-156" y="78" width="52" height="52" rx="10"/>
        <rect x="-26" y="78" width="52" height="52" rx="10" fill="${c.good}"/>
        <rect x="104" y="78" width="52" height="52" rx="10"/>
        <rect x="-156" y="161" width="52" height="32" rx="10"/>
        <rect x="-26" y="161" width="52" height="32" rx="10"/>
        <rect x="104" y="161" width="52" height="32" rx="10"/>
      </g>
      <path d="M-5 85 L10 101 L42 66" fill="none" stroke="${c.panel}"/>
    </g>`;
}

function drawShield(c) {
  return `
    <g stroke="${c.ink}" stroke-width="12" stroke-linejoin="round">
      <path d="M0 -220 L180 -150 V-8 Q164 154 0 232 Q-164 154 -180 -8 V-150 Z" fill="${c.secondary}"/>
      <path d="M-86 8 L-25 70 L92 -62" fill="none" stroke="${c.good}" stroke-width="28"/>
      <path d="M0 -174 V-112" fill="none" stroke="${c.primary}" stroke-width="18"/>
    </g>`;
}

function drawCreditCard(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <rect x="-235" y="-145" width="470" height="290" rx="28" fill="${c.primary}"/>
      <rect x="-235" y="-68" width="470" height="52" fill="${c.panel}"/>
      <rect x="-176" y="18" width="70" height="58" rx="10" fill="${c.secondary}"/>
      <path d="M-72 39 H148 M-72 78 H76" fill="none"/>
      <path d="M-178 112 H-38 M-12 112 H70" fill="none" stroke="${c.panel}"/>
    </g>`;
}

function drawScale(c) {
  return `
    <g stroke="${c.ink}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
      <path d="M0 -175 V170 M-125 190 H125" fill="none"/>
      <path d="M-205 -112 H205" fill="none" stroke="${c.primary}" stroke-width="18"/>
      <path d="M-150 -104 L-208 32 H-92 Z M150 -104 L92 32 H208 Z" fill="${c.secondary}"/>
      <path d="M-205 32 Q-150 75 -92 32 M92 32 Q150 75 208 32" fill="none"/>
      <circle cx="0" cy="-175" r="25" fill="${c.good}"/>
    </g>`;
}

function drawChart(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
      <path d="M-220 185 V-180 M-220 185 H230" fill="none"/>
      <rect x="-170" y="56" width="62" height="129" rx="12" fill="${c.secondary}"/>
      <rect x="-72" y="-24" width="62" height="209" rx="12" fill="${c.primary}"/>
      <rect x="26" y="-96" width="62" height="281" rx="12" fill="${c.good}"/>
      <path d="M-174 26 L-42 -38 L54 -116 L178 -174" fill="none" stroke="${c.danger}" stroke-width="18"/>
      <circle cx="-174" cy="26" r="15" fill="${c.danger}"/>
      <circle cx="-42" cy="-38" r="15" fill="${c.danger}"/>
      <circle cx="54" cy="-116" r="15" fill="${c.danger}"/>
      <circle cx="178" cy="-174" r="15" fill="${c.danger}"/>
    </g>`;
}

function drawHouse(c) {
  return `
    <g stroke="${c.ink}" stroke-width="11" stroke-linejoin="round">
      <path d="M-246 -25 L0 -225 L246 -25" fill="${c.primary}"/>
      <path d="M-190 -30 H190 V190 H-190 Z" fill="${c.secondary}"/>
      <rect x="-45" y="62" width="90" height="128" rx="12" fill="${c.panel}"/>
      <rect x="-140" y="18" width="68" height="68" rx="10" fill="${c.good}"/>
      <rect x="72" y="18" width="68" height="68" rx="10" fill="${c.good}"/>
      <path d="M-106 18 V86 M-140 52 H-72 M106 18 V86 M72 52 H140" fill="none" stroke="${c.panel}"/>
      <path d="M-235 190 H235" fill="none"/>
    </g>`;
}

function drawReceipt(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <path d="M-170 -205 H170 V174 L116 140 L62 174 L0 140 L-62 174 L-116 140 L-170 174 Z" fill="${c.ink}"/>
      <path d="M-106 -120 H106 M-106 -56 H80 M-106 8 H106 M-106 72 H40" fill="none" stroke="${c.panel}" stroke-linecap="round"/>
      <rect x="76" y="-73" width="46" height="46" rx="8" fill="${c.primary}"/>
      <path d="M87 -50 L101 -36 L118 -61" fill="none" stroke="${c.panel}"/>
    </g>`;
}

function drawWarning(c) {
  return `
    <g stroke="${c.ink}" stroke-width="12" stroke-linejoin="round">
      <path d="M0 -230 L238 190 H-238 Z" fill="${c.danger}"/>
      <path d="M0 -112 V42" fill="none" stroke="${c.panel}" stroke-width="30" stroke-linecap="round"/>
      <circle cx="0" cy="103" r="18" fill="${c.panel}" stroke="none"/>
      <path d="M-154 190 H154" fill="none" stroke="${c.primary}" stroke-width="20"/>
    </g>`;
}

function drawTarget(c) {
  return `
    <g stroke="${c.ink}" stroke-width="11">
      <circle cx="0" cy="0" r="210" fill="${c.secondary}"/>
      <circle cx="0" cy="0" r="140" fill="${c.panel}"/>
      <circle cx="0" cy="0" r="70" fill="${c.danger}"/>
      <path d="M-250 190 L-82 22" fill="none" stroke="${c.primary}" stroke-width="24" stroke-linecap="round"/>
      <path d="M-98 24 L-72 -20 L-42 9 Z" fill="${c.primary}"/>
    </g>`;
}

function drawClock(c) {
  return `
    <g stroke="${c.ink}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="0" cy="0" r="205" fill="${c.secondary}"/>
      <circle cx="0" cy="0" r="170" fill="${c.panel}"/>
      <path d="M0 -132 V0 L92 68" fill="none" stroke="${c.primary}" stroke-width="24"/>
      <circle cx="0" cy="0" r="22" fill="${c.good}"/>
      <path d="M0 -205 V-178 M205 0 H178 M0 205 V178 M-205 0 H-178" fill="none"/>
    </g>`;
}

function drawPeople(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <circle cx="-132" cy="-104" r="58" fill="${c.primary}"/>
      <circle cx="132" cy="-104" r="58" fill="${c.secondary}"/>
      <circle cx="0" cy="-154" r="68" fill="${c.good}"/>
      <path d="M-230 190 Q-220 24 -132 24 Q-44 24 -34 190 Z" fill="${c.secondary}"/>
      <path d="M34 190 Q44 24 132 24 Q220 24 230 190 Z" fill="${c.primary}"/>
      <path d="M-105 190 Q-92 -6 0 -6 Q92 -6 105 190 Z" fill="${c.good}"/>
    </g>`;
}

function drawTax(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <path d="M-170 -210 H78 L170 -118 V210 H-170 Z" fill="${c.ink}"/>
      <path d="M78 -210 V-118 H170" fill="${c.secondary}"/>
      <path d="M-110 -42 H104 M-110 36 H60" fill="none" stroke="${c.panel}" stroke-linecap="round"/>
      <text x="0" y="145" text-anchor="middle" fill="${c.primary}" stroke="none" font-family="Arial, sans-serif" font-size="112" font-weight="900">%</text>
    </g>`;
}

function drawScam(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <rect x="-150" y="-220" width="300" height="440" rx="42" fill="${c.panel}"/>
      <rect x="-106" y="-142" width="212" height="210" rx="20" fill="${c.secondary}"/>
      <path d="M-72 -66 H72 M-72 -14 H38" fill="none" stroke="${c.panel}" stroke-linecap="round"/>
      <path d="M-50 28 L0 -24 L50 28" fill="none" stroke="${c.danger}" stroke-width="18"/>
      <circle cx="0" cy="145" r="18" fill="${c.primary}" stroke="none"/>
      <path d="M-84 112 H84" fill="none" stroke="${c.muted}"/>
      <path d="M-230 168 L-185 92 L-140 168 Z" fill="${c.danger}"/>
      <path d="M-185 121 V145" fill="none" stroke="${c.panel}" stroke-width="12"/>
      <circle cx="-185" cy="157" r="7" fill="${c.panel}" stroke="none"/>
    </g>`;
}

function drawLock(c) {
  return `
    <g stroke="${c.ink}" stroke-width="12" stroke-linejoin="round">
      <rect x="-170" y="-10" width="340" height="250" rx="28" fill="${c.primary}"/>
      <path d="M-105 -10 V-95 Q-105 -205 0 -205 Q105 -205 105 -95 V-10" fill="none"/>
      <circle cx="0" cy="95" r="28" fill="${c.panel}" stroke="none"/>
      <path d="M0 123 V174" fill="none" stroke="${c.panel}"/>
      <path d="M-224 248 H224" fill="none" stroke="${c.secondary}" stroke-width="20"/>
    </g>`;
}

function drawDocument(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <path d="M-176 -220 H72 L176 -116 V220 H-176 Z" fill="${c.ink}"/>
      <path d="M72 -220 V-116 H176" fill="${c.secondary}"/>
      <path d="M-112 -72 H108 M-112 0 H108 M-112 72 H56" fill="none" stroke="${c.panel}" stroke-linecap="round"/>
      <rect x="-112" y="120" width="58" height="48" rx="8" fill="${c.primary}"/>
      <path d="M-98 144 L-82 158 L-58 130" fill="none" stroke="${c.panel}"/>
    </g>`;
}

function drawCoins(c) {
  return `
    <g stroke="${c.ink}" stroke-width="10" stroke-linejoin="round">
      <path d="M-154 -124 V124 Q-154 176 0 176 Q154 176 154 124 V-124" fill="${c.primary}"/>
      <ellipse cx="0" cy="-124" rx="154" ry="52" fill="${c.secondary}"/>
      <ellipse cx="0" cy="-18" rx="154" ry="52" fill="${c.good}"/>
      <path d="M-154 -18 Q0 34 154 -18" fill="none"/>
      <text x="0" y="-104" text-anchor="middle" fill="${c.panel}" stroke="none" font-family="Arial, sans-serif" font-size="48" font-weight="900">$</text>
    </g>`;
}

function drawBucket(c) {
  return `
    <g stroke="${c.ink}" stroke-width="11" stroke-linejoin="round">
      <path d="M-170 -85 H170 L126 200 H-126 Z" fill="${c.secondary}"/>
      <path d="M-150 -85 Q-150 -230 0 -230 Q150 -230 150 -85" fill="none"/>
      <path d="M-118 -12 H118 M-98 68 H98" fill="none" stroke="${c.panel}" stroke-linecap="round"/>
      <circle cx="0" cy="135" r="35" fill="${c.primary}"/>
      <text x="0" y="151" text-anchor="middle" fill="${c.panel}" stroke="none" font-family="Arial, sans-serif" font-size="34" font-weight="900">$</text>
    </g>`;
}

function drawLadder(c) {
  return `
    <g stroke="${c.ink}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-150 -205 L-80 205 M150 -205 L80 205" fill="none" stroke="${c.secondary}" stroke-width="28"/>
      <path d="M-132 -130 H132 M-116 -42 H116 M-100 46 H100 M-84 134 H84" fill="none" stroke="${c.primary}" stroke-width="20"/>
      <path d="M-222 205 H222" fill="none" stroke="${c.good}"/>
    </g>`;
}

const KIND_RENDERERS = Object.freeze({
  cash: drawCash,
  jar: drawJar,
  calendar: drawCalendar,
  shield: drawShield,
  'credit-card': drawCreditCard,
  scale: drawScale,
  chart: drawChart,
  house: drawHouse,
  receipt: drawReceipt,
  warning: drawWarning,
  target: drawTarget,
  clock: drawClock,
  people: drawPeople,
  tax: drawTax,
  scam: drawScam,
  lock: drawLock,
  document: drawDocument,
  coins: drawCoins,
  bucket: drawBucket,
  ladder: drawLadder
});

function backgroundDecorations(seed, c) {
  const value = hashString(seed);
  const circles = [
    { cx: 82 + (value % 48), cy: 290 + ((value >>> 4) % 100), r: 18, fill: c.primary },
    { cx: 630 - ((value >>> 8) % 55), cy: 420 + ((value >>> 12) % 100), r: 11, fill: c.secondary },
    { cx: 104 + ((value >>> 16) % 42), cy: 910 - ((value >>> 20) % 50), r: 9, fill: c.good },
    { cx: 612 - ((value >>> 24) % 50), cy: 870 - (value % 54), r: 15, fill: c.danger }
  ];
  return circles.map(circle => (
    `<circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" fill="${circle.fill}" opacity="0.8"/>`
  )).join('');
}

function buildIllustrationSvg(options = {}, overrides = {}) {
  const config = typeof options === 'string' ? { ...overrides, kind: options } : (options || {});
  const kind = normalizeKind(config.kind);
  const seed = String(config.seed || `${kind}:${config.title || ''}:${config.detail || ''}`);
  const palette = config.palette || getPalette(seed);
  const c = colorsFor(palette);
  const titleLines = wrapText(config.title || kind, 25).slice(0, 2);
  const detailLines = wrapText(config.detail || 'Topic-specific local illustration', 43).slice(0, 2);
  const titleSvg = titleLines.map((line, index) => (
    `<tspan x="70" dy="${index === 0 ? 0 : 43}">${escapeXml(line)}</tspan>`
  )).join('');
  const detailSvg = detailLines.map((line, index) => (
    `<tspan x="78" dy="${index === 0 ? 0 : 38}">${escapeXml(line)}</tspan>`
  )).join('');
  const renderer = KIND_RENDERERS[kind];

  return `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${ILLUSTRATION_WIDTH}" height="${ILLUSTRATION_HEIGHT}" viewBox="0 0 ${ILLUSTRATION_WIDTH} ${ILLUSTRATION_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${c.background}"/>
          <stop offset="1" stop-color="${c.panel}"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000000" flood-opacity="0.28"/>
        </filter>
      </defs>
      <rect width="${ILLUSTRATION_WIDTH}" height="${ILLUSTRATION_HEIGHT}" fill="url(#background)"/>
      ${backgroundDecorations(seed, c)}
      <rect x="54" y="48" width="612" height="116" rx="28" fill="${c.panel}" opacity="0.92"/>
      <text x="70" y="88" fill="${c.primary}" font-family="Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="2">LOCAL 2D CARTOON</text>
      <text x="70" y="126" fill="${c.ink}" font-family="Arial, sans-serif" font-size="29" font-weight="800">${titleSvg}</text>
      <rect x="54" y="210" width="612" height="730" rx="44" fill="${c.panel}" opacity="0.96" filter="url(#shadow)"/>
      <g transform="translate(360 580)">${renderer(c)}</g>
      <rect x="54" y="1000" width="612" height="174" rx="30" fill="${c.panel}" opacity="0.94"/>
      <text x="78" y="1044" fill="${c.secondary}" font-family="Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="2">${escapeXml(kind.toUpperCase())} PANEL</text>
      <text x="78" y="1093" fill="${c.ink}" font-family="Arial, sans-serif" font-size="27" font-weight="700">${detailSvg}</text>
      <text x="78" y="1220" fill="${c.muted}" font-family="Arial, sans-serif" font-size="20" font-weight="600">Educational illustration | No guaranteed returns</text>
    </svg>`;
}

async function createCartoonIllustration(optionsOrKind, outputPath, metadata = {}) {
  const config = typeof optionsOrKind === 'string'
    ? { ...metadata, kind: optionsOrKind, outputPath }
    : (optionsOrKind || {});
  if (!config.outputPath) throw new Error('outputPath is required for a cartoon illustration');

  await fs.mkdir(path.dirname(config.outputPath), { recursive: true });
  await sharp(Buffer.from(buildIllustrationSvg(config)))
    .png()
    .toFile(config.outputPath);
  return config.outputPath;
}

async function createCartoonIllustrations(scenes, outputDir, options = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('At least one scene is required for cartoon illustrations');
  }
  if (!outputDir) throw new Error('outputDir is required for cartoon illustrations');

  const topicKey = options.topicKey || 'topic';
  const illustrations = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index] || {};
    const outputPath = path.join(outputDir, `panel_${String(index + 1).padStart(2, '0')}.png`);
    const title = scene.title || scene.label || scene.heading || `Scene ${index + 1}`;
    const detail = scene.detail || scene.subtitle || scene.caption || '';
    const kind = normalizeKind(scene.kind);
    await createCartoonIllustration({
      kind,
      title,
      detail,
      outputPath,
      palette: scene.palette,
      seed: `${topicKey}:${index}:${kind}:${title}:${detail}`
    });
    illustrations.push(outputPath);
  }
  return illustrations;
}

module.exports = {
  ILLUSTRATION_HEIGHT,
  ILLUSTRATION_WIDTH,
  PALETTES,
  SUPPORTED_KINDS,
  buildIllustrationSvg,
  createCartoonIllustration,
  createCartoonIllustrations,
  escapeXml,
  getPalette,
  hashString,
  isSupportedKind,
  normalizeKind,
  wrapText
};
