const ui = {
  state: null,
  currentView: 'overview',
  refreshing: false,
  toastTimer: null,
  retentionSnapshotId: null,
  engagementVideoId: null,
  engagementDetail: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function apiKey() {
  return localStorage.getItem('yaa_api_key') || '';
}

function requestApiKey() {
  const key = prompt('Enter the API_KEY value from your .env. It stays in this browser only.', apiKey());
  if (key !== null) localStorage.setItem('yaa_api_key', key.trim());
  return key;
}

async function api(url, options = {}, retry = true) {
  const key = apiKey();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'x-api-key': key } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && retry && requestApiKey() !== null) return api(url, options, false);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || response.statusText || 'Request failed');
    error.data = data;
    throw error;
  }
  return data;
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
}

function empty(message) {
  return `<div class="empty">${escapeHTML(message)}</div>`;
}

function formatDate(value, includeTime = true) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric',
    ...(ui.state?.profile?.timezone ? { timeZone: ui.state.profile.timezone } : {}),
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(date);
}

function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function label(value) {
  return String(value || 'unknown').replaceAll('_', ' ');
}

function statusChip(value) {
  const safe = String(value || 'unknown').toLowerCase();
  return `<span class="status ${escapeHTML(safe)}">${escapeHTML(label(safe))}</span>`;
}

async function refreshDashboard(silent = false) {
  if (ui.refreshing) return;
  ui.refreshing = true;
  if (!silent) $('#loading').classList.add('active');
  try {
    ui.state = await api('/api/dashboard');
    renderDashboard();
  } catch (error) {
    $('#system-label').textContent = 'Dashboard unavailable';
    $('#system-dot').classList.remove('online');
    if (!silent) showToast(error.message, 'error');
  } finally {
    ui.refreshing = false;
    $('#loading').classList.remove('active');
  }
}

function renderDashboard() {
  const state = ui.state;
  const reviews = state.pipeline.filter(item => ['needs_review', 'needs_attention'].includes(item.review_status));
  const scheduled = state.schedule.filter(item => item.status === 'scheduled');
  const actionableJobs = state.jobs.filter(job => ['queued', 'running', 'failed', 'interrupted'].includes(job.status));

  $('#brand-name').textContent = state.profile?.channel_name || 'Automation Studio';
  $('#setup-banner').classList.toggle('hidden', !state.system.setupRequired);
  $('#system-label').textContent = state.system.setupRequired
    ? 'Setup required'
    : state.system.automationPaused ? 'Automation paused' : `${state.system.agents.length} agents online`;
  $('#system-dot').classList.toggle('online', state.system.initialized && !state.system.automationPaused && !state.system.setupRequired);
  $('#automation-toggle').textContent = state.system.automationPaused ? 'Resume automation' : 'Pause automation';
  $('#automation-toggle').disabled = state.system.setupRequired;
  $('#generate-button').disabled = state.system.setupRequired;
  $('#review-badge').textContent = reviews.length;
  $('#review-badge').classList.toggle('hidden', reviews.length === 0);

  $('#stat-review').textContent = reviews.length;
  $('#stat-scheduled').textContent = scheduled.length;
  $('#stat-published').textContent = state.stats.published || 0;
  $('#stat-score').textContent = state.analytics.averagePerformanceScore ? `${state.analytics.averagePerformanceScore}/100` : '—';

  renderReviews(reviews);
  renderJobs(actionableJobs.length ? actionableJobs : state.jobs.slice(0, 5));
  renderSchedule(state.schedule.slice(0, 5), '#next-schedule');
  renderNotifications(state.notifications, state.events);
  renderPipeline(state.pipeline);
  renderCalendar(state.schedule);
  renderIdeas(state.ideas);
  renderAnalytics(state.analytics, state.learning);
  renderGrowthExperiments(state.experiments || {});
  renderEngagement(ui.state.engagement || {});
  renderActivation(state.activation);
  renderReadiness(state.readiness);
  renderOperator(state.channelStrategy, state.operatorRuns || [], { ...state.system, readiness: state.readiness });
  populateSettings(state.profile, state.settings, state.system.videoProviders || []);
}

function renderReadiness(readiness = {}) {
  const status = readiness.status || 'unverified';
  const statusNode = $('#readiness-status');
  statusNode.className = `status ${escapeHTML(status)}`;
  statusNode.textContent = readiness.stale && status !== 'unverified' ? `${label(status)} · stale` : label(status);

  const titles = {
    passed: 'The production path is verified.',
    warning: 'Core checks passed with warnings.',
    failed: 'Automation is blocked until this is fixed.',
    unverified: 'Prove the pipeline, without uploading.'
  };
  $('#readiness-title').textContent = titles[status] || titles.unverified;
  const counts = readiness.summary || {};
  $('#readiness-summary').textContent = status === 'unverified'
    ? 'The check makes small live text and narration requests, verifies channel access, builds a local audio/video MP4, and validates queued metadata. It never creates or uploads a YouTube video.'
    : `${counts.passed || 0} passed, ${counts.warnings || 0} warning${counts.warnings === 1 ? '' : 's'}, and ${counts.failed || 0} failed.`;
  $('#readiness-meta').textContent = readiness.completed_at
    ? `Last run ${formatDate(readiness.completed_at)}${readiness.stale ? ' · older than 24 hours' : ''}`
    : 'No readiness run recorded.';

  const checks = Array.isArray(readiness.checks) ? readiness.checks : [];
  $('#readiness-checks').innerHTML = checks.length ? checks.map(check => `
    <article class="readiness-check ${escapeHTML(check.status)}">
      <div class="readiness-check-heading"><span class="readiness-icon" aria-hidden="true">${check.status === 'passed' ? '✓' : check.status === 'failed' ? '×' : '!'}</span><div><strong>${escapeHTML(check.label)}</strong><div class="meta-line">${escapeHTML(label(check.status))}${check.blocking ? ' · blocking' : ' · optional'} · ${(check.durationMs || 0) / 1000}s</div></div></div>
      <p>${escapeHTML(check.message)}</p>
      ${check.remediation ? `<small><strong>Next:</strong> ${escapeHTML(check.remediation)}</small>` : ''}
    </article>`).join('') : empty('Run the verified check to inspect every production dependency.');
}

function renderReviews(reviews) {
  const container = $('#review-list');
  if (!reviews.length) {
    container.innerHTML = empty('Nothing is waiting. New content will appear here after quality review.');
    return;
  }
  container.innerHTML = reviews.slice(0, 5).map(item => `
    <article class="review-card">
      ${item.hasThumbnail ? `<img class="review-thumb" src="/api/content/${encodeURIComponent(item.id)}/asset/thumbnail" alt="">` : '<div class="review-thumb"></div>'}
      <div class="review-meta"><strong>${escapeHTML(item.title)}</strong><div class="meta-line">${statusChip(item.review_status)} · Quality ${qualityScore(item.qualityChecks)}%</div></div>
      <button class="button secondary small" data-open-content="${escapeHTML(item.id)}">Review</button>
    </article>`).join('');
}

function renderJobs(jobs) {
  const container = $('#job-list');
  if (!jobs.length) {
    container.innerHTML = empty('No generation runs yet.');
    return;
  }
  const stages = ['strategy', 'script', 'thumbnail', 'seo', 'production', 'quality_review'];
  container.innerHTML = jobs.slice(0, 6).map(job => {
    const checkpoints = Array.isArray(job.checkpoints) ? job.checkpoints : [];
    const completed = new Set(checkpoints.filter(item => item.status === 'completed').map(item => item.stage));
    const mediaTasks = Array.isArray(job.mediaTasks) ? job.mediaTasks : [];
    const mediaCompleted = mediaTasks.filter(item => item.status === 'succeeded').length;
    const mediaProviders = [...new Set(mediaTasks.map(item => label(item.provider)))].join(', ');
    const resumeFrom = stages.find(stage => !completed.has(stage)) || 'quality_review';
    const recoverable = ['failed', 'interrupted'].includes(job.status);
    return `
    <article class="job-card">
      <div class="job-meta">
        <strong>${escapeHTML(job.title || job.topic || 'Agent-selected topic')}</strong>
        <div class="meta-line">${statusChip(job.status)} · ${escapeHTML(label(job.stage))} · ${timeAgo(job.updated_at)}</div>
        ${checkpoints.length ? `<div class="checkpoint-line">${completed.size}/${stages.length} stages saved${job.details?.reusedStages?.length ? ` · ${job.details.reusedStages.length} reused` : ''}</div>` : ''}
        ${mediaTasks.length ? `<div class="checkpoint-line">Video: ${mediaCompleted}/${mediaTasks.length} clips ready · ${escapeHTML(mediaProviders)}</div>` : ''}
        <div class="progress"><i style="width:${Math.max(0, Math.min(100, job.progress || 0))}%"></i></div>
      </div>
      ${['queued', 'running'].includes(job.status) ? `<button class="text-button" data-cancel-job="${escapeHTML(job.id)}">Cancel</button>` : ''}
      ${recoverable ? `<div class="job-recovery"><select data-resume-stage-for="${escapeHTML(job.id)}" aria-label="Stage to resume from">${stages.map(stage => `<option value="${stage}" ${stage === resumeFrom ? 'selected' : ''}>${escapeHTML(label(stage))}</option>`).join('')}</select><button class="button secondary small" data-resume-job="${escapeHTML(job.id)}">Resume</button></div>` : ''}
    </article>`;
  }).join('');
}

function renderSchedule(schedule, selector) {
  const container = $(selector);
  if (!schedule.length) {
    container.innerHTML = empty('No approved videos are scheduled.');
    return;
  }
  container.innerHTML = schedule.map(item => `
    <div class="timeline-item">
      <div class="date-chip"><small>${escapeHTML(new Date(item.publish_time).toLocaleDateString(undefined, { month: 'short' }))}</small><strong>${escapeHTML(new Date(item.publish_time).getDate())}</strong></div>
      <div class="timeline-meta"><strong>${escapeHTML(item.title)}</strong><div class="meta-line">${formatDate(item.publish_time)} · ${statusChip(item.status)}</div></div>
      <button class="text-button" data-open-content="${escapeHTML(item.production_id)}">View</button>
    </div>`).join('');
}

function renderNotifications(notifications, events) {
  const items = notifications.length
    ? notifications
    : events.map(event => ({ level: event.status === 'error' ? 'error' : 'info', title: label(event.event_type), message: event.data?.error || label(event.status), created_at: event.created_at }));
  const container = $('#notification-list');
  if (!items.length) {
    container.innerHTML = empty('No activity has been recorded yet.');
    return;
  }
  container.innerHTML = items.slice(0, 7).map(item => `
    <div class="activity ${escapeHTML(item.level || 'info')}"><i></i><p><strong>${escapeHTML(item.title)}</strong><br><span class="meta-line">${escapeHTML(item.message)}</span></p><small>${timeAgo(item.created_at)}</small></div>`).join('');
}

function currentPipelineFilter() {
  return $('#pipeline-filter').value || 'all';
}

function renderPipeline(items) {
  const filter = currentPipelineFilter();
  const filtered = filter === 'all' ? items : items.filter(item =>
    item.review_status === filter || item.schedule_status === filter || item.status === filter
  );
  const container = $('#pipeline-list');
  if (!filtered.length) {
    container.innerHTML = empty('No content matches this view.');
    return;
  }
  container.innerHTML = filtered.map(item => {
    const state = item.schedule_status || item.review_status || item.status;
    const next = nextAction(item);
    return `<article class="pipeline-item" data-open-content="${escapeHTML(item.id)}">
      <div class="pipeline-title"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.topic || 'No topic recorded')} · ${formatDate(item.created_at)}</span></div>
      <div class="pipeline-col"><span>State</span><strong>${statusChip(state)}</strong></div>
      <div class="pipeline-col"><span>Quality</span><strong>${qualityScore(item.qualityChecks)} / 100</strong></div>
      <button class="button secondary small">${escapeHTML(next)} →</button>
    </article>`;
  }).join('');
}

function qualityScore(checks) {
  if (!Array.isArray(checks) || !checks.length) return 0;
  return Math.round((checks.filter(check => check.passed).length / checks.length) * 100);
}

function nextAction(item) {
  if (item.schedule_status === 'published') return 'View';
  if (item.review_status === 'needs_attention') return 'Fix issues';
  if (item.review_status === 'needs_review') return 'Review';
  if (item.schedule_status === 'scheduled') return 'Scheduled';
  return 'Inspect';
}

function renderCalendar(schedule) {
  renderSchedule(schedule, '#calendar-list');
}

function renderIdeas(ideas) {
  const container = $('#idea-list');
  if (!ideas.length) {
    container.innerHTML = empty('Add promising topics here before spending generation credits.');
    return;
  }
  container.innerHTML = ideas.map(idea => `
    <article class="idea-card">
      <div class="idea-meta"><strong>${escapeHTML(idea.topic)}</strong><div class="meta-line">${escapeHTML(idea.angle || idea.rationale || 'No angle added')} · ${statusChip(idea.status)}</div></div>
      ${idea.status === 'backlog' ? `<button class="button secondary small" data-generate-idea="${escapeHTML(idea.id)}">Generate</button>` : ''}
    </article>`).join('');
}

function renderAnalytics(analytics, learning = {}) {
  $('#analytics-total').textContent = analytics.totalVideos || 0;
  $('#analytics-score').textContent = analytics.averagePerformanceScore ? `${analytics.averagePerformanceScore}/100` : '—';
  const insights = Array.isArray(analytics.insights) ? analytics.insights : [];
  const approved = (learning.recommendations || []).find(item => item.status === 'approved');
  const pending = (learning.recommendations || []).find(item => item.status === 'pending');
  $('#analytics-action').textContent = approved?.title || pending?.title || insights[0] || (analytics.totalVideos
    ? 'Keep collecting results; recommendations get stronger with more published videos.'
    : 'Publish and analyze the first video to unlock performance recommendations.');
  const performers = Array.isArray(analytics.topPerformers) ? analytics.topPerformers : [];
  $('#top-performers').innerHTML = performers.length ? performers.map(item => `
    <article class="performer-card"><strong>${escapeHTML(item.videoDetails?.title || item.title || 'Untitled video')}</strong><div class="meta-line">Performance ${escapeHTML(item.performance?.score ?? item.performance_score ?? '—')} / 100</div></article>`).join('') : empty('No analyzed videos yet.');
  renderOutcome(learning.outcome || {});
  renderLearning(learning);
  renderRetention(learning.retention || {});
}

function formatOutcomeValue(value, kind = 'number', currency = 'USD') {
  if (value === null || value === undefined) return 'Unavailable';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Unavailable';
  if (kind === 'currency') {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(number);
    } catch (_error) {
      return `${currency} ${number.toFixed(2)}`;
    }
  }
  if (kind === 'percent') return `${number.toFixed(1)}%`;
  if (kind === 'hours') return `${number.toFixed(1)}h`;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(number);
}

function renderOutcome(outcome = {}) {
  const status = $('#outcome-status');
  if (!outcome.configured || !outcome.goal) {
    status.textContent = 'Not configured';
    status.className = 'status';
    $('#outcome-summary').innerHTML = empty('Choose a measurable primary outcome in the Autonomous Operator strategy.');
    $('#outcome-economics').innerHTML = '';
    $('#outcome-breakdowns').innerHTML = '';
    $('#outcome-policy').textContent = outcome.evidencePolicy || 'Configure a primary outcome to activate goal-aligned learning.';
    return;
  }
  const { goal, economics = {}, coverage = {}, breakdowns = {} } = outcome;
  status.textContent = outcome.available ? 'Measuring' : 'Awaiting evidence';
  status.className = `status ${outcome.available ? 'active' : ''}`;
  const target = goal.targetValue === null
    ? `No numeric target · ${goal.windowDays}-day evidence window`
    : `${formatOutcomeValue(goal.targetValue, goal.unit, goal.currency)} target · ${goal.windowDays} days`;
  const progress = outcome.progressPercent === null ? null : Math.min(100, Number(outcome.progressPercent));
  $('#outcome-summary').innerHTML = `
    <div class="outcome-primary">
      <span>${escapeHTML(goal.label)}</span>
      <strong>${escapeHTML(outcome.formattedObserved || 'Unavailable')}</strong>
      <small>${escapeHTML(target)} · ${Number(outcome.measuredVideoCount || 0)} measured videos</small>
      ${progress === null ? '' : `<div class="outcome-progress" role="progressbar" aria-label="Outcome target progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><small>${Number(outcome.progressPercent).toFixed(1)}% of target from stored measurement windows</small>`}
    </div>`;
  const economicsRows = [
    ['Net subscribers', economics.netSubscribers, 'number', coverage.subscribers],
    ['Watch hours', economics.watchHours, 'hours', null],
    ['Estimated revenue', economics.estimatedRevenue, 'currency', coverage.revenue],
    ['Known production cost', economics.knownProductionCost, 'currency', coverage.cost],
    ['Estimated ROI', economics.roi, 'percent', null],
    ['Budget used', economics.budgetUsedPercent, 'percent', null]
  ];
  $('#outcome-economics').innerHTML = economicsRows.map(([name, value, kind, metricCoverage]) => `
    <div><span>${escapeHTML(name)}</span><strong>${escapeHTML(formatOutcomeValue(value, kind, economics.currency || goal.currency))}</strong>${metricCoverage ? `<small>${Number(metricCoverage.measured || 0)}/${Number(metricCoverage.total || 0)} videos measured</small>` : ''}</div>`).join('');
  const dimensions = [
    ['pillar', 'Content pillars'], ['format', 'Formats'], ['provider', 'Production providers']
  ].filter(([key]) => Array.isArray(breakdowns[key]) && breakdowns[key].length);
  $('#outcome-breakdowns').innerHTML = dimensions.length ? dimensions.map(([key, heading]) => `
    <section><h3>${escapeHTML(heading)}</h3>${breakdowns[key].slice(0, 5).map(item => `
      <div class="outcome-breakdown-row"><span>${escapeHTML(label(item.name))}<small>${Number(item.count || 0)} video${Number(item.count || 0) === 1 ? '' : 's'}</small></span><strong>${escapeHTML(formatOutcomeValue(item.average, goal.unit, goal.currency))} avg</strong></div>`).join('')}</section>`).join('') : empty('Breakdowns appear once measured videos carry comparable pillar, format, or provider evidence.');
  $('#outcome-policy').textContent = outcome.evidencePolicy;
}

function renderLearning(learning = {}) {
  const baseline = learning.baseline || {};
  $('#learning-snapshot-count').textContent = `${learning.snapshotCount || 0} snapshots`;
  $('#learning-approved-count').textContent = `${learning.approvedCount || 0} approved`;
  const metrics = [
    ['CTR', baseline.ctr, '%'],
    ['Retention', baseline.retention, '%'],
    ['Engagement', baseline.engagementRate, '%'],
    ['Performance', baseline.performanceScore, '/100']
  ];
  $('#learning-baseline').innerHTML = learning.measuredVideos ? metrics.map(([name, value, suffix]) => `
    <div><span>${escapeHTML(name)}</span><strong>${Number(value || 0).toFixed(1)}${escapeHTML(suffix)}</strong></div>`).join('') : empty('Two real measurements unlock evidence-backed recommendations.');

  const recommendations = Array.isArray(learning.recommendations) ? learning.recommendations : [];
  $('#learning-recommendations').innerHTML = recommendations.length ? recommendations.map(item => `
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(item.title)}</strong>${statusChip(item.status)}</div>
      <p>${escapeHTML(item.rationale)}</p>
      <div class="learning-meta"><span>${escapeHTML(label(item.category))} · ${escapeHTML(label(item.confidence))} confidence</span>
        <span class="learning-actions">
          ${item.status !== 'approved' ? `<button class="text-button approve" data-learning-action="approve" data-learning-id="${escapeHTML(item.id)}">Approve</button>` : ''}
          ${item.status !== 'rejected' ? `<button class="text-button" data-learning-action="reject" data-learning-id="${escapeHTML(item.id)}">Reject</button>` : ''}
        </span>
      </div>
    </article>`).join('') : empty('No recommendation yet. Lumen needs at least two real, sufficiently exposed measurements.');
}

function renderGrowthExperiments(summary = {}) {
  const experiments = Array.isArray(summary.experiments) ? summary.experiments : [];
  const candidates = Array.isArray(summary.candidates) ? summary.candidates : [];
  const candidate = $('#experiment-candidate');
  const create = $('#experiment-create-button');
  candidate.innerHTML = candidates.length
    ? candidates.map(item => `<option value="${escapeHTML(item.productionId)}">${escapeHTML(item.title || item.productionId)}</option>`).join('')
    : '<option value="">No eligible published variants</option>';
  candidate.disabled = !candidates.length;
  create.disabled = !candidates.length;
  $('#experiment-status').textContent = `${Number(summary.activeCount || 0)} running · ${Number(summary.awaitingDecisionCount || 0)} decision${Number(summary.awaitingDecisionCount || 0) === 1 ? '' : 's'}`;
  $('#experiment-policy').textContent = summary.evidencePolicy || 'Only real YouTube evidence advances controlled tests.';

  $('#growth-experiments').innerHTML = experiments.length ? experiments.map(experiment => {
    const winner = experiment.arms?.find(arm => arm.id === experiment.winningArmId);
    const actions = [];
    if (experiment.status === 'draft') actions.push(`<button class="text-button approve" data-experiment-action="approve" data-experiment-id="${escapeHTML(experiment.id)}">Approve plan</button>`);
    if (experiment.status === 'approved') actions.push(`<button class="button primary small" data-experiment-action="start" data-experiment-id="${escapeHTML(experiment.id)}">Start live test</button>`);
    if (experiment.status === 'running') {
      actions.push(`<button class="button secondary small" data-experiment-action="refresh" data-experiment-id="${escapeHTML(experiment.id)}">Refresh evidence</button>`);
      actions.push(`<button class="text-button" data-experiment-action="cancel" data-experiment-id="${escapeHTML(experiment.id)}">Cancel &amp; restore control</button>`);
    }
    if (experiment.status === 'action_required') actions.push(`<button class="text-button" data-experiment-action="cancel" data-experiment-id="${escapeHTML(experiment.id)}">Retry control restore</button>`);
    if (experiment.status === 'awaiting_winner') actions.push(`<button class="button primary small" data-experiment-action="adopt" data-experiment-id="${escapeHTML(experiment.id)}">Adopt ${escapeHTML(winner?.label || 'winner')}</button>`);
    const arms = (experiment.arms || []).map(arm => {
      const result = arm.result || {};
      const active = arm.id === experiment.currentArmId && experiment.status === 'running';
      return `<div class="experiment-arm ${active ? 'active' : ''} ${arm.id === experiment.winningArmId ? 'winner' : ''}">
        <div><strong>${escapeHTML(arm.label)}</strong>${arm.isControl ? '<small>Control</small>' : ''}</div>
        <span>${escapeHTML(arm.title)}</span>
        <div class="experiment-arm-metrics"><b>${Number(result.ctr || 0).toFixed(2)}% CTR</b><small>${Number(result.impressions || 0).toLocaleString()} impressions</small></div>
      </div>`;
    }).join('');
    return `<article class="growth-experiment-card">
      <div class="learning-card-heading"><strong>${escapeHTML(experiment.title)}</strong>${statusChip(experiment.status)}</div>
      <p>${escapeHTML(experiment.hypothesis)}</p>
      <div class="experiment-arm-list">${arms}</div>
      ${experiment.result?.reason ? `<p class="experiment-result"><strong>Result:</strong> ${escapeHTML(experiment.result.reason)}${experiment.result.liftPercent !== undefined ? ` · ${escapeHTML(experiment.result.liftPercent)}% lift` : ''}</p>` : ''}
      <div class="learning-meta"><span>${Number(experiment.armDurationHours || 0)}h per arm · ${Number(experiment.minImpressions || 0).toLocaleString()} minimum impressions</span><span class="learning-actions">${actions.join('')}</span></div>
    </article>`;
  }).join('') : empty('Publish content with approved-learning title and thumbnail variants to create the first controlled test.');
}

function renderRetention(retention = {}) {
  const snapshots = Array.isArray(retention.snapshots) ? retention.snapshots : [];
  const select = $('#retention-snapshot-select');
  const refresh = $('#refresh-retention-button');
  if (!snapshots.length) {
    ui.retentionSnapshotId = null;
    select.innerHTML = '<option value="">No measured curves yet</option>';
    select.disabled = true;
    refresh.disabled = true;
    $('#retention-meta').innerHTML = '';
    $('#retention-chart').innerHTML = empty('Retention curves appear after a published video reaches a real analytics measurement window.');
    $('#retention-scenes').innerHTML = '';
    return;
  }

  if (!snapshots.some(item => item.id === ui.retentionSnapshotId)) ui.retentionSnapshotId = snapshots[0].id;
  select.disabled = false;
  refresh.disabled = false;
  select.innerHTML = snapshots.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === ui.retentionSnapshotId ? 'selected' : ''}>${escapeHTML(item.title || item.videoId)} · ${escapeHTML(label(item.surface))} · ${escapeHTML(item.measurementWindow)}</option>`).join('');
  const snapshot = snapshots.find(item => item.id === ui.retentionSnapshotId) || snapshots[0];
  refresh.dataset.videoId = snapshot.videoId;
  refresh.dataset.measurementWindow = snapshot.measurementWindow;

  const summary = snapshot.summary || {};
  $('#retention-meta').innerHTML = [
    `${snapshot.points?.length || 0} real points`,
    `${snapshot.sceneMetrics?.length || 0} scenes`,
    `${summary.dropoffCount || 0} drop-offs`,
    `${summary.rewatchCount || 0} rewatch signals`,
    `${escapeHTML(label(snapshot.confidence))} confidence`,
    `${escapeHTML(snapshot.measurementWindow)} window`
  ].map(item => `<span>${item}</span>`).join('');
  $('#retention-chart').innerHTML = retentionChart(snapshot);
  $('#retention-scenes').innerHTML = (snapshot.sceneMetrics || []).map(scene => `
    <article class="retention-scene ${escapeHTML(scene.signal)}">
      <div class="retention-scene-heading"><div><span>Scene ${Number(scene.position || 0) + 1}</span><strong>${escapeHTML(scene.label)}</strong></div>${statusChip(scene.signal)}</div>
      <div class="retention-metrics">
        <div><span>Average watching</span><strong>${(Number(scene.averageWatchRatio || 0) * 100).toFixed(1)}%</strong></div>
        <div><span>Scene change</span><strong>${Number(scene.changePoints || 0) > 0 ? '+' : ''}${Number(scene.changePoints || 0).toFixed(1)} pts</strong></div>
        <div><span>Relative retention</span><strong>${(Number(scene.averageRelativeRetention || 0) * 100).toFixed(1)}%</strong></div>
        <div><span>Sharpest drop</span><strong>${Number(scene.largestDropPoints || 0).toFixed(1)} pts</strong></div>
      </div>
    </article>`).join('') || empty('The saved curve could not be mapped to a scene timeline.');
}

function renderEngagement(engagement = {}) {
  $('#engagement-policy').textContent = engagement.evidencePolicy || '';
  const posting = $('#engagement-posting-status');
  posting.textContent = engagement.postingEnabled ? 'posting enabled' : 'posting locked';
  posting.className = `status ${engagement.postingEnabled ? 'success' : 'warning'}`;
  posting.title = engagement.postingEnabled ? '' : 'Re-authorize YouTube (npm run walkthrough) to grant the comment permission.';
  $('#engagement-drafts-count').textContent = `${engagement.pendingDrafts || 0} drafts`;
  $('#engagement-attention-count').textContent = `${engagement.needsAttentionCount || 0} flagged`;
  $('#engagement-ideas-count').textContent = `${engagement.pendingAudienceIdeas || 0} pending`;

  const insights = Array.isArray(engagement.insights) ? engagement.insights : [];
  const select = $('#engagement-video-select');
  if (!insights.length) {
    ui.engagementVideoId = null;
    ui.engagementDetail = null;
    select.innerHTML = '<option value="">No synced videos yet</option>';
    select.disabled = true;
    $('#engagement-sync-button').disabled = true;
    $('#engagement-draft-button').disabled = true;
    $('#engagement-meta').innerHTML = '';
    $('#engagement-themes').innerHTML = empty('Comments appear after a published video is synced.');
    $('#engagement-drafts').innerHTML = empty('Draft replies from a synced video to review them here.');
    $('#engagement-attention').innerHTML = empty('Nothing flagged as spam, scam, or toxic.');
  } else {
    if (!insights.some(item => item.videoId === ui.engagementVideoId)) ui.engagementVideoId = insights[0].videoId;
    select.disabled = false;
    select.innerHTML = insights.map(item => `<option value="${escapeHTML(item.videoId)}" ${item.videoId === ui.engagementVideoId ? 'selected' : ''}>${escapeHTML(item.title || item.videoId)}</option>`).join('');
    $('#engagement-sync-button').disabled = false;
    $('#engagement-sync-button').dataset.videoId = ui.engagementVideoId;
    $('#engagement-draft-button').disabled = false;
    $('#engagement-draft-button').dataset.videoId = ui.engagementVideoId;
    renderEngagementDetail();
  }
  renderAudienceIdeas();
}

function renderEngagementDetail() {
  const detail = ui.engagementDetail;
  if (!detail || detail.insight?.videoId !== ui.engagementVideoId) {
    loadEngagementDetail(ui.engagementVideoId);
    return;
  }
  const insight = detail.insight || {};
  const sentiment = insight.sentiment || {};
  const fallback = insight.analysisMethod === 'fallback';
  $('#engagement-meta').innerHTML = [
    `${insight.commentCount || 0} comments`,
    `${insight.analyzedCount || 0} analyzed`,
    fallback ? 'AI analysis unavailable — mechanical facts only' : `${sentiment.positive || 0} positive · ${sentiment.neutral || 0} neutral · ${sentiment.negative || 0} negative`,
    insight.lastSyncedAt ? `synced ${new Date(insight.lastSyncedAt).toLocaleString()}` : 'never synced'
  ].map(item => `<span>${escapeHTML(item)}</span>`).join('');

  const themes = Array.isArray(insight.themes) ? insight.themes : [];
  $('#engagement-themes').innerHTML = themes.length ? themes.map(theme => `
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(theme.title)}</strong>${statusChip(theme.kind)}</div>
      <p>${escapeHTML(theme.summary)}</p>
      <div class="learning-meta"><span>${escapeHTML(String(theme.count || 0))} comments</span></div>
    </article>`).join('') : empty(fallback ? 'Themes need a working AI text provider.' : 'No recurring themes yet.');

  const commentsById = new Map((detail.comments || []).map(comment => [comment.commentId, comment]));
  const postingEnabled = ui.state?.engagement?.postingEnabled === true;
  const drafts = (detail.drafts || []).filter(draft => draft.status !== 'discarded');
  const draftsContainer = $('#engagement-drafts');
  // The 8s poll must not wipe a reply the operator is actively editing.
  const draftsHTML = drafts.length ? drafts.map(draft => {
    const comment = commentsById.get(draft.commentId) || {};
    const locked = draft.status === 'posted';
    return `
    <article class="comment-card" data-reply-card="${escapeHTML(draft.id)}">
      <div class="learning-card-heading"><strong>${escapeHTML(comment.authorName || 'Viewer')}</strong>${statusChip(draft.status)}</div>
      <p class="comment-original">${escapeHTML(comment.text || '')}</p>
      <label><span>Reply</span><textarea data-reply-text maxlength="1000" ${locked ? 'disabled' : ''}>${escapeHTML(draft.editedText || draft.draftText)}</textarea></label>
      ${draft.failureReason ? `<p class="meta-line">Last attempt failed: ${escapeHTML(draft.failureReason)}</p>` : ''}
      <div class="learning-actions">
        ${locked ? '' : `<button class="button primary small" data-reply-approve="${escapeHTML(draft.id)}" ${postingEnabled ? '' : 'disabled title="Re-authorize YouTube to enable posting"'}>Approve &amp; post</button>
        <button class="text-button" data-reply-save="${escapeHTML(draft.id)}">Save edit</button>
        <button class="text-button danger-text" data-reply-discard="${escapeHTML(draft.id)}">Discard</button>`}
      </div>
    </article>`;
  }).join('') : empty('No reply drafts for this video yet.');
  // Guard the focused textarea only: a clicked action button also holds focus, and skipping
  // the rebuild for it would leave the panel showing pre-action state.
  const editingReply = draftsContainer.contains(document.activeElement)
    && document.activeElement.matches('[data-reply-text]');
  if (!editingReply) draftsContainer.innerHTML = draftsHTML;

  const attention = Array.isArray(insight.attentionFlags) ? insight.attentionFlags : [];
  $('#engagement-attention').innerHTML = attention.length ? attention.map(flag => {
    const comment = commentsById.get(flag.commentId) || {};
    return `
    <article class="comment-card">
      <div class="learning-card-heading"><strong>${escapeHTML((flag.categories || []).join(', '))}</strong></div>
      <p class="comment-original">${escapeHTML(comment.text || '')}</p>
      <a class="text-button" href="${escapeHTML(flag.permalink || '#')}" target="_blank" rel="noopener noreferrer">Open on YouTube</a>
    </article>`;
  }).join('') : empty('Nothing flagged as spam, scam, or toxic.');
}

async function loadEngagementDetail(videoId) {
  if (!videoId) return;
  try {
    const data = await api(`/api/engagement/${encodeURIComponent(videoId)}`);
    ui.engagementDetail = data.result;
    renderEngagementDetail();
  } catch (_error) { /* toast already shown by api() */ }
}

function renderAudienceIdeas() {
  const recommendations = (ui.state?.learning?.recommendations || []).filter(item => item.category === 'audience_demand');
  $('#engagement-ideas').innerHTML = recommendations.length ? recommendations.map(item => `
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(item.title)}</strong>${statusChip(item.status)}</div>
      <p>${escapeHTML(item.rationale)}</p>
      <div class="learning-meta"><span>${escapeHTML(label(item.confidence))} confidence</span>
        <span class="learning-actions">
          ${item.status !== 'approved' ? `<button class="text-button approve" data-learning-action="approve" data-learning-id="${escapeHTML(item.id)}">Approve</button>` : ''}
          ${item.status !== 'rejected' ? `<button class="text-button" data-learning-action="reject" data-learning-id="${escapeHTML(item.id)}">Reject</button>` : ''}
        </span>
      </div>
    </article>`).join('') : empty('Mined audience requests appear here once comment analysis finds repeated asks.');
}

function retentionChart(snapshot = {}) {
  const points = Array.isArray(snapshot.points) ? snapshot.points : [];
  if (points.length < 2) return empty('This snapshot does not contain enough points for a curve.');
  const width = 1000;
  const height = 280;
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxRatio = Math.max(1, Math.min(1.5, Math.max(...points.map(point => Number(point.audienceWatchRatio || 0))) * 1.05));
  const x = ratio => left + Math.max(0, Math.min(1, Number(ratio || 0))) * plotWidth;
  const y = ratio => top + (1 - Math.max(0, Math.min(maxRatio, Number(ratio || 0))) / maxRatio) * plotHeight;
  const line = points.map(point => `${x(point.elapsedRatio).toFixed(1)},${y(point.audienceWatchRatio).toFixed(1)}`).join(' ');
  const duration = Math.max(1, Number(snapshot.durationSeconds || 1));
  const sceneBands = (snapshot.sceneMetrics || []).map((scene, index) => {
    const start = x(Number(scene.startSeconds || 0) / duration);
    const end = x(Number(scene.endSeconds || 0) / duration);
    return `<g><rect x="${start.toFixed(1)}" y="${top}" width="${Math.max(1, end - start).toFixed(1)}" height="${plotHeight}" class="retention-band band-${index % 2}"/><line x1="${start.toFixed(1)}" y1="${top}" x2="${start.toFixed(1)}" y2="${top + plotHeight}" class="scene-boundary"/><title>${escapeHTML(scene.label)}</title></g>`;
  }).join('');
  const grid = [0.25, 0.5, 0.75, 1].map(value => {
    const lineY = y(value);
    return `<line x1="${left}" y1="${lineY.toFixed(1)}" x2="${width - right}" y2="${lineY.toFixed(1)}" class="retention-grid-line"/><text x="${left - 8}" y="${(lineY + 4).toFixed(1)}" text-anchor="end">${Math.round(value * 100)}%</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="retention-chart-title retention-chart-desc">
    <title id="retention-chart-title">Audience retention for ${escapeHTML(snapshot.title || snapshot.videoId)}</title>
    <desc id="retention-chart-desc">A ${points.length}-point audience retention curve divided by ${snapshot.sceneMetrics?.length || 0} production scenes.</desc>
    ${sceneBands}${grid}
    <polyline points="${line}" class="retention-line"/>
    <text x="${left}" y="${height - 10}" text-anchor="start">Start</text>
    <text x="${width - right}" y="${height - 10}" text-anchor="end">End</text>
  </svg>`;
}

function renderActivation(activation = {}) {
  const container = $('#activation-list');
  if (!container) return;
  const milestones = activation.milestones || {};
  const rows = [
    ['Setup ready', milestones.setupReady],
    ['First real MP4', milestones.firstRealVideo],
    ['First approval', milestones.firstApproval],
    ['First YouTube publish', milestones.firstPublish],
    ['Second real MP4', milestones.secondRealVideo]
  ];
  container.innerHTML = rows.map(([name, milestone = {}]) => `
    <div class="timeline-item">
      <div class="timeline-dot ${milestone.achieved ? 'done' : ''}"></div>
      <div><strong>${escapeHTML(name)}</strong><div class="meta-line">${milestone.achieved ? escapeHTML(formatDate(milestone.at)) : 'Not reached yet'}</div></div>
    </div>`).join('');
  if (milestones.firstRealVideo?.achieved) {
    container.insertAdjacentHTML('beforeend', `
      <div class="activation-share">
        <span>Made something real with Lumen?</span>
        <a class="button secondary small" href="https://github.com/darkzOGx/youtube-automation-agent/discussions/new?category=show-and-tell" target="_blank" rel="noreferrer">Share what you built</a>
      </div>`);
  }
}

function renderOperator(strategy, runs, system) {
  const form = $('#strategy-form');
  const mapping = strategy ? {
    objective: strategy.objective,
    audience: strategy.audience,
    valueProposition: strategy.value_proposition,
    contentPillars: (strategy.contentPillars || []).join(', '),
    cadencePerWeek: strategy.cadence_per_week,
    videosPerRun: strategy.videos_per_run,
    defaultFormat: strategy.default_format,
    defaultLength: strategy.default_length,
    successMetric: strategy.success_metric,
    primaryKpi: strategy.primary_kpi,
    targetValue: strategy.target_value,
    targetWindowDays: strategy.target_window_days,
    monthlyBudget: strategy.monthly_budget,
    outcomeCurrency: strategy.outcome_currency,
    constraints: strategy.constraints
  } : {};
  for (const [name, value] of Object.entries(mapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value ?? '';
  }

  const strategyStatus = strategy?.status || 'not_configured';
  $('#operator-strategy-status').className = `status ${escapeHTML(strategyStatus)}`;
  $('#operator-strategy-status').textContent = label(strategyStatus);
  const run = runs[0];
  const active = run && ['queued', 'running', 'cancelling'].includes(run.status);
  const recoverable = run && ['failed', 'interrupted', 'completed_with_issues'].includes(run.status);
  $('#activate-operator-button').disabled = Boolean(system.setupRequired || active || system.readiness?.status === 'failed');
  $('#activate-operator-button').title = system.readiness?.status === 'failed' ? 'Resolve the production readiness failures first' : '';
  $('#activate-operator-button').textContent = strategy?.status === 'active' ? 'Run strategy now' : 'Activate & run now';
  $('#pause-operator-button').classList.toggle('hidden', strategy?.status !== 'active');
  $('#cancel-operator-run').classList.toggle('hidden', !active);
  if (active) $('#cancel-operator-run').dataset.runId = run.id;
  $('#resume-operator-run').classList.toggle('hidden', !recoverable);
  $('#resume-operator-run').disabled = Boolean(system.setupRequired || system.readiness?.status === 'failed');
  if (recoverable) $('#resume-operator-run').dataset.runId = run.id;

  if (!run) {
    $('#operator-run-title').textContent = 'Waiting for a strategy';
    $('#operator-run-summary').innerHTML = empty('Save a channel mandate, then activate it to research and produce the first plan.');
    $('#operator-plan').innerHTML = empty('No editorial plan yet.');
    return;
  }

  $('#operator-run-title').textContent = `${label(run.stage)} · ${run.progress || 0}%`;
  const sources = Array.isArray(run.research?.sources) ? run.research.sources.join(', ') : 'Research pending';
  $('#operator-run-summary').innerHTML = `<div class="run-summary">
    <div class="progress"><i style="width:${Math.max(0, Math.min(100, run.progress || 0))}%"></i></div>
    <div class="run-summary-row"><span>Status</span><strong>${statusChip(run.status)}</strong></div>
    <div class="run-summary-row"><span>Research</span><strong>${escapeHTML(sources)}</strong></div>
    <div class="run-summary-row"><span>Produced</span><strong>${escapeHTML(run.summary?.generated || 0)} / ${escapeHTML(run.summary?.planned || run.plan?.length || 0)}</strong></div>
    <div class="run-summary-row"><span>Needs review</span><strong>${escapeHTML(run.summary?.needsReview || 0)}</strong></div>
    ${run.error ? `<p class="callout">${escapeHTML(run.error)}</p>` : ''}
  </div>`;
  const plan = Array.isArray(run.plan) ? run.plan : [];
  $('#operator-plan').innerHTML = plan.length ? plan.map((item, index) => {
    const job = (run.generatedJobs || []).find(candidate => candidate.topic === item.topic);
    return `<article class="plan-card">
      <div class="meta-line">${index + 1} · ${escapeHTML(item.format)} · ${escapeHTML(item.length)} ${job ? `· ${statusChip(job.reviewStatus || job.status)}` : ''}</div>
      <strong>${escapeHTML(item.topic)}</strong>
      <p>${escapeHTML(item.angle || item.rationale)}</p>
    </article>`;
  }).join('') : empty('Research and planning will appear here when the run begins.');
}

function populateSettings(profile = {}, settings = {}, providers = []) {
  const form = $('#profile-form');
  const mapping = {
    channelName: profile.channel_name,
    goal: profile.goal,
    targetAudience: profile.target_audience,
    brandVoice: profile.brand_voice,
    defaultStyle: profile.default_style,
    callToAction: profile.call_to_action,
    visualStyle: profile.visual_style,
    timezone: profile.timezone,
    bannedTopics: (profile.bannedTopics || []).join(', ')
  };
  for (const [name, value] of Object.entries(mapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value || '';
  }
  $('#approval-required').checked = settings.approval_required !== 'false';
  $('#notifications-enabled').checked = settings.notification_enabled !== 'false';
  const videoMapping = {
    videoProvider: settings.video_provider || 'slideshow',
    videoGenerationMode: settings.video_generation_mode || 'hybrid',
    videoClipDuration: settings.video_clip_duration || '8',
    videoMaxGeneratedSeconds: settings.video_max_generated_seconds || '60'
  };
  for (const [name, value] of Object.entries(videoMapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value;
  }
  const selected = providers.find(provider => provider.id === videoMapping.videoProvider);
  $('#video-provider-status').textContent = videoMapping.videoProvider === 'auto'
    ? `${providers.filter(provider => provider.available && provider.id !== 'slideshow').length} paid provider(s) available; local slideshow remains the final fallback.`
    : videoMapping.videoProvider === 'slideshow' ? 'Local FFmpeg slideshow is selected; no external video credentials are required.'
      : selected?.available ? `${label(selected.id)} is configured (${selected.model}).` : `${label(videoMapping.videoProvider)} credentials are not configured.`;
}

function switchView(view) {
  ui.currentView = view;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach(item => item.classList.toggle('active', item.id === `${view}-view`));
  const titles = {
    overview: ['OPERATOR OVERVIEW', 'Know what happens next.'],
    operator: ['AUTONOMOUS OPERATOR', 'Give Lumen the strategy.'],
    pipeline: ['CONTENT OPERATIONS', 'From idea to published.'],
    calendar: ['EDITORIAL PLANNING', 'Plan before you generate.'],
    analytics: ['PERFORMANCE', 'Turn results into the next move.'],
    engagement: ['AUDIENCE ENGAGEMENT', 'Talk with the people watching.'],
    readiness: ['PRODUCTION READINESS', 'Verify before autonomy runs.'],
    settings: ['CHANNEL GUARDRAILS', 'Make every agent sound like you.']
  };
  $('#view-eyebrow').textContent = titles[view][0];
  $('#view-title').textContent = titles[view][1];
  location.hash = view;
}

function selectOptions(options, selected) {
  return options.map(([value, label]) =>
    `<option value="${escapeHTML(value)}" ${value === selected ? 'selected' : ''}>${escapeHTML(label)}</option>`
  ).join('');
}

function renderSourceEditor(source = {}, disabled = false) {
  return `<article class="provenance-item" data-provenance-source data-id="${escapeHTML(source.id || '')}" data-published-at="${escapeHTML(source.publishedAt || '')}" data-accessed-at="${escapeHTML(source.accessedAt || '')}">
    <div class="provenance-item-heading"><strong>Research source</strong><button type="button" class="text-button danger-text" data-remove-provenance ${disabled ? 'disabled' : ''}>Remove</button></div>
    <label><span>URL</span><input data-field="url" type="url" value="${escapeHTML(source.url || '')}" placeholder="https://..." required ${disabled ? 'disabled' : ''}></label>
    <div class="form-grid two">
      <label><span>Title</span><input data-field="title" value="${escapeHTML(source.title || '')}" maxlength="300" ${disabled ? 'disabled' : ''}></label>
      <label><span>Publisher</span><input data-field="publisher" value="${escapeHTML(source.publisher || '')}" maxlength="200" ${disabled ? 'disabled' : ''}></label>
      <label><span>Type</span><select data-field="sourceType" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['official', 'Official source'], ['article', 'Article'], ['video', 'Video'], ['dataset', 'Dataset'], ['asset', 'Asset or license'], ['other', 'Other']
      ], source.sourceType || 'other')}</select></label>
      <label><span>Review status</span><select data-field="status" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['pending', 'Pending review'], ['verified', 'Verified'], ['rejected', 'Rejected']
      ], source.status || 'pending')}</select></label>
    </div>
    <label><span>Evidence notes</span><textarea data-field="notes" rows="2" maxlength="1000" ${disabled ? 'disabled' : ''}>${escapeHTML(source.notes || '')}</textarea></label>
    ${source.url ? `<a class="source-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener">Open source ↗</a>` : ''}
  </article>`;
}

function renderClaimEditor(claim = {}, sources = [], disabled = false) {
  const linked = new Set(claim.sourceIds || []);
  return `<article class="provenance-item ${claim.riskLevel === 'high' ? 'high-risk' : ''}" data-provenance-claim data-id="${escapeHTML(claim.id || '')}">
    <div class="provenance-item-heading"><strong>Factual claim</strong><button type="button" class="text-button danger-text" data-remove-provenance ${disabled ? 'disabled' : ''}>Remove</button></div>
    <label><span>Claim</span><textarea data-field="text" rows="3" maxlength="1000" required ${disabled ? 'disabled' : ''}>${escapeHTML(claim.text || '')}</textarea></label>
    <div class="form-grid two">
      <label><span>Risk</span><select data-field="riskLevel" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['standard', 'Standard'], ['high', 'High risk']
      ], claim.riskLevel || 'standard')}</select></label>
      <label><span>Resolution</span><select data-field="status" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['pending', 'Pending'], ['supported', 'Supported'], ['unsupported', 'Unsupported'], ['waived', 'Waived with note']
      ], claim.status || 'pending')}</select></label>
    </div>
    <fieldset class="source-checklist" ${disabled ? 'disabled' : ''}><legend>Supporting sources</legend>
      ${sources.length ? sources.map(source => `<label><input type="checkbox" data-claim-source="${escapeHTML(source.id)}" ${linked.has(source.id) ? 'checked' : ''}> ${escapeHTML(source.title || source.url)}</label>`).join('') : '<small>Add a source before marking this claim supported.</small>'}
    </fieldset>
    <label><span>Reviewer notes</span><textarea data-field="notes" rows="2" maxlength="1000" placeholder="Required when waived" ${disabled ? 'disabled' : ''}>${escapeHTML(claim.notes || '')}</textarea></label>
  </article>`;
}

function renderProvenanceEditor(provenance = {}, canReview = true) {
  const sources = provenance.sources || [];
  const claims = provenance.claims || [];
  const summary = provenance.summary || {};
  const statusLabel = provenance.status === 'verified' ? 'Evidence verified' : provenance.status === 'not_required' ? 'No claims declared' : `${summary.unresolvedClaims || 0} unresolved`;
  return `<section class="provenance-panel">
    <div class="panel-heading"><div><p class="eyebrow">RESEARCH &amp; PROVENANCE</p><h3>Evidence desk</h3><p>Verify sources, connect every factual claim, and record disclosure before approval.</p></div><span class="status ${provenance.status === 'verified' || provenance.status === 'not_required' ? 'success' : 'warning'}">${escapeHTML(statusLabel)}</span></div>
    <div class="provenance-toolbar"><strong>Sources</strong>${canReview ? '<button type="button" class="text-button" data-add-provenance-source>Add source +</button>' : ''}</div>
    <div id="provenance-sources" class="provenance-list">${sources.map(source => renderSourceEditor(source, !canReview)).join('') || '<p class="empty-inline">No research sources attached.</p>'}</div>
    <div class="provenance-toolbar"><strong>Claims</strong>${canReview ? '<button type="button" class="text-button" data-add-provenance-claim>Add claim +</button>' : ''}</div>
    <div id="provenance-claims" class="provenance-list">${claims.map(claim => renderClaimEditor(claim, sources, !canReview)).join('') || '<p class="empty-inline">No externally verifiable claims declared.</p>'}</div>
    <label class="toggle disclosure-toggle"><input id="contains-synthetic-media" type="checkbox" ${provenance.containsSyntheticMedia ? 'checked' : ''} ${canReview ? '' : 'disabled'}><span></span> Contains realistic altered or synthetic media requiring YouTube disclosure</label>
    ${canReview ? '<button type="button" class="button secondary" data-save-provenance>Save evidence review</button>' : ''}
  </section>`;
}

function renderDiscoverabilityPanel(item) {
  const audit = item.discoverability;
  const findings = audit?.findings || [];
  const state = !audit ? 'Not run' : audit.status === 'unavailable' ? 'Unavailable' : `${findings.length} finding${findings.length === 1 ? '' : 's'}`;
  const stateClass = audit?.status === 'passed' || (audit && findings.length === 0) ? 'success' : 'warning';
  return `<section class="discoverability-panel">
    <div class="panel-heading discoverability-heading">
      <div><p class="eyebrow">DISCOVERABILITY PREFLIGHT</p><h3>DarkzSEO review</h3><p>Review GEO, AIO, AEO, and web-search guidance against this content package. Findings are advisory and never rewrite or publish content.</p></div>
      <div class="discoverability-actions"><span class="status ${stateClass}">${escapeHTML(state)}</span><button type="button" class="button secondary small" data-discoverability-run="${escapeHTML(item.id)}">${audit ? 'Run again' : 'Run audit'}</button></div>
    </div>
    ${audit?.error ? `<p class="callout">DarkzSEO could not run${audit.errorCode || audit.error_code ? ` (${escapeHTML(audit.errorCode || audit.error_code)})` : ''}: ${escapeHTML(audit.error)}</p>` : ''}
    ${findings.length ? `<div class="discoverability-findings">${findings.map(finding => {
      const reviewStatus = finding.reviewStatus || finding.review_status || 'pending';
      return `<article class="discoverability-finding severity-${escapeHTML(String(finding.severity || 'info').toLowerCase())}" data-discoverability-finding="${escapeHTML(finding.id)}">
        <div class="discoverability-finding-heading"><span class="severity-badge">${escapeHTML(finding.severity)}</span><strong>${escapeHTML(finding.ruleId || finding.rule_id)}</strong><span class="review-state ${escapeHTML(reviewStatus)}">${escapeHTML(label(reviewStatus))}</span></div>
        <p>${escapeHTML(finding.message)}</p>
        ${finding.remediation ? `<small>${escapeHTML(finding.remediation)}</small>` : ''}
        ${finding.reviewReason || finding.review_reason ? `<small>Reviewer note: ${escapeHTML(finding.reviewReason || finding.review_reason)}</small>` : ''}
        <div class="discoverability-review-actions"><button type="button" class="text-button approve" data-discoverability-accept ${reviewStatus === 'accepted' ? 'disabled' : ''}>Keep as actionable</button><button type="button" class="text-button" data-discoverability-dismiss ${reviewStatus === 'dismissed' ? 'disabled' : ''}>Dismiss false positive</button></div>
      </article>`;
    }).join('')}</div>` : audit && audit.status !== 'unavailable' ? '<p class="empty-inline">No discoverability findings. The content package passed the configured advisory checks.</p>' : '<p class="empty-inline">Run DarkzSEO to create a versioned, reviewable audit for this production.</p>'}
  </section>`;
}

function renderSceneEditor(item, canReview = true) {
  const scenes = item.scenes || [];
  if (!scenes.length) return '';
  const verifiedSources = (item.provenance?.sources || []).filter(source => source.status === 'verified');
  const audio = item.assets?.audio || {};
  const intentionalSilence = audio.intentionalSilence === true;
  const narrationIssues = scenes.filter(scene => !['current', 'intentional_silence'].includes(scene.narrationStatus)).length;
  return `<section class="scene-repair-panel">
    <div class="panel-heading scene-heading">
      <div><p class="eyebrow">SCENE REPAIR STUDIO</p><h3>Repair the timeline, not the whole video</h3><p>Edit, replace, or regenerate one scene. Changes remain draft-only until the timeline is rebuilt and approved.</p></div>
      ${canReview ? `<button type="button" class="button primary small" data-rebuild-scenes="${escapeHTML(item.id)}">Rebuild final video</button>` : ''}
    </div>
    <div class="narration-recovery ${intentionalSilence ? 'intentional' : narrationIssues ? 'attention' : ''}">
      <div><p class="eyebrow">NARRATION RELIABILITY</p><strong>${intentionalSilence ? 'Intentional silence confirmed' : narrationIssues ? `${narrationIssues} scene${narrationIssues === 1 ? '' : 's'} need narration` : 'Narration evidence is current'}</strong>
      <p>${intentionalSilence ? escapeHTML(audio.silenceReason || '') : audio.error ? escapeHTML(audio.error) : 'Regenerate narration without replacing the scene visual. Approval remains blocked until audio is ready.'}</p>
      ${audio.provider ? `<span class="narration-evidence">${escapeHTML(audio.provider)}${audio.model ? ` · ${escapeHTML(audio.model)}` : ''}${audio.externalTaskId ? ` · task ${escapeHTML(audio.externalTaskId)}` : ''}</span>` : ''}</div>
      ${canReview ? intentionalSilence
        ? '<button type="button" class="button secondary small" data-require-narration>Require narration</button>'
        : '<button type="button" class="button secondary small" data-intentional-silence>Use intentional silence</button>' : ''}
    </div>
    <div class="scene-summary"><strong>${scenes.length} scenes</strong><span>${Math.round(scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0))}s timeline</span><span>${scenes.filter(scene => scene.status !== 'ready').length} pending repairs</span></div>
    <div class="scene-list">
      ${scenes.map((scene, index) => {
        const disabled = !canReview || scene.locked;
        const sourceIds = new Set(scene.provenanceSourceIds || []);
        const preview = scene.assetUrl
          ? scene.assetType === 'video'
            ? `<video controls preload="metadata"><source src="${escapeHTML(scene.assetUrl)}"></video>`
            : `<img src="${escapeHTML(scene.assetUrl)}" alt="${escapeHTML(scene.label)} scene asset">`
          : '<div class="preview-placeholder">No scene asset</div>';
        return `<article class="scene-card ${scene.locked ? 'locked' : ''}" data-scene-card="${escapeHTML(scene.id)}">
          <div class="scene-card-top">
            <div class="scene-preview">${preview}<span class="scene-number">${index + 1}</span></div>
            <div class="scene-identity">
              <div class="scene-status-row">${statusChip(scene.status)} ${statusChip(`narration_${scene.narrationStatus || 'unavailable'}`)}<span>r${scene.revision}</span></div>
              <label><span>Scene label</span><input data-scene-field="label" maxlength="120" value="${escapeHTML(scene.label)}" ${disabled ? 'disabled' : ''}></label>
              <label><span>Duration</span><input data-scene-field="duration" type="number" min="2" max="600" step="0.5" value="${escapeHTML(scene.duration)}" ${disabled ? 'disabled' : ''}></label>
            </div>
          </div>
          <label><span>Narration</span><textarea data-scene-field="scriptText" rows="4" maxlength="10000" ${disabled ? 'disabled' : ''}>${escapeHTML(scene.scriptText)}</textarea></label>
          <label><span>Visual prompt</span><textarea data-scene-field="prompt" rows="3" maxlength="2000" ${disabled ? 'disabled' : ''}>${escapeHTML(scene.prompt)}</textarea></label>
          ${verifiedSources.length ? `<fieldset class="source-checklist scene-sources" ${disabled ? 'disabled' : ''}><legend>Verified evidence linked to this narration</legend>${verifiedSources.map(source => `<label><input type="checkbox" data-scene-source value="${escapeHTML(source.id)}" ${sourceIds.has(source.id) ? 'checked' : ''}> ${escapeHTML(source.title)}</label>`).join('')}</fieldset>` : ''}
          <div class="scene-options">
            <label class="toggle"><input type="checkbox" data-scene-factual checked ${disabled ? 'disabled' : ''}><span></span> Narration changes may contain factual claims</label>
            <span>Visual: ${escapeHTML(scene.provider || 'local')} ${scene.model ? `· ${escapeHTML(scene.model)}` : ''}</span>
          </div>
          <div class="scene-narration-evidence"><span>Narration: ${escapeHTML(scene.narrationProvider || 'not generated')}${scene.narrationModel ? ` · ${escapeHTML(scene.narrationModel)}` : ''}${scene.narrationTaskId ? ` · task ${escapeHTML(scene.narrationTaskId)}` : ''}</span>${scene.narrationError ? `<span class="danger-text">${escapeHTML(scene.narrationError)}</span>` : ''}</div>
          ${canReview ? `<div class="scene-actions">
            <button type="button" class="text-button" data-scene-move="up" ${disabled || index === 0 ? 'disabled' : ''}>↑ Earlier</button>
            <button type="button" class="text-button" data-scene-move="down" ${disabled || index === scenes.length - 1 ? 'disabled' : ''}>↓ Later</button>
            <button type="button" class="text-button approve" data-scene-save ${disabled ? 'disabled' : ''}>Save scene</button>
            <button type="button" class="text-button" data-scene-narration ${disabled ? 'disabled' : ''}>Regenerate narration only</button>
            <button type="button" class="text-button" data-scene-regenerate ${disabled ? 'disabled' : ''}>Regenerate scene</button>
            <label class="text-button upload-button ${disabled ? 'disabled' : ''}">Replace asset<input type="file" data-scene-upload accept="image/png,image/jpeg,image/webp,video/mp4" ${disabled ? 'disabled' : ''}></label>
            <button type="button" class="text-button" data-scene-lock>${scene.locked ? 'Unlock' : 'Lock'}</button>
          </div>` : ''}
        </article>`;
      }).join('')}
    </div>
  </section>`;
}

function renderShortsStudio(item) {
  if (!item.assets?.finalVideo?.path || item.assets.finalVideo.simulated) return '';
  const clips = item.shorts || [];
  const parentApproved = item.review_status === 'approved';
  return `<section class="shorts-studio">
    <div class="panel-heading shorts-heading">
      <div><p class="eyebrow">SHORTS REPURPOSING STUDIO</p><h3>Turn one production into vertical reach</h3><p>Create local 9:16 excerpts with mobile captions. Drafts inherit the source production's evidence and still require separate approval.</p></div>
      <button type="button" class="button secondary small" data-propose-shorts="${escapeHTML(item.id)}">${clips.length ? 'Refresh drafts' : 'Create 3 Short drafts'}</button>
    </div>
    <div class="shorts-evidence ${parentApproved ? 'ready' : ''}">
      <span>${parentApproved ? '✓ Source production approved' : 'Source approval required before scheduling'}</span>
      <span>${escapeHTML(item.provenance?.status === 'verified' ? 'Evidence verified' : item.provenance?.status === 'not_required' ? 'No factual claims declared' : 'Evidence review incomplete')}</span>
      <span>Local render · no new provider call</span>
    </div>
    ${clips.length ? `<div class="shorts-grid">${clips.map(clip => {
      const locked = ['scheduled', 'uploading', 'published', 'reconciliation_required'].includes(clip.status);
      const rendered = Boolean(clip.assetUrls?.video);
      return `<article class="short-card" data-short-card="${escapeHTML(clip.id)}">
        <div class="short-preview">${rendered
          ? `<video controls preload="metadata"><source src="${escapeHTML(clip.assetUrls.video)}" type="video/mp4"></video>`
          : `<div class="short-placeholder"><strong>9:16</strong><span>${escapeHTML(label(clip.layout))} layout</span></div>`}</div>
        <div class="short-editor">
          <div class="scene-status-row">${statusChip(clip.status)}<span>${Number(clip.duration || 0).toFixed(0)}s</span><span>${escapeHTML((clip.sourceSceneLabels || []).join(' + '))}</span></div>
          <label><span>Short title</span><input data-short-field="title" maxlength="100" value="${escapeHTML(clip.title)}" ${locked ? 'disabled' : ''}></label>
          <label><span>Description and parent-video CTA</span><textarea data-short-field="description" rows="3" maxlength="5000" ${locked ? 'disabled' : ''}>${escapeHTML(clip.description)}</textarea></label>
          <label><span>Tags</span><input data-short-field="tags" value="${escapeHTML((clip.tags || []).join(', '))}" ${locked ? 'disabled' : ''}></label>
          <div class="form-grid two">
            <label><span>Vertical layout</span><select data-short-field="layout" ${locked ? 'disabled' : ''}><option value="blur" ${clip.layout === 'blur' ? 'selected' : ''}>Blurred canvas</option><option value="crop" ${clip.layout === 'crop' ? 'selected' : ''}>Center crop</option><option value="stacked" ${clip.layout === 'stacked' ? 'selected' : ''}>Stacked focus</option></select></label>
            <label><span>Publish time</span><input data-short-field="publishTime" type="datetime-local" value="${toLocalInput(clip.publishTime)}" ${locked ? 'disabled' : ''}></label>
            <label><span>Privacy</span><select data-short-field="privacyStatus" ${locked ? 'disabled' : ''}><option value="private" ${clip.privacyStatus === 'private' ? 'selected' : ''}>Private</option><option value="unlisted" ${clip.privacyStatus === 'unlisted' ? 'selected' : ''}>Unlisted</option><option value="public" ${clip.privacyStatus === 'public' ? 'selected' : ''}>Public</option></select></label>
          </div>
          <p class="short-rationale">${escapeHTML(clip.rationale || '')}${clip.error ? `<br><span class="danger-text">${escapeHTML(clip.error)}</span>` : ''}</p>
          ${clip.youtubeUrl ? `<a class="source-link" href="${escapeHTML(clip.youtubeUrl)}" target="_blank" rel="noopener">Open published Short ↗</a>` : ''}
          ${!locked ? `<div class="short-actions"><button type="button" class="text-button" data-short-save>Save draft</button><button type="button" class="button secondary small" data-short-render>${rendered ? 'Render again' : 'Render 9:16'}</button><button type="button" class="button primary small" data-short-approve ${!parentApproved || clip.status !== 'rendered' ? 'disabled' : ''} title="${!parentApproved ? 'Approve the source production first' : clip.status !== 'rendered' ? 'Render this Short first' : 'Confirm and schedule this Short'}">Approve &amp; schedule</button></div>` : ''}
        </div>
      </article>`;
    }).join('')}</div>` : '<p class="empty-inline">No Short drafts yet. Create three candidates from the current scene timeline without calling a paid provider.</p>'}
  </section>`;
}

async function openContent(productionId) {
  $('#loading').classList.add('active');
  try {
    const item = await api(`/api/content/${encodeURIComponent(productionId)}`);
    const data = item.editorData || {};
    const title = data.title || item.seo?.title || item.script?.title || item.strategy?.topic || 'Untitled content';
    const description = data.description || item.seo?.description || '';
    const tags = data.tags || item.seo?.tags || [];
    const publishTime = data.publishTime || item.schedule?.publish_time || item.scheduled_publish_time;
    const canReview = !['published'].includes(item.schedule?.status);
    const experiment = data.packagingExperiment;
    const selectedTitleVariant = Number(data.selectedTitleVariant || 0);
    const selectedThumbnailVariant = Number(data.selectedThumbnailVariant || 0);
    $('#content-detail').innerHTML = `
      <div class="dialog-heading"><div><p class="eyebrow">CONTENT REVIEW</p><h2>${escapeHTML(title)}</h2><div class="meta-line">${statusChip(item.schedule?.status || item.review_status || item.status)} · Quality ${qualityScore(item.qualityChecks)}%</div></div><button type="button" class="close-button" data-close>×</button></div>
      <form id="content-review-form" class="editor content-review-editor">
        <div class="content-layout">
          <div>
            <div class="preview">${item.assetUrls.video ? `<video controls preload="metadata" poster="${item.assetUrls.thumbnail || ''}"><source src="${item.assetUrls.video}" type="video/mp4"></video>` : item.assetUrls.thumbnail ? `<img src="${item.assetUrls.thumbnail}" alt="Generated thumbnail">` : '<div class="preview-placeholder">No playable preview was produced.</div>'}</div>
            <div class="quality-grid">${(item.qualityChecks || []).map(check => `<div class="quality-check ${check.passed ? 'pass' : 'fail'}">${check.passed ? '✓' : '×'} ${escapeHTML(check.message)}</div>`).join('') || '<div class="quality-check">No quality results recorded.</div>'}</div>
            ${item.review_notes ? `<p class="callout">${escapeHTML(item.review_notes)}</p>` : ''}
          </div>
          <div class="editor">
            <label><span>Title</span><input name="title" maxlength="100" value="${escapeHTML(title)}" required></label>
            <label><span>Description</span><textarea name="description" rows="7">${escapeHTML(description)}</textarea></label>
            <label><span>Tags</span><input name="tags" value="${escapeHTML(tags.join(', '))}"></label>
            ${experiment ? `<section class="experiment-panel">
              <div><p class="eyebrow">APPROVED LEARNING EXPERIMENT</p><strong>${escapeHTML(experiment.hypothesis)}</strong><p>Choose the packaging to ship. Nothing changes on YouTube until this content is approved and published.</p></div>
              <label><span>Title variant</span><select name="selectedTitleVariant">${experiment.titleVariants.map((variant, index) => `<option value="${index}" data-title="${escapeHTML(variant.title)}" ${index === selectedTitleVariant ? 'selected' : ''}>${escapeHTML(variant.label)} — ${escapeHTML(variant.title)}</option>`).join('')}</select></label>
              <div class="experiment-thumbnails">${experiment.thumbnailVariants.map((variant, index) => `<label class="experiment-thumb ${index === selectedThumbnailVariant ? 'selected' : ''}"><input type="radio" name="selectedThumbnailVariant" value="${index}" ${index === selectedThumbnailVariant ? 'checked' : ''}><img src="${escapeHTML(item.assetUrls.experimentThumbnails?.[index] || '')}" alt="${escapeHTML(variant.label)} thumbnail variant"><span>${escapeHTML(variant.label)}</span></label>`).join('')}</div>
            </section>` : ''}
          </div>
        </div>
        ${renderSceneEditor(item, canReview)}
        ${renderShortsStudio(item)}
        ${renderDiscoverabilityPanel(item)}
        ${renderProvenanceEditor(item.provenance, canReview)}
          <div class="form-grid two">
            <label><span>Publish time</span><input name="publishTime" type="datetime-local" value="${toLocalInput(publishTime)}"></label>
            <label><span>Privacy</span><select name="privacyStatus"><option value="private" ${data.privacyStatus === 'private' ? 'selected' : ''}>Private</option><option value="unlisted" ${data.privacyStatus === 'unlisted' ? 'selected' : ''}>Unlisted</option><option value="public" ${data.privacyStatus === 'public' ? 'selected' : ''}>Public</option></select></label>
          </div>
          <div class="settings-row">
            <label class="toggle"><input name="factChecked" type="checkbox" ${data.factChecked ? 'checked' : ''}><span></span> Facts and claims reviewed</label>
            <label class="toggle"><input name="rightsConfirmed" type="checkbox" ${data.rightsConfirmed ? 'checked' : ''}><span></span> Media rights confirmed</label>
          </div>
          ${canReview ? `<div class="form-actions"><button type="button" class="button primary" data-approve-content="${escapeHTML(item.id)}">Approve & schedule</button><button type="button" class="button secondary" data-save-content="${escapeHTML(item.id)}">Save draft</button><button type="button" class="button danger" data-reject-content="${escapeHTML(item.id)}">Reject</button><button type="button" class="button ghost" data-retry-content="${escapeHTML(item.id)}">Regenerate</button></div>` : `<a class="button secondary" href="${escapeHTML(item.schedule?.youtube_url || '#')}" target="_blank" rel="noopener">Open on YouTube</a>`}
      </form>`;
    $('#content-review-form').dataset.productionId = item.id;
    $('#content-dialog').showModal();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    $('#loading').classList.remove('active');
  }
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return escapeHTML(new Date(date.getTime() - offset).toISOString().slice(0, 16));
}

function contentFormData() {
  const form = $('#content-review-form');
  const values = Object.fromEntries(new FormData(form));
  return {
    title: values.title,
    description: values.description,
    tags: values.tags,
    publishTime: values.publishTime ? new Date(values.publishTime).toISOString() : undefined,
    privacyStatus: values.privacyStatus,
    selectedTitleVariant: values.selectedTitleVariant,
    selectedThumbnailVariant: values.selectedThumbnailVariant,
    factChecked: form.elements.factChecked?.checked || false,
    rightsConfirmed: form.elements.rightsConfirmed?.checked || false
  };
}

function sceneFormData(card) {
  return {
    label: card.querySelector('[data-scene-field="label"]').value,
    duration: Number(card.querySelector('[data-scene-field="duration"]').value),
    scriptText: card.querySelector('[data-scene-field="scriptText"]').value,
    prompt: card.querySelector('[data-scene-field="prompt"]').value,
    provenanceSourceIds: Array.from(card.querySelectorAll('[data-scene-source]:checked')).map(input => input.value),
    factualChange: card.querySelector('[data-scene-factual]')?.checked !== false
  };
}

function shortFormData(card) {
  const publishTime = card.querySelector('[data-short-field="publishTime"]')?.value;
  return {
    title: card.querySelector('[data-short-field="title"]')?.value,
    description: card.querySelector('[data-short-field="description"]')?.value,
    tags: card.querySelector('[data-short-field="tags"]')?.value,
    layout: card.querySelector('[data-short-field="layout"]')?.value,
    publishTime: publishTime ? new Date(publishTime).toISOString() : undefined,
    privacyStatus: card.querySelector('[data-short-field="privacyStatus"]')?.value
  };
}

async function refreshContentDialog(productionId, message) {
  if (message) showToast(message);
  if ($('#content-dialog').open) $('#content-dialog').close();
  await refreshDashboard(true);
  await openContent(productionId);
}

async function uploadSceneAsset(productionId, sceneId, file) {
  if (!confirm('Confirm you own or have permission to use this replacement asset.')) return;
  const synthetic = confirm('Does this replacement contain realistic altered or synthetic media that should be disclosed to YouTube?');
  $('#loading').classList.add('active');
  try {
    await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/asset`, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
        'x-file-name': file.name,
        'x-rights-confirmed': 'true',
        'x-synthetic-media': String(synthetic)
      }
    });
    await refreshContentDialog(productionId, 'Scene asset replaced. Rebuild before approval.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    $('#loading').classList.remove('active');
  }
}

function provenanceFormData() {
  const sources = $$('[data-provenance-source]').map(item => ({
    id: item.dataset.id,
    url: item.querySelector('[data-field="url"]').value,
    title: item.querySelector('[data-field="title"]').value,
    publisher: item.querySelector('[data-field="publisher"]').value,
    sourceType: item.querySelector('[data-field="sourceType"]').value,
    status: item.querySelector('[data-field="status"]').value,
    notes: item.querySelector('[data-field="notes"]').value,
    publishedAt: item.dataset.publishedAt || null,
    accessedAt: item.dataset.accessedAt || null
  }));
  const claims = $$('[data-provenance-claim]').map(item => ({
    id: item.dataset.id,
    text: item.querySelector('[data-field="text"]').value,
    riskLevel: item.querySelector('[data-field="riskLevel"]').value,
    status: item.querySelector('[data-field="status"]').value,
    notes: item.querySelector('[data-field="notes"]').value,
    sourceIds: [...item.querySelectorAll('[data-claim-source]:checked')].map(input => input.dataset.claimSource)
  }));
  return {
    sources,
    claims,
    containsSyntheticMedia: $('#contains-synthetic-media')?.checked || false
  };
}

function clientId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function currentSourceOptions() {
  return $$('[data-provenance-source]').map(item => ({
    id: item.dataset.id,
    title: item.querySelector('[data-field="title"]').value || item.querySelector('[data-field="url"]').value || 'New source'
  }));
}

async function persistProvenance(productionId, successMessage = null) {
  $('#loading').classList.add('active');
  try {
    const result = await api(`/api/content/${encodeURIComponent(productionId)}/provenance`, {
      method: 'PUT',
      body: JSON.stringify(provenanceFormData())
    });
    if (successMessage) {
      showToast(successMessage);
      $('#content-dialog').close();
      await openContent(productionId);
    }
    return result;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  } finally {
    $('#loading').classList.remove('active');
  }
}

async function mutate(url, method, body, successMessage) {
  $('#loading').classList.add('active');
  try {
    const result = await api(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    showToast(successMessage);
    await refreshDashboard(true);
    return result;
  } catch (error) {
    const failures = error.data?.quality?.blockingFailures;
    showToast(failures ? `${error.message}: ${failures.join(', ')}` : error.message, 'error');
    throw error;
  } finally {
    $('#loading').classList.remove('active');
  }
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]');
  if (nav) return switchView(nav.dataset.view);
  const go = event.target.closest('[data-go]');
  if (go) return switchView(go.dataset.go);
  if (event.target.closest('[data-close]')) return event.target.closest('dialog').close();

  const open = event.target.closest('[data-open-content]');
  if (open) return openContent(open.dataset.openContent);

  const cancel = event.target.closest('[data-cancel-job]');
  if (cancel && confirm('Cancel this generation job after its current stage?')) {
    await mutate(`/api/jobs/${encodeURIComponent(cancel.dataset.cancelJob)}/cancel`, 'POST', {}, 'Cancellation requested.').catch(() => {});
  }

  const idea = event.target.closest('[data-generate-idea]');
  if (idea) {
    await mutate(`/api/ideas/${encodeURIComponent(idea.dataset.generateIdea)}/generate`, 'POST', { length: 'medium' }, 'Idea queued for generation.').catch(() => {});
  }

  const resume = event.target.closest('[data-resume-job]');
  if (resume) {
    const jobId = resume.dataset.resumeJob;
    const select = $$('[data-resume-stage-for]').find(item => item.dataset.resumeStageFor === jobId);
    const stage = select?.value;
    if (confirm(`Resume this job from ${label(stage)}? Later checkpoints will be regenerated.`)) {
      await mutate(`/api/jobs/${encodeURIComponent(jobId)}/resume`, 'POST', { stage }, `Generation resumed from ${label(stage)}.`).catch(() => {});
    }
  }

  const learning = event.target.closest('[data-learning-action]');
  if (learning) {
    const action = learning.dataset.learningAction;
    const id = learning.dataset.learningId;
    const message = action === 'approve'
      ? 'Learning approved for future autonomous plans.'
      : 'Learning rejected and excluded from future plans.';
    await mutate(`/api/learning/recommendations/${encodeURIComponent(id)}/${action}`, 'POST', {}, message).catch(() => {});
  }

  const experiment = event.target.closest('[data-experiment-action]');
  if (experiment) {
    const action = experiment.dataset.experimentAction;
    const id = experiment.dataset.experimentId;
    const prompts = {
      approve: 'Approve this complete experiment plan? This does not change YouTube yet.',
      start: 'Start this live test? Lumen will rotate only the approved arms and restore the control before asking you to adopt a winner.',
      adopt: 'Adopt the evidence-backed winner on YouTube and approve its learning for future plans?',
      cancel: 'Cancel this experiment and restore the control title and thumbnail?'
    };
    if (prompts[action] && !confirm(prompts[action])) return;
    const messages = {
      approve: 'Experiment plan approved.',
      start: 'Controlled experiment started.',
      refresh: 'Experiment evidence refreshed.',
      adopt: 'Winner adopted and approved for future planning.',
      cancel: 'Experiment cancelled and control restored.'
    };
    await mutate(`/api/experiments/${encodeURIComponent(id)}/${action}`, 'POST', prompts[action] ? { confirmed: true } : {}, messages[action]).catch(() => {});
  }

  const refreshRetention = event.target.closest('#refresh-retention-button');
  if (refreshRetention?.dataset.videoId) {
    refreshRetention.disabled = true;
    try {
      await api(`/api/retention/${encodeURIComponent(refreshRetention.dataset.videoId)}/refresh`, {
        method: 'POST',
        body: JSON.stringify({ measurementWindow: refreshRetention.dataset.measurementWindow || 'rolling' })
      });
      showToast('Retention curve refreshed from YouTube Analytics.');
      await refreshDashboard(true);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      refreshRetention.disabled = false;
    }
  }

  const syncEngagement = event.target.closest('#engagement-sync-button');
  if (syncEngagement?.dataset.videoId) {
    syncEngagement.disabled = true;
    try {
      await mutate(`/api/engagement/${encodeURIComponent(syncEngagement.dataset.videoId)}/sync`, 'POST', { analyze: true }, 'Comments synced from YouTube.');
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    } catch (_error) { /* toast shown */ } finally {
      syncEngagement.disabled = false;
    }
  }

  const draftEngagement = event.target.closest('#engagement-draft-button');
  if (draftEngagement?.dataset.videoId) {
    draftEngagement.disabled = true;
    try {
      await mutate(`/api/engagement/${encodeURIComponent(draftEngagement.dataset.videoId)}/draft-replies`, 'POST', {}, 'Reply drafts created for review.');
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    } catch (_error) { /* toast shown */ } finally {
      draftEngagement.disabled = false;
    }
  }

  const replySave = event.target.closest('[data-reply-save]');
  if (replySave) {
    const card = replySave.closest('[data-reply-card]');
    const text = card?.querySelector('[data-reply-text]')?.value || '';
    await mutate(`/api/engagement/replies/${encodeURIComponent(replySave.dataset.replySave)}`, 'PATCH', { editedText: text }, 'Reply draft updated.').catch(() => {});
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }

  const replyDiscard = event.target.closest('[data-reply-discard]');
  if (replyDiscard) {
    await mutate(`/api/engagement/replies/${encodeURIComponent(replyDiscard.dataset.replyDiscard)}`, 'PATCH', { discard: true }, 'Reply draft discarded.').catch(() => {});
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }

  const replyApprove = event.target.closest('[data-reply-approve]');
  if (replyApprove) {
    const card = replyApprove.closest('[data-reply-card]');
    const text = card?.querySelector('[data-reply-text]')?.value || '';
    if (!text.trim()) return showToast('Reply text is empty.', 'error');
    if (confirm(`Post this reply to YouTube?\n\n${text}`)) {
      await mutate(`/api/engagement/replies/${encodeURIComponent(replyApprove.dataset.replyApprove)}/approve`, 'POST', { confirmed: true, editedText: text }, 'Reply posted to YouTube.').catch(() => {});
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    }
  }

  const proposeShorts = event.target.closest('[data-propose-shorts]');
  if (proposeShorts) {
    const productionId = proposeShorts.dataset.proposeShorts;
    const replacing = Boolean(document.querySelector('[data-short-card]'));
    if (replacing && !confirm('Replace the current editable Short drafts? Rendered draft files will remain on disk but their manifest will be replaced.')) return;
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/propose`, {
        method: 'POST', body: JSON.stringify({ count: 3, replace: replacing })
      });
      await refreshContentDialog(productionId, 'Three local Short drafts created from the current scene timeline.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const discoverabilityRun = event.target.closest('[data-discoverability-run]');
  if (discoverabilityRun) {
    const productionId = discoverabilityRun.dataset.discoverabilityRun;
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/discoverability/run`, {
        method: 'POST', body: JSON.stringify({ platform: 'youtube' })
      });
      await refreshContentDialog(productionId, 'Discoverability preflight refreshed. Findings remain advisory until reviewed.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const discoverabilityReview = event.target.closest('[data-discoverability-accept], [data-discoverability-dismiss]');
  if (discoverabilityReview) {
    const card = discoverabilityReview.closest('[data-discoverability-finding]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (!card || !productionId) return;
    const status = discoverabilityReview.matches('[data-discoverability-dismiss]') ? 'dismissed' : 'accepted';
    const reason = status === 'dismissed'
      ? (prompt('Why is this finding a false positive? The reason will be retained on future matching audits.') || '')
      : '';
    if (status === 'dismissed' && !reason) return;
    try {
      await api(`/api/discoverability/findings/${encodeURIComponent(card.dataset.discoverabilityFinding)}`, {
        method: 'PATCH', body: JSON.stringify({ status, reason })
      });
      await refreshContentDialog(productionId, status === 'dismissed' ? 'Finding dismissed with reviewer evidence.' : 'Finding kept as an actionable recommendation.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const shortAction = event.target.closest('[data-short-save], [data-short-render], [data-short-approve]');
  if (shortAction) {
    const card = shortAction.closest('[data-short-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    const clipId = card?.dataset.shortCard;
    if (!productionId || !clipId) return;
    try {
      const values = shortFormData(card);
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}`, {
        method: 'PATCH', body: JSON.stringify(values)
      });
      if (shortAction.matches('[data-short-save]')) {
        await refreshContentDialog(productionId, 'Short draft saved.');
        return;
      }
      if (shortAction.matches('[data-short-render]')) {
        await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}/render`, {
          method: 'POST', body: '{}'
        });
        await refreshContentDialog(productionId, 'Vertical Short rendered locally with mobile captions.');
        return;
      }
      if (!confirm('Confirm the inherited evidence, media rights, privacy, and publish time for this Short?')) return;
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}/approve`, {
        method: 'POST', body: JSON.stringify({ ...values, confirmed: true })
      });
      await refreshContentDialog(productionId, 'Short approved and added to the publishing schedule.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const sceneButton = event.target.closest('[data-scene-save], [data-scene-narration], [data-scene-regenerate], [data-scene-lock], [data-scene-move]');
  if (sceneButton) {
    const card = sceneButton.closest('[data-scene-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    const sceneId = card?.dataset.sceneCard;
    if (!productionId || !sceneId) return;
    try {
      if (sceneButton.matches('[data-scene-lock]')) {
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}`, {
          method: 'PATCH', body: JSON.stringify({ locked: !card.classList.contains('locked') })
        });
        await refreshContentDialog(productionId, card.classList.contains('locked') ? 'Scene unlocked.' : 'Scene locked.');
        return;
      }
      if (sceneButton.matches('[data-scene-move]')) {
        const cards = $$('[data-scene-card]');
        const index = cards.indexOf(card);
        const target = sceneButton.dataset.sceneMove === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= cards.length) return;
        const ids = cards.map(item => item.dataset.sceneCard);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/reorder`, {
          method: 'POST', body: JSON.stringify({ sceneIds: ids })
        });
        await refreshContentDialog(productionId, 'Timeline order updated. Rebuild before approval.');
        return;
      }
      await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}`, {
        method: 'PATCH', body: JSON.stringify(sceneFormData(card))
      });
      if (sceneButton.matches('[data-scene-save]')) {
        await refreshContentDialog(productionId, 'Scene draft saved.');
        return;
      }
      if (sceneButton.matches('[data-scene-narration]')) {
        if (!confirm('Regenerate narration for only this scene? This may consume TTS provider credits; the provider invoice is authoritative.')) return;
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/narration`, {
          method: 'POST', body: JSON.stringify({ confirmCost: true })
        });
        await refreshContentDialog(productionId, 'Scene narration regenerated. Rebuild the final video when every narration segment is ready.');
        return;
      }
      const estimate = await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/estimate`);
      const message = estimate.paid
        ? `Regenerate only this scene with ${estimate.provider} (${estimate.generatedSeconds}s). This consumes provider credits; the provider invoice is authoritative. Continue?`
        : 'Regenerate only this scene with the configured image provider? A live image request may consume provider credits. Continue?';
      if (!confirm(message)) return;
      await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/regenerate`, {
        method: 'POST', body: JSON.stringify({ confirmPaid: estimate.paid })
      });
      await refreshContentDialog(productionId, 'Scene regenerated. Rebuild the final video when the timeline is ready.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const silenceAction = event.target.closest('[data-intentional-silence], [data-require-narration]');
  if (silenceAction) {
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (!productionId) return;
    const enabled = silenceAction.matches('[data-intentional-silence]');
    let reason = '';
    if (enabled) {
      reason = prompt('Why is this production intentionally silent? This reason is stored with the approval evidence.') || '';
      if (!reason) return;
      if (!confirm('Confirm that this production is intentionally silent. Captions and visuals will remain, and approval will record this override.')) return;
    } else if (!confirm('Require narration again? Approval will be blocked until missing scene narration is regenerated and the video is rebuilt.')) {
      return;
    }
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/narration/silence`, {
        method: 'POST', body: JSON.stringify({ enabled, confirmed: enabled, reason })
      });
      await refreshContentDialog(productionId, enabled ? 'Intentional silence recorded. Rebuild before approval.' : 'Narration is required again.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const rebuildScenes = event.target.closest('[data-rebuild-scenes]');
  if (rebuildScenes) {
    const productionId = rebuildScenes.dataset.rebuildScenes;
    if (confirm('Rebuild a new final MP4 from the current scene timeline? The previous final video will be preserved.')) {
      try {
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/rebuild`, { method: 'POST', body: '{}' });
        await refreshContentDialog(productionId, 'Final video rebuilt from the repaired timeline. Review it before approval.');
      } catch (error) {
        showToast(error.message, 'error');
      }
    }
    return;
  }

  const addSource = event.target.closest('[data-add-provenance-source]');
  if (addSource) {
    const list = $('#provenance-sources');
    list.querySelector('.empty-inline')?.remove();
    list.insertAdjacentHTML('beforeend', renderSourceEditor({ id: clientId('source') }));
    return;
  }

  const addClaim = event.target.closest('[data-add-provenance-claim]');
  if (addClaim) {
    const list = $('#provenance-claims');
    list.querySelector('.empty-inline')?.remove();
    list.insertAdjacentHTML('beforeend', renderClaimEditor({ id: clientId('claim') }, currentSourceOptions()));
    return;
  }

  const removeProvenance = event.target.closest('[data-remove-provenance]');
  if (removeProvenance) {
    removeProvenance.closest('.provenance-item')?.remove();
    return;
  }

  const saveProvenance = event.target.closest('[data-save-provenance]');
  if (saveProvenance) {
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (productionId) await persistProvenance(productionId, 'Evidence review saved.').catch(() => {});
    return;
  }

  const save = event.target.closest('[data-save-content]');
  if (save) {
    try {
      await persistProvenance(save.dataset.saveContent);
      await mutate(`/api/content/${encodeURIComponent(save.dataset.saveContent)}`, 'PATCH', contentFormData(), 'Draft and evidence review saved.');
    } catch (_error) { /* toast already shown */ }
  }

  const approve = event.target.closest('[data-approve-content]');
  if (approve) {
    try {
      await persistProvenance(approve.dataset.approveContent);
      await mutate(`/api/content/${encodeURIComponent(approve.dataset.approveContent)}/approve`, 'POST', contentFormData(), 'Content approved and scheduled.');
      $('#content-dialog').close();
    } catch (_error) { /* toast already shown */ }
  }

  const reject = event.target.closest('[data-reject-content]');
  if (reject) {
    const notes = prompt('Why are you rejecting this content?', 'Needs a different angle');
    if (notes !== null) {
      await mutate(`/api/content/${encodeURIComponent(reject.dataset.rejectContent)}/reject`, 'POST', { notes }, 'Content rejected.').catch(() => {});
      $('#content-dialog').close();
    }
  }

  const retry = event.target.closest('[data-retry-content]');
  if (retry && confirm('Generate a fresh version using the same topic?')) {
    await mutate(`/api/content/${encodeURIComponent(retry.dataset.retryContent)}/retry`, 'POST', {}, 'Regeneration started.').catch(() => {});
    $('#content-dialog').close();
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('#retention-snapshot-select')) {
    ui.retentionSnapshotId = event.target.value;
    renderRetention(ui.state?.learning?.retention || {});
  }
  if (event.target.matches('#engagement-video-select')) {
    ui.engagementVideoId = event.target.value;
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }
  if (event.target.matches('[name="selectedTitleVariant"]')) {
    const title = event.target.selectedOptions[0]?.dataset.title;
    const input = $('#content-review-form [name="title"]');
    if (title && input) input.value = title;
  }
  if (event.target.matches('[data-scene-upload]')) {
    const file = event.target.files?.[0];
    const card = event.target.closest('[data-scene-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (file && card && productionId) {
      uploadSceneAsset(productionId, card.dataset.sceneCard, file);
    }
  }
});

$('#generate-button').addEventListener('click', () => $('#generate-dialog').showModal());
$('#add-idea-button').addEventListener('click', () => $('#idea-dialog').showModal());
$('#refresh-button').addEventListener('click', () => refreshDashboard());
$('#pipeline-filter').addEventListener('change', () => renderPipeline(ui.state?.pipeline || []));

$('#experiment-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  await mutate('/api/experiments', 'POST', {
    productionId: values.productionId,
    armDurationHours: Number(values.armDurationHours),
    minImpressions: Number(values.minImpressions)
  }, 'Draft growth experiment created for review.').catch(() => {});
});

$('#run-readiness-button').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Running live checks…';
  try {
    await mutate('/api/readiness/run', 'POST', {
      includePaidMedia: $('#paid-image-probe').checked,
      includePaidVideo: $('#paid-video-probe').checked
    }, 'Production readiness check completed.');
    switchView('readiness');
  } catch (_error) { /* toast already shown */ }
  finally {
    button.disabled = false;
    button.textContent = 'Run verified check';
  }
});

$('#automation-toggle').addEventListener('click', async () => {
  const action = ui.state?.system.automationPaused ? 'resume' : 'pause';
  await mutate(`/api/automation/${action}`, 'POST', {}, `Automation ${action}d.`).catch(() => {});
});

function strategyFormData(status = ui.state?.channelStrategy?.status || 'draft') {
  const form = $('#strategy-form');
  const values = Object.fromEntries(new FormData(form));
  return {
    ...values,
    contentPillars: values.contentPillars.split(',').map(value => value.trim()).filter(Boolean),
    cadencePerWeek: Number(values.cadencePerWeek),
    videosPerRun: Number(values.videosPerRun),
    targetValue: values.targetValue === '' ? null : Number(values.targetValue),
    targetWindowDays: Number(values.targetWindowDays),
    monthlyBudget: values.monthlyBudget === '' ? null : Number(values.monthlyBudget),
    status
  };
}

$('#strategy-form').addEventListener('submit', async event => {
  event.preventDefault();
  await mutate('/api/operator/strategy', 'PUT', strategyFormData(), 'Channel strategy saved.').catch(() => {});
});

$('#activate-operator-button').addEventListener('click', async () => {
  if (!$('#strategy-form').reportValidity()) return;
  await mutate('/api/operator/start', 'POST', strategyFormData('active'), 'Autonomous operator started.').catch(() => {});
});

$('#pause-operator-button').addEventListener('click', async () => {
  await mutate('/api/operator/pause', 'POST', {}, 'Autonomous operator paused.').catch(() => {});
});

$('#cancel-operator-run').addEventListener('click', async event => {
  const runId = event.currentTarget.dataset.runId;
  if (runId && confirm('Stop this autonomous run after the current agent stage?')) {
    await mutate(`/api/operator/runs/${encodeURIComponent(runId)}/cancel`, 'POST', {}, 'Operator stop requested.').catch(() => {});
  }
});

$('#resume-operator-run').addEventListener('click', async event => {
  const runId = event.currentTarget.dataset.runId;
  if (runId && confirm('Resume this operator run from its saved editorial plan and generation checkpoints?')) {
    await mutate(`/api/operator/runs/${encodeURIComponent(runId)}/resume`, 'POST', {}, 'Autonomous operator resumed.').catch(() => {});
  }
});

$('#generate-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await mutate('/generate', 'POST', { ...values, topic: values.topic.trim() || null }, 'Generation job started.');
    $('#generate-dialog').close();
    event.currentTarget.reset();
  } catch (_error) { /* toast already shown */ }
});

$('#idea-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await mutate('/api/ideas', 'POST', values, 'Idea added to the backlog.');
    $('#idea-dialog').close();
    event.currentTarget.reset();
  } catch (_error) { /* toast already shown */ }
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.bannedTopics = values.bannedTopics.split(',').map(value => value.trim()).filter(Boolean);
  try {
    await mutate('/api/profile', 'PUT', values, 'Channel setup saved.');
    await mutate('/api/settings', 'PUT', {
      approval_required: $('#approval-required').checked,
      notification_enabled: $('#notifications-enabled').checked,
      channel_timezone: values.timezone,
      video_provider: values.videoProvider,
      video_generation_mode: values.videoGenerationMode,
      video_clip_duration: Number(values.videoClipDuration),
      video_max_generated_seconds: Number(values.videoMaxGeneratedSeconds)
    }, 'Operator settings saved.');
  } catch (_error) { /* toast already shown */ }
});

$('#api-key-button').addEventListener('click', () => {
  if (requestApiKey() !== null) showToast('Dashboard API key saved in this browser.');
});

const initialView = location.hash.slice(1);
if (['overview', 'operator', 'pipeline', 'calendar', 'analytics', 'engagement', 'readiness', 'settings'].includes(initialView)) switchView(initialView);
refreshDashboard();
setInterval(() => refreshDashboard(true), 8000);
