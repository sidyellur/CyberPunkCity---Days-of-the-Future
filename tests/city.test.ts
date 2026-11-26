import { describe, it, expect } from 'vitest';
import {
  createCity, step, brief, grow, clearSite, upgradeArchitect, recompute, adjacency, briefCost, CENTRE, DT, CityState, currentObjective,
} from '../src/city/model';
import { advise, chooseSite } from '../src/city/architect';

const run = (s: CityState, seconds: number) => { for (let i = 0; i < seconds / DT; i++) step(s); };

describe('briefs', () => {
  it('raise a district that only works once it is standing', () => {
    const s = createCity();
    expect(brief(s, CENTRE, 'farms', 'balanced')).toMatch(/plaza/);
    expect(brief(s, 0, 'research', 'balanced')).toMatch(/level 2/);
    expect(brief(s, 31, 'farms', 'balanced')).toBeNull();
    expect(brief(s, 31, 'power', 'balanced')).toMatch(/already/);
    run(s, 5);
    expect(s.rates.income.food).toBeLessThan(0);
    run(s, 12);
    expect(s.districts[31]!.standing).toBe(1);
    expect(s.rates.income.food).toBeGreaterThan(1);
  });
  it('cost more when dense and at higher levels, and refund part on clearing', () => {
    expect(briefCost('housing', 'efficient', 1).credits).toBeGreaterThan(briefCost('housing', 'balanced', 1).credits!);
    expect(briefCost('housing', 'balanced', 2).credits).toBeGreaterThan(briefCost('housing', 'balanced', 1).credits! * 1.5);
    const s = createCity();
    brief(s, 31, 'housing', 'balanced');
    const before = s.res.credits;
    expect(clearSite(s, 31)).toBeNull();
    expect(s.res.credits).toBeGreaterThan(before);
    expect(s.districts[31]).toBeNull();
  });
  it('cannot grow past the Architect level, and keep working while they grow', () => {
    const s = createCity();
    s.res = { credits: 99999, alloy: 99999, food: 99999, data: 99999 };
    brief(s, 31, 'farms', 'balanced');
    run(s, 20);
    expect(grow(s, 31)).toMatch(/Upgrade the Architect/);
    expect(upgradeArchitect(s)).toBeNull();
    run(s, 31);
    expect(s.architect).toBe(2);
    expect(grow(s, 31)).toBeNull();
    run(s, 2);
    expect(s.districts[31]!.standing).toBe(1);
    expect(s.rates.income.food).toBeGreaterThan(0.5);
    run(s, 30);
    expect(s.districts[31]!.standing).toBe(2);
  });
});

describe('economy', () => {
  it('rewards good neighbours and punishes bad ones', () => {
    const s = createCity();
    s.res = { credits: 99999, alloy: 99999, food: 99999, data: 0 };
    brief(s, 30, 'housing', 'balanced'); brief(s, 31, 'industry', 'balanced');
    expect(adjacency(s, 30, 'housing').morale).toBe(-4);
    clearSite(s, 31); brief(s, 31, 'park', 'balanced'); brief(s, 21, 'commerce', 'balanced');
    expect(adjacency(s, 30, 'housing').morale).toBe(4);
    expect(adjacency(s, 21, 'commerce').outMult).toBeCloseTo(1.2);
  });
  it('browns out, starves and recovers', () => {
    const s = createCity();
    s.res = { credits: 99999, alloy: 99999, food: 0, data: 0 };
    for (const i of [30, 31, 32, 39, 41, 48, 49, 50]) brief(s, i, 'industry', 'efficient');
    run(s, 40);
    expect(s.rates.powerRatio).toBeLessThan(1);
    expect(s.rates.starving).toBe(true);
    expect(s.morale).toBeLessThan(40);
    const low = s.citizens;
    for (const i of [30, 31, 32, 39]) clearSite(s, i);
    brief(s, 30, 'farms', 'green'); brief(s, 31, 'power', 'balanced'); brief(s, 32, 'park', 'balanced'); brief(s, 39, 'housing', 'green');
    run(s, 240);
    expect(s.rates.starving).toBe(false);
    expect(s.citizens).toBeGreaterThan(low);
  });
  it('survives a save and load round trip', () => {
    const s = createCity();
    brief(s, 31, 'farms', 'balanced');
    run(s, 30);
    const copy = JSON.parse(JSON.stringify(s)) as CityState;
    recompute(copy);
    run(s, 30); run(copy, 30);
    expect(copy.res).toEqual(s.res);
    expect(copy.citizens).toBe(s.citizens);
  });
});

describe('the Architect', () => {
  it('keeps housing away from industry when it picks a site', () => {
    const s = createCity();
    s.res = { credits: 99999, alloy: 99999, food: 99999, data: 0 };
    brief(s, 31, 'industry', 'balanced');
    expect([30, 32, 22].includes(chooseSite(s, 'housing'))).toBe(false);
  });
  // A quick player and a distracted one; both only ever approve what the Architect proposes.
  for (const [name, every] of [['attentive', 20], ['distracted', 120]] as const) {
    it(`builds a thriving city for an ${name} player who approves every proposal`, () => {
      const s = createCity(3);
      let approved = 0, lowest = 100;
      const log: string[] = [];
      for (let t = 0; t < 60 * 60 / DT; t++) {
        step(s);
        if (s.time > 120) lowest = Math.min(lowest, s.morale);
        if (t % every) continue;
        const a = advise(s);
        if (import.meta.env.VITE_BOT_LOG && t % 3000 === 0) log.push(`${(s.time / 60).toFixed(0)}m pop ${Math.round(s.citizens)}/${s.rates.housing} morale ${Math.round(s.morale)} arch ${s.architect} districts ${s.districts.filter(d => d).length} jobs ${s.rates.employed}/${s.rates.workers} res ${Object.values(s.res).map(Math.round).join('/')} | ${a.title} ${a.affordable}`);
        if (!a.affordable) continue;
        const err = a.kind === 'brief' ? brief(s, a.site, a.intent!, a.character!) : a.kind === 'grow' ? grow(s, a.site) : upgradeArchitect(s);
        expect(err).toBeNull();
        approved++;
      }
      console.log(name, {
        approved, citizens: Math.round(s.citizens), morale: Math.round(s.morale), lowest: Math.round(lowest), architect: s.architect,
        districts: s.districts.filter(d => d).length, objective: currentObjective(s),
        res: Object.values(s.res).map(Math.round).join('/'), income: Object.values(s.rates.income).map(v => v.toFixed(1)).join('/'),
      });
      if (log.length) console.log(log.join('\n'));
      expect(s.rates.starving).toBe(false);
      expect(lowest).toBeGreaterThan(40);
      expect(s.citizens).toBeGreaterThan(1500);
      expect(s.architect).toBe(4);
      expect(currentObjective(s)).toBe(-1);
    });
  }
});
