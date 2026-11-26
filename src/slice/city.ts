// Procedural district: every tower, sign and street is generated from a seed and an intent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createStreetCorner, STREET_CORNER } from './street';

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
  windows: number[]; // indexes into the window texture set
}

const CYAN = 0x2ee6ff, MAGENTA = 0xff3d8b, AMBER = 0xffb347, VIOLET = 0xa06bff, GREEN = 0x4dffa6, ICE = 0xbfe9ff;

export const INTENTS: Record<IntentKey, Intent> = {
  efficient: {
    label: 'Dense', blurb: 'Maximum floor area. Taller, tighter, colder.',
    height: 1.3, park: 0, signs: 0.75, palette: [CYAN, ICE, AMBER, CYAN], windows: [1, 1, 3, 0],
  },
  balanced: {
    label: 'Balanced', blurb: 'Commerce, housing and light in equal measure.',
    height: 1, park: 0.07, signs: 1, palette: [CYAN, MAGENTA, AMBER, VIOLET], windows: [0, 1, 2, 3],
  },
  green: {
    label: 'Green', blurb: 'Lower skyline, open ground, room to breathe.',
    height: 0.68, park: 0.3, signs: 0.5, palette: [GREEN, CYAN, AMBER, GREEN], windows: [0, 0, 1, 3],
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
  neon: THREE.MeshBasicMaterial;
  signs: { mat: THREE.MeshBasicMaterial; vertical: boolean; color: number }[];
  ground: THREE.MeshStandardMaterial;
  sprite: THREE.CanvasTexture;
  spire: THREE.MeshStandardMaterial;
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
    map: g.map, emissive: 0xffffff, emissiveMap: g.glow, emissiveIntensity: 0.9, roughness: 0.42, metalness: 0.55,
  });
  const spireMap = windowTexture(rng, ['#2ee6ff', '#bfe9ff', '#ffffff'], 0.7);
  const spire = new THREE.MeshStandardMaterial({
    color: 0x6f86a8, map: spireMap, emissive: 0xffffff, emissiveMap: spireMap, emissiveIntensity: 1.5, roughness: 0.35, metalness: 0.6,
  });
  return {
    windows, signs, ground, spire, sprite: glowSprite(),
    market: frontageMaterial(false), apartments: frontageMaterial(true),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
}

// ---------- Geometry helpers ----------

/** A box whose side faces carry the window grid at a constant real-world window size. */
function windowBox(w: number, h: number, d: number, cx: number, y0: number, cz: number, uo: number, vo: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) uv.setXY(k, 0.004, 0.004); // roofs sample the dark mullion
      else uv.setXY(k, uo + (uv.getX(k) * (f < 2 ? d : w)) / (CELL * COLS), vo + (uv.getY(k) * h) / (CELL * ROWS));
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

interface Section { w: number; d: number; cx: number; cz: number; y0: number; h: number }

export interface Structure {
  group: THREE.Group | null; // null for parks
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

function buildTower(sections: Section[], rng: () => number, shared: Shared, bodyMat: THREE.Material, accent: THREE.Color, intent: Intent, isSpire: boolean, detailedFrontage = false) {
  const body: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [], edges: THREE.BufferGeometry[] = [];
  const uo = Math.floor(rng() * COLS) / COLS, vo = Math.floor(rng() * ROWS) / ROWS;
  const bright = accent.clone().multiplyScalar(detailedFrontage ? 0.72 : 1.9);
  const group = new THREE.Group();
  sections.forEach((s, i) => {
    body.push(windowBox(s.w, s.h, s.d, s.cx, s.y0, s.cz, uo, vo));
    edges.push(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.w, s.h, s.d)).translate(s.cx, s.y0 + s.h / 2, s.cz));
    const top = s.y0 + s.h;
    const trim = detailedFrontage ? 0.17 : 0.9;
    // A lit parapet around the top of each setback.
    if (isSpire || rng() < 0.8 || i === sections.length - 1) {
      neon.push(colorBox(s.w + 0.6, trim, 0.5, s.cx, top, s.cz + s.d / 2, bright), colorBox(s.w + 0.6, trim, 0.5, s.cx, top, s.cz - s.d / 2, bright));
      neon.push(colorBox(0.5, trim, s.d + 0.6, s.cx + s.w / 2, top, s.cz, bright), colorBox(0.5, trim, s.d + 0.6, s.cx - s.w / 2, top, s.cz, bright));
    }
    // Vertical light seams on some corners.
    if (isSpire || (rng() < 0.3 && !detailedFrontage)) {
      for (const [sx, sz] of [[1, 1], [-1, -1]]) neon.push(colorBox(0.4, s.h, 0.4, s.cx + (sx * s.w) / 2, s.y0 + s.h / 2, s.cz + (sz * s.d) / 2, bright));
    }
  });
  const base = sections[0], last = sections[sections.length - 1];
  // Street-level shopfront band.
  const shop = new THREE.Color([MAGENTA, AMBER, CYAN, GREEN][Math.floor(rng() * 4)]).multiplyScalar(1.5);
  if (!detailedFrontage) neon.push(colorBox(base.w + 0.4, 0.5, base.d + 0.4, base.cx, 5.2, base.cz, shop));
  // Antenna.
  let height = last.y0 + last.h;
  if (rng() < 0.6 || isSpire) {
    const ah = isSpire ? 70 : 10 + rng() * 34;
    body.push(windowBox(0.8, ah, 0.8, last.cx, height, last.cz, 0.004, 0.004));
    neon.push(colorBox(1.6, 1.6, 1.6, last.cx, height + ah, last.cz, new THREE.Color(0xff3030).multiplyScalar(2.2)));
    height += ah;
  }
  const bodyMesh = new THREE.Mesh(mergeGeometries(body), bodyMat);
  const neonMesh = new THREE.Mesh(mergeGeometries(neon), shared.neon);
  group.add(bodyMesh, neonMesh);

  // Signs.
  const count = isSpire || detailedFrontage ? 0 : Math.floor(rng() * 4.6 * intent.signs);
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

  const holoMat = new THREE.LineBasicMaterial({ color: isSpire ? 0xffffff : 0x2ee6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const holo = new THREE.LineSegments(mergeGeometries(edges), holoMat);
  return { group, holo, height };
}

export function generateDistrict(seed: number, intentKey: IntentKey, shared: Shared): District {
  const rng = mulberry(seed);
  const intent = INTENTS[intentKey];
  const root = new THREE.Group();
  const structures: Structure[] = [];
  const streetCorner = createStreetCorner();
  const mid = (BLOCKS - 1) / 2;
  const maxDist = Math.hypot(mid, mid) * PITCH;
  const treeMats: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const m = new THREE.Matrix4();

  for (let bz = 0; bz < BLOCKS; bz++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      if (bx === mid && bz === mid) continue; // the Architect's plaza
      const cx = ORIGIN + (bx + 0.5) * PITCH, cz = ORIGIN + (bz + 0.5) * PITCH;
      const detailedFrontage = bx === STREET_CORNER.blockX && bz === STREET_CORNER.blockZ;
      const inner = BLOCK - 8; // pavement all round
      // Carve the block into 1, 2 or 4 lots.
      const roll = rng();
      const lots: [number, number, number, number][] = [];
      if (detailedFrontage) {
        lots.push([cx - 14, cz + 8, 25, 40], [cx + 14, cz + 8, 25, 40]);
        streetCorner.pavement(root, cx, cz);
      } else if (roll < 0.22) lots.push([cx, cz, inner, inner]);
      else if (roll < 0.58) {
        const alongX = rng() < 0.5, split = 0.38 + rng() * 0.24;
        const a = inner * split - 2, b = inner * (1 - split) - 2;
        if (alongX) lots.push([cx - inner / 2 + a / 2, cz, a, inner], [cx + inner / 2 - b / 2, cz, b, inner]);
        else lots.push([cx, cz - inner / 2 + a / 2, inner, a], [cx, cz + inner / 2 - b / 2, inner, b]);
      } else {
        const h = inner / 2 - 2;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lots.push([cx + (sx * inner) / 4, cz + (sz * inner) / 4, h, h]);
      }
      for (const [lx, lz, lw, ld] of lots) {
        const dist = Math.hypot(lx, lz);
        const accent = new THREE.Color(intent.palette[Math.floor(rng() * intent.palette.length)]);
        const base: Omit<Structure, 'group' | 'holo' | 'height' | 'trees'> = {
          x: lx, z: lz, radius: Math.max(lw, ld) / 2, dist, color: accent, start: 0, rise: 0, p: 0, done: false,
        };
        if (rng() < intent.park && !detailedFrontage) {
          const first = treeMats.length;
          const n = Math.round((lw * ld) / 55);
          for (let i = 0; i < n; i++) {
            const s = 2.2 + rng() * 2.6;
            m.makeScale(s, s * (1.1 + rng() * 0.8), s).setPosition(lx + (rng() - 0.5) * (lw - 4), s * 0.9, lz + (rng() - 0.5) * (ld - 4));
            treeMats.push(m.clone());
            treeColors.push(new THREE.Color().setHSL(0.36 + rng() * 0.12, 0.85, 0.32 + rng() * 0.2));
          }
          structures.push({ ...base, group: null, holo: null, height: 8, color: new THREE.Color(GREEN), trees: [first, treeMats.length] });
          continue;
        }
        // Height: taller toward the centre, with the odd landmark.
        const fall = 1.2 - 0.62 * (dist / maxDist);
        let H = (55 + rng() * 130) * fall * intent.height;
        if (rng() < 0.08) H *= 1.55;
        const featured = detailedFrontage ? (lx > cx ? 'market' : 'apartments') : undefined;
        if (featured) H = (featured === 'market' ? 37 : 110) * intent.height;
        const randomFloors = 1 + Math.floor(rng() * 3.6);
        const count = featured ? 3 : randomFloors;
        const sections: Section[] = [];
        let w = lw, d = ld, sx = lx, sz = lz, y0 = 0;
        for (let i = 0; i < count; i++) {
          const h = i === count - 1 ? H - y0
            : i === 0 && featured ? (featured === 'market' ? 16 : 47)
            : (H - y0) * (0.3 + rng() * 0.35);
          sections.push({ w, d, cx: sx, cz: sz, y0, h });
          y0 += h;
          const nw = w * (0.68 + rng() * 0.2), nd = d * (0.68 + rng() * 0.2);
          sx += (rng() - 0.5) * (w - nw); sz += (rng() - 0.5) * (d - nd);
          w = nw; d = nd;
        }
        const defaultMat = shared.windows[intent.windows[Math.floor(rng() * intent.windows.length)]];
        const mat = featured ? shared[featured] : defaultMat;
        const t = buildTower(sections, rng, shared, mat, accent, intent, false, detailedFrontage);
        if (detailedFrontage) streetCorner.facade(t.group, lx, lz, lw, ld, lx > cx);
        structures.push({ ...base, ...t, featured, trees: [0, 0] });
      }
    }
  }

  // The Architect's spire in the central plaza.
  const spireSections: Section[] = [];
  let y0 = 0, w = 46;
  for (const h of [70, 110, 130, 110, 70]) { spireSections.push({ w, d: w, cx: 0, cz: 0, y0, h }); y0 += h; w *= 0.7; }
  const sp = buildTower(spireSections, rng, shared, shared.spire, new THREE.Color(CYAN), intent, true);
  const spire: Structure = { ...sp, x: 0, z: 0, radius: 23, dist: 0, color: new THREE.Color(CYAN), start: 0, rise: 9, p: 0, done: false, trees: [0, 0] };

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
    root, structures, spire, spireTop: sp.height, decals, trees, treeBase: treeMats, tallest,
    dispose: () => {
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
      });
      decalMat.dispose(); treeMat.dispose(); streetCorner.dispose();
    },
  };
}
