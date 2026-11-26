# CyberPunk City: Days of the Future

A cyberpunk city-builder and real-time strategy hybrid that runs in the browser. Raise a megacity
around your Nexus Spire, keep its citizens fed, housed and powered, and bring down the rival
Vanta Collective before its raids bring down you.

Single-player; no assets (all art is drawn in code).

## Play

```
npm install
npm run dev        # http://localhost:5173
```

`npm run single` builds one self-contained file, `dist/cyberpunk-city.html`, that can be opened or
hosted anywhere.

## How it plays

- **City.** Place buildings near your grid. Citizens fill worker slots automatically (farms and
  reactors first); adjust crews per building. Food, housing, power and plazas drive morale, and
  morale drives output and growth.
- **Power.** Solar is strong by day and weak at night. Demand above supply is a brownout: output
  drops, turrets slow, morale falls. Fusion Cells fix it at District tier.
- **Tiers.** Advance the Nexus through Block, District, Sector and Megacity. Each tier unlocks
  buildings and units, raises the building level cap and army cap, and makes squads 15% stronger.
- **Squads.** Train Enforcers, Striker Drones and Titan Mechs at Security Hubs. Hold Uplink Nodes
  for credits and data. Idle squads heal near the Nexus.
- **The rival.** The Vanta Collective raids on a timer, with growing waves. Destroy its Nexus to win.

Controls: left-click selects, drag box-selects, right-click moves or attacks, wheel zooms, WASD or
arrow keys pan, Space pauses, Esc cancels. On touch: drag pans, pinch zooms, tap selects, and with a
squad selected a tap moves or attacks.

## Code

- `src/sim/` is the whole game as a deterministic, DOM-free simulation over a plain-JSON state:
  `defs.ts` (data tables: tune balance here), `state.ts` (world and map generation), `path.ts` (A*),
  `sim.ts` (tick: economy, combat, rival AI), `commands.ts` (player actions), `save.ts`.
- `src/ui/` draws it: `render.ts` (isometric canvas), `hud.ts` (HUD markup). `src/main.ts` is the
  loop, camera and input.
- `tests/sim.test.ts` covers the rules; `tests/bot.test.ts` plays full games with a scripted player
  (`VITE_BOT_LOG=1 npm test` prints its minute-by-minute economy, useful when tuning).
- `scripts/playtest.mjs` drives the built game in headless Chromium and saves screenshots.

## Visual slice

`slice.html` (source in `src/slice/`) is a look-and-feel test for where the game is heading: a 3D
district raised by an AI "Architect", with every tower, sign and street generated in code. It has no
gameplay. The skyline opens above Meridian Exchange, where an enclosed gallery links the split-shell
arcology to the suspended decks of Sky Harbor. Overview frames the canal, terraced housing, rainwater
gardens and the orbital tether beyond the district. Brief the Architect (Dense, Balanced or Green) to watch a new district
rise, orbit the skyline, or drop to street level at the night market. Open it at `http://localhost:5173/slice.html` under `npm run dev`;
`npm run single` also writes `dist/cyberpunk-city-skyline.html`.

## Not built yet

Fog of war, sound, multiplayer and alliances, a rival that runs a real economy, more maps.
