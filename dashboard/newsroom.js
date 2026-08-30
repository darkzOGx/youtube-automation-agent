/* global ui, escapeHTML, timeAgo, statusChip, empty, formatDate, api, mutate, label */

function newsroomState() {
  return (typeof ui !== 'undefined' && ui.state && ui.state.newsroom) || { events: [], counts: {}, health: [], latestRun: null, config: {} };
}

function renderNewsroom(newsroom = newsroomState()) {
  const counts = newsroom.counts || {};
  const enabled = newsroom.enabled === true;
  const badge = document.getElementById('newsroom-badge');
  if (badge) {
    const actionable = Number(counts.breaking || 0) + Number(counts.conflicted || 0);
    badge.textContent = actionable;
    badge.classList.toggle('hidden', !actionable);
  }
  const enabledStatus = document.getElementById('newsroom-enabled-status');
  if (enabledStatus) {
    enabledStatus.className = `status ${enabled ? 'passed' : 'unverified'}`;
    enabledStatus.textContent = enabled ? 'scheduled scans on' : 'manual scans only';
  }
  const stats = document.getElementById('newsroom-stats');
  if (stats) {
    stats.innerHTML = [
      ['Events', counts.total || 0, 'in radar'],
      ['Verified', counts.verified || 0, 'ready to route'],
      ['Breaking desk', counts.breaking || 0, 'needs primary + approval'],
      ['Conflicts', counts.conflicted || 0, 'human review']
    ].map(([label, value, hint]) => `<article class="stat"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(hint)}</small></article>`).join('');
  }

  const filter = document.getElementById('newsroom-filter')?.value || '';
  const events = (newsroom.events || []).filter(event => {
    if (!filter) return true;
    if (filter === 'rejected') return event.status === 'rejected';
    return event.content_route === filter || event.status === filter;
  });
  const list = document.getElementById('newsroom-events');
  if (list) {
    list.innerHTML = events.length ? events.map(event => `
      <article class="job-card" data-newsroom-open="${escapeHTML(event.id)}">
        <div>
          <strong>${escapeHTML(event.title)}</strong>
          <p>${escapeHTML(event.company || event.publisher || 'Unattributed')} · ${escapeHTML(timeAgo(event.event_at || event.created_at))}</p>
        </div>
        <div class="job-meta">
          ${statusChip(event.verification_status)}
          ${statusChip(event.content_route || event.status)}
          <span class="status">${escapeHTML(event.score || 0)}</span>
        </div>
      </article>
    `).join('') : empty('No newsroom events yet. Run a scan.');
  }

  const health = document.getElementById('newsroom-health');
  if (health) {
    const rows = newsroom.health || [];
    health.innerHTML = rows.length ? rows.map(item => `
      <article class="job-card">
        <div><strong>${escapeHTML(item.source_id)}</strong><p>${escapeHTML(item.adapter || '')} · ${escapeHTML(item.items_collected || 0)} items · ${escapeHTML(item.latency_ms || 0)}ms</p></div>
        ${statusChip(item.status)}
      </article>
    `).join('') : empty('No adapter health yet.');
  }

  const runs = document.getElementById('newsroom-runs');
  if (runs) {
    const history = newsroom.runs && newsroom.runs.length ? newsroom.runs : (newsroom.latestRun ? [newsroom.latestRun] : []);
    runs.innerHTML = history.length ? history.map(run => `
      <div class="timeline-item">
        <strong>${escapeHTML(run.run_type)} · ${escapeHTML(run.status)}</strong>
        <p>${escapeHTML(run.signals_scanned || 0)} signals · ${escapeHTML(run.events_created || 0)} created · ${escapeHTML(run.events_merged || 0)} merged · ${escapeHTML(run.ideas_created || 0)} ideas</p>
        <small>${escapeHTML(formatDate(run.started_at))}${run.finished_at ? ` → ${escapeHTML(formatDate(run.finished_at))}` : ''}</small>
      </div>
    `).join('') : empty('No newsroom runs recorded.');
  }
}

async function openNewsroomEvent(eventId) {
  const detail = document.getElementById('newsroom-detail');
  const title = document.getElementById('newsroom-detail-title');
  const status = document.getElementById('newsroom-detail-status');
  if (!detail) return;
  detail.innerHTML = empty('Loading event…');
  try {
    const payload = await api(`/api/newsroom/events/${encodeURIComponent(eventId)}`);
    const bundle = payload.result;
    const event = bundle.event;
    const sources = bundle.sources || [];
    const score = bundle.score || {};
    const research = bundle.research || {};
    if (title) title.textContent = event.title;
    if (status) {
      status.className = `status ${escapeHTML(event.verification_status || 'unknown')}`;
      status.textContent = label(event.verification_status || event.status);
    }
    detail.innerHTML = `
      <p>${escapeHTML(event.summary || research.research_summary || 'No summary yet.')}</p>
      <div class="meta-line">${escapeHTML(event.company || 'Unknown company')} · ${escapeHTML(event.event_type || 'other')} · score ${escapeHTML(event.score || 0)} · ${escapeHTML(event.content_route || 'unrouted')}</div>
      <h3>Sources</h3>
      ${(sources.map(source => `<article class="provenance-item"><strong>T${escapeHTML(source.source_tier)} · ${escapeHTML(source.publisher || '')}</strong><p><a href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">${escapeHTML(source.title || source.url)}</a></p><small>${source.discovery_only ? 'discovery only · ' : ''}${escapeHTML(source.source_type || '')}</small></article>`).join('') || empty('No sources'))}
      <h3>Score breakdown</h3>
      <p>Fresh ${escapeHTML(score.freshness_score ?? '—')} · Authority ${escapeHTML(score.authority_score ?? '—')} · Impact ${escapeHTML(score.impact_score ?? '—')} · Trend ${escapeHTML(score.trend_score ?? '—')} · Fit ${escapeHTML(score.audience_fit_score ?? '—')} · Verification ${escapeHTML(score.verification_score ?? '—')}</p>
      <h3>Research</h3>
      <p>${escapeHTML(research.research_summary || 'Research has not been generated.')}</p>
      ${(research.conflicts || []).length ? `<p class="callout">Conflicts: ${escapeHTML(JSON.stringify(research.conflicts))}</p>` : ''}
      <div class="form-actions wrap">
        <button class="button secondary small" data-newsroom-action="verify" data-id="${escapeHTML(event.id)}">Verify</button>
        <button class="button secondary small" data-newsroom-action="research" data-id="${escapeHTML(event.id)}">Research</button>
        <button class="button secondary small" data-newsroom-action="create-idea" data-id="${escapeHTML(event.id)}">Create idea</button>
        <button class="button primary small" data-newsroom-action="approve" data-id="${escapeHTML(event.id)}">Approve</button>
        <button class="button ghost small" data-newsroom-action="hold" data-id="${escapeHTML(event.id)}">Hold</button>
        <button class="button danger small" data-newsroom-action="reject" data-id="${escapeHTML(event.id)}">Reject</button>
        <select data-newsroom-route="${escapeHTML(event.id)}" aria-label="Change route">
          ${['breaking', 'ai_today', 'tutorial', 'review', 'comparison', 'weekly_digest', 'watchlist', 'ignore'].map(route =>
            `<option value="${route}" ${event.content_route === route ? 'selected' : ''}>${route}</option>`
          ).join('')}
        </select>
        <button class="button ghost small" data-newsroom-action="downgrade" data-id="${escapeHTML(event.id)}">Downgrade to AI Today</button>
      </div>
    `;
    detail.dataset.eventId = event.id;
  } catch (error) {
    detail.innerHTML = empty(error.message);
  }
}

document.addEventListener('click', async event => {
  const open = event.target.closest('[data-newsroom-open]');
  if (open) {
    await openNewsroomEvent(open.dataset.newsroomOpen);
    return;
  }
  const scan = event.target.closest('#newsroom-scan-button');
  if (scan) {
    await mutate('/api/newsroom/scan', 'POST', { runType: 'manual' }, 'Newsroom scan queued.').catch(() => {});
    return;
  }
  const action = event.target.closest('[data-newsroom-action]');
  if (!action) return;
  const id = action.dataset.id;
  const kind = action.dataset.newsroomAction;
  const routes = {
    verify: [`/api/newsroom/events/${encodeURIComponent(id)}/verify`, 'POST', {}, 'Verification updated.'],
    research: [`/api/newsroom/events/${encodeURIComponent(id)}/research`, 'POST', {}, 'Research package saved.'],
    'create-idea': [`/api/newsroom/events/${encodeURIComponent(id)}/create-idea`, 'POST', {}, 'Content idea created. Generation still requires approval.'],
    approve: [`/api/newsroom/events/${encodeURIComponent(id)}/approve`, 'POST', {}, 'Event approved. Publishing still requires the existing review gates.'],
    reject: [`/api/newsroom/events/${encodeURIComponent(id)}/reject`, 'POST', { reason: 'rejected_by_operator' }, 'Event rejected.'],
    hold: [`/api/newsroom/events/${encodeURIComponent(id)}/hold`, 'POST', { reason: 'held_by_operator' }, 'Event held.'],
    downgrade: [`/api/newsroom/events/${encodeURIComponent(id)}/route`, 'POST', { route: 'ai_today' }, 'Route set to AI Today.']
  };
  const spec = routes[kind];
  if (!spec) return;
  await mutate(spec[0], spec[1], spec[2], spec[3]).catch(() => {});
  await openNewsroomEvent(id);
});

document.addEventListener('change', async event => {
  if (event.target.id === 'newsroom-filter') {
    renderNewsroom();
    return;
  }
  const routeSelect = event.target.closest('[data-newsroom-route]');
  if (!routeSelect) return;
  const id = routeSelect.dataset.newsroomRoute;
  await mutate(`/api/newsroom/events/${encodeURIComponent(id)}/route`, 'POST', { route: routeSelect.value }, `Route set to ${routeSelect.value}.`).catch(() => {});
  await openNewsroomEvent(id);
});

window.renderNewsroom = renderNewsroom;
