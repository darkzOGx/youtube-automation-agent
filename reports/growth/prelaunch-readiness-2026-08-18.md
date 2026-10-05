# Lumen pre-launch readiness — 2026-08-18

## Completed in repository

- Captured the GitHub traffic, clone, referrer, star-growth, and public-fork baseline.
- Added a repeatable `npm run growth:snapshot` collector.
- Added local-only activation milestones for setup, first real MP4, approval, publication, and second real MP4.
- Added an anonymous milestone reporter that is off by default, requires an explicit HTTPS endpoint, and sends only allowlisted fields.
- Reworked the README around the product outcome and moved release history to `CHANGELOG.md`.
- Reconciled in-repository model IDs and removed unsupported price/free-tier claims.

## Launch blockers

- [ ] Capture a real 30–45 second dashboard demo from a verified end-to-end run.
- [ ] Publish three verified outputs using the evidence template under `examples/`.
- [ ] Run a clean Gemini-first installation through a real non-simulated MP4.
- [ ] Synchronize the external Mintlify site with the repository. Its source is not present in this checkout, and the live site still contains older setup, model, and cost claims.
- [ ] Replace the repository homepage field with the documentation URL only after the documentation is synchronized.
- [ ] Review the high-signal public forks identified in the fork census for real use cases and potential contributors.

## Evidence rules

- Do not present generated or seeded dashboard data as a customer run.
- Do not call a video verified unless the final file exists, carries an MP4 container signature, and is not marked simulated.
- Record provider, elapsed generation time, estimated API cost, human editing time, and final-video URL for every gallery example.
- Keep GitHub visitor-to-clone figures labeled as directional indicators rather than cohort conversion rates.
