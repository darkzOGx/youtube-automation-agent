# ELENA integration contract

AgentTube provides two fixed mission tools for an ELENA instance. ELENA remains the control plane; this service does not add a bot, webhook listener, generic tool dispatcher, or workspace-management API.

## Enablement and binding

Set both values in the AgentTube `.env` file:

```dotenv
ELENA_INTEGRATION_TOKEN=<unique random secret, at least 32 UTF-8 bytes>
ELENA_WORKSPACE_ID=<the one ELENA workspace allowed to use this AgentTube installation>
```

The integration is disabled with HTTP `503` if the token is missing, malformed, or shorter than 32 bytes, or if the workspace binding is missing. Generate a unique secret and keep it in the ELENA and AgentTube secret stores. Do not reuse `API_KEY`; the integration token is independent of the dashboard API key.

This is a **single-workspace binding, not tenant isolation**. Every request must include the exact configured `workspaceId`; other IDs receive HTTP `403`. The application still uses its one local database, credential set, and connected YouTube channel. Do not bind multiple ELENA workspaces to one AgentTube installation or treat the request ID as a per-workspace database boundary.

## Authentication

Send the integration token only as a bearer credential over HTTPS:

```http
Authorization: Bearer <ELENA_INTEGRATION_TOKEN>
Content-Type: application/json
```

Missing or invalid credentials receive HTTP `401`. Do not place the token in URLs, mission arguments, logs, or client-visible output. Keep this API on a private network or behind a TLS-terminating reverse proxy; do not expose it over plain HTTP.

## Allowlisted mission tools

Only these exact `POST` routes are ELENA integration tools. Unknown request properties are rejected. There is no route for arbitrary method dispatch. At the network edge, allow the ELENA service identity to reach only these two paths and deny it access to the rest of the dashboard/API; the shared AgentTube listener also serves other existing routes.

### `POST /api/elena/research`

Request:

```json
{
  "workspaceId": "configured-workspace-id",
  "topic": "battery recycling"
}
```

`topic` must be a non-empty string of at most 200 characters. This action refreshes the existing YouTube trend and configured-competitor analysis, then returns up to five matching trend signals with verified YouTube evidence URLs. It is not a general web search, and an empty result means no matching current signal was found.

Successful response (`200`):

```json
{
  "success": true,
  "workspaceId": "configured-workspace-id",
  "result": {
    "requestedTopic": "battery recycling",
    "generatedAt": "2026-10-19T16:00:00.000Z",
    "signals": [
      {
        "topic": "Example matching signal",
        "score": 1.25,
        "sources": ["trending"],
        "evidence": [
          {
            "title": "Example public YouTube video",
            "url": "https://www.youtube.com/watch?v=example",
            "publisher": "Example publisher"
          }
        ]
      }
    ],
    "note": "Signals are current YouTube trend and configured-competitor evidence; they are not a comprehensive topic search."
  }
}
```

### `POST /api/elena/drafts`

Request:

```json
{
  "workspaceId": "configured-workspace-id",
  "topic": "battery recycling",
  "angle": "Explain the tradeoffs for municipal programs",
  "contentType": "explainer",
  "length": "medium"
}
```

Only `workspaceId` and `topic` are required. `angle` is optional, at most 500 characters. `contentType` is optional and must be `explainer`, `tutorial`, `list`, `review`, or `story`. `length` is optional and must be `short`, `medium`, or `long`.

Successful response (`201`) contains a saved script draft and explicit approval state:

```json
{
  "success": true,
  "workspaceId": "configured-workspace-id",
  "result": {
    "status": "draft",
    "approvalRequired": true,
    "approved": false,
    "script": {
      "title": "Example script title",
      "hook": "Example opening hook",
      "fullScript": "Draft script text",
      "duration": 480,
      "keywords": ["battery recycling"],
      "claims": [],
      "generatedAt": "2026-10-19T16:00:00.000Z"
    }
  }
}
```

The draft action may call the configured text-generation provider and saves a content strategy and script in the existing local database. The saved script remains an unapproved draft. It does not create a video, generation job, production, approval, schedule, or upload.

## Permission and control boundary

ELENA requests can invoke only the two routes above. They cannot publish, schedule or reschedule, approve content, start/resume/cancel generation jobs, modify channel settings, pause/resume automation, or start/resume/cancel the Autonomous Channel Operator. Those controls remain outside this integration and under the existing human-review workflow. The application may initialize its existing scheduler at normal application startup; neither ELENA endpoint starts or controls that scheduler.

Invalid input returns `400`; a workspace mismatch returns `403`; unavailable setup or integration configuration returns `503`; provider/research failures return a generic `502`; a concurrent ELENA request returns `429`. Provider errors are logged locally rather than returned to ELENA.

## Required network permissions and secrets

- **ELENA runtime → AgentTube:** allow outbound HTTPS to this AgentTube installation's private/reverse-proxied host and port, only for `POST /api/elena/research` and `POST /api/elena/drafts`. The service uses the configured `HOST`/`PORT` listener; keep it network-restricted.
- **AgentTube → YouTube/Google:** research uses the connected YouTube Data API (`youtube.googleapis.com`) for public trend and configured-competitor data. The existing OAuth credential/token setup must be valid; normal OAuth token refresh may contact `oauth2.googleapis.com`.
- **AgentTube → configured AI text provider:** draft strategy/script generation uses the configured provider when available. The supported provider hosts are `api.openai.com`, `generativelanguage.googleapis.com`, `openrouter.ai`, `api.moonshot.ai`, `api.xiaomimimo.com`, or `api.z.ai`; permit only the host selected/configured for this installation. No video, image, TTS, or publishing-provider access is needed by these ELENA routes.
- Store `ELENA_INTEGRATION_TOKEN`, existing AI provider keys, and YouTube OAuth credentials as secrets. `ELENA_WORKSPACE_ID` is a binding identifier, not an authentication secret.

If the service is hosted remotely, enforce TLS, source-network restrictions, and secret rotation at the deployment/reverse-proxy layer. The integration itself does not provide per-user authorization or multi-tenant data isolation.
