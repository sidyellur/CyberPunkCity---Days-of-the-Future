import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const LEVEL = 3.85;
const SIDES = 40;

type Station = [y: number, x: number, z: number, width: number, depth: number, twist: number];
const SHELLS: Station[][] = [
  [
    [0, -15, 0, 26, 42, -0.07], [16, -15.6, 0, 24.5, 43, -0.10],
    [43, -18.7, 1.5, 17.5, 36, -0.13], [73, -19.7, 4, 14.5, 29, -0.02],
    [99, -17, 1, 13, 25, 0.11], [122, -12.2, -1, 11.3, 21, 0.17],
    [135, -7.6, -3.4, 6, 15, 0.24],
  ],
  [
    [0, 15.3, 0, 23.5, 42, 0.08], [19, 16, 2, 23, 42, 0.07],
    [47, 18.3, 0.9, 17.2, 36, 0.03], [77, 19.0, -2.6, 16, 32, -0.015],
    [107, 16.8, -4.1, 16, 27, -0.09], [134, 12.9, -6, 13, 23, -0.18],
    [153, 7, -7.8, 5.5, 13, -0.25],
  ],
];

export function createArcology() {
  const root = new THREE.Group();
  root.name = 'Habitat Loom split-shell arcology';
  const materials: THREE.MeshStandardMaterial[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const standard = (parameters: THREE.MeshStandardMaterialParameters) => {
    const material = new THREE.MeshStandardMaterial(parameters);
    materials.push(material);
    return material;
  };
  const ceramic = standard({ color: 0xd0a15f, emissive: 0x8a511c, emissiveIntensity: 0.30, roughness: 0.68 });
  const pale = standard({ color: 0xe0bd87, emissive: 0x5f3a18, emissiveIntensity: 0.27, roughness: 0.68 });
  const shadow = standard({ color: 0x4f4135, emissive: 0x43291d, emissiveIntensity: 0.18, roughness: 0.78 });
  const copper = standard({ color: 0x935939, emissive: 0x75502c, emissiveIntensity: 0.22, roughness: 0.58, metalness: 0.45 });
  const verdigris = standard({ color: 0x517f71, emissive: 0x22554e, emissiveIntensity: 0.40, roughness: 0.63, metalness: 0.25 });
  const pathLight = standard({ color: 0xe5ba78, emissive: 0xffae58, emissiveIntensity: 1.7, roughness: 0.42 });
  const tealLight = standard({ color: 0xafdad1, emissive: 0x71dbc9, emissiveIntensity: 1.13, roughness: 0.46 });
  const planter = standard({ color: 0x354942, emissive: 0x163e32, emissiveIntensity: 0.38, roughness: 0.91 });
  const jade = standard({ color: 0x3a6849, emissive: 0x183629, emissiveIntensity: 0.50, roughness: 0.93 });
  const foliage = standard({ color: 0x68875a, emissive: 0x2d4a23, emissiveIntensity: 0.38, roughness: 0.94 });
  const darkGlass = standard({ color: 0x2c3b40, emissive: 0x29413d, emissiveIntensity: 0.38, roughness: 0.28, metalness: 0.34 });

  function add(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const batch = batches.get(material);
    if (batch) batch.push(geometry);
    else batches.set(material, [geometry]);
  }
  function box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0): void {
    add(material, new THREE.BoxGeometry(w, h, d).rotateY(angle).translate(x, y, z));
  }
  function bar(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
    const direction = b.clone().sub(a);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    add(material, new THREE.CylinderGeometry(radius, radius, direction.length(), 6).applyQuaternion(rotation).translate(mid.x, mid.y, mid.z));
  }

  function profile(shell: Station[]): (y: number) => Station {
    return y => {
      const hi = shell.findIndex(([height], index) => index > 0 && height >= y);
      if (hi === -1) return shell[shell.length - 1];
      const a = shell[hi - 1], b = shell[hi];
      const p = shell[Math.max(0, hi - 2)], q = shell[Math.min(shell.length - 1, hi + 1)];
      const span = b[0] - a[0];
      const t = Math.max(0, (y - a[0]) / span);
      const t2 = t * t, t3 = t2 * t;
      const values = a.map((value, i) => {
        const m0 = (b[i] - p[i]) / (b[0] - p[0]) * span;
        const m1 = (q[i] - a[i]) / (q[0] - a[0]) * span;
        return (2 * t3 - 3 * t2 + 1) * value + (t3 - 2 * t2 + t) * m0
          + (-2 * t3 + 3 * t2) * b[i] + (t3 - t2) * m1;
      });
      return values as Station;
    };
  }

  function shellPoint(section: Station, angle: number, extraX = 0, extraZ = extraX): THREE.Vector3 {
    const [y, x, z, w, d, twist] = section;
    const c = Math.cos(angle), s = Math.sin(angle);
    const u = Math.sign(c) * Math.abs(c) ** 0.61 * (w / 2 + extraX);
    const v = Math.sign(s) * Math.abs(s) ** 0.68 * (d / 2 + extraZ);
    return new THREE.Vector3(x + u * Math.cos(twist) - v * Math.sin(twist), y, z + u * Math.sin(twist) + v * Math.cos(twist));
  }

  function skin(sections: Station[], extraX: number, extraZ: number, capped: boolean): THREE.BufferGeometry {
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (const section of sections) {
      for (let i = 0; i <= SIDES; i++) {
        const angle = i / SIDES * Math.PI * 2;
        const p = shellPoint(section, angle, extraX, extraZ);
        positions.push(p.x, p.y, p.z);
        uv.push(i / SIDES * 5, p.y / (LEVEL * 8));
      }
    }
    const step = SIDES + 1;
    for (let row = 0; row < sections.length - 1; row++) {
      for (let i = 0; i < SIDES; i++) {
        const j = row * step + i;
        indices.push(j, j + step, j + 1, j + 1, j + step, j + step + 1);
      }
    }
    if (capped) {
      for (const row of [0, sections.length - 1]) {
        const [y, x, z] = sections[row];
        const centre = positions.length / 3;
        positions.push(x, y, z);
        uv.push(0, 0);
        for (let i = 0; i < SIDES; i++) {
          const j = row * step + i;
          if (row === 0) indices.push(centre, j, j + 1);
          else indices.push(centre, j + 1, j);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function canvasTexture(paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    paint(canvas.getContext('2d')!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  }

  const windows = canvasTexture(g => {
    g.fillStyle = '#4b5956';
    g.fillRect(0, 0, 256, 256);
    for (let floor = 0; floor < 8; floor++) for (let bay = 0; bay < 8; bay++) {
      const x = bay * 32, y = floor * 32;
      g.fillStyle = '#202e31';
      g.fillRect(x + 3, y + 5, 26, 22);
      g.fillStyle = floor % 2 ? '#617168' : '#6a766c';
      g.fillRect(x + 15, y + 5, 2, 22);
      g.fillRect(x + 3, y + 27, 26, 2);
    }
  });
  const interiors = canvasTexture(g => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    let state = 57;
    const rand = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296);
    for (let floor = 0; floor < 8; floor++) for (let bay = 0; bay < 8; bay++) {
      if (rand() > 0.59) continue;
      const x = bay * 32, y = floor * 32;
      g.fillStyle = rand() < 0.84 ? '#ffb378' : '#9bcdc4';
      g.globalAlpha = 0.40 + rand() * 0.55;
      g.fillRect(x + 4, y + 6, 10, 19);
      g.fillRect(x + 18, y + 6, 10, 19);
      g.globalAlpha = 1;
      g.fillStyle = '#3e3029';
      g.fillRect(x + 4, y + 6, 24, 1 + rand() * 7);
    }
  });
  const occupied = standard({
    map: windows, emissiveMap: interiors, emissive: 0xffffff, emissiveIntensity: 1.05,
    color: 0xb9b0a0, roughness: 0.49, metalness: 0.19,
  });

  for (const [index, shell] of SHELLS.entries()) {
    const at = profile(shell);
    const top = shell[shell.length - 1][0];
    const sectionCount = Math.ceil(top / 2.2);
    const sections = Array.from({ length: sectionCount + 1 }, (_, i) => at(top * i / sectionCount));
    add(occupied, skin(sections, -0.32, -0.38, true));
    add(shadow, skin([at(0), at(3.5)], 0.27, 0.45, true));
    for (let floor = 1; floor * LEVEL < top - 1.1; floor++) {
      const y = floor * LEVEL;
      const terrace = floor >= 4 && floor % 5 === index + 1;
      const front = terrace ? 3.1 : floor % 3 === 0 ? 0.73 : 0.34;
      const side = terrace ? 0.83 : 0.28;
      add(floor % 5 === 0 ? pale : ceramic, skin([at(y - 0.4), at(y)], side, front, true));
      if (floor % 5 === 0) add(shadow, skin([at(y - 0.6), at(y - 0.38)], side - 0.03, front - 0.04, false));
      if (!terrace) continue;
      add(verdigris, skin([at(y), at(y + 0.27)], side + 0.13, front + 0.12, false));
      for (let i = 0; i < 6; i++) {
        const angle = 0.77 + i * 0.34;
        const p = shellPoint(at(y + 0.18), angle, side - 0.2, front - 0.85);
        box(planter, p.x, y + 0.18, p.z, 2.2, 0.49, 1.18, -angle + Math.PI / 2);
        const size = 0.45 + ((i * 7 + floor) % 5) * 0.13;
        add(i % 2 ? jade : foliage, new THREE.IcosahedronGeometry(size, 1).scale(1.24, 1.25, 0.6).translate(p.x, y + 0.61, p.z));
        if ((i + floor) % 3 === 0) {
          add(jade, new THREE.IcosahedronGeometry(size * 0.75, 0).scale(0.8, 2.5, 0.62).translate(p.x + 0.6, y - 0.3, p.z + 0.51));
          box(pathLight, p.x - 1.24, y + 0.4, p.z, 0.20, 0.28, 0.20);
        }
      }
    }

    // Slender diagonal ribs cross the occupied shell and turn gently around its rounded faces.
    for (const [i, phase] of [0.1, 1.22, 2.6, 3.85, 5.26].entries()) {
      const path = new THREE.CatmullRomCurve3(Array.from({ length: 27 }, (_, step) => {
        const t = step / 26;
        const angle = phase + (index ? -1 : 1) * (0.8 * t + 0.21 * Math.sin(t * Math.PI));
        return shellPoint(at(1.6 + (top - 2.8) * t), angle, 0.57, 1.05);
      }));
      add(i % 3 === 0 ? verdigris : copper, new THREE.TubeGeometry(path, 46, i === 1 || i === 2 ? 0.54 : 0.39, 7, false));
    }
    const crown = at(top);
    box(pale, crown[1], top - 0.16, crown[2], crown[3] * 0.74, 0.52, crown[4] * 0.71, crown[5]);
    box(tealLight, crown[1], top + 0.16, crown[2], crown[3] * 0.59, 0.16, 0.29, crown[5]);
  }

  // Two narrow bridges bind the shells while keeping the planted atrium open.
  for (const [y, start, end, z] of [[47.6, -14.5, 14.0, 3.0], [110.5, -11.6, 12.5, -0.8]]) {
    const centre = (start + end) / 2;
    const length = end - start;
    box(copper, centre, y - 0.7, z, length, 1.46, 4.4);
    box(pale, centre, y + 0.1, z, length, 0.27, 4.6);
    for (const side of [-1, 1]) {
      const edge = z + side * 2.15;
      box(verdigris, centre, y + 1.44, edge, length, 0.18, 0.20);
      box(pathLight, centre, y - 0.23, edge + side * 0.10, length * 0.98, 0.08, 0.15);
      for (let x = start + 0.7; x < end; x += 2.6) {
        box(verdigris, x, y + 0.78, edge, 0.18, 1.35, 0.19);
        bar(copper, new THREE.Vector3(x, y - 0.7, edge), new THREE.Vector3(x + 1.4, y - 1.38, edge), 0.098);
      }
    }
  }

  // A planted public passage and lit bays carry the atrium through to the plaza.
  box(shadow, 0, 0.19, 1, 54, 0.38, 48);
  box(pale, 0, 0.42, 10.5, 9.7, 0.13, 30);
  for (const side of [-1, 1]) {
    const x = side * 5.9;
    box(verdigris, x, 0.75, 15.5, 1.35, 0.79, 18.4);
    box(planter, x, 1.02, 15.5, 1.25, 0.28, 18.25);
    for (let i = 0; i < 8; i++) {
      const z = 7.4 + i * 2.25;
      add(i % 3 === 0 ? foliage : jade, new THREE.IcosahedronGeometry(0.76, 1).scale(0.68, 1.54, 0.84).translate(x, 1.21, z));
      box(pathLight, x - side * 0.67, 0.55, z + 0.6, 0.15, 0.16, 0.35);
    }
    for (let bay = 0; bay < 5; bay++) {
      const bx = side * (7 + bay * 4.1);
      box(pale, bx, 2.37, 20.0, 0.41, 4.6, 0.84);
      box(darkGlass, bx + side * 1.7, 2.19, 19.5, 2.65, 3.56, 0.32);
      box(pathLight, bx + side * 1.7, 4.14, 20.38, 2.65, 0.10, 0.15);
    }
  }

  batches.forEach((batch, material) => {
    root.add(new THREE.Mesh(mergeGeometries(batch), material));
    batch.forEach(geometry => geometry.dispose());
  });
  root.updateMatrixWorld(true);

  return {
    root,
    dispose: () => {
      root.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach(material => material.dispose());
      windows.dispose();
      interiors.dispose();
    },
  };
}
