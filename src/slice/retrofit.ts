import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BOTTOM = 2.65;
const TRANSFER = 13.9;
const TOP = 27.25;
const CYCLE = 26;

export function createRetrofit() {
  const root = new THREE.Group();
  root.name = 'Habitat Exchange freight lift';
  root.position.set(-7.5, 0, 274.1);
  const cabin = new THREE.Group();
  cabin.name = 'Freight carrier';
  root.add(cabin);

  const materials: THREE.Material[] = [];
  const standard = (params: THREE.MeshStandardMaterialParameters) => {
    const material = new THREE.MeshStandardMaterial(params);
    materials.push(material);
    return material;
  };
  const steel = standard({ color: 0x4d565b, metalness: 0.65, roughness: 0.48 });
  const dark = standard({ color: 0x22282b, metalness: 0.32, roughness: 0.78 });
  const insulation = standard({ color: 0x75756b, roughness: 0.92 });
  const ceramic = standard({ color: 0xd6cfb7, metalness: 0.24, roughness: 0.64 });
  const hazard = standard({ color: 0xa06f2c, roughness: 0.7 });
  const railLight = standard({ color: 0xd4a873, emissive: 0xffaa54, emissiveIntensity: 1.3, roughness: 0.56 });
  const cabinLight = standard({ color: 0xe5ba7b, emissive: 0xffb24e, emissiveIntensity: 1.65, roughness: 0.49 });

  const batched = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): void {
    const mesh = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const pieces = batched.get(material);
    if (pieces) pieces.push(mesh);
    else batched.set(material, [mesh]);
  }

  function addMeshes(group: THREE.Group): void {
    batched.forEach((pieces, material) => {
      group.add(new THREE.Mesh(mergeGeometries(pieces), material));
      pieces.forEach(piece => piece.dispose());
    });
    batched.clear();
  }

  // The new rail assembly hangs clear of the old façade.
  box(dark, 0, 15.55, 0.32, 5.7, 29.2, 0.44);
  for (const side of [-1, 1]) {
    const railX = side * 2.76;
    box(steel, railX, 15.5, 1.16, 0.36, 29.6, 0.48);
    box(dark, railX, 15.5, 1.42, 0.18, 29.6, 0.11);
    for (let level = 0; level < 8; level++) {
      const y = 1.5 + level * 4;
      box(insulation, railX, y, 0.23, 0.98, 0.71, 0.27);
      box(steel, railX, y, 0.69, 0.55, 0.22, 1.08);
      box(railLight, railX, y + 0.52, 1.43, 0.12, 0.28, 0.06);
    }
  }
  for (const [i, level] of [BOTTOM, TRANSFER, TOP].entries()) {
    const y = level - 1.43;
    box(steel, 0, y, 1.02, 5.55, 0.28, 1.7);
    box(hazard, 0, y + 0.04, 1.91, 4.76, 0.15, 0.14);
    for (const side of [-1, 1]) {
      box(ceramic, side * 2.15, y + 1.2, 0.77, 0.34, 2.23, 0.38);
      box(railLight, side * 2.15, y + 2.15, 1.01, 0.14, 0.22, 0.08);
    }
    // Retracted transfer shutter, with visibly different floor markings.
    box(steel, 0, y + 1.15, 0.66, 3.88, 2.24, 0.13);
    for (let slat = 0; slat < 5; slat++) box(dark, 0, y + 0.42 + slat * 0.36, 0.74, 3.75, 0.046, 0.05);
    for (let bar = 0; bar <= i; bar++) box(hazard, -1.5 + bar * 0.25, y + 1.83, 0.78, 0.12, 0.24, 0.05);
  }
  box(dark, 0, 30.9, 1.0, 6.18, 0.83, 2.23);
  box(ceramic, 0, 31.45, 0.99, 5.54, 0.31, 1.91);
  box(railLight, 0, 31.18, 2.1, 1.36, 0.09, 0.07);
  addMeshes(root);

  // Service platform, drive bogies, and strapped cargo canisters.
  box(dark, 0, -1.12, 2.0, 5.1, 0.46, 2.38);
  box(ceramic, 0, -0.87, 2.2, 4.87, 0.16, 1.93);
  box(hazard, 0, -0.99, 3.21, 4.66, 0.14, 0.11);
  box(cabinLight, 0, -1.3, 3.22, 3.65, 0.075, 0.065);
  for (const side of [-1, 1]) {
    box(steel, side * 2.36, 0.01, 2.13, 0.3, 2.18, 1.95);
    box(dark, side * 2.57, 0, 1.42, 0.43, 1.59, 0.67);
    box(ceramic, side * 2.35, 0.03, 3.1, 0.27, 2.04, 0.23);
    box(cabinLight, side * 2.35, 0.63, 3.25, 0.14, 0.24, 0.07);
  }
  box(steel, 0, 1.13, 2.15, 4.9, 0.23, 1.94);
  box(ceramic, 0, 1.27, 2.15, 4.8, 0.11, 1.83);
  box(dark, 0, 0.22, 1.43, 4.46, 1.95, 0.15);
  for (let crate = 0; crate < 3; crate++) {
    const x = (crate - 1) * 1.28;
    const height = crate === 1 ? 1.44 : 1.1;
    box(crate === 1 ? insulation : ceramic, x, -0.76 + height / 2, 2.2, 1.11, height, 1.1);
    box(dark, x + 0.28, -0.76 + height / 2, 2.77, 0.105, height, 0.065);
    box(hazard, x - 0.22, -0.57 + height / 2, 2.76, 0.23, 0.13, 0.055);
  }
  for (const y of [-0.61, 0.67]) box(steel, 0, y, 3.05, 4.55, 0.08, 0.08);
  addMeshes(cabin);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const label = canvas.getContext('2d')!;
  label.fillStyle = '#17191b';
  label.fillRect(0, 0, 512, 128);
  label.fillStyle = '#d7a358';
  label.fillRect(0, 0, 9, 128);
  label.font = 'bold 39px monospace';
  label.fillText('FREIGHT 04', 34, 59);
  label.fillStyle = '#e3cfad';
  label.font = '23px monospace';
  label.fillText('HABITAT EXCHANGE', 36, 102);
  const graphic = new THREE.CanvasTexture(canvas);
  graphic.colorSpace = THREE.SRGBColorSpace;
  graphic.anisotropy = 8;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(5.15, 1.29),
    standard({ map: graphic, emissive: 0xffd39d, emissiveMap: graphic, emissiveIntensity: 0.72, roughness: 0.86 }),
  );
  panel.position.set(0, 5.9, 1.03);
  root.add(panel);

  function ease(from: number, to: number, value: number): number {
    const t = Math.max(0, Math.min(1, value));
    return THREE.MathUtils.lerp(from, to, t * t * (3 - 2 * t));
  }

  function update(time: number): void {
    // Begin between floors so the carriage and the entrance are both visible in a still view.
    const tick = (time + 5.6) % CYCLE;
    const y = tick < 8 ? ease(BOTTOM, TRANSFER, (tick - 2) / 6)
      : tick < 16 ? ease(TRANSFER, TOP, (tick - 10) / 6)
      : ease(TOP, BOTTOM, (tick - 18) / 7);
    cabin.position.y = y;
    cabinLight.emissiveIntensity = 1.42 + 0.17 * Math.sin(tick * Math.PI * 4);
  }

  update(0);
  return {
    root,
    update,
    dispose: () => {
      root.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach(material => material.dispose());
      graphic.dispose();
    },
  };
}
