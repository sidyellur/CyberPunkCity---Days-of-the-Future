// A simple scripted player. It proves the full arc is playable: grow, defend, advance, and win.
import { describe, it, expect } from 'vitest';
import { createState, placementError, PLAYER_CORE, State, coreOf, isBuilt, canAfford } from '../src/sim/state';
import { step, DT } from '../src/sim/sim';
import { placeBuilding, trainUnit, orderAttack, orderMove, advanceTier, upgradeBuilding, startResearch } from '../src/sim/commands';
import { BKey, BUILDINGS, UNITS, TECH_ORDER, Difficulty, UKey } from '../src/sim/defs';

function tryBuild(s: State, kind: BKey): boolean {
  if (!canAfford(s, BUILDINGS[kind].cost) || BUILDINGS[kind].tier > s.tier) return false;
  for (let r = 2; r < 14; r++) {
    for (let y = PLAYER_CORE.y - r; y <= PLAYER_CORE.y + r; y += 3) {
      for (let x = PLAYER_CORE.x - r; x <= PLAYER_CORE.x + r; x += 3) {
        if (!placementError(s, kind, x, y)) return placeBuilding(s, kind, x, y) === null;
      }
    }
  }
  return false;
}

function play(difficulty: Difficulty, minutes: number) {
  const s = createState(difficulty, 3);
  const count = (k: BKey) => s.buildings.filter(b => b.faction === 0 && b.kind === k).length;
  let attacking = false;
  for (let tick = 0; tick < (minutes * 60) / DT && !s.over; tick++) {
    step(s);
    if (tick % 30) continue; // think once a second
    if (import.meta.env.VITE_BOT_LOG && tick % 1800 === 0) console.log(difficulty, Math.round(s.time / 60), 'min', Object.values(s.res).map(Math.round).join('/'), 'inc', Object.values(s.rates.income).map(v => v.toFixed(1)).join('/'), 'pwr', Math.round(s.rates.powerSupply) + '/' + Math.round(s.rates.powerDemand), 'pop', Math.floor(s.citizens) + '/' + s.rates.housing, 'idle', s.rates.idle, 'mor', Math.round(s.morale), 'tier', s.tier, 'army', s.units.filter(u => u.faction === 0).length, 'vs', s.units.filter(u => u.faction === 1).length, s.buildings.filter(b => b.faction === 0).map(b => b.kind[0] + b.kind[1]).join(''));
    const r = s.rates;
    const army = s.units.filter(u => u.faction === 0);
    const pending = (k: BKey) => s.buildings.some(b => b.faction === 0 && b.kind === k && !isBuilt(b));
    const want = (k: BKey, n: number) => count(k) < n && !pending(k) && tryBuild(s, k);
    // Needs first, then jobs for idle citizens, then defence and growth.
    const job = (): boolean => (s.res.alloy < s.res.credits ? want('foundry', 4) || want('market', 4) : want('market', 4) || want('foundry', 4));
    // Once the basics are up, bank resources for the next tier instead of sprawling.
    const saving = s.tier < 4 && s.tierUp === 0 && count('market') >= 1 + s.tier && count('foundry') >= 1 + s.tier && count('hub') > 0;
    if (r.income.food < 0.3 && want('farm', 8)) { /* built */ }
    else if ((saving ? r.powerRatio < 0.9 : r.powerSupply - r.powerDemand < 3) && ((s.tier >= 2 && want('fusion', 4)) || want('solar', 10))) { /* built */ }
    else if (s.citizens >= r.housing - 1 && r.idle < 3 && want('hab', 9)) { /* built */ }
    else if (!saving && r.idle >= 3 && ((s.tier >= 2 && want('vault', 2)) || job())) { /* built */ }
    else if (want('hub', 1) || want('turret', 2 + 2 * s.tier)) { /* built */ }
    else if (s.tier < 4 && advanceTier(s) === null) { /* advancing */ }
    else if (saving) { /* banking */ }
    else if (s.tier >= 2 && (want('plaza', 2) || want('hub', 3))) { /* built */ }
    else for (const b of s.buildings) if (b.faction === 0 && b.kind !== 'core' && b.level < s.tier && upgradeBuilding(s, b.id) === null) break;
    if (!s.research) for (const k of TECH_ORDER) if (startResearch(s, k) === null) break;
    const rich = s.res.credits > 300 && s.res.alloy > 200;
    for (const b of s.buildings) {
      if (b.faction !== 0 || b.kind !== 'hub' || !isBuilt(b) || b.queue.length >= 2) continue;
      if (army.length >= 5 + s.ai.waves && (saving || !rich)) continue;
      const kind: UKey = s.tier >= 3 && UNITS.mech.supply + r.supply <= r.supplyCap ? 'mech' : s.tier >= 2 && army.length % 2 ? 'drone' : 'enforcer';
      trainUnit(s, b.id, kind);
    }
    const rival = coreOf(s, 1);
    if (!attacking && r.supply >= r.supplyCap - 3 && s.tier >= 3) attacking = true;
    if (attacking && r.supply < r.supplyCap * 0.4) attacking = false;
    if (tick % 150 === 0 && rival) {
      const ids = army.map(u => u.id);
      if (attacking) {
        // Clear the base from the outside in: nearest rival structure first, Nexus last.
        const targets = s.buildings.filter(b => b.faction === 1);
        const lead = army[0];
        targets.sort((a, b) => Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y));
        orderAttack(s, ids, targets[0].id);
      } else {
        // Answer raids where they land; otherwise hold near the Nexus.
        const hit = s.buildings.find(b => b.faction === 0 && s.time - b.hitT < 4);
        if (hit) orderMove(s, ids, hit.x, hit.y, true);
        else orderMove(s, army.filter(u => u.order === 'idle' && !u.target).map(u => u.id), PLAYER_CORE.x + 6, PLAYER_CORE.y - 3, true);
      }
    }
  }
  return s;
}

describe('scripted player', () => {
  for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
    it(`plays a full game on ${d}`, () => {
      const s = play(d, 60);
      console.log(d, { over: s.over, minutes: +(s.time / 60).toFixed(1), tier: s.tier, waves: s.ai.waves,
        citizens: Math.floor(s.citizens), morale: Math.round(s.morale), army: s.units.filter(u => u.faction === 0).length,
        rivalUnits: s.units.filter(u => u.faction === 1).length, rivalBuildings: s.buildings.filter(b => b.faction === 1).length,
        res: Object.values(s.res).map(Math.round).join('/'), techs: s.techs.length });
      // Easy must be winnable by this clumsy bot; on Normal it must at least hold out and reach Sector.
      if (d === 'easy') expect(s.over).toBe('win');
      if (d === 'normal') { expect(s.over).not.toBe('lose'); expect(s.tier).toBeGreaterThanOrEqual(3); }
    });
  }
});
