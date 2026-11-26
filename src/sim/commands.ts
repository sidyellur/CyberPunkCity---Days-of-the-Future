// Player actions. Each returns null on success or a short reason it was refused.
import { BKey, UKey, TechKey, BUILDINGS, UNITS, TECHS, TIER_UPS, TIERS, MAX_LEVEL } from './defs';
import {
  State, Unit, addBuilding, placementError, canAfford, pay, getBuilding, isBuilt, bdef,
  upgradeCost, upgradeTime, idx, maxHp,
} from './state';
import { sendUnit, supplyUsed } from './sim';

export function placeBuilding(s: State, kind: BKey, x: number, y: number): string | null {
  const def = BUILDINGS[kind];
  if (kind === 'core') return 'Only one Nexus';
  if (def.tier > s.tier) return `Requires ${TIERS[def.tier - 1]} tier`;
  const err = placementError(s, kind, x, y, 0);
  if (err) return err;
  if (!canAfford(s, def.cost)) return 'Not enough resources';
  pay(s, def.cost);
  addBuilding(s, kind, 0, x, y, false);
  return null;
}

export function upgradeBuilding(s: State, id: number): string | null {
  const b = getBuilding(s, id);
  if (!b || b.faction !== 0) return 'Nothing to upgrade';
  if (b.kind === 'core') return advanceTier(s);
  if (!isBuilt(b) || b.upgrade > 0) return 'Busy';
  if (b.level >= MAX_LEVEL) return 'Already at max level';
  if (b.level >= s.tier) return `Advance the Nexus to ${TIERS[s.tier] ?? 'the next tier'} first`;
  const cost = upgradeCost(b);
  if (!canAfford(s, cost)) return 'Not enough resources';
  pay(s, cost);
  b.upgrade = b.upgradeTotal = upgradeTime(b);
  return null;
}

export function advanceTier(s: State): string | null {
  if (s.tier >= TIERS.length) return 'Your city is already a Megacity';
  if (s.tierUp > 0) return 'Already advancing';
  const up = TIER_UPS[s.tier - 1];
  if (!canAfford(s, up.cost)) return 'Not enough resources';
  pay(s, up.cost);
  s.tierUp = s.tierTotal = up.time;
  return null;
}

export function demolish(s: State, id: number): string | null {
  const b = getBuilding(s, id);
  if (!b || b.faction !== 0) return 'Nothing to demolish';
  if (b.kind === 'core') return 'The Nexus cannot be demolished';
  const def = bdef(b);
  for (const k of Object.keys(def.cost) as (keyof typeof def.cost)[]) {
    s.res[k] += Math.round((def.cost[k] ?? 0) * 0.5 * (b.hp / maxHp(s, b)));
  }
  for (const q of b.queue) refund(s, q.kind);
  for (let j = 0; j < def.size; j++) for (let i = 0; i < def.size; i++) s.occ[idx(b.x + i, b.y + j)] = 0;
  s.buildings = s.buildings.filter(o => o !== b);
  return null;
}

export function setWorkers(s: State, id: number, n: number): string | null {
  const b = getBuilding(s, id);
  if (!b || b.faction !== 0) return 'No such building';
  b.workersWanted = Math.max(0, Math.min(bdef(b).workers, n));
  return null;
}

function refund(s: State, kind: UKey): void {
  const cost = UNITS[kind].cost;
  for (const k of Object.keys(cost) as (keyof typeof cost)[]) s.res[k] += cost[k] ?? 0;
}

export function trainUnit(s: State, id: number, kind: UKey): string | null {
  const b = getBuilding(s, id);
  if (!b || b.faction !== 0 || b.kind !== 'hub' || !isBuilt(b)) return 'Needs a finished Security Hub';
  const def = UNITS[kind];
  if (def.tier > s.tier) return `Requires ${TIERS[def.tier - 1]} tier`;
  if (b.queue.length >= 5) return 'Queue is full';
  if (supplyUsed(s) + def.supply > s.rates.supplyCap) return 'Army cap reached: build Security Hubs or advance the Nexus';
  if (!canAfford(s, def.cost)) return 'Not enough resources';
  pay(s, def.cost);
  b.queue.push({ kind, t: def.time });
  return null;
}

export function cancelTraining(s: State, id: number, slot: number): string | null {
  const b = getBuilding(s, id);
  if (!b || b.faction !== 0 || !b.queue[slot]) return 'Nothing queued';
  refund(s, b.queue[slot].kind);
  b.queue.splice(slot, 1);
  return null;
}

export function startResearch(s: State, key: TechKey): string | null {
  if (s.techs.includes(key)) return 'Already researched';
  if (s.research) return 'Research already in progress';
  if (!s.buildings.some(b => b.faction === 0 && b.kind === 'vault' && isBuilt(b))) return 'Needs a Data Vault';
  const t = TECHS[key];
  if (s.res.data < t.data) return 'Not enough data';
  s.res.data -= t.data;
  s.research = key;
  s.researchT = t.time;
  return null;
}

function ownUnits(s: State, ids: number[]): Unit[] {
  return s.units.filter(u => u.faction === 0 && ids.includes(u.id));
}

export function orderMove(s: State, ids: number[], x: number, y: number, attackMove = false): void {
  const taken = new Set<number>();
  for (const u of ownUnits(s, ids)) sendUnit(s, u, x, y, attackMove ? 'amove' : 'move', taken);
}

export function orderAttack(s: State, ids: number[], targetId: number): void {
  for (const u of ownUnits(s, ids)) {
    u.order = 'attack';
    u.target = targetId;
    u.path = [];
    u.repath = 0;
  }
}
