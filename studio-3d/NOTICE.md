# Provenance and attribution

The simulation, interface, and store code in `src/` is derived from **The Delegation**:

- Upstream: <https://github.com/arturitu/the-delegation>
- Commit: `16c97c43d1c32fae797ace4ed8058157e1126c96` (2026-04-04)
- Author: Arturo Paracuellos — <https://unboring.net>
- Code license: MIT (see [LICENSE](LICENSE))

## What was changed

- Removed the in-browser LLM layer entirely: `src/core/` (AgentBrain, PromptBuilder,
  ToolRegistry, agent tools, Gemini provider, pricing), the BYOK/pricing/audit/chat UI,
  and the token and cost accounting in `coreStore`. The browser holds no API key —
  AgentTube manages provider credentials on the server.
- Removed the editable team configurator. The team here is fixed: it mirrors
  AgentTube's real agents.
- Replaced `src/data/agents.ts` with AgentTube's own pipeline roles.
- Added `src/bridge/`, which polls AgentTube's existing `/api/dashboard` and projects
  real generation-job state into the store the simulation already reads.

`src/simulation/` is otherwise unmodified apart from raising `MAX_AGENTS` and dropping
the chat handler from `SceneManager`.

## 3D assets

`character.glb` and `office.glb` are **not** included in this repository. They are
licensed **CC BY-NC 4.0** by Arturo Paracuellos — attribution required, commercial use
prohibited. `npm run assets` fetches them from the upstream repository for personal and
educational use.

**This means the 3D view is not available for commercial use** with these assets, even
though the rest of AgentTube is MIT. For commercial licensing of the models, see
<https://unboring.net>. Alternatively, supply your own `character.glb` and `office.glb`
following the conventions in [docs/3d-assets.md](../docs/3d-assets.md).

The Draco decoder under `public/vendor/draco/` is Apache-2.0, from the Draco project,
and is copied out of the installed `three` package by `npm run assets`.
