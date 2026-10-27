# Troubleshooting

Most problems show up in the startup capability check (the `🔎 Capability check:` block when you run `npm start`) or in the job's error in the dashboard. Start there.

| Problem | Fix |
| --- | --- |
| `Missing credentials for: an AI provider` | Configure any one text provider with `npm run walkthrough` or `npm run credentials:setup`. OpenAI isn't required. |
| Google sign-in shows `Error 403: access_denied` | Add your Google account as a test user under **Google Auth Platform → Audience**. While the app is in Testing mode, Google expires the sign-in after 7 days. |
| No video is produced, or it's marked simulated | Read the ✗ lines in the startup capability check. Make sure you ran `npx playwright install chromium` and that FFmpeg is available (`npm install` fetches it, or set `FFMPEG_PATH`). |
| Images or thumbnails are missing | Image generation needs OpenAI, or Gemini with billing enabled. The content review panel shows the provider's exact error. |
| Narration failed (for example, ElevenLabs HTTP 400) | Check the key, its credits, and that `ELEVENLABS_VOICE_ID` is a voice in your account, then use **Regenerate narration only**. |
| `Error loading sharp module` on Android/Termux | Update to the latest `master`, then run `rm -rf node_modules && npm install --cpu=wasm32`. |
| The publishing queue runs but nothing publishes | Approved videos publish at their scheduled time (default: the next day at 2 PM). |
| YouTube API quota exceeded | Check quotas in Google Cloud Console and reduce posting frequency. |
| Content generation failed | Check your keys and credits, the job's error in the dashboard, and `logs/`. |
| The dashboard is unreachable from another device | It listens on `127.0.0.1` by default. Set `HOST=0.0.0.0` and an `API_KEY` in `.env`. See [environment variables](providers.md#environment-variables). |

## Debug logging

```bash
LOG_LEVEL=debug NODE_ENV=development npm start
```

Logs are written to `logs/`.

## Getting help

Questions and setup help go in [Discussions](https://github.com/darkzOGx/youtube-automation-agent/discussions). Issues are for bugs; the bug report template asks for the capability check block, which diagnoses most problems instantly.
