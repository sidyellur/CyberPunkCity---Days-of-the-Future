// Research: needle towers. A slim stepped shaft with saucer lab decks and tilted halo rings round
// it, a caged data core glowing on the roof and a sensor mast above that.
//
// Growth: everything is hung from the roof. The crown (core, halos, mast) and the upper decks are at
// fixed depths below it; a level-up brings up more shaft, further decks (one every 12 floors) and
// finally the lab hall at the street, which sits inside the ground zone.
// Meshes: lit shaft (ctx.windowMat), glass (decks; dark structure in the same material), neon.
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, Tier, beam, box, boxHolo, bright, hash01, mats, mesh, tiersFromRoof, tint, trimRing, windowBoxDown } from './core';
import { band, drum, gem, halo } from './civic-parts';

const FRAME = 0x12151f, LANTERN = 7;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const kit: RegisteredKit = {
  id: 'research-needle',
  intents: ['research'],
  lot(ctx) {
    const { x, z, w, d, H, rng, r, accent, shared, cheap, style } = ctx;
    const S = Math.min(w, d);

    // Every random choice, none depending on H.
    const tipFloors = 5 + Math.floor(rng() * 4), midFloors = 9 + Math.floor(rng() * 7);
    const s = clamp(S * 0.42, 8, 12.5) * (0.85 + rng() * 0.15);
    const tipW = Math.max(4.4, s * (0.42 + rng() * 0.1)), midW = s * (0.68 + rng() * 0.1);
    const ox = rng() - 0.5, oz = rng() - 0.5;
    const face = Math.floor(rng() * 4);
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const mast = 14 + rng() * 10;
    const twin = rng() < 0.5, tiltX = (rng() - 0.5) * 0.7, tiltZ = (rng() - 0.5) * 0.7, haloDepth = 3 + Math.floor(rng() * 3);
    const deck0 = 2 + Math.floor(rng() * 2), deck1 = deck0 + 5 + Math.floor(rng() * 3), deck2 = deck1 + 6 + Math.floor(rng() * 4);
    const rr = [rng(), rng(), rng(), rng()];
    const seed = r[6] * 1e6;

    // Fixed roles so every needle is violet AND cyan: violet for the spine and the big halos, cyan for the core and
    // the mast; the lot's accent only picks the trims. Violet blooms less than cyan, so it is pushed harder.
    const violet = tint(style.palette[0]), cyan = tint(style.palette[style.palette.length > 1 ? 1 : 0]);
    const glow = bright(accent, 1.2), frame = tint(FRAME);
    const reach = Math.min(S / 2 - 0.4, 13); // the widest any deck or halo may be
    const cx = x + ox * Math.max(0, w - 2 * reach - 1), cz = z + oz * Math.max(0, d - 2 * reach - 1);

    const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;
    const tier = (tw: number, floors: number): Tier => ({ w: tw, d: tw, cx, cz, floors });
    const tiers = tiersFromRoof(roof, [tier(tipW, tipFloors), tier(midW, midFloors), tier(s, 0)]);

    const lit: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
    const fx = face === 0 ? 1 : face === 1 ? -1 : 0, fz = face === 2 ? 1 : face === 3 ? -1 : 0;
    const spine = bright(violet, 1.9);

    tiers.forEach((t, i) => {
      const top = t.y0 + t.h;
      lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, top, t.cz, roof, uo, vo));
      // The data spine: a lit strip down two opposite faces, roof to street.
      for (const side of [1, -1]) neon.push(box(fx ? 0.3 : 0.7, t.h, fz ? 0.3 : 0.7, cx + side * fx * (t.w / 2 + 0.06), t.y0 + t.h / 2, cz + side * fz * (t.d / 2 + 0.06), spine));
      if (i > 0) trimRing(neon, t.w, t.d, cx, top + 0.12, cz, glow, 0.3, 0.3);
    });

    // Lab decks: saucers at fixed floors below the roof, then one every 12 floors (24 when cheap).
    const n = cheap ? 8 : 10;
    const deck = (floors: number, radius: number, k: number) => {
      const y = roof - floors * FLOOR;
      if (y - 1.2 < 0.4) return;
      const R = Math.min(reach, radius), c = k % 2 ? violet : cyan;
      glass.push(drum(n, R, 2, cx, y, cz, c.clone().multiplyScalar(k % 2 ? 0.5 : 0.3), 0, 1, 0.62));
      neon.push(band(n, R + 0.08, 0.28, cx, y + 0.88, cz, bright(c, k % 2 ? 1.9 : 1.2)));
    };
    deck(deck0, tipW / 2 + 2.6 + rr[0] * 1.6, 0);
    deck(deck1, midW / 2 + 2.6 + rr[1] * 2.6, 1);
    deck(deck2, s / 2 + 2.4 + rr[2] * 3, 2);
    for (let k = 3, f = deck2 + 14; f * FLOOR < roof; k++, f += 14) if (!cheap || k % 2) deck(f, s / 2 + 2 + hash01(seed, k) * 3.4, k);

    // Halos round the needle's tip.
    const hy = roof - (haloDepth + 0.5) * FLOOR, hr = Math.min(reach, tipW / 2 + 4.5 + rr[3] * 3.5);
    neon.push(halo(cheap ? 12 : 18, hr, 0.6, cx, hy, cz, bright(violet, 2.3), tiltX, tiltZ));
    if (twin && !cheap) neon.push(halo(16, hr * 0.8, 0.4, cx, hy, cz, bright(cyan, 1.2), -tiltX * 1.3, -tiltZ * 1.3));

    // The crown: a caged data core on the roof, and the sensor mast.
    const top = roof + LANTERN + mast, e = tipW / 2 - 0.25;
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) glass.push(beam(cx + px * e, roof, cz + pz * e, cx + px * e, roof + LANTERN, cz + pz * e, 0.36, frame));
    glass.push(box(tipW + 0.5, 0.5, tipW + 0.5, cx, roof + LANTERN - 0.25, cz, frame), box(tipW + 0.5, 0.4, tipW + 0.5, cx, roof + 0.2, cz, frame));
    neon.push(gem(tipW * 0.33, 5.4, cx, roof + 3.4, cz, bright(cyan, 2.2), Math.PI / 4));
    neon.push(halo(cheap ? 10 : 14, tipW / 2 + 1.7, 0.4, cx, roof + 3.4, cz, bright(violet, 2.1)));
    glass.push(beam(cx, roof + LANTERN, cz, cx, top - 0.7, cz, 0.55, frame));
    neon.push(box(0.8, 1.4, 0.8, cx, top - 0.7, cz, bright(0xffffff, 2.2)));
    neon.push(beam(cx, top - mast * 0.45, cz, cx, top - 1.4, cz, 0.24, bright(cyan, 1.3)));
    for (const [at, len, alongX] of [[0.3, 2.6, true], [0.55, 1.8, false]] as const) {
      const y = top - mast * at, ax = alongX ? len : 0, az = alongX ? 0 : len;
      glass.push(beam(cx - ax, y, cz - az, cx + ax, y, cz + az, 0.3, frame));
      if (!cheap) for (const side of [1, -1]) neon.push(box(0.5, 0.5, 0.5, cx + side * ax, y, cz + side * az, bright(violet, 2.2)));
    }
    if (!cheap) neon.push(halo(10, 1.9, 0.3, cx, top - mast * 0.72, cz, bright(cyan, 1.3)));

    // Street level (inside the ground zone): the lab hall the needle stands in.
    const pw = w * 0.92, pd = d * 0.92;
    if (pw > s + 5 || pd > s + 5) {
      lit.push(windowBoxDown(pw, 2 * FLOOR, pd, x, 2 * FLOOR, z, roof, uo, vo));
      trimRing(neon, pw, pd, x, 2 * FLOOR + 0.15, z, glow, 0.3, 0.3);
    }

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, glass, mats().glass);
    mesh(group, neon, shared.neon);
    return { group, height: top, holo: boxHolo(tiers) };
  },
};

export default kit;
