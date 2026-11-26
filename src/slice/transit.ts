import * as THREE from 'three';
import { QUAY_STOPS, quayJourney } from './quayRide';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const LINE = {
  west: -357,
  east: 357,
  z: 281.2,
  railY: 9.1,
  cabinY: 11.05,
};
const CROSS_LINE = {
  x: 123,
  north: -357,
  south: 382,
  railY: 20.6,
  cabinY: 22.55,
};
const EXCHANGE = { x: CROSS_LINE.x, z: LINE.z };
const QUAY_LINE = { z: 369, railY: 14.75, cabinY: 16.7 };

function addBoxes(target: THREE.Group, material: THREE.Material, boxes: number[][]): void {
  const pieces = boxes.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const geometry = mergeGeometries(pieces);
  target.add(new THREE.Mesh(geometry, material));
  pieces.forEach(piece => piece.dispose());
}

function routeGraphics(line: string): THREE.CanvasTexture {
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
  g.fillText(line, 416, 82);
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

function exchangeGraphics(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 220;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#102026';
  g.fillRect(0, 0, 960, 220);
  g.fillStyle = '#c2eee3';
  g.fillRect(0, 16, 12, 188);
  g.font = '700 30px monospace';
  g.fillText('AEROLINK    /    EXCHANGE', 47, 50);
  g.font = '700 77px sans-serif';
  g.fillText('MERIDIAN', 42, 132);
  g.font = '600 30px monospace';
  g.fillText('06 NIGHT LOOP', 50, 180);
  g.fillStyle = '#f8c89a';
  g.fillText('12 ORBITAL', 395, 180);
  g.strokeStyle = '#f8c89a';
  g.lineWidth = 11;
  g.beginPath();
  g.moveTo(789, 161);
  g.lineTo(902, 161);
  g.moveTo(846, 105);
  g.lineTo(846, 46);
  g.stroke();
  g.strokeStyle = '#c2eee3';
  g.beginPath();
  g.ellipse(846, 103, 57, 57, 0, Math.PI, Math.PI * 2);
  g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Two tall, ribbed canopies turn the perpendicular platforms into one landmark. */
function addCanopy(
  root: THREE.Group, material: THREE.Material, glass: THREE.Material,
  x: number, z: number, y: number, span: number, width: number, height: number, northbound: boolean,
): void {
  const arch = (length: number, angle: number) => {
    const side = Math.cos(angle) * width / 2;
    return new THREE.Vector3(northbound ? x + side : x + length, y + Math.sin(angle) * height, northbound ? z + length : z + side);
  };
  const ribs: THREE.BufferGeometry[] = [];
  const spine = [Math.PI * 0.22, Math.PI * 0.49, Math.PI * 0.78];
  for (let i = 0; i <= 8; i++) {
    const length = span * (i / 8 - 0.5);
    const nodes = Array.from({ length: 13 }, (_, step) => arch(length, Math.PI * step / 12));
    ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nodes), 18, i === 0 || i === 8 ? 0.38 : 0.22, 6));
  }
  for (const angle of spine) {
    const curve = new THREE.LineCurve3(arch(-span / 2, angle), arch(span / 2, angle));
    ribs.push(new THREE.TubeGeometry(curve, 1, angle === spine[1] ? 0.35 : 0.2, 6));
  }
  root.add(new THREE.Mesh(mergeGeometries(ribs), material));
  ribs.forEach(rib => rib.dispose());

  // Open joints between translucent roof panels reveal the carriages from above.
  const positions: number[] = [];
  for (let panel = 0; panel < 8; panel++) {
    const a = span * (panel / 8 - 0.5) + 0.16;
    const b = a + span / 8 - 0.32;
    for (let facet = 2; facet < 10; facet++) {
      const p = Math.PI * facet / 12;
      const q = Math.PI * (facet + 1) / 12;
      for (const point of [arch(a, p), arch(b, p), arch(b, q), arch(a, p), arch(b, q), arch(a, q)]) {
        positions.push(point.x, point.y, point.z);
      }
    }
  }
  const membrane = new THREE.BufferGeometry();
  membrane.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  membrane.computeVertexNormals();
  root.add(new THREE.Mesh(membrane, glass));
}

export function createTransit() {
  const root = new THREE.Group();
  root.name = 'Aerolink transit network';
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
  const routeMap = routeGraphics('06');
  const crossRouteMap = routeGraphics('12');
  const stationMap = exchangeGraphics();
  const quayRouteMap = routeGraphics('19');
  const route = material({ map: routeMap, emissiveMap: routeMap, emissive: 0x9ac6be, emissiveIntensity: 0.31, roughness: 0.56 });
  const crossRoute = material({ map: crossRouteMap, emissiveMap: crossRouteMap, emissive: 0xad9c94, emissiveIntensity: 0.34, roughness: 0.56 });
  const quayRoute = material({ map: quayRouteMap, emissiveMap: quayRouteMap, emissive: 0xc1ddd3, emissiveIntensity: 0.35, roughness: 0.56 });
  const stationSign = material({ map: stationMap, emissiveMap: stationMap, emissive: 0xe6fff3, emissiveIntensity: 0.75, roughness: 0.6 });
  const canopyFrame = material({ color: 0xa28d78, roughness: 0.38, metalness: 0.38 });
  const canopyGlass = material({
    color: 0x527f85, emissive: 0x20494b, emissiveIntensity: 0.48, transparent: true, opacity: 0.48,
    roughness: 0.28, side: THREE.DoubleSide, depthWrite: false,
  });
  const platformGlass = material({
    color: 0x477175, emissive: 0x294d52, emissiveIntensity: 0.5, transparent: true, opacity: 0.63,
    roughness: 0.3, depthWrite: false,
  });
  const warmMarker = material({ color: 0xcdac8d, emissive: 0xb07c4c, emissiveIntensity: 0.72, roughness: 0.47 });
  const quaySteel = material({ color: 0x536976, emissive: 0x26484a, emissiveIntensity: 0.3, roughness: 0.55, metalness: 0.44 });
  const start = LINE.west - 9;
  const end = LINE.east + 9;
  const crossStart = CROSS_LINE.north - 9;
  const crossEnd = CROSS_LINE.south + 9;
  const crossLength = crossEnd - crossStart;
  const crossMidpoint = (crossStart + crossEnd) / 2;
  const midpoint = (start + end) / 2;
  const length = end - start;

  const supportLocations = [-354, -312, -272, -231, -190, -149, -112, -72, -33, 6, 49, 86, 133, 174, 216, 257, 299, 341];
  const crossSupportLocations = [-349, -310, -270, -229, -189, -150, -109, -68, -26, 14, 55, 96, 138, 178, 219, 258, 306, 348];
  const pillars: number[][] = [];
  const structure: number[][] = [
    [midpoint, LINE.railY - 0.57, LINE.z, length, 0.72, 1.42],
    [CROSS_LINE.x, CROSS_LINE.railY - 0.64, crossMidpoint, crossLength, 0.95, 1.68],
  ];
  const rails: number[][] = [];
  const quayDeck: number[][] = [[midpoint, QUAY_LINE.railY - 0.47, QUAY_LINE.z, length, 0.52, 1.65]];
  const coolSignals: number[][] = [];
  const warmSignals: number[][] = [];
  const stationFrame: number[][] = [];
  const glazing: number[][] = [];
  const colliders = supportLocations.map(x => ({
    minX: x - 0.84, maxX: x + 0.84, minZ: LINE.z - 2.15, maxZ: LINE.z - 0.73,
  }));
  for (const x of supportLocations) {
    pillars.push([x, 4.04, LINE.z - 1.44, 1.18, 8.08, 0.96]);
    pillars.push([x, 0.34, LINE.z - 1.44, 1.68, 0.68, 1.42]);
    structure.push([x, 8.03, LINE.z - 0.55, 1.5, 0.6, 3.38]);
    coolSignals.push([x, 7.63, LINE.z - 0.97, 0.58, 0.18, 0.13]);
  }
  for (const z of crossSupportLocations) {
    const x = CROSS_LINE.x - 3.75;
    pillars.push([x, 9.75, z, 1.25, 19.5, 1.25]);
    pillars.push([x, 0.4, z, 1.75, 0.8, 1.75]);
    structure.push([x + 1.88, 19.35, z, 5.05, 0.82, 1.27]);
    warmSignals.push([x, 18.6, z + 0.66, 0.62, 0.18, 0.12]);
    colliders.push({ minX: x - 0.875, maxX: x + 0.875, minZ: z - 0.875, maxZ: z + 0.875 });
  }
  for (let x = start + 12; x < end; x += 39) {
    if (Math.abs(x - CROSS_LINE.x) < 9 || (x > -195 && x < -133)) continue;
    const z = QUAY_LINE.z + 1.7;
    pillars.push([x, 6.79, z, 1.05, 13.58, 1.05], [x, 0.35, z, 1.62, 0.7, 1.62]);
    quayDeck.push([x, 13.57, QUAY_LINE.z + 0.8, 1.36, 0.71, 3.35]);
    colliders.push({ minX: x - 0.81, maxX: x + 0.81, minZ: z - 0.81, maxZ: z + 0.81 });
  }
  // The exposed seafront span reads as infrastructure from the overview.
  for (let x = start + 2; x < end; x += 9) {
    quayDeck.push([x, QUAY_LINE.railY - 0.42, QUAY_LINE.z + 1.18, 4.5, 0.12, 0.26]);
  }
  for (let x = start + 2; x < end; x += 3.6) {
    structure.push([x, LINE.railY - 0.19, LINE.z, 0.24, 0.23, 2.92]);
  }
  for (let z = crossStart + 2; z < crossEnd; z += 3.6) {
    structure.push([CROSS_LINE.x, CROSS_LINE.railY - 0.21, z, 3.05, 0.27, 0.29]);
  }
  for (const side of [-1, 1]) {
    rails.push([midpoint, LINE.railY, LINE.z + side * 1.15, length, 0.16, 0.25]);
    rails.push([CROSS_LINE.x + side * 1.15, CROSS_LINE.railY, crossMidpoint, 0.24, 0.19, crossLength]);
    rails.push([midpoint, QUAY_LINE.railY, QUAY_LINE.z + side * 1.15, length, 0.16, 0.25]);
  }

  // Repeated, compact platforms help the elevated routes read from the skyline.
  for (const x of [-291, -208, -108, 286]) {
    stationFrame.push([x, 9.35, 287.2, 25, 0.48, 7.8], [x, 13.68, 287.8, 24, 0.2, 5.4]);
    coolSignals.push([x, 13.53, 290.55, 24, 0.13, 0.08]);
    for (const offset of [-10.8, 0, 10.8]) stationFrame.push([x + offset, 11.48, 290.3, 0.22, 4.2, 0.22]);
    glazing.push([x, 11.3, 290.45, 22, 2.7, 0.09]);
  }
  for (const z of [-289, -202, -39, 125, 200]) {
    stationFrame.push([128.2, 20.85, z, 6.7, 0.48, 24], [128.2, 25.25, z, 5.4, 0.2, 23]);
    warmSignals.push([130.94, 25.1, z, 0.08, 0.13, 23]);
    for (const offset of [-10.8, 0, 10.8]) stationFrame.push([130.7, 23.04, z + offset, 0.22, 4.2, 0.22]);
    glazing.push([130.85, 23.03, z, 0.09, 2.75, 22]);
  }

  // The Quay Line and Orbital share an elevated outer transfer platform.
  for (const { x } of QUAY_STOPS) {
    stationFrame.push([x, 15, QUAY_LINE.z + 5.8, 28, 0.52, 7.05]);
    stationFrame.push([x, 19.35, QUAY_LINE.z + 7, 27, 0.21, 4.7]);
    coolSignals.push([x, 19.23, QUAY_LINE.z + 9.38, 26, 0.14, 0.1]);
    for (const offset of [-12, 0, 12]) stationFrame.push([x + offset, 17.27, QUAY_LINE.z + 9.2, 0.25, 4.47, 0.22]);
  }
  stationFrame.push([128.8, 20.95, QUAY_LINE.z + 1, 5.2, 0.52, 27]);
  stationFrame.push([130.8, 18.27, QUAY_LINE.z + 7.6, 0.36, 5.35, 2.6]);
  warmSignals.push([131.45, 21.08, QUAY_LINE.z + 1, 0.12, 0.15, 26]);
  glazing.push([131.35, 22.08, QUAY_LINE.z + 1, 0.12, 2.1, 24]);

  const { x: hubX, z: hubZ } = EXCHANGE;
  stationFrame.push(
    [hubX, 9.38, hubZ + 6.7, 54, 0.65, 9.75],
    [hubX + 5.85, 20.92, hubZ, 5.35, 0.68, 58],
    [hubX, 14.22, hubZ + 11.63, 54, 0.46, 0.44],
    [hubX, 15.49, hubZ + 11.63, 54, 0.15, 0.38],
    [hubX + 8.8, 25.4, hubZ, 0.28, 0.28, 57],
    [hubX - 11.5, 12.18, hubZ + 9.1, 2.2, 24.36, 3.25],
    [hubX + 6.4, 10.75, hubZ + 8.85, 3.9, 21.5, 4.1],
    [hubX + 3.4, 18.1, hubZ + 8.85, 9.55, 0.53, 4.1],
  );
  glazing.push(
    [hubX, 12.19, hubZ + 11.53, 53.2, 3.5, 0.13],
    [hubX + 8.55, 23.04, hubZ, 0.13, 3.47, 57],
    [hubX + 7.93, 12.1, hubZ + 11, 0.25, 18.5, 0.15],
    [hubX + 3.4, 19.72, hubZ + 10.85, 9.45, 2.65, 0.13],
  );
  coolSignals.push(
    [hubX, 9.77, hubZ + 11.38, 53.7, 0.18, 0.14],
    [hubX, 15.72, hubZ + 11.46, 53, 0.15, 0.21],
    [hubX - 10.32, 12.19, hubZ + 10.76, 0.11, 22, 0.11],
  );
  warmSignals.push(
    [hubX + 8.64, 20.98, hubZ, 0.19, 0.17, 57.8],
    [hubX + 8.71, 25.54, hubZ, 0.19, 0.14, 57.8],
    [hubX + 8.32, 11.5, hubZ + 10.96, 0.14, 20.4, 0.13],
  );
  colliders.push(
    { minX: hubX - 12.6, maxX: hubX - 10.4, minZ: hubZ + 7.47, maxZ: hubZ + 10.73 },
    { minX: hubX + 4.45, maxX: hubX + 8.35, minZ: hubZ + 6.8, maxZ: hubZ + 10.9 },
  );
  addCanopy(root, canopyFrame, canopyGlass, hubX, hubZ + 5.65, 10.2, 54, 16.95, 6.9, false);
  addCanopy(root, canopyFrame, canopyGlass, hubX + 1.33, hubZ, 21.05, 58, 14.7, 7.5, true);

  const identitySign = new THREE.Mesh(new THREE.PlaneGeometry(22.5, 5.16), stationSign);
  identitySign.position.set(hubX - 2.2, 13.78, hubZ + 11.89);
  root.add(identitySign);
  const eastSign = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.125), stationSign);
  eastSign.position.set(hubX + 8.96, 24.15, hubZ + 9.8);
  eastSign.rotation.y = Math.PI / 2;
  root.add(eastSign);
  addBoxes(root, concrete, pillars);
  addBoxes(root, frame, structure);
  addBoxes(root, rail, rails);
  addBoxes(root, quaySteel, quayDeck);
  addBoxes(root, canopyFrame, stationFrame);
  addBoxes(root, platformGlass, glazing);
  addBoxes(root, running, coolSignals);
  addBoxes(root, warmMarker, warmSignals);

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
  lights.name = 'Shuttle lamps';
  addBoxes(lights, head, [[7.58, -0.42, -0.92, 0.09, 0.11, 0.41], [7.58, -0.42, 0.92, 0.09, 0.11, 0.41]]);
  addBoxes(lights, tail, [[-7.58, -0.42, -0.92, 0.09, 0.11, 0.41], [-7.58, -0.42, 0.92, 0.09, 0.11, 0.41]]);
  vehicle.add(lights);

  const crossVehicle = vehicle.clone(true);
  crossVehicle.name = 'Aerolink Orbital shuttle';
  crossVehicle.rotation.y = -Math.PI / 2;
  crossVehicle.traverse(object => {
    if (object instanceof THREE.Mesh && object.material === route) object.material = crossRoute;
  });
  root.add(crossVehicle);
  const crossLights = crossVehicle.getObjectByName(lights.name)!;
  const quayVehicle = vehicle.clone(true);
  quayVehicle.name = 'Aerolink Quay shuttle';
  quayVehicle.traverse(object => {
    if (object instanceof THREE.Mesh && object.material === route) object.material = quayRoute;
  });
  root.add(quayVehicle);
  const quayLights = quayVehicle.getObjectByName(lights.name)!;

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

  function update(time: number, marketTime = time, quayTime = time) {
    const phase = marketTime * 0.058 + Math.asin(12 / LINE.east);
    const x = LINE.east * Math.sin(phase);
    const direction = Math.cos(phase) >= 0 ? 1 : -1;
    vehicle.position.set(x, LINE.cabinY, LINE.z);
    lights.rotation.y = direction > 0 ? 0 : Math.PI;
    wash.target.position.set(x + direction * 2.6, 0.1, LINE.z + 4.4);
    spill.position.set(x + direction * 2.1, 0.19, LINE.z + 3.8);

    const crossCenter = (CROSS_LINE.north + CROSS_LINE.south) / 2;
    const crossReach = (CROSS_LINE.south - CROSS_LINE.north) / 2;
    const orbitalPhase = time * 0.069 + Math.asin((264 - crossCenter) / crossReach);
    const z = crossCenter + crossReach * Math.sin(orbitalPhase);
    crossVehicle.position.set(CROSS_LINE.x, CROSS_LINE.cabinY, z);
    crossLights.rotation.y = Math.cos(orbitalPhase) >= 0 ? 0 : Math.PI;
    return positionQuay(quayTime);
  }

  function positionQuay(time: number) {
    const ride = quayJourney(time);
    quayVehicle.position.set(ride.x, QUAY_LINE.cabinY, QUAY_LINE.z);
    quayLights.rotation.y = ride.direction > 0 ? 0 : Math.PI;
    return ride;
  }
  update(0);

  return {
    root,
    update,
    colliders,
    quayVehicle, positionQuay,
    dispose: () => {
      const geometry = new Set<THREE.BufferGeometry>();
      const surfaces = new Set<THREE.Material>();
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometry.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach(surface => surfaces.add(surface));
      });
      geometry.forEach(piece => piece.dispose());
      surfaces.forEach(surface => surface.dispose());
      [routeMap, crossRouteMap, stationMap, quayRouteMap, spillMap].forEach(texture => texture.dispose());
      wash.dispose();
    },
  };
}
