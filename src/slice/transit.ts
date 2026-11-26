import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const LINE = {
  west: -105,
  east: 129,
  z: 281.2,
  railY: 9.1,
  cabinY: 11.05,
};

function addBoxes(target: THREE.Group, material: THREE.Material, boxes: number[][]): void {
  const pieces = boxes.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const geometry = mergeGeometries(pieces);
  target.add(new THREE.Mesh(geometry, material));
  pieces.forEach(piece => piece.dispose());
}

function routeGraphics(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#152930';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#a9e5de';
  g.fillRect(0, 0, 7, 128);
  g.font = '700 59px sans-serif';
  g.fillText('AEROLINK', 30, 82);
  g.fillStyle = '#f7cda5';
  g.fillRect(402, 21, 86, 86);
  g.fillStyle = '#253238';
  g.font = '700 49px monospace';
  g.fillText('06', 416, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function spillGraphics(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const radial = g.createRadialGradient(64, 64, 2, 64, 64, 63);
  radial.addColorStop(0, '#ffefd1b3');
  radial.addColorStop(0.35, '#c5e5dc66');
  radial.addColorStop(0.72, '#8ebdab24');
  radial.addColorStop(1, '#a9ccc000');
  g.fillStyle = radial;
  g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createTransit() {
  const root = new THREE.Group();
  root.name = 'Aerolink 06';
  const material = (parameters: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(parameters);
  const concrete = material({ color: 0x474e55, roughness: 0.92 });
  const frame = material({ color: 0x38434a, roughness: 0.63, metalness: 0.34 });
  const rail = material({ color: 0x89979d, roughness: 0.38, metalness: 0.45 });
  const body = material({ color: 0x91b0aa, roughness: 0.39, metalness: 0.34 });
  const fascia = material({ color: 0x17282c, roughness: 0.32, metalness: 0.36 });
  const glass = material({ color: 0x314c4e, roughness: 0.22, metalness: 0.41 });
  const cabin = material({ color: 0x8e7957, emissive: 0xcf9c66, emissiveIntensity: 0.52, roughness: 0.34 });
  const running = material({ color: 0x96d2c7, emissive: 0x6bd9c5, emissiveIntensity: 0.7, roughness: 0.45 });
  const head = material({ color: 0xdbe6dc, emissive: 0xb4f2e8, emissiveIntensity: 1.15, roughness: 0.4 });
  const tail = material({ color: 0x8b4034, emissive: 0xc34932, emissiveIntensity: 0.8, roughness: 0.4 });
  const routeMap = routeGraphics();
  const route = material({ map: routeMap, emissiveMap: routeMap, emissive: 0x9ac6be, emissiveIntensity: 0.31, roughness: 0.56 });
  const start = LINE.west - 9;
  const end = LINE.east + 9;
  const midpoint = (start + end) / 2;
  const length = end - start;

  const supportLocations = [-112, -72, -33, 6, 49, 86, 133];
  const pillars: number[][] = [];
  const structure: number[][] = [[midpoint, LINE.railY - 0.57, LINE.z, length, 0.72, 1.42]];
  const posts: number[][] = [];
  for (const x of supportLocations) {
    pillars.push([x, 4.04, LINE.z - 1.44, 1.18, 8.08, 0.96]);
    pillars.push([x, 0.34, LINE.z - 1.44, 1.68, 0.68, 1.42]);
    structure.push([x, 8.03, LINE.z - 0.55, 1.5, 0.6, 3.38]);
    posts.push([x, 7.63, LINE.z - 0.97, 0.58, 0.18, 0.13]);
  }
  for (let x = start + 2; x < end; x += 3.6) {
    structure.push([x, LINE.railY - 0.19, LINE.z, 0.24, 0.23, 2.92]);
  }
  for (const z of [LINE.z - 1.15, LINE.z + 1.15]) {
    addBoxes(root, rail, [[midpoint, LINE.railY, z, length, 0.16, 0.25]]);
  }
  for (const x of [LINE.west, LINE.east]) {
    structure.push([x, LINE.railY + 3.38, LINE.z, 16, 0.24, 4.7]);
    for (const z of [LINE.z - 2.19, LINE.z + 2.19]) {
      structure.push([x, LINE.railY + 1.24, z, 16, 0.18, 0.18]);
      for (const offset of [-7.7, -2.6, 2.6, 7.7]) structure.push([x + offset, LINE.railY + 1.72, z, 0.18, 3.3, 0.2]);
    }
  }
  addBoxes(root, concrete, pillars);
  addBoxes(root, frame, structure);
  addBoxes(root, running, posts);

  const vehicle = new THREE.Group();
  vehicle.name = 'Aerolink shuttle';
  const section = new THREE.Shape();
  section.moveTo(-1.02, -1.18);
  section.lineTo(-1.36, -0.85);
  section.lineTo(-1.49, 0.45);
  section.quadraticCurveTo(-1.42, 1.08, -0.96, 1.23);
  section.lineTo(0.96, 1.23);
  section.quadraticCurveTo(1.42, 1.08, 1.49, 0.45);
  section.lineTo(1.36, -0.85);
  section.lineTo(1.02, -1.18);
  section.closePath();
  const hull = new THREE.ExtrudeGeometry(section, {
    depth: 13.8, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.1, bevelSegments: 3, curveSegments: 4,
  }).translate(0, 0, -6.9).rotateY(Math.PI / 2);
  vehicle.add(new THREE.Mesh(hull, body));
  addBoxes(vehicle, fascia, [[0, -1.1, 0, 13.2, 0.54, 2.29], [0, 0.28, 0, 13.89, 0.92, 3.17]]);
  addBoxes(vehicle, frame, [[0, 1.37, 0, 8.9, 0.1, 1.06], [0, 1.43, 0, 3.7, 0.12, 0.78]]);
  root.add(vehicle);

  const windows: number[][] = [];
  const darkWindows: number[][] = [];
  const joints: number[][] = [];
  for (const side of [-1, 1]) {
    const z = side * 1.59;
    for (const x of [-5.74, -4.14, -2.54, -0.94, 0.94, 2.54, 4.14, 5.74]) {
      const row = Math.abs(x) < 3 ? windows : darkWindows;
      row.push([x, 0.31, z, 1.36, 0.56, 0.04]);
      if (row === windows) joints.push([x + 0.41, 0.25, z + side * 0.03, 0.07, 0.44, 0.025]);
    }
    joints.push([0, -0.23, z, 0.063, 1.95, 0.032]);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 0.64), route);
    plate.position.set(-side * 4.45, -0.55, side * 1.49);
    if (side < 0) plate.rotation.y = Math.PI;
    vehicle.add(plate);
  }
  for (const end of [-1, 1]) darkWindows.push([end * 7.59, 0.34, 0, 0.05, 0.52, 1.63]);
  addBoxes(vehicle, cabin, windows);
  addBoxes(vehicle, glass, darkWindows);
  addBoxes(vehicle, fascia, joints);
  addBoxes(vehicle, running, [[0, -1.31, 1.05, 11.4, 0.06, 0.09], [0, -1.31, -1.05, 11.4, 0.06, 0.09]]);

  const lights = new THREE.Group();
  addBoxes(lights, head, [[7.58, -0.42, -0.92, 0.09, 0.11, 0.41], [7.58, -0.42, 0.92, 0.09, 0.11, 0.41]]);
  addBoxes(lights, tail, [[-7.58, -0.42, -0.92, 0.09, 0.11, 0.41], [-7.58, -0.42, 0.92, 0.09, 0.11, 0.41]]);
  vehicle.add(lights);
  const wash = new THREE.SpotLight(0xd5fff2, 150, 18, 0.92, 0.88);
  vehicle.add(wash);
  root.add(wash.target);
  wash.position.set(0, -1.15, 1.07);

  const spillMap = spillGraphics();
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(19, 10).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: spillMap, transparent: true, opacity: 0.29, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  root.add(spill);

  function update(time: number): void {
    const phase = time * 0.17;
    const x = midpoint + (LINE.east - LINE.west) / 2 * Math.sin(phase);
    const direction = Math.cos(phase) >= 0 ? 1 : -1;
    vehicle.position.set(x, LINE.cabinY, LINE.z);
    lights.rotation.y = direction > 0 ? 0 : Math.PI;
    wash.target.position.set(x + direction * 2.6, 0.1, LINE.z + 4.4);
    spill.position.set(x + direction * 2.1, 0.19, LINE.z + 3.8);
  }
  update(0);

  return {
    root,
    update,
    colliders: supportLocations.map(x => ({
      minX: x - 0.84, maxX: x + 0.84, minZ: LINE.z - 2.15, maxZ: LINE.z - 0.73,
    })),
    dispose: () => {
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
      });
      [concrete, frame, rail, body, fascia, glass, cabin, running, head, tail, route, spill.material].forEach(surface => surface.dispose());
      routeMap.dispose();
      spillMap.dispose();
      wash.dispose();
    },
  };
}
