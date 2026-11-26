// Reactor halls: one structure per block. A containment drum under a dome; between drum and dome the
// core shows as a band of cyan-white light behind a cage of cooling fins, with a halo ring round the
// fin tips. Lit control galleries ring the drum, and cooling towers with glowing mouths stand at the
// corners.
//
// Growth: the dome, the core band and the halo are a fixed crown; the drum and the fins just get
// longer; galleries are counted down from the roof; the cooling towers hang a fixed depth below the
// roof with a fixed flared top and a straight shaft that takes the extra height.
//
// Meshes: galleries and the plinth (ctx.windowMat), drum, dome, fins and towers (glass), light (neon).
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, bright, boxHolo, mats, mesh, tint, trimRing, windowBoxDown } from './core';
import { annulus, cyl, disc, dome, domeRib, lathe, radialBox, windowDrum } from './works-parts';

const SHELL = 0x1a2330, FIN = 0x243246, TOWER = 0x2a3442, DOME = 0x1f5a70, CORE = 0xd8f6ff;
const PLINTH = 2 * FLOOR; // ground zone

const kit: RegisteredKit = {
  id: 'power',
  intents: ['power'],
  lots: 1,
  lot(ctx) {
    const { x, z, w, d, H, rng, accent, shared, cheap } = ctx;

    // Every random choice, none depending on H.
    const m = Math.min(w, d);
    const Rd = m * (0.2 + rng() * 0.03); // drum radius
    const fins = [6, 8, 8, 10][Math.floor(rng() * 4)];
    const domeH = Rd * (0.6 + rng() * 0.32);
    const every = 4 + Math.floor(rng() * 3); // storeys between galleries
    const towerRoll = Math.floor(rng() * 4);
    const r0 = m * (0.082 + rng() * 0.018); // cooling-tower mouth radius
    const drop = (1 + Math.floor(rng() * 2)) * FLOOR; // tower tops this far below the roof
    const phase = (rng() * Math.PI * 2) / fins;
    const coreH = 4.4 + rng() * 2;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;

    const roof = Math.max(4, Math.round(H / FLOOR)) * FLOOR;
    const seg = cheap ? 12 : 16;
    const finOut = Rd + Math.min(5, m * 0.085);

    const lit: THREE.BufferGeometry[] = [], mass: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
    const shell = tint(SHELL), core = bright(CORE, 1.15), ring = bright(accent, 1.5), edge = bright(accent, 1.0), dim = bright(accent, 0.55);

    // The drum, and the core band between it and the dome.
    const drumTop = roof - coreH;
    mass.push(cyl(x, 0, drumTop, z, Rd, Rd, seg, shell), disc(x, drumTop, z, Rd, seg, shell), disc(x, roof, z, Rd, seg, shell, true));
    neon.push(cyl(x, drumTop, roof, z, Rd * 0.62, Rd * 0.62, seg, core));

    // The dome: tinted glass with lit ribs over the fins and a lantern on top.
    mass.push(dome(x, roof, z, Rd, domeH, seg, cheap ? 3 : 4, tint(DOME)));
    mass.push(cyl(x, roof - 0.5, roof + 0.5, z, Rd + 0.35, Rd + 0.35, seg, shell));
    const lantern = 2.4;
    neon.push(cyl(x, roof + domeH - 0.5, roof + domeH + lantern, z, 1.7, 2, 8, core), disc(x, roof + domeH + lantern, z, 1.7, 8, core));

    // Cooling fins all the way up the drum, past the core band; their tips are lit near the top.
    for (let i = 0; i < fins; i++) {
      const a = phase + (i * Math.PI * 2) / fins;
      mass.push(radialBox(x, z, a, Rd - 0.4, finOut, 0, roof + 1.4, 0.9, tint(FIN)));
      neon.push(radialBox(x, z, a, finOut, finOut + 0.22, 0, roof + 1.4, 0.34, dim));
      if (!cheap) neon.push(domeRib(x, roof, z, Rd + 0.12, domeH + 0.12, a, 0.5, 4, edge));
    }
    // The halo: a ring of light round the fin tips at roof level.
    neon.push(annulus(x, roof + 1.45, z, finOut - 0.5, finOut + 0.7, cheap ? 16 : 20, ring), cyl(x, roof + 0.7, roof + 1.45, z, finOut + 0.7, finOut + 0.7, cheap ? 16 : 20, ring));

    // Control galleries: two-storey bands of lit windows round the drum, counted down from the roof.
    for (let j = 0; ; j++) {
      const yTop = roof - (2 + j * every) * FLOOR;
      if (yTop - 2 * FLOOR < 0) break;
      lit.push(windowDrum(Rd + 0.6, 2 * FLOOR, x, yTop, z, roof, seg, uo, vo));
    }

    // Cooling towers at the corners.
    const off = m * 0.47 - r0 * 1.25 - 0.4;
    const corners = ([[1, 1], [-1, -1], [1, -1], [-1, 1]] as const).filter((_, i) => towerRoll < 2 || (towerRoll === 2 ? i < 2 : i < 3));
    const tseg = cheap ? 8 : 10, yT = roof - drop;
    for (const [cxs, czs] of corners) {
      const tx = x + cxs * off, tz = z + czs * off;
      const profile: [number, number][] = cheap
        ? [[r0, yT], [r0 * 0.78, yT - 7], [r0 * 1.22, yT - 24], [r0 * 1.22, -1]]
        : [[r0, yT], [r0 * 0.78, yT - 6], [r0 * 0.92, yT - 14], [r0 * 1.22, yT - 24], [r0 * 1.22, -1]];
      mass.push(lathe(tx, tz, profile, tseg, tint(TOWER)));
      neon.push(disc(tx, yT - 1.2, tz, r0 * 0.93, tseg, bright(CORE, 0.8)), cyl(tx, yT - 0.45, yT, tz, r0 + 0.08, r0 + 0.08, tseg, ring));
    }

    // Ground zone: a lit plinth the drum and towers stand in.
    const pw = w * 0.84, pd = d * 0.84;
    lit.push(windowBoxDown(pw, PLINTH, pd, x, PLINTH, z, PLINTH, uo, vo));
    trimRing(neon, pw, pd, x, PLINTH + 0.15, z, edge, 0.3, 0.3);

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, mass, mats().glass);
    mesh(group, neon, shared.neon);
    return {
      group, height: roof + domeH + lantern,
      holo: boxHolo([{ w: Rd * 2, d: Rd * 2, cx: x, cz: z, y0: 0, h: roof + domeH }, { w: pw, d: pd, cx: x, cz: z, y0: 0, h: PLINTH }]),
    };
  },
};

export default kit;
