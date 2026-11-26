// Shared pieces of the commerce kits (commerce*.kit.ts): face helpers, cheap quads, and dark mass
// that rides in the lit-window mesh so that the third mesh of a lot is free for a sign, glass or planting.
import * as THREE from 'three';
import { FLOOR, Section, Tier, box, tiersFromRoof } from './core';

/** The podium (shopfronts, arcade, lobby) is ground-anchored: two storeys, inside the ground zone. */
export const PODIUM = 2 * FLOOR;

/**
 * A dark box for the LIT-WINDOW mesh: every uv points at the dark mullion of the window texture (as the
 * roofs of `windowBoxDown` do), so it is shaded mass with no glow, and costs no extra draw call.
 */
export function darkBox(w: number, h: number, d: number, cx: number, cy: number, cz: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.004, 0.004);
  g.translate(cx, cy, cz);
  return g;
}

/** One side of a box footprint: its outward normal (nx, nz), its length, and the centre of its edge. */
export interface Face { nx: number; nz: number; len: number; px: number; pz: number }

export function faces(t: { w: number; d: number; cx: number; cz: number }): Face[] {
  return [
    { nx: 0, nz: 1, len: t.w, px: t.cx, pz: t.cz + t.d / 2 },
    { nx: 0, nz: -1, len: t.w, px: t.cx, pz: t.cz - t.d / 2 },
    { nx: 1, nz: 0, len: t.d, px: t.cx + t.w / 2, pz: t.cz },
    { nx: -1, nz: 0, len: t.d, px: t.cx - t.w / 2, pz: t.cz },
  ];
}

/** A box on a face: `s` metres along it from its centre, centred `out` metres off the wall at height `y`; `along` x `h` x `thick`. */
export function faceBox(f: Face, s: number, y: number, along: number, h: number, thick: number, out: number, color: THREE.Color): THREE.BufferGeometry {
  const tx = Math.abs(f.nz), tz = Math.abs(f.nx); // the tangent is the other horizontal axis
  return box(tx ? along : thick, h, tz ? along : thick, f.px + tx * s + f.nx * out, y, f.pz + tz * s + f.nz * out, color);
}

/** An indexed quad a-b-c-d (counter-clockwise seen from its front) with one colour; `both` adds the back. 2 or 4 triangles. */
export function quad(a: number[], b: number[], c: number[], d: number[], color: THREE.Color, both = false): THREE.BufferGeometry {
  const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a))).normalize();
  const pts = both ? [a, b, c, d, a, b, c, d] : [a, b, c, d];
  const pos: number[] = [], nor: number[] = [], col: number[] = [], uv: number[] = [];
  pts.forEach((p, i) => {
    pos.push(p[0], p[1], p[2]);
    const s = i < 4 ? 1 : -1;
    nor.push(n.x * s, n.y * s, n.z * s);
    col.push(color.r, color.g, color.b);
    uv.push(0, 0);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(both ? [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6] : [0, 1, 2, 0, 2, 3]);
  return g;
}

/** A flat panel on a face (2 triangles): `along` x `h`, centred `s` along and at height `y`, `out` off the wall, facing outward. */
export function facePanel(f: Face, s: number, y: number, along: number, h: number, out: number, color: THREE.Color): THREE.BufferGeometry {
  const tx = Math.abs(f.nz), tz = Math.abs(f.nx);
  const cx = f.px + tx * s + f.nx * out, cz = f.pz + tz * s + f.nz * out;
  // "Left" as seen from outside, so that the winding faces outward on all four sides.
  const lx = -f.nz, lz = f.nx, a = along / 2;
  return quad(
    [cx + lx * a, y - h / 2, cz + lz * a], [cx - lx * a, y - h / 2, cz - lz * a],
    [cx - lx * a, y + h / 2, cz - lz * a], [cx + lx * a, y + h / 2, cz + lz * a], color,
  );
}

/** A sloping awning on a face (4 triangles, seen from above and below): from the wall at `yWall` out `reach` metres down to `yLip`. */
export function awning(f: Face, s: number, along: number, yWall: number, yLip: number, reach: number, color: THREE.Color): THREE.BufferGeometry {
  const tx = Math.abs(f.nz), tz = Math.abs(f.nx);
  const cx = f.px + tx * s, cz = f.pz + tz * s;
  const lx = -f.nz, lz = f.nx, a = along / 2, ox = f.nx * reach, oz = f.nz * reach, e = 0.08;
  return quad(
    [cx + lx * a + ox, yLip, cz + lz * a + oz], [cx - lx * a + ox, yLip, cz - lz * a + oz],
    [cx - lx * a + f.nx * e, yWall, cz - lz * a + f.nz * e], [cx + lx * a + f.nx * e, yWall, cz + lz * a + f.nz * e], color, true,
  );
}

/**
 * `tiersFromRoof` for a building that stands on a podium: the tiers stop at the podium's top instead of
 * the ground. `roofY - PODIUM` must be whole floors (it is when the roof is).
 */
export function tiersAbovePodium(roofY: number, tiers: readonly Tier[]): Section[] {
  return tiersFromRoof(roofY - PODIUM, tiers).map(t => ({ ...t, y0: t.y0 + PODIUM }));
}

/** Whole floors for a height, never fewer than 4 (a podium and two storeys). */
export const roofFor = (H: number): number => Math.max(4, Math.round(H / FLOOR)) * FLOOR;

/**
 * A neon colour at a given LUMINANCE. The bloom pass picks up everything above about 0.62, and the
 * palette is very uneven (cyan is 0.65 as it comes, magenta 0.26), so `bright(c, 1.9)` makes cyan lots
 * flood the screen while magenta ones barely glow. Thin lines: 0.5 to 0.8 (many close lines add up to a white haze). Surfaces: under 0.5.
 */
export function glowAt(c: THREE.Color | number, luminance: number): THREE.Color {
  const out = typeof c === 'number' ? new THREE.Color(c) : c.clone();
  const l = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
  return out.multiplyScalar(Math.min(2.4, luminance / Math.max(l, 0.05))); // capped: past this a saturated hue only clips to white
}
