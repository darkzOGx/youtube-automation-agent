const path = require('path');
const fs = require('fs');

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a1a;
    color: #e2e8f0;
    font-family: 'Inter', sans-serif;
    padding: 0;
    min-height: 100vh;
  }
  .top-bar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(10,10,26,0.95);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(139,92,246,0.2);
    padding: 16px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .top-bar-title { font-size: 1.2em; font-weight: 700; color: #c084fc; display: flex; align-items: center; gap: 10px; }
  .top-bar a {
    font-size: 0.85em;
    color: #a78bfa;
    text-decoration: none;
    padding: 8px 16px;
    border: 1px solid rgba(139,92,246,0.3);
    border-radius: 8px;
    transition: all 0.2s;
    white-space: nowrap;
  }
  .top-bar a:hover { background: rgba(139,92,246,0.15); color: #fff; }
  .top-bar-nav { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  .page-wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  .page-header { margin-bottom: 28px; }
  .page-header h1 { font-size: 1.8em; font-weight: 700; color: #f8fafc; }
  .page-header p { color: #64748b; margin-top: 6px; }
  .stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-chip {
    background: rgba(30,27,75,0.5);
    border: 1px solid rgba(139,92,246,0.15);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
  }
  .stat-chip .num { font-size: 2em; font-weight: 700; color: #c084fc; }
  .stat-chip .lbl { font-size: 0.78em; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }

  .video-card {
    background: rgba(20,18,50,0.6);
    border: 1px solid rgba(139,92,246,0.15);
    border-radius: 16px;
    margin-bottom: 24px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .video-card:hover { border-color: rgba(139,92,246,0.4); }
  .video-card-header {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 0;
  }
  .thumbnail-wrap {
    position: relative;
    width: 200px;
    height: 140px;
    flex-shrink: 0;
    overflow: hidden;
    background: #0a0a1a;
  }
  .thumbnail-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(236,72,153,0.15));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3em;
  }
  .duration-badge {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(0,0,0,0.85);
    color: #fff;
    font-size: 0.75em;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
  }
  .video-card-meta {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .video-card-title { font-size: 1.15em; font-weight: 700; color: #f1f5f9; line-height: 1.4; }
  .badge-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 10px; border-radius: 20px; font-size: 0.75em; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .badge-scheduled { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
  .badge-published { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
  .badge-failed { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
  .badge-processing { background: rgba(96,165,250,0.15); color: #60a5fa; border: 1px solid rgba(96,165,250,0.3); }
  .meta-row { font-size: 0.82em; color: #64748b; display: flex; flex-wrap: wrap; gap: 12px; }
  .meta-row span { display: flex; align-items: center; gap: 4px; }
  .action-row { display: flex; gap: 8px; margin-top: auto; padding-top: 4px; flex-wrap: wrap; }
  .action-btn {
    padding: 7px 14px; border-radius: 8px; font-size: 0.8em; font-weight: 600; cursor: pointer;
    border: none; transition: all 0.2s; text-decoration: none; display: inline-flex; align-items: center; gap: 5px;
  }
  .btn-yt { background: #ef4444; color: #fff; }
  .btn-yt:hover { background: #dc2626; }
  .btn-preview { background: rgba(139,92,246,0.2); color: #c084fc; border: 1px solid rgba(139,92,246,0.3); }
  .btn-preview:hover { background: rgba(139,92,246,0.35); }
  .btn-publish { background: rgba(52,211,153,0.2); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
  .btn-publish:hover { background: rgba(52,211,153,0.35); }

  .video-card-body { border-top: 1px solid rgba(255,255,255,0.05); }
  .tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .tab-btn {
    padding: 10px 20px; font-size: 0.82em; font-weight: 600; cursor: pointer;
    border: none; background: transparent; color: #64748b;
    border-bottom: 2px solid transparent; transition: all 0.2s;
  }
  .tab-btn.active { color: #c084fc; border-bottom-color: #c084fc; }
  .tab-btn:hover { color: #a78bfa; }
  .tab-content { display: none; padding: 20px 24px; }
  .tab-content.active { display: block; }

  .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .info-item { background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px 14px; }
  .info-item .lbl { font-size: 0.75em; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .info-item .val { font-size: 0.9em; color: #e2e8f0; font-weight: 500; word-break: break-all; }
  .info-item .val a { color: #60a5fa; text-decoration: none; }
  .info-item .val a:hover { text-decoration: underline; }

  .desc-box {
    background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px;
    font-size: 0.85em; line-height: 1.7; color: #94a3b8;
    white-space: pre-wrap; max-height: 260px; overflow-y: auto;
  }

  .tags-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    background: rgba(139,92,246,0.1); color: #a78bfa;
    border: 1px solid rgba(139,92,246,0.2);
    padding: 3px 10px; border-radius: 20px; font-size: 0.78em;
  }

  .chapters-table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
  .chapters-table th { text-align: left; padding: 8px 12px; color: #64748b; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .chapters-table td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); color: #cbd5e1; }
  .chapters-table tr:last-child td { border-bottom: none; }

  .seo-score { display: flex; align-items: center; gap: 12px; }
  .score-bar { flex: 1; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
  .score-fill { height: 100%; border-radius: 4px; transition: width 0.6s; }
  .score-good { background: linear-gradient(90deg, #34d399, #10b981); }
  .score-mid  { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
  .score-low  { background: linear-gradient(90deg, #f87171, #ef4444); }
  .score-num { font-size: 1.1em; font-weight: 700; min-width: 36px; text-align: right; }

  .file-path { font-family: monospace; font-size: 0.78em; color: #6366f1; word-break: break-all; }
  .empty-state { text-align: center; padding: 80px 24px; color: #334155; }
  .empty-state .icon { font-size: 4em; display: block; margin-bottom: 16px; }

  @media (max-width: 640px) {
    .video-card-header { grid-template-columns: 1fr; }
    .thumbnail-wrap { width: 100%; height: 200px; }
    .page-wrap { padding: 16px; }
    .top-bar { padding: 12px 16px; }
  }
`;

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status) {
  const cls = { scheduled: 'badge-scheduled', published: 'badge-published', failed: 'badge-failed', processing: 'badge-processing' }[status] || 'badge-scheduled';
  const icons = { scheduled: '📅', published: '✅', failed: '❌', processing: '⚙️' };
  return `<span class="badge ${cls}">${icons[status] || '📋'} ${escapeHtml(status)}</span>`;
}

function seoBar(score) {
  const pct = Math.min(100, Math.max(0, score || 0));
  const cls = pct >= 70 ? 'score-good' : pct >= 45 ? 'score-mid' : 'score-low';
  const color = pct >= 70 ? '#34d399' : pct >= 45 ? '#fbbf24' : '#f87171';
  return `
    <div class="seo-score">
      <div class="score-bar"><div class="score-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="score-num" style="color:${color}">${pct}</span>
    </div>`;
}

function renderScheduleCard(item, index) {
  const seo = item.metadata?.seo || {};
  const thumb = item.metadata?.thumbnail || item.thumbnail || {};
  const video = item.metadata?.video || item.video || {};
  const captions = item.metadata?.captions || item.captions || {};
  const chapters = seo.chapters || [];
  const tags = seo.tags || [];
  const hashtags = seo.hashtags || [];
  const endScreen = seo.endScreen || {};
  const seoMeta = seo.metadata || {};
  const seoScore = seo.seoScore || 0;
  const publishTime = new Date(item.publish_time || item.publishTime);
  const isPublished = item.status === 'published';

  // thumbnail
  const thumbSrc = thumb.path || thumb.originalPath || '';
  const thumbHtml = thumbSrc
    ? `<img src="/thumbnail-proxy?path=${encodeURIComponent(thumbSrc)}" alt="Thumbnail" onerror="this.parentNode.innerHTML='<div class=thumbnail-placeholder>🎬</div>'">`
    : `<div class="thumbnail-placeholder">🎬</div>`;

  const duration = video.duration || '';

  const youtubeUrl = item.youtube_url || item.youtubeUrl;

  const cardId = `card-${index}`;

  return `
  <div class="video-card" id="${cardId}">
    <div class="video-card-header">
      <div class="thumbnail-wrap">
        ${thumbHtml}
        ${duration ? `<span class="duration-badge">${escapeHtml(duration)}</span>` : ''}
      </div>
      <div class="video-card-meta">
        <div class="video-card-title">${escapeHtml(item.title || 'Untitled')}</div>
        <div class="badge-row">
          ${statusBadge(item.status)}
          ${isPublished && youtubeUrl ? `<a class="badge" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);text-decoration:none;" href="${escapeHtml(youtubeUrl)}" target="_blank">▶️ Watch on YouTube</a>` : ''}
        </div>
        <div class="meta-row">
          <span>📅 ${publishTime.toLocaleDateString('id-ID', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</span>
          <span>⏰ ${publishTime.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})} WIB</span>
          ${video.resolution ? `<span>🎞️ ${escapeHtml(video.resolution)}</span>` : ''}
          ${video.fileSize ? `<span>💾 ${(video.fileSize / 1024 / 1024).toFixed(1)} MB</span>` : ''}
          <span>🏆 Priority: ${item.priority || 'N/A'}</span>
        </div>
        <div class="action-row">
          ${!isPublished ? `<button class="action-btn btn-publish" onclick="publishNow('${escapeHtml(item.production_id || item.id)}', this)">⚡ Publish Now</button>` : ''}
          ${youtubeUrl ? `<a class="action-btn btn-yt" href="${escapeHtml(youtubeUrl)}" target="_blank">▶ YouTube</a>` : ''}
          <button class="action-btn btn-preview" onclick="openPreview('${escapeHtml(item.production_id || item.id)}')">👁 Preview Video</button>
        </div>
      </div>
    </div>

    <div class="video-card-body">
      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('${cardId}', 'overview', this)">📋 Overview</button>
        <button class="tab-btn" onclick="switchTab('${cardId}', 'description', this)">📝 Description</button>
        ${chapters.length ? `<button class="tab-btn" onclick="switchTab('${cardId}', 'chapters', this)">⏱ Chapters</button>` : ''}
        ${tags.length ? `<button class="tab-btn" onclick="switchTab('${cardId}', 'tags', this)">🏷 Tags</button>` : ''}
        <button class="tab-btn" onclick="switchTab('${cardId}', 'files', this)">📁 Files</button>
      </div>

      <div class="tab-content active" id="${cardId}-overview">
        <div class="info-grid">
          <div class="info-item">
            <div class="lbl">Schedule ID</div>
            <div class="val">${escapeHtml(item.id)}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Production ID</div>
            <div class="val">${escapeHtml(item.production_id || item.productionId || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">SEO Score</div>
            <div class="val">${seoBar(seoScore)}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Primary Keyword</div>
            <div class="val">${escapeHtml(seoMeta.primaryKeyword || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Secondary Keywords</div>
            <div class="val">${escapeHtml((seoMeta.secondaryKeywords || []).join(', ') || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Category ID</div>
            <div class="val">${seoMeta.category || '-'} ${seoMeta.category === 22 ? '(People & Blogs)' : ''}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Language</div>
            <div class="val">${escapeHtml(seoMeta.language || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Target Length</div>
            <div class="val">${escapeHtml(seoMeta.targetLength || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Video Duration</div>
            <div class="val">${escapeHtml(video.duration || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Resolution</div>
            <div class="val">${escapeHtml(video.resolution || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Captions</div>
            <div class="val">${captions.format ? escapeHtml(captions.format.toUpperCase()) + (captions.autoGenerated ? ' (Auto)' : '') : '-'}</div>
          </div>
          ${isPublished ? `
          <div class="info-item">
            <div class="lbl">YouTube ID</div>
            <div class="val"><a href="${escapeHtml(youtubeUrl)}" target="_blank">${escapeHtml(item.youtube_id || item.youtubeId)}</a></div>
          </div>
          <div class="info-item">
            <div class="lbl">Published At</div>
            <div class="val">${new Date(item.published_at || item.publishedAt).toLocaleString('id-ID')}</div>
          </div>` : ''}
          ${endScreen.elements ? `
          <div class="info-item" style="grid-column: 1 / -1;">
            <div class="lbl">End Screen Elements</div>
            <div class="val">${endScreen.elements.map(e => `${e.type} (${e.position})`).join(' · ')}</div>
          </div>` : ''}
        </div>
      </div>

      <div class="tab-content" id="${cardId}-description">
        <div class="desc-box">${escapeHtml(seo.description || 'No description available.')}</div>
      </div>

      ${chapters.length ? `
      <div class="tab-content" id="${cardId}-chapters">
        <table class="chapters-table">
          <thead><tr><th>#</th><th>Time</th><th>Chapter Title</th></tr></thead>
          <tbody>
            ${chapters.map((ch, i) => `
            <tr>
              <td style="color:#64748b">${i + 1}</td>
              <td style="color:#c084fc;font-weight:600">${escapeHtml(ch.time)}</td>
              <td>${escapeHtml(ch.title)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${tags.length ? `
      <div class="tab-content" id="${cardId}-tags">
        <p style="color:#64748b;font-size:0.8em;margin-bottom:12px;">Tags (${tags.length})</p>
        <div class="tags-wrap">
          ${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        ${hashtags.length ? `
        <p style="color:#64748b;font-size:0.8em;margin:16px 0 8px;">Hashtags</p>
        <div class="tags-wrap">
          ${hashtags.map(h => `<span class="tag" style="color:#60a5fa;border-color:rgba(96,165,250,0.3);background:rgba(96,165,250,0.1)">${escapeHtml(h)}</span>`).join('')}
        </div>` : ''}
      </div>` : ''}

      <div class="tab-content" id="${cardId}-files">
        <div class="info-grid">
          <div class="info-item">
            <div class="lbl">🎬 Video File</div>
            <div class="val file-path">${escapeHtml(video.path || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">🖼 Thumbnail</div>
            <div class="val file-path">${escapeHtml(thumb.path || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">💬 Captions</div>
            <div class="val file-path">${escapeHtml(captions.path || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">📦 File Size</div>
            <div class="val">${video.fileSize ? (video.fileSize / 1024 / 1024).toFixed(2) + ' MB' : '-'}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Generated With</div>
            <div class="val">${escapeHtml(video.generatedWith || '-')}</div>
          </div>
          <div class="info-item">
            <div class="lbl">Created At</div>
            <div class="val">${item.created_at || item.createdAt || '-'}</div>
          </div>
        </div>
      </div>

    </div>
  </div>`;
}

const SCHEDULE_JS = `
function switchTab(cardId, tabName, btn) {
  const card = document.getElementById(cardId);
  card.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  card.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(cardId + '-' + tabName);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
}
async function publishNow(productionId, btn) {
  if (!confirm('Publish this video to YouTube now?')) return;
  btn.disabled = true;
  btn.textContent = 'Publishing...';
  try {
    const r = await fetch('/publish/' + productionId, { method: 'POST' });
    const d = await r.json();
    if (d.success) { btn.textContent = '✅ Published!'; btn.style.background='rgba(52,211,153,0.3)'; }
    else { btn.textContent = '❌ Failed'; btn.disabled = false; alert('Error: ' + d.error); }
  } catch(e) { btn.textContent = '❌ Error'; btn.disabled = false; }
}
function getMediaUrl(path) {
  if (!path) return '';
  if (path.includes('/data/videos/')) return '/data/videos/' + path.split('/data/videos/')[1];
  if (path.includes('/uploads/thumbnails/')) return '/uploads/thumbnails/' + path.split('/uploads/thumbnails/')[1];
  if (path.includes('/data/')) return '/data/' + path.split('/data/')[1];
  return path;
}
function openPreview(id) {
  const item = window.pipelineData.find(i => i.production_id === id || i.id === id);
  if (!item) return;
  document.getElementById('preview-title').textContent = item.title || 'Video Preview';
  const videoEl = document.getElementById('preview-video');
  const thumbEl = document.getElementById('preview-thumbnail');
  const noMediaEl = document.getElementById('preview-no-media');
  
  let hasMedia = false;
  videoEl.style.display = 'none'; thumbEl.style.display = 'none'; noMediaEl.style.display = 'none';
  if (item.metadata?.video?.path) {
    videoEl.src = getMediaUrl(item.metadata.video.path);
    videoEl.style.display = 'block';
    hasMedia = true;
  }
  if (item.metadata?.thumbnail?.path) {
    thumbEl.src = getMediaUrl(item.metadata.thumbnail.path);
    if (!hasMedia) { thumbEl.style.display = 'block'; hasMedia = true; }
  }
  if (!hasMedia) noMediaEl.style.display = 'block';
  document.getElementById('preview-modal').style.display = 'flex';
}
function closePreview() {
  document.getElementById('preview-modal').style.display = 'none';
  document.getElementById('preview-video').pause();
}
`;

module.exports = function(app, agents, db) {

  // Proxy thumbnail images from local disk
  app.get('/thumbnail-proxy', (req, res) => {
    const rawPath = req.query.path || '';
    const basePath = '/root/.openclaw/workspace/development/youtube-automation-agent/uploads/thumbnails/';
    const safeName = path.basename(rawPath);
    const fullPath = path.normalize(path.join(basePath, safeName));
    if (!fullPath.startsWith(basePath)) return res.status(400).send('Invalid path');
    if (!fs.existsSync(fullPath)) return res.status(404).send('Not found');
    res.sendFile(fullPath);
  });

  app.get('/dashboard/schedule', async (req, res) => {
    try {
      const schedule = await db.getUpcomingSchedule();
      const scheduled = schedule.filter(i => i.status !== 'published');
      const published = schedule.filter(i => i.status === 'published');
      const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schedule – Ethereal Dreamscript</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="top-bar">
    <div class="top-bar-title">🎬 Ethereal Dreamscript &nbsp;<span style="color:#64748b;font-weight:400;font-size:0.85em">/ Schedule</span>
    </div>
    <div class="top-bar-nav">
      <a href="/">🎛️ Home</a>
      <a href="/dashboard/analytics">📊 Analytics</a>
      <a href="javascript:location.reload()">🔄 Refresh</a>
    </div>
  </div>
  <div class="page-wrap">
    <div class="page-header">
      <h1>📅 Full Schedule</h1>
      <p>All content in the publish queue and publication history.</p>
    </div>
    <div class="stat-row">
      <div class="stat-chip"><div class="num">${schedule.length}</div><div class="lbl">Total Items</div></div>
      <div class="stat-chip"><div class="num">${scheduled.length}</div><div class="lbl">Scheduled</div></div>
      <div class="stat-chip"><div class="num">${published.length}</div><div class="lbl">Published</div></div>
      <div class="stat-chip"><div class="num">${schedule.filter(i=>i.status==='failed').length}</div><div class="lbl">Failed</div></div>
    </div>

    ${scheduled.length > 0 ? `<h2 style="font-size:1.1em;color:#fbbf24;margin-bottom:16px;">📅 Scheduled (${scheduled.length})</h2>
    ${scheduled.map((item, i) => renderScheduleCard(item, i)).join('')}` : ''}

    ${published.length > 0 ? `<h2 style="font-size:1.1em;color:#34d399;margin:28px 0 16px;">✅ Published (${published.length})</h2>
    ${published.map((item, i) => renderScheduleCard(item, scheduled.length + i)).join('')}` : ''}

    ${schedule.length === 0 ? `<div class="empty-state"><span class="icon">📭</span>No scheduled content found.<br>Generate some content first!</div>` : ''}
  </div>

  <div id="preview-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:1000; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
    <div style="background:#1e1b4b; padding:20px; border-radius:16px; max-width:800px; width:90%; border:1px solid rgba(139,92,246,0.3); box-shadow:0 10px 40px rgba(0,0,0,0.5);">
      <div style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
        <h3 id="preview-title" style="margin:0; color:#e2e8f0; font-size:1.2em;">Video Preview</h3>
        <button onclick="closePreview()" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:1.8em; line-height:1; padding:0 5px;">&times;</button>
      </div>
      <video id="preview-video" controls style="width:100%; display:none; border-radius:8px; outline:none; max-height:60vh; background:#000;"></video>
      <img id="preview-thumbnail" style="width:100%; display:none; border-radius:8px; object-fit:contain; max-height:60vh;" />
      <div id="preview-no-media" style="display:none; padding:40px; text-align:center; color:#94a3b8; background:rgba(0,0,0,0.2); border-radius:8px;">No media available for preview.</div>
    </div>
  </div>

  <script>
    window.pipelineData = ${JSON.stringify(schedule)};
    ${SCHEDULE_JS}
  </script>
</body>
</html>`;
      res.send(html);
    } catch (error) {
      res.status(500).send('Error loading schedule: ' + error.message);
    }
  });

  app.get('/dashboard/analytics', async (req, res) => {
    try {
      const analytics = await agents.analytics.getRecentAnalytics();
      const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analytics – Ethereal Dreamscript</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="top-bar">
    <div class="top-bar-title">🎬 Ethereal Dreamscript &nbsp;<span style="color:#64748b;font-weight:400;font-size:0.85em">/ Analytics</span></div>
    <div class="top-bar-nav">
      <a href="/">🎛️ Home</a>
      <a href="/dashboard/schedule">📅 Schedule</a>
      <a href="javascript:location.reload()">🔄 Refresh</a>
    </div>
  </div>
  <div class="page-wrap">
    <div class="page-header">
      <h1>📊 Analytics Data</h1>
      <p>Raw analytics data collected from YouTube Analytics API.</p>
    </div>
    <div class="video-card" style="padding:24px;">
      <pre style="background:rgba(0,0,0,0.4);padding:20px;border-radius:10px;overflow-x:auto;color:#a78bfa;font-size:0.85em;line-height:1.6;">${escapeHtml(JSON.stringify(analytics, null, 2))}</pre>
    </div>
  </div>
</body>
</html>`;
      res.send(html);
    } catch (error) {
      res.status(500).send('Error loading analytics: ' + error.message);
    }
  });
};
