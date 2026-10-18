// Verifies the AgentTube -> simulation projection without running a real generation
// (which costs provider credits and minutes). Run: node test/map-jobs.test.mjs
import assert from 'node:assert/strict';

import {
  DONE_WINDOW_MS,
  mapJobsToTasks,
  parseTimestamp
} from '../src/bridge/mapJobsToTasks.js';

const NOW = Date.parse('2026-10-16T18:10:00Z');
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  }
}

const checkpoint = (stage, status, extra = {}) => ({
  job_id: 'job_1',
  stage,
  status,
  attempt_count: 1,
  started_at: iso(-60_000),
  completed_at: status === 'completed' ? iso(-30_000) : null,
  updated_at: iso(-30_000),
  ...extra
});

const runningJob = (checkpoints) => ({
  id: 'job_1',
  topic: 'Top 10 Life Hacks',
  title: 'Top 10 Life Hacks',
  status: 'running',
  stage: 'script',
  progress: 30,
  created_at: iso(-120_000),
  completed_at: null,
  checkpoints
});

const findTask = (result, id) => result.tasks.find((task) => task.id === id);

console.log('\nmapJobsToTasks\n');

test('an idle channel produces no tasks and an idle phase', () => {
  const result = mapJobsToTasks({ jobs: [], pipeline: [] }, NOW);
  assert.deepEqual(result.tasks, []);
  assert.equal(result.phase, 'idle');
});

test('a running stage becomes in_progress for that stage\'s agent', () => {
  const result = mapJobsToTasks(
    { jobs: [runningJob([checkpoint('strategy', 'completed'), checkpoint('script', 'running')])] },
    NOW
  );
  assert.equal(result.phase, 'working');

  const script = findTask(result, 'job_1:script');
  assert.equal(script.status, 'in_progress');
  assert.equal(script.assignedAgentId, 3, 'script belongs to the Scriptwriter');

  const strategy = findTask(result, 'job_1:strategy');
  assert.equal(strategy.status, 'done');
  assert.equal(strategy.assignedAgentId, 2, 'strategy belongs to the Strategist');
});

test('every stage maps to the character that owns it', () => {
  const result = mapJobsToTasks(
    {
      jobs: [
        runningJob([
          checkpoint('strategy', 'completed'),
          checkpoint('script', 'completed'),
          checkpoint('thumbnail', 'completed'),
          checkpoint('seo', 'completed'),
          checkpoint('production', 'completed'),
          checkpoint('quality_review', 'running')
        ])
      ]
    },
    NOW
  );
  assert.deepEqual(
    result.tasks.map((task) => task.assignedAgentId),
    [2, 3, 4, 5, 6, 1],
    'stage order is preserved: strategy..production, then quality_review on the lead'
  );
});

test('stages that have not started emit no task, so the character keeps wandering', () => {
  const result = mapJobsToTasks(
    {
      jobs: [
        runningJob([
          checkpoint('strategy', 'running'),
          checkpoint('script', 'pending'),
          { job_id: 'job_1', stage: 'seo', status: null }
        ])
      ]
    },
    NOW
  );
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].id, 'job_1:strategy');
});

test('a failed stage puts its agent on_hold and surfaces the error', () => {
  const result = mapJobsToTasks(
    {
      jobs: [
        runningJob([
          checkpoint('production', 'failed', { error: 'ElevenLabs quota exceeded' })
        ])
      ]
    },
    NOW
  );
  const task = findTask(result, 'job_1:production');
  assert.equal(task.status, 'on_hold');
  assert.equal(task.assignedAgentId, 6);
  assert.match(task.description, /ElevenLabs quota exceeded/);
});

test('an invalidated checkpoint also reads as needing attention', () => {
  const result = mapJobsToTasks(
    { jobs: [runningJob([checkpoint('thumbnail', 'invalid')])] },
    NOW
  );
  assert.equal(findTask(result, 'job_1:thumbnail').status, 'on_hold');
});

test('content awaiting approval becomes the operator\'s own task', () => {
  const result = mapJobsToTasks(
    {
      jobs: [],
      pipeline: [
        {
          id: 'prod_9',
          title: 'Top 10 Life Hacks',
          review_status: 'needs_review',
          created_at: iso(-300_000)
        }
      ]
    },
    NOW
  );
  const task = findTask(result, 'review:prod_9');
  assert.equal(task.assignedAgentId, 0, 'index 0 is You');
  assert.equal(task.status, 'on_hold');
  assert.equal(task.requiresUserApproval, true);
});

test('an upload in flight occupies the Publisher, a scheduled one does not', () => {
  const result = mapJobsToTasks(
    {
      pipeline: [
        { id: 'prod_a', title: 'A', schedule_status: 'uploading', created_at: iso(-10_000) },
        { id: 'prod_b', title: 'B', schedule_status: 'scheduled', created_at: iso(-10_000) }
      ]
    },
    NOW
  );
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].assignedAgentId, 7);
  assert.equal(result.tasks[0].status, 'in_progress');
});

test('an upload needing reconciliation blocks the Publisher', () => {
  const result = mapJobsToTasks(
    {
      pipeline: [
        {
          id: 'prod_c',
          title: 'C',
          schedule_status: 'reconciliation_required',
          created_at: iso(-10_000)
        }
      ]
    },
    NOW
  );
  assert.equal(findTask(result, 'reconcile:prod_c').status, 'on_hold');
});

test('a job that just finished celebrates, an old one does not', () => {
  const justNow = {
    jobs: [{ id: 'job_1', status: 'completed', completed_at: iso(-5_000), checkpoints: [] }]
  };
  assert.equal(mapJobsToTasks(justNow, NOW).phase, 'done');

  const longAgo = {
    jobs: [
      {
        id: 'job_1',
        status: 'completed',
        completed_at: iso(-DONE_WINDOW_MS - 1_000),
        checkpoints: []
      }
    ]
  };
  assert.equal(mapJobsToTasks(longAgo, NOW).phase, 'idle');
});

test('a running job outranks a recent completion', () => {
  const result = mapJobsToTasks(
    {
      jobs: [
        runningJob([checkpoint('strategy', 'running')]),
        { id: 'job_0', status: 'completed', completed_at: iso(-5_000), checkpoints: [] }
      ]
    },
    NOW
  );
  assert.equal(result.phase, 'working');
});

test('only the running job animates the office; finished jobs stay in the log', () => {
  const result = mapJobsToTasks(
    {
      jobs: [
        runningJob([checkpoint('strategy', 'running')]),
        {
          id: 'job_old',
          title: 'Older video',
          status: 'completed',
          completed_at: iso(-999_000),
          checkpoints: [
            {
              job_id: 'job_old',
              stage: 'seo',
              status: 'completed',
              completed_at: iso(-999_000)
            }
          ]
        }
      ]
    },
    NOW
  );
  assert.deepEqual(
    result.tasks.map((task) => task.id),
    ['job_1:strategy'],
    'no tasks from the older job'
  );
  assert.ok(
    result.actionLog.some((entry) => entry.taskId === 'job_old:seo'),
    'the older job still appears in the action log'
  );
});

test('task ids are stable across polls so the scene only reacts to real changes', () => {
  const snapshot = { jobs: [runningJob([checkpoint('script', 'running')])] };
  const first = mapJobsToTasks(snapshot, NOW);
  const second = mapJobsToTasks(snapshot, NOW + 8_000);
  assert.deepEqual(first.tasks, second.tasks);
});

test('the action log is ordered oldest first', () => {
  const result = mapJobsToTasks(
    {
      jobs: [
        runningJob([
          checkpoint('strategy', 'completed', { completed_at: iso(-90_000) }),
          checkpoint('script', 'completed', { completed_at: iso(-40_000) }),
          checkpoint('thumbnail', 'running', { started_at: iso(-5_000), updated_at: iso(-5_000) })
        ])
      ]
    },
    NOW
  );
  const timestamps = result.actionLog.map((entry) => entry.timestamp);
  assert.deepEqual(timestamps, [...timestamps].sort((a, b) => a - b));
  assert.equal(result.actionLog.length, 3);
});

console.log('\nparseTimestamp\n');

test('reads ISO strings written by the services', () => {
  assert.equal(parseTimestamp('2026-10-16T18:10:00.000Z'), NOW);
});

test('reads SQLite CURRENT_TIMESTAMP defaults as UTC', () => {
  assert.equal(parseTimestamp('2026-10-16 18:10:00'), NOW);
});

test('survives missing and malformed values', () => {
  assert.equal(parseTimestamp(null), 0);
  assert.equal(parseTimestamp(undefined), 0);
  assert.equal(parseTimestamp(''), 0);
  assert.equal(parseTimestamp('not a date'), 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
