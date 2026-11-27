// The housing builders behind the three housing kits (housing-terraces, housing-green, housing-dense).
//
// Mesh budget, all three: 1. lit facades (`ctx.windowMat`)  2. planting AND dark mass, both in the
// shared `foliage` material (a dark vertex colour has no visible self-glow, so slabs and cores can
// ride along with the hedges and save a draw call)  3. neon (`shared.neon`).
//
// Growth: everything is laid out from the roof down. Tiers have fixed floor counts, balconies are
// counted down from the top of their tier, and per-item variation comes from `hash01` keyed by tier
// and floor, so a taller build only appends geometry underneath.
import * as THREE from 'three';
import type { LotBuild, LotCtx } from './kit';
import { FLOOR, Section, Tier, at, box, boxHolo, bright, cached, hash01, mats, mesh, tiersFromRoof, tint, windowBoxDown } from './core';

const CONCRETE = 0x1a1d2b, SLAB = 0x242838, PLANT = 0x2b3045;
const WARM = 0xffc98a, LEAF = [0x3fe08a, 0x2fc46e, 0x63f0a0, 0x39d6a0], HEDGE = 0x2aa866, VINE = 0x35c97c;
const ICE = 0xbfe9ff, BEACON = 0xff3030;

const bush = () => cached('housing:bush', () => new THREE.IcosahedronGeometry(1, 0));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Lot-local axes: `u` runs along the chosen axis, `v` across it. Boxes are given as (size u, height, size v, u, y, v). */
function frame(ctx: LotCtx, alongX: boolean) {
  return {
    L: alongX ? ctx.w : ctx.d, C: alongX ? ctx.d : ctx.w,
    px: (u: number, v: number) => ctx.x + (alongX ? u : v),
    pz: (u: number, v: number) => ctx.z + (alongX ? v : u),
    box: (su: number, h: number, sv: number, u: number, y: number, v: number, c: THREE.Color) =>
      box(alongX ? su : sv, h, alongX ? sv : su, ctx.x + (alongX ? u : v), y, ctx.z + (alongX ? v : u), c),
    tier: (su: number, sv: number, u: number, v: number, floors: number): Tier =>
      ({ w: alongX ? su : sv, d: alongX ? sv : su, cx: ctx.x + (alongX ? u : v), cz: ctx.z + (alongX ? v : u), floors }),
  };
}

/**
 * The growth test (and the eye) compares geometry by its depth below the top of the building. Vertex
 * positions are 32-bit floats, so a vertex at an arbitrary height can land on one side of a 0.1 m
 * rounding boundary at one level and on the other side at the next. Heights on a round grid are
 * safe; this nudges an arbitrary one (a bush) up by millimetres until all its vertex rows are clear.
 */
const ICO_ROWS = [-0.8507, -0.5257, 0, 0.5257, 0.8507];
function settle(below: number, sy: number): number {
  for (let n = 0; n < 12; n++, below -= 0.011) {
    if (ICO_ROWS.every(c => { const q = (below - c * sy + 0.0137) * 10; return Math.abs(q - Math.floor(q) - 0.5) > 0.12; })) break;
  }
  return below;
}

const TIER_FLOORS = [2, 2, 3, 3, 4, 5, 6, 8];

/**
 * Stepped maisonette terraces: every tier down from the roof reaches further towards the front, and
 * the strip of roof it leaves open is a planted terrace with a lit rail. `green` trades neon for planting.
 */
export function terraces(ctx: LotCtx, green: boolean): LotBuild {
  const { w, d, H, rng, r, accent, cheap } = ctx;

  // Every random choice, in a fixed order, none depending on H.
  const coin = rng();
  const alongX = w > d * 1.15 || (!(d > w * 1.15) && coin < 0.5);
  const dir = rng() < 0.5 ? -1 : 1; // the front: the side the terraces step down towards
  const lean = rng() < 0.5 ? -1 : 1; // the side the narrower upper tiers keep to
  const topFrac = (green ? 0.28 : 0.34) + rng() * 0.1;
  const crossTop = 0.5 + rng() * 0.22;
  const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
  const tall0 = rng() < 0.4 ? 1 : 0;
  const doorAt = rng() - 0.5;
  const seed = Math.floor(r[6] * 1e6);

  const f = frame(ctx, alongX);
  const L = f.L * 0.92, W = f.C * 0.92;
  const n = clamp(Math.round((L * (1 - topFrac)) / (green ? 4.0 : 3.3)) + 1, 4, 8);
  const step = (L * (1 - topFrac)) / (n - 1);
  const lenOf = (i: number) => L * topFrac + step * i;
  const widOf = (i: number) => W * (crossTop + ((1 - crossTop) * i) / (n - 1));
  const sideStep = (W * (1 - crossTop)) / (n - 1);
  const uMid = (i: number) => dir * (-L / 2 + lenOf(i) / 2), uFront = (i: number) => dir * (-L / 2 + lenOf(i));
  const vMid = (i: number) => (lean * (W - widOf(i))) / 2;

  const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;
  const extra = green ? 4.6 : 3.2; // roof garden and stair head: the same at every level
  const tiers: Tier[] = [];
  for (let i = 0; i < n; i++) tiers.push(f.tier(lenOf(i), widOf(i), uMid(i), vMid(i), TIER_FLOORS[i] + (i === 0 ? tall0 : 0)));
  const sections: Section[] = tiersFromRoof(roof, tiers);

  const lit: THREE.BufferGeometry[] = [], soft: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
  const concrete = tint(CONCRETE), slab = tint(SLAB);
  const glow = green ? bright(accent.clone().lerp(tint(0x4dffa6), 0.65), 0.95) : bright(accent, 1.7);
  const warm = bright(WARM, green ? 1.3 : 1.6);
  const leaf = (k: number) => tint(LEAF[Math.floor(hash01(seed, k) * LEAF.length)]);
  const plant = (u: number, y: number, v: number, s: number, k: number) =>
    soft.push(at(bush(), f.px(u, v), roof + extra - settle(roof + extra - y - s * 0.62, s * 0.85), f.pz(u, v), [s, s * 0.85, s], hash01(seed, k + 7) * 6, leaf(k)));

  sections.forEach((t, i) => {
    const top = t.y0 + t.h, len = lenOf(i), wid = widOf(i), um = uMid(i), uf = uFront(i), vm = vMid(i);
    lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, top, t.cz, roof, uo, vo));

    // The lit rail: all round the roof, and round the open terrace of every tier below it.
    // The tiers also step sideways, away from the `lean` side, so there is a front terrace and a side terrace.
    const railY = top + 0.4, vOpen = vm - (lean * wid) / 2;
    neon.push(f.box(0.3, 0.5, wid + 0.3, uf, railY, vm, glow));
    neon.push(f.box(len, 0.5, 0.3, um, railY, vOpen, glow));
    if (i === 0) neon.push(f.box(0.3, 0.5, wid + 0.3, uf - dir * len, railY, vm, glow), f.box(len, 0.5, 0.3, um, railY, vm + (lean * wid) / 2, glow));

    // Planting. A hedge along the front edge of each terrace reads as a green stripe from far away; bushes behind it.
    const depth = i === 0 ? len : step, uIn = (a: number) => uf - dir * a; // metres back from the front edge
    const hw = wid * (0.5 + 0.38 * hash01(seed, i * 31 + 1)), hv = vm + (hash01(seed, i * 31 + 2) - 0.5) * (wid - hw) * 0.9;
    const hh = green ? 1.5 : 1.1;
    soft.push(f.box(Math.min(1.3, depth * 0.4), hh, hw, uIn(1.05), top + hh / 2, hv, tint(HEDGE)));
    if (i > 0 && !cheap) { // and one along the side terrace
      const sl = lenOf(i - 1) * (0.45 + 0.4 * hash01(seed, i * 31 + 3));
      soft.push(f.box(sl, hh, Math.min(1.1, sideStep * 0.45), uMid(i - 1) + (hash01(seed, i * 31 + 4) - 0.5) * (lenOf(i - 1) - sl), top + hh / 2, vOpen + lean * 0.95, tint(HEDGE)));
    }
    const bushes = cheap ? (i === 0 ? 2 : green ? 1 : 0) : (i === 0 ? 3 : i < 4 ? 2 : 1) + (green && i < 2 ? 1 : 0);
    for (let b = 0; b < bushes; b++) {
      const k = i * 31 + 10 + b * 3;
      const s = clamp(depth * 0.3, 0.9, i === 0 && green ? 2.6 : 1.7) * (0.75 + 0.25 * hash01(seed, k));
      const back = i === 0 ? 1.5 + hash01(seed, k + 1) * Math.max(0, depth - 6.5) : Math.min(depth - s * 0.6, 1.6 + s + hash01(seed, k + 1) * Math.max(0, depth - 3.4 - s));
      plant(uIn(Math.max(s, back)), top, vm + (hash01(seed, k + 2) - 0.5) * (wid - 2 * s - 0.6), s, k);
    }
    // Green: creepers hang over the terrace edge down the facade.
    if (green && !cheap && i > 0) for (let c = 0; c < (i < 3 ? 2 : i < 6 ? 1 : 0); c++) {
      const k = i * 31 + 24 + c * 2, vw = 1.6 + hash01(seed, k) * 2.6, drop = Math.min(Math.floor(t.h), 2 + Math.floor(hash01(seed, k + 1) * 5)); // whole metres: see settle()
      soft.push(f.box(0.3, drop, vw, uf + dir * 0.18, top + 0.5 - drop / 2, vm + (hash01(seed, k + 3 + c) - 0.5) * (wid - vw), tint(VINE)));
    }

    // Balconies on the front face, counted down from the top of the tier. In the tall base tier they
    // alternate with sky gardens: every sixth floor is an open, unlit deck with planters and a lit edge
    // all round, which keeps a 200 m stack reading as villages of maisonettes rather than one tower.
    const last = i === n - 1;
    for (let k = 1; top - k * FLOOR >= t.y0 + FLOOR - 0.01; k++) {
      const y = top - k * FLOOR, id = i * 997 + k * 13;
      const deep = k > 30; // far below the roof the detail thins out, which bounds the cost of a very tall stack
      if (last ? !deep && (k % 6 === 2 || (!cheap && k === 6)) : k % 2 === 1 && !(cheap && k % 4 === 3)) {
        const bw = wid * (0.4 + 0.42 * hash01(seed, id)), bv = vm + (hash01(seed, id + 1) - 0.5) * (wid - bw);
        soft.push(f.box(1.5, 0.32, bw, uf + dir * 0.75, y + 0.16, bv, slab));
        if (green && hash01(seed, id + 2) < 0.55) soft.push(f.box(0.5, 0.75, bw * 0.8, uf + dir * 1.2, y + 0.7, bv, tint(VINE)));
        else neon.push(f.box(0.2, 0.2, bw, uf + dir * 1.45, y + 1.0, bv, warm));
      } else if (last && k % 6 === 4 && (deep || cheap ? k % 12 === 4 && !(deep && cheap && k % 24 !== 4) : true)) {
        soft.push(f.box(len + 0.5, FLOOR, wid + 0.5, um, y + FLOOR / 2, vm, concrete));
        neon.push(f.box(len + 0.9, 0.24, wid + 0.9, um, y + 0.12, vm, glow));
        if (!cheap && !deep) {
          const gw = wid * (0.45 + 0.4 * hash01(seed, id)), gl = len * (0.4 + 0.4 * hash01(seed, id + 3));
          soft.push(f.box(0.7, 1.2, gw, uf + dir * 0.45, y + 0.85, vm + (hash01(seed, id + 1) - 0.5) * (wid - gw), tint(HEDGE)));
          soft.push(f.box(gl, 1.2, 0.7, um + (hash01(seed, id + 4) - 0.5) * (len - gl), y + 0.85, vOpen - lean * 0.45, tint(HEDGE)));
        }
      }
    }
  });

  // The stair core up the back, with a seam of light, and its head on the roof.
  const back = -dir * (L / 2), cw = Math.min(6, widOf(0) * 0.45), coreTop = roof + extra * 0.75;
  soft.push(f.box(3.4, coreTop, cw, back + dir * 1.1, coreTop / 2, vMid(0), concrete));
  neon.push(f.box(0.3, coreTop, 0.34, back - dir * 0.65, coreTop / 2, vMid(0), glow));
  if (!cheap) soft.push(f.box(2.2, 1.4, 2.6, uMid(0) + dir * lenOf(0) * 0.12, roof + 0.7, vMid(0) - lean * widOf(0) * 0.22, tint(PLANT)));
  if (green) { // a tree on the roof
    const u = uMid(0) - dir * lenOf(0) * 0.1, v = vMid(0) + lean * widOf(0) * 0.2;
    soft.push(f.box(0.4, 2.2, 0.4, u, roof + 1.1, v, concrete));
    soft.push(at(bush(), f.px(u, v), roof + extra - settle(1.7, 1.7), f.pz(u, v), [2.2, 1.7, 2.2], coin * 6, leaf(5)));
  }

  // Ground zone: a lit doorway under a canopy on whichever tier reaches the street, and a kerb light.
  const g = sections.length - 1, uf = uFront(g), dv = vMid(g) + doorAt * (widOf(g) - 6);
  for (const s of [-1, 1]) neon.push(f.box(0.25, 3.6, 0.25, uf + dir * 0.2, 1.8, dv + s * 1.5, warm));
  neon.push(f.box(0.25, 0.25, 3.25, uf + dir * 0.2, 3.7, dv, warm));
  soft.push(f.box(2.4, 0.3, 5, uf + dir * 1.0, 4.3, dv, slab));
  if (!cheap) neon.push(f.box(0.2, 0.2, widOf(g) * 0.9, uf + dir * 0.25, 0.3, vMid(g), glow));

  const group = new THREE.Group();
  mesh(group, lit, ctx.windowMat);
  mesh(group, soft, mats().foliage);
  mesh(group, neon, ctx.shared.neon);
  return { group, height: roof + extra, holo: boxHolo(sections) };
}

/**
 * Dense housing: one or two thin slabs the length of the lot, a balcony band with a lit edge every
 * few floors on both long faces, stair fins on the ends and a cold lit crown.
 */
export function slabs(ctx: LotCtx): LotBuild {
  const { w, d, H, rng, r, accent, cheap } = ctx;

  const coin = rng();
  const alongX = w > d * 1.15 || (!(d > w * 1.15) && coin < 0.5);
  const side = rng() < 0.5 ? -1 : 1;
  const end = rng() < 0.5 ? -1 : 1;
  const drop = 3 + Math.floor(rng() * 6); // the second slab is this many floors lower
  const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
  const mast = 5 + Math.floor(rng() * 13) / 2; // half metres: see settle()
  const short = 0.72 + rng() * 0.16;
  const seed = Math.floor(r[6] * 1e6);

  const f = frame(ctx, alongX);
  const L = f.L * 0.92, C = f.C;
  const two = C >= 40;
  const T = two ? Math.min(15, C * 0.27) : Math.min(16, C * 0.56);
  const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;

  const lit: THREE.BufferGeometry[] = [], soft: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
  const concrete = tint(CONCRETE), slab = tint(SLAB), ice = bright(ICE, 2.0);
  const cold = accent.clone().lerp(tint(ICE), 0.35), seam = bright(cold, 1.7);
  const holo: Section[] = [];

  for (let j = 0; j < (two ? 2 : 1); j++) {
    const top = roof - (j ? drop * FLOOR : 0);
    if (top < 0.01) continue;
    const len = j ? L * short : L, um = j ? (end * (L - len)) / 2 : 0;
    const vm = two ? (j ? -side : side) * C * 0.255 : (side * (C * 0.92 - T) * 0.6) / 2;
    const secs = tiersFromRoof(top, [f.tier(len - 3.2, T - 2.6, um, vm, 2), f.tier(len, T, um, vm, 0)]);
    holo.push(...secs);
    secs.forEach((t, i) => lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, t.y0 + t.h, t.cz, roof, uo + j * 0.375, vo)));

    // The crown: a recessed top two floors under a bright ring and a ridge light.
    for (const s of [-1, 1]) {
      neon.push(f.box(len - 3.2 + 0.4, 0.8, 0.4, um, top + 0.25, vm + (s * (T - 2.6)) / 2, ice));
      neon.push(f.box(0.4, 0.8, T - 2.6 + 0.4, um + (s * (len - 3.2)) / 2, top + 0.25, vm, ice));
    }
    soft.push(f.box(len * 0.5, 1.6, (T - 2.6) * 0.45, um - end * len * 0.1, top + 0.8, vm, tint(PLANT)));
    if (!cheap) neon.push(f.box(len * 0.5 + 0.3, 0.2, (T - 2.6) * 0.45 + 0.3, um - end * len * 0.1, top + 1.5, vm, seam));

    // Balcony bands: one dark slab and one thin lit one, both run straight through the building, so each band costs two boxes for both faces.
    const body = secs[1];
    if (body) {
      const bodyTop = body.y0 + body.h, every = (two ? 3 : 2) * (cheap ? 2 : 1);
      soft.push(f.box(len + 0.5, 0.5, T + 0.9, um, bodyTop - 0.05, vm, slab)); // the ledge under the crown
      // Far below the roof the bands are twice as far apart, which bounds the cost of a very tall slab.
      for (let k = 2; bodyTop - k * FLOOR >= FLOOR - 0.01; k += k >= 30 ? every * 2 : every) {
        const y = bodyTop - k * FLOOR;
        soft.push(f.box(len * 0.95, 1.3, T + 2.3, um, y + 0.65, vm, slab)); // slab and solid parapet
        neon.push(f.box(len * 0.95 - 0.5, 0.26, T + 2.62, um, y + 0.13, vm, bright(cold, 1.1 + 0.8 * hash01(seed, j * 500 + k))));
      }
    }
    // Stair fins on both ends, each with a seam of light from the roof to the street.
    const finTop = top + 2.4;
    for (const s of [-1, 1]) {
      if (cheap && s !== end) continue;
      soft.push(f.box(1.6, finTop, T * 0.4, um + s * (len / 2 + 0.2), finTop / 2, vm, concrete));
      neon.push(f.box(0.3, finTop, 0.36, um + s * (len / 2 + 1.05), finTop / 2, vm, seam));
    }
    if (j === 0) {
      const mu = um + end * (len / 2 - 0.4);
      soft.push(f.box(0.45, mast, 0.45, mu, roof + mast / 2, vm, concrete));
      neon.push(f.box(1.1, 1.1, 1.1, mu, roof + mast - 0.55, vm, bright(BEACON, 2.2)));
    }
    // Ground zone: a lit strip over the open ground floor on both faces, and a doorway on the outward face.
    neon.push(f.box(len * 0.9, 0.3, T + 0.35, um, 4.3, vm, seam));
    const out = two ? (j ? -side : side) : -side, dv = vm + out * (T / 2 + 0.2), du = um + end * len * 0.18 * (j ? -1 : 1);
    for (const s of [-1, 1]) neon.push(f.box(0.25, 3.4, 0.25, du + s * 1.6, 1.7, dv, ice));
  }

  const group = new THREE.Group();
  mesh(group, lit, ctx.windowMat);
  mesh(group, soft, mats().foliage);
  mesh(group, neon, ctx.shared.neon);
  return { group, height: roof + mast, holo: boxHolo(holo) };
}
