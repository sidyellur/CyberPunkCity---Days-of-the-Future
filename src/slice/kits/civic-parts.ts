// Geometry shared by the research and defence kits (research.kit.ts, defence.kit.ts). Not a kit:
// the registry only picks up `*.kit.ts`.
import * as THREE from 'three';
import { cached, paint } from './core';

/**
 * A four-sided truncated pyramid: `w0 x d0` at `y0` (bottom) tapering to `w1 x d1` at `y1` (top),
 * centred on (cx, cz), with a top cap and no bottom. Flat-shaded. If the bottom would be below the
 * ground it is CUT at y = 0 (not squashed), so a shape hung from the roof looks the same at every
 * level and simply shows more of itself as the building grows. Null when nothing is above ground.
 */
export function frustum(cx: number, cz: number, y0: number, w0: number, d0: number, y1: number, w1: number, d1: number, color: THREE.Color): THREE.BufferGeometry | null {
  if (y1 <= 0.01) return null;
  if (y0 < 0) {
    const t = -y0 / (y1 - y0);
    w0 += (w1 - w0) * t; d0 += (d1 - d0) * t; y0 = 0;
  }
  const sx = [-1, 1, 1, -1], sz = [-1, -1, 1, 1];
  const b = sx.map((s, i) => [cx + (s * w0) / 2, y0, cz + (sz[i] * d0) / 2]);
  const t = sx.map((s, i) => [cx + (s * w1) / 2, y1, cz + (sz[i] * d1) / 2]);
  const p: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    p.push(...b[j], ...b[i], ...t[i], ...b[j], ...t[i], ...t[j]);
  }
  p.push(...t[0], ...t[3], ...t[2], ...t[0], ...t[2], ...t[1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return paint(g, color);
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
/** A painted copy of a cached unit shape, scaled (x, y, z), tilted about X and Z, turned about Y and moved. */
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.Color, turn = 0, tiltX = 0, tiltZ = 0): THREE.BufferGeometry {
  const c = g.clone();
  c.userData = {};
  c.applyMatrix4(m4.compose(v.set(x, y, z), q.setFromEuler(e.set(tiltX, turn, tiltZ, 'YXZ')), s3.set(sx, sy, sz)));
  return paint(c, color);
}

/** A solid n-sided disc or drum, radius r, h tall, centred on (x, y, z); `rTop`, `rBot` (fractions of r) taper it into a saucer. 4n triangles. */
export function drum(n: number, r: number, h: number, x: number, y: number, z: number, color: THREE.Color, turn = 0, rTop = 1, rBot = 1): THREE.BufferGeometry {
  return place(cached(`civic:drum:${n}:${rTop}:${rBot}`, () => new THREE.CylinderGeometry(rTop, rBot, 1, n)), x, y, z, r, h, r, color, turn);
}

/** An open n-sided band (no caps), for a lit rim round a drum; seen from outside only. 2n triangles. */
export function band(n: number, r: number, h: number, x: number, y: number, z: number, color: THREE.Color, turn = 0): THREE.BufferGeometry {
  return place(cached(`civic:band:${n}`, () => new THREE.CylinderGeometry(1, 1, 1, n, 1, true)), x, y, z, r, h, r, color, turn);
}

/** A halo: a thin n-sided ring of radius r lying flat at (x, y, z), then tilted. `tube` is its thickness in metres. 6n triangles. */
export function halo(n: number, r: number, tube: number, x: number, y: number, z: number, color: THREE.Color, tiltX = 0, tiltZ = 0): THREE.BufferGeometry {
  // The tube is modelled at 4% of the radius and thickened vertically to `tube`, so it stays visible on big rings.
  const k = Math.max(1, tube / (r * 0.04));
  return place(cached(`civic:halo:${n}`, () => new THREE.TorusGeometry(1, 0.04, 3, n).rotateX(Math.PI / 2)), x, y, z, r, r * k, r, color, 0, tiltX, tiltZ);
}

/** A flat ring lying on a roof, facing up: landing-pad markings. 2n triangles. */
export function flatRing(n: number, rIn: number, rOut: number, x: number, y: number, z: number, color: THREE.Color, turn = 0): THREE.BufferGeometry {
  const key = Math.round((rIn / rOut) * 100);
  return place(cached(`civic:ring:${n}:${key}`, () => new THREE.RingGeometry(key / 100, 1, n, 1).rotateX(-Math.PI / 2)), x, y, z, rOut, 1, rOut, color, turn);
}

/** A faceted gem (an octahedron), radius r and stretched to `tall` high: data cores, emitters. 8 triangles. */
export function gem(r: number, tall: number, x: number, y: number, z: number, color: THREE.Color, turn = 0): THREE.BufferGeometry {
  return place(cached('civic:gem', () => new THREE.OctahedronGeometry(1, 0)), x, y, z, r, tall / 2, r, color, turn);
}

/** A dome (upper half of a sphere) sitting on y. */
export function dome(n: number, r: number, x: number, y: number, z: number, color: THREE.Color, squash = 1): THREE.BufferGeometry {
  return place(cached(`civic:dome:${n}`, () => new THREE.SphereGeometry(1, n, 3, 0, Math.PI * 2, 0, Math.PI / 2)), x, y, z, r, r * squash, r, color);
}

/** A box turned about Y and tilted about X: radar panels. */
export function slab(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, turn = 0, tiltX = 0): THREE.BufferGeometry {
  return place(cached('civic:box', () => new THREE.BoxGeometry(1, 1, 1)), x, y, z, w, h, d, color, turn, tiltX);
}
