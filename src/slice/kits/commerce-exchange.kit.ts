// Commerce for the 'efficient' character: an exchange tower. Slim and tall, cold-toned, ruled with
// unbroken vertical light lines; a glass lantern and a stepped glass spire with a needle on top, a
// price-ticker band below the upper setback and round the lobby, and a lower wing where the lot allows.
//
// Growth (kit.ts rule 3): top tier, middle tier and the wing's roof are fixed floor counts below the
// roof; the main shaft (and the wing) run down to the podium, which is inside the ground zone.
//
// Meshes: 1. lit windows plus the dark mass  2. neon  3. glass (lantern, spire, atrium strips, lobby).
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, Tier, beam, box, boxHolo, hash01, mats, mesh, tint, trimRing, windowBoxDown } from './core';
import { PODIUM, darkBox, faceBox, facePanel, faces, glowAt, roofFor, tiersAbovePodium } from './commerce-parts';

const ICE = 0xbfe9ff, AZURE = 0x4fb4ff, UP = 0x4dffa6, DOWN = 0xff5a4d, BEACON = 0xff3030;

const kit: RegisteredKit = {
  id: 'commerce-exchange',
  intents: ['commerce'],
  characters: ['efficient'],
  lot(ctx) {
    const { x, z, w, d, H, rng, r, accent, shared, cheap } = ctx;

    // 1. Every random choice, in a fixed order, none depending on H.
    const topFloors = 5 + Math.floor(rng() * 3), midFloors = 12 + Math.floor(rng() * 6);
    const topScale = 0.5 + rng() * 0.08, midScale = 0.74 + rng() * 0.08;
    const sx = rng() < 0.5 ? -1 : 1, sz = rng() < 0.5 ? -1 : 1;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const wingDrop = 10 + Math.floor(rng() * 8), wingWanted = rng() < 0.8;
    const needle = 10 + rng() * 8;
    const seed = r[6] * 1e6;

    const roof = roofFor(H);
    const pw = w * 0.92, pd = d * 0.92;
    const tw = Math.min(w * 0.72, 28), td = Math.min(d * 0.72, 28); // slim, whatever the lot
    const tx = x + sx * (pw - tw) * 0.4, tz = z + sz * (pd - td) * 0.4;
    const tier = (scale: number, floors: number): Tier => {
      const a = tw * scale, b = td * scale;
      return { w: a, d: b, cx: tx + (sx * (tw - a)) / 2, cz: tz + (sz * (td - b)) / 2, floors };
    };
    const tiers = tiersAbovePodium(roof, [tier(topScale, topFloors), tier(midScale, midFloors), tier(1, 0)]);

    const lit: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    // The cold palette: azure with a quarter of the lot's accent, so magenta lots come out blue-violet, not pink.
    const cold = tint(AZURE).clone().lerp(accent, 0.25);
    const line = glowAt(ICE, 0.5), line2 = glowAt(cold, 0.6), dim = glowAt(cold, 0.3);
    const pane = glowAt(cold, 0.4), paneBright = glowAt(cold, 0.75);

    // 2. The tower, from the roof down: unbroken vertical lines on every tier, a glass atrium strip on the front.
    tiers.forEach((t, i) => {
      const top = t.y0 + t.h;
      lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, top, t.cz, roof, uo, vo));
      trimRing(neon, t.w, t.d, t.cx, top + 0.15, t.cz, glowAt(cold, 0.8), 0.35, 0.35);
      faces(t).forEach((f, fi) => {
        if (cheap && fi % 2) return;
        // Two lines a third of the way in from each corner; on the front they frame the glass atrium strip.
        for (const e of [-1, 1]) neon.push(faceBox(f, e * f.len * 0.17, t.y0 + t.h / 2, 0.16, t.h, 0.5, 0.25, e * (fi % 2 ? 1 : -1) > 0 ? line2 : line));
        if (i > 0 && f.nz === -sz) glass.push(faceBox(f, 0, t.y0 + t.h / 2, f.len * 0.34 - 1.6, t.h, 0.4, 0.2, pane));
      });
      // A thin belt every 8 floors down the main shaft, counted from its top.
      if (i === 2) for (let k = 8; k * FLOOR <= t.h - FLOOR; k += cheap ? 16 : 8) neon.push(box(t.w + 0.3, 0.25, t.d + 0.3, t.cx, top - k * FLOOR, t.cz, dim));
    });

    // The price ticker: dashes that step up and down, round the top floor of the middle tier.
    const ticker = (t: { w: number; d: number; cx: number; cz: number }, y: number, salt: number, cellW: number) => {
      faces(t).forEach((f, fi) => {
        const cols = Math.max(2, Math.round(f.len / cellW)), cw = f.len / cols;
        for (let c = 0; c < cols; c++) {
          const h = hash01(seed, salt + fi * 100 + c);
          if (h < 0.2) continue;
          const move = h < 0.55 ? 1 : h < 0.8 ? -1 : 0;
          neon.push(facePanel(f, (c + 0.5) * cw - f.len / 2, y + move * 0.7, cw - 0.35, 0.55, 0.2, move > 0 ? glowAt(UP, 0.8) : move < 0 ? glowAt(DOWN, 0.5) : glowAt(ICE, 0.7)));
        }
      });
    };
    const mid = tiers[1];
    if (mid && mid.h >= FLOOR - 0.01) {
      const y = mid.y0 + mid.h - FLOOR / 2;
      lit.push(darkBox(mid.w + 0.25, FLOOR, mid.d + 0.25, mid.cx, y, mid.cz));
      ticker({ w: mid.w + 0.25, d: mid.d + 0.25, cx: mid.cx, cz: mid.cz }, y, 100, cheap ? 4.5 : 2.4);
    }

    // The wing: a lower slab beside the tower, its roof a fixed number of floors below the main roof.
    const wingTop = roof - wingDrop * FLOOR;
    const spareX = pw - tw, spareZ = pd - td;
    const wing = { w: 0, d: 0, cx: 0, cz: 0 };
    if (wingWanted && Math.max(spareX, spareZ) >= 9) {
      if (spareX >= spareZ) { wing.w = Math.min(spareX - 1, 13); wing.d = td * 0.72; wing.cx = tx - sx * (tw / 2 + wing.w / 2); wing.cz = tz + sz * (td - wing.d) / 2; }
      else { wing.d = Math.min(spareZ - 1, 13); wing.w = tw * 0.72; wing.cz = tz - sz * (td / 2 + wing.d / 2); wing.cx = tx + sx * (tw - wing.w) / 2; }
    }
    const hasWing = wing.w > 0 && wingTop >= PODIUM + FLOOR - 0.01;
    if (hasWing) {
      lit.push(windowBoxDown(wing.w, wingTop - PODIUM, wing.d, wing.cx, wingTop, wing.cz, roof, uo + 0.5, vo));
      trimRing(neon, wing.w, wing.d, wing.cx, wingTop + 0.15, wing.cz, line2, 0.35, 0.35);
      const f = faces(wing).find(g => (spareX >= spareZ ? g.nx === -sx : g.nz === -sz))!;
      for (const e of [-0.17, 0.17]) neon.push(faceBox(f, e * f.len, (wingTop + PODIUM) / 2, 0.16, wingTop - PODIUM, 0.5, 0.25, line));
      glass.push(box(wing.w * 0.6, 1.6, wing.d * 0.6, wing.cx, wingTop + 0.8, wing.cz, pane)); // a skylight
    }

    // 3. The crown: a glass lantern round the top two floors, a stepped glass spire, a needle. Fixed above the roof.
    const top = tiers[0];
    glass.push(box(top.w + 0.5, 2 * FLOOR, top.d + 0.5, top.cx, roof - FLOOR, top.cz, paneBright));
    glass.push(box(top.w * 0.64, 4, top.d * 0.64, top.cx, roof + 2, top.cz, pane));
    glass.push(box(top.w * 0.38, 5, top.d * 0.38, top.cx, roof + 6.5, top.cz, paneBright));
    if (!cheap) glass.push(box(top.w * 0.18, 6, top.d * 0.18, top.cx, roof + 12, top.cz, pane));
    trimRing(neon, top.w * 0.64, top.d * 0.64, top.cx, roof + 4, top.cz, line, 0.25, 0.25);
    trimRing(neon, top.w * 0.38, top.d * 0.38, top.cx, roof + 9, top.cz, line, 0.25, 0.25);
    const tip = roof + 15 + needle;
    neon.push(beam(top.cx, roof + 9, top.cz, top.cx, tip, top.cz, 0.3, line), box(1.1, 1.1, 1.1, top.cx, tip + 0.55, top.cz, tint(BEACON).clone().multiplyScalar(2.2)));

    // 4. The podium: a glass lobby between dark piers, with the ticker running round its fascia. Ground zone.
    lit.push(darkBox(pw, PODIUM, pd, x, PODIUM / 2, z));
    const pod = { w: pw, d: pd, cx: x, cz: z };
    faces(pod).forEach(f => {
      const bays = Math.max(1, Math.round(f.len / (cheap ? 14 : 8))), bw = f.len / bays;
      for (let b = 0; b < bays; b++) glass.push(faceBox(f, (b + 0.5) * bw - f.len / 2, 2.5, bw - 1.4, 4.2, 0.3, 0.1, paneBright));
    });
    ticker(pod, 6, 500, cheap ? 5 : 2.6);
    trimRing(neon, pw, pd, x, PODIUM + 0.15, z, line2, 0.35, 0.3);

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, neon, shared.neon);
    mesh(group, glass, mats().glass);
    const holo = [...tiers, { w: pw, d: pd, cx: x, cz: z, y0: 0, h: PODIUM }];
    if (hasWing) holo.push({ ...wing, y0: PODIUM, h: wingTop - PODIUM });
    return { group, height: tip + 1.1, holo: boxHolo(holo) };
  },
};

export default kit;
