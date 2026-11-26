// World state (plain JSON so it can be saved as-is), map generation and shared helpers.
import {
  BKey, UKey, Faction, Res, Cost, TechKey, Difficulty,
  BUILDINGS, UNITS, DIFF, lvlMult,
} from './defs';

export const W = 44;
export const H = 44;
export const GROUND = 0, WATER = 1, RUIN = 2;

export interface QueueItem { kind: UKey; t: number }

export interface Building {
  id: number;
  kind: BKey;
  faction: Faction;
  x: number; // top-left tile
  y: number;
  hp: number;
  level: number;
  /** Seconds of construction left; 0 once built. */
  build: number;
  /** Seconds of upgrade left; 0 when idle. */
  upgrade: number;
  upgradeTotal: number;
  workersWanted: number;
  workers: number;
  queue: QueueItem[];
  cd: number;
  aim: number;
  hitT: number;
}

export type Order = 'idle' | 'move' | 'amove' | 'attack';

export interface Unit {
  id: number;
  kind: UKey;
  faction: Faction;
  x: number;
  y: number;
  hp: number;
  order: Order;
  tx: number;
  ty: number;
  target: number;
  path: number[];
  cd: number;
  scan: number;
  repath: number;
  face: number;
  /** Rival bookkeeping: 0 = guard, 1 = raider. */
  role: number;
}

export interface UplinkNode {
  id: number;
  x: number;
  y: number;
  owner: -1 | Faction;
  /** -1 (rival) .. +1 (player) capture progress. */
  cap: number;
}

export interface Fx { type: 'shot' | 'boom'; x1: number; y1: number; x2: number; y2: number; t: number; faction: Faction; big?: boolean }
export interface GameEvent { msg: string; kind: 'info' | 'warn' | 'good' }

export interface Rates {
  income: Res;
  powerSupply: number;
  powerDemand: number;
  powerRatio: number;
  housing: number;
  idle: number;
  starving: boolean;
  supply: number;
  supplyCap: number;
}

export interface State {
  version: number;
  difficulty: Difficulty;
  rng: number;
  time: number;
  tiles: number[];
  /** Building id occupying each tile, 0 if free. */
  occ: number[];
  buildings: Building[];
  units: Unit[];
  nodes: UplinkNode[];
  nextId: number;
  res: Res;
  tier: number;
  tierUp: number;
  tierTotal: number;
  morale: number;
  citizens: number;
  techs: TechKey[];
  research: TechKey | null;
  researchT: number;
  ai: { spawnT: number; waveT: number; waves: number; nodeT: number; thinkT: number };
  rates: Rates;
  objectives: number; // bitmask of completed objectives
  trained: number;
  alertT: number;
  over: null | 'win' | 'lose';
  fx: Fx[];
  events: GameEvent[];
}

export const idx = (x: number, y: number) => y * W + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

export function rand(s: State): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function hash2(x: number, y: number, seed = 0): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function walkable(s: State, x: number, y: number): boolean {
  return inBounds(x, y) && s.tiles[idx(x, y)] === GROUND && s.occ[idx(x, y)] === 0;
}

export const bdef = (b: Building) => BUILDINGS[b.kind];
export const isBuilt = (b: Building) => b.build <= 0;
export const bCenter = (b: Building) => {
  const h = BUILDINGS[b.kind].size / 2;
  return { x: b.x + h, y: b.y + h };
};

export function enemyPower(s: State): number {
  return DIFF[s.difficulty].power;
}

/** Each city tier above the first makes your squads and turrets 15% stronger. */
export const tierBonus = (s: State) => 1 + 0.15 * (s.tier - 1);

export function maxHp(s: State, b: Building): number {
  const base = BUILDINGS[b.kind].hp * (1 + 0.4 * (b.level - 1));
  return Math.round(b.faction === 1 ? base * enemyPower(s) : base);
}

export function unitMaxHp(s: State, kind: UKey, faction: Faction): number {
  const base = UNITS[kind].hp;
  if (faction === 1) return Math.round(base * enemyPower(s));
  return Math.round(base * (s.techs.includes('armor') ? 1.25 : 1) * tierBonus(s));
}

/** Distance from a point to the footprint of a building. */
export function distToBuilding(x: number, y: number, b: Building): number {
  const size = BUILDINGS[b.kind].size;
  const dx = Math.max(b.x - x, 0, x - (b.x + size));
  const dy = Math.max(b.y - y, 0, y - (b.y + size));
  return Math.hypot(dx, dy);
}

export function getBuilding(s: State, id: number): Building | undefined {
  return s.buildings.find(b => b.id === id);
}
export function getUnit(s: State, id: number): Unit | undefined {
  return s.units.find(u => u.id === id);
}
export function coreOf(s: State, faction: Faction): Building | undefined {
  return s.buildings.find(b => b.kind === 'core' && b.faction === faction);
}

export function canAfford(s: State, cost: Cost): boolean {
  return (Object.keys(cost) as (keyof Res)[]).every(k => s.res[k] >= (cost[k] ?? 0));
}
export function pay(s: State, cost: Cost): void {
  for (const k of Object.keys(cost) as (keyof Res)[]) s.res[k] -= cost[k] ?? 0;
}
export function scaleCost(cost: Cost, m: number): Cost {
  const out: Cost = {};
  for (const k of Object.keys(cost) as (keyof Res)[]) out[k] = Math.round(((cost[k] ?? 0) * m) / 5) * 5;
  return out;
}
export const upgradeCost = (b: Building): Cost => scaleCost(BUILDINGS[b.kind].cost, Math.pow(1.6, b.level));
export const upgradeTime = (b: Building): number => Math.round(BUILDINGS[b.kind].time * Math.pow(1.5, b.level));

export function emit(s: State, msg: string, kind: GameEvent['kind'] = 'info'): void {
  s.events.push({ msg, kind });
  if (s.events.length > 20) s.events.shift();
}

/** Can a building of this kind sit with its top-left at (x, y)? Returns a reason when it cannot. */
export function placementError(s: State, kind: BKey, x: number, y: number, faction: Faction = 0): string | null {
  const size = BUILDINGS[kind].size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const tx = x + i, ty = y + j;
      if (!inBounds(tx, ty)) return 'Out of bounds';
      if (s.tiles[idx(tx, ty)] !== GROUND) return 'Blocked terrain';
      if (s.occ[idx(tx, ty)] !== 0) return 'Space is occupied';
      if (s.nodes.some(n => n.x === tx && n.y === ty)) return 'Uplink nodes must stay clear';
    }
  }
  if (faction === 0) {
    const cx = x + size / 2, cy = y + size / 2;
    const near = s.buildings.some(b => b.faction === 0 && distToBuilding(cx, cy, b) <= 9);
    if (!near) return 'Too far from your grid';
    const rival = coreOf(s, 1);
    if (rival && distToBuilding(cx, cy, rival) < 9) return 'Too close to the rival Nexus';
  }
  return null;
}

export function addBuilding(s: State, kind: BKey, faction: Faction, x: number, y: number, built: boolean): Building {
  const def = BUILDINGS[kind];
  const b: Building = {
    id: s.nextId++, kind, faction, x, y, hp: 1, level: 1,
    build: built ? 0 : def.time, upgrade: 0, upgradeTotal: 0,
    workersWanted: def.workers, workers: 0, queue: [], cd: 0, aim: 0, hitT: -100,
  };
  b.hp = built ? maxHp(s, b) : Math.round(maxHp(s, b) * 0.25);
  for (let j = 0; j < def.size; j++) for (let i = 0; i < def.size; i++) s.occ[idx(x + i, y + j)] = b.id;
  s.buildings.push(b);
  return b;
}

export function addUnit(s: State, kind: UKey, faction: Faction, x: number, y: number): Unit {
  const u: Unit = {
    id: s.nextId++, kind, faction, x, y, hp: unitMaxHp(s, kind, faction),
    order: 'idle', tx: x, ty: y, target: 0, path: [], cd: 0, scan: rand(s) * 0.3, repath: 0,
    face: faction === 0 ? -Math.PI / 4 : (Math.PI * 3) / 4, role: 0,
  };
  s.units.push(u);
  return u;
}

/** Nearest walkable tile to (x, y), searching outward in rings. */
export function nearestWalkable(s: State, x: number, y: number, taken?: Set<number>): { x: number; y: number } | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let r = 0; r < 12; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const tx = cx + i, ty = cy + j;
        if (!walkable(s, tx, ty) || taken?.has(idx(tx, ty))) continue;
        const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
        if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
      }
    }
    if (best) return best;
  }
  return null;
}

export const PLAYER_CORE = { x: 6, y: 35 };
export const RIVAL_CORE = { x: 35, y: 6 };
const NODE_SPOTS = [[22, 22], [12, 12], [32, 32], [15, 29], [29, 15]];

function generateTiles(seed: number): number[] {
  const tiles = new Array<number>(W * H).fill(GROUND);
  const bridges = [12, 22, 32];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // A canal runs corner to corner between the two cities, crossed by three bridges.
      if (Math.abs(x - y) <= 1) {
        const m = (x + y) / 2;
        if (!bridges.some(b => Math.abs(m - b) <= 1.5)) tiles[idx(x, y)] = WATER;
        continue;
      }
      // Ruins of the old city, in clumps.
      const clump = hash2(Math.floor(x / 3), Math.floor(y / 3), seed);
      const fine = hash2(x, y, seed + 7);
      if (clump > 0.72 && fine > 0.35) tiles[idx(x, y)] = RUIN;
      else if (fine > 0.975) tiles[idx(x, y)] = RUIN;
    }
  }
  const clear = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (inBounds(x, y) && tiles[idx(x, y)] === RUIN && Math.hypot(x - cx, y - cy) <= r) tiles[idx(x, y)] = GROUND;
      }
    }
  };
  clear(PLAYER_CORE.x + 1.5, PLAYER_CORE.y + 1.5, 10);
  clear(RIVAL_CORE.x + 1.5, RIVAL_CORE.y + 1.5, 10);
  for (const [nx, ny] of NODE_SPOTS) clear(nx, ny, 3);
  return tiles;
}

export function createState(difficulty: Difficulty = 'normal', seed = 1): State {
  const d = DIFF[difficulty];
  const s: State = {
    version: 1,
    difficulty,
    rng: seed * 7919,
    time: 0,
    tiles: generateTiles(seed),
    occ: new Array<number>(W * H).fill(0),
    buildings: [],
    units: [],
    nodes: [],
    nextId: 1,
    res: { credits: 450, alloy: 250, food: 120, data: 0 },
    tier: 1,
    tierUp: 0,
    tierTotal: 0,
    morale: 65,
    citizens: 6,
    techs: [],
    research: null,
    researchT: 0,
    ai: { spawnT: 20, waveT: d.firstWave, waves: 0, nodeT: 90, thinkT: 0 },
    rates: {
      income: { credits: 0, alloy: 0, food: 0, data: 0 },
      powerSupply: 0, powerDemand: 0, powerRatio: 1, housing: 0, idle: 0,
      starving: false, supply: 0, supplyCap: 0,
    },
    objectives: 0,
    trained: 0,
    alertT: -100,
    over: null,
    fx: [],
    events: [],
  };
  for (const [x, y] of NODE_SPOTS) s.nodes.push({ id: s.nextId++, x, y, owner: -1, cap: 0 });

  addBuilding(s, 'core', 0, PLAYER_CORE.x, PLAYER_CORE.y, true);
  addUnit(s, 'enforcer', 0, PLAYER_CORE.x + 4.5, PLAYER_CORE.y - 0.5);
  addUnit(s, 'enforcer', 0, PLAYER_CORE.x + 5.5, PLAYER_CORE.y + 0.5);

  addBuilding(s, 'core', 1, RIVAL_CORE.x, RIVAL_CORE.y, true);
  const rivalBase: [BKey, number, number][] = [
    ['hub', 31, 5], ['hub', 37, 11], ['turret', 33, 10], ['turret', 32, 8], ['turret', 36, 10],
    ['turret', 34, 4], ['turret', 39, 9], ['hab', 39, 4], ['hab', 40, 7], ['solar', 36, 2],
    ['foundry', 32, 2], ['market', 40, 12],
  ];
  for (const [kind, x, y] of rivalBase) {
    if (!placementError(s, kind, x, y, 1)) addBuilding(s, kind, 1, x, y, true);
  }
  for (let i = 0; i < 3; i++) addUnit(s, 'enforcer', 1, 33.5 + i, 12.5);
  return s;
}

export function buildingOutputMult(b: Building): number {
  return lvlMult(b.level);
}
