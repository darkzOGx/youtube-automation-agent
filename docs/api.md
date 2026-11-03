# HTTP API

The dashboard server exposes an HTTP API on the same port, `http://localhost:3456` by default. It listens on `127.0.0.1` unless you set `HOST`. When `API_KEY` is set in `.env`, every request that changes something must send it in the `x-api-key` header.

## Common requests

```bash
# health check
curl http://localhost:3456/health

# queue a video-generation job
curl -X POST http://localhost:3456/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"topic": "Top 10 Life Hacks", "style": "list"}'

# inspect the returned background job
curl http://localhost:3456/api/jobs/:jobId

# resume a failed/interrupted job from its first incomplete checkpoint
curl -X POST http://localhost:3456/api/jobs/:jobId/resume \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{}'

# intentionally regenerate a selected stage and everything after it
curl -X POST http://localhost:3456/api/jobs/:jobId/resume \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"stage":"thumbnail"}'

# inspect the latest production-readiness evidence
curl http://localhost:3456/api/readiness

# run harmless live probes; add {"includePaidMedia":true} only to test paid image generation
curl -X POST http://localhost:3456/api/readiness/run \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"includePaidMedia":false}'

# save a channel strategy
curl -X PUT http://localhost:3456/api/operator/strategy \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"objective":"Own practical AI automation for small teams","audience":"Small business operators","contentPillars":["AI workflows","Automation playbooks"],"cadencePerWeek":2,"videosPerRun":2,"defaultFormat":"tutorial","defaultLength":"medium","primaryKpi":"subscribers","targetValue":100,"targetWindowDays":28,"monthlyBudget":250,"outcomeCurrency":"USD","status":"draft"}'

# activate the saved strategy and start a background operator run
curl -X POST http://localhost:3456/api/operator/start \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{}'

# resume an interrupted operator run from its saved plan
curl -X POST http://localhost:3456/api/operator/runs/:runId/resume \
  -H "x-api-key: $API_KEY"

# view schedule
curl http://localhost:3456/schedule

# get analytics
curl http://localhost:3456/analytics

# get the goal-aligned Outcome & ROI Studio summary
curl http://localhost:3456/api/outcomes

# approve an evidence-backed learning for future autonomous plans
curl -X POST http://localhost:3456/api/learning/recommendations/:recommendationId/approve \
  -H "x-api-key: $API_KEY"

# inspect controlled experiments and eligible published videos
curl http://localhost:3456/api/experiments

# create and approve a packaging test plan (start/adopt are separate confirmed actions)
curl -X POST http://localhost:3456/api/experiments \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"productionId":"production-id","armDurationHours":48,"minImpressions":1000}'
curl -X POST http://localhost:3456/api/experiments/:experimentId/approve \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"confirmed":true}'

# inspect, edit, and approve content before scheduling
curl http://localhost:3456/api/content/:contentId
curl -X POST http://localhost:3456/api/content/:contentId/approve \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"privacyStatus":"private","factChecked":true,"rightsConfirmed":true}'
```

## Route reference

### Status and dashboard

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET | `/api/dashboard` | Data behind the dashboard |
| GET | `/schedule` | Publishing schedule |
| GET | `/analytics` | Analytics summary |
| GET | `/api/analytics/channel` | Whole-channel YouTube snapshot |
| GET | `/api/readiness` | Latest production-readiness result |
| POST | `/api/readiness/run` | Run the readiness check |
| PUT | `/api/settings` | Update settings |
| PUT | `/api/profile` | Update the channel profile |
| POST | `/api/automation/:action` | `pause` or `resume` scheduled automation |
| POST | `/api/notifications/:notificationId/read` | Mark a notification as read |

### Generation jobs and ideas

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/generate` | Queue a video-generation job |
| GET | `/api/jobs/:jobId` | Job status and progress |
| POST | `/api/jobs/:jobId/resume` | Resume from the first incomplete stage, or from `stage` |
| POST | `/api/jobs/:jobId/cancel` | Cancel a job |
| POST | `/api/ideas` | Add a content idea |
| PATCH | `/api/ideas/:ideaId` | Edit an idea |
| POST | `/api/ideas/:ideaId/generate` | Generate a video from an idea |

### Content review and publishing

| Method | Route | Purpose |
| --- | --- | --- |
| GET, PATCH | `/api/content/:productionId` | Read or edit a production |
| POST | `/api/content/:productionId/approve` | Approve for scheduling |
| POST | `/api/content/:productionId/reject` | Reject a production |
| POST | `/api/content/:productionId/retry` | Start a new generation job for this production |
| POST | `/api/content/:productionId/publish-now` | Publish immediately |
| PATCH, DELETE | `/api/content/:productionId/schedule` | Reschedule, or remove the schedule without deleting content |
| POST | `/publish/:contentId` | Publish a production or a Short |
| PUT | `/api/content/:productionId/provenance` | Update the evidence desk |
| POST | `/api/content/:productionId/discoverability/run` | Run the discoverability preflight |
| PATCH | `/api/discoverability/findings/:findingId` | Keep or dismiss a finding |
| GET | `/api/content/:productionId/asset/:kind` | Download `video`, `thumbnail`, `captions`, or `script` |

### Scenes and narration

| Method | Route | Purpose |
| --- | --- | --- |
| PATCH | `/api/content/:productionId/scenes/:sceneId` | Edit a scene |
| GET | `/api/content/:productionId/scenes/:sceneId/asset` | Scene asset |
| GET | `/api/content/:productionId/scenes/:sceneId/estimate` | Estimate for regenerating a scene |
| POST | `/api/content/:productionId/scenes/:sceneId/regenerate` | Regenerate one scene |
| POST | `/api/content/:productionId/scenes/:sceneId/narration` | Regenerate one scene's narration |
| POST | `/api/content/:productionId/scenes/reorder` | Reorder scenes |
| POST | `/api/content/:productionId/scenes/rebuild` | Rebuild the final video |
| POST | `/api/content/:productionId/narration/silence` | Set or clear an intentional-silence override |

### Shorts

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/content/:productionId/shorts/propose` | Create Short drafts |
| PATCH | `/api/content/:productionId/shorts/:clipId` | Edit a Short draft |
| POST | `/api/content/:productionId/shorts/:clipId/render` | Render a Short |
| POST | `/api/content/:productionId/shorts/:clipId/approve` | Approve and schedule a Short |
| GET | `/api/content/:productionId/shorts/:clipId/asset/:kind` | Download a Short's `video` or `captions` |

### Operator, learning, and experiments

| Method | Route | Purpose |
| --- | --- | --- |
| PUT | `/api/operator/strategy` | Save the channel strategy |
| POST | `/api/operator/start` | Activate the strategy and start a run |
| POST | `/api/operator/pause` | Pause the operator |
| POST | `/api/operator/runs/:runId/resume` | Resume a run from its saved plan |
| POST | `/api/operator/runs/:runId/cancel` | Cancel a run |
| POST | `/api/learning/recommendations/:recommendationId/:action` | `approve` or `reject` a recommendation |
| GET, POST | `/api/experiments` | List experiments, or create a test plan |
| POST | `/api/experiments/:experimentId/:action` | `approve`, `start`, `refresh`, `adopt`, or `cancel` |
| GET | `/api/outcomes` | Outcome & ROI summary |
| GET | `/api/retention/:videoId` | Stored scene-aware retention |
| POST | `/api/retention/:videoId/refresh` | Refresh the retention curve from YouTube |

### Engagement

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/engagement/:videoId` | Comment insights for a video |
| POST | `/api/engagement/:videoId/sync` | Sync comments now |
| POST | `/api/engagement/:videoId/draft-replies` | Draft suggested replies |
| PATCH | `/api/engagement/replies/:draftId` | Edit a draft reply |
| POST | `/api/engagement/replies/:draftId/approve` | Approve and post a reply |
