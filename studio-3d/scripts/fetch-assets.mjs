// Fetches the 3D assets this view needs. They are deliberately NOT committed:
// the models are CC BY-NC 4.0 (non-commercial), while AgentTube itself is MIT.
//
//   node scripts/fetch-assets.mjs          ask first
//   node scripts/fetch-assets.mjs --yes    no prompt (CI, scripts)
import { createInterface } from 'node:readline/promises';
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = join(root, 'public', 'models');
const vendorDir = join(root, 'public', 'vendor', 'draco');

// Pinned to the commit this view was adapted from — see NOTICE.md.
const UPSTREAM_COMMIT = '16c97c43d1c32fae797ace4ed8058157e1126c96';
const UPSTREAM_RAW = `https://raw.githubusercontent.com/arturitu/the-delegation/${UPSTREAM_COMMIT}/public`;
const MODELS = ['character.glb', 'office.glb'];

const NOTICE = `3D assets for the AgentTube studio view
--------------------------------------
character.glb, office.glb
  (c) 2026 Arturo Paracuellos — https://unboring.net
  Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)
  http://creativecommons.org/licenses/by-nc/4.0/

  Attribution is required. COMMERCIAL USE IS PROHIBITED: these models may not be
  used in projects that generate revenue. For commercial licensing, contact
  https://unboring.net — or replace them with your own models (see
  ../../docs/3d-assets.md).

Fetched from the-delegation @ ${UPSTREAM_COMMIT}
`;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function confirm() {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true;
  if (!process.stdin.isTTY) {
    console.error('Not a terminal. Re-run with --yes to accept the asset license.');
    return false;
  }

  console.log(`\n${NOTICE}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Download these assets under those terms? [y/N] ');
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function download(name) {
  const target = join(modelsDir, name);
  if (await exists(target)) {
    console.log(`  = ${name} (already present)`);
    return;
  }

  const response = await fetch(`${UPSTREAM_RAW}/models/${name}`);
  if (!response.ok) {
    throw new Error(`${name}: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);
  console.log(`  + ${name} (${(bytes.length / 1024).toFixed(0)} KB)`);
}

/** The Draco decoder ships inside the installed `three` package (Apache-2.0). */
async function copyDraco() {
  if (await exists(join(vendorDir, 'draco_decoder.wasm'))) {
    console.log('  = draco decoder (already present)');
    return;
  }

  const source = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco');
  if (!(await exists(source))) {
    throw new Error(
      'Draco decoder not found in node_modules/three. Run npm install in studio-3d first.'
    );
  }

  await cp(source, vendorDir, { recursive: true });
  console.log('  + draco decoder (from three)');
}

if (!(await confirm())) {
  console.log('Cancelled. The studio will show setup instructions instead of the office.');
  process.exit(1);
}

await mkdir(modelsDir, { recursive: true });
await mkdir(vendorDir, { recursive: true });

console.log('\nFetching assets:');
for (const name of MODELS) {
  await download(name);
}
await copyDraco();
await writeFile(join(modelsDir, 'LICENSE.txt'), NOTICE);

console.log('\nDone. Build the view with: npm run build\n');
