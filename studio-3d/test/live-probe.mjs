// Throwaway end-to-end probe: inserts one generation job with checkpoints into the
// real database, reads it back through the running server's /api/dashboard, runs the
// bridge projection over it, then deletes exactly what it inserted.
//
//   node test/live-probe.mjs            (server must be on :3456)
//
// Not part of `npm test` — it needs a running server and touches the database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapJobsToTasks } from '../src/bridge/mapJobsToTasks.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'index.js'));
const sqlite3 = require('sqlite3');

const JOB_ID = `job_studio_probe_${Date.now()}`;
const db = new sqlite3.Database(join(root, 'data', 'youtube_automation.db'));

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function callback(error) {
      error ? reject(error) : resolve(this);
    })
  );

const now = new Date().toISOString();

try {
  await run(
    `INSERT INTO generation_jobs (id, topic, title, status, stage, progress, details, created_at)
     VALUES (?, ?, ?, 'running', 'script', 30, '{}', ?)`,
    [JOB_ID, 'Studio probe topic', 'Studio probe topic', now]
  );
  await run(
    `INSERT INTO generation_checkpoints (job_id, stage, status, attempt_count, started_at, completed_at)
     VALUES (?, 'strategy', 'completed', 1, ?, ?)`,
    [JOB_ID, now, now]
  );
  await run(
    `INSERT INTO generation_checkpoints (job_id, stage, status, attempt_count, started_at, error)
     VALUES (?, 'script', 'running', 1, ?, NULL)`,
    [JOB_ID, now]
  );

  const response = await fetch('http://127.0.0.1:3456/api/dashboard');
  assert.ok(response.ok, `/api/dashboard responded ${response.status}`);
  const dashboard = await response.json();

  const job = dashboard.jobs.find((candidate) => candidate.id === JOB_ID);
  assert.ok(job, 'the inserted job came back from /api/dashboard');
  assert.ok(Array.isArray(job.checkpoints), 'the API attaches checkpoints to the job');

  const projection = mapJobsToTasks(dashboard);
  assert.equal(projection.phase, 'working', 'a running job puts the office to work');

  const strategy = projection.tasks.find((task) => task.id === `${JOB_ID}:strategy`);
  const script = projection.tasks.find((task) => task.id === `${JOB_ID}:script`);

  assert.equal(strategy?.status, 'done');
  assert.equal(strategy?.assignedAgentId, 2, 'Strategist');
  assert.equal(script?.status, 'in_progress');
  assert.equal(script?.assignedAgentId, 3, 'Scriptwriter');
  assert.ok(
    projection.tasks.every((task) => !task.id.endsWith(':seo')),
    'stages that have not started emit no task'
  );
  assert.ok(
    projection.actionLog.some((entry) => entry.taskId === `${JOB_ID}:strategy`),
    'the completed stage reached the action log'
  );

  console.log('\nlive probe: real schema -> /api/dashboard -> projection: OK');
  console.log(`  phase=${projection.phase} tasks=${projection.tasks.map((t) => t.id).join(', ')}\n`);
} finally {
  await run('DELETE FROM generation_checkpoints WHERE job_id = ?', [JOB_ID]);
  await run('DELETE FROM generation_jobs WHERE id = ?', [JOB_ID]);
  db.close();
  console.log('probe rows removed.');
}
