# Contributing

Thanks for contributing! This project moves fast and PRs are reviewed regularly — a few ground rules keep that possible.

## Ground rules

1. **One concern per PR.** A focused 50-line PR merges in days; a 6,000-line PR mixing features can't be responsibly reviewed. If your change has independent parts, stack them as separate PRs.
2. **Don't regenerate `package-lock.json`** unless your PR is specifically about dependencies. Lockfile churn hides real changes and is a supply-chain review burden.
3. **Lint and tests must pass** — CI runs `npm run lint` and `npm test` on every PR. If you fix a bug, add a regression test in `test.js` (see the existing `SystemTest` methods for the pattern).
4. **Rebase on `master`** before opening or updating a PR.
5. **Describe how you tested it.** "Ran `npm start`, generated a video with Gemini-only credentials, verified a real .mp4 appeared in `data/videos/`" beats any amount of code description.

## Getting started

```bash
git clone <your-fork>
cd youtube-automation-agent
npm install        # also fetches the bundled FFmpeg binary
npm test           # 12 system tests, no credentials needed
npm run lint
```

You don't need API keys to work on most of the codebase — the test suite and the simulation fallbacks run without them. For end-to-end runs, `npm run setup` walks you through credentials (any one AI provider is enough).

## Where help is most wanted

Check the [open issues](https://github.com/darkzOGx/youtube-automation-agent/issues) and the roadmap in the latest [release notes](https://github.com/darkzOGx/youtube-automation-agent/releases). Current priorities: Gemini image/TTS parity, slideshow rendering performance, and template-content quality.

## Reporting bugs

Use the bug report template — it asks for the startup capability check (`🔎 Capability check:` block), which diagnoses most issues instantly.
