# 3D assets for the studio view

The `/studio` view needs two glTF files that this repository does **not** ship:

| File | What it provides |
| --- | --- |
| `studio-3d/public/models/character.glb` | One rigged character, instanced per agent |
| `studio-3d/public/models/office.glb` | The office, its navigation mesh, and its points of interest |

## The default assets, and their licence

`npm run studio:assets` fetches the originals from
[the-delegation](https://github.com/arturitu/the-delegation) at the pinned commit the
simulation was adapted from.

They are **CC BY-NC 4.0** by Arturo Paracuellos (unboring.net):

- Attribution is required. The studio credits unboring.net in its header and info modal;
  keep that credit if you modify the UI.
- **Commercial use is prohibited.** The models may not be used in projects that generate
  revenue.

AgentTube exists to run a channel, and a monetized channel is revenue-generating. So if
your channel earns money, either license the models commercially via
[unboring.net](https://unboring.net), or supply your own using the conventions below.
The rest of AgentTube — pipeline, agents, dashboard, publishing — is MIT and unaffected;
`/studio` is the only part that touches these files.

## Supplying your own models

The loaders are in [`CharacterManager`](../studio-3d/src/simulation/entities/CharacterManager.ts)
and [`WorldManager`](../studio-3d/src/simulation/world/WorldManager.ts). Both read from
`public/models/` and both accept Draco compression.

### `character.glb`

A single skinned mesh whose animation clips are named exactly as the `AnimationName`
enum in [`types.ts`](../studio-3d/src/types.ts) expects:

`Idle`, `Walk`, `Talk`, `Listen`, `Sit`, `Sit_Idle`, `Sit_Work`, `LookAround`, `Happy`,
`Sad`, `Pick`, `Wave`

Per-agent colour is applied as an instance attribute, so the mesh should use a material
that respects it. Facial expressions come from an atlas; see `ExpressionBuffer`.

### `office.glb`

Geometry plus two conventions:

- A mesh named for the navigation mesh, consumed by `NavMeshManager`.
- Empties named `poi-<arrivalState>-<id>`, parsed by
  [`PoiManager.parseFromScene`](../studio-3d/src/simulation/world/PoiManager.ts). The
  arrival state is a `CharacterStateKey`.

  Names the studio looks for specifically:

  | Pattern | Used for |
  | --- | --- |
  | `poi-sit_work-<id>` | Desks. An agent working a stage walks to one. |
  | `poi-sit_idle-<id>` | Seats for idle wandering. |
  | `poi-area-boardroom` | Where an agent goes when its stage fails. |
  | `poi-area-<id>` | Common areas for idle wandering. |
  | `poi-spawn-<agentIndex>` | Where an agent returns after finishing. |
  | `poi-idle-spawn-<agentIndex>` | Where the lead agent celebrates a finished video. |

A missing POI is handled: `setNpcWorking` falls back to any free `sit_work` desk, and an
absent boardroom simply means no walk happens.

## Running without assets

The studio detects missing models and shows the fetch instructions instead of crashing
(see `SceneManager.init`). The dashboard, pipeline, and publishing are never affected.
