import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
type Section = [y: number, radius: number, width: number, depth: number, twist: number];
type Contour = readonly (readonly [tangent: number, radial: number])[];
const RIB: Contour = [[-0.47, -0.26], [-0.22, -0.53], [0.21, -0.53], [0.46, -0.27],
  [0.42, 0.24], [0.22, 0.51], [-0.26, 0.51], [-0.52, 0.24]];
const PANEL: Contour = [[-0.29, 0.34], [0.29, 0.34], [0.22, 0.59], [-0.24, 0.59]];
const SEAM: Contour = [[-0.41, 0.37], [-0.32, 0.37], [-0.32, 0.55], [-0.43, 0.55]];
const FRAMES: Section[] = [
  [0, 18.2, 12.3, 9.3, 0], [22, 19.7, 10.4, 9.2, 0.014],
  [82, 17.5, 7.5, 7.6, -0.06], [147, 22.6, 8.5, 7.5, -0.11],
  [224, 23.1, 7.9, 7.0, -0.045], [301, 21.1, 7.2, 6.7, 0.035],
  [372, 18, 6.4, 5.9, 0.09], [422, 14.6, 5.7, 5.2, 0.15],
  [474, 9.3, 3.5, 3.4, 0.20], [491, 11.6, 2.1, 2.2, 0.23],
];

function frameAt(y: number): Section {
  const next = FRAMES.findIndex(([height], index) => index > 0 && height >= y);
  if (next === -1) return FRAMES[FRAMES.length - 1];
  const a = FRAMES[next - 1], b = FRAMES[next];
  const fraction = (y - a[0]) / (b[0] - a[0]);
  const t = fraction * fraction * (3 - 2 * fraction);
  return [y, THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t),
    THREE.MathUtils.lerp(a[3], b[3], t), THREE.MathUtils.lerp(a[4], b[4], t)];
}

export function createNexus() {
  const root = new THREE.Group();
  root.name = 'Nexus Spire structural tripod';
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const survey: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const standard = (parameters: THREE.MeshStandardMaterialParameters) => {
    const material = new THREE.MeshStandardMaterial(parameters);
    materials.push(material);
    return material;
  };
  const graphite = standard({ color: 0x48545c, emissive: 0x334048, emissiveIntensity: 0.25, metalness: 0.50, roughness: 0.52 });
  const ceramic = standard({ color: 0xd1c8ae, emissive: 0xb3a593, emissiveIntensity: 0.25, metalness: 0.12, roughness: 0.59 });
  const bone = standard({ color: 0xaba79e, emissive: 0x8c8274, emissiveIntensity: 0.30, metalness: 0.28, roughness: 0.52 });
  const steel = standard({ color: 0x737c81, emissive: 0x4c6068, emissiveIntensity: 0.26, metalness: 0.62, roughness: 0.48 });
  const shadow = standard({ color: 0x252b2c, emissive: 0x212627, emissiveIntensity: 0.14, metalness: 0.55, roughness: 0.79 });
  const brass = standard({ color: 0xad8a5d, emissive: 0x664526, emissiveIntensity: 0.39, metalness: 0.48, roughness: 0.54 });
  const navigation = standard({ color: 0x79b4c4, emissive: 0x5eacc2, emissiveIntensity: 1.05, roughness: 0.56 });
  const amber = standard({ color: 0xe2b47e, emissive: 0xfac086, emissiveIntensity: 1.08, metalness: 0.10, roughness: 0.43 });
  const beacon = standard({ color: 0xe9bd83, emissive: 0xffa866, emissiveIntensity: 1.7, roughness: 0.5 });

  function add(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const pieces = batches.get(material);
    if (pieces) pieces.push(geometry);
    else batches.set(material, [geometry]);
  }
  function box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, angle = 0): void {
    add(material, new THREE.BoxGeometry(w, h, d).rotateY(angle).translate(x, y, z));
  }
  function bar(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, from: number, to = from): void {
    const delta = b.clone().sub(a), middle = a.clone().add(b).multiplyScalar(0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    add(material, new THREE.CylinderGeometry(to, from, delta.length(), 7).applyQuaternion(rotation).translate(middle.x, middle.y, middle.z));
  }
  function cowl(material: THREE.Material, height: number, y: number, lower: number, upper = lower, sides = 24): void {
    add(material, new THREE.CylinderGeometry(upper, lower, height, sides).translate(0, y, 0));
  }
  function ring(material: THREE.Material, y: number, outer: number, inner: number, height: number): void {
    const panels = 24;
    const border = new THREE.CylinderGeometry(outer, outer, height, panels, 1, true).translate(0, y, 0);
    const lining = new THREE.CylinderGeometry(inner, inner, height, panels, 1, true).translate(0, y, 0);
    const winding = lining.index!;
    for (let i = 0; i < winding.count; i += 3) {
      const previous = winding.getX(i + 1);
      winding.setX(i + 1, winding.getX(i + 2));
      winding.setX(i + 2, previous);
    }
    const normals = lining.attributes.normal;
    for (let i = 0; i < normals.count; i++) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
    const top = new THREE.RingGeometry(inner, outer, panels).rotateX(-Math.PI / 2).translate(0, y + height / 2, 0);
    const base = new THREE.RingGeometry(inner, outer, panels).rotateX(Math.PI / 2).translate(0, y - height / 2, 0);
    for (const geometry of [border, lining, top, base]) add(material, geometry);
  }

  function blade(index: number, start: number, end: number, contour: Contour, samples: number): THREE.BufferGeometry {
    const positions: number[] = [], indices: number[] = [], uv: number[] = [];
    const corners = contour.length;
    for (let row = 0; row <= samples; row++) {
      const fraction = row / samples;
      const [y, radius, width, depth, twist] = frameAt(THREE.MathUtils.lerp(start, end, fraction));
      const yaw = 0.21 + index * TAU / 3 + twist;
      const fan = index === 1 ? 1 + 0.06 * Math.sin(y * 0.021) : 1;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (const [x, radial] of contour) {
        const u = x * width * fan, v = radius * fan + radial * depth;
        positions.push(c * v - s * u, y, s * v + c * u);
        uv.push(x + 0.5, fraction);
      }
      if (row === 0) continue;
      for (let k = 0; k < corners; k++) {
        const a = (row - 1) * corners + k;
        const b = (row - 1) * corners + (k + 1) % corners;
        indices.push(a, b, a + corners, b, b + corners, a + corners);
      }
    }
    for (let i = 1; i < corners - 1; i++) {
      indices.push(0, i + 1, i);
      indices.push(samples * corners, samples * corners + i, samples * corners + i + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function glassTexture(emission: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = emission ? '#000000' : '#273339';
    ctx.fillRect(0, 0, 128, 256);
    for (let floor = 0; floor < 16; floor++) {
      for (let bay = 0; bay < 8; bay++) {
        const lit = (floor * 61 + bay * 29 + floor * bay * 17) % 107;
        const x = bay * 16, y = floor * 16;
        if (emission && lit > 64) continue;
        ctx.fillStyle = emission ? lit % 5 ? '#e9b27b' : '#b2c6b8' : '#5d6058';
        ctx.globalAlpha = emission ? 0.36 + lit % 9 / 16 : 1;
        ctx.fillRect(x + 3, y + 4, 9, 10);
      }
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  }

  const glass = glassTexture(false);
  const interiors = glassTexture(true);
  const occupied = standard({
    map: glass, emissiveMap: interiors, emissive: 0xffffff, emissiveIntensity: 1.12,
    color: 0xc9c7b8, metalness: 0.25, roughness: 0.42,
  });

  // The three independently tapered supports leave a clear vertical gap around the inhabited core.
  const tips = [482, 461, 491];
  for (const [index, tip] of tips.entries()) {
    const rib = blade(index, 0, tip, RIB, 56);
    add(graphite, rib);
    survey.push(new THREE.EdgesGeometry(rib, 22));
    add(index === 1 ? bone : ceramic, blade(index, 1.2, tip - 0.9, PANEL, 56));
    add(steel, blade(index, 4, tip - 2.2, SEAM, 50));
    for (const y of [25, 114, 188, 290, 398, 443]) {
      if (y + 5 > tip) break;
      add(brass, blade(index, y, y + 3.7, [[-0.39, 0.39], [0.39, 0.39], [0.32, 0.605], [-0.32, 0.605]], 3));
    }
  }

  // The exchange levels carry thin bands of glass suspended between the frame's mechanical collars.
  const filament = [[6, 85, 6.1, 5.9], [85, 112, 5.7, 5.7], [113, 215, 5.2, 4.9],
    [217, 330, 5.1, 5.05], [331, 419, 4.7, 4.45], [421, 477, 4.3, 3.4]];
  for (const [low, high, lower, upper] of filament) {
    const length = high - low;
    const geometry = new THREE.CylinderGeometry(upper, lower, length, 16).translate(0, (low + high) / 2, 0);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * length / 56);
    add(occupied, geometry);
    for (let y = low + 7; y < high - 3; y += 12) {
      const radius = THREE.MathUtils.lerp(lower, upper, (y - low) / length);
      cowl(y % 5 === 0 ? ceramic : steel, 1.4, y, radius + 0.42, radius + 0.34, 16);
    }
  }

  for (const [i, [y, radius, width]] of [[88, 17.7, 7], [220, 23.1, 11.1], [336, 20.6, 8.5], [429, 16.9, 7.2]].entries()) {
    const collar = new THREE.CylinderGeometry(radius, radius, 6.3, 24, 1, true).translate(0, y + 0.6, 0);
    survey.push(new THREE.EdgesGeometry(collar, 25));
    collar.dispose();
    ring(graphite, y - 3.8, radius - 1.4, radius - width, 2.2);
    ring(ceramic, y + 3.3, radius, radius - width - 0.4, 1.55);
    ring(shadow, y + 0.56, radius - 0.97, radius - width + 0.32, 4.62);
    ring(steel, y - 1.6, radius + 0.65, radius - width - 0.4, 0.68);
    ring(brass, y - 2.55, radius - 0.7, radius - width, 0.61);
    cowl(ceramic, 6.5, y + 0.35, 7.2 - i * 0.42, 7.2 - i * 0.42, 16);
    cowl(occupied, 4.8, y + 0.63, 7.35 - i * 0.42, 7.35 - i * 0.42, 16);
    for (let vent = 0; vent < 48; vent++) {
      const rotation = vent * TAU / 48;
      const rr = radius - 0.85;
      box(vent % 5 === 0 ? steel : amber, Math.cos(rotation) * rr, y + 0.8, Math.sin(rotation) * rr, 0.58, 2.75, 1.72, -rotation);
    }
    for (let spoke = 0; spoke < 3; spoke++) {
      const [,,,, twist] = frameAt(y);
      const a = 0.21 + spoke * TAU / 3 + twist;
      const distance = (radius + 5) / 2;
      box(steel, Math.cos(a) * distance, y - 1.15, Math.sin(a) * distance, radius - 3.1, 1.46, 3.65, -a);
    }
  }

  cowl(shadow, 1.7, 0.85, 26.4, 25.6, 24);
  cowl(graphite, 3.2, 2.2, 23, 21.5, 12);
  cowl(bone, 2.9, 4.2, 14.2, 13.1, 12);
  ring(navigation, 7.1, 12.6, 11.35, 0.39);
  cowl(ceramic, 4.7, 475, 5.7, 4.3, 12);
  cowl(bone, 1.2, 477.95, 4.95, 4.95, 12);

  // The asymmetrical fork holds the communication array above the Architect's open berth.
  const lowerFork = [new THREE.Vector3(12, 466, 1), new THREE.Vector3(-10, 462, 8), new THREE.Vector3(-2, 475, -12)];
  const front = new THREE.Vector3(13.5, 509, 2.6);
  const back = new THREE.Vector3(-5.2, 521.5, -5.4);
  const side = new THREE.Vector3(-10.2, 511, 8.1);
  const upper = new THREE.Vector3(3.5, 544.6, -1.7);
  const tip = new THREE.Vector3(3.5, 560, -1.7);
  for (const [i, point] of [front, side, back].entries()) bar(i === 0 ? ceramic : steel, lowerFork[i], point, 1.72, 0.74);
  bar(graphite, side, back, 0.7);
  bar(graphite, front, back, 0.78);
  bar(ceramic, front, upper, 0.93, 0.45);
  bar(steel, back, upper, 0.7, 0.48);
  bar(bone, upper, tip, 0.53, 0.12);
  for (const y of [528, 533, 538, 542]) {
    const factor = (y - front.y) / (upper.y - front.y);
    const p = front.clone().lerp(upper, factor);
    box(y === 538 ? navigation : steel, p.x, y, p.z, 5.7 - factor * 2, 0.33, 0.62, 0.6);
  }
  box(beacon, tip.x, tip.y - 0.43, tip.z, 0.65, 0.86, 0.65);

  batches.forEach((pieces, material) => {
    root.add(new THREE.Mesh(mergeGeometries(pieces), material));
    pieces.forEach(piece => piece.dispose());
  });
  root.updateMatrixWorld(true);
  const holo = new THREE.LineSegments(mergeGeometries(survey), new THREE.LineBasicMaterial({
    color: 0xb0e3ec, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  survey.forEach(geometry => geometry.dispose());

  return {
    root, holo,
    dispose: () => {
      root.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach(material => material.dispose());
      glass.dispose();
      interiors.dispose();
    },
  };
}
