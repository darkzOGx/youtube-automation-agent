const fs = require('fs');
const path = require('path');
const { Database } = require('./database/db');
const { parseFeedXml } = require('./utils/news-feed-service');
const { normalizeNewsUrl } = require('./utils/news-url');
const { NewsSourceService } = require('./utils/news-source-service');
const { HtmlListingAdapter } = require('./utils/html-listing-adapter');
const { HackerNewsAdapter } = require('./utils/hackernews-adapter');
const { NewsDeduplicationService } = require('./utils/news-deduplication-service');
const { NewsScoreService } = require('./utils/news-score-service');
const { NewsAdapterService } = require('./utils/news-adapter-service');
const { NewsRadarAgent } = require('./agents/news-radar-agent');
const { NewsVerificationAgent } = require('./agents/news-verification-agent');
const { NewsRoutingAgent } = require('./agents/news-routing-agent');
const { NewsroomService } = require('./utils/newsroom-service');
const { DailyAutomation } = require('./schedules/daily-automation');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'newsroom', name), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withDb(fn) {
  const db = new Database();
  await db.initialize();
  const created = [];
  try {
    await fn(db, created);
  } finally {
    for (const id of created) {
      await db.executeQuery('DELETE FROM news_event_publications WHERE news_event_id = ?', [id]);
      await db.executeQuery('DELETE FROM news_event_research WHERE news_event_id = ?', [id]);
      await db.executeQuery('DELETE FROM news_event_scores WHERE news_event_id = ?', [id]);
      await db.executeQuery('DELETE FROM news_event_sources WHERE news_event_id = ?', [id]);
      await db.executeQuery('DELETE FROM news_events WHERE id = ?', [id]);
    }
    await db.close();
  }
}

async function runNewsroomTests() {
  const rssItems = parseFeedXml(fixture('rss-sample.xml'));
  assert(rssItems.length === 1, 'RSS parser should skip javascript URLs and keep one item');
  assert(rssItems[0].url === 'https://openai.com/news/gpt-5-6', 'RSS URL should drop tracking params, fragments, and trailing issues');
  assert(/API/i.test(rssItems[0].summary), 'RSS should read CDATA summaries');

  const atomItems = parseFeedXml(fixture('atom-sample.xml'));
  assert(atomItems.length === 1 && atomItems[0].url.includes('blog.google'), 'Atom alternate href must be used');

  const hfItems = parseFeedXml(fixture('hf-guid.xml'));
  assert(hfItems[0].url === 'https://huggingface.co/blog/vision-model', 'Hugging Face GUID fallback must supply the URL');

  assert(normalizeNewsUrl('https://WWW.OpenAI.com/news/a/?utm_source=x&fbclid=1#y') === 'https://openai.com/news/a', 'URL normalization failed');
  assert(normalizeNewsUrl('javascript:alert(1)') == null, 'javascript URLs must be rejected');
  assert(normalizeNewsUrl('data:text/html,hi') == null, 'data URLs must be rejected');

  const sources = new NewsSourceService();
  assert(sources.classifyUrl('https://openai.com/news/a').tier === 1, 'OpenAI must classify as primary');
  assert(sources.classifyUrl('https://huggingface.co/blog/x').tier === 2, 'Hugging Face must classify as technical');
  assert(sources.classifyUrl('https://www.theverge.com/ai').tier === 3, 'Reputable media must classify as tier 3');
  assert(sources.classifyUrl('https://news.ycombinator.com/item?id=1').tier === 4, 'Hacker News must stay community');

  const html = new HtmlListingAdapter();
  const htmlItems = html.collectFromHtml(fixture('html-listing.html'), {
    url: 'https://www.anthropic.com/news',
    hosts: ['anthropic.com'],
    allowedPathPrefix: '/news',
    maxCandidates: 100
  });
  assert(htmlItems.length === 2, `HTML adapter should keep same-host /news URLs only, got ${htmlItems.length}`);
  assert(htmlItems.every(item => item.url.startsWith('https://anthropic.com/news')), 'HTML adapter must normalize host and drop fragments');

  const hn = new HackerNewsAdapter({
    fetchImpl: async url => {
      if (url.endsWith('/topstories.json')) return { json: async () => [101], ok: true, status: 200, url, headers: { get: () => 'application/json' } };
      if (url.includes('/item/101.json')) {
        return {
          json: async () => ({ id: 101, title: 'OpenAI GPT-5.6', url: 'https://openai.com/news/gpt-5-6', score: 400, descendants: 90, time: 1756032000, by: 'pg' }),
          ok: true, status: 200, url, headers: { get: () => 'application/json' }
        };
      }
      return { json: async () => [], ok: true, status: 200, url, headers: { get: () => 'application/json' } };
    }
  });
  const hnResult = await hn.collect({ url: 'https://hacker-news.firebaseio.com/v0', lists: ['topstories'], maxItems: 1 });
  assert(hnResult.items[0].url.includes('openai.com'), 'HN adapter should keep the external URL');
  assert(hnResult.items[0].discussionUrl.includes('item?id=101'), 'HN adapter should keep the discussion URL');

  const noUrl = new HackerNewsAdapter().normalizeItem({ id: 9, title: 'Ask HN: agents', time: 1756032000 });
  assert(noUrl.url.includes('news.ycombinator.com/item?id=9'), 'HN stories without a URL must use the discussion URL');

  const dedup = new NewsDeduplicationService();
  const exact = dedup.classifyAgainst(
    { title: 'Introducing GPT-5.6', url: 'https://openai.com/news/gpt-5-6', company: 'OpenAI', eventType: 'model_release', publishedAt: '2026-08-24T12:00:00Z' },
    [{ canonical_key: 'x', title: 'Introducing GPT-5.6 for developers', company: 'OpenAI', eventAt: '2026-08-24T12:00:00Z', sources: [{ normalized_url: 'https://openai.com/news/gpt-5-6' }] }]
  );
  assert(exact.classification === 'exact', 'Exact URL duplicates must merge');
  const semantic = dedup.classifyAgainst(
    { title: 'OpenAI launches GPT-5.6 API', company: 'OpenAI', product: 'GPT-5.6', eventType: 'model_release', publishedAt: '2026-08-24T15:00:00Z' },
    [{ canonical_key: 'k', title: 'OpenAI launches GPT-5.6 for developers', company: 'OpenAI', product: 'GPT-5.6', event_type: 'model_release', eventAt: '2026-08-24T12:00:00Z', sources: [] }]
  );
  assert(['auto_merge', 'exact'].includes(semantic.classification), `High-confidence semantic duplicates should auto-merge, got ${semantic.classification}`);
  const fresh = dedup.classifyAgainst(
    { title: 'Farmers adopt new irrigation sensors', company: null, eventType: 'other', publishedAt: '2026-08-24T12:00:00Z' },
    [{ canonical_key: 'k', title: 'OpenAI launches GPT-5.6', company: 'OpenAI', eventAt: '2026-08-24T12:00:00Z', sources: [] }]
  );
  assert(fresh.classification === 'new', 'Unrelated stories must stay new events');

  const scoring = new NewsScoreService();
  const breakingScore = scoring.score(
    { title: 'OpenAI launches GPT-5.6 API', event_type: 'model_release', event_at: new Date().toISOString(), verification_status: 'verified' },
    [{ source_tier: 1, publisher: 'OpenAI', hnScore: 10 }]
  );
  assert(breakingScore.total_score >= 90, `Official fresh model launch should score Breaking-level, got ${breakingScore.total_score}`);
  assert(breakingScore.score_version === 'news-score-v1', 'Score version must be stored');

  const hnOnlyScore = scoring.score(
    { title: 'Viral HN AI rumor', event_type: 'other', event_at: new Date().toISOString(), verification_status: 'discovered' },
    [{ source_tier: 4, publisher: 'Hacker News', hnScore: 900, hnComments: 400 }]
  );
  const router = new NewsRoutingAgent();
  const hnRoute = router.routeEvent({ score: Math.max(95, hnOnlyScore.total_score), verification_status: 'discovered' }, [{ source_tier: 4, discovery_only: false }]);
  assert(hnRoute.route !== 'breaking', 'HN-only stories must not route as Breaking');
  assert(hnRoute.verifiedPrimary === false, 'HN is not a primary source');

  await withDb(async (db, created) => {
    const event = await db.createNewsEvent({
      canonicalKey: `test|gpt|model_release|2026-08-24|gpt-5-6`,
      title: 'Introducing GPT-5.6 for developers',
      company: 'OpenAI',
      product: 'GPT-5.6',
      eventType: 'model_release',
      eventAt: new Date().toISOString()
    });
    created.push(event.id);
    await db.addNewsEventSource(event.id, {
      url: 'https://openai.com/news/gpt-5-6',
      normalizedUrl: 'https://openai.com/news/gpt-5-6',
      title: event.title,
      publisher: 'OpenAI',
      sourceTier: 1,
      sourceType: 'official_newsroom'
    });
    const fetched = await db.getNewsEvent(event.id);
    assert(fetched.title.includes('GPT-5.6'), 'createNewsEvent/getNewsEvent failed');
    const listed = await db.listNewsEvents({ q: 'GPT-5.6' });
    assert(listed.some(item => item.id === event.id), 'listNewsEvents should find the row');
    await db.updateNewsEvent(event.id, { status: 'verified' });
    const run = await db.createNewsroomRun({ runType: 'test' });
    const finished = await db.finishNewsroomRun(run.id, { status: 'completed', signalsScanned: 2, eventsCreated: 1 });
    assert(finished.status === 'completed' && finished.signals_scanned === 2, 'Newsroom run lifecycle failed');

    const radar = new NewsRadarAgent(db, {
      fetchImpl: async () => { throw new Error('network should be mocked per adapter'); }
    });
    radar.adapters = new NewsAdapterService({
      fetchImpl: async () => ({ ok: false, status: 500 }),
      sourceService: sources
    });
    radar.adapters.collectSource = async source => {
      if (source.id === 'openai-news') {
        return {
          sourceId: source.id, adapter: 'rss', status: 'ok', latencyMs: 5,
          items: [{
            title: 'Introducing GPT-5.6 for developers',
            url: 'https://openai.com/news/gpt-5-6',
            summary: 'GPT-5.6 is now available in the API',
            publishedAt: new Date().toISOString(),
            publisher: 'OpenAI', company: 'OpenAI', product: 'GPT-5.6', eventType: 'model_release',
            sourceId: 'openai-news', sourceTier: 1, sourceType: 'official_newsroom', adapter: 'rss', discoveryOnly: false
          }]
        };
      }
      if (source.id === 'hacker-news') {
        return {
          sourceId: source.id, adapter: 'hackernews', status: 'ok', latencyMs: 8,
          items: [{
            title: 'Introducing GPT-5.6 for developers',
            url: 'https://openai.com/news/gpt-5-6',
            discussionUrl: 'https://news.ycombinator.com/item?id=4242',
            publishedAt: new Date().toISOString(),
            publisher: 'OpenAI', company: 'OpenAI', product: 'GPT-5.6', eventType: 'model_release',
            sourceId: 'openai-news', sourceTier: 1, sourceType: 'official_newsroom', adapter: 'hackernews',
            hnItemId: 4242, hnScore: 410, hnComments: 88, communityOnly: false, discoveryOnly: false
          }]
        };
      }
      if (source.id === 'anthropic-news') {
        return {
          sourceId: source.id, adapter: 'html', status: 'ok', latencyMs: 12,
          items: [{
            title: 'Anthropic news listing',
            url: 'https://anthropic.com/news/example',
            publisher: 'Anthropic', company: 'Anthropic', eventType: 'other',
            sourceId: 'anthropic-news', sourceTier: 1, sourceType: 'official_newsroom', adapter: 'html', discoveryOnly: true
          }]
        };
      }
      return { sourceId: source.id, adapter: source.adapter, status: source.id === 'google-blog' ? 'error' : 'ok', items: [], error: source.id === 'google-blog' ? 'Timed out after 15000ms' : null, latencyMs: 3 };
    };

    const collected = await radar.collect({ maxSignals: 20 });
    assert(collected.errors.some(item => item.sourceId === 'google-blog'), 'Adapter timeout must be isolated and recorded');
    const openaiEvent = (await db.listNewsEvents({ q: 'GPT-5.6' }))[0];
    created.push(openaiEvent.id);
    const openaiSources = await db.getNewsEventSources(openaiEvent.id);
    assert(openaiSources.length >= 2, `OpenAI + HN should merge into one event with multiple sources, got ${openaiSources.length}`);
    assert(openaiSources.some(source => Number(source.source_tier) === 1), 'Merged event must keep the official source');
    assert(openaiSources.some(source => Number(source.source_tier) === 4), 'Merged event must keep the HN community signal');

    const verification = new NewsVerificationAgent(db);
    const official = await verification.verifyEvent(openaiEvent.id);
    assert(official.verificationStatus === 'verified', 'Official source should verify');
    assert(official.primarySourceCount >= 1, 'Primary source count missing');

    const scored = scoring.score(await db.getNewsEvent(openaiEvent.id), await db.getNewsEventSources(openaiEvent.id));
    await db.saveNewsEventScore(openaiEvent.id, scored);
    const routedOfficial = router.routeEvent(await db.getNewsEvent(openaiEvent.id), await db.getNewsEventSources(openaiEvent.id));
    assert(scored.total_score >= 90 && routedOfficial.route === 'breaking', `Case A should be a breaking candidate, route=${routedOfficial.route} score=${scored.total_score}`);

    const hnEvent = await db.createNewsEvent({
      canonicalKey: `hn|viral|other|${new Date().toISOString().slice(0, 10)}|viral`,
      title: 'Viral HN AI rumor with no primary source',
      eventType: 'other',
      eventAt: new Date().toISOString()
    });
    created.push(hnEvent.id);
    await db.addNewsEventSource(hnEvent.id, {
      url: 'https://news.ycombinator.com/item?id=77',
      normalizedUrl: 'https://news.ycombinator.com/item?id=77',
      title: hnEvent.title,
      publisher: 'Hacker News',
      sourceTier: 4,
      sourceType: 'community',
      hnScore: 900,
      hnComments: 300
    });
    const hnVerified = await verification.verifyEvent(hnEvent.id);
    assert(hnVerified.verificationStatus !== 'verified' || hnVerified.primarySourceCount === 0, 'HN-only must not count as primary verification');
    await db.updateNewsEvent(hnEvent.id, { score: 95 });
    const hnRouted = router.routeEvent(await db.getNewsEvent(hnEvent.id), await db.getNewsEventSources(hnEvent.id));
    assert(hnRouted.route !== 'breaking', 'Case B: viral HN without primary is not Breaking');

    const listing = (await db.listNewsEvents({ q: 'Anthropic news listing' }))[0];
    if (listing) {
      created.push(listing.id);
      const listingVerification = await verification.verifyEvent(listing.id);
      assert(listingVerification.verificationStatus === 'discovered', 'Case D: HTML discovery must not auto-verify');
    }

    const conflicted = await db.createNewsEvent({
      canonicalKey: `conflict|bench|comparison|${new Date().toISOString().slice(0, 10)}|bench`,
      title: 'Model scores 92% on a public benchmark',
      eventType: 'comparison',
      eventAt: new Date().toISOString()
    });
    created.push(conflicted.id);
    await db.addNewsEventSource(conflicted.id, {
      url: 'https://example-media-one.test/a',
      normalizedUrl: 'https://example-media-one.test/a',
      title: 'Model scores 92% on a public benchmark',
      publisher: 'Outlet A',
      sourceTier: 3
    });
    await db.addNewsEventSource(conflicted.id, {
      url: 'https://example-media-two.test/b',
      normalizedUrl: 'https://example-media-two.test/b',
      title: 'Model scores 61% on a public benchmark',
      publisher: 'Outlet B',
      sourceTier: 3
    });
    const conflictResult = await verification.verifyEvent(conflicted.id);
    assert(conflictResult.verificationStatus === 'conflicted', 'Case F: conflicting benchmarks must be conflicted');
    assert(conflictResult.conflicts.length >= 1, 'Conflicts must be surfaced');

    const newsroom = new NewsroomService(db, {
      radar,
      research: { initialize: async () => true, researchEvent: async eventId => db.saveNewsResearch(eventId, { keyFacts: [{ text: 'Official announcement', sourceUrl: 'https://openai.com/news/gpt-5-6' }], suggestedAngles: ['GPT-5.6 vừa ra mắt'], whyItMatters: 'API mới cho team nhỏ', researchSummary: 'Official GPT-5.6 announcement' }) },
      startGenerationJob: async input => ({ id: 'job_newsroom_test', source: input.source, strategyContext: input.strategyContext })
    });
    await db.updateNewsEvent(openaiEvent.id, { score: 94, verificationStatus: 'verified', status: 'verified' });
    const processed = await newsroom.processEvent(openaiEvent.id);
    assert(processed.routing.route === 'breaking', 'Processed official event should route breaking');
    const approved = await newsroom.approveEvent(openaiEvent.id, { generate: true });
    assert(approved.idea.source === 'ai_newsroom', 'ContentIdea must record source=ai_newsroom');
    assert(approved.idea.news_event_id === openaiEvent.id, 'ContentIdea must link back to the news event');
    assert(approved.job.strategyContext.researchSources.length >= 1, 'Generation must receive provenance research sources');
    assert(approved.job.strategyContext.language === 'vi', 'Vietnamese language must be passed into the existing pipeline');
    assert(approved.job.source === 'ai_newsroom', 'Generation source should be ai_newsroom, not a second pipeline');

    const failingAdapters = new NewsAdapterService({
      sourceService: sources,
      fetchImpl: async () => {
        const error = new Error('Timed out after 15000ms');
        error.name = 'AbortError';
        throw error;
      }
    });
    const isolated = await failingAdapters.collectAll({ maxSignals: 5 });
    assert(isolated.results.length > 1, 'All configured sources should be attempted');
    assert(isolated.results.every(result => ['error', 'disabled', 'skipped', 'ok'].includes(result.status)), 'Adapter failures must not throw out of collectAll');
    assert(isolated.results.some(result => result.status === 'error'), 'Timeouts must be recorded as adapter errors');
    assert(isolated.results.some(result => result.status === 'disabled' || result.status === 'skipped'), 'Disabled GitHub/Reddit adapters must not crash the cycle');
  });

  const { YouTubeAutomationAgent } = require('./index');
  const agent = new YouTubeAutomationAgent();
  const valid = agent.validateGenerateRequestBody({
    topic: 'GPT-5.6',
    style: 'explainer',
    strategyContext: {
      angle: 'Why the API change matters',
      researchSources: [{ url: 'https://openai.com/news/gpt-5-6', title: 'Official', publisher: 'OpenAI', sourceType: 'official' }],
      language: 'vi',
      newsEventId: 'news_test',
      contentRoute: 'breaking'
    }
  });
  assert(valid.valid && valid.value.strategyContext.researchSources.length === 1, 'API validation must keep newsroom researchSources');

  let server;
  try {
    agent.db = new Database();
    await agent.db.initialize();
    agent.operator = { notify: async () => null };
    agent.newsroom = new NewsroomService(agent.db, { startGenerationJob: async () => ({ id: 'x' }) });
    agent.newsroom.runRadar = async () => ({ signals: [], outcomes: [], created: 0, merged: 0, ignored: 0, errors: [] });
    agent.isInitialized = true;
    agent.setupAPI();
    server = await new Promise(resolve => {
      const running = agent.app.listen(0, () => resolve(running));
    });
    const { port } = server.address();
    const list = await fetch(`http://127.0.0.1:${port}/api/newsroom/events`);
    assert(list.ok, 'GET /api/newsroom/events must exist');
    const scan = await fetch(`http://127.0.0.1:${port}/api/newsroom/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert(scan.status === 202, `POST /api/newsroom/scan should be accepted, got ${scan.status}`);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (agent.db) await agent.db.close();
  }

  const scheduler = new DailyAutomation({}, {}, { newsroom: { runCycle: async () => ({ skipped: false, run: { id: '1', status: 'completed' } }) } });
  const disabled = await scheduler.runNewsroomCycle('cycle');
  assert(disabled == null, 'Scheduler must not run Newsroom unless NEWSROOM_ENABLED=true');
}

module.exports = { runNewsroomTests };
