// Shared materials and geometry helpers for district kits. Everything here is built once and
// shared by every lot of every block; nothing in this file touches the DOM, so it runs in Node tests.
//
// A lot has a budget of 3 meshes. The intended split is:
//   1. lit facades   `mesh(parts, ctx.windowMat)`     parts from `windowBoxDown`
//   2. dark mass     `mesh(parts, mats().body)`       parts from `box` / `paint` (or metal / glass / foliage)
//   3. everything that glows  `mesh(parts, ctx.shared.neon)`  parts from `box`, `trimRing`, `beam` with `bright()` colours
// A sign (`signPlane`) replaces one of them.
//
// Not ported from the showcase (district07.ts): `districtMaterial` / `frontageMaterial` paint two
// 256x512 canvases per profile and variant with daylight-toned facades, and `buildingSections`
// sets every setback as a fraction of the height, which breaks growth (kit.ts, rule 3). The game's
// seven `shared.windows` materials cover the lit-facade role and `tiersFromRoof` the massing. If a
// kit truly needs a new facade texture, add it HERE as one lazy shared material, not in the kit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLS, ROWS, CELL, Section, Shared, boxHolo, colorBox, windowBox } from '../city';

export { boxHolo, colorBox as box, windowBox };
export type { Section };

/** Storey height: one row of the window texture. */
export const FLOOR = CELL;

// ---------- Materials ----------

export interface KitMaterials {
  /** Dark matte mass: slabs, piers, plant, concrete. Vertex colours; keep them dark (0x10..0x40 per channel). */
  body: THREE.MeshStandardMaterial;
  /** Brushed metal: gantries, pipes, tanks. Vertex colours; picks up the pink and cyan washes. */
  metal: THREE.MeshStandardMaterial;
  /** Opaque tinted glazing that glows faintly in its own vertex colour, so it reads at night without a light. */
  glass: THREE.MeshStandardMaterial;
  /** Flat-shaded planting with a green self-glow, matching the park trees. Vertex colours tint it. */
  foliage: THREE.MeshStandardMaterial;
}

let materials: KitMaterials | null = null;

/** Adds `vertex colour x strength` to the emissive term, so one material can glow in many colours. */
function selfLit(m: THREE.MeshStandardMaterial, strength: number): THREE.MeshStandardMaterial {
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${strength.toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => `kit-selflit-${strength}`;
  return m;
}

/** The shared kit materials (lazy). All use vertex colours: build parts with `box` or `paint`. For neon use `shared.neon`. */
export function mats(): KitMaterials {
  if (!materials) {
    materials = {
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.15 }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.75 }),
      glass: selfLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.55 }), 0.45),
      foliage: selfLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 0.3),
    };
    for (const m of Object.values(materials)) m.userData.shared = true;
  }
  return materials;
}

const palette = new Map<number, THREE.Color>();
/** A cached THREE.Color for a hex value. Do not mutate the result. */
export function tint(hex: number): THREE.Color {
  let c = palette.get(hex);
  if (!c) palette.set(hex, (c = new THREE.Color(hex)));
  return c;
}
/** A colour pushed past 1 so that it blooms; for parts drawn with `shared.neon`. The tower parapets use 1.9. */
export const bright = (c: THREE.Color | number, k = 1.9): THREE.Color => (typeof c === 'number' ? new THREE.Color(c) : c.clone()).multiplyScalar(k);

// ---------- Geometry ----------

/** Give any geometry one vertex colour (in place) so that it can be merged with `box` parts. */
export function paint<G extends THREE.BufferGeometry>(g: G, color: THREE.Color): G {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const geometries = new Map<string, THREE.BufferGeometry>();
/**
 * A geometry cache for shapes that are expensive to make (lathes, extrusions, domes). The result is
 * shared and marked so; never transform, paint or dispose it. Take a copy to place it: `at(cached(...), ...)`.
 */
export function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geometries.set(key, g);
  }
  return g;
}

const mat4 = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
/** A copy of `g` scaled, turned about Y and moved to (x, y, z), optionally painted. The copy is yours to merge. */
export function at(g: THREE.BufferGeometry, x: number, y: number, z: number, scale: number | [number, number, number] = 1, turn = 0, color?: THREE.Color): THREE.BufferGeometry {
  const c = g.clone();
  c.userData = {};
  if (typeof scale === 'number') scl.setScalar(scale); else scl.set(scale[0], scale[1], scale[2]);
  c.applyMatrix4(mat4.compose(pos.set(x, y, z), quat.setFromAxisAngle(yAxis, turn), scl));
  return color ? paint(c, color) : c;
}

const WHITE = new THREE.Color(1, 1, 1);
/**
 * Merge parts into one geometry, whatever mix of indexed and non-indexed, coloured and plain they
 * are (missing colours become white, missing uvs zero). The parts are disposed unless shared.
 * Returns null for an empty list.
 */
export function merge(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const mixed = parts.some(p => p.index) && parts.some(p => !p.index);
  const anyColor = parts.some(p => p.attributes.color), anyUv = parts.some(p => p.attributes.uv);
  const made: THREE.BufferGeometry[] = [];
  const ready = parts.map(p => {
    let g = p;
    const own = () => { if (g === p && p.userData.shared) { g = p.clone(); g.userData = {}; made.push(g); } return g; };
    if (mixed && g.index) { g = g.toNonIndexed(); made.push(g); }
    if (!g.attributes.normal) own().computeVertexNormals();
    if (anyColor && !g.attributes.color) paint(own(), WHITE);
    if (anyUv && !g.attributes.uv) own().setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) own().deleteAttribute(name);
    return g;
  });
  const out = mergeGeometries(ready);
  for (const p of parts) if (!p.userData.shared) p.dispose();
  for (const g of made) g.dispose();
  if (!out) throw new Error('kits/core merge: parts could not be merged');
  return out;
}

/** Merge parts into one mesh with a shared material and add it to `group`. Nothing is added for an empty list. */
export function mesh(group: THREE.Group, parts: readonly THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh | null {
  const g = merge(parts);
  if (!g) return null;
  const m = new THREE.Mesh(g, material);
  group.add(m);
  return m;
}

/**
 * A window box hung from its top: it spans `yTop - h .. yTop`, and the window pattern is anchored to
 * `roofY` (the building's roof), so adding floors at the bottom never shifts the lit windows above.
 * Use with `ctx.windowMat` / `shared.windows[i]`. `uo`, `vo` offset the pattern; pass multiples of
 * 1/COLS and 1/ROWS (e.g. `Math.floor(rng() * 8) / 8`) to keep panes whole. Roof and floor are dark.
 * Keep `h` and `roofY - yTop` multiples of FLOOR so that no pane is cut.
 */
export function windowBoxDown(w: number, h: number, d: number, cx: number, yTop: number, cz: number, roofY: number, uo = 0, vo = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const span = CELL * ROWS;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) uv.setXY(k, 0.004, 0.004); // roofs sample the dark mullion
      else uv.setXY(k, uo + (uv.getX(k) * (f < 2 ? d : w)) / (CELL * COLS), vo + (yTop - roofY - (1 - uv.getY(k)) * h) / span);
    }
  }
  g.translate(cx, yTop - h / 2, cz);
  return g;
}

/** An axis-aligned bar from (x1, y1, z1) to (x2, y2, z2), `t` thick across: neon seams, rails, pipes, piers, masts. It ends exactly at the two points. */
export function beam(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, t: number, color: THREE.Color): THREE.BufferGeometry {
  return colorBox(Math.abs(x2 - x1) || t, Math.abs(y2 - y1) || t, Math.abs(z2 - z1) || t, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, color);
}

/**
 * A band around a w x d footprint centred on (cx, cz) at height y: the lit parapet of the plain
 * tower (`h` 0.9, `t` 0.5), or with a dark colour and the body material, a cornice. Pushes 4 boxes onto `out`.
 */
export function trimRing(out: THREE.BufferGeometry[], w: number, d: number, cx: number, y: number, cz: number, color: THREE.Color, h = 0.9, t = 0.5): void {
  out.push(
    colorBox(w + t + 0.1, h, t, cx, y, cz + d / 2, color), colorBox(w + t + 0.1, h, t, cx, y, cz - d / 2, color),
    colorBox(t, h, d + t + 0.1, cx + w / 2, y, cz, color), colorBox(t, h, d + t + 0.1, cx - w / 2, y, cz, color),
  );
}

export interface Tier {
  /** Footprint and centre. Keep it inside the lot. */
  w: number; d: number; cx: number; cz: number;
  /** Storeys in this tier, counted down from the tier above. The last tier ignores this and runs to the ground. */
  floors: number;
}

/**
 * Massing that grows correctly: tiers are listed FROM THE ROOF DOWN with fixed floor counts, and the
 * last one absorbs whatever height is left. A short building is just its crown; as H grows the wider
 * tiers come up out of the ground beneath it, and nothing above ever moves relative to the roof.
 * Returns the boxes top-first (tiers that would start below the ground are dropped).
 */
export function tiersFromRoof(roofY: number, tiers: readonly Tier[], floor = FLOOR): Section[] {
  const out: Section[] = [];
  let top = roofY;
  for (let i = 0; i < tiers.length && top > 0.01; i++) {
    const t = tiers[i];
    const bottom = i === tiers.length - 1 ? 0 : Math.max(0, top - t.floors * floor);
    out.push({ w: t.w, d: t.d, cx: t.cx, cz: t.cz, y0: bottom, h: top - bottom });
    top = bottom;
  }
  return out;
}

/** A stable random number in [0, 1) for (seed, k): per-floor variation that does not depend on how many floors there are. Seed it from `ctx.r`, e.g. `ctx.r[6] * 1e6`. */
export function hash01(seed: number, k: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(k | 0, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const unitPlane = () => cached('core:sign-plane', () => new THREE.PlaneGeometry(1, 1));
/**
 * One sign in the invented script: `shared.signs[i]` (even i are vertical 1:4 banners, odd are 5:2
 * boards). `size` is its width. It faces +Z turned by `turn` about Y, and is double-sided. This is a
 * mesh of its own and counts toward the lot's 3; the caller adds it to the group.
 */
export function signPlane(shared: Shared, i: number, size: number, x: number, y: number, z: number, turn = 0): THREE.Mesh {
  const s = shared.signs[((i % shared.signs.length) + shared.signs.length) % shared.signs.length];
  const m = new THREE.Mesh(unitPlane(), s.mat);
  m.scale.set(size, s.vertical ? size * 4 : size * 0.4, 1);
  m.position.set(x, y, z);
  m.rotation.y = turn;
  return m;
}
