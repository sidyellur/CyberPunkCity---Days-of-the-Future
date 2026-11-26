# CyberPunk City: Days of the Future

A city-building game set two hundred years from now, when cities are not built by hand. You decide
what the city needs; a superintelligence, the Architect, designs it and raises it. Runs in the
browser, in 3D, with every tower, sign and street generated in code (no art assets).

The plan is four layers, tracked as issues: building (#1), administration (#2), conflict (#3) and
eras (#4). **Layers 1 and 2, building and administration, are playable today.** The Layer 3 rules
engine exists (`src/city/conflict.ts` on the `layer-3-conflict-engine` branch) but is not wired into the game yet.

## Play

```
npm install
npm run dev        # http://localhost:5173
```

`npm run single` builds self-contained single files in `dist/` that can be opened or hosted anywhere.

## How it plays

- **Brief the Architect.** Pick an empty lot, choose what should stand there (housing, vertical
  farms, industry, commerce, power, green space, research) and its character (dense, balanced,
  green). The Architect projects a plan, then raises the district.
- **Or approve its proposals.** The Architect watches the city's numbers and proposes the next move
  with a reason. Approve it, ignore it, or brief something else. It is rule-based (`src/city/architect.ts`).
- **One economy.** Districts provide homes, jobs, food, alloy, credits, power and data. Citizens
  staff the jobs; a brownout or hunger cuts output and morale; morale drives growth.
- **Neighbours matter.** Homes beside industry are unhappy, homes beside green space are happier,
  and shops next to homes earn more.
- **Build upward.** Upgrade the Architect to grow districts to higher levels; towers get taller.
- **Walk it.** The Street button drops you to eye level between the towers.

- **Govern.** Three groups of citizens (Labour, Enterprise, Commons) want different things. Four
  policies (wealth, oversight, housing, working hours) each please some and anger others. Unhappy
  groups strike.
- **Decide how much to trust the AI.** The autonomy dial runs from Advisory (nothing happens without
  you) to Sovereign (the Architect runs the city, policy included). More autonomy is faster; people
  trust it less. The Architect also proposes initiatives, some of them efficient and troubling, and
  the city throws up crises with two real choices.

There is no fighting or way to lose yet; that arrives with Layer 3.

## Pages

| Page | What it is |
| --- | --- |
| `index.html` | The game (Layer 1). Source in `src/city/`. |
| `slice.html` | District 07 in 2250. Orbit Meridian Exchange, view the canal and orbital tether from Overview, or walk through the night market. The Architect can regenerate the showcase in three styles. Source in `src/slice/`. |
| `classic.html` | The first 2D prototype, with squads and a raiding rival. Source in `src/sim/` and `src/ui/`. Its combat rules are the starting point for Layer 3. |

## Code

- `src/city/model.ts`: the city simulation. Pure, DOM-free, plain-JSON state. Balance numbers live here.
- `src/city/architect.ts`: the Architect's rules for what to propose and where.
- `src/city/governance.ts`: Layer 2 rules: groups, policies, trust, autonomy, initiatives, events.
  It writes `state.mods`, which the model reads. `src/city/govhud.ts` is its HUD markup.
- `src/city/main.ts`: game shell: brief flow, HUD, keeping the 3D city in step with the simulation.
- `src/slice/city.ts`: generates a city block from a seed and a style. The same seed gives the same
  lots, so growing a district makes its existing towers taller.
- `src/slice/stage.ts` supplies the playable city with its 3D stage.
- `src/slice/district07.ts` generates the showcase district and its landmarks for `slice.html`.
- `tests/city.test.ts`: rules, plus two scripted players who only approve the Architect's proposals
  and must end with a thriving level-4 city (`VITE_BOT_LOG=1 npm test` prints their progress).
- `scripts/cityplay.mjs`, `sliceshots.mjs`, `playtest.mjs`: drive each built page in headless
  Chromium and save screenshots.

## Not built yet

Wiring conflict into the game (#3); eras
and megaprojects (#4); sound; richer building shapes and street life.
