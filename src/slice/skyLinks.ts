import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type SectionPoint = [across: number, height: number];

function sectionSampler(path: THREE.CatmullRomCurve3) {
  return (position: number, [across, height]: SectionPoint): THREE.Vector3 => {
    const center = path.getPointAt(position);
    const tangent = path.getTangentAt(position);
    const horizontal = Math.hypot(tangent.x, tangent.z);
    return center.add(new THREE.Vector3(-tangent.z * across / horizontal, height, tangent.x * across / horizontal));
  };
}

function skin(
  sample: ReturnType<typeof sectionSampler>, sides: [SectionPoint, SectionPoint][], steps: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < steps; i++) {
    const begin = i / steps;
    const end = (i + 1) / steps;
    for (const [left, right] of sides) {
      const a = sample(begin, left);
      const b = sample(end, left);
      const c = sample(end, right);
      const d = sample(begin, right);
      for (const vertex of [a, b, c, a, c, d]) positions.push(vertex.x, vertex.y, vertex.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function conduit(sample: ReturnType<typeof sectionSampler>, point: SectionPoint, radius: number, steps: number) {
  const spine = new THREE.CatmullRomCurve3(Array.from({ length: steps + 1 }, (_, i) => sample(i / steps, point)));
  return new THREE.TubeGeometry(spine, steps, radius, 6, false);
}

function beam(a: THREE.Vector3, b: THREE.Vector3, depth: number, width = depth): THREE.BoxGeometry {
  const direction = new THREE.Vector3().subVectors(b, a);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  const middle = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return new THREE.BoxGeometry(width, direction.length(), depth)
    .applyQuaternion(rotation)
    .translate(middle.x, middle.y, middle.z);
}

export function createSkyLinks(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Meridian sky links';

  const roof = new THREE.MeshStandardMaterial({
    color: 0x5e7180, metalness: 0.46, roughness: 0.48, side: THREE.DoubleSide,
  });
  const deck = new THREE.MeshStandardMaterial({
    color: 0x3a4146, metalness: 0.3, roughness: 0.72, side: THREE.DoubleSide,
  });
  const frame = new THREE.MeshStandardMaterial({
    color: 0x99a6a8, metalness: 0.38, roughness: 0.56, emissive: 0x4a6a6b, emissiveIntensity: 0.17,
  });
  const utility = new THREE.MeshStandardMaterial({ color: 0x52646c, metalness: 0.7, roughness: 0.52 });
  const glazing = new THREE.MeshStandardMaterial({
    color: 0x4e9399, emissive: 0x286164, emissiveIntensity: 0.32, metalness: 0.33, roughness: 0.3,
    opacity: 0.53, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  const opening = new THREE.MeshStandardMaterial({
    color: 0x638886, emissive: 0x325453, emissiveIntensity: 0.39, roughness: 0.41,
  });
  const pathLight = new THREE.MeshStandardMaterial({
    color: 0xbae1d6, emissive: 0x6db7ab, emissiveIntensity: 0.86, roughness: 0.45,
  });
  const ceilingLight = new THREE.MeshStandardMaterial({
    color: 0xeacb9d, emissive: 0xdba876, emissiveIntensity: 0.77, roughness: 0.5,
  });
  const meshParts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (material: THREE.Material, piece: THREE.BufferGeometry): void => {
    const pieces = meshParts.get(material) ?? [];
    pieces.push(piece);
    meshParts.set(material, pieces);
  };

  function gallery(positions: number[][], width: number, height: number, bays: number): void {
    const path = new THREE.CatmullRomCurve3(positions.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const sample = sectionSampler(path);
    const steps = bays * 3;
    const sill = width * 0.46;
    const belt = width * 0.5;
    const eave = width * 0.45;
    const crown = width * 0.31;
    const floor = -0.63;
    const lower = -0.11;
    const top = height * 0.74;

    add(deck, skin(sample, [
      [[-sill, floor], [sill, floor]],
      [[-belt, lower], [-sill, floor]],
      [[sill, floor], [belt, lower]],
      [[-belt, lower], [belt, lower]],
    ], steps));
    add(roof, skin(sample, [
      [[-eave, top], [-crown, height]],
      [[-crown, height], [crown, height]],
      [[crown, height], [eave, top]],
    ], steps));
    add(glazing, skin(sample, [
      [[-belt, lower], [-eave, top]],
      [[eave, top], [belt, lower]],
    ], steps));

    // The ribs rise around the glass and remain separate from the light strips.
    const profile: SectionPoint[] = [
      [-sill, floor], [-belt, lower], [-eave, top], [-crown, height],
      [crown, height], [eave, top], [belt, lower], [sill, floor],
    ];
    for (let bay = 0; bay <= bays; bay++) {
      const t = bay / bays;
      const ribWidth = bay === 0 || bay === bays ? 0.33 : 0.17;
      for (let corner = 0; corner < profile.length - 1; corner++) {
        add(frame, beam(sample(t, profile[corner]), sample(t, profile[corner + 1]), ribWidth, ribWidth * 1.48));
      }
      if (bay === bays) continue;
      for (const side of [-1, 1]) {
        if (bay % 3 === 1) {
          const mid = (bay + 0.5) / bays;
          const lamp = side * belt * 0.96;
          add(ceilingLight, beam(sample(mid, [lamp, top - 0.28]), sample(mid, [lamp, top - 0.12]), 0.085, 0.37));
        }
        add(frame, beam(
          sample(t, [side * belt, lower]),
          sample((bay + 1) / bays, [side * sill, floor - 0.5]),
          0.14,
        ));
      }
    }
    for (const side of [-1, 1]) {
      add(frame, conduit(sample, [side * (belt + 0.04), lower - 0.08], 0.16, steps));
      add(utility, conduit(sample, [side * (sill - 0.35), floor - 0.44], 0.17, steps));
      add(pathLight, conduit(sample, [side * (sill - 0.12), lower - 0.22], 0.091, steps));
      add(ceilingLight, conduit(sample, [side * (crown - 0.27), height - 0.19], 0.08, steps));
    }
  }

  // This bow steps forward into the avenue before returning to the two occupied façades.
  gallery([
    [99, 50.1, 249.3], [109, 50.1, 250.5], [117, 50.6, 256.6],
    [125, 51.7, 262.8], [131, 51.3, 262.1], [139, 50.5, 255.5], [147, 50.1, 249.0],
  ], 7.7, 4.2, 14);

  // An enclosed inclined lift climbs to the gallery from the inter-platform station core.
  gallery([
    [129.9, 30.1, 290.1], [129.8, 32.2, 285.6], [130.8, 38.5, 277.5],
    [129.3, 46.0, 269.7], [125.8, 51.3, 263.1],
  ], 3.45, 2.85, 9);

  const stationRiser = { x: 129.9, z: 290.1, bottom: 23.75, top: 31.5 };
  const riserHeight = stationRiser.top - stationRiser.bottom;
  const riserMid = (stationRiser.bottom + stationRiser.top) / 2;
  add(deck, new THREE.BoxGeometry(3.46, riserHeight, 3.85)
    .translate(stationRiser.x, riserMid, stationRiser.z));
  add(opening, new THREE.BoxGeometry(2.85, riserHeight - 1.06, 0.13)
    .translate(stationRiser.x, riserMid + 0.06, stationRiser.z + 1.95));
  for (const side of [-1, 1]) {
    const x = stationRiser.x + side * 1.58;
    add(frame, new THREE.BoxGeometry(0.22, riserHeight, 0.3).translate(x, riserMid, stationRiser.z + 2.02));
    add(pathLight, new THREE.BoxGeometry(0.074, riserHeight - 0.7, 0.07).translate(x, riserMid, stationRiser.z + 2.19));
  }
  add(frame, new THREE.BoxGeometry(3.7, 0.36, 4.04).translate(stationRiser.x, 30.76, stationRiser.z));

  for (const [material, pieces] of meshParts) {
    // Skins use unindexed faces while the structural details use indexed primitives.
    const compatible = pieces.map(piece => {
      const geometry = piece.index ? piece.toNonIndexed() : piece.clone();
      geometry.deleteAttribute('uv');
      return geometry;
    });
    root.add(new THREE.Mesh(mergeGeometries(compatible), material));
    compatible.forEach(piece => piece.dispose());
    pieces.forEach(piece => piece.dispose());
  }
  return root;
}
