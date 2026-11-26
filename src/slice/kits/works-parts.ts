// Geometry helpers shared by the working-district kits (farms, industry, power): round and pitched
// shapes that core.ts does not have. Everything returns a painted geometry in WORLD coordinates that
// the caller owns and merges (core.ts `mesh`); nothing here makes a material.
import * as THREE from 'three';
import { COLS, ROWS, CELL } from '../city';
import { paint } from './core';

/** A vertical cylinder (or cone frustum) from y0 to y1 centred on (x, z). Open: no caps. */
export function cyl(x: number, y0: number, y1: number, z: number, rTop: number, rBottom: number, seg: number, color: THREE.Color, open = true): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, y1 - y0, seg, 1, open);
  g.translate(x, (y0 + y1) / 2, z);
  return paint(g, color);
}

/** A flat disc at height y, facing up (or down). */
export function disc(x: number, y: number, z: number, r: number, seg: number, color: THREE.Color, down = false): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}

/** A flat ring at height y, facing up: r0 inside, r1 outside. */
export function annulus(x: number, y: number, z: number, r0: number, r1: number, seg: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(r0, r1, seg, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}

/** The upper half of a sphere of radius r, squashed to `ry` tall, standing on height y. */
export function dome(x: number, y: number, z: number, r: number, ry: number, seg: number, rings: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, rings, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, ry / r, 1);
  g.translate(x, y, z);
  return paint(g, color);
}

/** A thin meridian strip over a dome (see `dome`), at angle `turn` about Y: a lit rib. */
export function domeRib(x: number, y: number, z: number, r: number, ry: number, turn: number, width: number, rings: number, color: THREE.Color): THREE.BufferGeometry {
  const a = width / r;
  const g = new THREE.SphereGeometry(r, 1, rings, Math.PI - a / 2, a, 0, Math.PI / 2);
  g.scale(1, ry / r, 1);
  g.rotateY(turn);
  g.translate(x, y, z);
  return paint(g, color);
}

/** A box that points outward from (cx, cz) at angle `turn` about Y, spanning r0..r1 radially and y0..y1: a fin or buttress. */
export function radialBox(cx: number, cz: number, turn: number, r0: number, r1: number, y0: number, y1: number, t: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(r1 - r0, y1 - y0, t);
  g.translate((r0 + r1) / 2, (y0 + y1) / 2, 0);
  g.rotateY(turn);
  g.translate(cx, 0, cz);
  return paint(g, color);
}

/**
 * A surface of revolution about the vertical through (x, z). `profile` is [radius, y] pairs from the
 * top down; it is cut off at the ground, so a profile hung from the roof can run below y = 0.
 */
export function lathe(x: number, z: number, profile: readonly (readonly [number, number])[], seg: number, color: THREE.Color): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    if (y >= 0) { pts.push(new THREE.Vector2(r, y)); continue; }
    if (i > 0 && profile[i - 1][1] > 0) {
      const [pr, py] = profile[i - 1];
      pts.push(new THREE.Vector2(pr + ((r - pr) * py) / (py - y), 0));
    }
    break;
  }
  // LatheGeometry wants the points bottom-up for outward faces.
  const g = new THREE.LatheGeometry(pts.reverse(), seg);
  g.translate(x, 0, z);
  return paint(g, color);
}

/**
 * A convex profile pulled into a prism: gables, sawtooth teeth, vaults. `profile` is [u, y] pairs
 * (y measured up from y0) going round the cross-section, the base edge last; the prism is `len` long
 * along X when `alongX`, else along Z, and `u` runs along the other axis. No bottom face.
 */
export function prism(profile: readonly (readonly [number, number])[], len: number, alongX: boolean, cx: number, y0: number, cz: number, color: THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = profile.length;
  let mu = 0, my = 0;
  for (const [u, y] of profile) { mu += u / n; my += y / n; }
  const v = (u: number, y: number, s: number): [number, number, number] => (alongX ? [s, y, u] : [u, y, s]);
  const centre = new THREE.Vector3(...v(mu, my, 0));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), mid = new THREE.Vector3();
  const tri = (p: [number, number, number], q: [number, number, number], r: [number, number, number]) => {
    a.set(...p); b.set(...q); c.set(...r);
    nrm.subVectors(b, a).cross(mid.subVectors(c, a));
    mid.copy(a).add(b).add(c).divideScalar(3).sub(centre);
    if (nrm.dot(mid) < 0) pos.push(...p, ...r, ...q); else pos.push(...p, ...q, ...r); // wind every face outward
  };
  const h = len / 2;
  for (let i = 0; i < n - 1; i++) { // the sides; the last edge (the base) is left open
    const [u1, y1] = profile[i], [u2, y2] = profile[i + 1];
    tri(v(u1, y1, -h), v(u2, y2, -h), v(u2, y2, h));
    tri(v(u1, y1, -h), v(u2, y2, h), v(u1, y1, h));
  }
  for (const s of [-h, h]) for (let i = 1; i < n - 1; i++) tri(v(profile[0][0], profile[0][1], s), v(profile[i][0], profile[i][1], s), v(profile[i + 1][0], profile[i + 1][1], s));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  g.translate(cx, y0, cz);
  return paint(g, color);
}

/** A pitched roof: ridge along X when `alongX`, `span` across, `h` tall. */
export const gable = (span: number, h: number, len: number, alongX: boolean, cx: number, y0: number, cz: number, color: THREE.Color): THREE.BufferGeometry =>
  prism([[-span / 2, 0], [0, h], [span / 2, 0]], len, alongX, cx, y0, cz, color);

/** A barrel vault: `span` across, `h` tall, `steps` facets. */
export function vault(span: number, h: number, len: number, alongX: boolean, cx: number, y0: number, cz: number, steps: number, color: THREE.Color): THREE.BufferGeometry {
  const p: [number, number][] = [];
  for (let i = 0; i <= steps; i++) p.push([(-Math.cos((Math.PI * i) / steps) * span) / 2, Math.sin((Math.PI * i) / steps) * h]);
  return prism(p, len, alongX, cx, y0, cz, color);
}

/**
 * A band of lit windows wrapped round a drum: `windowBoxDown` for cylinders. It spans yTop - h .. yTop
 * with the pattern anchored to `roofY`, and a whole number of panes goes round. Use with `ctx.windowMat`.
 */
export function windowDrum(r: number, h: number, cx: number, yTop: number, cz: number, roofY: number, seg: number, uo = 0, vo = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const panes = Math.max(COLS, Math.round((2 * Math.PI * r) / CELL));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uo + (uv.getX(i) * panes) / COLS, vo + (yTop - roofY - (1 - uv.getY(i)) * h) / (CELL * ROWS));
  g.translate(cx, yTop - h / 2, cz);
  return g;
}
