/**
 * Projects AgentTube's real production state onto the store the 3D simulation reads.
 *
 * The simulation is already a pure function of `coreStore.tasks` + `phase`
 * (see src/simulation/drivers/NpcAgentDriver.ts and src/simulation/SceneManager.ts),
 * so this is the only place that knows anything about AgentTube.
 *
 * Plain JavaScript with JSDoc types on purpose: it is the one piece of genuinely new
 * logic here, and this way `node test/map-jobs.test.mjs` can exercise it with no test
 * framework and no build step — matching how the root project tests itself in test.js.
 *
 * @typedef {'scheduled'|'on_hold'|'in_progress'|'done'} TaskStatus
 * @typedef {{ id: string, title: string, description: string, assignedAgentId: number,
 *             status: TaskStatus, requiresUserApproval: boolean, output?: string,
 *             revisions: [], createdAt: number, updatedAt: number }} Task
 * @typedef {{ id: string, timestamp: number, agentIndex: number, action: string,
 *             taskId?: string }} ActionLogEntry
 */

/** Mirrors GENERATION_STAGES in ../../../utils/generation-recovery-service.js. */
export const GENERATION_STAGES = [
  'strategy',
  'script',
  'thumbnail',
  'seo',
  'production',
  'quality_review'
];

/** Character index per stage. Mirrors STAGE_AGENT_INDEX in ../data/agents.ts. */
export const STAGE_AGENT_INDEX = {
  strategy: 2,
  script: 3,
  thumbnail: 4,
  seo: 5,
  production: 6,
  quality_review: 1
};

export const STAGE_LABEL = {
  strategy: 'Research & strategy',
  script: 'Write the script',
  thumbnail: 'Design the thumbnail',
  seo: 'Optimize metadata',
  production: 'Generate narration, visuals and MP4',
  quality_review: 'Run quality checks'
};

export const OPERATOR_INDEX = 0;
export const PUBLISHER_INDEX = 7;

/** A publish or job completion counts as a celebration for this long. */
export const DONE_WINDOW_MS = 120_000;

/**
 * SQLite hands back two timestamp shapes: ISO strings written by the services and
 * `CURRENT_TIMESTAMP` defaults like "2026-10-16 18:04:11" (UTC, unmarked).
 * @param {string | null | undefined} value
 * @returns {number} epoch ms, or 0 when unparseable
 */
export function parseTimestamp(value) {
  if (!value) return 0;
  const normalized = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * @param {string | null | undefined} status checkpoint status
 * @returns {TaskStatus | null} null means "do not show this stage yet"
 */
function taskStatusForCheckpoint(status) {
  if (status === 'running') return 'in_progress';
  if (status === 'completed') return 'done';
  if (status === 'failed' || status === 'invalid' || status === 'cancelled') return 'on_hold';
  // 'pending', missing, or unknown: the stage has not started. Emitting a task here
  // would mark the agent busy (NpcAgentDriver treats 'scheduled' as busy) while
  // nothing moves it, freezing the character in place.
  return null;
}

/**
 * @param {any} job a row from /api/dashboard `jobs`
 * @returns {Task[]}
 */
function tasksForJob(job) {
  const byStage = new Map((job.checkpoints || []).map((cp) => [cp.stage, cp]));
  /** @type {Task[]} */
  const tasks = [];

  for (const stage of GENERATION_STAGES) {
    const checkpoint = byStage.get(stage);
    const status = taskStatusForCheckpoint(checkpoint?.status);
    if (!status) continue;

    const startedAt = parseTimestamp(checkpoint.started_at) || parseTimestamp(job.created_at);
    const updatedAt =
      parseTimestamp(checkpoint.completed_at) ||
      parseTimestamp(checkpoint.updated_at) ||
      startedAt;
    const attempts = Number(checkpoint.attempt_count || 0);

    tasks.push({
      id: `${job.id}:${stage}`,
      title: STAGE_LABEL[stage] || stage,
      description: [
        job.title || job.topic || 'Untitled production',
        attempts > 1 ? `Attempt ${attempts}.` : '',
        status === 'on_hold' && checkpoint.error ? `Failed: ${checkpoint.error}` : ''
      ]
        .filter(Boolean)
        .join(' — '),
      assignedAgentId: STAGE_AGENT_INDEX[stage],
      status,
      requiresUserApproval: false,
      output: status === 'done' ? 'Checkpoint saved.' : undefined,
      revisions: [],
      createdAt: startedAt,
      updatedAt
    });
  }

  return tasks;
}

/**
 * Productions waiting on a human, and uploads in flight.
 * @param {any[]} pipeline rows from /api/dashboard `pipeline`
 * @returns {Task[]}
 */
function tasksForPipeline(pipeline) {
  /** @type {Task[]} */
  const tasks = [];

  for (const row of pipeline || []) {
    const createdAt = parseTimestamp(row.created_at);

    // Anything awaiting the operator's judgement becomes their task. Index 0 is the
    // player character, which SceneManager deliberately never drives, so this shows
    // up in the Kanban without hijacking the camera-controlled character.
    if (row.review_status === 'needs_review' || row.review_status === 'needs_attention') {
      tasks.push({
        id: `review:${row.id}`,
        title: `Review “${row.title || row.id}”`,
        description:
          row.review_status === 'needs_attention'
            ? 'Quality checks flagged this production. Open the dashboard to inspect it.'
            : 'Waiting for factual review, media-rights confirmation and approval.',
        assignedAgentId: OPERATOR_INDEX,
        status: 'on_hold',
        requiresUserApproval: true,
        revisions: [],
        createdAt,
        updatedAt: createdAt
      });
    }

    if (row.schedule_status === 'uploading') {
      tasks.push({
        id: `upload:${row.id}`,
        title: `Upload “${row.title || row.id}”`,
        description: 'Uploading to YouTube.',
        assignedAgentId: PUBLISHER_INDEX,
        status: 'in_progress',
        requiresUserApproval: false,
        revisions: [],
        createdAt,
        updatedAt: createdAt
      });
    }

    if (row.schedule_status === 'reconciliation_required') {
      tasks.push({
        id: `reconcile:${row.id}`,
        title: `Reconcile “${row.title || row.id}”`,
        description:
          'An upload may have reached YouTube without returning a video ID. Channel reconciliation is required before another attempt.',
        assignedAgentId: PUBLISHER_INDEX,
        status: 'on_hold',
        requiresUserApproval: true,
        revisions: [],
        createdAt,
        updatedAt: createdAt
      });
    }
  }

  return tasks;
}

/**
 * One log line per stage that actually ran, derived from the snapshot rather than from
 * diffing successive polls — so the log is identical whatever the poll cadence was.
 * @param {any[]} jobs
 * @returns {ActionLogEntry[]}
 */
function logForJobs(jobs) {
  /** @type {ActionLogEntry[]} */
  const entries = [];

  for (const job of jobs || []) {
    for (const checkpoint of job.checkpoints || []) {
      const status = checkpoint.status;
      if (!status || status === 'pending') continue;

      const agentIndex = STAGE_AGENT_INDEX[checkpoint.stage];
      if (agentIndex === undefined) continue;

      const verb =
        status === 'completed'
          ? 'finished'
          : status === 'running'
            ? 'started'
            : status === 'cancelled'
              ? 'cancelled'
              : 'failed';

      entries.push({
        id: `${job.id}:${checkpoint.stage}:${status}`,
        timestamp:
          parseTimestamp(checkpoint.completed_at) ||
          parseTimestamp(checkpoint.started_at) ||
          parseTimestamp(checkpoint.updated_at),
        agentIndex,
        action: `${verb} ${checkpoint.stage}${status === 'failed' && checkpoint.error ? `: ${checkpoint.error}` : ''}`,
        taskId: `${job.id}:${checkpoint.stage}`
      });
    }
  }

  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * @param {any[]} jobs
 * @param {any[]} pipeline
 * @param {number} now
 * @returns {'idle'|'working'|'done'}
 */
function phaseFor(jobs, pipeline, now) {
  if ((jobs || []).some((job) => job.status === 'running')) return 'working';

  // 'done' parks the lead agent at spawn in a looping celebration, so keep it a real
  // event rather than a permanent state for any channel that has ever published.
  const recentlyFinished = (jobs || []).some(
    (job) =>
      job.status === 'completed' &&
      now - parseTimestamp(job.completed_at) <= DONE_WINDOW_MS
  );
  const recentlyPublished = (pipeline || []).some(
    (row) =>
      row.schedule_status === 'published' &&
      now - parseTimestamp(row.publish_time) <= DONE_WINDOW_MS
  );

  return recentlyFinished || recentlyPublished ? 'done' : 'idle';
}

/**
 * @param {{ jobs?: any[], pipeline?: any[] }} dashboard response body of /api/dashboard
 * @param {number} [now]
 * @returns {{ tasks: Task[], phase: 'idle'|'working'|'done', actionLog: ActionLogEntry[] }}
 */
export function mapJobsToTasks(dashboard, now = Date.now()) {
  const jobs = dashboard?.jobs || [];
  const pipeline = dashboard?.pipeline || [];

  // Only the job being worked on should animate the office. Older jobs stay in the
  // log. `jobs` arrives ordered by created_at DESC.
  const activeJob = jobs.find((job) => job.status === 'running') || null;

  return {
    tasks: [...(activeJob ? tasksForJob(activeJob) : []), ...tasksForPipeline(pipeline)],
    phase: phaseFor(jobs, pipeline, now),
    actionLog: logForJobs(jobs)
  };
}
