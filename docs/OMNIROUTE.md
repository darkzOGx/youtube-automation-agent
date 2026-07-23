# OmniRoute walkthrough

OmniRoute can be used as this project's text-generation gateway. The app sends
OpenAI-compatible chat-completion requests to OmniRoute; OmniRoute owns upstream
provider credentials, model routing, quotas, and failover.

This integration affects script/text generation only. Images, TTS, and video
generation still need the media providers documented in `.env.example`.

## 1. Start and configure OmniRoute

Run your OmniRoute instance and open its dashboard (the standard local address
is `http://127.0.0.1:20128`). In OmniRoute:

1. Add at least one upstream provider account.
2. Test the provider from the OmniRoute dashboard.
3. Create or confirm the combo/model you want this app to call, for example
   `auto/smart`.
4. Configure an API key for clients if your instance requires one.

Do not copy upstream provider credentials into this repository. Keep them in
OmniRoute; this app needs only OmniRoute's client key.

## 2. Verify OmniRoute independently

Before configuring the app, verify its OpenAI-compatible inference surface:

```bash
export OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1
export OMNIROUTE_API_KEY='replace-with-your-client-key'

curl -fsS "$OMNIROUTE_BASE_URL/models" \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY"
```

Then test the exact combo/model:

```bash
curl -fsS "$OMNIROUTE_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"auto/smart","messages":[{"role":"user","content":"Reply with: OK"}],"max_tokens":16}'
```

The base URL must include `/v1`. The management API uses `/api/*`; do not use a
management URL as the inference base URL.

## 3. Configure this project

Recommended interactive setup:

```bash
npm run walkthrough
```

Choose `OmniRoute`, enter the OmniRoute client key, and select a combo. To use a
remote or nonstandard instance, set `OMNIROUTE_BASE_URL` before running the
walkthrough.

Environment-only setup is also supported:

```env
OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1
OMNIROUTE_API_KEY=replace-with-your-client-key
OMNIROUTE_MODEL=auto/smart
```

Never commit `.env` or `config/credentials.json`.

## 4. Validate the app

```bash
npm test
npm run lint
```

Generate one draft privately before enabling scheduled uploads. Confirm the logs
show `OmniRoute initialized` and the expected model/combo. The interactive
credential wizard is available with `npm run credentials:setup` if you need to
change only the provider later.

## Troubleshooting

- `404`: the base URL usually lacks `/v1`, or points at `/api` management routes.
- `401`/`403`: the client key is missing/invalid, or OmniRoute rejected the
  selected upstream account.
- `model not found`: check `GET /v1/models` and use an exact returned combo/model
  identifier.
- intermittent upstream errors: test provider health in OmniRoute, disable an
  exhausted account there, and keep failover logic in OmniRoute rather than in
  this app.
- images or narration fail while scripts work: OmniRoute is text-only in this
  integration; configure a media provider separately.

## Architecture

```text
YouTube Automation Agent
  -> OMNIROUTE_BASE_URL (/v1/chat/completions)
    -> OmniRoute combo/router
      -> configured upstream provider(s)
```

The app intentionally treats OmniRoute as one gateway. Upstream providers and
their fallback policy remain separated from application configuration.