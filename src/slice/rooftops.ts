import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Roof } from './city';

const STEEL = 0x687982;
const ZINC = 0x9b9f9b;
const DECK = 0x333c42;
const PIPE = 0x49585a;
const AQUA = 0x6db6ac;
const AMBER = 0xc8a76e;

type Equipment = 'greenhouse' | 'collectors' | 'cisterns' | 'cooling';

export function createRooftops() {
  const fixtures = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.64, metalness: 0.22 });
  const indicators = new THREE.MeshBasicMaterial({ vertexColors: true });
  const colors = new Map<number, THREE.Color>();

  function attach(parent: THREE.Group, roof: Roof, seed: number): void {
    if (Math.min(roof.w, roof.d) < 9) return;

    // A stable roof-specific sample keeps infrastructure in the same place during construction.
    const hash = Math.imul(Math.floor(roof.x * 32), 19538717) ^
      Math.imul(Math.floor(roof.z * 32), 46290317) ^ Math.imul(seed, 12582917);
    const select = ((hash ^ (hash >>> 16)) >>> 0) % 100;
    if (select >= (roof.profile === 'market' ? 49 : 34)) return;

    const types: Record<Roof['profile'], readonly Equipment[]> = {
      market: ['greenhouse', 'collectors', 'cisterns'],
      transit: ['collectors', 'cooling', 'collectors'],
      industrial: ['cooling', 'cisterns', 'cooling'],
      residential: ['greenhouse', 'cisterns', 'collectors'],
    };
    const equipment = types[roof.profile][(hash >>> 5) % 3];
    const structure: THREE.BufferGeometry[] = [];
    const lights: THREE.BufferGeometry[] = [];
    function add(geometry: THREE.BufferGeometry, colorHex: number, x: number, y: number, z: number, lit: boolean): void {
      let color = colors.get(colorHex);
      if (!color) {
        color = new THREE.Color(colorHex);
        colors.set(colorHex, color);
      }
      const count = geometry.attributes.position.count;
      const values = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { values[i * 3] = color.r; values[i * 3 + 1] = color.g; values[i * 3 + 2] = color.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
      geometry.translate(x, y, z);
      (lit ? lights : structure).push(geometry);
    }
    function box(color: number, x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0, lit = false): void {
      add(new THREE.BoxGeometry(w, h, d).rotateX(tilt), color, x, y, z, lit);
    }
    function drum(color: number, x: number, y: number, z: number, radius: number, height: number): void {
      add(new THREE.CylinderGeometry(radius, radius, height, 10), color, x, y, z, false);
    }

    box(DECK, 0, 0.18, 0, 10.6, 0.36, 8.65);
    for (const z of [-3.98, 3.98]) box(PIPE, 0, 0.43, z, 10.24, 0.16, 0.12);

    switch (equipment) {
      case 'greenhouse': {
        // Long glass bays sit on a modular raised food-production deck.
        for (const x of [-2.5, 2.5]) {
          box(PIPE, x, 0.58, 0, 4.58, 0.5, 7.36);
          box(0x3b6963, x, 1.44, 0, 4.38, 1.46, 7.02);
          for (const side of [-1, 1]) {
            box(0x508279, x, 2.63, side * 1.75, 4.42, 0.12, 3.64, side * 0.27);
            box(AQUA, x, 1.36, side * 3.53, 4.19, 0.08, 0.065, 0, true);
          }
          box(ZINC, x, 3.13, 0, 4.55, 0.13, 0.12);
          for (const rib of [-2.13, 0, 2.13]) {
            for (const side of [-1, 1]) {
              box(STEEL, x + rib, 1.5, side * 3.56, 0.095, 1.58, 0.11);
              box(STEEL, x + rib, 2.7, side * 1.75, 0.1, 0.12, 3.73, side * 0.27);
            }
          }
        }
        break;
      }
      case 'collectors': {
        for (const z of [-2, 1.65]) {
          box(STEEL, 0, 0.57, z, 9.53, 0.3, 0.36);
          for (const x of [-3.2, 0, 3.2]) {
            box(PIPE, x, 0.92, z - 0.35, 0.18, 1.05, 0.26);
            box(ZINC, x, 1.46, z, 2.99, 0.17, 2.71, -0.22);
            box(x === 0 ? 0x425a76 : 0x364d67, x, 1.55, z, 2.84, 0.035, 2.56, -0.22);
            for (const cell of [-0.7, 0, 0.7]) box(0x657b8a, x + cell, 1.57, z, 0.033, 0.02, 2.54, -0.22);
          }
        }
        box(ZINC, 4.15, 0.89, 3.15, 1.13, 1.07, 0.66);
        box(AQUA, 3.98, 1.12, 3.51, 0.17, 0.07, 0.04, 0, true);
        break;
      }
      case 'cisterns': {
        for (const x of [-2.45, 2.45]) {
          drum(PIPE, x, 0.61, -0.52, 1.98, 0.5);
          drum(x > 0 ? 0x869490 : 0x677f82, x, 1.93, -0.52, 1.78, 2.45);
          drum(ZINC, x, 3.15, -0.52, 1.81, 0.25);
          drum(STEEL, x, 1.1, -0.52, 1.82, 0.18);
          drum(STEEL, x, 2.62, -0.52, 1.82, 0.16);
          drum(PIPE, x, 3.45, -0.52, 0.39, 0.4);
          drum(PIPE, x, 1.04, 2.6, 0.18, 1.42);
          box(PIPE, x, 1.74, 1.92, 0.36, 0.36, 1.63);
        }
        box(STEEL, 0, 0.65, 2.61, 5.75, 0.36, 0.37);
        box(PIPE, 0, 1.06, 2.62, 1.1, 1.4, 0.68);
        box(AMBER, 0, 1.35, 2.98, 0.24, 0.08, 0.045, 0, true);
        break;
      }
      case 'cooling': {
        for (const x of [-2.5, 2.5]) {
          box(PIPE, x, 0.65, 0, 4.26, 0.59, 6.7);
          box(STEEL, x, 1.75, 0, 4.18, 1.8, 6.56);
          for (let i = 0; i < 6; i++) box(DECK, x, 1.08 + 0.22 * i, 3.3, 3.85, 0.1, 0.12);
          for (const z of [-1.61, 1.61]) {
            drum(PIPE, x, 2.68, z, 1.37, 0.23);
            drum(DECK, x, 2.8, z, 1.17, 0.1);
            for (const blade of [-0.64, -0.32, 0, 0.32, 0.64]) box(STEEL, x + blade, 2.87, z, 0.11, 0.06, 1.77);
          }
          box(AMBER, x + 1.74, 2.51, 3.32, 0.21, 0.09, 0.06, 0, true);
        }
        break;
      }
    }

    // The roof centre stays open for the core building's aerial.
    const deck = new THREE.Group();
    const side = (hash & 1) === 0 ? -1 : 1;
    deck.position.set(roof.x + side * roof.w * 0.22, roof.y + 0.08, roof.z + roof.d * 0.12);
    deck.scale.setScalar(Math.min(1.6, Math.min(roof.w, roof.d) / 23));
    for (const [pieces, material] of [[structure, fixtures], [lights, indicators]] as const) {
      deck.add(new THREE.Mesh(mergeGeometries(pieces), material));
      pieces.forEach(piece => piece.dispose());
    }
    parent.add(deck);
  }

  return {
    attach,
    // The attached geometry is owned by the district.
    dispose() { fixtures.dispose(); indicators.dispose(); },
  };
}
