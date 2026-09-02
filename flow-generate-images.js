require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { chromium } = require('playwright');

const ROOT = __dirname;
const CDP_URL = process.env.FLOW_CDP_URL || 'http://127.0.0.1:9222';
const OUTPUT_DIR = path.resolve(
  ROOT,
  process.env.FLOW_IMAGE_DIR || path.join('data', 'finance-sample', 'flow-images'),
);
const PROMPTS_FILE = path.join(ROOT, 'data', 'finance-sample', 'image-prompts.json');
const WAIT_MS = Number(process.env.FLOW_GENERATION_WAIT_MS || 360000);
const SCENE_IDS = String(process.env.FLOW_SCENES || '01,02,03,04,05,06,07,08')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const STYLE = 'Original editorial finance education artwork, cinematic 3D illustration, deep navy and warm amber palette, clean modern composition, realistic lighting, consistent visual language, no readable text, no letters, no company logos, no watermark, no stock ticker, no distorted hands.';

async function getPromptPage(browser) {
  const pages = browser.contexts().flatMap(context => context.pages());
  for (const page of pages) {
    if (page.url().includes('/fx/tools/flow/project/')
      && await page.locator('[role="textbox"][contenteditable="true"]').count()) {
      return page;
    }
  }

  throw new Error('No Flow project prompt page is open. Run npm run flow:connect and open a project.');
}

async function getMediaUrls(page) {
  return page.locator('img').evaluateAll(images => images
    .map(image => image.currentSrc || image.src)
    .filter(src => src.includes('/api/trpc/media.getMediaUrlRedirect')));
}

async function startNewSession(page) {
  const button = page.locator('button').filter({ hasText: 'New session' }).first();
  if (!(await button.count())) throw new Error('Flow New session control was not found');
  await button.click();
  await page.waitForTimeout(1200);
}

async function submitStillPrompt(page, prompt) {
  const editor = page.locator('[role="textbox"][contenteditable="true"]').first();
  await editor.fill(prompt);

  const createButton = page.locator('button[aria-disabled="false"]')
    .filter({ hasText: 'Create' })
    .last();
  if (!(await createButton.count())) throw new Error('No enabled Flow image Create action was found');
  await createButton.click();
}

async function waitForNewImage(page, before, sceneId) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const current = await getMediaUrls(page);
    const fresh = current.find(url => !before.has(url));
    if (fresh) return fresh;

    if (await page.locator('button').filter({ hasText: 'Try again' }).count()) {
      throw new Error(`Flow reported an error while generating scene ${sceneId}`);
    }

    console.log(`Scene ${sceneId} still processing; media URLs: ${current.length}`);
    await page.waitForTimeout(10000);
  }

  throw new Error(`Flow did not return scene ${sceneId} within ${WAIT_MS}ms`);
}

async function saveImage(page, url, sceneId) {
  const response = await page.context().request.get(url, { timeout: 60000 });
  if (!response.ok()) throw new Error(`Flow image download failed with HTTP ${response.status()}`);

  const outputPath = path.join(OUTPUT_DIR, `scene_${sceneId}.png`);
  await sharp(await response.body()).png().toFile(outputPath);
  console.log(`Exported ${outputPath}`);
}

async function main() {
  const scenes = JSON.parse(await fs.readFile(PROMPTS_FILE, 'utf8'))
    .filter(scene => SCENE_IDS.includes(scene.id));
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    throw new Error(`Flow CDP is unavailable at ${CDP_URL}. Run npm run flow:connect first.`);
  }

  let page = await getPromptPage(browser);
  console.log('Flow still-image mode only: paid animation approvals will not be requested.');

  for (const scene of scenes) {
    const outputPath = path.join(OUTPUT_DIR, `scene_${scene.id}.png`);
    try {
      await fs.access(outputPath);
      console.log(`Scene ${scene.id} already exported; skipping`);
      continue;
    } catch {
      // Generate the missing scene below.
    }

    await startNewSession(page);
    page = await getPromptPage(browser);
    const before = new Set(await getMediaUrls(page));
    const prompt = `Generate exactly one landscape still image for a personal finance education video: ${scene.prompt}. ${STYLE}`;
    console.log(`Generating Flow scene ${scene.id}`);
    await submitStillPrompt(page, prompt);
    const imageUrl = await waitForNewImage(page, before, scene.id);
    await saveImage(page, imageUrl, scene.id);
  }
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
