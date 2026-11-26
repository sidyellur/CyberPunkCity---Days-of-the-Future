// Defence: armoured bastions. A battered (sloped) citadel with a launch pad, drone-bay hatches and a
// radar mast on its roof, a collar of red bay doors under it, and four shield-emitter pylons at the
// lot corners joined by a thin field line.
//
// Growth: the citadel, the collar and the sloped shoulders are fixed depths below the roof; at level 1
// that is all there is, cut off by the ground. A level-up brings up the vertical armoured wall under
// them in battered sections four floors tall, each with a gallery of firing slits at its foot and a line
// of light on its step, and the pylons lengthen.
// The glacis at the street is inside the ground zone.
// Meshes: slit windows (ctx.windowMat), armour (body), neon.
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, beam, box, boxHolo, bright, mats, mesh, tint, trimRing, windowBoxDown } from './core';
import { band, dome, drum, flatRing, frustum, gem, slab } from './civic-parts';

const ARMOUR = 0x2b3242, PLATE = 0x3a4458, DECK = 0x161a24, GLACIS = 9, SECTION = 4;
const RED_TINT = new THREE.Color(1, 0.26, 0.22), ICE_TINT = new THREE.Color(0.3, 0.62, 1);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const kit: RegisteredKit = {
  id: 'defence-bastion',
  intents: ['defence'],
  lots: 2,
  lot(ctx) {
    const { x, z, w, d, H, rng, shared, cheap, style } = ctx;
    const alongX = w >= d, S = Math.min(w, d);

    // Every random choice, none depending on H.
    const end = rng() < 0.5 ? -1 : 1; // which end of the roof the mast stands on
    const mast = 15 + rng() * 8;
    const shoulderFloors = 3 + Math.floor(rng() * 2);
    const u = clamp(S * 0.065, 1.15, 3.4) * (0.85 + rng() * 0.3);
    const roundPad = rng() < 0.5;
    const dishTurn = rng() * Math.PI * 2;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const domeSide = rng() < 0.5 ? -1 : 1;

    // The palette's red and ice, deepened so that they stay red and blue under bloom instead of washing out to white.
    const redC = new THREE.Color(style.palette[0]).multiply(RED_TINT), iceC = new THREE.Color(style.palette[style.palette.length > 1 ? 1 : 0]).multiply(ICE_TINT);
    const red = bright(redC, 2), redDim = bright(redC, 1.5), ice = bright(iceC, 1.25), iceHot = bright(iceC, 2.4);
    const armour = tint(ARMOUR), plate = tint(PLATE), deck = tint(DECK);

    const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;
    const lit: THREE.BufferGeometry[] = [], mass: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
    const push = (g: THREE.BufferGeometry | null) => { if (g) mass.push(g); };

    // Massing, from the roof down. Insets are metres, fixed per lot; the ends of a long lot slope twice as hard as its sides.
    const long = Math.max(w, d) > S * 1.5 ? 2 : 1, ux = alongX ? u * long : u, uz = alongX ? u : u * long;
    const g = clamp(S * 0.06, 1.2, 2.5), step = Math.min(1.6, S * 0.055);
    const wallW = w - 2 * g, wallD = d - 2 * g, secW = wallW - 2 * step, secD = wallD - 2 * step;
    const colW = secW - 3.2 * ux - 0.6, colD = secD - 3.2 * uz - 0.6; // the collar
    const botW = colW - u, botD = colD - u, topW = botW - 2 * ux, topD = botD - 2 * uz; // the citadel
    const yCit = roof - 2 * FLOOR, yCol = yCit - FLOOR, yWall = yCol - shoulderFloors * FLOOR;
    push(frustum(x, z, yCit, botW, botD, roof, topW, topD, armour));
    mass.push(box(colW, FLOOR, colD, x, yCol + FLOOR / 2, z, deck));
    push(frustum(x, z, yWall, secW, secD, yCol, colW + 0.6, colD + 0.6, plate));
    if (yCol > 0.4 && !cheap) trimRing(neon, colW + 0.6, colD + 0.6, x, yCol, z, ice, 0.22, 0.25);
    // The wall under the shoulders: battered sections four floors tall, each stepping out at its foot, with a
    // slit-window gallery along the foot and a line of light on the step. Counted from the top; the ground cuts the last.
    for (let i = 0, top = yWall; top > 0.01; i++, top -= SECTION * FLOOR) {
      const foot = top - SECTION * FLOOR;
      push(frustum(x, z, foot, wallW, wallD, top, secW, secD, i % 2 ? plate : armour));
      // The gallery is a band 0.36 of a floor tall cut through the middle of one row of panes: firing slits, not windows.
      if (foot >= 0) {
        lit.push(windowBoxDown(wallW + 0.1, 0.36 * FLOOR, wallD + 0.1, x, foot + 0.68 * FLOOR, z, roof, uo, vo));
        if (!cheap) mass.push(box(wallW + 0.3, 0.32 * FLOOR, wallD + 0.3, x, foot + 0.16 * FLOOR, z, plate));
      }
      if (top > 0.4 && !cheap && i < 3) trimRing(neon, secW, secD, x, top, z, ice, 0.22, 0.25); // lower steps are lit on the long sides only
      else if (top > 0.4) for (const side of [1, -1]) neon.push(alongX ? box(secW, 0.22, 0.25, x, top, z + (side * secD) / 2, ice) : box(0.25, 0.22, secD, x + (side * secW) / 2, top, z, ice));
    }

    // The collar: red drone-bay doors all round.
    const door = (cxo: number, czo: number, onX: boolean) => neon.push(box(onX ? 0.25 : 3.4, 2.3, onX ? 3.4 : 0.25, x + cxo, yCol + 1.5, z + czo, redDim));
    for (const [len, half, onX] of [[colW, colD / 2, false], [colD, colW / 2, true]] as const) {
      const count = Math.max(1, Math.min(cheap ? 2 : 4, Math.floor(len / (cheap ? 12 : 7.5))));
      for (let i = 0; i < count; i++) for (const side of [1, -1]) {
        const a = ((i + 0.5) / count - 0.5) * len;
        if (onX) door(side * (half + 0.05), a, true); else door(a, side * (half + 0.05), false);
      }
    }

    // The roof deck: pad at one end, mast at the other, hatches between. `p(a, c)` maps along/across to world.
    const L = alongX ? topW : topD, W = alongX ? topD : topW;
    const p = (a: number, c: number): [number, number] => (alongX ? [x + a, z + c] : [x + c, z + a]);
    trimRing(neon, topW, topD, x, roof + 0.12, z, red, 0.3, 0.3);
    const pr = Math.min(W * 0.4, L * 0.24, 6.5), padAt = -end * (L / 2 - pr - 1);
    const [px, pz] = p(padAt, 0), sides = roundPad ? (cheap ? 10 : 16) : 8;
    mass.push(drum(sides, pr, 0.5, px, roof + 0.25, pz, deck, Math.PI / sides));
    neon.push(flatRing(sides, pr * 0.72, pr * 0.94, px, roof + 0.54, pz, red, Math.PI / sides));
    neon.push(box(pr * 0.9, 0.08, 0.45, px, roof + 0.54, pz, red), box(0.45, 0.08, pr * 0.9, px, roof + 0.54, pz, red));
    const mastAt = end * (L / 2 - 2.2), free = L - 2 * pr - 2 - 5.5; // deck left between pad and mast
    const hatchL = 4.6, hatches = Math.max(0, Math.min(cheap ? 2 : 3, Math.floor(free / (hatchL + 1.6))));
    for (let i = 0; i < hatches; i++) {
      const a = padAt + end * (pr + 1.8 + hatchL / 2 + i * (free / hatches));
      const [hx, hz] = p(a, 0), hw = alongX ? hatchL : W * 0.6, hd = alongX ? W * 0.6 : hatchL;
      mass.push(box(hw, 0.3, hd, hx, roof + 0.15, hz, deck));
      // Two lit door edges and the seam between the leaves.
      for (const e of cheap ? [0] : [-1, 0, 1]) neon.push(alongX ? box(0.24, 0.1, hd, hx + (e * hw) / 2, roof + 0.32, hz, redDim) : box(hw, 0.1, 0.24, hx, roof + 0.32, hz + (e * hd) / 2, redDim));
    }
    const [mx, mz] = p(mastAt, 0), top = roof + mast;
    mass.push(box(2.6, 1.8, 2.6, mx, roof + 0.9, mz, plate), beam(mx, roof, mz, mx, top - 0.5, mz, 0.6, plate));
    mass.push(slab(5.2, 2.6, 0.4, mx, top - 3.6, mz, plate, dishTurn, -0.3), beam(mx - 1.6, top - 7, mz, mx + 1.6, top - 7, mz, 0.3, plate), beam(mx, top - 8.5, mz - 1.2, mx, top - 8.5, mz + 1.2, 0.3, plate));
    neon.push(slab(5.4, 0.26, 0.56, mx, top - 3.6, mz, iceHot, dishTurn, -0.3), box(1.1, 1.1, 1.1, mx, top - 0.55, mz, bright(redC, 2.6)));
    if (W > 8.5 && !cheap) {
      const [dx, dz] = p(mastAt - end * 4.2, domeSide * W * 0.22);
      mass.push(dome(8, 1.7, dx, roof, dz, plate));
      neon.push(band(8, 1.78, 0.25, dx, roof + 0.2, dz, ice));
    }

    // Shield-emitter pylons at the corners, joined by the field line.
    const ex = wallW / 2 - 0.3, ez = wallD / 2 - 0.3, ey = roof + 5.6;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = x + sx * ex, cz = z + sz * ez;
      mass.push(box(2.4, roof - 1.5, 2.4, cx, (roof - 1.5) / 2, cz, plate));
      push(frustum(cx, cz, roof - 1.5, 2.4, 2.4, roof + 4, 1, 1, plate));
      neon.push(gem(1.3, 3.8, cx, ey, cz, iceHot, Math.PI / 4));
      if (!cheap) neon.push(beam(cx + sx * 1.22, roof - 7.5, cz + sz * 1.22, cx + sx * 1.22, roof - 1.5, cz + sz * 1.22, 0.26, ice));
    }
    const line = bright(iceC, 1.1);
    for (const s of [1, -1]) neon.push(beam(x - ex, ey, z + s * ez, x + ex, ey, z + s * ez, 0.16, line), beam(x + s * ex, ey, z - ez, x + s * ex, ey, z + ez, 0.16, line));

    // Street level (inside the ground zone): the glacis the bastion stands on.
    // It only comes up once the wall has: before that the sloped shoulders themselves meet the street.
    if (yWall > 1) push(frustum(x, z, 0, w, d, Math.min(GLACIS, yWall), wallW + 0.5, wallD + 0.5, deck));
    trimRing(neon, w - 0.6, d - 0.6, x, 0.3, z, redDim, 0.2, 0.25);

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, mass, mats().body);
    mesh(group, neon, shared.neon);
    const holo = boxHolo([
      { w: wallW, d: wallD, cx: x, cz: z, y0: 0, h: Math.max(GLACIS, yWall) },
      { w: colW, d: colD, cx: x, cz: z, y0: Math.max(0, yCol), h: roof - Math.max(0, yCol) },
    ]);
    return { group, height: top, holo };
  },
};

export default kit;
