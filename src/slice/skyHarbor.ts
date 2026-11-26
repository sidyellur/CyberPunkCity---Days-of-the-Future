import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Deck {
  x: number;
  z: number;
  y: number;
  rx: number;
  rz: number;
  angle: number;
}

interface Ring {
  height: number;
  scale: number;
  color: number;
}

type Finish = 'shell' | 'glass' | 'light';

const IVORY = 0xc9ccc4;
const TITANIUM = 0x778993;
const SHADOW = 0x324450;
const ICY = 0x80c3d5;
const LANTERN = 0xe3bd89;

const DECKS: readonly Deck[] = [
  { x: -3, z: 1, y: 49, rx: 24, rz: 18, angle: 0.21 },
  { x: 4, z: -5, y: 84, rx: 24, rz: 17, angle: -0.38 },
  { x: -6, z: 4, y: 120, rx: 22, rz: 17, angle: 0.39 },
  { x: 7, z: -3, y: 153, rx: 20, rz: 13.5, angle: -0.26 },
];

export function createSkyHarbor() {
  const root = new THREE.Group();
  root.name = 'Meridian Sky Harbor';
  const finishes: Record<Finish, THREE.Material> = {
    shell: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.53, metalness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.31, metalness: 0.34, emissive: 0x163940, emissiveIntensity: 0.32 }),
    light: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const pieces: Record<Finish, THREE.BufferGeometry[]> = { shell: [], glass: [], light: [] };
  const swatches = new Map<number, THREE.Color>();
  let randomState = 2250;

  function random(): number {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  function paint(geometry: THREE.BufferGeometry, color: number, finish: Finish): void {
    let tint = swatches.get(color);
    if (!tint) {
      tint = new THREE.Color(color);
      swatches.set(color, tint);
    }
    const vertices = geometry.attributes.position.count;
    const rgb = new Float32Array(vertices * 3);
    for (let i = 0; i < vertices; i++) {
      rgb[i * 3] = tint.r;
      rgb[i * 3 + 1] = tint.g;
      rgb[i * 3 + 2] = tint.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    collect(geometry, finish);
  }

  function collect(geometry: THREE.BufferGeometry, finish: Finish): void {
    if (geometry.index) {
      pieces[finish].push(geometry.toNonIndexed());
      geometry.dispose();
    } else {
      pieces[finish].push(geometry);
    }
  }

  function box(color: number, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0, finish: Finish = 'shell') {
    const geometry = new THREE.BoxGeometry(w, h, d).rotateY(angle).translate(x, y, z);
    paint(geometry, color, finish);
  }

  function spar(color: number, from: THREE.Vector3, to: THREE.Vector3, lower: number, upper: number, faces = 6, finish: Finish = 'shell') {
    const along = to.clone().sub(from);
    const axis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize());
    const center = from.clone().lerp(to, 0.5);
    const geometry = new THREE.CylinderGeometry(upper, lower, along.length(), faces);
    geometry.applyQuaternion(axis).translate(center.x, center.y, center.z);
    paint(geometry, color, finish);
  }

  function point(deck: Deck, theta: number, scale: number, y: number): THREE.Vector3 {
    const x = Math.cos(theta) * deck.rx * scale;
    const z = Math.sin(theta) * deck.rz * scale;
    return new THREE.Vector3(
      deck.x + x * Math.cos(deck.angle) + z * Math.sin(deck.angle),
      deck.y + y,
      deck.z - x * Math.sin(deck.angle) + z * Math.cos(deck.angle),
    );
  }

  function tangent(deck: Deck, theta: number): number {
    const before = point(deck, theta - 0.01, 1, 0);
    const after = point(deck, theta + 0.01, 1, 0);
    return -Math.atan2(after.z - before.z, after.x - before.x);
  }

  function loft(deck: Deck, rings: readonly Ring[], finish: Finish = 'shell'): void {
    const sides = 56;
    const position: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
    for (const [row, ring] of rings.entries()) {
      const color = new THREE.Color(ring.color);
      for (let i = 0; i < sides; i++) {
        const p = point(deck, i / sides * Math.PI * 2, ring.scale, ring.height);
        position.push(p.x, p.y, p.z);
        colors.push(color.r, color.g, color.b);
        uv.push(i / sides, row / (rings.length - 1));
        if (row === 0) continue;
        const a = (row - 1) * sides + i, b = (row - 1) * sides + (i + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    collect(geometry, finish);
  }

  function floor(deck: Deck, height: number, thickness: number, scale: number, color: number): void {
    const geometry = new THREE.CylinderGeometry(1, 1, thickness, 56);
    geometry.scale(deck.rx * scale, 1, deck.rz * scale).rotateY(deck.angle)
      .translate(deck.x, deck.y + height, deck.z);
    paint(geometry, color, 'shell');
  }

  function garden(deck: Deck, index: number): void {
    const side = index % 2 === 0 ? 1 : -1;
    const plots = [[-0.49, -0.17], [-0.19, -0.32], [0.2, -0.37], [0.51, -0.25]];
    for (const [across, ahead] of plots) {
      const plotX = across * deck.rx, plotZ = ahead * deck.rz * side;
      const sin = Math.sin(deck.angle), cos = Math.cos(deck.angle);
      const x = deck.x + plotX * cos + plotZ * sin, z = deck.z - plotX * sin + plotZ * cos;
      box(SHADOW, x, deck.y + 4.95, z, 4.4, 0.6, 2.31, deck.angle);
      box(0x576a52, x, deck.y + 5.19, z, 3.97, 0.11, 1.89, deck.angle);
      for (let i = 0; i < 5; i++) {
        const scale = 0.6 + random() * 0.41;
        const dx = (i - 2) * 0.73;
        const leaves = new THREE.IcosahedronGeometry(scale, 0).scale(0.83, 1.35, 0.87)
          .translate(x + dx * cos, deck.y + 5.48 + scale * 0.35, z - dx * sin);
        paint(leaves, [0x586b4d, 0x79844b, 0x40664f][i % 3], 'shell');
      }
    }
    // Slim nursery awnings sit inward from the exposed walkway.
    for (const angle of [1.16, 1.57, 1.98]) {
      const t = angle * side;
      const p = point(deck, t, 0.74, 5.5);
      const turn = tangent(deck, t);
      for (const shift of [-1, 1]) {
        box(TITANIUM, p.x + Math.cos(turn) * shift * 1.34, p.y + 0.8, p.z - Math.sin(turn) * shift * 1.34, 0.14, 2.7, 0.14);
      }
      box(IVORY, p.x, p.y + 2.04, p.z, 3.12, 0.2, 1.84, turn);
      box(LANTERN, p.x, p.y + 1.91, p.z, 2.4, 0.07, 0.21, turn, 'light');
    }
  }

  function inhabit(deck: Deck, index: number): void {
    // The outer rim cantilevers from a smaller ribbed underbelly.
    loft(deck, [
      { height: -5.5, scale: 0.38, color: SHADOW },
      { height: -4.8, scale: 0.61, color: TITANIUM },
      { height: -2.7, scale: 0.88, color: 0x546977 },
      { height: -0.55, scale: 1, color: IVORY },
      { height: 0.15, scale: 1.035, color: IVORY },
      { height: 0.55, scale: 1.025, color: TITANIUM },
    ]);
    loft(deck, [
      { height: 0.52, scale: 0.965, color: 0x345c6f },
      { height: 2.8, scale: 0.93, color: 0x456877 },
      { height: 3.42, scale: 0.9, color: 0x7396a4 },
    ], 'glass');
    loft(deck, [
      { height: 3.4, scale: 0.93, color: TITANIUM },
      { height: 3.82, scale: 0.974, color: IVORY },
      { height: 4.26, scale: 0.963, color: IVORY },
      { height: 4.68, scale: 0.86, color: TITANIUM },
    ]);
    floor(deck, 4.54, 0.27, 0.86, 0x858f88);
    loft(deck, [
      { height: 4.66, scale: 0.85, color: SHADOW },
      { height: 5.48, scale: 0.87, color: 0x466b75 },
      { height: 5.68, scale: 0.875, color: TITANIUM },
    ], 'glass');

    for (let i = 0; i < 42; i++) {
      const theta = i / 42 * Math.PI * 2;
      const heading = tangent(deck, theta);
      const mullion = point(deck, theta, 0.95, 1.96);
      box(TITANIUM, mullion.x, mullion.y, mullion.z, 0.15, 2.59, 0.27, heading);
      const window = point(deck, theta + 0.066, 0.95, 1.69);
      if (random() > 0.39) {
        const night = random() > 0.45;
        box(night ? ICY : LANTERN, window.x, window.y, window.z, 0.85 + random() * 0.49, 0.89, 0.13, heading, 'light');
      }
      if (i % 2 === 0) {
        const bottom = point(deck, theta, 0.47, -5.3);
        const edge = point(deck, theta, 0.971, -1.25);
        spar(i % 4 === 0 ? IVORY : TITANIUM, bottom, edge, 0.31, 0.17, 5);
      }
      if (i % 3 === 0) {
        const marker = point(deck, theta, 1.03, -0.15);
        box(i % 6 === 0 ? ICY : 0xb5bfc0, marker.x, marker.y, marker.z, 0.65, 0.14, 0.2, heading, 'light');
      }
    }

    garden(deck, index);
    // The interdeck load branches are distinct from the glazing and mechanical soffits.
    const trunkY = deck.y - 19;
    const trunkX = -10 + 0.126 * trunkY;
    const trunkZ = 1 - 0.048 * trunkY;
    for (const theta of [0.16, Math.PI - 0.18]) {
      const support = point(deck, theta, 0.74, -2.6);
      spar(TITANIUM, new THREE.Vector3(trunkX, trunkY, trunkZ), support, 1.46, 0.73);
      spar(IVORY, new THREE.Vector3(trunkX + 0.5, trunkY, trunkZ + 0.8), support.clone().add(new THREE.Vector3(0, 0.5, 0.55)), 0.38, 0.15);
    }
  }

  const podium: Deck = { x: -8, z: 1, y: 0, rx: 14.8, rz: 12.5, angle: -0.16 };
  loft(podium, [
    { height: 0, scale: 0.97, color: SHADOW },
    { height: 1, scale: 1, color: IVORY },
    { height: 3, scale: 0.99, color: TITANIUM },
    { height: 10.3, scale: 0.91, color: 0x4d6270 },
    { height: 12.3, scale: 0.68, color: IVORY },
    { height: 16.2, scale: 0.48, color: TITANIUM },
  ]);
  floor(podium, 16.1, 0.27, 0.49, IVORY);
  for (let i = 0; i < 24; i++) {
    const theta = i / 24 * Math.PI * 2;
    const p = point(podium, theta, 0.97, 5.5);
    box(i % 3 === 0 ? ICY : 0x435970, p.x, p.y, p.z, 1.63, 3.65, 0.16, tangent(podium, theta), i % 3 === 0 ? 'light' : 'glass');
  }

  // The service elevators and mechanical risers follow the inclined load-bearing spine.
  const spineFoot = new THREE.Vector3(-10, 8, 1);
  const spineTop = new THREE.Vector3(12.6, 178.5, -7.4);
  spar(IVORY, spineFoot, spineTop, 6.5, 3.1);
  for (const dz of [-1, 1]) {
    const foot = spineFoot.clone().add(new THREE.Vector3(-2.5, 4, dz * 5.4));
    const top = spineTop.clone().add(new THREE.Vector3(-1.06, -1.2, dz * 2.62));
    spar(TITANIUM, foot, top, 1.5, 0.59, 5);
    spar(SHADOW, foot.clone().add(new THREE.Vector3(0, 0, dz * 1.05)),
      top.clone().add(new THREE.Vector3(0, 0, dz * 0.55)), 0.54, 0.36, 4);
  }
  for (let y = 25; y < 176; y += 6.7) {
    const center = spineFoot.clone().lerp(spineTop, (y - 8) / 170.5);
    box(0x456371, center.x - 2.6, y, center.z + 4.02 - y * 0.006, 2.3, 0.81, 0.55, -0.15);
    box(y % 3 > 1 ? ICY : LANTERN, center.x - 2.6, y - 0.24, center.z + 4.32 - y * 0.006, 1.53, 0.16, 0.07, -0.15, 'light');
  }
  DECKS.forEach(inhabit);

  const head: Deck = { x: 12, z: -7.1, y: 172.2, rx: 8.6, rz: 6.05, angle: 0.13 };
  loft(head, [
    { height: -3, scale: 0.47, color: SHADOW },
    { height: -1, scale: 0.89, color: TITANIUM },
    { height: -0.2, scale: 1, color: IVORY },
    { height: 1.0, scale: 0.96, color: 0x7194a1 },
    { height: 2.13, scale: 0.8, color: IVORY },
  ]);
  floor(head, 2.1, 0.15, 0.8, TITANIUM);
  spar(IVORY, new THREE.Vector3(12.7, 175, -7.2), new THREE.Vector3(13.9, 182.4, -7.8), 1.78, 0.18);
  spar(ICY, new THREE.Vector3(13.75, 181.5, -7.72), new THREE.Vector3(14.05, 184, -7.9), 0.24, 0.14, 6, 'light');

  for (const finish of Object.keys(pieces) as Finish[]) {
    const mesh = new THREE.Mesh(mergeGeometries(pieces[finish]), finishes[finish]);
    root.add(mesh);
    pieces[finish].forEach(piece => piece.dispose());
  }

  return {
    root,
    dispose() {
      root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      Object.values(finishes).forEach(material => material.dispose());
    },
  };
}
