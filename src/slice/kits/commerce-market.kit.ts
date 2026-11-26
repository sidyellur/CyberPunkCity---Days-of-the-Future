// Commerce for the 'green' character: a market hall. An arcade of glowing arches under strings of
// lantern lights, and above it terraces that step back to a rooftop pavilion, every roof planted and
// planter belts ringing the base as it grows.
//
// Growth (kit.ts rule 3): pavilion and terraces are fixed floor counts below the roof; the base runs
// down to the arcade, which is inside the ground zone. A level-up adds base floors and planter belts.
//
// Meshes: 1. lit windows plus the dark mass  2. neon  3. foliage.
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, Tier, at, beam, box, boxHolo, cached, hash01, mats, mesh, tint, trimRing, windowBoxDown } from './core';
import { PODIUM, Face, darkBox, facePanel, faces, glowAt, roofFor, tiersAbovePodium } from './commerce-parts';

const WARM = 0xffd9a0, AMBER = 0xffb347;

const shrub = () => cached('commerce:shrub', () => new THREE.OctahedronGeometry(1, 0));
const tree = () => cached('commerce:tree', () => new THREE.IcosahedronGeometry(1, 0));
const arch = () => cached('commerce:arch', () => new THREE.CircleGeometry(1, 8, 0, Math.PI));
const turnOf = (f: Face) => (f.nz > 0 ? 0 : f.nz < 0 ? Math.PI : (f.nx * Math.PI) / 2);

const kit: RegisteredKit = {
  id: 'commerce-market',
  intents: ['commerce'],
  characters: ['green'],
  lot(ctx) {
    const { x, z, w, d, H, rng, r, accent, shared, cheap, style } = ctx;

    // 1. Every random choice, in a fixed order, none depending on H.
    const t2Floors = 3 + Math.floor(rng() * 2), t3Floors = 3 + Math.floor(rng() * 2);
    const pavScale = 0.36 + rng() * 0.08, t2Scale = 0.58 + rng() * 0.08, t3Scale = 0.8 + rng() * 0.06;
    const sx = rng() < 0.5 ? -1 : 1, sz = rng() < 0.5 ? -1 : 1;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const second = tint(style.palette[(style.palette.indexOf(accent.getHex()) + 1 + Math.floor(rng() * Math.max(1, style.palette.length - 1))) % style.palette.length]);
    const seed = r[6] * 1e6;
    const leaf = (k: number) => new THREE.Color().setHSL(0.34 + hash01(seed, 7000 + k) * 0.1, 0.8, 0.3 + hash01(seed, 7500 + k) * 0.16);

    const roof = roofFor(H);
    const pw = w * 0.96, pd = d * 0.96;
    const tw = Math.min(w * 0.88, 40), td = Math.min(d * 0.88, 40);
    const tx = x + sx * (pw - tw) * 0.3, tz = z + sz * (pd - td) * 0.3;
    const tier = (scale: number, floors: number): Tier => {
      const a = tw * scale, b = td * scale;
      return { w: a, d: b, cx: tx + (sx * (tw - a)) / 2, cz: tz + (sz * (td - b)) / 2, floors };
    };
    const tiers = tiersAbovePodium(roof, [tier(pavScale, 2), tier(t2Scale, t2Floors), tier(t3Scale, t3Floors), tier(1, 0)]);

    const lit: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [], green: THREE.BufferGeometry[] = [];
    const glow = glowAt(accent, 0.8), glow2 = glowAt(second, 0.8), lawn = tint(0x1f7a45);

    /** A planted roof: a lawn, and shrubs along the two edges that the tier above leaves open. */
    const garden = (t: { w: number; d: number; cx: number; cz: number }, y: number, salt: number, perEdge: number, vary = 0.9) => { // shrubs stay under 4.7 m, so a garden on a tier that has only just surfaced is still inside the ground zone
      green.push(box(t.w - 0.8, 0.5, t.d - 0.8, t.cx, y + 0.25, t.cz, lawn));
      if (cheap) perEdge = Math.min(perEdge, 2);
      for (let k = 0; k < perEdge; k++) {
        const a = ((k + 0.5) / perEdge - 0.5) * 0.86, s1 = 1.2 + hash01(seed, salt + k) * vary, s2 = 1.2 + hash01(seed, salt + 50 + k) * vary;
        green.push(at(shrub(), t.cx + a * t.w, y + 0.4 + s1 * 0.8, t.cz - sz * (t.d / 2 - 1.9), [s1, s1 * 1.2, s1], hash01(seed, salt + 20 + k) * 3, leaf(salt + k)));
        green.push(at(shrub(), t.cx - sx * (t.w / 2 - 1.9), y + 0.4 + s2 * 0.8, t.cz + a * t.d, [s2, s2 * 1.2, s2], hash01(seed, salt + 70 + k) * 3, leaf(salt + 50 + k)));
      }
    };

    // 2. The terraces, from the roof down.
    tiers.forEach((t, i) => {
      const top = t.y0 + t.h;
      lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, top, t.cz, roof, uo, vo));
      trimRing(neon, t.w, t.d, t.cx, top + 0.1, t.cz, i % 2 ? glow2 : glow, 0.3, 0.35);
      if (i > 0) garden(t, top, i * 200, Math.max(2, Math.min(4, Math.round(Math.max(t.w, t.d) / 9))));
      if (i >= 2) green.push(beam(t.cx + (sx * t.w) / 2, t.y0, t.cz + (sz * t.d) / 2, t.cx + (sx * t.w) / 2, top, t.cz + (sz * t.d) / 2, 1.3, leaf(900 + i))); // a green wall down the street corner
      // A planter belt every 5 floors down the base, counted from its top, with a line of light under it.
      if (i === 3) for (let k = 5; k * FLOOR <= t.h - FLOOR; k += cheap ? 10 : 5) {
        green.push(box(t.w + 1.3, 0.8, t.d + 1.3, t.cx, top - k * FLOOR + 0.4, t.cz, leaf(1000 + k)));
        neon.push(box(t.w + 1.4, 0.16, t.d + 1.4, t.cx, top - k * FLOOR - 0.1, t.cz, glowAt(k % 2 ? accent : second, 0.5)));
      }
    });

    // 3. The pavilion roof: a lawn, a few trees and a lantern. Fixed above the roof.
    const pav = tiers[0];
    green.push(box(pav.w - 0.6, 0.5, pav.d - 0.6, pav.cx, roof + 0.25, pav.cz, lawn));
    let topAbove = 3.6;
    for (let k = 0; k < (cheap ? 2 : 3); k++) {
      const s = 1.7 + hash01(seed, 300 + k) * 0.9, a = (k / 3) * Math.PI * 2 + hash01(seed, 310 + k) * 0.8;
      green.push(at(tree(), pav.cx + Math.cos(a) * pav.w * 0.3, roof + 0.4 + s * 1.2, pav.cz + Math.sin(a) * pav.d * 0.3, [s, s * 1.3, s], a, leaf(300 + k)));
      topAbove = Math.max(topAbove, 0.4 + s * 2.5 + 0.05);
    }
    neon.push(box(pav.w * 0.3, 2.6, pav.d * 0.3, pav.cx, roof + 1.3, pav.cz, glowAt(WARM, 0.5)));
    trimRing(neon, pav.w * 0.3, pav.d * 0.3, pav.cx, roof + 2.9, pav.cz, glow, 0.4, 0.3);
    neon.push(box(0.9, 0.9, 0.9, pav.cx, roof + 3.15, pav.cz, glowAt(AMBER, 1.1)));

    // 4. The arcade: arched openings full of warm light, a string of lanterns, a roof garden. Ground zone.
    lit.push(darkBox(pw, PODIUM, pd, x, PODIUM / 2, z));
    const pod = { w: pw, d: pd, cx: x, cz: z };
    const hues = [glowAt(WARM, 0.6), glowAt(AMBER, 0.5), glowAt(WARM, 0.45), glowAt(accent, 0.4)];
    const lamps = [glowAt(AMBER, 0.9), glow, glow2];
    faces(pod).forEach((f, fi) => {
      const bays = Math.max(2, Math.round(f.len / (cheap ? 10 : 6.5))), bw = f.len / bays, ow = Math.min(bw - 1.6, 6.2), tx2 = Math.abs(f.nz), tz2 = Math.abs(f.nx);
      for (let b = 0; b < bays; b++) {
        const s = (b + 0.5) * bw - f.len / 2, hue = hues[Math.floor(hash01(seed, 5000 + fi * 100 + b) * 89) % hues.length];
        const spring = 6.6 - ow / 2;
        neon.push(facePanel(f, s, 0.3 + (spring - 0.3) / 2, ow, spring - 0.3, 0.06, hue));
        neon.push(at(arch(), f.px + tx2 * s + f.nx * 0.06, spring, f.pz + tz2 * s + f.nz * 0.06, [ow / 2, ow / 2, 1], turnOf(f), hue));
      }
      if (!cheap) {
        const n = Math.max(3, Math.round(f.len / 3.2));
        for (let k = 0; k < n; k++) neon.push(facePanel(f, ((k + 0.5) / n - 0.5) * f.len, 6.95 - (k % 2) * 0.12, 0.5, 0.5, 0.1, lamps[(k + fi) % 3]));
      }
    });
    garden(pod, PODIUM, 2000, Math.max(2, Math.min(4, Math.round(Math.max(pw, pd) / 12))), 0.7); // shrubs no taller than the ground zone

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, neon, shared.neon);
    mesh(group, green, mats().foliage);
    return { group, height: roof + topAbove, holo: boxHolo([...tiers, { w: pw, d: pd, cx: x, cz: z, y0: 0, h: PODIUM }]) };
  },
};

export default kit;
