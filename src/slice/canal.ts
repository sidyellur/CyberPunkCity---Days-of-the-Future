import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const CANAL_COLUMN = 2;

const AXIS_X = -164;
const HALF_WIDTH = 30.5;
const HALF_LENGTH = 440;
const BRIDGES = [-287, -123, 41, 205, 287];
const DECK_HALF_WIDTH = 6.25;
const DECK_HEIGHT = 5.4;
const LEVEL_SPAN = 28;
const RAMP_END = 54;

function bridgeHeight(x: number): number {
  const across = Math.abs(x - AXIS_X);
  return DECK_HEIGHT * (1 - THREE.MathUtils.clamp((across - LEVEL_SPAN) / (RAMP_END - LEVEL_SPAN), 0, 1));
}
const VERTICAL = new THREE.Vector3(0, 1, 0);

const waterVertex = `
  varying vec3 worldPosition;
  #include <fog_pars_vertex>
  void main() {
    worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFragment = `
  varying vec3 worldPosition;
  uniform float time;
  uniform float axisX;
  uniform float halfWidth;
  uniform vec2 vessel;
  uniform vec2 direction;
  #include <fog_pars_fragment>
  void main() {
    vec2 position = worldPosition.xz;
    float cross = position.x - axisX;
    float bank = halfWidth - abs(cross);
    float swell = sin(position.x * 0.13 + position.y * 0.23 - time * 0.57);
    float phase = position.y * 1.04 + sin(position.x * 0.31 + time * 0.35) * 1.4;
    float visibleRipple = 1.0 - smoothstep(0.35, 2.2, fwidth(phase));
    float ripple = sin(phase - time * 1.4) * visibleRipple;
    float wave = swell * 0.48 + ripple * 0.52;
    float fleck = pow(0.5 + 0.5 * ripple, 3.0);
    vec3 view = normalize(cameraPosition - worldPosition);
    float grazing = pow(1.0 - max(view.y, 0.0), 3.0);
    vec3 color = mix(vec3(0.009, 0.032, 0.047), vec3(0.033, 0.051, 0.092), grazing);
    color += vec3(0.005, 0.012, 0.017) * wave;
    color += vec3(0.008, 0.016, 0.021) * fleck;

    // Quay lamps throw broken, cool streaks across the river.
    float fixture = mod(position.y + wave * 0.72 + 493.0, 21.0) - 10.5;
    float lamp = exp(-abs(fixture) * (0.53 + bank * 0.05)) * exp(-bank * 0.25);
    color += vec3(0.06, 0.32, 0.33) * lamp * (0.5 + 0.5 * fleck);
    color *= mix(0.55, 1.0, smoothstep(0.0, 1.7, bank));

    vec2 offset = position - vessel;
    float behind = -dot(offset, direction);
    float side = abs(dot(offset, vec2(-direction.y, direction.x)));
    float foam = smoothstep(8.0, 12.0, behind) * (1.0 - smoothstep(20.0, 49.0, behind));
    foam *= exp(-abs(side - behind * 0.23) * 2.6);
    foam *= 0.35 + 0.65 * fleck;
    color += vec3(0.08, 0.16, 0.18) * foam;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createCanal() {
  const root = new THREE.Group();
  root.name = 'Canal and waterway service bridges';
  const materials: THREE.Material[] = [];
  const pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();

  function surface(color: number, roughness = 0.8, metalness = 0.05, emissive = 0, emissiveIntensity = 0) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
    materials.push(material);
    return material;
  }

  const concrete = surface(0x495766);
  const cap = surface(0x78848a, 0.82, 0.12);
  const asphalt = surface(0x222d35, 0.68);
  const steel = surface(0x40515c, 0.55, 0.4);
  const fender = surface(0x43575d, 0.55);
  const ochre = surface(0x8d6540, 0.75, 0, 0x99622a, 0.1);
  const aqua = surface(0x6caaa4, 0.45, 0.18, 0x77e3de, 0.6);
  const amber = surface(0xbc9274, 0.44, 0.18, 0xffb068, 0.75);

  function addPiece(material: THREE.Material, geometry: THREE.BufferGeometry) {
    const batch = pieces.get(material) ?? [];
    batch.push(geometry);
    pieces.set(material, batch);
  }

  function box(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number) {
    addPiece(material, new THREE.BoxGeometry(width, height, depth).translate(x, y, z));
  }

  function beam(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, thickness: number) {
    const direction = b.clone().sub(a);
    const rotation = new THREE.Quaternion().setFromUnitVectors(VERTICAL, direction.clone().normalize());
    const center = a.clone().addScaledVector(direction, 0.5);
    const transform = new THREE.Matrix4().compose(center, rotation, new THREE.Vector3(1, 1, 1));
    addPiece(material, new THREE.BoxGeometry(thickness, direction.length(), thickness).applyMatrix4(transform));
  }

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 },
    axisX: { value: AXIS_X },
    halfWidth: { value: HALF_WIDTH },
    vessel: { value: new THREE.Vector2() },
    direction: { value: new THREE.Vector2() },
  }]);
  const water = new THREE.ShaderMaterial({ uniforms, vertexShader: waterVertex, fragmentShader: waterFragment, fog: true });
  materials.push(water);
  const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, HALF_LENGTH * 2).rotateX(-Math.PI / 2), water);
  waterMesh.position.set(AXIS_X, 0.11, 0);
  root.add(waterMesh);

  for (const side of [-1, 1]) {
    const edge = AXIS_X + side * HALF_WIDTH;
    const quay = edge + side * 4.6;
    box(concrete, edge + side * 0.76, 0.25, 0, 1.55, 0.5, HALF_LENGTH * 2);
    box(concrete, quay, 0.145, 0, 9.1, 0.29, HALF_LENGTH * 2);
    box(cap, edge + side * 0.38, 0.51, 0, 0.81, 0.14, HALF_LENGTH * 2);
    box(asphalt, edge + side * 8.05, 0.17, 0, 1.15, 0.06, HALF_LENGTH * 2);
    for (let z = -419; z <= 419; z += 8.2) {
      box(asphalt, quay, 0.294, z, 7.4, 0.018, 0.12);
    }

    // Continuous quay rails open at the bridge crossings.
    let last = -HALF_LENGTH;
    for (const endpoint of [...BRIDGES.map(z => z - 7.3), HALF_LENGTH]) {
      const length = endpoint - last;
      const railX = edge + side * 0.85;
      box(steel, railX, 1.63, (last + endpoint) / 2, 0.21, 0.15, length);
      box(steel, railX, 1.15, (last + endpoint) / 2, 0.12, 0.1, length);
      for (let z = last + 2; z < endpoint; z += 7) box(steel, railX, 1.08, z, 0.21, 1.48, 0.2);
      last = endpoint + 14.6;
    }

    for (let z = -419; z < 430; z += 21) {
      if (BRIDGES.some(bridge => Math.abs(bridge - z) < 8)) continue;
      box(steel, edge + side * 0.3, 0.6, z, 0.42, 0.32, 0.84);
      box(aqua, edge + side * 0.081, 0.62, z, 0.032, 0.16, 0.58);
    }
  }

  for (const z of BRIDGES) {
    box(concrete, AXIS_X, DECK_HEIGHT - 0.37, z, LEVEL_SPAN * 2, 0.66, 13);
    box(asphalt, AXIS_X, DECK_HEIGHT - 0.04, z, LEVEL_SPAN * 2, 0.08, 10.0);
    for (const end of [-1, 1]) {
      const angle = -end * Math.atan2(DECK_HEIGHT, RAMP_END - LEVEL_SPAN);
      const slant = Math.hypot(DECK_HEIGHT, RAMP_END - LEVEL_SPAN);
      const x = AXIS_X + end * (LEVEL_SPAN + RAMP_END) / 2;
      addPiece(concrete, new THREE.BoxGeometry(slant, 0.51, 13).rotateZ(angle).translate(x, DECK_HEIGHT / 2 - 0.29, z));
      addPiece(asphalt, new THREE.BoxGeometry(slant, 0.08, 10).rotateZ(angle).translate(x, DECK_HEIGHT / 2 - 0.04, z));
      box(concrete, AXIS_X + end * (LEVEL_SPAN - 2), DECK_HEIGHT / 2, z, 1.6, DECK_HEIGHT, 10.4);
    }
    for (let offset = -LEVEL_SPAN + 5; offset < LEVEL_SPAN; offset += 8) {
      box(ochre, AXIS_X + offset, DECK_HEIGHT + 0.009, z, 3.9, 0.015, 0.15);
    }

    for (const side of [-1, 1]) {
      const railZ = z + side * DECK_HALF_WIDTH;
      for (const height of [0.25, 1.21]) {
        const rail = [-RAMP_END, -LEVEL_SPAN, LEVEL_SPAN, RAMP_END]
          .map(offset => new THREE.Vector3(AXIS_X + offset, bridgeHeight(AXIS_X + offset) + height, railZ));
        for (let i = 1; i < rail.length; i++) beam(steel, rail[i - 1], rail[i], 0.17);
      }
      for (let offset = -RAMP_END + 4; offset < RAMP_END; offset += 5.0) {
        const x = AXIS_X + offset;
        const h = bridgeHeight(x);
        box(steel, x, h + 0.61, railZ, 0.17, 1.22, 0.18);
        if (Math.abs(offset) < LEVEL_SPAN) box(aqua, x, h + 1.13, railZ - side * 0.1, 0.52, 0.10, 0.04);
      }

      for (const offset of [-30, 30]) {
        const x = AXIS_X + offset;
        const h = bridgeHeight(x);
        box(concrete, x, h + 0.69, railZ, 1.4, 1.34, 1.24);
        box(cap, x, h + 1.39, railZ, 1.54, 0.22, 1.42);
        box(amber, x, h + 1.06, railZ + side * 0.64, 0.68, 0.18, 0.06);
      }

      if (z === 41) {
        // The civic span carries an arch above the road, leaving the water clear.
        const arch = [];
        for (let segment = 0; segment <= 14; segment++) {
          const u = segment / 14;
          const x = AXIS_X + (u - 0.5) * LEVEL_SPAN * 2;
          const y = DECK_HEIGHT + 1.5 + 13 * 4 * u * (1 - u);
          arch.push(new THREE.Vector3(x, y, railZ));
          if (segment > 0 && segment < 14) beam(steel, new THREE.Vector3(x, DECK_HEIGHT + 1.05, railZ), arch[segment], 0.25);
          if (segment > 0) {
            beam(steel, arch[segment - 1], arch[segment], 1);
            const offset = new THREE.Vector3(0, 0.22, side * 0.53);
            beam(aqua, arch[segment - 1].clone().add(offset), arch[segment].clone().add(offset), 0.14);
          }
        }
      }
    }
  }

  // A recessed maintenance berth is fed through utility lines from the quay.
  const dockX = AXIS_X + HALF_WIDTH - 5;
  const dockZ = 106;
  box(steel, dockX, 0.49, dockZ, 12.5, 0.5, 28);
  box(fender, dockX - 6.35, 0.31, dockZ, 0.32, 0.54, 28);
  for (let z = dockZ - 12; z <= dockZ + 13; z += 4) {
    box(ochre, dockX - 5.6, 0.766, z, 0.58, 0.04, 1.03);
    box(concrete, dockX - 5.9, 0.93, z, 0.42, 0.46, 0.43);
  }
  for (const z of [dockZ - 9, dockZ + 6]) {
    box(concrete, dockX + 2.1, 1.3, z, 3.4, 2.1, 3.2);
    box(cap, dockX + 2.1, 2.45, z, 3.8, 0.2, 3.55);
    box(amber, dockX + 0.37, 1.95, z, 0.06, 0.12, 1.28);
    box(steel, dockX + 0.36, 1.33, z, 0.06, 0.89, 1.38);
  }
  const craneBase = new THREE.Vector3(dockX + 3.0, 1, dockZ - 1);
  const craneTop = new THREE.Vector3(craneBase.x, 11, craneBase.z);
  const craneReach = new THREE.Vector3(dockX - 8.5, 11, craneBase.z);
  beam(steel, craneBase, craneTop, 1.32);
  beam(ochre, craneTop, craneReach, 0.78);
  beam(steel, new THREE.Vector3(craneBase.x, 6.8, craneBase.z), craneReach, 0.42);
  beam(steel, craneReach, new THREE.Vector3(craneReach.x, 5.7, craneReach.z), 0.08);
  box(amber, craneReach.x, 5.55, craneReach.z, 0.32, 0.36, 0.35);

  for (const [material, batch] of pieces) {
    root.add(new THREE.Mesh(mergeGeometries(batch), material));
    batch.forEach(geometry => geometry.dispose());
  }

  const vessel = new THREE.Group();
  vessel.name = 'Canal maintenance vessel';
  root.add(vessel);
  const paint = surface(0xa78f72, 0.53, 0.37, 0x6f4d33, 0.16);
  const window = surface(0x567474, 0.35, 0.36, 0x82d7c9, 0.46);
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-2.9, 7.6);
  hullShape.lineTo(2.9, 7.6);
  hullShape.lineTo(3.45, 5.8);
  hullShape.lineTo(3.45, -5.0);
  hullShape.lineTo(1.52, -8.8);
  hullShape.lineTo(0, -10.2);
  hullShape.lineTo(-1.52, -8.8);
  hullShape.lineTo(-3.45, -5.0);
  hullShape.lineTo(-3.45, 5.8);
  hullShape.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, {
    depth: 1.13, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.27, bevelThickness: 0.24,
  }).rotateX(-Math.PI / 2), paint);
  hull.position.y = 0.21;
  vessel.add(hull);

  function vesselBox(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    vessel.add(mesh);
  }
  vesselBox(steel, 0, 1.47, 0.35, 5.9, 0.23, 12.5);
  vesselBox(paint, 0, 2.53, -3.65, 4.8, 2.03, 4.7);
  vesselBox(window, 0, 2.78, -1.28, 3.9, 0.83, 0.12);
  vesselBox(paint, 0, 3.67, -3.65, 5.0, 0.26, 4.9);
  vesselBox(amber, 0, 4.18, -3.53, 0.47, 0.37, 0.47);
  for (const side of [-1, 1]) {
    vesselBox(window, side * 2.42, 2.84, -3.57, 0.12, 0.86, 3.77);
    vesselBox(steel, side * 2.15, 1.89, 3.2, 0.34, 0.87, 5.3);
    vesselBox(aqua, side * 2.38, 1.85, 5.84, 0.32, 0.2, 0.31);
    vesselBox(concrete, side * 1.16, 2.1, 3.34, 1.8, 0.98, 2.7);
  }

  function blocksWalk(x: number, z: number): boolean {
    const across = Math.abs(x - AXIS_X);
    if (across < RAMP_END && BRIDGES.some(bridge => Math.abs(Math.abs(z - bridge) - DECK_HALF_WIDTH) < 0.65)) return true;
    return across <= HALF_WIDTH + 0.82 && Math.abs(z) < HALF_LENGTH
      && !BRIDGES.some(bridge => Math.abs(z - bridge) < DECK_HALF_WIDTH - 0.62);
  }

  function walkHeight(x: number, z: number): number {
    if (!BRIDGES.some(bridge => Math.abs(z - bridge) < DECK_HALF_WIDTH - 0.62)) return 0;
    return bridgeHeight(x);
  }

  function update(time: number): void {
    // The vessel follows a narrow ellipse, reversing course outside the district.
    const angle = time * 0.022 + 0.43;
    const x = AXIS_X - 5.3 * Math.cos(angle);
    const z = 409 * Math.sin(angle);
    const dx = 5.3 * Math.sin(angle);
    const dz = 409 * Math.cos(angle);
    vessel.position.set(x, 0.1 + Math.sin(time * 1.6) * 0.055, z);
    vessel.rotation.y = Math.atan2(dx, dz);
    vessel.rotation.z = Math.sin(time * 1.05) * 0.018;
    uniforms.time.value = time;
    uniforms.vessel.value.set(x, z);
    uniforms.direction.value.set(dx, dz).normalize();
  }

  update(0);
  return {
    root,
    update,
    blocksWalk,
    walkHeight,
    dispose() {
      root.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      materials.forEach(material => material.dispose());
    },
  };
}
