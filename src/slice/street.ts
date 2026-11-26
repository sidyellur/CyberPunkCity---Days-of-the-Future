import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const STREET_CORNER = {
  blockX: 4, blockZ: 7,
  camera: { x: 34, z: 291, yaw: 0.86, pitch: 0.18 },
};

export function createStreetCorner() {
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const standard = (parameters: THREE.MeshStandardMaterialParameters) => {
    const material = new THREE.MeshStandardMaterial(parameters);
    materials.push(material);
    return material;
  };
  const texture = (width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d')!);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 8;
    textures.push(result);
    return result;
  };
  const concrete = standard({ color: 0x777370, roughness: 0.94 });
  const stone = standard({ color: 0x454b53, roughness: 0.88 });
  const metal = standard({ color: 0x292e32, roughness: 0.55, metalness: 0.35 });
  const glass = standard({ color: 0x283638, roughness: 0.22, metalness: 0.28 });
  const warmGlass = standard({ color: 0x79573b, emissive: 0xcb8047, emissiveIntensity: 0.23, roughness: 0.31 });
  const teal = standard({ color: 0x72c6b5, emissive: 0x73dfc4, emissiveIntensity: 0.92, roughness: 0.45 });
  const amber = standard({ color: 0xd7aa7a, emissive: 0xffad60, emissiveIntensity: 0.65, roughness: 0.45 });
  const signMap = texture(512, 128, g => {
    g.fillStyle = '#131d20';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#a4ebd3';
    g.font = 'bold 52px sans-serif';
    g.textAlign = 'center';
    g.fillText('NIGHT MARKET', 256, 68);
    g.font = '24px monospace';
    g.fillText('FOOD  /  SUPPLIES', 256, 105);
  });
  const sign = standard({ map: signMap, emissiveMap: signMap, emissive: 0xffffff, emissiveIntensity: 0.83, roughness: 0.62 });

  const boxes = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const box = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const pieces = boxes.get(m) ?? [];
    pieces.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    boxes.set(m, pieces);
  };

  function addBoxes(parent: THREE.Group): void {
    for (const [material, pieces] of boxes) {
      parent.add(new THREE.Mesh(mergeGeometries(pieces), material));
      pieces.forEach(piece => piece.dispose());
    }
    boxes.clear();
  }

  function facade(parent: THREE.Group, x: number, z: number, width: number, depth: number, market: boolean) {
    const front = z + depth / 2;
    box(stone, x, 3.65, front, width, 7.3, 0.16);
    box(concrete, x + width / 2, 3.65, z, 0.22, 7.3, depth);
    box(metal, x, 0.23, front + 0.13, width, 0.46, 0.28);
    const bayWidth = width / 5;
    for (let i = 0; i < 5; i++) {
      const bay = x + (i - 2) * bayWidth;
      const entrance = i === 2;
      const frame = market ? metal : concrete;
      box(frame, bay, 2.23, front + 0.24, bayWidth - 0.15, 4.0, 0.58);
      box(market && i !== 4 ? warmGlass : glass, bay, 2.23, front + 0.54, bayWidth - 0.63, 3.55, 0.04);
      for (const side of [-1, 1]) {
        box(frame, bay + side * (bayWidth / 2 - 0.21), 2.23, front + 0.66, 0.22, 4, 0.38);
      }
      box(metal, bay, entrance ? 2.9 : 1.08, front + 0.66, bayWidth - 0.35, 0.08, 0.18);
      box(metal, bay, 2.23, front + 0.66, 0.07, 3.55, 0.18);
      if (entrance) box(metal, bay + 0.23, 1.39, front + 0.79, 0.28, 0.07, 0.08);
      box(concrete, bay, 6.04, front + 0.18, bayWidth - 0.15, 2.28, 0.32);
      box(i % 3 === 0 ? warmGlass : glass, bay, 6.05, front + 0.35, bayWidth - 0.86, 1.63, 0.05);
      box(metal, bay, 5.22, front + 0.44, bayWidth - 0.68, 0.13, 0.22);
    }

    if (market) {
      box(metal, x, 4.51, front + 1.04, width - 0.4, 0.23, 2.15);
      box(teal, x, 4.39, front + 2.04, width - 0.5, 0.065, 0.09);
      box(sign, x, 5.02, front + 0.8, 9.2, 1.56, 0.14);
      const light = new THREE.PointLight(0x8fe2c5, 156, 23, 2);
      light.position.set(x, 4.15, front + 2.6);
      parent.add(light);
    } else {
      box(metal, x, 4.42, front + 0.92, 7.7, 0.32, 1.83);
      box(amber, x, 4.23, front + 1.09, 5.3, 0.065, 0.17);
      const light = new THREE.PointLight(0xffbd87, 115, 20, 2);
      light.position.set(x, 4.05, front + 2.05);
      parent.add(light);
      // Original apartment balconies and ventilation remain beside the freight retrofit.
      for (let level = 0; level < 5; level++) {
        const y = 9.2 + level * 4.1;
        const east = x + width / 2;
        for (const sideZ of [z + 7, z - 7]) {
          box(concrete, east + 0.51, y, sideZ, 1.45, 0.22, 5.05);
          box(metal, east + 1.14, y + 0.84, sideZ, 0.07, 0.1, 5.05);
          for (const offset of [-2.45, 0, 2.45]) {
            box(metal, east + 1.14, y + 0.41, sideZ + offset, 0.075, 0.82, 0.075);
          }
          box(stone, east + 0.22, y + 0.62, sideZ - 1.72, 0.46, 0.55, 0.76);
        }
      }
    }
    // Concrete piers and small service windows wrap onto the side street.
    for (let i = 0; i < 7; i++) {
      const sideZ = z + (i - 3) * depth / 7;
      box(stone, x + width / 2 + 0.15, 3.75, sideZ + 2.3, 0.25, 7.3, 0.25);
      box(metal, x + width / 2 + 0.14, 5.9, sideZ, 0.18, 1.32, 2.45);
      box(i === 4 ? warmGlass : glass, x + width / 2 + 0.24, 5.9, sideZ, 0.06, 1.08, 2.19);
    }
    box(metal, x + width / 2 + 0.15, 1.5, z + depth * 0.23, 0.28, 3, 2.25);
    for (let i = 0; i < 7; i++) {
      box(metal, x + width / 2 + 0.17, 2.1 + i * 0.15, z - depth * 0.21, 0.15, 0.075, 2.4);
    }
    addBoxes(parent);
  }

  function pavement(parent: THREE.Group, x: number, z: number) {
    const roadMap = texture(1024, 512, g => {
      g.fillStyle = '#2c2d32';
      g.fillRect(0, 0, 1024, 512);
      // Stable grain, tire wear, repairs and worn paint.
      let seed = 173;
      const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 18000; i++) {
        g.fillStyle = i % 2 ? '#ffffff13' : '#00000028';
        g.fillRect(random() * 1024, random() * 512, 1 + random() * 4, 1 + random() * 3);
      }
      g.fillStyle = '#191b2055';
      for (const [px, py, w, h] of [[110, 360, 99, 39], [365, 190, 115, 53], [544, 161, 75, 83]]) g.fillRect(px, py, w, h);
      g.fillStyle = '#bda06a99';
      for (let i = 10; i < 890; i += 90) g.fillRect(i, 252, 47, 5);
      g.fillStyle = '#b3b6bc99';
      for (let i = 48; i < 465; i += 54) g.fillRect(884, i, 67, 23);
    });
    const asphalt = standard({ map: roadMap, emissive: 0x2b2b32, emissiveMap: roadMap, emissiveIntensity: 0.3, roughness: 0.46 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(75, 18).rotateX(-Math.PI / 2), asphalt);
    road.position.set(x + 4.5, 0.14, z + 41);
    parent.add(road);

    for (let i = 0; i < 16; i++) {
      const sx = x - 30 + i * 4;
      box(i % 3 ? stone : concrete, sx, 0.16, z + 30.1, 3.96, 0.32, 3.74);
      box(concrete, sx, 0.14, z + 31.97, 3.96, 0.28, 0.28);
    }
    for (const sx of [x - 21, x + 9, x + 25]) {
      box(metal, sx, 0.17, z + 32.6, 0.94, 0.05, 0.48);
      for (let i = 0; i < 6; i++) box(stone, sx - 0.35 + i * 0.14, 0.202, z + 32.6, 0.048, 0.01, 0.37);
    }

    addBoxes(parent);

    const streakMap = texture(256, 256, g => {
      g.translate(128, 128);
      for (let i = -18; i <= 18; i++) {
        const length = (1 - Math.abs(i) / 20) * (60 + (i * i * 43 % 53));
        const gradient = g.createLinearGradient(0, -length, 0, length);
        gradient.addColorStop(0, '#ffffff00');
        gradient.addColorStop(0.48, '#ffffffbb');
        gradient.addColorStop(1, '#ffffff00');
        g.fillStyle = gradient;
        g.fillRect(i * 5, -length, 3, length * 2);
      }
    });
    const puddle = standard({ color: 0x272a31, roughness: 0.22, metalness: 0.25 });
    for (const [dx, dz, w, d, tint] of [[18, 36, 4.7, 5.8, 0x65cbae], [-10, 37, 4.1, 5.1, 0xffa86e], [26, 44, 3.7, 4.2, 0x65cbae]]) {
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 17).rotateX(-Math.PI / 2), puddle);
      water.position.set(x + dx, 0.155, z + dz);
      water.scale.set(w / 2, 1, d / 2);
      parent.add(water);
      const reflectedLight = new THREE.MeshBasicMaterial({ map: streakMap, color: tint, transparent: true, opacity: 0.27, depthWrite: false, blending: THREE.AdditiveBlending });
      materials.push(reflectedLight);
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, d * 0.75).rotateX(-Math.PI / 2), reflectedLight);
      streak.position.set(x + dx, 0.16, z + dz);
      parent.add(streak);
    }
  }

  return { facade, pavement, dispose: () => {
    materials.forEach(material => material.dispose());
    textures.forEach(map => map.dispose());
  } };
}
