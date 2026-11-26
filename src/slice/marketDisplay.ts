import * as THREE from 'three';

const WIDTH = 768;
const HEIGHT = 288;

export function createMarketDisplay() {
  const root = new THREE.Group();
  root.name = 'Night Loop market display';
  root.position.set(14, 10.65, 274.67);

  const face = document.createElement('canvas');
  face.width = WIDTH;
  face.height = HEIGHT;
  const g = face.getContext('2d')!;
  const displayMap = new THREE.CanvasTexture(face);
  displayMap.colorSpace = THREE.SRGBColorSpace;
  displayMap.anisotropy = 8;

  const frame = new THREE.MeshStandardMaterial({ color: 0x353e48, roughness: 0.52, metalness: 0.55 });
  const rack = new THREE.MeshStandardMaterial({ color: 0x60676c, roughness: 0.73, metalness: 0.22 });
  const status = new THREE.MeshStandardMaterial({ color: 0x9debc9, emissive: 0x63e3b3, emissiveIntensity: 1.3 });
  const screen = new THREE.MeshBasicMaterial({ map: displayMap });

  function box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    root.add(mesh);
  }

  for (const x of [-5.9, 5.9]) {
    box(rack, 0.25, 5.4, 0.39, x, -1.1, -0.41);
    for (const y of [-1.95, 1.7]) box(frame, 0.42, 0.23, 0.87, x, y, -0.27);
    box(status, 0.24, 0.06, 0.14, x, -2.55, 0);
  }
  box(frame, 13.75, 5.26, 0.55, 0, 0, 0);
  box(rack, 14.12, 0.15, 0.7, 0, 2.61, 0.02);
  for (let i = 0; i < 10; i++) {
    box(rack, 0.1, 0.14, 0.13, 4.65 + i * 0.18, -2.49, 0.28);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(13.45, 5.04), screen);
  panel.position.z = 0.28;
  root.add(panel);

  function stroke(color: string, points: readonly (readonly [number, number])[], width = 2): void {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    points.forEach(([x, y], index) => index ? g.lineTo(x, y) : g.moveTo(x, y));
    g.stroke();
  }

  function paint(time: number): void {
    const back = g.createLinearGradient(0, 0, WIDTH, HEIGHT);
    back.addColorStop(0, '#0c262e');
    back.addColorStop(1, '#07171f');
    g.fillStyle = back;
    g.fillRect(0, 0, WIDTH, HEIGHT);

    for (let y = 0; y < HEIGHT; y += 5) {
      g.fillStyle = '#06111350';
      g.fillRect(0, y, WIDTH, 1);
    }
    g.fillStyle = '#16343a';
    g.fillRect(17, 54, 734, 2);
    g.fillRect(17, 229, 734, 2);
    g.fillRect(428, 69, 2, 144);
    stroke('#58afa0', [[18, 96], [18, 74], [42, 74]], 3);
    stroke('#58afa0', [[748, 187], [748, 209], [724, 209]], 3);

    g.fillStyle = '#80ceb7';
    g.font = 'bold 19px monospace';
    g.fillText('CIVIC MESH  /  DISTRICT 07', 25, 38);
    g.fillStyle = '#e0b068';
    g.fillText('2250', 686, 38);

    g.fillStyle = '#c6e6dd';
    g.font = 'bold 53px sans-serif';
    g.fillText('NIGHT LOOP', 34, 133);
    g.fillStyle = '#96cfc4';
    g.font = 'bold 21px monospace';
    g.fillText('AEROLINK 06  /  PLATFORM 02', 36, 176);
    g.fillStyle = '#465e62';
    g.font = '16px monospace';
    g.fillText('MARKET  /  RIVER TERMINAL', 36, 203);

    const route: [number, number][] = [[470, 178], [528, 178], [558, 149], [638, 149], [670, 113], [726, 113]];
    stroke('#38766e', route, 4);
    for (const [x, y] of route) {
      g.fillStyle = '#13353a';
      g.fillRect(x - 5, y - 5, 10, 10);
      g.strokeStyle = '#77d2b7';
      g.lineWidth = 2;
      g.strokeRect(x - 5, y - 5, 10, 10);
    }
    const progress = (time % 14) / 14 * (route.length - 1);
    const segment = Math.floor(progress);
    const fraction = progress - segment;
    const [fromX, fromY] = route[segment];
    const [toX, toY] = route[segment + 1];
    const x = fromX + (toX - fromX) * fraction;
    const y = fromY + (toY - fromY) * fraction;
    g.fillStyle = '#ffd184';
    g.beginPath();
    g.arc(x, y, 5.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#80ceb7';
    g.font = 'bold 18px monospace';
    g.fillText('MAGLEV STATUS', 466, 93);

    g.fillStyle = '#345b5c';
    for (let i = 0; i < 17; i++) g.fillRect(646 + i * 6, 249, i % 3 ? 2 : 4, 17);
    g.fillStyle = '#8ebeb2';
    g.font = '17px monospace';
    g.fillText('RAIN RECLAMATION ACTIVE   /   AIR  18 AQI', 30, 263);
    displayMap.needsUpdate = true;
  }

  paint(0);
  let lastFrame = -1;
  return {
    root,
    update(time: number) {
      const frame = Math.floor(time * 5);
      if (frame === lastFrame) return;
      lastFrame = frame;
      paint(frame / 5);
    },
    dispose() {
      root.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      displayMap.dispose();
      for (const material of [frame, rack, status, screen]) material.dispose();
    },
  };
}
