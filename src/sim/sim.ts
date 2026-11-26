// The simulation tick: economy, construction, combat, uplink nodes and the rival AI.
import {
  UNITS, TECHS, TIERS, DIFF, DAY_LENGTH, DAYLIGHT, Faction, UKey, Res, lvlMult,
} from './defs';
import {
  State, Building, Unit, bdef, isBuilt, bCenter, maxHp, unitMaxHp, distToBuilding, getBuilding,
  getUnit, coreOf, emit, addUnit, nearestWalkable, walkable, rand, enemyPower, idx, tierBonus,
} from './state';
import { findPath } from './path';

export const DT = 1 / 30;
const AGGRO = 6.5;

/** 0 at deep night, 1 in full daylight, with short dawn and dusk ramps. */
export function daylight(time: number): number {
  const t = time % DAY_LENGTH;
  const ramp = 8;
  if (t < DAYLIGHT - ramp) return Math.min(1, t / ramp + 0.6);
  if (t < DAYLIGHT) return (DAYLIGHT - t) / ramp;
  if (t > DAY_LENGTH - ramp) return ((t - (DAY_LENGTH - ramp)) / ramp) * 0.6;
  return 0;
}

export function supplyUsed(s: State): number {
  let n = 0;
  for (const u of s.units) if (u.faction === 0) n += UNITS[u.kind].supply;
  for (const b of s.buildings) if (b.faction === 0) for (const q of b.queue) n += UNITS[q.kind].supply;
  return n;
}

function economy(s: State, dt: number): void {
  const mine = s.buildings.filter(b => b.faction === 0 && isBuilt(b));
  const r = s.rates;

  let housing = 0, hubs = 0, plazas = 0;
  for (const b of mine) {
    housing += (bdef(b).housing ?? 0) * (1 + 0.5 * (b.level - 1));
    if (b.kind === 'hub') hubs++;
    if (b.kind === 'plaza') plazas += b.level;
  }
  r.housing = Math.floor(housing);
  r.supplyCap = 4 + 6 * s.tier + 4 * hubs;
  r.supply = supplyUsed(s);

  // Staffing: citizens fill worker slots in priority order.
  let free = Math.floor(s.citizens);
  const staffed = mine.filter(b => bdef(b).workers > 0).sort((a, b) => bdef(a).prio - bdef(b).prio || a.id - b.id);
  for (const b of staffed) {
    b.workers = Math.min(b.workersWanted, bdef(b).workers, free);
    free -= b.workers;
  }
  r.idle = free;

  // Power grid.
  const sun = daylight(s.time);
  const gridMult = s.techs.includes('grid') ? 1.25 : 1;
  let supply = 0, demand = 0;
  for (const b of mine) {
    const def = bdef(b);
    if (def.power > 0) {
      let p = def.power * lvlMult(b.level);
      if (b.kind === 'solar') p *= 0.25 + 0.75 * sun;
      if (def.workers > 0) p *= b.workers / def.workers;
      supply += p * gridMult;
    } else if (def.power < 0) {
      demand += -def.power * (1 + 0.3 * (b.level - 1));
    }
  }
  r.powerSupply = supply;
  r.powerDemand = demand;
  r.powerRatio = demand > 0 ? Math.min(1, supply / demand) : 1;

  // Production.
  const moraleMult = 0.6 + (0.6 * s.morale) / 100;
  const inc: Res = { credits: 0, alloy: 0, food: 0, data: 0 };
  for (const b of mine) {
    const def = bdef(b);
    if (!def.out) continue;
    const staff = def.workers > 0 ? b.workers / def.workers : 1;
    const powered = def.power < 0 ? r.powerRatio : 1;
    for (const k of Object.keys(def.out) as (keyof Res)[]) {
      const tech = k === 'food' ? (s.techs.includes('hydro') ? 1.3 : 1) : (s.techs.includes('auto') ? 1.2 : 1);
      inc[k] += (def.out[k] ?? 0) * lvlMult(b.level) * staff * powered * moraleMult * tech;
    }
  }
  for (const n of s.nodes) if (n.owner === 0) { inc.credits += 0.8; inc.data += 0.2; }

  // Upkeep: everyone eats.
  let troops = 0;
  for (const u of s.units) if (u.faction === 0) troops += UNITS[u.kind].supply;
  inc.food -= s.citizens * 0.06 + troops * 0.04;

  for (const k of Object.keys(inc) as (keyof Res)[]) s.res[k] = Math.max(0, s.res[k] + inc[k] * dt);
  r.income = inc;
  r.starving = s.res.food <= 0 && inc.food < 0;

  // Morale drifts toward a target set by living conditions.
  let target = 60 + Math.min(30, plazas * 12);
  if (r.starving) target -= 35;
  target -= 30 * (1 - r.powerRatio);
  if (s.citizens > r.housing) target -= 15;
  if (s.res.food > 60) target += 5;
  target = Math.max(0, Math.min(100, target));
  const step = 2 * dt;
  s.morale += Math.max(-step, Math.min(step, target - s.morale));

  // Population.
  if (!r.starving && s.morale >= 35 && s.citizens < r.housing) {
    s.citizens = Math.min(r.housing, s.citizens + 0.09 * (s.morale / 60) * dt);
  } else if ((r.starving || s.morale < 20) && s.citizens > 3) {
    s.citizens = Math.max(3, s.citizens - 0.05 * dt);
  }

  // Research.
  if (s.research) {
    s.researchT -= dt * (mine.some(b => b.kind === 'vault') ? r.powerRatio : 0);
    if (s.researchT <= 0) {
      s.techs.push(s.research);
      emit(s, `Research complete: ${TECHS[s.research].name}`, 'good');
      if (s.research === 'armor') {
        for (const u of s.units) if (u.faction === 0) u.hp = Math.round(u.hp * 1.25);
      }
      s.research = null;
    }
  }

  // Tier advance.
  if (s.tierUp > 0) {
    s.tierUp -= dt;
    if (s.tierUp <= 0) {
      s.tierUp = 0;
      s.tier++;
      const core = coreOf(s, 0);
      if (core) { core.level = s.tier; core.hp = maxHp(s, core); }
      // Squads in the field get the new tier's kit straight away.
      for (const u of s.units) if (u.faction === 0) u.hp = Math.round((u.hp * tierBonus(s)) / (1 + 0.15 * (s.tier - 2)));
      emit(s, `Your city is now a ${TIERS[s.tier - 1]}`, 'good');
    }
  }
}

function construction(s: State, dt: number): void {
  for (const b of s.buildings) {
    const full = maxHp(s, b);
    if (b.build > 0) {
      const total = bdef(b).time || 1;
      b.build = Math.max(0, b.build - dt);
      b.hp = Math.min(full, b.hp + (full * 0.75 * dt) / total);
      if (b.build === 0 && b.faction === 0) emit(s, `${bdef(b).name} online`, 'good');
      continue;
    }
    if (b.upgrade > 0) {
      b.upgrade = Math.max(0, b.upgrade - dt);
      if (b.upgrade === 0) {
        const before = maxHp(s, b);
        b.level++;
        b.hp += maxHp(s, b) - before;
        emit(s, `${bdef(b).name} upgraded to level ${b.level}`, 'good');
      }
    }
    // Slow self-repair once the shooting stops.
    if (b.hp < full && s.time - b.hitT > 10) b.hp = Math.min(full, b.hp + full * 0.005 * dt);

    // Training queue.
    if (b.queue.length && b.faction === 0) {
      const q = b.queue[0];
      q.t -= dt * Math.max(0.3, s.rates.powerRatio);
      if (q.t <= 0) {
        const c = bCenter(b);
        const spot = nearestWalkable(s, c.x, c.y + 1.5);
        if (spot) {
          b.queue.shift();
          addUnit(s, q.kind, 0, spot.x + 0.5, spot.y + 0.5);
          s.trained++;
        }
      }
    }
  }
}

function nodesTick(s: State, dt: number): void {
  for (const n of s.nodes) {
    let mine = 0, theirs = 0;
    for (const u of s.units) {
      if (Math.hypot(u.x - (n.x + 0.5), u.y - (n.y + 0.5)) <= 2.5) {
        if (u.faction === 0) mine++; else theirs++;
      }
    }
    if (mine && !theirs) n.cap = Math.min(1, n.cap + dt / 6);
    else if (theirs && !mine) n.cap = Math.max(-1, n.cap - dt / 6);
    const owner = n.cap >= 1 ? 0 : n.cap <= -1 ? 1 : n.cap * (n.owner === 0 ? 1 : -1) <= 0 ? -1 : n.owner;
    if (owner !== n.owner) {
      if (owner === 0) emit(s, 'Uplink node captured', 'good');
      else if (n.owner === 0) emit(s, 'You lost an uplink node', 'warn');
      n.owner = owner;
    }
  }
}

type Target = { id: number; x: number; y: number; unit?: Unit; building?: Building };

function resolveTarget(s: State, id: number): Target | null {
  const u = getUnit(s, id);
  if (u) return u.hp > 0 ? { id, x: u.x, y: u.y, unit: u } : null;
  const b = getBuilding(s, id);
  if (b && b.hp > 0) { const c = bCenter(b); return { id, x: c.x, y: c.y, building: b }; }
  return null;
}

function targetFaction(t: Target): Faction {
  return (t.unit ?? t.building)!.faction;
}

function distTo(x: number, y: number, t: Target): number {
  return t.building ? distToBuilding(x, y, t.building) : Math.hypot(t.x - x, t.y - y);
}

function nearestEnemy(s: State, x: number, y: number, faction: Faction, range: number, unitsOnly = false): Target | null {
  let best: Target | null = null;
  let bestD = range;
  for (const u of s.units) {
    if (u.faction === faction || u.hp <= 0) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bestD) { bestD = d; best = { id: u.id, x: u.x, y: u.y, unit: u }; }
  }
  if (unitsOnly) return best;
  for (const b of s.buildings) {
    if (b.faction === faction || b.hp <= 0) continue;
    // Units prefer shooting at things that shoot back, so buildings count as a little further.
    const d = distToBuilding(x, y, b) + 1;
    if (d < bestD) { bestD = d; const c = bCenter(b); best = { id: b.id, x: c.x, y: c.y, building: b }; }
  }
  return best;
}

function damageMult(s: State, faction: Faction): number {
  return faction === 1 ? enemyPower(s) : (s.techs.includes('targeting') ? 1.25 : 1) * tierBonus(s);
}

function hit(s: State, from: { x: number; y: number; faction: Faction }, t: Target, dmg: number, big = false): void {
  const amount = dmg * damageMult(s, from.faction);
  if (t.unit) t.unit.hp -= amount;
  if (t.building) {
    t.building.hp -= amount;
    t.building.hitT = s.time;
    if (t.building.faction === 0 && s.time - s.alertT > 20) {
      s.alertT = s.time;
      emit(s, `${bdef(t.building).name} is under attack`, 'warn');
    }
  }
  s.fx.push({ type: 'shot', x1: from.x, y1: from.y, x2: t.x, y2: t.y, t: 0.14, faction: from.faction, big });
}

function pathTo(s: State, u: Unit, x: number, y: number): boolean {
  const p = findPath(s, u.x, u.y, x, y);
  if (!p) return false;
  u.path = p;
  return true;
}

function follow(s: State, u: Unit, dt: number): void {
  if (!u.path.length) return;
  const wx = u.path[0], wy = u.path[1];
  if (!walkable(s, Math.floor(wx), Math.floor(wy))) { u.path = []; u.repath = 0; return; }
  const dx = wx - u.x, dy = wy - u.y;
  const d = Math.hypot(dx, dy);
  const step = UNITS[u.kind].speed * dt;
  // Intermediate waypoints only need a near miss, so squads sharing a route do not jam on them.
  if (d <= Math.max(step, u.path.length > 2 ? 0.35 : 0.15)) {
    u.path.splice(0, 2);
  } else {
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
    u.face = Math.atan2(dy, dx);
  }
}

function unitsTick(s: State, dt: number): void {
  const playerCore = coreOf(s, 0);
  for (const u of s.units) {
    const def = UNITS[u.kind];
    u.cd = Math.max(0, u.cd - dt);
    u.scan -= dt;
    u.repath -= dt;

    // A unit caught inside a freshly placed building steps out.
    if (!walkable(s, Math.floor(u.x), Math.floor(u.y))) {
      const spot = nearestWalkable(s, u.x, u.y);
      if (spot) { u.x = spot.x + 0.5; u.y = spot.y + 0.5; u.path = []; }
    }

    let tgt = u.target ? resolveTarget(s, u.target) : null;
    if (u.target && (!tgt || targetFaction(tgt) === u.faction)) {
      u.target = 0;
      tgt = null;
      u.path = [];
      if (u.order === 'attack') u.order = 'idle';
    }
    const auto = u.order === 'idle' || u.order === 'amove';
    if (auto && !tgt && u.scan <= 0) {
      u.scan = 0.3;
      const e = nearestEnemy(s, u.x, u.y, u.faction, AGGRO);
      if (e) { u.target = e.id; tgt = e; u.path = []; u.repath = 0; }
    }

    if (tgt) {
      const d = distTo(u.x, u.y, tgt);
      if (d <= def.range) {
        u.path = [];
        u.face = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        if (u.cd <= 0) { u.cd = def.cd; hit(s, u, tgt, def.dmg, u.kind === 'mech'); }
      } else if (auto && d > AGGRO * 1.7) {
        u.target = 0; u.path = [];
      } else {
        if (!u.path.length || u.repath <= 0) {
          u.repath = 0.6;
          let gx = tgt.x, gy = tgt.y;
          if (tgt.building) {
            const size = bdef(tgt.building).size;
            gx = Math.max(tgt.building.x, Math.min(tgt.building.x + size - 1, Math.floor(u.x))) + 0.5;
            gy = Math.max(tgt.building.y, Math.min(tgt.building.y + size - 1, Math.floor(u.y))) + 0.5;
          }
          if (!pathTo(s, u, gx, gy)) { u.target = 0; if (u.order === 'attack') u.order = 'idle'; }
        }
        follow(s, u, dt);
      }
    } else if (u.order === 'move' || u.order === 'amove') {
      if (!u.path.length) {
        if (Math.hypot(u.tx - u.x, u.ty - u.y) < 0.75 || !pathTo(s, u, u.tx, u.ty) || !u.path.length) u.order = 'idle';
      }
      follow(s, u, dt);
    } else if (u.faction === 0 && playerCore && u.hp < unitMaxHp(s, u.kind, 0)) {
      // Idle squads patch up near the Nexus.
      if (distToBuilding(u.x, u.y, playerCore) < 6) u.hp = Math.min(unitMaxHp(s, u.kind, 0), u.hp + 3 * dt);
    }
  }

  // Keep units from stacking on one spot.
  const us = s.units;
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= 0.45) continue;
      if (d < 0.001) { dx = ((a.id * 7 + b.id) % 5) - 2 || 1; dy = ((a.id + b.id * 3) % 5) - 2; }
      const m = Math.hypot(dx, dy) || 1;
      const push = ((0.45 - d) / 2) * 0.5;
      const ax = a.x - (dx / m) * push, ay = a.y - (dy / m) * push;
      const bx = b.x + (dx / m) * push, by = b.y + (dy / m) * push;
      if (walkable(s, Math.floor(ax), Math.floor(ay))) { a.x = ax; a.y = ay; }
      if (walkable(s, Math.floor(bx), Math.floor(by))) { b.x = bx; b.y = by; }
    }
  }
}

function turretsTick(s: State, dt: number): void {
  for (const b of s.buildings) {
    const atk = bdef(b).attack;
    if (!atk || !isBuilt(b)) continue;
    const rate = b.faction === 0 && b.kind === 'turret' ? Math.max(0.25, s.rates.powerRatio) : 1;
    b.cd = Math.max(0, b.cd - dt * rate);
    if (b.cd > 0) continue;
    const c = bCenter(b);
    const t = nearestEnemy(s, c.x, c.y, b.faction, atk.range + bdef(b).size / 2, true);
    if (!t) { b.cd = 0.2; continue; }
    b.cd = atk.cd;
    b.aim = Math.atan2(t.y - c.y, t.x - c.x);
    hit(s, { x: c.x, y: c.y, faction: b.faction }, t, atk.dmg * lvlMult(b.level));
  }
}

function cleanup(s: State): void {
  if (s.units.some(u => u.hp <= 0)) {
    for (const u of s.units) if (u.hp <= 0) s.fx.push({ type: 'boom', x1: u.x, y1: u.y, x2: u.x, y2: u.y, t: 0.35, faction: u.faction });
    s.units = s.units.filter(u => u.hp > 0);
  }
  const dead = s.buildings.filter(b => b.hp <= 0);
  if (!dead.length) return;
  for (const b of dead) {
    const c = bCenter(b);
    s.fx.push({ type: 'boom', x1: c.x, y1: c.y, x2: c.x, y2: c.y, t: 0.7, faction: b.faction, big: true });
    for (let i = 0; i < s.occ.length; i++) if (s.occ[i] === b.id) s.occ[i] = 0;
    if (b.kind === 'core') {
      s.over = b.faction === 1 ? 'win' : 'lose';
    } else {
      emit(s, b.faction === 0 ? `${bdef(b).name} destroyed` : `Rival ${bdef(b).name} destroyed`, b.faction === 0 ? 'warn' : 'good');
    }
  }
  s.buildings = s.buildings.filter(b => b.hp > 0);
}

/** Give a unit a destination, snapping to the nearest reachable tile. */
export function sendUnit(s: State, u: Unit, x: number, y: number, order: 'move' | 'amove', taken?: Set<number>): void {
  const spot = nearestWalkable(s, x, y, taken);
  if (!spot) return;
  taken?.add(idx(spot.x, spot.y));
  u.order = order;
  u.tx = spot.x + 0.5;
  u.ty = spot.y + 0.5;
  u.target = 0;
  u.path = [];
  if (!pathTo(s, u, u.tx, u.ty)) u.order = 'idle';
}

function aiTick(s: State, dt: number): void {
  const ai = s.ai;
  const d = DIFF[s.difficulty];
  const core = coreOf(s, 1);
  if (!core) return;
  const minutes = s.time / 60;

  // Reinforcements arrive at Security Hubs (or, slowly, at the Nexus).
  ai.spawnT -= dt;
  if (ai.spawnT <= 0) {
    const hubs = s.buildings.filter(b => b.faction === 1 && b.kind === 'hub');
    const base = Math.max(6, 15 - minutes * 0.6) / d.spawn;
    ai.spawnT = hubs.length ? base : base * 2.5;
    const cap = Math.round(Math.min(22, 6 + minutes * 1.1) * d.spawn);
    const count = s.units.filter(u => u.faction === 1).length;
    if (count < cap) {
      const src = hubs.length ? hubs[Math.floor(rand(s) * hubs.length)] : core;
      const c = bCenter(src);
      const spot = nearestWalkable(s, c.x - 1, c.y + 2);
      if (spot) {
        const roll = rand(s);
        let kind: UKey = 'enforcer';
        if (minutes > 14 / d.spawn && roll > 0.8) kind = 'mech';
        else if (minutes > 6 / d.spawn && roll > 0.5) kind = 'drone';
        addUnit(s, kind, 1, spot.x + 0.5, spot.y + 0.5);
      }
    }
  }

  const targets = s.buildings.filter(b => b.faction === 0);
  if (!targets.length) return;

  // Raids.
  ai.waveT -= dt;
  if (ai.waveT <= 0) {
    ai.waveT = d.interval;
    const guards = s.units.filter(u => u.faction === 1 && u.role === 0);
    const keep = 3;
    if (guards.length > keep) {
      ai.waves++;
      const c = bCenter(core);
      // Hit the player building closest to the rival base.
      let best = targets[0], bestD = Infinity;
      for (const b of targets) {
        const dd = distToBuilding(c.x, c.y, b) * (0.8 + rand(s) * 0.4);
        if (dd < bestD) { bestD = dd; best = b; }
      }
      const bc = bCenter(best);
      const taken = new Set<number>();
      // Raids start small and grow with every wave.
      const size = Math.min(guards.length - keep, Math.round(Math.min(12, 2 + 0.8 * ai.waves) * d.spawn));
      for (const u of guards.slice(keep, keep + size)) { u.role = 1; sendUnit(s, u, bc.x, bc.y, 'amove', taken); }
      emit(s, `Raid inbound: ${size} ${size === 1 ? 'hostile' : 'hostiles'}`, 'warn');
    }
  }

  // Contest uplink nodes with a small detachment.
  ai.nodeT -= dt;
  if (ai.nodeT <= 0) {
    ai.nodeT = 70;
    const c = bCenter(core);
    const open = s.nodes.filter(n => n.owner !== 1).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
    const guards = s.units.filter(u => u.faction === 1 && u.role === 0 && u.order === 'idle' && !u.target);
    if (open.length && guards.length >= 4) {
      const taken = new Set<number>();
      for (const u of guards.slice(0, 2)) sendUnit(s, u, open[0].x + 0.5, open[0].y + 0.5, 'amove', taken);
    }
  }

  // Raiders that run out of things to shoot push on to the next building.
  ai.thinkT -= dt;
  if (ai.thinkT <= 0) {
    ai.thinkT = 3;
    for (const u of s.units) {
      if (u.faction !== 1 || u.role !== 1 || u.order !== 'idle' || u.target) continue;
      let best = targets[0], bestD = Infinity;
      for (const b of targets) {
        const dd = distToBuilding(u.x, u.y, b);
        if (dd < bestD) { bestD = dd; best = b; }
      }
      const bc = bCenter(best);
      sendUnit(s, u, bc.x, bc.y, 'amove');
    }
  }
}

export const OBJECTIVES: { text: string; done: (s: State) => boolean }[] = [
  { text: 'Build a Vat Farm to feed your citizens', done: s => has(s, 'farm') },
  { text: 'Build a Solar Canopy to power the grid', done: s => has(s, 'solar') },
  { text: 'Build a Scrap Foundry for alloy', done: s => has(s, 'foundry') },
  { text: 'Build a Hab Stack to house more citizens', done: s => has(s, 'hab') },
  { text: 'Build a Security Hub and train 3 Enforcers', done: s => has(s, 'hub') && s.trained >= 3 },
  { text: 'Capture an Uplink Node with your squad', done: s => s.nodes.some(n => n.owner === 0) },
  { text: 'Advance your city to a District', done: s => s.tier >= 2 },
  { text: 'Destroy the Vanta Collective Nexus', done: s => s.over === 'win' },
];
function has(s: State, kind: string): boolean {
  return s.buildings.some(b => b.faction === 0 && b.kind === kind && isBuilt(b));
}

export function step(s: State, dt: number = DT): void {
  if (s.over) return;
  s.time += dt;
  economy(s, dt);
  construction(s, dt);
  nodesTick(s, dt);
  aiTick(s, dt);
  unitsTick(s, dt);
  turretsTick(s, dt);
  cleanup(s);
  for (const f of s.fx) f.t -= dt;
  if (s.fx.length && s.fx[0].t <= 0) s.fx = s.fx.filter(f => f.t > 0);
  OBJECTIVES.forEach((o, i) => { if (!(s.objectives & (1 << i)) && o.done(s)) s.objectives |= 1 << i; });
  if (s.over) emit(s, s.over === 'win' ? 'The Vanta Nexus has fallen' : 'Your Nexus Spire has fallen', s.over === 'win' ? 'good' : 'warn');
}

