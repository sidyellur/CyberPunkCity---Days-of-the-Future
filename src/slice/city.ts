// Procedural district: every tower, sign and street is generated from a seed and an intent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BLOCKS = 9;
export const BLOCK = 64;
export const STREET = 18;
export const PITCH = BLOCK + STREET;
export const EXTENT = BLOCKS * PITCH;
export const ORIGIN = -EXTENT / 2;
export const GROUND_TILES = 78;

export type Character = 'efficient' | 'balanced' | 'green';
export type IntentKey = Character; // the slice's three briefs are the three characters

/** How the Architect dresses a block. Game intents and slice characters both reduce to one of these. */
export interface BlockStyle {
  height: number;
  park: number; // chance that a lot becomes green space
  signs: number;
  palette: number[];
  windows: number[]; // indexes into the window texture set
  lots?: 1 | 2 | 4; // force how the block is carved up
  slim?: number; // extra taper per setback, for needle towers
}

export const CYAN = 0x2ee6ff, MAGENTA = 0xff3d8b, AMBER = 0xffb347, VIOLET = 0xa06bff, GREEN = 0x4dffa6, ICE = 0xbfe9ff, ORANGE = 0xff7a3d;

export interface CharacterDef { label: string; blurb: string; style: BlockStyle }
export const INTENTS: Record<Character, CharacterDef> = {
  efficient: {
    label: 'Dense', blurb: 'Maximum floor area. Taller, tighter, colder.',
    style: { height: 1.3, park: 0, signs: 0.75, palette: [CYAN, ICE, AMBER, CYAN], windows: [1, 1, 3, 0] },
  },
  balanced: {
    label: 'Balanced', blurb: 'Commerce, housing and light in equal measure.',
    style: { height: 1, park: 0.07, signs: 1, palette: [CYAN, MAGENTA, AMBER, VIOLET], windows: [0, 1, 2, 3] },
  },
  green: {
    label: 'Green', blurb: 'Lower skyline, open ground, room to breathe.',
    style: { height: 0.68, park: 0.3, signs: 0.5, palette: [GREEN, CYAN, AMBER, GREEN], windows: [0, 0, 1, 3] },
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
    [['#7dffb8', '#c8ffd8', '#ff9cc4'], 0.78], // grow-lights (vertical farms)
    [['#ff9a50', '#ffd9a0', '#ff5a4d'], 0.2], // industrial
    [['#9ff6ff', '#ffffff', '#2ee6ff'], 0.88], // reactor halls
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
  group: THREE.Group | null; // null for green space
  holo: THREE.LineSegments | null;
  height: number;
  x: number;
  z: number;
  radius: number;
  dist: number;
  color: THREE.Color;
  start: number;
  rise: number;
  /** Fraction already standing when the rise begins (an existing tower growing taller). */
  from: number;
  p: number;
  done: boolean;
  trees: [number, number]; // range in the block's tree instances
}

export interface Block {
  bx: number;
  bz: number;
  root: THREE.Group;
  structures: Structure[];
  decals: THREE.InstancedMesh;
  trees: THREE.InstancedMesh;
  treeBase: THREE.Matrix4[];
}

export const blockCenter = (bx: number, bz: number) => ({ x: ORIGIN + (bx + 0.5) * PITCH, z: ORIGIN + (bz + 0.5) * PITCH });
export const MID = (BLOCKS - 1) / 2;

function buildTower(sections: Section[], rng: () => number, shared: Shared, bodyMat: THREE.Material, accent: THREE.Color, signDensity: number, isSpire: boolean) {
  const body: THREE.BufferGeometry[] = [], neon: THREE.BufferGeometry[] = [], edges: THREE.BufferGeometry[] = [];
  const uo = Math.floor(rng() * COLS) / COLS, vo = Math.floor(rng() * ROWS) / ROWS;
  const bright = accent.clone().multiplyScalar(1.9);
  const group = new THREE.Group();
  sections.forEach((s, i) => {
    body.push(windowBox(s.w, s.h, s.d, s.cx, s.y0, s.cz, uo, vo));
    edges.push(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.w, s.h, s.d)).translate(s.cx, s.y0 + s.h / 2, s.cz));
    const top = s.y0 + s.h;
    // A lit parapet around the top of each setback.
    if (isSpire || rng() < 0.8 || i === sections.length - 1) {
      neon.push(colorBox(s.w + 0.6, 0.9, 0.5, s.cx, top, s.cz + s.d / 2, bright), colorBox(s.w + 0.6, 0.9, 0.5, s.cx, top, s.cz - s.d / 2, bright));
      neon.push(colorBox(0.5, 0.9, s.d + 0.6, s.cx + s.w / 2, top, s.cz, bright), colorBox(0.5, 0.9, s.d + 0.6, s.cx - s.w / 2, top, s.cz, bright));
    }
    // Vertical light seams on some corners.
    if (isSpire || rng() < 0.3) {
      for (const [sx, sz] of [[1, 1], [-1, -1]]) neon.push(colorBox(0.4, s.h, 0.4, s.cx + (sx * s.w) / 2, s.y0 + s.h / 2, s.cz + (sz * s.d) / 2, bright));
    }
  });
  const base = sections[0], last = sections[sections.length - 1];
  // Street-level shopfront band.
  const shop = new THREE.Color([MAGENTA, AMBER, CYAN, GREEN][Math.floor(rng() * 4)]).multiplyScalar(1.5);
  neon.push(colorBox(base.w + 0.4, 0.5, base.d + 0.4, base.cx, 5.2, base.cz, shop));
  // Antenna.
  let height = last.y0 + last.h;
  if (rng() < 0.6 || isSpire) {
    const ah = isSpire ? 70 : 10 + rng() * 34;
    body.push(windowBox(0.8, ah, 0.8, last.cx, height, last.cz, 0.004, 0.004));
    neon.push(colorBox(1.6, 1.6, 1.6, last.cx, height + ah, last.cz, new THREE.Color(0xff3030).multiplyScalar(2.2)));
    height += ah;
  }
  group.add(new THREE.Mesh(mergeGeometries(body), bodyMat), new THREE.Mesh(mergeGeometries(neon), shared.neon));

  // Signs.
  const count = isSpire ? 0 : Math.floor(rng() * 4.6 * signDensity);
  for (let i = 0; i < count; i++) {
    const s = shared.signs[Math.floor(rng() * shared.signs.length)];
    const sec = rng() < 0.6 ? base : sections[Math.floor(rng() * sections.length)];
    const low = rng() < 0.5;
    const big = !low && sec.h > 40 && rng() < 0.5 ? 1.9 : 1;
    const sw = (s.vertical ? 5 + rng() * 3 : 14 + rng() * 10) * big;
    const sh = s.vertical ? sw * 4 : sw * 0.4;
    const y = low ? 8 + sh / 2 + rng() * 10 : sec.y0 + sec.h - sh / 2 - 3 - rng() * Math.max(0, sec.h - sh - 12) * 0.4;
    const face = Math.floor(rng() * 4), along = rng() - 0.5;
    if (y - sh / 2 < sec.y0 + 4 || y + sh / 2 > sec.y0 + sec.h + 2) continue;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), s.mat);
    const off = s.vertical ? 0.8 + sw / 2 : 0.6;
    if (face < 2) {
      const sign = face === 0 ? 1 : -1;
      mesh.position.set(sec.cx + along * Math.max(0, sec.w - sw - 2), y, sec.cz + sign * (sec.d / 2 + off));
      if (s.vertical) mesh.rotation.y = Math.PI / 2; else if (sign < 0) mesh.rotation.y = Math.PI;
    } else {
      const sign = face === 2 ? 1 : -1;
      mesh.position.set(sec.cx + sign * (sec.w / 2 + off), y, sec.cz + along * Math.max(0, sec.d - sw - 2));
      mesh.rotation.y = s.vertical ? 0 : (sign * Math.PI) / 2;
    }
    group.add(mesh);
  }

  const holoMat = new THREE.LineBasicMaterial({ color: isSpire ? 0xffffff : 0x2ee6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const holo = new THREE.LineSegments(mergeGeometries(edges), holoMat);
  return { group, holo, height };
}

const scratch = new THREE.Matrix4();
const maxDist = Math.hypot(MID, MID) * PITCH;

/**
 * Design one city block. The same seed always yields the same lots, footprints and signage, so
 * rebuilding a block with a taller style grows the towers that were already there.
 * `falloff` makes blocks shorter toward the edge of the district (used by the slice's skyline).
 */
export function buildBlock(shared: Shared, bx: number, bz: number, seed: number, style: BlockStyle, falloff = true): Block {
  const rng = mulberry(seed * 9973 + bx * 131 + bz * 17 + 5);
  const root = new THREE.Group();
  const structures: Structure[] = [];
  const treeBase: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const { x: cx, z: cz } = blockCenter(bx, bz);
  const inner = BLOCK - 8; // pavement all round

  // Carve the block into 1, 2 or 4 lots.
  const roll = rng(), alongX = rng() < 0.5, split = 0.38 + rng() * 0.24;
  const n = style.lots ?? (roll < 0.22 ? 1 : roll < 0.58 ? 2 : 4);
  const lots: [number, number, number, number][] = [];
  if (n === 1) lots.push([cx, cz, inner, inner]);
  else if (n === 2) {
    const a = inner * split - 2, b = inner * (1 - split) - 2;
    if (alongX) lots.push([cx - inner / 2 + a / 2, cz, a, inner], [cx + inner / 2 - b / 2, cz, b, inner]);
    else lots.push([cx, cz - inner / 2 + a / 2, inner, a], [cx, cz + inner / 2 - b / 2, inner, b]);
  } else {
    const h = inner / 2 - 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lots.push([cx + (sx * inner) / 4, cz + (sz * inner) / 4, h, h]);
  }

  for (const [lx, lz, lw, ld] of lots) {
    // Every random draw below happens for every lot, whatever the style, so layouts stay stable.
    const r = Array.from({ length: 8 }, rng);
    const lotRng = mulberry(Math.floor(r[7] * 1e9));
    const dist = Math.hypot(lx, lz);
    const accent = new THREE.Color(style.palette[Math.floor(r[0] * style.palette.length)]);
    const base = { x: lx, z: lz, radius: Math.max(lw, ld) / 2, dist, start: 0, rise: 0, from: 0, p: 0, done: false };
    if (r[1] < style.park) {
      const first = treeBase.length;
      const count = Math.round((lw * ld) / 55);
      for (let i = 0; i < count; i++) {
        const s = 2.2 + lotRng() * 2.6;
        scratch.makeScale(s, s * (1.1 + lotRng() * 0.8), s).setPosition(lx + (lotRng() - 0.5) * (lw - 4), s * 0.9, lz + (lotRng() - 0.5) * (ld - 4));
        treeBase.push(scratch.clone());
        treeColors.push(new THREE.Color().setHSL(0.36 + lotRng() * 0.12, 0.85, 0.32 + lotRng() * 0.2));
      }
      structures.push({ ...base, group: null, holo: null, height: 8, color: new THREE.Color(GREEN), trees: [first, treeBase.length] });
      continue;
    }
    const fall = falloff ? 1.2 - 0.62 * (dist / maxDist) : 1;
    let H = (55 + r[2] * 130) * fall * style.height;
    if (r[3] < 0.08) H *= 1.55;
    H = Math.max(14, H);
    const count = 1 + Math.floor(r[4] * 3.6);
    const sections: Section[] = [];
    let w = lw, d = ld, sx = lx, sz = lz, y0 = 0;
    for (let i = 0; i < count; i++) {
      const h = i === count - 1 ? H - y0 : (H - y0) * (0.3 + lotRng() * 0.35);
      sections.push({ w, d, cx: sx, cz: sz, y0, h });
      y0 += h;
      const taper = style.slim ?? 0;
      const nw = w * (0.68 + lotRng() * 0.2 - taper), nd = d * (0.68 + lotRng() * 0.2 - taper);
      sx += (lotRng() - 0.5) * (w - nw); sz += (lotRng() - 0.5) * (d - nd);
      w = nw; d = nd;
    }
    const mat = shared.windows[style.windows[Math.floor(r[5] * style.windows.length)]];
    const t = buildTower(sections, lotRng, shared, mat, accent, style.signs, false);
    structures.push({ ...base, ...t, color: accent, trees: [0, 0] });
  }

  for (const s of structures) {
    if (s.group) { s.group.visible = false; root.add(s.group); }
    if (s.holo) { s.holo.visible = false; root.add(s.holo); }
  }

  // Coloured light spilling onto the street around each tower.
  const decalMat = new THREE.MeshBasicMaterial({
    map: shared.sprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32,
    polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false,
  });
  const decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decalMat, structures.length);
  structures.forEach((s, i) => { decals.setMatrixAt(i, scratch.makeScale(0, 0, 0)); decals.setColorAt(i, s.color); });
  decals.frustumCulled = false;
  root.add(decals);

  const treeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x1f7a52, emissiveIntensity: 0.55, roughness: 0.9, flatShading: true });
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), treeMat, Math.max(1, treeBase.length));
  treeBase.forEach((_, i) => { trees.setMatrixAt(i, scratch.makeScale(0, 0, 0)); trees.setColorAt(i, treeColors[i]); });
  trees.count = treeBase.length;
  trees.frustumCulled = false;
  root.add(trees);

  return { bx, bz, root, structures, decals, trees, treeBase };
}

export function disposeBlock(block: Block): void {
  block.root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
  });
  (block.decals.material as THREE.Material).dispose();
  (block.trees.material as THREE.Material).dispose();
}

/** The Architect's spire, for the central plaza. */
export function buildSpire(shared: Shared): { structure: Structure; top: number } {
  const rng = mulberry(31337);
  const sections: Section[] = [];
  let y0 = 0, w = 46;
  for (const h of [70, 110, 130, 110, 70]) { sections.push({ w, d: w, cx: 0, cz: 0, y0, h }); y0 += h; w *= 0.7; }
  const sp = buildTower(sections, rng, shared, shared.spire, new THREE.Color(CYAN), 0, true);
  sp.group.visible = false; sp.holo.visible = false;
  return {
    structure: { ...sp, x: 0, z: 0, radius: 23, dist: 0, color: new THREE.Color(CYAN), start: 0, rise: 9, from: 0, p: 0, done: false, trees: [0, 0] },
    top: sp.height,
  };
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const vec = new THREE.Vector3();

/**
 * Advance one structure's build animation to time `now`: first a flickering hologram of the plan,
 * then the tower rising out of the ground. `block` is null for the spire.
 */
export function animateStructure(block: Block | null, s: Structure, index: number, now: number): void {
  if (s.done) return;
  const plan = s.start - 1.6;
  if (now < plan) return;
  if (now < s.start) {
    if (s.holo) {
      s.holo.visible = true;
      (s.holo.material as THREE.LineBasicMaterial).opacity = 0.75 * ((now - plan) / 1.6) * (0.75 + 0.25 * Math.sin(now * 40 + index));
    }
    if (s.from > 0) show(block, s, index, s.from);
    return;
  }
  const k = Math.min(1, (now - s.start) / s.rise);
  const p = s.from + (1 - s.from) * ease(k);
  show(block, s, index, p);
  if (s.holo) {
    s.holo.visible = k < 1;
    (s.holo.material as THREE.LineBasicMaterial).opacity = 0.75 * (1 - k);
  }
  if (k >= 1) s.done = true;
}

function show(block: Block | null, s: Structure, index: number, p: number): void {
  s.p = p;
  if (s.group) {
    s.group.visible = true;
    s.group.position.y = -(s.height + 3) * (1 - p);
  }
  if (!block) return;
  const r = s.radius * 3.4 * p;
  block.decals.setMatrixAt(index, scratch.makeScale(r, 1, r).setPosition(s.x, 0.12, s.z));
  block.decals.instanceMatrix.needsUpdate = true;
  for (let t = s.trees[0]; t < s.trees[1]; t++) {
    const base = block.treeBase[t];
    scratch.copy(base).scale(vec.set(p, p, p));
    scratch.elements[13] = base.elements[13] * p;
    block.trees.setMatrixAt(t, scratch);
    block.trees.instanceMatrix.needsUpdate = true;
  }
}
