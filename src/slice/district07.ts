import { createExchangeFrontage, type ExchangeBuilding } from './exchangeFrontage';
// Procedural district: every tower, sign and street is generated from a seed and an intent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStreetCorner, STREET_CORNER } from './street';
import { DistrictProfile, PROFILES, profileAt, profileHeight, profileLots } from './districtProfiles';
import { CANAL_COLUMN } from './canal';
import { createArcology } from './arcology';
import { createSkyHarbor } from './skyHarbor';
import { createFilterGardens } from './filterGardens';
import { createTerraceBlock } from './terraceBlocks';
import { clad } from './cladding';
import { createNexus } from './nexus';

export type { DistrictProfile } from './districtProfiles';

export const BLOCKS = 9;
export const BLOCK = 64;
export const STREET = 18;
export const PITCH = BLOCK + STREET;
export const EXTENT = BLOCKS * PITCH;
export const ORIGIN = -EXTENT / 2;
export const GROUND_TILES = 78;

export type IntentKey = 'efficient' | 'balanced' | 'green';
export interface Intent {
  label: string;
  blurb: string;
  height: number;
  park: number;
  signs: number;
  palette: number[];
}

const CYAN = 0x2ee6ff, MAGENTA = 0xff3d8b, AMBER = 0xffb347, VIOLET = 0xa06bff, GREEN = 0x4dffa6, ICE = 0xbfe9ff;

export const INTENTS: Record<IntentKey, Intent> = {
  efficient: {
    label: 'Dense', blurb: 'Maximum floor area. Taller, tighter, colder.',
    height: 1.3, park: 0, signs: 0.75, palette: [CYAN, ICE, AMBER, CYAN],
  },
  balanced: {
    label: 'Balanced', blurb: 'Commerce, housing and light in equal measure.',
    height: 1, park: 0.07, signs: 1, palette: [CYAN, MAGENTA, AMBER, VIOLET],
  },
  green: {
    label: 'Green', blurb: 'Lower skyline, open ground, room to breathe.',
    height: 0.68, park: 0.3, signs: 0.5, palette: [GREEN, CYAN, AMBER, GREEN],
  },
};

export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Textures (all drawn in code) ----------

const COLS = 8, ROWS = 16, CELL = 3.6;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function windowTexture(rng: () => number, hues: string[], lit: number): THREE.CanvasTexture {
  const t = canvasTexture(256, 512, g => {
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, 256, 512);
    for (let r = 0; r < ROWS; r++) {
      const floorLit = rng() < 0.12; // a whole floor working late
      for (let c = 0; c < COLS; c++) {
        const on = floorLit ? rng() < 0.9 : rng() < lit;
        if (on) {
          const hue = hues[rng() < 0.85 ? 0 : 1 + Math.floor(rng() * (hues.length - 1))];
          g.globalAlpha = 0.35 + rng() * 0.65;
          g.fillStyle = hue;
        } else {
          g.globalAlpha = 1;
          g.fillStyle = '#0a0e17';
        }
        g.fillRect(c * 32 + 6, r * 32 + 7, 21, 19);
      }
    }
    g.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function frontageMaterial(residential: boolean): THREE.MeshStandardMaterial {
  const rng = mulberry(residential ? 2250 : 2251);
  const map = canvasTexture(256, 512, g => {
    g.fillStyle = residential ? '#686260' : '#293940';
    g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 9200; i++) {
      g.fillStyle = i % 2 ? '#22212923' : '#b9bdc417';
      g.fillRect(rng() * 256, rng() * 512, 1 + rng() * 3, 1 + rng() * 5);
    }
  });
  const emissiveMap = canvasTexture(256, 512, g => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 512);
  });
  const body = map.image.getContext('2d') as CanvasRenderingContext2D;
  const lit = emissiveMap.image.getContext('2d') as CanvasRenderingContext2D;
  for (let floor = 0; floor < ROWS; floor++) {
    const y = floor * 32;
    body.fillStyle = residential ? '#514b47' : '#1a282f';
    body.fillRect(0, y, 256, 2);
    for (let column = 0; column < COLS; column++) {
      const x = column * 32;
      const width = residential ? (column % 4 === 2 ? 10 : 17) : 26;
      const wx = x + (32 - width) / 2;
      const wy = y + (residential ? 6 : 4);
      const height = residential ? 18 : 24;
      body.fillStyle = residential ? '#827970' : '#40555b';
      body.fillRect(wx - 2, wy - 2, width + 4, height + 4);
      body.fillStyle = '#10191e';
      body.fillRect(wx, wy, width, height);
      if (rng() < (residential ? 0.33 : 0.48)) {
        lit.fillStyle = residential ? (rng() > 0.24 ? '#e59b54' : '#b3bbcc') : '#8bc4bf';
        lit.fillRect(wx + 1, wy + 1, width - 2, height - 2);
        lit.clearRect(wx + (width >> 1), wy + 1, 1, height - 2);
        if (residential) {
          lit.fillStyle = '#3e302c';
          lit.fillRect(wx + 1, wy + 2, width - 2, 2 + rng() * 11);
        }
      }
    }
  }
  for (const t of [map, emissiveMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: 0xffffff, emissiveIntensity: residential ? 0.74 : 0.58,
    roughness: residential ? 0.86 : 0.39, metalness: residential ? 0.04 : 0.42,
  });
}

const DISTRICT_SURFACES: Record<DistrictProfile, {
  body: [string, string]; frame: string; window: string; glow: [string, string];
  lit: number; roughness: number; metalness: number;
}> = {
  transit: { body: ['#466073', '#384f62'], frame: '#658095', window: '#172b3b', glow: ['#94c2bf', '#739bb4'], lit: 0.39, roughness: 0.36, metalness: 0.36 },
  market: { body: ['#776255', '#705055'], frame: '#988279', window: '#2a1d22', glow: ['#eeac72', '#e89991'], lit: 0.43, roughness: 0.88, metalness: 0.03 },
  industrial: { body: ['#626765', '#5a5350'], frame: '#777d73', window: '#303530', glow: ['#e7b17c', '#a3b29f'], lit: 0.29, roughness: 0.75, metalness: 0.24 },
  residential: { body: ['#616f6a', '#67655c'], frame: '#809080', window: '#242f30', glow: ['#e2be85', '#91b8af'], lit: 0.35, roughness: 0.83, metalness: 0.09 },
};

function districtMaterial(profile: DistrictProfile, variant: 0 | 1): THREE.MeshStandardMaterial {
  const surface = DISTRICT_SURFACES[profile];
  const rng = mulberry(77 * profile.length + variant * 419);
  const map = canvasTexture(256, 512, g => {
    g.fillStyle = surface.body[variant];
    g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 1300; i++) {
      g.fillStyle = i % 2 ? '#10141a25' : '#ccd7d41a';
      g.fillRect(rng() * 256, rng() * 512, 1 + rng() * 2, 2 + rng() * 6);
    }
  });
  const emissiveMap = canvasTexture(256, 512, g => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 512);
  });
  const roughnessMap = canvasTexture(256, 512, g => {
    const wall = Math.round(158 + 87 * surface.roughness);
    g.fillStyle = `rgb(${wall}, ${wall}, ${wall})`;
    g.fillRect(0, 0, 256, 512);
  });
  roughnessMap.colorSpace = THREE.NoColorSpace;
  const finish = roughnessMap.image.getContext('2d') as CanvasRenderingContext2D;
  const body = map.image.getContext('2d') as CanvasRenderingContext2D;
  const lights = emissiveMap.image.getContext('2d') as CanvasRenderingContext2D;
  for (let row = 0; row < ROWS; row++) {
    const y = row * 32;
    body.fillStyle = surface.frame;
    body.fillRect(0, y, 256, profile === 'residential' ? 3 : 1);
    for (let column = 0; column < COLS; column++) {
      const x = column * 32;
      if (profile === 'industrial') {
        for (let rib = 1; rib < 32; rib += 5) body.fillRect(x + rib, y + 1, 1, 31);
        if (row % 3 !== 1) continue;
      }
      const transit = profile === 'transit';
      const industrial = profile === 'industrial';
      const residential = profile === 'residential';
      const width = transit ? 30 : industrial ? 25 : residential ? 21 : 13;
      const height = transit ? 22 : industrial ? 8 : residential ? 18 : 21;
      const wx = x + Math.floor((32 - width) / 2);
      const wy = y + (industrial ? 6 : 5);
      body.fillStyle = surface.frame;
      body.fillRect(wx - 1, wy - 1, width + 2, height + 2);
      const pane = body.createLinearGradient(0, wy, 0, wy + height);
      pane.addColorStop(0, '#141f27');
      pane.addColorStop(0.46, surface.window);
      pane.addColorStop(1, transit ? '#45606a' : '#384348');
      body.fillStyle = pane;
      body.fillRect(wx, wy, width, height);
      finish.fillStyle = '#454545';
      finish.fillRect(wx, wy, width, height);
      if (rng() < surface.lit) {
        lights.fillStyle = surface.glow[rng() < 0.81 ? variant : 1 - variant];
        lights.globalAlpha = 0.18 + rng() ** 1.6 * 0.76;
        lights.fillRect(wx + 1, wy + 1, width - 2, height - 2);
        lights.globalAlpha = 1;
      }
      if (transit || industrial || residential) {
        const bar = wx + Math.floor(width / 2);
        body.fillStyle = surface.frame;
        body.fillRect(bar, wy, 1, height);
        lights.fillStyle = '#000';
        lights.fillRect(bar, wy, 1, height);
        finish.fillStyle = '#bcbcbc';
        finish.fillRect(bar, wy, 1, height);
      }
      if (residential && column % 2 === variant) {
        body.fillStyle = '#353f3a';
        body.fillRect(wx - 3, wy + height - 4, width + 6, 6);
        lights.fillStyle = '#000';
        lights.fillRect(wx - 3, wy + height - 4, width + 6, 4);
      }
    }
  }
  for (const texture of [map, emissiveMap, roughnessMap]) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.95,
    roughnessMap, roughness: 1, metalness: surface.metalness,
  });
}

/** Signage in an invented script, so no real brand or language is implied. */
function signTexture(rng: () => number, color: string, vertical: boolean): THREE.CanvasTexture {
  const w = vertical ? 96 : 320, h = vertical ? 384 : 128;
  return canvasTexture(w, h, g => {
    g.fillStyle = 'rgba(4,6,12,0.82)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 5;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = color; g.lineCap = 'square';
    const n = vertical ? 5 : 6;
    const cell = vertical ? (h - 40) / n : (w - 40) / n;
    for (let i = 0; i < n; i++) {
      const ox = vertical ? 22 : 20 + i * cell + 6, oy = vertical ? 20 + i * cell + 6 : 24;
      const gw = vertical ? w - 44 : cell - 14, gh = vertical ? cell - 14 : h - 48;
      // Each glyph: a few strokes on a 3x4 lattice.
      g.lineWidth = 6;
      g.beginPath();
      const strokes = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < strokes; k++) {
        const x1 = Math.floor(rng() * 3) / 2, y1 = Math.floor(rng() * 4) / 3;
        const horizontal = rng() < 0.5;
        const x2 = horizontal ? Math.floor(rng() * 3) / 2 : x1, y2 = horizontal ? y1 : Math.floor(rng() * 4) / 3;
        g.moveTo(ox + x1 * gw, oy + y1 * gh); g.lineTo(ox + x2 * gw, oy + y2 * gh);
      }
      g.stroke();
      if (rng() < 0.3) g.fillRect(ox + gw * 0.35, oy + gh * 0.4, gw * 0.3, gh * 0.2);
    }
  });
}

function groundTexture(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const S = 1024, k = S / PITCH, half = (STREET / 2) * k;
  const paint = (glowOnly: boolean) => canvasTexture(S, S, g => {
    g.fillStyle = glowOnly ? '#000' : '#07080d';
    g.fillRect(0, 0, S, S);
    if (!glowOnly) {
      // The block interior (pavement) sits in the middle of the tile; streets wrap around its edges.
      g.fillStyle = '#0c0e16';
      g.fillRect(half, half, S - half * 2, S - half * 2);
      g.fillStyle = '#0a0b12';
      for (let i = 0; i < 400; i++) g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 5, 1);
    }
    // Kerb lines.
    g.strokeStyle = glowOnly ? 'rgba(46,230,255,0.55)' : 'rgba(46,230,255,0.4)';
    g.lineWidth = 2;
    g.strokeRect(half, half, S - half * 2, S - half * 2);
    // Dashed centre lines down both streets (the tile edges).
    g.strokeStyle = glowOnly ? 'rgba(255,179,71,0.8)' : 'rgba(255,179,71,0.6)';
    g.lineWidth = 3; g.setLineDash([26, 30]);
    for (const p of [0, S]) {
      g.beginPath(); g.moveTo(p, half); g.lineTo(p, S - half); g.stroke();
      g.beginPath(); g.moveTo(half, p); g.lineTo(S - half, p); g.stroke();
    }
    g.setLineDash([]);
    // Crosswalk bars at the corners.
    g.fillStyle = glowOnly ? 'rgba(220,235,255,0.35)' : 'rgba(220,235,255,0.3)';
    for (let i = 0; i < 6; i++) {
      const o = half + 8 + i * 9;
      g.fillRect(o, half - 30, 4, 22); g.fillRect(o, S - half + 8, 4, 22);
      g.fillRect(half - 30, o, 22, 4); g.fillRect(S - half + 8, o, 22, 4);
    }
    // Pools of lamplight on the pavement.
    for (const [lx, ly] of lampSpots()) {
      const x = (lx + PITCH / 2) * k, y = (ly + PITCH / 2) * k;
      const grad = g.createRadialGradient(x, y, 0, x, y, 9 * k);
      grad.addColorStop(0, glowOnly ? 'rgba(255,170,90,0.5)' : 'rgba(255,170,90,0.32)');
      grad.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = grad;
      g.fillRect(x - 9 * k, y - 9 * k, 18 * k, 18 * k);
    }
  });
  const map = paint(false), glow = paint(true);
  for (const t of [map, glow]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, glow };
}

/** Lamp positions within one block tile, relative to the block centre. */
export function lampSpots(): [number, number][] {
  const e = BLOCK / 2 - 1.2, out: [number, number][] = [];
  for (const t of [-20, 0, 20]) out.push([t, -e], [t, e], [-e, t], [e, t]);
  return out;
}

function glowSprite(): THREE.CanvasTexture {
  return canvasTexture(128, 128, g => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

export interface Shared {
  windows: THREE.MeshStandardMaterial[];
  market: THREE.MeshStandardMaterial;
  apartments: THREE.MeshStandardMaterial;
  facadeTrim: THREE.MeshStandardMaterial;
  districts: Record<DistrictProfile, THREE.MeshStandardMaterial[]>;
  neon: THREE.MeshBasicMaterial;
  signs: { mat: THREE.MeshBasicMaterial; vertical: boolean; color: number }[];
  ground: THREE.MeshStandardMaterial;
  park: THREE.MeshStandardMaterial;
  sprite: THREE.CanvasTexture;
}

export function createShared(): Shared {
  const rng = mulberry(77);
  const sets: [string[], number][] = [
    [['#ffd9a0', '#ffb86b', '#9fe9ff'], 0.42], // warm residential
    [['#bfe9ff', '#9fe9ff', '#ffffff'], 0.5], // cool offices
    [['#ff9cc4', '#ffd9a0', '#c9adff'], 0.36], // pink nightlife
    [['#c9adff', '#9fe9ff', '#ffd9a0'], 0.4], // violet
  ];
  const windows = sets.map(([hues, lit]) => {
    const map = windowTexture(rng, hues, lit);
    return new THREE.MeshStandardMaterial({
      color: 0x8890a8, map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 1.25, roughness: 0.5, metalness: 0.35,
    });
  });
  const signColors = [CYAN, MAGENTA, AMBER, GREEN, VIOLET, 0xff5a4d];
  const signs: Shared['signs'] = [];
  for (let i = 0; i < 12; i++) {
    const color = signColors[i % signColors.length];
    const vertical = i % 2 === 0;
    const map = signTexture(rng, '#' + color.toString(16).padStart(6, '0'), vertical);
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    mat.color.setScalar(1.7);
    signs.push({ mat, vertical, color });
  }
  const g = groundTexture();
  // The ground plane is GROUND_TILES tiles wide; half a tile of offset puts streets on the street lines.
  g.map.repeat.set(GROUND_TILES, GROUND_TILES);
  g.glow.repeat.copy(g.map.repeat);
  g.map.offset.set(0.5, 0.5); g.glow.offset.set(0.5, 0.5);
  const ground = new THREE.MeshStandardMaterial({
    map: g.map, emissive: 0xffffff, emissiveMap: g.glow, emissiveIntensity: 0.9, roughness: 0.74, metalness: 0.18,
  });
  // The dense road lighting belongs to District 07. Keep the outer service grid subdued.
  ground.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 districtXZ;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n districtXZ = position.xz;',
    );
    shader.fragmentShader = 'varying vec2 districtXZ;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float outerGrid = smoothstep(${EXTENT / 2}.0, ${EXTENT / 2 + PITCH}.0, max(abs(districtXZ.x), abs(districtXZ.y)));
        totalEmissiveRadiance *= mix(1.0, 0.10, outerGrid);
        diffuseColor.rgb *= mix(1.0, 0.42, outerGrid);`,
    );
  };
  return {
    windows, signs, ground, sprite: glowSprite(),
    park: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, emissive: 0x18291d, emissiveIntensity: 0.22 }),
    market: frontageMaterial(false), apartments: frontageMaterial(true),
    facadeTrim: clad(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.71, metalness: 0.16 })),
    districts: {
      transit: [districtMaterial('transit', 0), districtMaterial('transit', 1)],
      market: [districtMaterial('market', 0), districtMaterial('market', 1)],
      industrial: [districtMaterial('industrial', 0), districtMaterial('industrial', 1)],
      residential: [districtMaterial('residential', 0), districtMaterial('residential', 1)],
    },
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
}

// ---------- Geometry helpers ----------

/** A box whose side faces carry the window grid at a constant real-world window size. */
function windowBox(
  w: number, h: number, d: number, cx: number, y0: number, cz: number, uo: number, vo: number,
  [bay, floor]: readonly [number, number] = [CELL, CELL],
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) uv.setXY(k, 0.004, 0.004); // roofs sample the dark mullion
      else uv.setXY(k, uo + (uv.getX(k) * (f < 2 ? d : w)) / (bay * COLS), vo + (uv.getY(k) * h) / (floor * ROWS));
    }
  }
  g.translate(cx, y0 + h / 2, cz);
  return g;
}

function colorBox(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(x, y, z);
  return g;
}

function parkCourtyard(shared: Shared, x: number, z: number, w: number, d: number): THREE.Group {
  const lawn = new THREE.Color(0x223b2b);
  const walk = new THREE.Color(0x626565);
  const curb = new THREE.Color(0x424b45);
  const parts = [
    colorBox(w, 0.25, d, x, 0.10, z, curb),
    colorBox(w - 1, 0.10, d - 1, x, 0.27, z, lawn),
    colorBox(w - 1, 0.06, 2.6, x, 0.33, z, walk),
    colorBox(2.6, 0.06, d - 1, x, 0.34, z, walk),
  ];
  const group = new THREE.Group();
  group.add(new THREE.Mesh(mergeGeometries(parts), shared.park));
  parts.forEach(part => part.dispose());
  return group;
}

interface Section { w: number; d: number; cx: number; cz: number; y0: number; h: number }

function buildingSections(
  profile: DistrictProfile, height: number, x: number, z: number, w: number, d: number,
  rng: () => number, featured?: Structure['featured'],
): Section[] {
  if (featured) {
    const base = featured === 'market' ? 16 : 47;
    const terrace = (height - base) * 0.45;
    return [
      { w, d, cx: x, cz: z, y0: 0, h: base },
      { w: w * 0.85, d: d * 0.72, cx: x - 0.5, cz: z - 2, y0: base, h: terrace },
      { w: w * 0.66, d: d * 0.56, cx: x - 1.5, cz: z - 4, y0: base + terrace, h: height - base - terrace },
    ];
  }

  const shape = rng();
  if (profile === 'industrial') {
    if (shape < 0.28) return [{ w, d, cx: x, cz: z, y0: 0, h: height }];
    const base = height * 0.78;
    return [
      { w, d, cx: x, cz: z, y0: 0, h: base },
      { w: w * 0.76, d: d * 0.34, cx: x, cz: z - d * 0.11, y0: base, h: height - base },
    ];
  }

  if (profile === 'transit') {
    const podium = Math.min(22, height * 0.28);
    const cap = (height - podium) * (shape < 0.5 ? 0.14 : 0.25);
    const shaftScale = shape < 0.5 ? 0.67 : 0.79;
    const shift = (rng() - 0.5) * w * 0.14;
    return [
      { w, d, cx: x, cz: z, y0: 0, h: podium },
      { w: w * shaftScale, d: d * (1.45 - shaftScale), cx: x + shift, cz: z, y0: podium, h: height - podium - cap },
      { w: w * (shaftScale - 0.15), d: d * (1.38 - shaftScale), cx: x + shift, cz: z - d * 0.04, y0: height - cap, h: cap },
    ];
  }

  if (shape < 0.36 && height < 65) return [{ w, d, cx: x, cz: z, y0: 0, h: height }];
  const midrise = profile === 'market';
  const base = height * (midrise ? 0.74 : 0.63);
  return [
    { w, d, cx: x, cz: z, y0: 0, h: base },
    { w: w * (midrise ? 0.9 : 0.77), d: d * (midrise ? 0.89 : 0.82), cx: x, cz: z - d * 0.04, y0: base, h: height - base },
  ];
}

export interface Roof {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  profile: DistrictProfile;
}

export interface Structure {
  group: THREE.Group | null;
  holo: THREE.LineSegments | null;
  height: number;
  x: number;
  z: number;
  radius: number;
  dist: number;
  color: THREE.Color;
  start: number;
  rise: number;
  p: number;
  done: boolean;
  featured?: 'market' | 'apartments';
  galleryAnchor?: boolean;
  roof?: Roof;
  trees: [number, number]; // range in the tree instance buffer
}

export interface District {
  root: THREE.Group;
  structures: Structure[];
  spire: Structure;
  spireTop: number;
  decals: THREE.InstancedMesh;
  trees: THREE.InstancedMesh;
  treeBase: THREE.Matrix4[];
  tallest: number;
  dispose: () => void;
}

function buildTower(sections: Section[], rng: () => number, shared: Shared, bodyMat: THREE.Material, accent: THREE.Color, intent: Intent, detailedFrontage = false, profile?: DistrictProfile) {
  const body: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [], edges: THREE.BufferGeometry[] = [];
  const uo = Math.floor(rng() * COLS) / COLS, vo = Math.floor(rng() * ROWS) / ROWS;
  const trimStyle = profile ? PROFILES[profile] : undefined;
  const cell = detailedFrontage ? undefined : trimStyle?.cell;
  const fittings: THREE.BufferGeometry[] = [];
  const nearExchange = Math.hypot(sections[0].cx - 88, sections[0].cz - 204) < 270;
  const concrete = new THREE.Color(profile === 'market' ? 0x9f8c7a : 0x89928d);
  const coping = new THREE.Color(0x59676a);
  const bright = accent.clone().multiplyScalar(detailedFrontage ? 0.72 : trimStyle ? 0.65 + trimStyle.trim : 1.9);
  const group = new THREE.Group();
  sections.forEach((s, i) => {
    body.push(windowBox(s.w, s.h, s.d, s.cx, s.y0, s.cz, uo, vo, cell));
    edges.push(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.w, s.h, s.d)).translate(s.cx, s.y0 + s.h / 2, s.cz));
    const top = s.y0 + s.h;
    if (nearExchange && !detailedFrontage) {
      // Raised coping catches the low sun along the setbacks. Projecting blades
      // break the curtain wall into bays and shade the glazing underneath.
      for (const sign of [-1, 1]) {
        fittings.push(colorBox(s.w, 0.86, 0.52, s.cx, top + 0.42, s.cz + sign * (s.d / 2 - 0.26), coping));
        fittings.push(colorBox(0.52, 0.86, s.d - 1.04, s.cx + sign * (s.w / 2 - 0.26), top + 0.42, s.cz, coping));
      }
      if (profile === 'transit' || profile === 'market') {
        const bays = Math.max(2, Math.round(s.w / (profile === 'transit' ? 6 : 8)));
        for (let bay = 0; bay <= bays; bay++) {
          const x = s.cx - (s.w - 1) / 2 + bay * (s.w - 1) / bays;
          fittings.push(colorBox(0.55, s.h, 1.6, x, s.y0 + s.h / 2, s.cz + s.d / 2 + 0.58, concrete));
        }
        const endX = s.cx - s.w / 2;
        fittings.push(colorBox(1.2, s.h, s.d * 0.19, endX, s.y0 + s.h / 2, s.cz + s.d * 0.31, concrete));
      }
    }
    const trim = detailedFrontage ? 0.17 : trimStyle?.trim ?? 0.9;
    // A lit parapet around the top of each setback.
    if (rng() < (trimStyle ? 0.24 : 0.8) || i === sections.length - 1) {
      neon.push(colorBox(s.w + 0.6, trim, 0.5, s.cx, top, s.cz + s.d / 2, bright), colorBox(s.w + 0.6, trim, 0.5, s.cx, top, s.cz - s.d / 2, bright));
      neon.push(colorBox(0.5, trim, s.d + 0.6, s.cx + s.w / 2, top, s.cz, bright), colorBox(0.5, trim, s.d + 0.6, s.cx - s.w / 2, top, s.cz, bright));
    }
    // Vertical light seams on some corners.
    if (profile === 'transit' && rng() < 0.18) {
      for (const [sx, sz] of [[1, 1], [-1, -1]]) neon.push(colorBox(0.4, s.h, 0.4, s.cx + (sx * s.w) / 2, s.y0 + s.h / 2, s.cz + (sz * s.d) / 2, bright));
    }
  });
  const base = sections[0], last = sections[sections.length - 1];
  // Street-level shopfront band.
  const shop = new THREE.Color([MAGENTA, AMBER, CYAN, GREEN][Math.floor(rng() * 4)]).multiplyScalar(1.5);
  if (profile === 'market' && !detailedFrontage && rng() < 0.45) {
    neon.push(colorBox(base.w + 0.4, 0.17, 0.3, base.cx, 5.2, base.cz + base.d / 2, shop));
  }
  // Antenna.
  let height = last.y0 + last.h;
  if (rng() < (trimStyle?.antenna ?? 0.6) && (profile !== 'transit' || height > 62)) {
    const ah = 6 + rng() * 12;
    body.push(windowBox(0.8, ah, 0.8, last.cx, height, last.cz, 0.004, 0.004));
    neon.push(colorBox(1.6, 1.6, 1.6, last.cx, height + ah, last.cz, new THREE.Color(0xff3030).multiplyScalar(2.2)));
    height += ah;
  }
  const bodyMesh = new THREE.Mesh(mergeGeometries(body), bodyMat);
  const neonMesh = new THREE.Mesh(mergeGeometries(neon), shared.neon);
  group.add(bodyMesh, neonMesh);
  if (fittings.length) {
    group.add(new THREE.Mesh(mergeGeometries(fittings), shared.facadeTrim));
    fittings.forEach(part => part.dispose());
  }

  // Signs.
  const count = detailedFrontage ? 0 : Math.floor(rng() * 4.6 * intent.signs * (trimStyle?.signs ?? 1));
  for (let i = 0; i < count; i++) {
    const s = shared.signs[Math.floor(rng() * shared.signs.length)];
    const sec = rng() < 0.6 ? base : sections[Math.floor(rng() * sections.length)];
    const low = rng() < 0.5;
    const big = !low && sec.h > 40 && rng() < 0.5 ? 1.9 : 1;
    const sw = (s.vertical ? 5 + rng() * 3 : 14 + rng() * 10) * big;
    const sh = s.vertical ? sw * 4 : sw * 0.4;
    const y = low ? 8 + sh / 2 + rng() * 10 : sec.y0 + sec.h - sh / 2 - 3 - rng() * Math.max(0, sec.h - sh - 12) * 0.4;
    if (y - sh / 2 < sec.y0 + 4 && !low) continue;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), s.mat);
    const face = Math.floor(rng() * 4);
    const off = s.vertical ? 0.8 + sw / 2 : 0.6;
    if (face < 2) {
      const sign = face === 0 ? 1 : -1;
      const along = (rng() - 0.5) * Math.max(0, sec.w - sw - 2);
      mesh.position.set(sec.cx + along, y, sec.cz + sign * (sec.d / 2 + off));
      if (s.vertical) mesh.rotation.y = Math.PI / 2; else if (sign < 0) mesh.rotation.y = Math.PI;
    } else {
      const sign = face === 2 ? 1 : -1;
      const along = (rng() - 0.5) * Math.max(0, sec.d - sw - 2);
      mesh.position.set(sec.cx + sign * (sec.w / 2 + off), y, sec.cz + along);
      mesh.rotation.y = s.vertical ? 0 : (sign * Math.PI) / 2;
    }
    group.add(mesh);
  }

  const holoMat = new THREE.LineBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const holo = new THREE.LineSegments(mergeGeometries(edges), holoMat);
  return { group, holo, height };
}

function exchangeSections(kind: ExchangeBuilding, x: number, z: number, w: number, d: number, scale: number): Section[] {
  const works = kind === 'works';
  const base = works ? 65 : 91;
  return [
    { cx: x, cz: z, w, d, y0: 0, h: base },
    { cx: x + (works ? -8 : 7), cz: z - 8, w: works ? 31 : 34, d: 29, y0: base, h: (works ? 23 : 86) * scale },
    { cx: x + (works ? -12 : 12), cz: z - 11, w: works ? 14 : 19, d: 16, y0: base + (works ? 23 : 86) * scale, h: (works ? 10 : 31) * scale },
  ];
}

// Residential superblocks flanking the canal and the exchange.
const terraceLots = [[3, 6], [5, 6], [7, 7], [1, 2], [4, 3], [6, 2], [3, 0]];

export function generateDistrict(seed: number, intentKey: IntentKey, shared: Shared): District {
  const rng = mulberry(seed);
  const intent = INTENTS[intentKey];
  const root = new THREE.Group();
  const structures: Structure[] = [];
  const streetCorner = createStreetCorner();
  const exchange = createExchangeFrontage();
  const civicBuildings: { root: THREE.Group; dispose(): void }[] = [];
  const mid = (BLOCKS - 1) / 2;
  const treeMats: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const m = new THREE.Matrix4();

  for (let bz = 0; bz < BLOCKS; bz++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      if (bx === CANAL_COLUMN || (bx === mid && bz === mid)) continue;
      const cx = ORIGIN + (bx + 0.5) * PITCH, cz = ORIGIN + (bz + 0.5) * PITCH;
      const arcology = bx === 5 && bz === 7;
      const harbor = bx === 6 && bz === 7;
      const gardens = bx === 4 && bz === 6;
      const terrace = terraceLots.findIndex(([x, z]) => x === bx && z === bz);
      if (arcology || harbor || gardens || terrace !== -1) {
        const lotSeed = seed + bx * 17 + bz * 101;
        const size = Math.min(130, Math.max(55, (78 + 30 * mulberry(lotSeed)()) * intent.height));
        const building = arcology ? createArcology() : harbor ? createSkyHarbor()
          : gardens ? createFilterGardens() : createTerraceBlock(lotSeed, size);
        if (terrace !== -1) building.root.rotation.y = (terrace % 4) * Math.PI / 2;
        building.root.position.set(cx, 0, cz);
        civicBuildings.push(building);
        const height = new THREE.Box3().setFromObject(building.root).max.y;
        structures.push({
          group: building.root, holo: null, height, x: cx, z: cz, radius: 29, dist: Math.hypot(cx, cz),
          color: new THREE.Color(gardens ? 0x699b8c : harbor ? 0x739bab : 0xb99c7b),
          start: 0, rise: 0, p: 0, done: false, trees: [0, 0], galleryAnchor: arcology || harbor,
        });
        continue;
      }
      const detailedFrontage = bx === STREET_CORNER.blockX && bz === STREET_CORNER.blockZ;
      const landmark: ExchangeBuilding | undefined = bz === 5 && bx === 5 ? 'works'
        : bz === 5 && bx === 6 ? 'telemetry' : undefined;
      const profile = profileAt(bx, bz);
      const style = PROFILES[profile];
      const lots = detailedFrontage
        ? [[cx - 14, cz + 8, 25, 40], [cx + 14, cz + 8, 25, 40]]
        : landmark ? [[cx, cz, 50, 47]]
        : profileLots(profile, cx, cz, BLOCK - 8, rng);
      if (detailedFrontage) streetCorner.pavement(root, cx, cz);
      for (const [lx, lz, lw, ld] of lots) {
        const dist = Math.hypot(lx, lz);
        const intentColor = new THREE.Color(intent.palette[(bx + bz) % intent.palette.length]);
        const accent = new THREE.Color(style.palette[Math.floor(rng() * style.palette.length)])
          .lerp(intentColor, detailedFrontage ? 0.75 : 0.2);
        const base: Omit<Structure, 'group' | 'holo' | 'height' | 'trees'> = {
          x: lx, z: lz, radius: Math.max(lw, ld) / 2, dist, color: accent, start: 0, rise: 0, p: 0, done: false,
        };
        const greenPocket = profile === 'residential' && intentKey !== 'efficient' && (bx + bz * 3) % 7 === 0;
        const parkChance = (greenPocket ? 0.19 : 0) + intent.park * style.park;
        if (!detailedFrontage && !landmark && rng() < parkChance) {
          const first = treeMats.length;
          const n = Math.round((lw * ld) / 55);
          for (let i = 0; i < n; i++) {
            const s = 2.2 + rng() * 2.6;
            const sideX = i % 2 ? -1 : 1, sideZ = i % 4 < 2 ? 1 : -1;
            const x = lx + sideX * (2.9 + rng() * (lw / 2 - 5));
            const z = lz + sideZ * (2.9 + rng() * (ld / 2 - 5));
            m.makeScale(s, s * (1.1 + rng() * 0.8), s).setPosition(x, s * 0.9 + 0.28, z);
            treeMats.push(m.clone());
            treeColors.push(new THREE.Color().setHSL(0.34 + rng() * 0.1, 0.53, 0.25 + rng() * 0.18));
          }
          structures.push({ ...base, group: parkCourtyard(shared, lx, lz, lw, ld), holo: null, height: 8, color: new THREE.Color(0x345e43), trees: [first, treeMats.length] });
          continue;
        }
        const featured = detailedFrontage ? (lx > cx ? 'market' : 'apartments') : undefined;
        const height = featured ? (featured === 'market' ? 37 : 110) : profileHeight(profile, bx, bz, rng);
        const H = (bz === 8 && (bx === 5 || bx === 6) ? Math.min(height, 19) : height) * intent.height;
        const sections = landmark ? exchangeSections(landmark, lx, lz, lw, ld, intent.height)
          : buildingSections(profile, H, lx, lz, lw, ld, rng, featured);
        const mat = landmark === 'works' ? exchange.concrete : landmark === 'telemetry' ? exchange.metal
          : featured ? shared[featured] : shared.districts[profile][Math.floor(rng() * 2)];
        const t = buildTower(sections, rng, shared, mat, accent, intent, detailedFrontage || !!landmark, profile);
        if (landmark) exchange.detail(t.group, landmark, lx, lz, lw, ld, intent.height);
        if (detailedFrontage) streetCorner.facade(t.group, lx, lz, lw, ld, lx > cx);
        const top = sections[sections.length - 1];
        const roof = { x: top.cx, z: top.cz, y: top.y0 + top.h, w: top.w, d: top.d, profile };
        structures.push({ ...base, ...t, roof, featured, trees: [0, 0] });
      }
    }
  }

  const nexus = createNexus();
  civicBuildings.push(nexus);
  const spire: Structure = {
    group: nexus.root, holo: nexus.holo, height: 560, x: 0, z: 0, radius: 29, dist: 0,
    color: new THREE.Color(CYAN), start: 0, rise: 9, p: 0, done: false, trees: [0, 0],
  };

  for (const s of [...structures, spire]) {
    if (s.group) { s.group.visible = false; root.add(s.group); }
    if (s.holo) { s.holo.visible = false; root.add(s.holo); }
  }

  // Build order: outward from the spire.
  structures.sort((a, b) => a.dist + (a.x * 0.013 + a.z * 0.007) - (b.dist + (b.x * 0.013 + b.z * 0.007)));

  // Coloured light spilling onto the street around each tower.
  const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const decalMat = new THREE.MeshBasicMaterial({
    map: shared.sprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32,
    polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false,
  });
  const decals = new THREE.InstancedMesh(decalGeo, decalMat, structures.length);
  structures.forEach((s, i) => { decals.setMatrixAt(i, m.makeScale(0, 0, 0)); decals.setColorAt(i, s.color); });
  root.add(decals);

  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x1f7a52, emissiveIntensity: 0.55, roughness: 0.9, flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, Math.max(1, treeMats.length));
  treeMats.forEach((_, i) => { trees.setMatrixAt(i, m.makeScale(0, 0, 0)); trees.setColorAt(i, treeColors[i]); });
  trees.count = treeMats.length;
  root.add(trees);

  const tallest = Math.max(...structures.map(s => s.height));
  return {
    root, structures, spire, spireTop: spire.height, decals, trees, treeBase: treeMats, tallest,
    dispose: () => {
      for (const building of civicBuildings) {
        building.root.removeFromParent();
        building.dispose();
      }
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
      });
      decalMat.dispose(); treeMat.dispose(); streetCorner.dispose(); exchange.dispose();
    },
  };
}
