// Commerce, the default kit: a galleria tower. A full-lot podium of lit shopfronts under awnings and a
// glowing fascia; above it a stepped tower with light fins, a media-facade band a few floors below the
// crown, light belts down the shaft, a lit crown and one big sign in the invented script.
//
// Growth (kit.ts rule 3): the tower is laid out from the roof down (crown, shaft, base) and stops at
// the podium's top, which is inside the ground zone. A level-up adds base floors, and with them belts.
//
// Meshes: 1. lit windows plus the dark mass (commerce-parts `darkBox`)  2. neon  3. the sign.
import * as THREE from 'three';
import type { RegisteredKit } from './kit';
import { FLOOR, Tier, beam, box, boxHolo, hash01, mesh, signPlane, tint, trimRing, windowBoxDown } from './core';
import { PODIUM, awning, darkBox, faceBox, facePanel, faces, glowAt, roofFor, tiersAbovePodium } from './commerce-parts';

const WARM = 0xffd9a0, ICE = 0xbfe9ff, WHITE = 0xffffff, BEACON = 0xff3030;

const kit: RegisteredKit = {
  id: 'commerce',
  intents: ['commerce'],
  lot(ctx) {
    const { x, z, w, d, H, rng, r, accent, shared, cheap, style } = ctx;

    // 1. Every random choice, in a fixed order, none depending on H.
    const crownFloors = 3 + Math.floor(rng() * 2), shaftFloors = 9 + Math.floor(rng() * 5);
    const crownScale = 0.58 + rng() * 0.1, shaftScale = 0.8 + rng() * 0.08;
    const sx = rng() < 0.5 ? -1 : 1, sz = rng() < 0.5 ? -1 : 1;
    const uo = Math.floor(rng() * 8) / 8, vo = Math.floor(rng() * 16) / 16;
    const crownKind = Math.floor(rng() * 3);
    const signVertical = rng() < 0.5, signPick = Math.floor(rng() * 6);
    const second = tint(style.palette[(style.palette.indexOf(accent.getHex()) + 1 + Math.floor(rng() * Math.max(1, style.palette.length - 1))) % style.palette.length]);
    const bandDepth = crownFloors + 1 + Math.floor(rng() * 2); // floors from the roof to the top of the media band
    const seed = r[6] * 1e6;

    const roof = roofFor(H);
    const pw = w * 0.96, pd = d * 0.96; // the podium fills the lot
    const tw = Math.min(w * 0.84, 36), td = Math.min(d * 0.84, 36); // the tower stands on it, toward one corner
    const tx = x + sx * (pw - tw) * 0.3, tz = z + sz * (pd - td) * 0.3;
    const tier = (scale: number, floors: number): Tier => {
      const a = tw * scale, b = td * scale;
      return { w: a, d: b, cx: tx + (sx * (tw - a)) / 2, cz: tz + (sz * (td - b)) / 2, floors };
    };
    const tiers = tiersAbovePodium(roof, [tier(crownScale, crownFloors), tier(shaftScale, shaftFloors), tier(1, 0)]);

    const lit: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [];
    // Lines may bloom; surfaces stay under the bloom threshold (see `glowAt`).
    const glow = glowAt(accent, 0.7), glow2 = glowAt(second, 0.7), soft = glowAt(accent, 0.36), soft2 = glowAt(second, 0.36);

    // 2. The tower, from the roof down.
    tiers.forEach((t, i) => {
      const top = t.y0 + t.h;
      lit.push(windowBoxDown(t.w, t.h, t.d, t.cx, top, t.cz, roof, uo, vo));
      trimRing(neon, t.w, t.d, t.cx, top + 0.2, t.cz, i === 1 ? glow2 : glow, 0.5, 0.4);
      const fs = faces(t);
      if (i === 1) {
        // Light fins down the shaft, alternating colours.
        // On the two faces away from the lean (the other two are flush with the crown and carry the sign).
        const per = cheap ? 2 : 3;
        fs.filter(f => f.nx === -sx || f.nz === -sz).forEach((f, fi) => {
          for (let k = 0; k < per; k++) {
            const s = ((k + 0.5) / per - 0.5) * f.len * 0.8;
            neon.push(faceBox(f, s, t.y0 + t.h / 2, 0.22, t.h, 0.6, 0.3, glowAt((k + fi) % 2 ? accent : second, 0.5))); // broad-sided, so dimmer than the seams
          }
        });
      } else if (i === 2) {
        // Corner seams and a light belt every 6 floors down the base, counted from its top.
        for (const [px, pz] of [[sx, sz], [-sx, -sz]]) neon.push(beam(t.cx + (px * t.w) / 2, t.y0, t.cz + (pz * t.d) / 2, t.cx + (px * t.w) / 2, top, t.cz + (pz * t.d) / 2, 0.3, glow));
        const every = cheap ? 12 : 6;
        for (let k = every; k * FLOOR <= t.h - FLOOR; k += every) neon.push(box(t.w + 0.4, 0.35, t.d + 0.4, t.cx, top - k * FLOOR, t.cz, hash01(seed, 900 + k) < 0.5 ? soft2 : soft));
      }
    });

    // The media facade: a dark band round the shaft, a fixed number of floors below the roof, with an equaliser on it.
    const shaft = tiers[1], bandTop = roof - bandDepth * FLOOR, bandH = 2 * FLOOR;
    if (shaft && bandTop - bandH >= shaft.y0 - 0.01) {
      lit.push(darkBox(shaft.w + 0.3, bandH, shaft.d + 0.3, shaft.cx, bandTop - bandH / 2, shaft.cz));
      // An equaliser: one bar per column, its height and colour from the hash, standing on the band's lower edge.
      const hues = [glowAt(accent, 0.5), glowAt(second, 0.5), glowAt(WHITE, 0.62), glowAt(accent, 0.3), glowAt(second, 0.3)];
      faces(shaft).forEach((f, fi) => {
        const cols = Math.max(3, Math.round(f.len / (cheap ? 3.6 : 1.8))), cw = f.len / cols;
        for (let c = 0; c < cols; c++) {
          const h = hash01(seed, fi * 1000 + c), bar = (0.25 + 0.75 * hash01(seed, fi * 1000 + c + 500)) * (bandH - 0.6);
          neon.push(facePanel(f, (c + 0.5) * cw - f.len / 2, bandTop - bandH + 0.3 + bar / 2, cw - 0.35, bar, 0.22, hues[Math.floor(h * 97) % hues.length]));
        }
      });
      neon.push(box(shaft.w + 0.5, 0.2, shaft.d + 0.5, shaft.cx, bandTop - bandH + 0.1, shaft.cz, glow2), box(shaft.w + 0.5, 0.2, shaft.d + 0.5, shaft.cx, bandTop - 0.1, shaft.cz, glow2));
    }

    // 3. The crown: the same at every level, so `height` only moves with the roof.
    const crown = tiers[0];
    let topAbove = 0;
    neon.push(box(crown.w * 0.72, 0.3, crown.d * 0.72, crown.cx, roof + 0.2, crown.cz, glowAt(accent, 0.28))); // a lit roof, for the view from above
    if (crownKind === 0) {
      // A halo held over the roof on four posts.
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) neon.push(beam(crown.cx + (px * crown.w) / 2, roof, crown.cz + (pz * crown.d) / 2, crown.cx + (px * crown.w) / 2, roof + 5, crown.cz + (pz * crown.d) / 2, 0.3, glow2));
      trimRing(neon, crown.w + 1.2, crown.d + 1.2, crown.cx, roof + 5, crown.cz, glowAt(accent, 1.1), 0.9, 0.6);
      trimRing(neon, crown.w * 0.6, crown.d * 0.6, crown.cx, roof + 2.6, crown.cz, glow2, 0.5, 0.4);
      topAbove = 5.45;
    } else if (crownKind === 1) {
      // A stepped lantern and a needle.
      neon.push(box(crown.w * 0.7, 2.6, crown.d * 0.7, crown.cx, roof + 1.3, crown.cz, glowAt(accent, 0.4)));
      trimRing(neon, crown.w * 0.7, crown.d * 0.7, crown.cx, roof + 2.6, crown.cz, glow2, 0.5, 0.4);
      neon.push(box(crown.w * 0.4, 2.2, crown.d * 0.4, crown.cx, roof + 3.7, crown.cz, glowAt(second, 0.5)));
      neon.push(beam(crown.cx, roof + 4.8, crown.cz, crown.cx, roof + 11, crown.cz, 0.4, glow), box(1.2, 1.2, 1.2, crown.cx, roof + 11.4, crown.cz, tint(BEACON).clone().multiplyScalar(2.2)));
      topAbove = 12;
    } else {
      // A comb of fins standing up from two sides, tied by a bar.
      const fs = faces(crown).filter(f => (crown.w >= crown.d ? f.nz : f.nx) !== 0);
      for (const f of fs) {
        for (let k = 0; k < 4; k++) neon.push(faceBox(f, ((k + 0.5) / 4 - 0.5) * f.len, roof + 3.2 - Math.abs(k - 1.5) * 0.9, 0.35, 6.4 - Math.abs(k - 1.5) * 1.8, 0.8, -0.4, k % 2 ? glow : glow2));
        neon.push(faceBox(f, 0, roof + 1.6, f.len, 0.4, 0.4, -0.4, glow));
      }
      topAbove = 6.4;
    }

    // 4. The sign (the third mesh): a banner up the crown's street corner that stands past the roof, or a rooftop board.
    let sign: THREE.Mesh;
    if (signVertical) {
      const sw = 5.5, sh = sw * 4, top = roof + 6; // 16 m below the roof: clear of the ground on the shortest lot
      const onX = crown.w < crown.d; // put it on the longer of the two street-side faces
      const f = faces(crown).find(g => (onX ? g.nx === sx : g.nz === sz))!;
      const along = (onX ? -sz : -sx) * (f.len / 2 - sw / 2 - 0.6) * 0.5;
      const cx = f.px + Math.abs(f.nz) * along + f.nx * 0.95, cz = f.pz + Math.abs(f.nx) * along + f.nz * 0.95;
      sign = signPlane(shared, signPick * 2, sw, cx, top - sh / 2, cz, onX ? (sx * Math.PI) / 2 : sz > 0 ? 0 : Math.PI);
      lit.push(darkBox(onX ? 0.5 : sw + 0.8, sh + 0.8, onX ? sw + 0.8 : 0.5, cx - f.nx * 0.35, top - sh / 2, cz - f.nz * 0.35));
      neon.push(faceBox(f, along, top + 0.45, sw + 1, 0.3, 0.3, 0.6, glow2));
      topAbove = Math.max(topAbove, 6.6);
    } else {
      const sw = Math.min(Math.max(crown.w, crown.d) * 0.95, 17), sh = sw * 0.4, y0 = roof + 1.8;
      const onX = crown.w < crown.d;
      const cx = onX ? crown.cx + sx * (crown.w / 2 - 0.5) : crown.cx, cz = onX ? crown.cz : crown.cz + sz * (crown.d / 2 - 0.5);
      sign = signPlane(shared, signPick * 2 + 1, sw, cx, y0 + sh / 2, cz, onX ? Math.PI / 2 : 0);
      for (const e of [-1, 1]) lit.push(darkBox(0.5, y0 + sh - roof, 0.5, cx + (onX ? 0 : (e * sw) / 2.4), roof + (y0 + sh - roof) / 2, cz + (onX ? (e * sw) / 2.4 : 0)));
      neon.push(box(onX ? 0.3 : sw + 0.6, 0.3, onX ? sw + 0.6 : 0.3, cx, y0 - 0.3, cz, glow2), box(onX ? 0.3 : sw + 0.6, 0.3, onX ? sw + 0.6 : 0.3, cx, y0 + sh + 0.3, cz, glow2));
      topAbove = Math.max(topAbove, 1.8 + sh + 0.45);
    }

    // 5. The podium: ground-anchored, all of it inside the ground zone.
    const pod = { w: pw, d: pd, cx: x, cz: z };
    lit.push(darkBox(pw, PODIUM, pd, x, PODIUM / 2, z));
    const shopHues = [glowAt(WARM, 0.7), glowAt(ICE, 0.6), glowAt(WARM, 0.5), glowAt(accent, 0.45), glowAt(second, 0.45)];
    faces(pod).forEach((f, fi) => {
      const bays = Math.max(2, Math.round(f.len / (cheap ? 9 : 6.2))), bw = f.len / bays;
      for (let b = 0; b < bays; b++) {
        const s = (b + 0.5) * bw - f.len / 2, h = hash01(seed, 5000 + fi * 100 + b);
        neon.push(facePanel(f, s, 2.25, bw - 1.3, 3.5, 0.06, shopHues[Math.floor(h * 89) % shopHues.length])); // the lit shop window
        if (!cheap) neon.push(awning(f, s, bw - 0.7, 4.75, 4.1, 1.15, (b + fi) % 2 ? soft : soft2));
      }
    });
    neon.push(box(pw + 0.4, 0.6, pd + 0.4, x, 5.4, z, glow)); // the fascia
    neon.push(box(pw + 0.2, 0.3, pd + 0.2, x, 6.55, z, glowAt(ICE, 0.35))); // a clerestory strip
    trimRing(neon, pw, pd, x, PODIUM + 0.15, z, glow2, 0.35, 0.3);
    // Skylight strips on the podium roof (the tower covers the ones beneath it).
    const alongX = pw >= pd, n = cheap ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const o = ((k + 0.5) / n - 0.5) * (alongX ? pd : pw) * 0.86;
      neon.push(box(alongX ? pw * 0.9 : 0.9, 0.2, alongX ? 0.9 : pd * 0.9, x + (alongX ? 0 : o), PODIUM + 0.12, z + (alongX ? o : 0), glowAt(WARM, 0.4)));
    }

    const group = new THREE.Group();
    mesh(group, lit, ctx.windowMat);
    mesh(group, neon, shared.neon);
    group.add(sign);
    return { group, height: roof + topAbove, holo: boxHolo([...tiers, { w: pw, d: pd, cx: x, cz: z, y0: 0, h: PODIUM }]) };
  },
};

export default kit;
