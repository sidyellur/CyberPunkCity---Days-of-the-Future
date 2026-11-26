import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FILTER_GARDENS_HEIGHT = 40;

export function createFilterGardens() {
  const root = new THREE.Group();
  root.name = 'Filter Gardens';
  const geometries = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const textures: THREE.Texture[] = [];

  function material(parameters: THREE.MeshStandardMaterialParameters) {
    return new THREE.MeshStandardMaterial(parameters);
  }

  function map(size: number, paint: (g: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    paint(canvas.getContext('2d')!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    textures.push(texture);
    return texture;
  }

  let seed = 915;
  function random(): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const stoneMap = map(256, g => {
    g.fillStyle = '#a9a69a';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4400; i++) {
      g.fillStyle = i % 3 ? '#422d1f0f' : '#fff8de25';
      g.fillRect(random() * 256, random() * 256, 1 + random() * 4, 1 + random() * 5);
    }
    for (const x of [0, 86, 171, 254]) {
      g.fillStyle = '#574a3670';
      g.fillRect(x, 0, 2, 256);
    }
  });
  const waterMap = map(256, g => {
    const gradient = g.createRadialGradient(116, 138, 0, 122, 127, 170);
    gradient.addColorStop(0, '#263c41');
    gradient.addColorStop(0.56, '#37666b');
    gradient.addColorStop(1, '#192e3b');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 88; i++) {
      g.strokeStyle = i % 7 ? '#a6d7d31b' : '#bde1db57';
      g.lineWidth = i % 7 ? 0.8 : 1.8;
      g.beginPath();
      const start = random() * Math.PI * 2;
      const radius = 14 + random() * 83;
      g.ellipse(121 + random() * 14, 125 + random() * 10, radius, radius * 0.85, 0.21, start, start + 0.2 + random() * 1.2);
      g.stroke();
    }
  });

  const paving = material({ color: 0x858781, roughness: 0.88, map: stoneMap });
  const limestone = material({ color: 0xbdb3a0, roughness: 0.83, map: stoneMap });
  const coping = material({ color: 0xbab599, roughness: 0.56, metalness: 0.17, emissive: 0xa9a385, emissiveIntensity: 0.12 });
  const basalt = material({ color: 0x414750, roughness: 0.89 });
  const steel = material({ color: 0x667474, roughness: 0.48, metalness: 0.38 });
  const brass = material({ color: 0xab8060, roughness: 0.59, metalness: 0.26, emissive: 0x8b6548, emissiveIntensity: 0.17 });
  const whiteLight = material({ color: 0xc7c7a8, emissive: 0xffd6a2, emissiveIntensity: 0.7 });
  const waterLight = material({ color: 0x90c1bd, emissive: 0x7dbfbe, emissiveIntensity: 0.55 });
  const water = material({ color: 0x9bb9bb, map: waterMap, emissiveMap: waterMap, emissive: 0x7eafab, emissiveIntensity: 0.78, roughness: 0.28, metalness: 0.45 });
  const plant = [
    material({ color: 0x31473c, emissive: 0x486b43, emissiveIntensity: 0.37, roughness: 0.99, flatShading: true }),
    material({ color: 0x58684a, emissive: 0x53603d, emissiveIntensity: 0.37, roughness: 0.98, flatShading: true }),
    material({ color: 0x6c7950, emissive: 0x627d44, emissiveIntensity: 0.32, roughness: 0.98, flatShading: true }),
  ];

  function add(surface: THREE.Material, geometry: THREE.BufferGeometry): void {
    const batch = geometries.get(surface) ?? [];
    if (geometry.index) {
      batch.push(geometry.toNonIndexed());
      geometry.dispose();
    } else {
      batch.push(geometry);
    }
    geometries.set(surface, batch);
  }

  function box(surface: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0): void {
    add(surface, new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y, z));
  }

  function polar(radius: number, angle: number, y: number, x = 0, z = 0): THREE.Vector3 {
    return new THREE.Vector3(x + radius * Math.cos(angle), y, z + radius * Math.sin(angle));
  }

  function band(surface: THREE.Material, inner: number, outer: number, y: number, start = 0, span = Math.PI * 2, x = 0, z = 0): void {
    add(surface, new THREE.RingGeometry(inner, outer, Math.max(8, Math.round(span * 13)), 1, start, span).rotateX(-Math.PI / 2).translate(x, y, z));
  }

  function profile(surface: THREE.Material, points: [number, number][], x = 0, z = 0): void {
    add(surface, new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 74).translate(x, 0, z));
  }

  function beam(surface: THREE.Material, start: THREE.Vector3, end: THREE.Vector3, width: number, depth = width): void {
    const slope = end.clone().sub(start);
    const mid = start.clone().addScaledVector(slope, 0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), slope.clone().normalize());
    const transform = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    add(surface, new THREE.BoxGeometry(width, slope.length(), depth).applyMatrix4(transform));
  }

  function bush(surface: THREE.Material, x: number, y: number, z: number, rx: number, ry: number, rz: number): void {
    add(surface, new THREE.IcosahedronGeometry(1, 1).scale(rx, ry, rz).rotateY(random() * Math.PI).translate(x, y, z));
  }

  // Four plaza corners remain open. Low benches and trench drains define the approaches.
  box(basalt, 0, 0.14, 0, 59, 0.28, 59);
  box(paving, 0, 0.27, 0, 57, 0.24, 57);
  for (let i = -26; i <= 26; i += 4) {
    box(basalt, i, 0.397, 0, 0.055, 0.022, 56);
    box(basalt, 0, 0.398, i, 56, 0.022, 0.055);
  }
  for (const x of [-23, 23]) {
    for (const z of [-23, 23]) {
      const angle = Math.atan2(z, x);
      box(basalt, x, 0.59, z, 5.3, 0.38, 2.9, -angle);
      box(coping, x, 0.87, z, 5.4, 0.2, 3.0, -angle);
      box(plant[0], x, 0.99, z, 4.65, 0.095, 2.3, -angle);
      for (let i = 0; i < 6; i++) {
        const along = (i - 2.5) * 0.76;
        bush(plant[i % plant.length], x + along * Math.cos(angle), 1.6, z + along * Math.sin(angle), 0.64, 0.8 + random() * 0.19, 0.7);
      }
      box(whiteLight, x, 1.1, z - Math.sign(z) * 1.14, 1.68, 0.07, 0.08, -angle);
    }
  }

  // The lowest basin remains visible under the structure as a reflecting pool.
  profile(basalt, [[25.1, 0.34], [25.1, 0.9], [22.7, 1.33], [22.7, 0.58]]);
  band(water, 0, 25, 0.94);
  band(limestone, 24.2, 26.6, 1.52);
  band(coping, 25.9, 26.63, 1.57);
  profile(limestone, [[26.6, 0.35], [26.6, 1.56]]);
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2;
    if (i % 9 === 0) {
      // The long sill reads as a spillway at each axis.
      const p = polar(25.5, a, 1.255);
      box(basalt, p.x, p.y, p.z, 3.75, 0.64, 2.6, -a + Math.PI / 2);
    }
    if (i % 2) {
      const p = polar(24.85, a, 1.56);
      box(whiteLight, p.x, p.y, p.z, 0.18, 0.12, 0.78, -a);
    }
  }
  for (const axis of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const inward = polar(24, axis, 1.6);
    const outward = polar(29.2, axis, 0.42);
    const slope = outward.clone().sub(inward);
    const forward = slope.clone().normalize();
    const across = new THREE.Vector3(Math.sin(axis), 0, -Math.cos(axis));
    const up = forward.clone().cross(across);
    const center = inward.clone().lerp(outward, 0.5).addScaledVector(up, -0.1);
    const transform = new THREE.Matrix4().makeBasis(across, up, forward).setPosition(center);
    add(limestone, new THREE.BoxGeometry(3.2, 0.2, slope.length()).applyMatrix4(transform));
    for (const edge of [-1, 1]) {
      const rim = across.clone().multiplyScalar(edge * 1.54).addScaledVector(up, 0.21);
      beam(steel, inward.clone().add(rim), outward.clone().add(rim), 0.12);
    }
    const bearing = Math.PI / 2 - axis;
    const marker = polar(28.1, axis, 0.84);
    box(whiteLight, marker.x, marker.y, marker.z, 0.8, 0.07, 0.12, bearing);
  }

  // Buttresses and radial concrete fins carry the broad collection bowl.
  profile(basalt, [[8.7, 0.4], [9.3, 1.2], [8.5, 7.8], [11.5, 9.0], [11.5, 10.3]]);
  profile(limestone, [[10.7, 8.7], [13.6, 10.1], [17.6, 13.5], [21.2, 17.7], [22.2, 20.2], [21.2, 20.7], [20.65, 20.12], [18.95, 16.68]]);
  profile(basalt, [[11.7, 9.7], [16.2, 12.35], [20.04, 16.38], [21.47, 18.86]]);
  band(brass, 20.92, 22.1, 20.25);
  band(coping, 21.25, 22.33, 20.66);
  band(waterLight, 20.95, 21.23, 20.16);
  band(water, 0, 19.7, 19.22);

  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    beam(steel, polar(9.1, a, 1.13), polar(17.35, a, 13.25), 0.82, 1.32);
    beam(limestone, polar(11.7, a, 9.3), polar(22.2, a, 20.4), 0.62, 1.13);
    if (i % 3 === 0) beam(brass, polar(13.15, a, 10.75), polar(21.1, a, 18.7), 0.13);
  }

  // Reed beds and planted terraces let the main water surface read between their segments.
  for (let i = 0; i < 10; i++) {
    const start = i / 10 * Math.PI * 2 + 0.075;
    const span = 0.45;
    band(plant[i % plant.length], 14.6, 18.44, 19.38, -start - span, span);
    for (let j = 0; j < 6; j++) {
      const angle = start + 0.06 + j * 0.065;
      const p = polar(15.7 + random() * 1.65, angle, 19.95);
      bush(plant[(i + j) % plant.length], p.x, p.y, p.z, 0.58, 0.56 + random() * 0.56, 0.64);
    }
    if (i % 2 === 0) {
      const a = start + 0.28;
      const p = polar(17.6, a, 20.1);
      beam(brass, p, p.clone().add(new THREE.Vector3(0.23, 1.7, 0.08)), 0.15);
      bush(plant[(i + 2) % plant.length], p.x + 0.23, p.y + 2.3, p.z + 0.08, 1.28, 1.37, 1.08);
    }
  }

  // The offset upper intake is held by three visible branching columns.
  const upperX = -5.5;
  const upperZ = -4.0;
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + i * Math.PI * 2 / 3;
    const low = polar(2.25, a, 19.1, upperX, upperZ);
    const mid = polar(4.25, a, 25.4, upperX, upperZ);
    beam(steel, low, mid, 1.0, 1.31);
    for (const offset of [-0.32, 0.32]) beam(steel, mid, polar(8.8, a + offset, 31.65, upperX, upperZ), 0.56, 0.87);
  }
  profile(limestone, [[4.0, 26.75], [6.7, 27.5], [9.6, 30.8], [11.5, 33.2], [11.1, 33.65], [10.44, 33.22], [8.75, 31.1]], upperX, upperZ);
  profile(steel, [[5.6, 27.3], [7.5, 28.41], [9.6, 30.65]], upperX, upperZ);
  band(coping, 10.5, 11.48, 33.54, 0, Math.PI * 2, upperX, upperZ);
  band(water, 0, 10.4, 32.97, 0, Math.PI * 2, upperX, upperZ);
  band(plant[1], 7.9, 9.3, 33.05, 0, Math.PI * 2, upperX, upperZ);
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2;
    const p = polar(8.8, a, 33.39, upperX, upperZ);
    bush(plant[i % plant.length], p.x, p.y, p.z, 0.44, 0.58, 0.52);
  }

  // Cropped lamellae bend over the top bowl, leaving its open half visible.
  const ribs: THREE.Vector3[] = [];
  for (let i = 0; i < 9; i++) {
    const a = 2.65 + i * 0.34;
    const spring = polar(10.5, a, 33.42, upperX, upperZ);
    const crest = polar(8.4, a, FILTER_GARDENS_HEIGHT - 0.3, upperX, upperZ);
    const tip = polar(4.6, a - 0.16, 37.45, upperX, upperZ);
    const curve = new THREE.QuadraticBezierCurve3(spring, crest.clone().add(new THREE.Vector3(0, 2.05, 0)), tip);
    add(brass, new THREE.TubeGeometry(curve, 12, 0.28, 5));
    ribs.push(curve.getPoint(0.56));
    if (i > 0) beam(steel, ribs[i - 1], ribs[i], 0.21);
  }

  // Thin overflow channels connect the raised basins, with separate amber service lights.
  for (let i = 0; i < 3; i++) {
    const a = 0.84 + i * 0.29;
    const top = polar(10.9, a, 33.2, upperX, upperZ);
    const end = polar(11.65, a, 19.28, upperX, upperZ);
    beam(steel, top, end, 0.41, 0.3);
    beam(waterLight, top.clone().add(new THREE.Vector3(0.27, -0.12, 0.17)), end.clone().add(new THREE.Vector3(0.27, 0, 0.17)), 0.085, 0.09);
  }

  const signMap = map(256, g => {
    g.fillStyle = '#1d3336';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#d4d9c0';
    g.font = 'bold 49px sans-serif';
    g.fillText('FILTER', 18, 111);
    g.fillText('GARDENS', 18, 164);
    g.strokeStyle = '#8cbfb6';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(18, 187);
    g.lineTo(73, 187);
    g.bezierCurveTo(125, 187, 143, 207, 232, 187);
    g.stroke();
  });
  const sign = material({ map: signMap, emissiveMap: signMap, emissive: 0xc7e0d1, emissiveIntensity: 0.8, roughness: 0.64 });
  for (const [x, z, yaw] of [[6.5, 27.2, 0], [27.2, -7.3, Math.PI / 2]]) {
    box(steel, x, 2.26, z, 3.5, 3.8, 0.25, yaw);
    const offset = new THREE.Vector3(0, 0, 0.14).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    box(sign, x + offset.x, 2.56, z + offset.z, 3.06, 2.8, 0.043, yaw);
  }

  for (const [surface, batch] of geometries) {
    if (batch.length === 1) root.add(new THREE.Mesh(batch[0], surface));
    else {
      root.add(new THREE.Mesh(mergeGeometries(batch), surface));
      batch.forEach(geometry => geometry.dispose());
    }
  }

  return {
    root,
    dispose() {
      root.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const surface of geometries.keys()) surface.dispose();
      textures.forEach(texture => texture.dispose());
    },
  };
}
