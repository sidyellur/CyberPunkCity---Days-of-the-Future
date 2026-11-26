import { describe, it, expect } from 'vitest';
import { createCity, brief, grow, upgradeArchitect, recompute, CityState, DT, GovState, Mods } from '../src/city/model';
import { advise } from '../src/city/architect';
import {
  tick, setPolicy, setAutonomy, decide, strikeThreshold, INITIATIVES, EVENTS, POLICY_COOLDOWN,
} from '../src/city/governance';

const run = (s: CityState, seconds: number) => { for (let i = 0; i < seconds / DT; i++) tick(s); };
const rich = (s: CityState) => { s.res = { credits: 99999, alloy: 99999, food: 99999, data: 99999 }; };

/** A small working town to govern. */
function town(): CityState {
  const s = createCity(2);
  rich(s);
  for (const [i, k] of [[30, 'farms'], [31, 'power'], [32, 'housing'], [39, 'housing'], [41, 'industry'], [48, 'commerce'], [49, 'park'], [50, 'industry'], [21, 'industry']] as const) brief(s, i, k, 'balanced');
  s.gov.nextEvent = s.gov.nextInitiative = 1e9; // keep surprises out unless a test asks for them
  run(s, 120);
  return s;
}

describe('policy', () => {
  it('changes how the city runs and has a cooldown', () => {
    const s = town();
    const before = s.rates.income.alloy;
    expect(setPolicy(s, 'hours', 0)).toBeNull();
    run(s, 2);
    expect(s.mods.out.alloy).toBeCloseTo(1.15);
    expect(s.rates.income.alloy).toBeGreaterThan(before * 1.05);
    expect(setPolicy(s, 'hours', 2)).toMatch(/recently/);
    run(s, POLICY_COOLDOWN);
    expect(setPolicy(s, 'hours', 2)).toBeNull();
  });
  it('pleases some groups and angers others', () => {
    const a = town(), b = town();
    setPolicy(a, 'wealth', 0); setPolicy(b, 'wealth', 2);
    run(a, 90); run(b, 90);
    expect(a.gov.groups.enterprise.sat).toBeGreaterThan(b.gov.groups.enterprise.sat + 10);
    expect(b.gov.groups.labour.sat).toBeGreaterThan(a.gov.groups.labour.sat + 10);
    expect(a.mods.out.credits).toBeGreaterThan(b.mods.out.credits * 1.3);
  });
});

describe('autonomy', () => {
  it('supervised: the Architect handles food and power but nothing else', () => {
    const s = createCity(4);
    setAutonomy(s, 1);
    run(s, 240);
    const kinds = new Set(s.districts.filter(d => d).map(d => d!.intent));
    expect(kinds.has('farms')).toBe(true);
    expect([...kinds].every(k => k === 'farms' || k === 'power')).toBe(true);
  });
  it('trades trust for speed', () => {
    const low = town(), high = town();
    // No spare resources, so the comparison is about attitudes and not about what gets built.
    for (const s of [low, high]) s.res = { credits: 0, alloy: 0, food: 99999, data: 0 };
    setAutonomy(high, 3);
    run(low, 140); run(high, 140);
    expect(high.mods.build).toBeGreaterThan(low.mods.build);
    expect(high.gov.trust).toBeLessThan(low.gov.trust - 5);
    expect(high.gov.groups.commons.sat).toBeLessThan(low.gov.groups.commons.sat - 8);
  });
  it('sovereign: the Architect rewrites policy by itself', () => {
    const s = town();
    setPolicy(s, 'hours', 2);
    setAutonomy(s, 3);
    run(s, 320);
    expect(s.gov.policies.hours).toBe(0);
  });
  const results: Record<number, { trust: number; citizens: number }> = {};
  for (const level of [0, 2, 3]) {
    it(`a full game at autonomy ${level}`, () => {
      const s = createCity(3);
      setAutonomy(s, level);
      let lowestTrust = 100, strikes = 0, wasStrike = false, decisions = 0;
      for (let t = 0; t < 50 * 60 / DT; t++) {
        tick(s);
        if (s.time > 180) lowestTrust = Math.min(lowestTrust, s.gov.trust);
        if (s.gov.strike && !wasStrike) strikes++;
        wasStrike = !!s.gov.strike;
        if (t % 50) continue;
        // At Advisory the player approves by hand; they refuse anything troubling at every level.
        if (s.gov.pending) {
          const p = s.gov.pending;
          if (p.kind === 'event') decide(s, 0);
          else if (INITIATIVES[p.id].troubling) decide(s, 1);
          else decide(s, 0);
          decisions++;
        }
        if (level === 0) {
          const a = advise(s);
          if (a.kind !== 'wait' && a.affordable) a.kind === 'brief' ? brief(s, a.site, a.intent!, a.character!) : a.kind === 'grow' ? grow(s, a.site) : upgradeArchitect(s);
        }
      }
      console.log(`autonomy ${level}`, {
        citizens: Math.round(s.citizens), morale: Math.round(s.morale), trust: Math.round(s.gov.trust), lowestTrust: Math.round(lowestTrust), strikes, decisions,
        architect: s.architect, districts: s.districts.filter(d => d).length, enacted: s.gov.enacted.join(','),
        groups: Object.values(s.gov.groups).map(g => `${Math.round(g.share * 100)}%:${Math.round(g.sat)}`).join(' '),
        policies: Object.values(s.gov.policies).join(''),
      });
      expect(s.citizens).toBeGreaterThan(1500);
      expect(s.architect).toBeGreaterThanOrEqual(3);
      expect(s.rates.starving).toBe(false);
      // A careful hand keeps trust from collapsing; handing over everything does not.
      if (level === 0) expect(lowestTrust).toBeGreaterThan(30);
      results[level] = { trust: s.gov.trust, citizens: s.citizens };
      if (level === 3) {
        expect(results[3].trust).toBeLessThan(results[0].trust);
        expect(results[3].citizens).toBeGreaterThan(results[0].citizens);
      }
    });
  }
});

describe('decisions', () => {
  it('a troubling initiative costs trust when approved and earns a little when refused', () => {
    const yes = town(), no = town();
    for (const s of [yes, no]) s.gov.pending = { id: 'automation', kind: 'initiative', t: 50, total: 50, site: -1 };
    expect(decide(yes, 0)).toBeNull(); expect(decide(no, 1)).toBeNull();
    expect(yes.gov.enacted).toContain('automation');
    expect(no.gov.refused).toContain('automation');
    run(yes, 120); run(no, 120);
    expect(yes.mods.jobs).toBeCloseTo(0.8);
    expect(yes.rates.income.alloy).toBeGreaterThan(no.rates.income.alloy);
    expect(yes.gov.trust).toBeLessThan(no.gov.trust - 4);
    expect(yes.gov.groups.labour.sat).toBeLessThan(no.gov.groups.labour.sat - 8);
  });
  it('an unanswered initiative lapses at low autonomy and goes ahead at high autonomy', () => {
    const low = town(), high = town();
    setAutonomy(high, 2);
    for (const s of [low, high]) s.gov.pending = { id: 'dividend', kind: 'initiative', t: 5, total: 5, site: -1 };
    run(low, 6); run(high, 6);
    expect(low.gov.enacted).toEqual([]);
    expect(high.gov.enacted).toEqual(['dividend']);
  });
  it('urban renewal clears and rebuilds the chosen district', () => {
    const s = town(); // housing at 32 sits beside industry at 41
    const site = INITIATIVES.renewal.site!(s);
    expect(site).toBe(32);
    s.gov.pending = { id: 'renewal', kind: 'initiative', t: 50, total: 50, site };
    const homes = s.rates.housing;
    decide(s, 0);
    run(s, 1);
    expect(s.rates.housing).toBeLessThan(homes);
    run(s, 30);
    expect(s.districts[32]!.character).toBe('efficient');
    expect(s.rates.housing).toBeGreaterThan(homes);
  });
  it('events offer two real choices and resolve by themselves if ignored', () => {
    const a = town(), b = town(), c = town();
    for (const s of [a, b, c]) s.gov.pending = { id: 'blackout', kind: 'event', t: 60, total: 60, site: -1 };
    decide(a, 0); decide(b, 1);
    run(a, 2); run(b, 2); run(c, 61);
    expect(a.mods.out.alloy).toBeCloseTo(0.5);
    expect(b.mods.morale).toBeLessThan(a.mods.morale - 5);
    expect(c.gov.pending).toBeNull();
    expect(Object.keys(EVENTS).length).toBeGreaterThanOrEqual(6);
  });
  it('unhappy groups strike, unless the city is watched closely', () => {
    const s = town();
    s.gov.groups.labour.sat = 5;
    setPolicy(s, 'hours', 0); setPolicy(s, 'wealth', 0); setPolicy(s, 'housing', 0);
    for (let i = 0; i < 2000 && !s.gov.strike; i++) { s.gov.groups.labour.sat = 5; tick(s); }
    tick(s);
    expect(s.gov.strike?.group).toBe('labour');
    expect(s.mods.out.alloy).toBeLessThan(0.6);
    run(s, 80);
    expect(s.gov.strike).toBeNull();
    setPolicy(s, 'oversight', 2);
    expect(strikeThreshold(s.gov)).toBe(-1);
  });
});

describe('saves', () => {
  it('round-trips governance and upgrades saves from before it existed', () => {
    const s = town();
    setAutonomy(s, 2); setPolicy(s, 'wealth', 2);
    s.gov.nextEvent = 5; s.gov.nextInitiative = 40;
    run(s, 60);
    const copy = JSON.parse(JSON.stringify(s)) as CityState;
    run(s, 120); run(copy, 120);
    expect(copy.gov).toEqual(s.gov);
    expect(copy.res).toEqual(s.res);

    const old = JSON.parse(JSON.stringify(createCity(1))) as Partial<CityState> & { gov?: GovState; mods?: Mods };
    delete old.gov; delete old.mods;
    recompute(old as CityState);
    run(old as CityState, 5);
    expect((old as CityState).gov.trust).toBeGreaterThan(0);
  });
});
