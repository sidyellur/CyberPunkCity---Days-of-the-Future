# Working on this repo

Several agents work here in parallel. Read this before changing anything.

## Base branch

The 3D game is the game. If `main` does not contain `src/city/` and `src/slice/stage.ts`, it is
behind: branch from `layer-1-building` instead. Work on your own branch and open a pull request;
do not push to someone else's branch.

## Who owns what

| Area | Files | Owner |
| --- | --- | --- |
| Visuals: how the city looks | `src/slice/stage.ts`, `src/slice/city.ts`, `src/slice/main.ts`, `src/slice/slice.css`, `slice.html` | Visuals agents (Codex) |
| Engines: how the city works | `src/city/model.ts`, `src/city/architect.ts`, future `src/city/*.ts` rule modules, `tests/` | Engine agent (Claude) |
| Game shell and HUD | `src/city/main.ts`, `src/city/game.css`, `index.html` | Shared. Keep edits small and say what you touched in the PR. |
| 2D prototype | `classic.html`, `src/sim/`, `src/ui/`, `src/main.ts`, `src/style.css` | Frozen. Reference for the conflict layer; do not restyle. |

If you need something from the other side, add to the contract below in the same PR rather than
reaching across it.

## The contract between engine and visuals

The engine never imports three.js. The shell (`src/city/main.ts`) is the only place they meet, and
it relies on exactly this from the visuals side:

- `createStage(canvas, reducedMotion)` returning a `Stage` with `scene`, `camera`, `controls`,
  `shared`, `canvas`, `rain`, `glow`, `touch`, `walking`, `walkHold`, `setView(street)`, `onView`,
  `pick(clientX, clientY)` (ground point) and `frame(dt, t, rising, spire, spireTop, busy)`.
- `buildBlock(shared, bx, bz, seed, style, falloff)` returning a `Block` whose `structures` each
  have `height`, `p`, `from`, `start`, `rise`, `done`, `x`, `z`, `radius`.
  **The same `(bx, bz, seed)` must always give the same lots in the same order**, whatever the
  style. Growing a district rebuilds its block with a taller style and matches structures by index.
- `animateStructure(block, structure, index, now)`, `disposeBlock(block)`, `buildSpire(shared)`,
  `blockCenter(bx, bz)`, and the layout constants `BLOCK`, `PITCH`, `ORIGIN` (a 9 x 9 grid of
  blocks with the Architect's plaza in the centre).
- `BlockStyle` fields: `height`, `park`, `signs`, `palette`, `windows`, optional `lots`, `slim`.
  The shell maps each district intent to a style in `LOOK` in `src/city/main.ts`. New style fields
  are welcome if they are optional.

### District kits

Richer buildings plug in per kind of district, without touching the generator. A kit is one file,
`src/slice/kits/<name>.kit.ts`, default-exporting a `RegisteredKit` (see `src/slice/kits/index.ts`);
the game finds it through `kitFor(intent, character)` in `styleFor` (`src/city/main.ts`). The rules
a kit must follow are at the top of `src/slice/kits/kit.ts`, and `tests/kits.test.ts` checks every
registered kit: at most 3 meshes per lot, shared materials only, no lights, deterministic, and
designed from the roof down so a level-up does not change the visible top. Preview a kit at
`kits.html?kit=<id>&intent=<intent>&level=1..4&grow=1`; `node scripts/kitshots.mjs <dir> <id> <baseUrl> <intent>`
saves screenshots and prints draw calls and triangles.

Anything behind those names is free to change: geometry, materials, lighting, post-processing,
weather, street life, level of detail.

## Constraints that are easy to break

- No art asset files. Everything is generated in code, and signage uses an invented script so no
  real brand or language appears.
- It must run on a phone. Keep a cheaper path when `stage.glow` is off, and keep draw calls in mind:
  a full city is about 80 blocks.
- `npm run single` must still produce self-contained single files. No runtime fetches.
- Respect `prefers-reduced-motion`.

## Before you open a PR

```
npx tsc            # type check
npm test           # simulation tests, including two scripted players
npm run build
node scripts/cityplay.mjs <screenshot-dir>     # needs `npx vite preview --port 4179` running
node scripts/sliceshots.mjs <screenshot-dir>
```

The two browser scripts drive the game and the visual slice in headless Chromium and save
screenshots. Look at the screenshots; do not report a visual change as done without them.
