import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A panoramic observation bay inside the Quay shuttle. Local -Z faces the city. */
export function createQuayCabin() {
  const root = new THREE.Group();
  root.name = 'Quay Line observation bay';
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const surface = (color: number, roughness: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const frame = surface(0x253a41, 0.51, 0.48);
  const reveal = surface(0x56676a, 0.45, 0.4);
  const upholstery = surface(0x1b4546, 0.91);
  const sill = surface(0x68513b, 0.58);
  const ivory = new THREE.MeshBasicMaterial({ color: 0xb6d6cf });
  const amber = new THREE.MeshBasicMaterial({ color: 0xf7bc76 });
  function add(m: THREE.Material, geometry: THREE.BufferGeometry) {
    const batch = batches.get(m) ?? [];
    batch.push(geometry);
    batches.set(m, batch);
  }
  function box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
    add(m, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  }
  // The roof rolls into the windscreen, leaving an uninterrupted view up to the towers.
  for (const x of [-5.8, -2.06, 2.06, 5.8]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -1.17, -1.48), new THREE.Vector3(x, 0.57, -1.51),
      new THREE.Vector3(x, 1.08, -1.28), new THREE.Vector3(x, 1.29, -0.64),
      new THREE.Vector3(x, 1.29, 1.36),
    ]);
    add(frame, new THREE.TubeGeometry(path, 20, 0.047, 8, false));
    for (const y of [-0.49, 0.52]) box(reveal, 0.113, 0.15, 0.07, x, y, -1.47);
  }
  box(frame, 12, 0.62, 0.16, 0, -0.96, -1.46);
  box(sill, 12, 0.058, 0.23, 0, -0.65, -1.40);
  box(amber, 12, 0.012, 0.023, 0, -0.689, -1.315);
  box(frame, 12, 0.1, 1.2, 0, 1.32, 0.79);
  box(ivory, 12, 0.015, 0.028, 0, 1.258, 0.24);
  box(frame, 12, 0.08, 2.9, 0, -1.2, 0);
  for (const x of [-3.7, 3.7]) {
    box(frame, 2.1, 0.38, 0.65, x, -0.96, -0.97);
    box(upholstery, 2.22, 0.12, 0.73, x, -0.7, -0.94);
    box(upholstery, 2.22, 0.28, 0.09, x, -0.48, -1.23);
  }
  // Ceramic frit along the bottom edge of the glass catches the interior light.
  for (let i = 0; i < 100; i++) {
    const x = (i - 49.5) * 0.12;
    box(reveal, 0.026, 0.016, 0.006, x, -0.55, -1.48);
  }
  for (const [m, pieces] of batches) {
    root.add(new THREE.Mesh(mergeGeometries(pieces), m));
    pieces.forEach(g => g.dispose());
  }
  return root;
}
