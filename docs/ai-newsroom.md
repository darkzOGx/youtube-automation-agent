# AI Newsroom

AI Newsroom decides **what to cover**, **why**, **how urgent it is**, and **which sources support it**. It does not generate or publish videos by itself. Approved events become `ContentIdea` rows and then enter the existing AgentTube pipeline: Script Writer → Provenance → Quality Gate → Human Review → Production → Publishing → Analytics.

## Architecture

```
Source adapters → Radar → normalize/dedup → Verification → Score
  → Research → Router → ContentIdea → existing AgentTube pipeline
```

Newsroom never bypasses factual review, media-rights confirmation, or human approval. Breaking News cannot auto-publish.

## Source adapters

Configured in `config/news-sources.json`.

| Source | Adapter | Role |
| --- | --- | --- |
| OpenAI News RSS | `rss` | Tier 1 official |
| Google Blog RSS | `rss` | Tier 1 official, AI-filtered |
| Hugging Face Blog RSS | `rss` | Tier 2 technical. Supports `<guid>` URL fallback |
| Hacker News Firebase API | `hackernews` | Tier 4 community signal only |
| Anthropic / DeepMind / Meta listings | `html` | Discovery only, same-host + path prefix |
| GitHub official API | `github` | Disabled until a later phase |
| Reddit | `reddit` | Disabled until authenticated access exists |

HTML discovery is **not** factual verification. Hacker News can surface a trend; it cannot confirm Breaking News.

### Add or disable a source

1. Edit `config/news-sources.json`.
2. Set `enabled` to `false` to disable without deleting the record.
3. Keep `hosts`, `tier`, and `type` accurate so scoring and verification stay honest.

## Verification

Status: `discovered` → `verifying` → `verified` | `conflicted` | `rejected`.

- Tier 1 official URLs (not HTML-only listings) can verify an event.
- Two independent technical/media sources can verify, but still cannot satisfy Breaking's primary-source rule.
- Community-only evidence stays `discovered`.
- Material numeric conflicts are marked `conflicted` and require a human.

## Scoring (`news-score-v1`)

Deterministic, not LLM-chosen:

| Component | Range |
| --- | --- |
| Freshness | 0–20 |
| Source authority | 0–20 |
| Impact | 0–20 |
| Trend velocity | 0–15 |
| Audience fit | 0–15 |
| Verification | 0–10 |

Routing thresholds: 90 Breaking candidate, 75 AI Today, 60 standard, 45 watchlist, below 45 ignore.

**Breaking requires score ≥ 90 AND a verified primary source.** A viral HN post with score 95 is not Breaking.

## Content routes

`breaking` · `ai_today` · `tutorial` · `review` · `comparison` · `weekly_digest` · `watchlist` · `ignore`

Vietnamese spoken scripts; product and model names stay in English.

## Scheduler

Set `NEWSROOM_ENABLED=true` to run:

- radar cycle every `NEWSROOM_SCAN_INTERVAL_MINUTES` (default 30)
- AI Today prep daily at 05:00
- weekly digest candidates Sunday 07:00

Overlapping runs are skipped. Manual `POST /api/newsroom/scan` works even when scheduled scans are off.

`NEWSROOM_AUTO_CREATE_IDEAS=true` creates backlog ideas for non-breaking routes. Breaking still needs operator approval. Ideas never auto-publish.

## Dashboard

Open **AI Newsroom**:

- Live radar with score, verification, and route
- Event desk: sources, score breakdown, research, conflicts
- Actions: Verify, Research, Create idea, Approve, Reject, Hold, change route, downgrade Breaking → AI Today
- Source health and run history

## API

All mutating routes honor `API_KEY` / `x-api-key` like the rest of the operator API.

- `GET /api/newsroom/events`
- `GET /api/newsroom/events/:id`
- `GET /api/newsroom/events/:id/sources`
- `GET /api/newsroom/events/:id/research`
- `GET /api/newsroom/health`
- `POST /api/newsroom/scan`
- `POST /api/newsroom/events/:id/verify|score|research|route|create-idea|approve|reject|hold|generate`

## Tests

```bash
npm test
```

Newsroom cases live in `newsroom-tests.js` and use fixtures under `fixtures/newsroom/`. They do not require live network access.

## Breaking safety

Before a Breaking video can publish, AgentTube still requires primary-source verification, provenance, factual review, media-rights confirmation, the quality gate, and human approval. Newsroom approval only creates/feeds a Content Idea.
