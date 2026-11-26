// Foundry halls: a long hall with a sawtooth roof whose glazing glows furnace-orange, stepping down
// on one side to a tank shelf and a yard strip where the stacks stand, each with a hot tip.
//
// Growth: the stacks are a crown (a fixed height above the roof, each from this lot's own draw); the
// hall, the tank shelf and the yard step are fixed storey counts below the roof, and the lowest tier
// takes the extra height with a pipe belt every few storeys counted down from its top.
//
// Meshes: sparse hot windows (ctx.windowMat), roofs, stacks, tanks and pipes (metal), glow (neon).
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, Section, box, boxHolo, bright, mats, mesh, tint, windowBoxDown } from './core';
import { cyl, disc, prism } from './works-parts';

const STEEL = 0x2b2e38, RUST = 0x3d2a22, SOOT = 0x16171c, HOT = 0xff6a2a, EMBER = 0xff2a18, WHITE_HOT = 0xffc890;
const TOOTH = 3.2; // sawtooth rise

const kit: RegisteredKit = {
  id: 'industry',
  intents: ['industry'],
  lot(ctx) {
    const { x, z, w, d, H, rng, accent, shared, cheap } = ctx;

    // Every random choice, none depending on H.
    const turnRoll = rng();
    const alongX = w > d + 1 ? true : d > w + 1 ? false : turnRoll < 0.5; // the hall runs the long way
    const side = rng() < 0.5 ? -1 : 1; // which side the yard is on
    const upFloors = 3 + Math.floor(rng() * 2), midFloors = 3 + Math.floor(rng() * 3);
    const hallFrac = 0.54 + rng() * 0.08, midFrac = hallFrac + 0.15 + rng() * 0.05;
    const stackRoll = rng();
    const stackH = [17 + rng() * 9, 13 + rng() * 10, 13 + rng() * 10];
    const stackAt = [rng(), rng(), rng()];
    const toothDir = rng() < 0.5 ? -1 : 1, doorEnd = rng() < 0.5 ? -1 : 1;
    const tankRoll = rng(), tankH = 4.5 + rng() * 2.5;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const belt = 4 + Math.floor(rng() * 2);

    const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;
    const L = (alongX ? w : d) * 0.95, W = (alongX ? d : w) * 0.94;
    // The lot's frame: `a` along the hall, `c` across it (positive toward the yard).
    const px = (a: number, c: number) => x + (alongX ? a : side * c), pz = (a: number, c: number) => z + (alongX ? side * c : a);
    const bx = (la: number, h: number, lc: number, a: number, y: number, c: number, color: THREE.Color) => box(alongX ? la : lc, h, alongX ? lc : la, px(a, c), y, pz(a, c), color);

    const Wh = W * hallFrac, Wm = W * midFrac;
    const cH = -(W - Wh) / 2, cM = -(W - Wm) / 2; // centres across; all three tiers share the far wall
    const yS1 = roof - upFloors * FLOOR, yS2 = yS1 - midFloors * FLOOR; // the tank shelf, the yard step
    const sec = (wc: number, c: number, y0: number, top: number): Section => ({ w: alongX ? L : wc, d: alongX ? wc : L, cx: px(0, c), cz: pz(0, c), y0: Math.max(0, y0), h: top - Math.max(0, y0) });
    const tiers: Section[] = [sec(Wh, cH, yS1, roof)];
    if (yS1 > 0) tiers.push(sec(Wm, cM, yS2, yS1));
    if (yS2 > 0) tiers.push(sec(W, 0, 0, yS2));

    const lit: THREE.BufferGeometry[] = [], mass: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
    const steel = tint(STEEL), rust = tint(RUST), soot = tint(SOOT);
    const hot = bright(accent, 1.15), tip = bright(HOT, 2.3), ember = bright(EMBER, 1.5), line = bright(HOT, 0.85);

    for (const t of tiers) lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, t.y0 + t.h, t.cz, roof, uo, vo));

    // The sawtooth roof: teeth along the hall, each with its upright face glazed and glowing.
    const teeth = Math.max(2, Math.round(L / (cheap ? 11 : 7.5))), run = L / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = -L / 2 + run * (i + 0.5);
      mass.push(prism([[(-toothDir * run) / 2, 0], [(-toothDir * run) / 2, TOOTH], [(toothDir * run) / 2, 0]], Wh, !alongX, px(a, cH), roof, pz(a, cH), steel));
      neon.push(bx(0.16, TOOTH * 0.62, Wh - 1.6, a - toothDir * (run / 2 + 0.05), roof + TOOTH * 0.5, cH, hot));
    }
    mass.push(bx(L + 0.6, 0.5, Wh + 0.6, 0, roof - 0.1, cH, soot)); // eaves

    // Pipes on the hall's yard face: a hot line under the eaves, and ducts down to the shelf.
    const face = cH + Wh / 2;
    neon.push(bx(L - 2, 0.22, 0.22, 0, roof - 2.3, face + 0.5, line));
    mass.push(bx(L - 1, 0.8, 0.8, 0, roof - 3, face + 0.45, rust));
    const ducts = cheap ? 2 : Math.max(2, Math.round(L / 14));
    for (let i = 0; i < ducts; i++) {
      const a = -L / 2 + (L * (i + 0.5)) / ducts;
      mass.push(bx(1.1, roof - 0.6 - Math.max(0, yS1), 0.9, a, (roof - 0.6 + Math.max(0, yS1)) / 2, face + 0.45, steel));
    }

    // The tank shelf (once it is out of the ground): tanks with a lit rim, and a header pipe.
    const shelf = Wm - Wh;
    if (yS1 > 0) {
      const tr = Math.min(3.6, Math.max(1.3, shelf * 0.4)), cT = face + shelf / 2;
      const n = cheap ? 1 : Math.max(1, Math.min(3, Math.floor(L / 16)));
      const start = (tankRoll - 0.5) * (L - n * tr * 3 - 4);
      for (let i = 0; i < n; i++) {
        const a = start + (i - (n - 1) / 2) * tr * 2.6;
        mass.push(cyl(px(a, cT), yS1, yS1 + tankH, pz(a, cT), tr, tr, cheap ? 8 : 10, rust), disc(px(a, cT), yS1 + tankH, pz(a, cT), tr, cheap ? 8 : 10, steel));
        neon.push(cyl(px(a, cT), yS1 + tankH - 0.5, yS1 + tankH - 0.2, pz(a, cT), tr + 0.06, tr + 0.06, cheap ? 8 : 10, line));
      }
      mass.push(bx(L - 2, 0.7, 0.7, 0, yS1 + 0.9, face + shelf - 0.6, steel));
      neon.push(bx(L, 0.2, 0.2, 0, yS1 + 0.15, cM + Wm / 2 + 0.1, line)); // the shelf's edge
    }

    // The lowest tier: a pipe belt every few storeys, counted down from its top.
    if (yS2 > 0) {
      neon.push(bx(L, 0.2, 0.2, 0, yS2 + 0.15, W / 2 + 0.1, line));
      for (let j = 1; yS2 - j * belt * FLOOR >= FLOOR; j++) {
        const y = yS2 - j * belt * FLOOR;
        mass.push(bx(L + 0.7, 0.7, W + 0.7, 0, y, 0, soot));
        if (!cheap) neon.push(bx(L + 0.9, 0.14, W + 0.9, 0, y + 0.45, 0, line));
      }
    }

    // The stacks: in the yard strip, ground to a fixed height above the roof. A crown, the same at every level.
    const yard = W - Wm, rs = Math.min(2.8, Math.max(1.3, yard * 0.4)), cS = W / 2 - Math.max(rs + 0.2, yard / 2);
    const stacks = L < 30 ? (stackRoll < 0.5 ? 1 : 2) : stackRoll < 0.25 ? 1 : stackRoll < 0.7 ? 2 : 3;
    const seg = cheap ? 6 : 8;
    let crown = TOOTH;
    for (let i = 0; i < stacks; i++) {
      const slot = L / stacks, a = -L / 2 + slot * (i + 0.5) + (stackAt[i] - 0.5) * (slot - rs * 2 - 3);
      const top = roof + stackH[i], sxw = px(a, cS), szw = pz(a, cS);
      crown = Math.max(crown, stackH[i]);
      mass.push(cyl(sxw, 0, top, szw, rs, rs, seg, steel));
      mass.push(cyl(sxw, top - 4.2, top - 2.6, szw, rs + 0.35, rs + 0.35, seg, soot)); // collar
      neon.push(cyl(sxw, top - 2.2, top, szw, rs + 0.08, rs + 0.08, seg, tip), disc(sxw, top - 0.02, szw, rs, seg, bright(WHITE_HOT, 2.1)));
      neon.push(cyl(sxw, top - 6.6, top - 6, szw, rs + 0.06, rs + 0.06, seg, ember));
      if (!cheap) neon.push(cyl(sxw, top - 10.6, top - 10, szw, rs + 0.06, rs + 0.06, seg, ember));
    }

    // Ground zone: the furnace door on one end, white-hot.
    const base = tiers[tiers.length - 1], bc = tiers.length === 1 ? cH : tiers.length === 2 ? cM : 0, bwid = alongX ? base.d : base.w;
    const door = Math.min(9, bwid * 0.4);
    neon.push(bx(0.3, 6.5, door, doorEnd * (L / 2 + 0.1), 3.6, bc, bright(HOT, 1.25)));
    neon.push(bx(0.34, 0.5, door + 1.4, doorEnd * (L / 2 + 0.1), 7.3, bc, tip));

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, mass, mats().metal);
    mesh(group, neon, shared.neon);
    return { group, height: roof + crown, holo: boxHolo(tiers) };
  },
};

export default kit;
