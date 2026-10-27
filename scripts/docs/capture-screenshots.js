#!/usr/bin/env node
/**
 * Capture the README dashboard screenshots.
 *
 *   npm run docs:screenshots            # sample data (what the README uses)
 *   node scripts/docs/capture-screenshots.js --live
 *
 * Starts the dashboard server from this checkout on a free port, opens it in
 * Playwright Chromium at 1440x900 (dark color scheme), and writes PNGs to
 * assets/screenshots/:
 *
 *   overview.png   the Overview view
 *   review.png     the content review dialog for the first pipeline item
 *   operator.png   the Autonomous operator view
 *
 * No credentials are needed; the console runs in setup mode without them.
 *
 * Sample mode (the default) injects a small set of example productions, jobs,
 * schedule entries, and activity into the dashboard's in-browser state so the
 * screenshots show a working channel. Nothing is written to the database and
 * the README captions say the images use sample data. The project never
 * presents simulated output as real, so keep that label whenever these images
 * are reused.
 *
 * Live mode (--live) captures whatever your local database holds. Use it with
 * at least one real production, or review.png is skipped.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'assets', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const MAX_BYTES = 400 * 1024;
const LIVE = process.argv.includes('--live');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {
      // not up yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Dashboard did not answer /health within ${timeoutMs / 1000}s`);
}

function startServer(port) {
  const child = spawn(process.execPath, [path.join(ROOT, 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: process.env.LOG_LEVEL || 'warn' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('exit', code => {
    if (code && code !== 0 && !child.killed) {
      console.error(output);
      console.error(`Dashboard server exited with code ${code}`);
    }
  });
  return child;
}

/**
 * Runs inside the page. Replaces the dashboard's in-memory state with sample
 * records and re-renders. Polling is stopped so the next refresh does not
 * overwrite it. The database is not touched.
 */
function applySampleData() {
  /* global ui, renderDashboard, api */
  // `ui` is a top-level const in dashboard/app.js, visible to evaluated code
  // through the page's global lexical scope rather than on `window`.
  const state = ui.state;
  const now = Date.now();
  const hoursAgo = h => new Date(now - h * 3600e3).toISOString();
  const hoursAhead = h => new Date(now + h * 3600e3).toISOString();
  const checks = passed => Array.from({ length: 10 }, (_, i) => ({
    passed: i < passed,
    message: [
      'Hook lands in the first 12 seconds', 'Script length matches the target', 'No blocked terms used',
      'Every statistic has a source', 'Narration matches the script', 'Captions pass the timing check',
      'Thumbnail text is legible at 320px', 'Title under 70 characters', 'Description includes the CTA',
      'Media rights recorded for every scene'
    ][i] + (i < passed ? '' : ': 2 scenes still unconfirmed')
  }));

  ui.refreshing = true; // the 8-second poll and the enhance.js tickers skip renders while this is set

  state.system = {
    ...state.system,
    setupRequired: false,
    automationPaused: false,
    initialized: true,
    agents: ['strategy', 'scriptWriter', 'thumbnailDesigner', 'seoOptimizer', 'production', 'publishing', 'analytics']
  };
  state.profile = { ...state.profile, channel_name: state.profile?.channel_name || 'Futurecraft' };
  state.stats = { ...state.stats, published: 12 };
  state.analytics = { ...state.analytics, totalVideos: 9, averagePerformanceScore: 71 };

  state.pipeline = [
    { id: 'p1', title: 'Why most AI automations fail in week two', topic: 'AI workflows', created_at: hoursAgo(5), review_status: 'needs_review', qualityChecks: checks(9), hasThumbnail: false },
    { id: 'p2', title: 'The 3 tools that replaced my editor', topic: 'Tool reviews', created_at: hoursAgo(30), review_status: 'needs_attention', qualityChecks: checks(7) },
    { id: 'p3', title: 'A repeatable research system for creators', topic: 'Automation playbooks', created_at: hoursAgo(80), schedule_status: 'scheduled', qualityChecks: checks(10) },
    { id: 'p4', title: 'Stop scripting by hand: a 40-minute workflow', topic: 'AI workflows', created_at: hoursAgo(200), schedule_status: 'published', qualityChecks: checks(10) }
  ];
  state.jobs = [
    {
      id: 'j1', title: 'How small teams audit their AI stack', status: 'running', stage: 'production', updated_at: hoursAgo(0.2), progress: 62,
      checkpoints: ['strategy', 'script', 'thumbnail', 'seo'].map(stage => ({ stage, status: 'completed' })),
      mediaTasks: [{ status: 'succeeded', provider: 'seedance' }, { status: 'succeeded', provider: 'seedance' }, { status: 'running', provider: 'seedance' }]
    },
    { id: 'j2', title: 'Pricing AI tools honestly', status: 'failed', stage: 'script', updated_at: hoursAgo(3), progress: 20, checkpoints: [{ stage: 'strategy', status: 'completed' }] }
  ];
  state.schedule = [
    { title: 'A repeatable research system for creators', publish_time: hoursAhead(48), status: 'scheduled', production_id: 'p3' },
    { title: 'Stop scripting by hand: a 40-minute workflow', publish_time: hoursAgo(200), status: 'published', production_id: 'p4' }
  ];
  state.notifications = [
    { level: 'success', title: 'Video published', message: '"Stop scripting by hand" went live as scheduled.', created_at: hoursAgo(200) },
    { level: 'warning', title: 'Quality review flagged claims', message: '2 statistics in "The 3 tools" have no source.', created_at: hoursAgo(30) },
    { level: 'error', title: 'Generation failed', message: 'Script stage: provider timeout after 3 retries.', created_at: hoursAgo(3) },
    { level: 'info', title: 'Operator run started', message: 'Planning 1 video for next week.', created_at: hoursAgo(1) }
  ];
  state.ideas = [
    { id: 'i1', topic: 'What an AI agent actually costs per video', angle: 'Real invoices, not estimates', status: 'backlog' },
    { id: 'i2', topic: 'Narration voices compared', angle: 'Blind test with 50 viewers', status: 'backlog' }
  ];
  state.channelStrategy = {
    ...(state.channelStrategy || {}),
    status: 'active',
    objective: 'Become the clearest practical guide to AI-assisted creator operations.',
    audience: 'Independent creators and small media teams who value quality, speed, and control.',
    value_proposition: 'Every video turns a noisy AI trend into a dependable workflow viewers can use this week.',
    contentPillars: ['Creator operating systems', 'Evidence-first AI workflows', 'Packaging and retention', 'Responsible automation'],
    cadence_per_week: 2, videos_per_run: 1, default_format: 'tutorial', default_length: 'medium',
    primary_kpi: 'subscribers', target_value: 500, target_window_days: 90, outcome_currency: 'USD',
    success_metric: 'Grow returning subscribers who come back for practical automation tutorials',
    constraints: 'No hype, no unverified statistics, explain costs and tradeoffs.'
  };
  state.operatorRuns = [{
    id: 'r1', status: 'running', stage: 'producing', progress: 60,
    research: { sources: ['YouTube trends', '3 competitor channels', 'channel history'] },
    summary: { planned: 2, generated: 1, needsReview: 1 },
    plan: [
      { topic: 'How small teams audit their AI stack', format: 'tutorial', length: 'medium', rationale: 'Highest search demand this month in the "Creator operating systems" pillar; no competitor covers the audit step.' },
      { topic: 'Why most AI automations fail in week two', format: 'explainer', length: 'medium', rationale: 'Retention data from the last three videos shows the "failure modes" segment held 84% of viewers.' }
    ],
    generatedJobs: [
      { topic: 'How small teams audit their AI stack', status: 'running' },
      { topic: 'Why most AI automations fail in week two', status: 'completed', reviewStatus: 'needs_review' }
    ]
  }];

  const sampleContent = {
    id: 'p1', review_status: 'needs_review', qualityChecks: state.pipeline[0].qualityChecks, assetUrls: {},
    seo: {
      title: 'Why most AI automations fail in week two',
      description: 'Most creators automate the wrong step first. This video walks through the three failure patterns we saw across 40 channels and the one fix that stuck.\n\nChapters:\n00:00 The week-two cliff\n01:40 Pattern 1: automating the output, not the input\n05:10 Pattern 2: no review gate\n08:30 Pattern 3: measuring the wrong thing\n11:00 The fix',
      tags: ['ai automation', 'creator workflow', 'youtube automation', 'small business ai']
    },
    editorData: { privacyStatus: 'private', factChecked: false, rightsConfirmed: true },
    scenes: [], provenance: {}, shorts: {}
  };
  const originalApi = api;
  window.api = async (url, ...rest) => {
    if (typeof url === 'string' && url.startsWith('/api/content/')) return sampleContent;
    return originalApi(url, ...rest);
  };

  renderDashboard();
  window.scrollTo(0, 0);
  return state.pipeline.length;
}

async function settle(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('preboot'));
  await page.waitForFunction(() => document.querySelector('#stat-review')?.textContent.trim() !== '—', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function save(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, type: 'png' });
  const sharp = require('sharp');
  const meta = await sharp(file).metadata();
  if (meta.width > VIEWPORT.width || fs.statSync(file).size > MAX_BYTES) {
    const buffer = await sharp(file)
      .resize({ width: Math.min(meta.width, VIEWPORT.width), withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();
    fs.writeFileSync(file, buffer);
  }
  const size = fs.statSync(file).size;
  console.log(`${name}: ${(size / 1024).toFixed(0)} KB${size > MAX_BYTES ? ' (over the 400 KB target; consider cropping)' : ''}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  const stop = () => { if (!server.killed) server.kill(); };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });

  let browser;
  try {
    const health = await waitForHealth(baseUrl);
    console.log(`Dashboard v${health.version || '?'} up at ${baseUrl} (${health.status}, ${LIVE ? 'live data' : 'sample data'})`);

    const { chromium } = require('playwright');
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'dark', deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await settle(page);

    let pipelineCount = await page.evaluate(() => (ui?.state?.pipeline || []).length);
    if (!LIVE) {
      pipelineCount = await page.evaluate(applySampleData);
      await page.waitForTimeout(900); // count-up animation
    }

    await save(page, 'overview.png');

    await page.evaluate(() => window.switchView('operator'));
    await page.waitForTimeout(500);
    await save(page, 'operator.png');

    if (pipelineCount > 0) {
      await page.evaluate(() => window.switchView('pipeline'));
      await page.waitForTimeout(400);
      await page.click('.pipeline-item');
      await page.waitForSelector('#content-dialog[open]');
      await page.waitForTimeout(600);
      await save(page, 'review.png');
    } else {
      console.warn('No productions in the database: review.png was not captured. Generate a real video first, then run this again.');
    }
  } finally {
    if (browser) await browser.close();
    stop();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
