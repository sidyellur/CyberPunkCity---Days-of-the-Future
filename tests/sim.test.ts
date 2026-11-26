import { describe, it, expect } from 'vitest';
import { createState, coreOf, bCenter, PLAYER_CORE, RIVAL_CORE, State, nearestWalkable, placementError } from '../src/sim/state';
import { findPath } from '../src/sim/path';
import { step, DT, daylight } from '../src/sim/sim';
import { placeBuilding, trainUnit, orderMove, orderAttack, advanceTier, upgradeBuilding, startResearch, demolish } from '../src/sim/commands';
import { BKey } from '../src/sim/defs';

const run = (s: State, seconds: number) => { for (let i = 0; i < seconds / DT; i++) step(s); };

function build(s: State, kind: BKey): number {
  for (let r = 0; r < 12; r++) {
    for (let y = PLAYER_CORE.y - r; y <= PLAYER_CORE.y + r; y++) {
      for (let x = PLAYER_CORE.x - r; x <= PLAYER_CORE.x + r; x++) {
        if (!placementError(s, kind, x, y)) {
          expect(placeBuilding(s, kind, x, y)).toBeNull();
          return s.buildings[s.buildings.length - 1].id;
        }
      }
    }
  }
  throw new Error('no room for ' + kind);
}

describe('map', () => {
  it('has a land route between the two cities on several seeds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createState('normal', seed);
      const a = nearestWalkable(s, PLAYER_CORE.x + 4, PLAYER_CORE.y)!;
      const b = nearestWalkable(s, RIVAL_CORE.x - 2, RIVAL_CORE.y + 4)!;
      expect(findPath(s, a.x, a.y, b.x, b.y)?.length).toBeGreaterThan(20);
    }
  });
  it('places the whole rival base', () => {
    const s = createState();
    expect(s.buildings.filter(b => b.faction === 1).length).toBe(13);
  });
});

describe('economy', () => {
  it('grows a staffed, powered city and stalls a starving one', () => {
    const s = createState('easy');
    build(s, 'farm'); build(s, 'solar'); build(s, 'foundry'); build(s, 'hab');
    run(s, 60);
    expect(s.rates.income.alloy).toBeGreaterThan(0.5);
    expect(s.rates.income.food).toBeGreaterThan(0);
    expect(s.citizens).toBeGreaterThan(8);
    expect(s.objectives & 0b1111).toBe(0b1111);

    const hungry = createState('easy');
    hungry.res.food = 0;
    run(hungry, 60);
    expect(hungry.rates.starving).toBe(true);
    expect(hungry.morale).toBeLessThan(40);
    expect(hungry.citizens).toBeLessThanOrEqual(6);
  });
  it('browns out when demand outruns supply', () => {
    const s = createState('easy');
    s.res.credits = 5000; s.res.alloy = 5000;
    for (let i = 0; i < 5; i++) build(s, 'foundry');
    run(s, 20);
    expect(s.rates.powerRatio).toBeLessThan(1);
    expect(daylight(0)).toBeGreaterThan(daylight(150));
  });
  it('advances tiers, upgrades, researches and refunds', () => {
    const s = createState('easy');
    expect(advanceTier(s)).toBe('Not enough resources');
    s.res = { credits: 9000, alloy: 9000, food: 500, data: 500 };
    const farm = build(s, 'farm');
    run(s, 12);
    expect(upgradeBuilding(s, farm)).toMatch(/Advance the Nexus/);
    expect(advanceTier(s)).toBeNull();
    run(s, 31);
    expect(s.tier).toBe(2);
    expect(upgradeBuilding(s, farm)).toBeNull();
    build(s, 'vault');
    run(s, 20);
    expect(s.buildings.find(b => b.id === farm)!.level).toBe(2);
    expect(startResearch(s, 'grid')).toBeNull();
    run(s, 40);
    expect(s.techs).toContain('grid');
    const before = s.res.credits;
    expect(demolish(s, farm)).toBeNull();
    expect(s.res.credits).toBeGreaterThan(before);
    expect(s.occ.includes(farm)).toBe(false);
  });
});

describe('combat', () => {
  it('trains squads that march across the map and win a fight', () => {
    const s = createState('easy');
    s.res = { credits: 99999, alloy: 99999, food: 99999, data: 0 };
    const hub = build(s, 'hub');
    run(s, 16);
    for (let i = 0; i < 5; i++) expect(trainUnit(s, hub, 'enforcer')).toBeNull();
    expect(trainUnit(s, hub, 'mech')).toMatch(/Requires/);
    run(s, 45);
    const mine = s.units.filter(u => u.faction === 0);
    expect(mine.length).toBe(7);
    orderMove(s, mine.map(u => u.id), 22.5, 22.5);
    run(s, 40);
    expect(s.nodes[0].owner).toBe(0);
    for (const u of mine) expect(Math.hypot(u.x - 22.5, u.y - 22.5)).toBeLessThan(4);
  });
  it('ends the game when a Nexus falls', () => {
    const s = createState('easy');
    const rival = coreOf(s, 1)!;
    const c = bCenter(rival);
    for (let i = 0; i < 30; i++) s.units.push({ ...s.units[0], id: s.nextId++, kind: 'mech', hp: 5000, x: c.x - 3.5, y: c.y + 4.5 + (i % 3) });
    orderAttack(s, s.units.filter(u => u.faction === 0).map(u => u.id), rival.id);
    run(s, 90);
    expect(s.over).toBe('win');
  });
  it('sends raids that an undefended city eventually loses to', () => {
    const s = createState('hard');
    s.units = s.units.filter(u => u.faction === 1);
    run(s, 60 * 30);
    console.log('undefended hard city fell at', Math.round(s.time), 's after', s.ai.waves, 'waves');
    expect(s.ai.waves).toBeGreaterThanOrEqual(2);
    expect(s.over).toBe('lose');
  });
  it('survives a save and load round trip', () => {
    const s = createState();
    run(s, 30);
    const copy = JSON.parse(JSON.stringify(s)) as State;
    run(s, 30); run(copy, 30);
    expect(copy.res).toEqual(s.res);
    expect(copy.units.map(u => [u.x, u.y])).toEqual(s.units.map(u => [u.x, u.y]));
  });
});
