import * as THREE from 'three';

export function createStreetLife() {
  const root = new THREE.Group();
  root.name = 'Civic mobility and autonomous courier';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const maps = new Set<THREE.Texture>();

  function metal(color: number, roughness: number, metalness = 0.35) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(material);
    return material;
  }

  function signal(color: number) {
    const material = new THREE.MeshBasicMaterial({ color });
    materials.add(material);
    return material;
  }

  function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, material);
    result.position.set(x, y, z);
    parent.add(result);
    return result;
  }

  function box(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number) {
    return mesh(parent, new THREE.BoxGeometry(width, height, depth), material, x, y, z);
  }

  function canvasMap(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d')!);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    maps.add(map);
    return map;
  }

  const graphite = metal(0x343c43, 0.58);
  const steel = metal(0x819095, 0.42);
  const shell = metal(0xbfcfd2, 0.44, 0.18);
  const rubber = metal(0x20252b, 0.92, 0);
  const lens = metal(0x142d35, 0.25, 0.28);
  const cyan = signal(0x92e9de);
  const amber = signal(0xeac18b);
  const vermilion = signal(0xb34f37);

  const kiosk = new THREE.Group();
  kiosk.position.set(28.55, 0.32, 275.4);
  kiosk.rotation.y = 0.38;
  root.add(kiosk);
  box(kiosk, steel, 0, 0.06, 0, 1.15, 0.12, 0.64);
  box(kiosk, graphite, 0, 0.64, 0, 0.34, 1.16, 0.32);
  box(kiosk, shell, 0, 1.75, 0, 1.32, 1.55, 0.34);
  box(kiosk, rubber, 0, 1.75, 0.18, 1.2, 1.42, 0.07);
  box(kiosk, graphite, 0, 2.53, 0, 1.45, 0.12, 0.48);
  box(kiosk, cyan, 0, 2.53, 0.25, 1.23, 0.02, 0.02);

  const routeMap = canvasMap(384, 448, g => {
    g.fillStyle = '#101b24';
    g.fillRect(0, 0, 384, 448);
    g.fillStyle = '#29424b';
    g.fillRect(0, 0, 384, 8);
    g.font = 'bold 42px sans-serif';
    g.fillStyle = '#d0ebe8';
    g.fillText('AEROLINK', 25, 67);
    g.font = 'bold 37px monospace';
    g.fillStyle = '#8ee2d4';
    g.fillText('06', 299, 65);
    g.fillStyle = '#91abae';
    g.font = '22px sans-serif';
    g.fillText('MARKET INTERCHANGE', 27, 105);
    g.strokeStyle = '#384f57';
    g.lineWidth = 2;
    for (let x = 32; x < 360; x += 38) {
      g.beginPath();
      g.moveTo(x, 137);
      g.lineTo(x, 331);
      g.stroke();
    }
    for (let y = 140; y < 339; y += 38) {
      g.beginPath();
      g.moveTo(30, y);
      g.lineTo(356, y);
      g.stroke();
    }
    g.strokeStyle = '#8ee2d4';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(46, 277);
    g.lineTo(132, 277);
    g.lineTo(197, 205);
    g.lineTo(330, 205);
    g.stroke();
    for (const [x, y] of [[46, 277], [132, 277], [197, 205], [330, 205]]) {
      g.beginPath();
      g.arc(x, y, x === 197 ? 11 : 5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d0ebe8';
    g.font = 'bold 26px sans-serif';
    g.fillText('PLATFORM', 25, 392);
    g.font = 'bold 43px sans-serif';
    g.fillText('↖', 301, 400);
  });
  const screen = new THREE.MeshBasicMaterial({ map: routeMap });
  materials.add(screen);
  mesh(kiosk, new THREE.PlaneGeometry(1.1, 1.29), screen, 0, 1.75, 0.221);

  const beacons: THREE.Mesh[] = [];
  for (const x of [29.2, 30.9]) {
    box(root, graphite, x, 0.66, 277.48, 0.15, 0.68, 0.16);
    box(root, steel, x, 1.13, 277.48, 0.19, 0.27, 0.2);
    beacons.push(box(root, cyan, x, 1.13, 277.6, 0.09, 0.19, 0.05));
  }
  for (let i = 0; i < 5; i++) {
    box(root, steel, 28.9 + i * 0.5, 0.325, 277.82, 0.29, 0.015, 0.17);
    box(root, i % 2 ? amber : cyan, 28.9 + i * 0.5, 0.338, 277.82, 0.14, 0.015, 0.035);
  }

  const robot = new THREE.Group();
  robot.name = 'Autonomous courier';
  root.add(robot);
  const footprint = new THREE.Shape();
  footprint.moveTo(-0.42, -0.62);
  footprint.lineTo(0.42, -0.62);
  footprint.lineTo(0.52, -0.5);
  footprint.lineTo(0.52, 0.56);
  footprint.lineTo(0.38, 0.7);
  footprint.lineTo(-0.38, 0.7);
  footprint.lineTo(-0.52, 0.56);
  footprint.lineTo(-0.52, -0.5);
  footprint.closePath();
  const chassis = new THREE.ExtrudeGeometry(footprint, { depth: 0.34, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 2, steps: 1 });
  chassis.rotateX(-Math.PI / 2);
  mesh(robot, chassis, shell, 0, 0.26, 0);
  box(robot, graphite, 0, 0.71, 0.16, 0.86, 0.19, 0.83);
  box(robot, steel, 0, 0.827, 0.16, 0.83, 0.05, 0.8);
  box(robot, lens, 0, 0.47, 0.72, 0.58, 0.18, 0.085);
  box(robot, cyan, 0, 0.47, 0.774, 0.31, 0.025, 0.017);
  box(robot, vermilion, 0, 0.38, -0.71, 0.38, 0.04, 0.025);
  for (const x of [-0.46, 0.46]) {
    box(robot, graphite, x, 0.54, 0.05, 0.16, 0.11, 1.12);
    box(robot, amber, x, 0.58, -0.41, 0.13, 0.035, 0.085);
  }
  const wheels: THREE.Group[] = [];
  const tire = new THREE.CylinderGeometry(0.19, 0.19, 0.15, 12).rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6).rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const z of [-0.42, 0.43]) {
      const wheel = new THREE.Group();
      wheel.position.set(side * 0.55, 0.19, z);
      robot.add(wheel);
      wheels.push(wheel);
      mesh(wheel, tire, rubber, 0, 0, 0);
      mesh(wheel, hub, steel, side * 0.08, 0, 0);
      box(wheel, graphite, side * 0.1, 0, 0, 0.02, 0.12, 0.025);
    }
  }

  const shadowMap = canvasMap(64, 64, g => {
    const falloff = g.createRadialGradient(32, 32, 3, 32, 32, 32);
    falloff.addColorStop(0, '#040608ca');
    falloff.addColorStop(1, '#04060800');
    g.fillStyle = falloff;
    g.fillRect(0, 0, 64, 64);
  });
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false });
  materials.add(shadowMaterial);
  mesh(robot, new THREE.PlaneGeometry(1.86, 2.24).rotateX(-Math.PI / 2), shadowMaterial, 0, 0.007, 0);

  const route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(22.9, 0.32, 277.13),
    new THREE.Vector3(25.7, 0.32, 277.01),
    new THREE.Vector3(27.0, 0.32, 276.36),
    new THREE.Vector3(23.8, 0.32, 275.78),
    new THREE.Vector3(21.65, 0.32, 276.34),
  ], true);
  const position = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const speed = 1.35;
  const length = route.getLength();

  function update(time: number): void {
    const distance = time * speed;
    const fraction = THREE.MathUtils.euclideanModulo(distance / length, 1);
    route.getPointAt(fraction, position);
    route.getTangentAt(fraction, heading);
    robot.position.copy(position);
    robot.rotation.y = Math.atan2(heading.x, heading.z);
    for (const wheel of wheels) wheel.rotation.x = distance / 0.19;
    for (const beacon of beacons) beacon.visible = (time % 4) < 3.4;
  }

  update(0);
  return {
    root,
    update,
    colliders: [{ minX: 27.85, maxX: 29.25, minZ: 274.95, maxZ: 275.9 }],
    dispose() {
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      maps.forEach(map => map.dispose());
    },
  };
}
