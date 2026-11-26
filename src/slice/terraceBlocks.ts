import { clad } from './cladding';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Two independent lift cores serve interlocking stacks of maisonettes. The
// narrower upper floors leave most of the roof below available as a garden.
export function createTerraceBlock(seed: number, height: number) {
  const root = new THREE.Group();
  root.name = 'Terraced courtyard housing';

  let state = seed >>> 0;
  function random(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  }
  const shell = clad(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.1 }));
  const glazing = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>([[shell, []], [glazing, []]]);
  const box = new THREE.BoxGeometry();
  // The clipped corners expose the terrace levels when viewed end-on.
  const plan = new THREE.Shape();
  plan.moveTo(-0.5, -0.32);
  plan.lineTo(-0.4, -0.5);
  plan.lineTo(0.38, -0.5);
  plan.lineTo(0.5, -0.36);
  plan.lineTo(0.5, 0.31);
  plan.lineTo(0.37, 0.5);
  plan.lineTo(-0.38, 0.5);
  plan.lineTo(-0.5, 0.33);
  plan.closePath();
  const slab = new THREE.ExtrudeGeometry(plan, { depth: 1, bevelEnabled: false })
    .rotateX(-Math.PI / 2).translate(0, -0.5, 0);
  const bush = new THREE.IcosahedronGeometry(1, 0);
  const pane = new THREE.PlaneGeometry();
  const windowFront = pane.toNonIndexed();
  const windowEnd = windowFront.clone().rotateY(Math.PI / 2);
  pane.dispose();
  const unit = box.toNonIndexed();
  box.dispose();

  function place(material: THREE.Material, geometry: THREE.BufferGeometry, tint: number,
    x: number, y: number, z: number, width: number, h: number, depth: number): void {
    const part = geometry.clone();
    part.deleteAttribute('uv');
    part.scale(width, h, depth).translate(x, y, z);
    const color = new THREE.Color(tint);
    const count = part.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    batches.get(material)!.push(part);
  }

  const walls = [0x7e807b, 0x92918a, 0x767e7c, 0x9b9383, 0x858880];
  const leaves = [0x38594c, 0x4b6456, 0x536a51];
  const night = [0x37454b, 0x222c33, 0x495457];
  const occupied = [0xe9bb8f, 0xa7c4bd, 0xd8af7b, 0xad9d88];
  const pick = (palette: number[]) => palette[Math.floor(random() * palette.length)];
  const cap = pick(walls);
  const mainLevels = Math.max(4, Math.round((height - 6) / 11));
  const pitch = (height - 6) / mainLevels;
  const steppedSide = random() < 0.5 ? -1 : 1;

  for (const side of [-1, 1]) {
    const levels = side === steppedSide ? mainLevels : Math.max(3, mainLevels - 2);
    const xCore = side * 9;
    const zCore = side * 6;
    const base = side === steppedSide ? 5.5 : 5.5 + pitch * 0.45;
    const coreTop = side === steppedSide ? height : base + (levels - 0.2) * pitch;
    place(shell, slab, 0x4d575a, xCore, coreTop / 2, zCore, 7.7, coreTop, 9.2);
    place(shell, slab, 0x646d70, xCore, 2, zCore, 12, 4, 14);
    for (let i = 0; i < levels; i++) {
      const t = i / (levels - 1);
      const floor = base + pitch * i;
      const terraceWidth = 26 + (1 - t) * 6 - t * t * 7;
      const terraceDepth = 20 + (1 - t) * 9;
      const x = xCore + side * (2.4 + 0.8 * (i % 2));
      const z = zCore + side * (8.1 - 13 * t + (i % 2) * 1.4);
      const bodyH = Math.min(7.0, pitch * 0.65);
      const bodyW = terraceWidth - 4.8;
      const bodyD = terraceDepth - 8;
      const bodyZ = z - side * 1.1;
      place(shell, slab, cap, x, floor, z, terraceWidth, 1.25, terraceDepth);
      place(shell, slab, pick(walls), x, floor + bodyH / 2 + 0.6, bodyZ, bodyW, bodyH, bodyD);
      place(shell, slab, 0x9b9b8c, x, floor + bodyH + 0.74, bodyZ, bodyW + 1.9, 0.42, bodyD + 2.3);

      for (const face of [-1, 1]) {
        const faceZ = bodyZ + face * (bodyD * 0.5 + 0.065);
        const bays = Math.floor((bodyW * 0.72) / 3.3);
        const bayW = bodyW * 0.72 / bays;
        for (let bay = 0; bay < bays; bay++) {
          const bx = x + (bay + 0.5 - bays / 2) * bayW;
          for (let story = 0; story < 2; story++) {
            const light = random() < 0.31;
            place(glazing, windowFront, pick(light ? occupied : night), bx, floor + 2.15 + story * bodyH / 2,
              faceZ, bayW - 0.47, bodyH * 0.32, 0.14);
          }
        }
      }
      // End glazing makes the occupied rooms visible from cross streets too.
      const endX = x + side * (bodyW / 2 + 0.055);
      for (let bay = -1; bay <= 1; bay++) {
        place(glazing, windowEnd, pick(random() < 0.42 ? occupied : night), endX, floor + 3.5,
          bodyZ + bay * bodyD * 0.19, 0.16, 3.4, bodyD * 0.14);
      }
      // The slab extends beyond the apartments to form an accessible balcony.
      const railZ = z + side * (terraceDepth / 2 - 0.45);
      const railWidth = terraceWidth * 0.72;
      place(shell, unit, 0x546565, x, floor + 1.85, railZ, railWidth, 0.22, 0.26);
      for (let post = 0; post <= 4; post++) {
        place(shell, unit, 0x4c5959, x + (post / 4 - 0.5) * railWidth, floor + 1.14, railZ, 0.2, 1.4, 0.2);
      }
      const gardenZ = z + side * (terraceDepth / 2 - 2.3);
      const gardenX = x + (i % 2 ? 1 : -1) * terraceWidth * 0.17;
      place(shell, unit, 0x555e59, gardenX, floor + 1, gardenZ, terraceWidth * 0.46, 1, 2.3);
      for (let tree = -1; tree <= 1; tree++) {
        const size = 1.1 + random() * 0.9;
        place(shell, bush, pick(leaves), gardenX + tree * 3.3, floor + 1.8, gardenZ, size, size * 1.35, size);
      }
    }
  }
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    root.add(mesh);
    parts.forEach(part => part.dispose());
  }
  windowFront.dispose();
  windowEnd.dispose();
  unit.dispose();
  bush.dispose();
  slab.dispose();

  return {
    root,
    dispose() {
      root.children.forEach(child => (child as THREE.Mesh).geometry.dispose());
      shell.dispose();
      glazing.dispose();
    },
  };
}
