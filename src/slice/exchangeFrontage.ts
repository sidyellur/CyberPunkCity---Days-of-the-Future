import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ExchangeBuilding = 'works' | 'telemetry';

export function createExchangeFrontage() {
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const material = (settings: THREE.MeshStandardMaterialParameters) => {
    const surface = new THREE.MeshStandardMaterial(settings);
    materials.push(surface);
    return surface;
  };
  const texture = (width: number, height: number, paint: (g: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d')!);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    textures.push(map);
    return map;
  };

  const concreteMap = texture(512, 256, g => {
    let seed = 2250;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    g.fillStyle = '#a49c8e';
    g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 2300; i++) {
      const x = random() * 512;
      g.fillStyle = i % 3 ? '#3b302315' : '#fff3da18';
      g.fillRect(x, random() * 256, 1 + random() * 4, 1 + random() * 20);
    }
    for (const x of [0, 170, 341]) {
      g.fillStyle = '#3c352a60';
      g.fillRect(x, 0, 2, 256);
      g.fillRect(x + 13, 20, 4, 4);
      g.fillRect(x + 13, 228, 4, 4);
    }
  });
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  const concrete = material({ color: 0xa89d8e, map: concreteMap, roughness: 0.87 });
  const metal = material({ color: 0x4d6874, roughness: 0.48, metalness: 0.38 });
  const trim = material({ color: 0x5a5148, roughness: 0.68, metalness: 0.26 });
  const glass = material({ color: 0x253841, roughness: 0.23, metalness: 0.28 });
  const office = material({ color: 0x9ca5a1, emissive: 0x9ecad6, emissiveIntensity: 0.36, roughness: 0.27 });
  const occupied = material({ color: 0xb5a08b, emissive: 0xe8a46c, emissiveIntensity: 0.46, roughness: 0.25 });
  const strip = material({ color: 0xb5d5d5, emissive: 0xa3e5df, emissiveIntensity: 1.15 });
  const signMap = texture(512, 384, g => {
    g.fillStyle = '#18343c';
    g.fillRect(0, 0, 512, 384);
    const grad = g.createLinearGradient(0, 0, 500, 384);
    grad.addColorStop(0, '#172c35');
    grad.addColorStop(1, '#436c64');
    g.fillStyle = grad;
    g.fillRect(8, 8, 496, 368);
    g.fillStyle = '#e1c49f';
    g.font = 'bold 48px sans-serif';
    g.fillText('DISTRICT 07', 36, 69);
    g.fillStyle = '#d8ebd9';
    g.font = 'bold 63px sans-serif';
    g.fillText('CIVIC', 36, 157);
    g.fillText('WATER', 36, 229);
    g.fillStyle = '#99cac0';
    g.font = '23px monospace';
    g.fillText('RAIN TO RESERVE', 38, 271);
    g.strokeStyle = '#c2dfca';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(38, 338);
    g.lineTo(126, 338);
    g.lineTo(180, 308);
    g.lineTo(290, 308);
    g.lineTo(354, 345);
    g.lineTo(468, 345);
    g.stroke();
  });
  const sign = material({ map: signMap, emissiveMap: signMap, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.7 });

  function detail(group: THREE.Group, kind: ExchangeBuilding, x: number, z: number, width: number, depth: number, scale: number): void {
    const works = kind === 'works';
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const box = (surface: THREE.Material, bx: number, y: number, bz: number, w: number, h: number, d: number) => {
      const geometry = new THREE.BoxGeometry(w, h, d).translate(bx, y, bz);
      const batch = batches.get(surface);
      if (batch) batch.push(geometry); else batches.set(surface, [geometry]);
    };
    const front = z + depth / 2;
    const side = works ? 1 : -1;
    const street = x + side * width / 2;
    const height = works ? 65 : 91;
    const skin = works ? concrete : metal;
    // Thick corner piers, projecting floor plates, and deep window bays.
    box(skin, x, height / 2, front + 0.09, width, height, 0.22);
    box(skin, street, height / 2, z, 0.26, height, depth);
    for (let floor = 0; floor < (works ? 12 : 16); floor++) {
      const y = 5 + floor * 5;
      box(works ? trim : metal, x, y - 1.9, front + 0.4, width, 0.32, 0.85);
      box(works ? trim : metal, street + side * 0.32, y - 1.9, z, 0.77, 0.32, depth);
      for (let bay = 0; bay < 5; bay++) {
        const offset = (bay - 2) * (width / 5.3);
        const window = (floor * 13 + bay * 17) % 9 < 3 ? (works ? occupied : office) : glass;
        box(trim, x + offset, y, front + 0.25, 5.45, 3.05, 0.35);
        box(window, x + offset, y, front + 0.45, works ? 4.28 : 4.94, 2.48, 0.14);
        box(trim, x + offset, y, front + 0.57, 0.16, 2.48, 0.18);
        box(window, street + side * 0.24, y, z + offset, 0.22, 2.48, 4.35);
      }
    }
    for (const offset of [-0.45, -0.24, 0, 0.24, 0.45]) {
      box(skin, x + width * offset, height / 2, front + 0.62, works ? 0.85 : 0.38, height, works ? 1.13 : 0.89);
    }

    if (works) {
      box(trim, x, 29, front + 0.8, 17.3, 15.2, 1.1);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), sign);
      panel.position.set(x, 29, front + 1.38);
      group.add(panel);
      for (const y of [15, 47, 61]) {
        box(concrete, x, y, front + 1.6, width - 1.2, 0.7, 3.8);
        box(trim, x, y + 1.02, front + 3.35, width - 2, 0.67, 0.17);
      }
    } else {
      for (const y of [19, 44, 71]) {
        box(metal, street - 1.1, y, z, 5.9, 3.8, 13);
        box(glass, street - 4.1, y + 0.05, z, 0.13, 2.7, 11.6);
        box(strip, street - 4.24, y - 1.35, z, 0.11, 0.12, 10.8);
      }
      for (const offset of [-0.36, 0.36]) {
        box(metal, x + width * offset, 55, front + 1.02, 1.15, 72, 1.29);
        box(strip, x + width * offset, 51, front + 1.71, 0.12, 31, 0.11);
      }
    }
    const upperX = x + (works ? -8 : 7);
    const upperZ = z - 8 + 29 / 2;
    const upperHeight = (works ? 23 : 86) * scale;
    const upperWidth = works ? 31 : 34;
    for (let y = height + 3.4, floor = 0; y < height + upperHeight - 2; y += 5.1, floor++) {
      box(trim, upperX, y - 1.6, upperZ + 0.3, upperWidth, 0.22, 0.62);
      for (let bay = 0; bay < 6; bay++) {
        const bx = upperX + (bay - 2.5) * 4.9;
        const lit = (bay * 7 + floor * 19) % 11 < 3;
        box(lit ? (works ? occupied : office) : glass, bx, y, upperZ + 0.18, works ? 2.15 : 3.72, 2.1, 0.39);
      }
    }
    for (const [surface, batch] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(batch), surface);
      mesh.castShadow = surface === skin || surface === trim;
      mesh.receiveShadow = true;
      group.add(mesh);
      batch.forEach(geometry => geometry.dispose());
    }
  }

  return { concrete, metal, detail, dispose() {
    materials.forEach(surface => surface.dispose());
    textures.forEach(map => map.dispose());
  } };
}

export function createExchangeLights(shadows: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Meridian Exchange practical lighting';
  const key = new THREE.SpotLight(0xffc8a1, 8100, 104, 0.54, 0.52, 2);
  key.position.set(112, 24, 284);
  key.target.position.set(85, 27, 262);
  key.castShadow = shadows;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 87;
  key.shadow.normalBias = 0.18;
  const canopy = new THREE.PointLight(0x8cdce0, 860, 64, 2);
  canopy.position.set(123, 28, 278);
  const entrance = new THREE.PointLight(0xffbd85, 380, 28, 2);
  entrance.position.set(120, 6, 289);
  group.add(key, key.target, canopy, entrance);
  return group;
}
