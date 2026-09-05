/* ============================================================
   Lumen console enhancement layer — motion, command palette,
   instrumentation. Loads after app.js; touches nothing internal.
   Cross-file globals below are declared by app.js.
   ============================================================ */
/* global ui, renderNotifications */
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MINI_LABELS = {
    overview: 'Home', operator: 'Operator', pipeline: 'Pipeline',
    calendar: 'Calendar', analytics: 'Stats', readiness: 'Checks', settings: 'Setup'
  };
  function ensureMiniLabels() {
    $$('.nav-item').forEach(item => {
      if (!item.querySelector('.mini-label')) {
        const span = document.createElement('span');
        span.className = 'mini-label';
        span.textContent = MINI_LABELS[item.dataset.view] || item.textContent.trim();
        item.appendChild(span);
      }
    });
  }
  ensureMiniLabels();
  setInterval(ensureMiniLabels, 4000);

  /* ---------- 1. View choreography ---------- */
  const VIEW_META = {
    overview: ['OPERATOR OVERVIEW', 'Know what happens next.', 'Overview'],
    operator: ['AUTONOMOUS OPERATOR', 'Give Lumen the strategy.', 'Operator'],
    pipeline: ['CONTENT OPERATIONS', 'From idea to published.', 'Pipeline'],
    calendar: ['EDITORIAL PLANNING', 'Plan before you generate.', 'Calendar'],
    analytics: ['PERFORMANCE', 'Turn results into the next move.', 'Analytics'],
    readiness: ['PRODUCTION READINESS', 'Verify before autonomy runs.', 'Readiness'],
    settings: ['CHANNEL GUARDRAILS', 'Make every agent sound like you.', 'Setup']
  };
  let currentView = 'overview';
  const baseSwitchView = window.switchView;
  if (typeof baseSwitchView === 'function') {
    window.switchView = function (view) {
      if (!VIEW_META[view]) return baseSwitchView(view);
      const changed = view !== currentView;
      const previous = currentView;
      currentView = view;
      baseSwitchView(view);
      document.title = `${VIEW_META[view][2]} · Lumen`;
      const section = $(`#${view}-view`);
      if (section) {
        // Directional slide: forward views enter from the right, back from the left.
        const order = Object.keys(VIEW_META);
        section.style.setProperty('--enter-from', order.indexOf(view) >= order.indexOf(previous) ? '1' : '-1');
        delete section.dataset.viewEnter;
        if (changed && !reduceMotion) {
          void section.offsetWidth; // restart animation
          section.dataset.viewEnter = 'true';
        }
        // Restagger static children + arm scroll reveals
        Array.from(section.children).forEach((child, i) => child.style.setProperty('--i', i));
        armReveals(section);
      }
    };
  }

  /* ---------- 2. Count-up instrumentation ---------- */
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function countUp(el) {
    if (!el || reduceMotion) return;
    const raw = (el.textContent || '').trim();
    const match = raw.match(/^(\d[\d,]*)(.*)$/);
    if (!match) return;
    const target = Number(match[1].replaceAll(',', ''));
    if (!Number.isFinite(target) || target === 0 || target > 100000) return;
    if (el.dataset.counted === String(target)) return;
    el.dataset.counted = String(target);
    const suffix = match[2];
    const dur = 750;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = `${Math.round(target * easeOut(t)).toLocaleString()}${suffix}`;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  const origRenderDashboard = window.renderDashboard;
  if (typeof origRenderDashboard === 'function') {
    window.renderDashboard = function (...args) {
      origRenderDashboard.apply(this, args);
      // Rail pause/resume glyph follows real system state
      document.body.dataset.automationPaused = String(Boolean(ui.state?.system?.automationPaused));
      requestAnimationFrame(() => {
        ['#stat-review', '#stat-scheduled', '#stat-published', '#analytics-total'].forEach(s => countUp($(s)));
        const score = $('#stat-score');
        if (score && /\d/.test(score.textContent)) {
          score.dataset.counted = ''; // composite "x/100" values just fade-slide via CSS
          score.classList.remove('score-pop');
          void score.offsetWidth;
          score.classList.add('score-pop');
        }
      });
    };
  }

  /* ---------- 3. Command palette ---------- */
  const palette = document.createElement('div');
  palette.className = 'cmdk-backdrop hidden';
  palette.innerHTML = `
    <div class="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="cmdk-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="cmdk-input" type="text" placeholder="Jump to a view, run a command…" aria-label="Command input" autocomplete="off" spellcheck="false">
        <kbd>esc</kbd>
      </div>
      <div class="cmdk-list" role="listbox" aria-label="Commands"></div>
      <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> run</span><span class="cmdk-brand">Lumen console</span></div>
    </div>`;
  document.body.appendChild(palette);
  const listEl = palette.querySelector('.cmdk-list');
  const inputEl = palette.querySelector('.cmdk-input');

  function buildCommands() {
    const cmds = Object.entries(VIEW_META).map(([id, meta]) => ({
      group: 'Navigate', icon: 'view', label: meta[2] === 'Setup' ? 'Channel setup' : meta[2],
      hint: meta[1], keywords: id, run: () => window.switchView(id)
    }));
    const action = (label, hint, selector, keywords) => ({
      group: 'Actions', icon: 'action', label, hint, keywords,
      run: () => { const el = $(selector); if (el) el.click(); }
    });
    cmds.push(
      action('Create video', 'Queue a new generation job', '#generate-button', 'generate new video create'),
      action('Add backlog idea', 'Save a topic for later', '#add-idea-button', 'idea backlog topic'),
      action('Run verified readiness check', 'Prove the production path', '#run-readiness-button', 'readiness verify dry run check'),
      ui.state?.system?.automationPaused
        ? action('Resume automation', 'Unpause the scheduler', '#automation-toggle', 'resume unpause automation play')
        : action('Pause automation', 'Halt scheduled generation', '#automation-toggle', 'pause halt automation stop'),
      action('Refresh dashboard data', 'Pull latest state now', '#refresh-button', 'refresh reload sync data'),
      action('Set dashboard API key', 'Store access key in this browser', '#api-key-button', 'api key auth credentials')
    );
    return cmds;
  }

  let filtered = [];
  let selected = 0;

  function icon(kind) {
    return kind === 'view'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5 9-12h-6.5z"/></svg>';
  }

  function renderList() {
    const q = inputEl.value.trim().toLowerCase();
    const cmds = buildCommands();
    filtered = q ? cmds.filter(c => `${c.label} ${c.hint} ${c.keywords}`.toLowerCase().includes(q)) : cmds;
    selected = Math.min(selected, Math.max(0, filtered.length - 1));
    if (!filtered.length) {
      listEl.innerHTML = '<div class="cmdk-empty">No matching commands.</div>';
      return;
    }
    let lastGroup = '';
    listEl.innerHTML = filtered.map((c, i) => {
      const head = c.group !== lastGroup ? `<p class="cmdk-group">${c.group}</p>` : '';
      lastGroup = c.group;
      return `${head}<div class="cmdk-row ${i === selected ? 'selected' : ''}" role="option" aria-selected="${i === selected}" data-cmd="${i}">
        <span class="cmdk-icon">${icon(c.icon)}</span>
        <span class="cmdk-label">${c.label}</span>
        <span class="cmdk-hint">${c.hint}</span>
      </div>`;
    }).join('');
    listEl.querySelector('.cmdk-row.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function openPalette() {
    palette.classList.remove('hidden');
    document.body.classList.add('cmdk-open');
    inputEl.value = '';
    selected = 0;
    renderList();
    requestAnimationFrame(() => inputEl.focus());
  }
  function closePalette() {
    palette.classList.add('hidden');
    document.body.classList.remove('cmdk-open');
  }
  function runCommand(index) {
    const cmd = filtered[index];
    if (!cmd) return;
    closePalette();
    setTimeout(() => cmd.run(), 60);
  }

  palette.addEventListener('click', event => {
    if (event.target === palette) return closePalette();
    const row = event.target.closest('[data-cmd]');
    if (row) runCommand(Number(row.dataset.cmd));
  });
  inputEl.addEventListener('input', () => { selected = 0; renderList(); });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      return palette.classList.contains('hidden') ? openPalette() : closePalette();
    }
    if (!palette.classList.contains('hidden')) {
      if (event.key === 'Escape') { event.preventDefault(); return closePalette(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(filtered.length - 1, selected + 1); return renderList(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); return renderList(); }
      if (event.key === 'Enter') { event.preventDefault(); return runCommand(selected); }
      return;
    }
    // Typing guard: chords only outside form fields
    const tag = event.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === '/') { event.preventDefault(); return openPalette(); }
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      if (!$('#generate-button').disabled) $('#generate-dialog').showModal();
      return;
    }
    // g-chords: g o → overview, g p → pipeline …
    if (event.key.toLowerCase() === 'g') {
      chordArmed = true;
      clearTimeout(chordTimer);
      chordTimer = setTimeout(() => { chordArmed = false; }, 1200);
      return;
    }
    if (chordArmed) {
      const map = { o: 'overview', p: 'pipeline', c: 'calendar', a: 'analytics', r: 'readiness', s: 'settings', d: 'operator' };
      const view = map[event.key.toLowerCase()];
      chordArmed = false;
      clearTimeout(chordTimer);
      if (view) { event.preventDefault(); window.switchView(view); }
    }
  });
  let chordArmed = false;
  let chordTimer = null;

  // Visible trigger in the topbar
  const trigger = document.createElement('button');
  trigger.className = 'kbd-trigger';
  trigger.setAttribute('aria-label', 'Open command palette');
  trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Search</span><kbd>Ctrl K</kbd>';
  trigger.addEventListener('click', openPalette);
  $('.top-actions').prepend(trigger);

  /* ---------- 4. Cursor spotlight + card glow + tilt ---------- */
  if (!reduceMotion) {
    const glowSelector = '.stat, .pipeline-item, .review-card, .job-card, .plan-card, .learning-card, .readiness-check, .retention-scene';
    const spotlight = $('.spotlight');
    let lastGlow = null;
    let spotlightRaf = 0;
    document.addEventListener('pointermove', event => {
      document.body.classList.add('has-pointer');
      if (spotlight) {
        cancelAnimationFrame(spotlightRaf);
        spotlightRaf = requestAnimationFrame(() => {
          spotlight.style.setProperty('--mx', `${event.clientX}px`);
          spotlight.style.setProperty('--my', `${event.clientY}px`);
        });
      }
      const el = event.target.closest?.(glowSelector);
      if (el !== lastGlow && lastGlow) lastGlow.style.setProperty('--gx', '');
      lastGlow = el;
      if (el) {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--gx', `${event.clientX - rect.left}px`);
        el.style.setProperty('--gy', `${event.clientY - rect.top}px`);
      }
    }, { passive: true });

    // Subtle 3D tilt on stat cards
    $$('.stat').forEach(card => {
      card.addEventListener('pointermove', event => {
        const rect = card.getBoundingClientRect();
        const rx = ((event.clientY - rect.top) / rect.height - .5) * -4;
        const ry = ((event.clientX - rect.left) / rect.width - .5) * 4;
        card.style.transform = `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-2px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  /* ---------- 5. Button ripple ---------- */
  if (!reduceMotion) {
    document.addEventListener('pointerdown', event => {
      const button = event.target.closest('.button.primary, .button.secondary, .nav-item');
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const size = Math.max(rect.width, rect.height) * 2.1;
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
      button.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  /* ---------- 6. Scroll reveals (static panels only) ---------- */
  const io = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      }
    }, { threshold: .06, rootMargin: '0px 0px -36px 0px' })
    : null;
  function armReveals(scope) {
    if (!io) return;
    (scope || document).querySelectorAll('.panel:not(.revealed)').forEach(panel => {
      panel.classList.add('reveal');
      io.observe(panel);
    });
  }

  /* ---------- 7. Sticky topbar elevation ---------- */
  const topbar = $('.topbar');
  window.addEventListener('scroll', () => {
    document.body.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
  if (topbar) armReveals(document);

  /* ---------- 8. Toast v2 (icon + slide, keeps API) ---------- */
  const origShowToast = window.showToast;
  if (typeof origShowToast === 'function') {
    window.showToast = function (message, type = 'success') {
      const toast = $('#toast');
      const iconPath = type === 'error'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5v.5"/></svg>'
        : type === 'warning'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="m8 12.5 2.8 2.8L16.5 9"/></svg>';
      toast.innerHTML = `<span class="toast-icon ${type}">${iconPath}</span><span class="toast-msg"></span>`;
      toast.querySelector('.toast-msg').textContent = message;
      toast.className = `toast ${type}`;
      void toast.offsetWidth;
      toast.classList.add('armed');
      clearTimeout(ui.toastTimer);
      ui.toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
    };
  }

  /* ---------- 9. Live relative-time ticker ---------- */
  setInterval(() => {
    if (ui.state && !ui.refreshing && !document.hidden) {
      try {
        renderNotifications(ui.state.notifications || [], ui.state.events || []);
      } catch { /* next tick */ }
    }
  }, 30000);

  /* ---------- 10. Sidebar status cluster (clock + version) ---------- */
  const footer = $('.sidebar-footer');
  if (footer) {
    const cluster = document.createElement('div');
    cluster.className = 'console-meta';
    cluster.innerHTML = `
      <div class="console-clock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg><span>--:--</span></div>
      <span class="console-version">v2.8.0 · local</span>`;
    footer.prepend(cluster);
    const clockLabel = cluster.querySelector('.console-clock span');
    const tickClock = () => {
      clockLabel.textContent = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };
    tickClock();
    setInterval(tickClock, 15000);
  }

  /* ---------- 11. First-paint boot sequence ---------- */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.remove('preboot');
    armReveals($('.view.active'));
  }));
})();
