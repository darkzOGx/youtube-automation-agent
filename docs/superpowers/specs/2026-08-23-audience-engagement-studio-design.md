# Audience Engagement Studio — Design

- **Date:** 2026-08-23
- **Status:** Approved design, pre-implementation
- **Owner:** Haithem (darkzOGx)

## Purpose

AgentTube's loop today is research → produce → publish → learn from analytics, but "learn" means
numbers (CTR, retention curves, watch time). The humans watching are invisible to the agent: the
only comment-related code in the repo reads `commentCount` as a statistic
(`agents/analytics-optimization-agent.js:154`).

The Audience Engagement Studio closes that gap. After a video publishes, the agent:

1. **Syncs comments** for published videos on an idempotent, watermarked schedule.
2. **Analyzes them** — themes, sentiment, questions, and spam/scam/toxicity flags.
3. **Drafts replies** in the channel's brand voice, every one approval-gated before posting.
4. **Mines audience-requested topics** into evidence-backed, approval-gated recommendations that
   feed the Autonomous Channel Operator's planning.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Reply autonomy | **Approval-only.** Every draft waits for explicit operator approval. No auto-reply lane in v1. |
| Moderation | **Flag-only.** Spam/scam/toxic comments are surfaced in a "Needs attention" bucket; acting on them is a manual trip to YouTube Studio. No `comments.setModerationStatus` calls. |
| Idea flow | **Approval-gated.** Mined ideas become pending `learning_recommendations`; only approved ones influence planning. |
| Architecture | **Approach A:** one new service (`utils/audience-engagement-service.js`) + three new tables, reusing the existing recommendations pipeline for idea mining. |

## Architecture overview

A single new service class, `utils/audience-engagement-service.js`, follows the two established
service shapes:

- **Analysis/evidence engine** (like `utils/channel-learning-engine.js`): sync → analyze →
  refresh recommendations, with evidence thresholds gating recommendation creation.
- **Studio workflow lifecycle** (like `utils/shorts-repurposing-service.js`): draft →
  edit/discard → confirmed approval → post, with field locking, invalidation, and
  `error.status`/`error.code` HTTP semantics.

Construction mirrors the other studios: declared `null` in the `index.js` constructor, built in
`initialize()` after agents, receiving `db`, the credential manager (for YouTube clients), the
`AITextService`, and an `options` object with `logger` and injected side-effect functions
(the YouTube list/insert calls) for testability.

There is **no simulated comment, ever.** The service uses the strict refusal variant of the
simulated-data policy (like `scene-retention-engine.js:11`): if the API fails, nothing is stored.

## Data model

Three new tables appended to the `createTables()` array in `database/db.js` (no schema
versioning; `CREATE TABLE IF NOT EXISTS` per house convention). IDs come from
`db.generateId(prefix)` with prefixes `comment`, `insight`, `reply`.

### `audience_comments`

One row per YouTube comment, top-level and nested.

| Column | Notes |
| --- | --- |
| `id TEXT PRIMARY KEY` | `generateId('comment')` |
| `comment_id TEXT NOT NULL UNIQUE` | YouTube's comment ID — natural key; re-syncs upsert via `ON CONFLICT` |
| `video_id TEXT NOT NULL` | |
| `parent_comment_id TEXT` | null for top-level comments |
| `author_name TEXT`, `author_channel_id TEXT` | |
| `is_channel_owner INTEGER DEFAULT 0` | own replies, excluded from drafting |
| `text TEXT NOT NULL` | hostile input — see Security |
| `like_count INTEGER DEFAULT 0`, `reply_count INTEGER DEFAULT 0` | reply_count on top-level only |
| `published_at TEXT`, `updated_at_youtube TEXT` | YouTube timestamps |
| `flags TEXT NOT NULL DEFAULT '[]'` | JSON array from analysis: `question`, `request`, `praise`, `correction`, `spam`, `scam`, `toxic` |
| `analysis_state TEXT DEFAULT 'pending'` | `pending` → `analyzed` |
| `replied_by_agent INTEGER DEFAULT 0` | set when a draft for this comment reaches `posted` |
| `created_at`/`updated_at TEXT DEFAULT CURRENT_TIMESTAMP` | |

### `engagement_insights`

One **current** row per video (`UNIQUE(video_id)`), updated on each analysis — the
retention-snapshot upsert style (`db.js:1779-1821`). Also carries the sync watermarks so the
due-check is self-contained.

| Column | Notes |
| --- | --- |
| `id TEXT PRIMARY KEY` | `generateId('insight')` |
| `video_id TEXT NOT NULL UNIQUE` | |
| `production_id TEXT` | link to the durable production when matchable |
| `comment_count INTEGER`, `analyzed_count INTEGER` | |
| `sentiment TEXT NOT NULL DEFAULT '{}'` | JSON: positive/neutral/negative proportions + method |
| `themes TEXT NOT NULL DEFAULT '[]'` | JSON array: `{title, summary, kind, count, sampleCommentIds}` |
| `attention_flags TEXT NOT NULL DEFAULT '[]'` | JSON: flagged comment IDs by category (the flag-only bucket) |
| `analysis_method TEXT DEFAULT 'ai'` | `ai` \| `fallback` |
| `analyzed_at TEXT` | |
| `last_synced_at TEXT`, `newest_comment_at TEXT` | sync watermarks |
| `created_at`/`updated_at` | |

### `reply_drafts`

One active draft per comment (`UNIQUE(comment_id)`); re-drafting replaces a `proposed` or
`discarded` row, never a `posted` one.

| Column | Notes |
| --- | --- |
| `id TEXT PRIMARY KEY` | `generateId('reply')` |
| `comment_id TEXT NOT NULL UNIQUE` | FK → `audience_comments.comment_id`; top-level comments only |
| `video_id TEXT NOT NULL` | |
| `draft_text TEXT NOT NULL` | AI draft |
| `edited_text TEXT` | operator's edit; posted text = `edited_text || draft_text` |
| `status TEXT DEFAULT 'proposed'` | `proposed` → `approved` → `posted`; exits: `discarded`, `failed` |
| `rationale TEXT` | why the agent chose this comment |
| `posted_comment_id TEXT` | YouTube ID of the posted reply — posting evidence |
| `posted_at TEXT`, `failure_reason TEXT` | |
| `created_at`/`updated_at` | |

### Mined ideas: reuse `learning_recommendations`

No new table and no changes to `content_ideas`. Candidates are upserted into
`learning_recommendations` (`db.js:166-179`) with:

- `category`: `audience_demand`
- `fingerprint`: sha256 of `{category, videoId, normalizedTopic}` (same idiom as
  `channel-learning-engine.js:261-268`) so re-analysis dedupes
- `evidence`: `{videoId, themeTitle, askCount, sampleComments: [{commentId, permalink, excerpt}]}`
- `proposedChange`: `{target: 'future_topics', topic, angle, rationale, autoEditPublishedContent: false}`
- `confidence`: ask-count 3–4 → `low`, 5–9 → `medium`, 10+ → `high`

## Ingestion and scheduling

- **Cron slot:** a new job in `schedules/daily-automation.js` every 4 hours (`0 */4 * * *`),
  registered with `{scheduled: false}` + `.start()`, guarded by `isEnabled`, per-video try/catch,
  `sleep(2000)` between videos, ending with `logAutomationEvent` — the analytics-sweep idiom.
- **Due-check lives in the service, not the cron expression** (like
  `getDueMeasurementWindows`). Candidate videos come from `getRecentlyPublishedVideos(30)`.
  Taper: video age < 48h → sync if last sync > 4h stale; < 7d → 12h; < 30d → 24h; older →
  manual only.
- **Sync mechanics:** page `commentThreads.list` (`part=snippet,replies`, `order=time`,
  `maxResults=100`), newest-first, stopping at the stored `newest_comment_at` watermark or a
  500-comments-per-run cap (default). Upsert each comment by `comment_id`. Quota: 1 unit/page —
  negligible.
- **Manual "Sync now"** per video triggers the same path (202).
- **Analysis triggers** after any sync that ingested new or changed comments, plus a manual
  re-analyze control.
- Comments disabled or zero comments: record `last_synced_at` and count 0; not an error.

## AI analysis

- Batch the most relevant comments — top-level first, ranked by likes then recency, capped at
  200 (default) — into **one** `AITextService.generateText` call. Prompt-instructed JSON (no JSON mode
  exists), parsed with the fence-stripping + regex-fallback extractor idiom
  (`content-strategy-agent.js:476-492`), then a `normalize` pass clamping every field: flag
  labels against the enum, theme count, excerpt/summary lengths, sentiment proportions.
- Output: per-comment labels (sentiment + flags) and video-level themes
  (`{title, summary, kind: question|request|feedback|correction|praise, count, sampleCommentIds}`).
- **Quarantine rule:** `spam`/`scam`/`toxic` comments go to the attention bucket and are excluded
  from themes, reply drafting, and idea mining.
- **Weak fallback rule:** if AI is unavailable or the call fails, the deterministic fallback
  computes only mechanical facts (counts, question detection via punctuation; sentiment unknown),
  stamped `analysis_method: 'fallback'`. Fallback analysis **never** produces themes presented as
  insights, never proposes reply drafts, and never creates idea recommendations — the
  comment-domain analogue of "simulated analytics are never eligible for baselines."

## Reply drafts and posting

- **Operator-triggered only.** "Draft replies" per video targets reply-worthy comments
  (questions first, then high-engagement feedback), capped at 10 per run (default); a per-comment
  "Draft reply" button covers the rest. No automatic drafting — AI spend stays explicit.
- **Draft constraints:** brand voice from the existing brand guardrails config; no factual
  claims beyond what the video itself says; no links; 1,000-character cap. Never draft for
  nested comments (`comments.insert` only accepts top-level `parentId`s), the channel's own
  comments, or quarantined comments.
- **Lifecycle** (Shorts-service idiom): editable while `proposed`; **Approve & post** requires
  `confirmed: true` in the body, else 409 with `error.code = 'REPLY_APPROVAL_REQUIRED'`.
  A successful `comments.insert` stores the returned YouTube comment ID in
  `posted_comment_id`, stamps `posted_at`, sets `replied_by_agent` on the source comment, and
  locks the row. Failure → `failed` + `failure_reason`; retry is a manual re-approve. Discard
  is always available pre-post.
- **Daily posting cap:** default 50 posts/day (counted from `posted_at`), configurable via
  `ENGAGEMENT_DAILY_REPLY_CAP`. 50 posts × 50 quota units = 2,500 of the 10,000 daily quota — safe.

## OAuth scope migration

`comments.insert` requires `https://www.googleapis.com/auth/youtube.force-ssl`, which current
installs have not consented to. Reading public comments works under existing scopes.

- Add `youtube.force-ssl` to all three scope lists: `utils/credential-manager.js:106`,
  `oauth-server.js:124`, `modern-auth.js:33`.
- At service initialization, inspect the granted scopes on the stored token. If `force-ssl` is
  missing, the studio still syncs, analyzes, drafts, and mines — but posting is disabled:
  `getSummary()` reports `postingEnabled: false` with a reason, the approve button is disabled
  with an explanatory tooltip, and a remediation notice points at the existing
  walkthrough/OAuth re-consent flow. Nothing breaks for existing users; posting lights up after
  one re-authorization.

## Idea mining → operator

- Themes of kind `request` or `question` with ask-count ≥ 3 become
  `audience_demand` candidates (see Data model) and enter the standard
  pending → approved/rejected review flow. The existing route
  `POST /api/learning/recommendations/:id/:action` handles verdicts unchanged.
- **One contained edit** to `agents/content-strategy-agent.js` (`researchAndPlanChannel`,
  lines ~281-330): include each approved recommendation's `category` in the mapping passed to
  the planning prompt, so it can distinguish performance learnings from audience-requested
  topics and cite comment evidence when planning a video that answers one. The existing
  "only approved evidence is authorized" clause is unchanged.

## API routes

Studio idiom from `index.js` (service-null guard → 503; `res.status(error.status || 400)`;
`protect` on all mutations; GETs unprotected like the other read routes; `:videoId` validated
against `/^[A-Za-z0-9_-]{1,100}$/`):

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/engagement/:videoId` | GET | Stored comments, insights, and drafts for a video |
| `/api/engagement/:videoId/sync` | POST | Sync + analyze now (202) |
| `/api/engagement/:videoId/draft-replies` | POST | Generate drafts for reply-worthy comments |
| `/api/engagement/replies/:draftId` | PATCH | Edit `edited_text` or discard |
| `/api/engagement/replies/:draftId/approve` | POST | `{confirmed: true}` → post to YouTube |

The `/api/dashboard` aggregate gains an `engagement` key from `service.getSummary()`:
`{videosTracked, pendingDrafts, postedCount, needsAttentionCount, pendingAudienceIdeas,
postingEnabled, postingDisabledReason, recentThemes, evidencePolicy}` — with the
`evidencePolicy` string rendered verbatim by the UI, house style.

## Dashboard UI

New top-level **Engagement** view (vanilla-JS idiom): sidebar `nav-item`, a
`<section id="engagement-view" class="view">`, an entry in `switchView`'s titles map and the
hash-restore allowlist, and a `renderEngagement(state.engagement)` call in `renderDashboard()`.
A `ui.engagementVideoId` selection mirrors the retention panel's selector pattern.

Panels (each an `<article class="panel">` with eyebrow/heading/status-count):

1. **Overview** — sentiment split, comment counts, sync freshness, posting-enabled state.
2. **Themes** — theme cards with kind, count, and sample excerpts.
3. **Reply queue** — cards showing the original comment, the draft, an edit box, and
   approve/discard buttons; approve disabled with an explanatory `title` until preconditions
   pass (`postingEnabled`, `confirmed` checkbox, daily cap not hit).
4. **Needs attention** — the flag-only quarantine bucket with permalinks out to YouTube Studio.

Mined `audience_demand` recommendations also render here (filtered by category) using the
`renderLearning` approve/reject card pattern; they additionally appear in Analytics → "What the
agent learned" automatically since they share the table.

Events go through the two existing delegated `click`/`change` listeners with `data-*`
attributes; mutations use `mutate(...)`; polling piggybacks on the existing 8-second
`refreshDashboard` interval.

## Security

- **Comment text is hostile input.** This is the first feature rendering arbitrary
  public-user content in the dashboard. Every interpolation of comment text, author names, and
  AI-derived excerpts goes through the existing `escapeHTML` (`dashboard/app.js:12-19`), no
  exceptions. Permalinks are constructed from validated IDs, never from user-supplied URLs.
- Comment text entering AI prompts is data, not instructions: the analysis prompt explicitly
  instructs the model to treat comment content purely as material to classify, and normalization
  clamps outputs to enums either way.
- All mutating routes sit behind `requireAPIKey` via `protect`.
- Posting is fail-closed: no `posted` status without a returned YouTube comment ID.

## Error handling

- YouTube API failure during sync: store nothing, log an `automation_events` row, continue the
  sweep. Repeated failures surface through the existing failure-notification path.
- AI failure: weak fallback only (see Analysis); no drafts, no recommendations.
- Post failure (including comment deleted upstream): draft → `failed` with reason; manual retry.
- Missing scope: posting disabled with remediation; everything else works.
- Service errors carry `error.status` / `error.code` so routes stay six lines.

## Testing

Extend `test.js` in the existing style — no live API calls; YouTube list/insert and AI calls
injected as fakes via the service `options` (the injected-side-effects pattern):

- Table creation and accessor round-trips; upsert idempotency on `comment_id` and `video_id`.
- Sync-taper due logic across video ages and staleness.
- AI-JSON normalization against malformed/fenced/partial responses.
- Fingerprint dedupe for `audience_demand` recommendations across repeated analyses.
- Reply lifecycle: approve requires `confirmed`, posted rows lock, discard/replace semantics,
  failed → manual retry.
- Policy gates: fallback analysis produces no drafts and no recommendations; quarantined
  comments are excluded from drafting and mining; scope-gating disables posting.

## Out of scope (v1)

- Auto-reply lane (even opt-in).
- Moderation actions (`comments.setModerationStatus`); pin/heart (not in the public API).
- Drafting replies to nested comments (API limitation).
- Community-tab posts; multi-channel support.
- Editing or deleting already-posted replies.

## Files touched (implementation checklist)

- `database/db.js` — 3 tables + accessors (+ parse helpers)
- `utils/audience-engagement-service.js` — new
- `agents/content-strategy-agent.js` — category-aware approved-learnings mapping
- `schedules/daily-automation.js` — engagement sync cron slot
- `index.js` — service construction, 5 routes, dashboard aggregate key
- `utils/credential-manager.js`, `oauth-server.js`, `modern-auth.js` — `youtube.force-ssl`
- `dashboard/index.html`, `dashboard/app.js`, `dashboard/styles.css` — Engagement view
- `test.js` — regression coverage
- `README.md`, `CHANGELOG.md` — docs
