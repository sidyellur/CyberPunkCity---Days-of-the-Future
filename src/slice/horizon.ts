import * as THREE from 'three';
import { mulberry } from './city';

interface Span {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: THREE.Color;
  rotation?: THREE.Quaternion;
}

interface LandmarkSite {
  x: number;
  z: number;
  angle: number;
  scale: number;
  kind: 'sails' | 'dock';
}

interface Neighborhood {
  x: number;
  z: number;
  columns: number;
  rows: number;
  height: number;
  square: number;
  outer?: boolean;
}

export function createHorizon(windows: THREE.MeshStandardMaterial, extent: number): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Outer neighborhoods';
  const random = mulberry(225031);
  const unit = extent / 738;
  const districts: Neighborhood[] = [
    { x: -697, z: 24, columns: 5, rows: 8, height: 205, square: 86 },
    { x: -634, z: -644, columns: 6, rows: 5, height: 86, square: 96 },
    { x: -131, z: -666, columns: 5, rows: 5, height: 176, square: 94 },
    { x: 499, z: -717, columns: 5, rows: 6, height: 167, square: 90 },
    { x: 780, z: -98, columns: 6, rows: 5, height: 106, square: 92 },
    { x: -710, z: 665, columns: 7, rows: 5, height: 98, square: 90 },
    { x: -250, z: 834, columns: 7, rows: 4, height: 75, square: 83 },
    { x: 968, z: 592, columns: 4, rows: 7, height: 54, square: 90 },
    { x: -1268, z: -517, columns: 8, rows: 5, height: 185, square: 117, outer: true },
    { x: -337, z: -1245, columns: 8, rows: 5, height: 240, square: 121, outer: true },
    { x: 632, z: -1234, columns: 6, rows: 5, height: 178, square: 126, outer: true },
    { x: 1067, z: -667, columns: 8, rows: 4, height: 191, square: 119, outer: true },
    { x: -606, z: 1252, columns: 8, rows: 5, height: 102, square: 126, outer: true },
  ];

  const landmarks: LandmarkSite[] = [
    { x: -545, z: -313, angle: -0.35, scale: 1, kind: 'sails' },
    { x: 508, z: -520, angle: 0.4, scale: 0.86, kind: 'dock' },
    { x: -588, z: 515, angle: Math.PI / 2, scale: 0.72, kind: 'dock' },
    { x: 791, z: 274, angle: Math.PI * 0.68, scale: 0.7, kind: 'sails' },
  ];
  const cityBlocks: Span[] = [];
  const sailBlocks: Span[] = [];
  const silhouettes: Span[] = [];
  const shoulders: Span[] = [];
  const roofs: Span[] = [];
  const beacons: Span[] = [];
  const nearPalette = [0x657288, 0x586178, 0x554f72, 0x78727f].map(c => new THREE.Color(c));
  const farPalette = [0x1b2437, 0x1d2236, 0x28253d, 0x282b42].map(c => new THREE.Color(c));
  const roofPalette = [0x253147, 0x312d3d].map(c => new THREE.Color(c));
  const amber = new THREE.Color(0xa75e38);
  const red = new THREE.Color(0xa0414c);

  for (const district of districts) {
    for (let row = 0; row < district.rows; row++) {
      for (let col = 0; col < district.columns; col++) {
        const offsetX = col - (district.columns - 1) / 2;
        const offsetZ = row - (district.rows - 1) / 2;
        const x = (district.x + (offsetX + (random() - 0.5) * 0.19) * district.square) * unit;
        const z = (district.z + (offsetZ + (random() - 0.5) * 0.19) * district.square) * unit;
        // Leave the core and its first perimeter roads unobstructed at every orbit angle.
        if (Math.max(Math.abs(x), Math.abs(z)) < extent / 2 + 94 * unit || random() < 0.15) continue;
        if (landmarks.some(site => Math.hypot(x / unit - site.x, z / unit - site.z) < site.scale * 94)) continue;

        const center = 1 - Math.hypot(offsetX / district.columns, offsetZ / district.rows) * 0.85;
        const height = district.height * (0.26 + Math.pow(random(), 1.5) * center) * unit;
        const width = (district.outer ? 48 + random() * 43 : 24 + random() * 37) * unit;
        const depth = (district.outer ? 42 + random() * 46 : 24 + random() * 39) * unit;
        const palette = district.outer ? farPalette : nearPalette;
        const color = palette[Math.floor(random() * palette.length)];
        const bodies = district.outer ? silhouettes : cityBlocks;

        // Outer blocks share low inhabited podiums with the neighboring towers.
        if (!district.outer) {
          const podiumHeight = Math.min(height * 0.3, (11 + (col % 3) * 3) * unit);
          cityBlocks.push({
            x: x - 3 * unit, y: podiumHeight / 2, z: z + 3 * unit, width: width + 14 * unit,
            height: podiumHeight, depth: depth + 15 * unit, color: nearPalette[(col + row) % nearPalette.length],
          });
        }
        if (height > 83 * unit && random() < 0.72) {
          const base = height * (0.46 + random() * 0.22);
          bodies.push({ x, y: base / 2, z, width, height: base, depth, color });
          const dx = (random() - 0.5) * width * 0.18;
          const dz = (random() - 0.5) * depth * 0.18;
          bodies.push({
            x: x + dx, y: base + (height - base) / 2, z: z + dz,
            width: width * 0.63, height: height - base, depth: depth * 0.65, color,
          });
          if (!district.outer && random() < 0.52) {
            const capHeight = 8 * unit;
            shoulders.push({
              x: x + dx, y: height + capHeight / 2, z: z + dz,
              width: width * 0.63, height: capHeight, depth: depth * 0.65, color: roofPalette[0],
            });
            beacons.push({
              x: x + dx, y: height + capHeight, z: z + dz,
              width: 1.25 * unit, height: 1.25 * unit, depth: 1.25 * unit, color: red,
            });
          }
        } else {
          bodies.push({ x, y: height / 2, z, width, height, depth, color });
          if (!district.outer && random() < 0.64) {
            const penthouseHeight = (3 + random() * 7) * unit;
            roofs.push({
              x: x + width * 0.17, y: height + penthouseHeight / 2, z,
              width: width * 0.37, height: penthouseHeight, depth: depth * 0.43, color: roofPalette[1],
            });
          }
        }
        if (height > 106 * unit && random() < 0.35) {
          const mastHeight = (8 + random() * 16) * unit;
          const mx = x - width * 0.17;
          const mz = z - depth * 0.17;
          roofs.push({
            x: mx, y: height + mastHeight / 2, z: mz,
            width: 0.9 * unit, height: mastHeight, depth: 0.9 * unit, color: roofPalette[0],
          });
          beacons.push({
            x: mx, y: height + mastHeight, z: mz,
            width: 1.7 * unit, height: 1.7 * unit, depth: 1.7 * unit, color: amber,
          });
        }
      }
    }
  }

  const pierColor = new THREE.Color(0x273043);
  const deckColor = new THREE.Color(0x343e50);
  const glazing = new THREE.Color(0x9daab6);
  const markerColor = new THREE.Color(0x669d9d);
  const up = new THREE.Vector3(0, 1, 0);
  for (const site of landmarks) {
    const scale = site.scale * unit;
    const rotation = new THREE.Quaternion().setFromAxisAngle(up, site.angle);
    const origin = new THREE.Vector3(site.x * unit, 0, site.z * unit);
    function add(
      target: Span[], color: THREE.Color, x: number, y: number, z: number,
      width: number, height: number, depth: number, yaw = 0, lean = 0,
    ): void {
      const p = new THREE.Vector3(x * scale, y * scale, z * scale).applyQuaternion(rotation).add(origin);
      const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, lean, 'YXZ'));
      target.push({
        x: p.x, y: p.y, z: p.z, width: width * scale, height: height * scale, depth: depth * scale,
        color, rotation: rotation.clone().multiply(local),
      });
    }

    if (site.kind === 'sails') {
      // A public concourse spans between two differently raked shafts.
      add(silhouettes, pierColor, 0, 13, 0, 155, 26, 74);
      add(sailBlocks, glazing, -40, 131, 1, 49, 205, 43, 0, -0.035);
      add(sailBlocks, glazing, 44, 117, -4, 41, 180, 39, Math.PI, 0.035);
      for (const [x, top] of [[-39, 236], [43, 209]]) {
        add(roofs, pierColor, x, top, 1, 12, 17, 8);
        add(beacons, amber, x, top + 9, 1, 2.3, 2.3, 2.3);
      }
      add(silhouettes, deckColor, 4, 114, 2, 86, 8, 26);
      add(cityBlocks, glazing, 4, 120, 2, 77, 5.5, 21);
      add(beacons, markerColor, 5, 114.5, 15.1, 75, 1.1, 0.7);
      add(silhouettes, pierColor, -14, 99, 2, 9, 50, 8, 0, -0.48);
      add(silhouettes, pierColor, 24, 101, 2, 9, 45, 8, 0, 0.54);
    } else {
      // A raised freight deck leaves yard space between its splayed piers.
      add(silhouettes, pierColor, 1, 8, 0, 143, 16, 83);
      for (const side of [-1, 1]) {
        add(silhouettes, pierColor, side * 47, 47, 21, 13, 84, 13, 0, -side * 0.27);
        add(silhouettes, pierColor, side * 47, 47, -21, 13, 84, 13, 0, -side * 0.27);
      }
      add(silhouettes, deckColor, 2, 89, 0, 134, 11, 60);
      add(cityBlocks, glazing, -11, 104, -4, 93, 22, 37);
      add(sailBlocks, glazing, 39, 119, 3, 49, 53, 48);
      add(roofs, pierColor, 41, 150, 1, 8, 15, 8);
      add(beacons, red, 41, 158, 1, 2.6, 2.6, 2.6);
      add(beacons, markerColor, 1, 94, 30, 114, 1.1, 0.7);
    }
  }

  const map = windows.map?.clone() ?? null;
  if (map) {
    map.repeat.set(2, 3);
    map.needsUpdate = true;
  }
  const windowMaterial = windows.clone();
  windowMaterial.map = map;
  windowMaterial.emissiveMap = map;
  windowMaterial.emissiveIntensity = 0.3;
  windowMaterial.color.set(0x42536a);
  windowMaterial.emissive.set(0x627499);
  windowMaterial.roughness = 0.89;
  windowMaterial.metalness = 0.09;

  const box = new THREE.BoxGeometry();
  const falloff = new THREE.MeshBasicMaterial();
  const sail = new THREE.BoxGeometry();
  const corners = sail.attributes.position;
  for (let i = 0; i < corners.count; i++) {
    const x = corners.getX(i);
    const y = corners.getY(i);
    const z = corners.getZ(i);
    if (y > 0) corners.setXYZ(i, x * 0.56 + 0.19, y + x * 0.18, z * 0.58);
  }
  sail.computeVertexNormals();
  const tapered = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.47, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xe9c6a9 });
  const matrix = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  function batch(geometry: THREE.BufferGeometry, material: THREE.Material, spans: Span[]): void {
    if (!spans.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, spans.length);
    spans.forEach(({ x, y, z, width, height, depth, color, rotation }, index) => {
      matrix.compose(position.set(x, y, z), rotation ?? identity, scale.set(width, height, depth));
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color);
    });
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  batch(box, windowMaterial, cityBlocks);
  batch(sail, windowMaterial, sailBlocks);
  batch(box, falloff, silhouettes);
  batch(box, falloff, roofs);
  batch(tapered, falloff, shoulders);
  batch(box, lightMaterial, beacons);
  return root;
}
