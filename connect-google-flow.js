require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const profileDir = path.resolve(
  process.env.FLOW_PROFILE_DIR || path.join(__dirname, 'config', 'flow-profile'),
);
const sessionFile = path.join(__dirname, 'config', 'flow-session.json');
const flowUrl = process.env.FLOW_URL || 'https://labs.google/fx/tools/flow';
const cdpPort = Number(process.env.FLOW_CDP_PORT || 9222);

async function resolveEdgePath() {
  if (process.env.FLOW_EDGE_PATH) {
    return process.env.FLOW_EDGE_PATH;
  }

  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next standard installation path.
    }
  }

  const result = await execFileAsync('where.exe', ['msedge.exe']);
  const discovered = result.stdout.split(/\r?\n/).map(value => value.trim()).find(Boolean);
  if (!discovered) {
    throw new Error('Microsoft Edge was not found. Set FLOW_EDGE_PATH in .env.');
  }
  return discovered;
}

async function main() {
  await fs.mkdir(profileDir, { recursive: true });
  const edgePath = await resolveEdgePath();
  const edge = spawn(edgePath, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    flowUrl,
  ], { detached: true, stdio: 'ignore' });
  edge.unref();

  console.log('Google Flow is open in a normal Microsoft Edge window.');
  console.log('Sign in yourself and confirm that the Flow workspace is available.');
  const waitMs = Number(process.env.FLOW_CONNECT_WAIT_MS || 20000);
  await new Promise(resolve => setTimeout(resolve, waitMs));

  await fs.writeFile(
    sessionFile,
    JSON.stringify({
      connectedAt: new Date().toISOString(),
      url: flowUrl,
      browser: 'Microsoft Edge',
      edgePath,
      profileDir,
      remoteDebuggingPort: cdpPort,
      cdpUrl: `http://127.0.0.1:${cdpPort}`,
      manualLoginRequired: true,
      savedAfterMs: waitMs,
    }, null, 2),
    'utf8',
  );

  console.log(`Flow session saved locally at ${sessionFile}`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
