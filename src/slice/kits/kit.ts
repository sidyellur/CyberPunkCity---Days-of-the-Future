// The district-kit interface: how a richer building replaces the plain stacked tower on one lot.
//
// `buildBlock` (../city.ts) carves a block into 1, 2 or 4 lots and, for each lot that is not a park,
// asks `style.kit.lot(ctx)` for the building. The game rebuilds the whole block every time the
// district gains a level and matches the new structures to the old ones BY INDEX so that each one
// continues rising from where it stood. Everything below follows from that.
//
// RULES FOR KIT AUTHORS
//
// 1. Randomness. Use only `ctx.rng` and `ctx.r`. Never Math.random, never a module-level generator,
//    never the clock. The same (bx, bz, seed, index) must give the same building at every level.
//    Returning `null` falls back to the plain tower for that lot (which is unaffected by any
//    draws you made from `ctx.rng`).
//
// 2. Level never changes the plan. `lots` is a constant of the kit. The footprint, the variant you
//    pick and every random choice must be the same at level 1 and level 4; only `ctx.H` (and things
//    derived from it, such as the number of floors) may differ. Do not branch on `ctx.level` for
//    anything visible above the ground zone (rule 3); it is there for small ground-level extras.
//
// 3. DESIGN TOP-DOWN FOR GROWTH. At a level-up the new, taller building is swapped in SUNK into the
//    ground so that its roof is where the old roof was, and then it rises. Whatever is visible of
//    the new building at that instant is its top `H_old` metres, and it must look like the old
//    building or the swap pops. So:
//      - Lay the building out from the roof down. Use `tiersFromRoof` (core.ts) for setbacks with
//        fixed floor counts measured from the roof; the lowest tier absorbs the extra floors.
//      - Index per-floor details from the roof (floor 0 is the top floor) and add floors at the
//        bottom. "A balcony every third floor counted from the roof", not "from the ground".
//      - Draw random numbers in roof-to-ground order, or use `hash01(seed, k)` (core.ts) per floor,
//        so that more floors only append draws. Never draw a number of randoms that depends on H
//        before drawing something that shapes the top.
//      - Do not scale the footprint, a dome radius or a crown with H. Proportions that are fractions
//        of H ("the podium is 30% of the height") move every level; use metres or floors.
//      - Window textures: use `windowBoxDown` (core.ts), which anchors the pattern to the roof.
//      - Ground-anchored features (entrance, shopfront, podium trim) cannot survive the swap: keep
//        them inside the bottom GROUND_ZONE metres. `tests/kits.test.ts` checks every registered kit:
//        all vertices above the ground zone must be at the same depth below the roof at every level.
//        A kit that deliberately breaks this (it accepts the pop) sets `freeform: true`.
//
// 4. Budget: AT MOST 3 MESHES (draw calls) PER LOT, at every level; the hologram is not counted.
//    A full city is about 80 blocks of up to 4 lots on a phone. Merge geometry (`merge` / `mesh` in
//    core.ts). Use shared materials only: `mats()` from core.ts, `ctx.windowMat`, `ctx.shared.neon`,
//    `ctx.shared.windows[i]`, `ctx.shared.signs[i].mat`. Never create a material, texture or canvas
//    per lot, and never per call. No lights of any kind. No InstancedMesh per lot unless it replaces
//    one of the 3. When `ctx.cheap` is set, drop the fine detail (aim for half the triangles).
//    As a guide, stay under about 1,500 triangles per lot (a plain tower is 100 to 400).
//
// 5. No readable real-language text and no real brands. Signage uses the invented script in
//    `ctx.shared.signs` (`signPlane` in core.ts); each sign is one mesh and counts toward the 3.
//
// 6. The look is neon on dark purple haze with bloom; there is almost no ambient light. A building
//    reads through what glows: lit windows (`ctx.windowMat`), trims and seams in `shared.neon`
//    with colours multiplied above 1 (`bright()`), and the `glass` material. Muted daylight
//    materials come out as dark silhouettes; use them for mass, not for interest.
//
// 7. Geometry is in WORLD coordinates (the lot centre is `ctx.x, ctx.z`, the ground is y = 0).
//    Leave `group.position`, `group.visible` and the hologram's material alone: the rise animation
//    owns them. Stay inside the lot rectangle (a small overhang, under a metre, is fine) and build
//    upward from y = 0; nothing below the ground.
//
// 8. Everything a kit allocates per lot must be freed: geometry on meshes in `group` is disposed by
//    `disposeBlock` unless marked `userData.shared = true` (cached geometry from `cached()` is).
//    Anything else goes in `dispose`.
import type * as THREE from 'three';
import type { BlockStyle, Character, Shared } from '../city';

/** Below this height a kit may anchor things to the ground (they pop at a level-up, but at street level). */
export const GROUND_ZONE = 12;

export interface LotCtx {
  shared: Shared;
  bx: number; bz: number; seed: number;
  /** Which lot of how many in this block. Stable across levels. */
  index: number; count: 1 | 2 | 4;
  /** The lot rectangle in world coordinates: centre and size. */
  x: number; z: number; w: number; d: number;
  /** The height `buildBlock` computed for this lot and style (at least 14). Grows about 55% of the level-1 height per level. */
  H: number;
  level: number; // 1..4
  character: Character;
  /** The style the block is being built with (palette, sign density, ...). Do not read `height` from it; use H. */
  style: BlockStyle;
  /** This lot's accent colour, picked from the style's palette. Multiply above 1 for neon (`bright`). */
  accent: THREE.Color;
  /** The lit-window material the plain tower would have used here (one of `shared.windows`). */
  windowMat: THREE.Material;
  /** The lot's 8 pre-drawn random numbers. r[0] picked the accent, r[1] the park test, r[2..3] H, r[5] windowMat. r[4], r[6] are free. */
  r: readonly number[];
  /** The lot's own generator. Same sequence at every level. */
  rng: () => number;
  /** Small screen: build the lighter variant. */
  cheap: boolean;
}

export interface LotBuild {
  /** World-space geometry, at most 3 meshes. Leave `group.position.y` alone (the rise animation owns it). */
  group: THREE.Group;
  /** True top of the geometry, masts included. Must grow with `ctx.H` or the level-up has nothing to raise. */
  height: number;
  /** The blueprint shown while rising (`boxHolo` in core.ts). Omitted: one is made from the bounding box. `null`: none. */
  holo?: THREE.LineSegments | null;
  /** Frees anything that `disposeBlock` would not (see rule 8). */
  dispose?(): void;
}

export interface DistrictKit {
  id: string;
  /** Force how the block is carved up. A constant: it must not depend on level. `style.lots` overrides it. */
  lots?: 1 | 2 | 4;
  /** Build one lot, or return null for the plain tower. */
  lot(ctx: LotCtx): LotBuild | null;
}

/** What a `*.kit.ts` file default-exports (see index.ts). */
export interface RegisteredKit extends DistrictKit {
  /** The game intents this kit dresses ('housing', 'farms', 'industry', 'commerce', 'power', 'research', 'park', 'defence'). Empty: preview only. */
  intents: readonly string[];
  /** Restrict to some characters; a kit that names the character wins over one that does not. */
  characters?: readonly Character[];
  /** Opt out of the top-down growth test (rule 3). The level-up will visibly pop. */
  freeform?: boolean;
}
