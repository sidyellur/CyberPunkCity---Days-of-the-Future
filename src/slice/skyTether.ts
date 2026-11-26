import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = [number, number, number];

const TERMINAL_HEIGHT = 246;
const TETHER_HEIGHT = 2360;

export function createSkyTether() {
  const root = new THREE.Group();
  root.name = 'Orbital Tether Terminal';
  root.position.set(-90, 0, -425);

  const materials: THREE.Material[] = [];
  const standard = (parameters: THREE.MeshStandardMaterialParameters) => {
    const material = new THREE.MeshStandardMaterial(parameters);
    materials.push(material);
    return material;
  };
  const shell = standard({ color: 0x53616b, roughness: 0.68, metalness: 0.38 });
  const rib = standard({ color: 0x283744, roughness: 0.79, metalness: 0.26 });
  const conduit = standard({ color: 0x66777b, emissive: 0x6c8a90, emissiveIntensity: 0.5, roughness: 0.62 });
  const service = standard({ color: 0xcca779, emissive: 0xe2a367, emissiveIntensity: 1.15, roughness: 0.52 });
  const glass = standard({ color: 0x375b67, emissive: 0x90c6cd, emissiveIntensity: 0.68, roughness: 0.42 });
  const carbon = new THREE.MeshBasicMaterial({ color: 0x78878c });
  materials.push(carbon);

  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function piece(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const batch = batches.get(material) ?? [];
    batch.push(geometry);
    batches.set(material, batch);
  }

  function bar(material: THREE.Material, start: Point, end: Point, bottom: number, top: number, sides = 4): void {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const axis = b.clone().sub(a);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    const geometry = new THREE.CylinderGeometry(top, bottom, axis.length(), sides);
    if (sides === 4) geometry.rotateY(Math.PI / 4);
    geometry.applyQuaternion(turn).translate(...a.lerp(b, 0.5).toArray());
    piece(material, geometry);
  }

  function ring(material: THREE.Material, y: number, radius: number, tube: number): void {
    piece(material, new THREE.TorusGeometry(radius, tube, 5, 18).rotateX(Math.PI / 2).translate(0, y, 0));
  }

  function mergeInto(parent: THREE.Group): void {
    for (const [material, pieces] of batches) {
      parent.add(new THREE.Mesh(mergeGeometries(pieces), material));
      pieces.forEach(geometry => geometry.dispose());
    }
    batches.clear();
  }

  // The launch terminal hangs where the four tension towers converge.
  const terminal = [TERMINAL_HEIGHT - 20, TERMINAL_HEIGHT, TERMINAL_HEIGHT + 8];
  bar(rib, [0, terminal[0], 0], [0, terminal[1], 0], 16, 30, 12);
  bar(shell, [0, terminal[1], 0], [0, terminal[2], 0], 30, 24, 12);
  ring(glass, terminal[1] - 3, 26.7, 1.2);
  ring(rib, terminal[2], 22, 2);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const outer: Point = [x * 33, 14, z * 33];
      const knee: Point = [x * 21, 119, z * 21];
      const top: Point = [x * 9, TERMINAL_HEIGHT + 21, z * 9];
      bar(rib, [outer[0], 0, outer[2]], outer, 13, 9, 8);
      bar(shell, outer, knee, 8.5, 5.8);
      bar(conduit, knee, top, 5.7, 2.6);
      bar(rib, [x * 25, 75, z * 25], [-x * 12, 147, z * 15], 3.2, 2.1);
      bar(rib, [x * 19, 136, z * 19], [x * 11, 205, -z * 11], 2.8, 1.7);
      bar(service, [x * 19, terminal[2], z * 12], [x * 19, terminal[2] + 4, z * 12], 0.95, 0.65, 6);
    }
  }

  // The wide, parallel base lines gather into a narrower tether above the terminal.
  bar(rib, [0, terminal[2], 0], [0, 328, 0], 8, 2.4, 10);
  for (const offset of [-1, 1]) {
    bar(conduit, [offset * 8, terminal[2], 0], [offset * 2, 395, 0], 1.85, 1.1, 8);
  }
  bar(carbon, [0, 318, 0], [0, TETHER_HEIGHT, 0], 2.2, 1.06, 6);

  for (const [height, size] of [[380, 10.5], [596, 8.2], [936, 6.2], [1455, 4.4]]) {
    bar(rib, [0, height - size * 1.9, 0], [0, height - size * 0.3, 0], 2.5, size, 8);
    bar(shell, [0, height - size * 0.3, 0], [0, height + size * 0.6, 0], size, size * 0.78, 8);
    bar(rib, [0, height + size * 0.6, 0], [0, height + size * 1.7, 0], size * 0.78, 2.2, 8);
    ring(glass, height, size * 0.91, Math.max(0.65, size * 0.095));
    if (height < 1000) ring(service, height - size * 0.65, size * 0.73, 0.64);
  }
  mergeInto(root);

  const climber = new THREE.Group();
  climber.name = 'Orbital cargo climber';
  bar(shell, [0, -11, 0], [0, -6, 0], 3.8, 6.2, 8);
  bar(rib, [0, -6, 0], [0, 6, 0], 6.2, 6.2, 8);
  bar(shell, [0, 6, 0], [0, 12.5, 0], 6.2, 3.7, 8);
  ring(service, -4.2, 6.1, 1.05);
  ring(glass, 4.3, 6, 0.82);
  mergeInto(climber);
  root.add(climber);

  function update(seconds: number): void {
    // Ease at the terminal and upper turnaround before reversing.
    const cycle = (seconds + 9) % 126;
    const progress = 0.5 - 0.5 * Math.cos(cycle / 126 * Math.PI * 2);
    climber.position.y = 365 + progress * 1630;
  }
  update(0);

  return {
    root,
    update,
    dispose() {
      root.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach(material => material.dispose());
    },
  };
}
