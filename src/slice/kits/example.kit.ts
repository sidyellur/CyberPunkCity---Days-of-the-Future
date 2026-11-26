// Example kit: a stepped tower. Registered for no game intent, so the game never uses it; see it with
// kits.html?kit=example. Copy this file's structure for a real kit (and read the rules in kit.ts).
//
// It shows the two things every kit has to get right:
//   - Top-down growth. The crown, the shaft and their details are placed in floors counted from the
//     roof. A level-1 building is the crown and a little shaft; at each level-up the same top comes
//     back, and more shaft and then the wide base rise out of the ground underneath it.
//   - The budget. Three meshes per lot: lit facades, dark mass, neon.
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, Tier, beam, box, boxHolo, bright, hash01, mats, mesh, tiersFromRoof, tint, trimRing, windowBoxDown } from './core';

const CONCRETE = 0x1b2030, PLANT = 0x2a3046, BEACON = 0xff3030;

const kit: RegisteredKit = {
  id: 'example',
  intents: [], // preview only
  lot(ctx) {
    const { x, z, w, d, H, rng, r, accent, shared, cheap } = ctx;

    // 1. Every random choice first, in a fixed order, none of them depending on H.
    const crownFloors = 2 + Math.floor(rng() * 2), shaftFloors = 5 + Math.floor(rng() * 4);
    const crownScale = 0.46 + rng() * 0.1, shaftScale = 0.7 + rng() * 0.1;
    const sx = rng() < 0.5 ? -1 : 1, sz = rng() < 0.5 ? -1 : 1; // the corner the upper tiers lean into
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const mast = rng() < 0.6 ? 6 + rng() * 10 : 0;
    const floorSeed = r[6] * 1e6;

    // 2. Whole floors, so that window rows and per-floor details line up from the roof at every level.
    const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;
    const bw = w * 0.94, bd = d * 0.94;
    const tier = (scale: number, floors: number): Tier => {
      const tw = bw * scale, td = bd * scale;
      return { w: tw, d: td, cx: x + (sx * (bw - tw)) / 2, cz: z + (sz * (bd - td)) / 2, floors };
    };
    const tiers = tiersFromRoof(roof, [tier(crownScale, crownFloors), tier(shaftScale, shaftFloors), tier(1, 0)]);

    const lit: THREE.BufferGeometry[] = [], mass: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
    const glow = bright(accent), concrete = tint(CONCRETE);

    tiers.forEach((t, i) => {
      const top = t.y0 + t.h;
      lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, top, t.cz, roof, uo, vo));
      // A lit parapet and a dark cornice at the top of every tier.
      trimRing(neon, t.w, t.d, t.cx, top + 0.2, t.cz, glow, 0.7, 0.45);
      trimRing(mass, t.w, t.d, t.cx, top - 0.5, t.cz, concrete, 0.8, 0.9);
      // Corner piers run from the tier's top to wherever its bottom is: longer buildings just get longer piers.
      if (i > 0) for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) mass.push(beam(t.cx + (px * t.w) / 2, t.y0, t.cz + (pz * t.d) / 2, t.cx + (px * t.w) / 2, top, t.cz + (pz * t.d) / 2, 1.1, concrete));
    });

    // 3. Per-floor details, indexed from the roof: floor 0 is the top floor of the shaft.
    const shaft = tiers[1];
    if (shaft && !cheap) {
      const face = shaft.cz - (sz * shaft.d) / 2; // the side facing away from the lean
      for (let k = 2; (k + 1) * FLOOR <= shaft.h + 0.01; k += 3) {
        const y = shaft.y0 + shaft.h - k * FLOOR;
        mass.push(box(shaft.w * 0.8, 0.35, 2.4, shaft.cx, y, face - sz * 1.2, concrete)); // a balcony slab
        if (hash01(floorSeed, k) < 0.6) neon.push(box(shaft.w * 0.8, 0.18, 0.18, shaft.cx, y + 0.3, face - sz * 2.4, glow)); // some have a lit rail
      }
    }
    // A light seam down the leaning corner, from the roof to the ground.
    const crown = tiers[0];
    neon.push(beam(crown.cx + (sx * crown.w) / 2, 0, crown.cz + (sz * crown.d) / 2, crown.cx + (sx * crown.w) / 2, roof, crown.cz + (sz * crown.d) / 2, 0.45, glow));

    // 4. Roof: plant, and sometimes a mast with a beacon.
    mass.push(box(crown.w * 0.5, 2.2, crown.d * 0.4, crown.cx, roof + 1.1, crown.cz, tint(PLANT)));
    if (mast) {
      mass.push(beam(crown.cx, roof, crown.cz, crown.cx, roof + mast, crown.cz, 0.5, concrete));
      neon.push(box(1.3, 1.3, 1.3, crown.cx, roof + mast - 0.65, crown.cz, bright(BEACON, 2.2)));
    }
    // Ground-anchored things stay inside the ground zone: a shopfront band on whichever tier reaches the street.
    const street = tiers[tiers.length - 1];
    neon.push(...[1, -1].map(s => box(street.w + 0.4, 0.5, 0.3, street.cx, 5.2, street.cz + (s * street.d) / 2, glow)));

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, mass, mats().body);
    mesh(group, neon, shared.neon);
    // `height` is the true top (the test checks it): the mast if there is one, else the roof plant.
    return { group, height: roof + Math.max(mast, 2.2), holo: boxHolo(tiers) };
  },
};

export default kit;
