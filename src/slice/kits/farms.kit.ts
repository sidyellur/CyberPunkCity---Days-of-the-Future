// Vertical farms: stacked grow-decks. Each deck is a dark slab with a glazed, grow-lit core set back
// behind it, a planting band along the slab edge and a grow-light strip under the slab above; a
// greenhouse sits on the roof.
//
// Growth: the greenhouse and the decks are counted down from the roof at a fixed pitch, so a level-up
// only adds decks at the bottom (and, once it is tall enough, brings the wider lower tier up out of
// the ground with its terrace garden).
//
// Meshes: lit core (ctx.windowMat), slabs and greenhouse (glass), planting and grow-lights (neon).
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, Tier, beam, box, boxHolo, bright, hash01, mats, mesh, tiersFromRoof, tint, trimRing, windowBoxDown } from './core';
import { gable, vault } from './works-parts';

const SLAB = 0x10161c, FRAME = 0x1a2a26, GLASSHOUSE = 0x58d69a, PINK = 0xff4fa0;
const CROPS = [0x4dffa6, 0x9dff5a, 0x2fe07a, 0x7dffb8];
const WALL = 3, ROOF = 3.2; // the greenhouse: wall height and roof rise

const kit: RegisteredKit = {
  id: 'farms',
  intents: ['farms'],
  lot(ctx) {
    const { x, z, w, d, H, rng, r, accent, shared, cheap, character } = ctx;

    // Every random choice, none depending on H.
    const pitchFloors = rng() < 0.55 ? 2 : 3; // storeys per grow-deck
    const inset = 2.6 + rng() * 1.2; // how far the glazed core sits behind the slab edge
    const crownKind = Math.floor(rng() * 3); // gable, multi-span, vault
    const upperDecks = 2 + Math.floor(rng() * 2);
    const upperScale = 0.64 + rng() * 0.12;
    const sx = rng() < 0.5 ? -1 : 1, sz = rng() < 0.5 ? -1 : 1;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const pinkShare = (character === 'efficient' ? 0.65 : character === 'green' ? 0.25 : 0.42) + rng() * 0.2;
    const deckSeed = r[6] * 1e6;
    const planter = character === 'green' ? 1.5 : 1.1;

    const P = pitchFloors * FLOOR;
    const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;
    const bw = w * 0.94, bd = d * 0.94;
    const tier = (scale: number, floors: number): Tier => {
      const tw = bw * scale, td = bd * scale;
      return { w: tw, d: td, cx: x + (sx * (bw - tw)) / 2, cz: z + (sz * (bd - td)) / 2, floors };
    };
    const tiers = tiersFromRoof(roof, [tier(upperScale, upperDecks * pitchFloors), tier(1, 0)]);

    const lit: THREE.BufferGeometry[] = [], mass: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
    const slab = tint(SLAB), glow = bright(accent, 1.3), pink = bright(PINK, 1.15), lime = bright(accent, 0.7);

    // The glazed cores.
    for (const t of tiers) lit.push(windowBoxDown(t.w - inset * 2, t.h, t.d - inset * 2, t.cx, t.y0 + t.h, t.cz, roof, uo, vo));

    // The decks, counted down from the roof. Deck k hangs under the slab at roof - k * P.
    for (let k = 0; roof - k * P > 0.5; k++) {
      const y = roof - k * P;
      const t = tiers.find(s => y - 0.1 >= s.y0) ?? tiers[tiers.length - 1]; // the tier this slab roofs
      mass.push(box(t.w, 0.6, t.d, t.cx, y - 0.1, t.cz, slab));
      // The grow-light under this slab: a glowing soffit that shows as a line along the slab edge, pink or green.
      if (!cheap || k % 2 === 0) neon.push(box(t.w + 0.12, 0.3, t.d + 0.12, t.cx, y - 0.55, t.cz, hash01(deckSeed, k) < pinkShare ? pink : lime));
      if (k === 0) continue; // the roof slab carries the greenhouse instead
      // Planting on top of the slab: a band between the slab edge and the core. Where the slab is the
      // wider tier's roof, this is the terrace garden.
      const crop = bright(CROPS[Math.floor(hash01(deckSeed + 7, k) * CROPS.length)], 0.26 + hash01(deckSeed + 13, k) * 0.16);
      neon.push(box(t.w - 0.6, planter, t.d - 0.6, t.cx, y + 0.2 + planter / 2, t.cz, crop));
      // Tall decks have a second rack half-way up.
      if (pitchFloors === 3 && !cheap) {
        const above = tiers.find(s => y + 0.1 >= s.y0 && y + 0.1 < s.y0 + s.h);
        if (above) neon.push(box(above.w - inset * 2 + 1.3, 0.45, above.d - inset * 2 + 1.3, above.cx, y + P / 2, above.cz, bright(crop, 0.8)));
      }
    }

    // The greenhouse crown.
    const top = tiers[0];
    const gw = top.w - 2.4, gd = top.d - 2.4, alongX = gw >= gd;
    const span = alongX ? gd : gw, len = alongX ? gw : gd;
    const glass = bright(GLASSHOUSE, 0.4), ridgeY = roof + 0.2 + WALL + ROOF;
    mass.push(box(gw, WALL, gd, top.cx, roof + 0.2 + WALL / 2, top.cz, glass));
    trimRing(neon, gw, gd, top.cx, roof + 0.2 + WALL, top.cz, glow, 0.3, 0.3);
    const ridge = (off: number) => neon.push(alongX
      ? beam(top.cx - len / 2, ridgeY, top.cz + off, top.cx + len / 2, ridgeY, top.cz + off, 0.3, glow)
      : beam(top.cx + off, ridgeY, top.cz - len / 2, top.cx + off, ridgeY, top.cz + len / 2, 0.3, glow));
    if (crownKind === 1 && span > 9) {
      const n = Math.max(2, Math.min(4, Math.round(span / 6))), s = span / n;
      for (let i = 0; i < n; i++) {
        const off = -span / 2 + s * (i + 0.5);
        mass.push(gable(s, ROOF, len, alongX, top.cx + (alongX ? 0 : off), roof + 0.2 + WALL, top.cz + (alongX ? off : 0), glass));
        if (!cheap || i === 0) ridge(off);
      }
    } else {
      mass.push(crownKind === 2
        ? vault(span, ROOF, len, alongX, top.cx, roof + 0.2 + WALL, top.cz, cheap ? 4 : 6, glass)
        : gable(span, ROOF, len, alongX, top.cx, roof + 0.2 + WALL, top.cz, glass));
      ridge(0);
    }

    // A lit stem down the corner the upper tier leans into, and dark posts at the slab corners.
    const cxs = top.cx + (sx * (top.w - inset * 2)) / 2, czs = top.cz + (sz * (top.d - inset * 2)) / 2;
    neon.push(beam(cxs, 0, czs, cxs, roof, czs, 0.45, glow));
    if (!cheap && tiers.length > 1) { // posts belong to the wide tier, so they come up with it
      const base = tiers[1];
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        mass.push(beam(base.cx + (px * (base.w - 0.6)) / 2, 0, base.cz + (pz * (base.d - 0.6)) / 2, base.cx + (px * (base.w - 0.6)) / 2, base.y0 + base.h, base.cz + (pz * (base.d - 0.6)) / 2, 0.6, tint(FRAME)));
      }
    }
    // Ground zone: a loading-dock light band.
    const street = tiers[tiers.length - 1];
    neon.push(...[1, -1].map(s => box(street.w - inset * 2 + 0.4, 0.4, 0.3, street.cx, 4.6, street.cz + (s * (street.d - inset * 2)) / 2, glow)));

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, mass, mats().glass);
    mesh(group, neon, shared.neon);
    return { group, height: ridgeY + 0.15, holo: boxHolo(tiers) };
  },
};

export default kit;
