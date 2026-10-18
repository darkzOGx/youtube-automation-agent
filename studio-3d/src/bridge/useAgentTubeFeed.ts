import { useEffect, useState } from 'react';

import { useCoreStore } from '../integration/store/coreStore';
import { mapJobsToTasks } from './mapJobsToTasks.js';

/** Cadence while a generation job is running. */
const ACTIVE_POLL_MS = 3_000;
/** Cadence while the channel is idle — matches dashboard/app.js. */
const IDLE_POLL_MS = 8_000;

export type FeedStatus = 'connecting' | 'live' | 'offline';

/**
 * Polls AgentTube's existing `/api/dashboard` and writes the projection into the store
 * the simulation reads. Read-only: nothing here mutates channel state.
 *
 * No new backend endpoint is needed — `/api/dashboard` already returns `jobs` with
 * their per-stage `checkpoints` (see database/db.js listGenerationJobs) and `pipeline`.
 */
export function useAgentTubeFeed(): { status: FeedStatus; error: string | null } {
  const [status, setStatus] = useState<FeedStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastProjection = '';
    let stopped = false;

    const poll = async () => {
      let nextDelay = IDLE_POLL_MS;

      try {
        const response = await fetch('/api/dashboard', { signal: controller.signal });
        if (!response.ok) throw new Error(`/api/dashboard responded ${response.status}`);

        const dashboard = await response.json();
        const projection = mapJobsToTasks(dashboard);

        // Writing an equal-but-new array on every poll would re-render every panel and
        // re-run SceneManager's subscriber for nothing.
        const fingerprint = JSON.stringify(projection);
        if (fingerprint !== lastProjection) {
          lastProjection = fingerprint;
          useCoreStore.setState({
            tasks: projection.tasks,
            phase: projection.phase,
            actionLog: projection.actionLog
          });
        }

        if (projection.phase === 'working') nextDelay = ACTIVE_POLL_MS;
        setStatus('live');
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setStatus('offline');
        setError(cause instanceof Error ? cause.message : String(cause));
      }

      if (!stopped) timer = setTimeout(poll, nextDelay);
    };

    void poll();

    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { status, error };
}
