import { describe, it, expect } from 'vitest';
import { createCity, step, brief, grow, upgradeArchitect, DT, CityState, Intent } from '../src/city/model';
import { advise, chooseSite } from '../src/city/architect';
import {
  ConflictState, Difficulty, RivalId, RIVALS, RIVAL_ORDER, DIFFICULTIES, POSTURES, FLEET, RAID, HACK, DIPLOMACY, OPS, NEXUS,
  createConflict, stepConflict, setPosture, setObjective, commissionFleet, standDownFleet, launchOperation, propose, threatSummary,
  homeDefence, rivalDefence, raidPower, totalStrength, fleetCap, fleetUpkeep, buyoutPrice, stanceOf, escalation,
} from '../src/city/conflict';

const tickBoth = (s: CityState, c: ConflictState) => { step(s); stepConflict(s, c, DT); };
const run = (s: CityState, c: ConflictState, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) tickBoth(s, c); };
const last = (c: ConflictState) => c.events[c.events.length - 1];

/** A rich, staffed level-2 city with the given districts already standing, and the grace period over. */
function standingCity(layout: Partial<Record<Intent, number>>, seed = 1, difficulty: Difficulty = 'normal') {
  const s = createCity(seed);
  s.res = { credits: 50000, alloy: 50000, food: 50000, data: 5000 };
  s.architect = 2; s.citizens = 900;
  const sites = [30, 31, 32, 39, 41, 48, 49, 50, 20, 21, 22, 23, 24, 29, 33, 38, 42, 47, 51, 56, 57, 58, 59, 60];
  let n = 0;
  for (const intent of Object.keys(layout) as Intent[]) {
    for (let k = 0; k < layout[intent]!; k++) expect(brief(s, sites[n++], intent, 'balanced')).toBeNull();
  }
  for (let i = 0; i < 30 / DT; i++) step(s);
  const c = createConflict(seed, difficulty);
  c.time = DIFFICULTIES[difficulty].grace + 1;
  return { s, c };
}
/** Pin a rival's economy and strength so a test controls exactly what it can send. */
function pin(c: ConflictState, id: RivalId, strength: number) {
  const r = c.rivals[id];
  r.strength = strength;
  r.economy = r.peak = strength / RIVALS[id].militarism;
  return r;
}
const quiet = (c: ConflictState, id: RivalId) => { c.rivals[id].raidIn = 1e6; c.rivals[id].hackIn = 1e6; };
const noHacks = (c: ConflictState) => { for (const id of RIVAL_ORDER) c.rivals[id].hackIn = 1e6; };

// ---------- Scripted full games ----------

type Commander = (s: CityState, c: ConflictState) => void;

/** Builds and grows defence districts once the Architect can design them. */
function raiseDefences(s: CityState, want: number) {
  if (s.architect < 2) return;
  const sites: number[] = [];
  s.districts.forEach((d, i) => { if (d?.intent === 'defence') sites.push(i); });
  if (sites.some(i => s.districts[i]!.build > 0)) return;
  if (sites.length < want) { brief(s, chooseSite(s, 'defence'), 'defence', 'balanced'); return; }
  const low = sites.filter(i => s.districts[i]!.level < s.architect).sort((a, b) => s.districts[a]!.level - s.districts[b]!.level)[0];
  if (low !== undefined && s.res.credits > 3000 * s.architect) grow(s, low);
}
/** Tops the fleet up to a share of what the city can run, keeping a reserve for building. */
function fundFleet(s: CityState, c: ConflictState, share: number) {
  const want = fleetCap(s) * share - c.fleet - c.fleetOrdered;
  const reserve = 300 * s.architect * s.architect;
  if (want >= 5 && s.res.credits > reserve + 5 * FLEET.credits && s.res.alloy > reserve + 5 * FLEET.alloy) commissionFleet(s, c, 5);
}
const active = (c: ConflictState) => RIVAL_ORDER.map(id => c.rivals[id]).filter(r => r.status === 'active');

/** Uses every tool: defences, fleet, firewall, blinding hacks before strikes, and demands once a rival wavers. */
const general: Commander = (s, c) => {
  raiseDefences(s, s.architect + 2);
  fundFleet(s, c, 1);
  if (c.time < DIFFICULTIES[c.difficulty].grace) return;
  if (c.firewall === 0 && s.res.data >= 200) launchOperation(s, c, 'firewall');
  for (const r of active(c)) propose(s, c, r.id, { kind: 'demand' });
  const target = active(c).filter(r => r.truce === 0 && r.trade === 0).sort((a, b) => rivalDefence(a) - rivalDefence(b))[0];
  if (!target) return;
  // The worst raid any rival could send, and whether the home guard would hold under a posture.
  const worst = Math.max(...active(c).map(raidPower));
  const holds = (p: 'raid' | 'allout') => (4 + s.rates.defence + c.fleet * POSTURES[p].home) * RAID.repelBelow > worst;
  const wins = (p: 'raid' | 'allout', wall: number) => c.fleet * POSTURES[p].strike > wall * 1.1;
  const wall = rivalDefence(target), blindWall = target.strength * RIVALS[target.id].fort * HACK.blindDefence;
  const pick = (w: number) => (wins('raid', w) && holds('raid') ? 'raid' : wins('allout', w) && holds('allout') ? 'allout' : null);
  const now = pick(wall);
  if (now) {
    setPosture(c, now);
    setObjective(s, c, { kind: 'breakForces', rival: target.id });
  } else if (pick(blindWall) && s.res.data >= OPS.blind.data) {
    launchOperation(s, c, 'blind', target.id);
  } else {
    // Not ready: sit behind the walls, strike back when raided, and gnaw at them with sabotage.
    setPosture(c, 'deter');
    if (s.res.data >= (s.architect < 4 ? 600 : 100)) launchOperation(s, c, 'sabotage', target.id);
  }
};

/** Never attacks. Buys Meridian Exchange with gifts, trade and a buyout, and holds Karst Hold off. */
const diplomat: Commander = (s, c) => {
  raiseDefences(s, s.architect + 1);
  fundFleet(s, c, 0.8);
  const m = c.rivals.meridian;
  if (m.status !== 'active') return;
  if (m.relations < DIPLOMACY.buyoutRelations + 5 && m.tributeCooldown === 0 && s.res.credits > 1500) propose(s, c, 'meridian', { kind: 'tribute', credits: 800 });
  if (m.trade < 60) propose(s, c, 'meridian', { kind: 'trade' });
  propose(s, c, 'meridian', { kind: 'buyout' });
};

/** Never strikes. Wears Karst Hold down with sabotage and blackouts from behind strong walls. */
const hacker: Commander = (s, c) => {
  raiseDefences(s, s.architect + 1);
  fundFleet(s, c, 0.8);
  if (c.time < DIFFICULTIES[c.difficulty].grace) return;
  const k = c.rivals.karst;
  if (k.status !== 'active') return;
  if (c.firewall === 0 && s.res.data >= 150) launchOperation(s, c, 'firewall');
  if (propose(s, c, 'karst', { kind: 'demand' }) === null) return;
  if (s.res.data >= 120) launchOperation(s, c, k.brownout === 0 && k.resolve < 60 ? 'brownout' : 'sabotage', 'karst');
};

const bystander: Commander = () => {};

function playGame(name: string, seed: number, difficulty: Difficulty, minutes: number, commander: Commander, stopOnWin = true) {
  const s = createCity(seed), c = createConflict(seed, difficulty);
  for (let t = 0; t < minutes * 60 / DT; t++) {
    tickBoth(s, c);
    if (c.over && (stopOnWin || c.over === 'lose')) break;
    if (t % 20) continue;
    // The commander goes first every few seconds so defence gets its share before the Architect spends.
    if (t % 60 === 0 && !c.over) commander(s, c);
    const a = advise(s);
    if (a.affordable) {
      if (a.kind === 'brief') brief(s, a.site, a.intent!, a.character!);
      else if (a.kind === 'grow') grow(s, a.site);
      else if (a.kind === 'upgrade') upgradeArchitect(s);
    }
  }
  const rivals = RIVAL_ORDER.map(id => {
    const r = c.rivals[id];
    return `${id} ${r.status}${r.endedAt ? ` at ${(r.endedAt / 60).toFixed(0)}m` : ''} eco ${Math.round(r.economy)} str ${Math.round(r.strength)} res ${Math.round(r.resolve)} rel ${Math.round(r.relations)}`;
  }).join(' | ');
  console.log(`[${name}] ${difficulty} seed ${seed}: ${c.over ?? 'undecided'} at ${(c.time / 60).toFixed(1)}m | nexus ${Math.round(c.nexus)} fleet ${Math.round(c.fleet)} defence ${Math.round(s.rates.defence)} `
    + `citizens ${Math.round(s.citizens)} arch ${s.architect} | raids ${c.stats.raids} repelled ${c.stats.repelled} breaches ${c.stats.breaches} strikes ${c.stats.strikesWon}/${c.stats.strikes} `
    + `hacked ${c.stats.hacksSuffered} loot lost ${Math.round(c.stats.lootLost)} | ${rivals}`);
  return { s, c };
}

describe('scripted games', () => {
  for (const difficulty of ['easy', 'normal'] as const) {
    for (const seed of [3, 11, 20]) {
      it(`a player who follows the Architect, builds defences and uses doctrine well wins on ${difficulty} (seed ${seed})`, () => {
        const { c } = playGame('general', seed, difficulty, 60, general);
        expect(c.over).toBe('win');
        expect(c.time).toBeLessThanOrEqual(60 * 60);
      });
    }
  }
  it('hard is reported for balance', () => {
    const { c } = playGame('general', 3, 'hard', 75, general);
    expect(c.over === null || c.over === 'win' || c.over === 'lose').toBe(true);
  });
  it('a player who ignores the conflict on normal loses the city', () => {
    for (const seed of [3, 11]) {
      const { c } = playGame('bystander', seed, 'normal', 60, bystander);
      expect(c.over).toBe('lose');
      expect(c.reason).toMatch(/Nexus/);
      expect(c.stats.breaches).toBeGreaterThan(5);
    }
  });
  it('diplomacy alone can absorb Meridian Exchange', () => {
    const { c } = playGame('diplomat', 3, 'normal', 60, diplomat, false);
    expect(c.rivals.meridian.status).toBe('absorbed');
    expect(c.stats.strikes).toBe(0);
    expect(c.posture).toBe('defend');
    expect(c.over).not.toBe('lose');
  });
  it('hacking alone can make Karst Hold yield', () => {
    const { c } = playGame('hacker', 3, 'normal', 60, hacker, false);
    expect(c.rivals.karst.status).toBe('yielded');
    expect(c.stats.strikes).toBe(0);
    expect(c.over).not.toBe('lose');
  });
});

// ---------- Rules ----------

describe('setup and pacing', () => {
  it('starts with two rivals of different character', () => {
    const c = createConflict(1, 'normal');
    expect(RIVAL_ORDER.length).toBeGreaterThanOrEqual(2);
    expect(RIVALS.karst.fort).toBeGreaterThan(RIVALS.meridian.fort);
    expect(RIVALS.meridian.greed).toBeGreaterThan(RIVALS.karst.greed);
    expect(RIVALS.karst.targets).not.toEqual(RIVALS.meridian.targets);
    for (const id of RIVAL_ORDER) {
      expect(c.rivals[id].status).toBe('active');
      expect(c.rivals[id].strength).toBeGreaterThan(0);
    }
    expect(c.over).toBeNull();
  });
  it('leaves the city alone through the grace period, then attacks', () => {
    const s = createCity(2), c = createConflict(2, 'normal');
    run(s, c, DIFFICULTIES.normal.grace - 1);
    expect(c.stats.raids).toBe(0);
    expect(c.stats.hacksSuffered + c.stats.hacksBlocked).toBe(0);
    expect(c.events.filter(e => e.kind === 'warn')).toEqual([]);
    const t = threatSummary(s, c);
    expect(t.phase).toBe('grace');
    expect(t.headline).toMatch(/quiet/);
    expect(t.rivals.every(r => r.stance === 'peaceful' && r.threat === 'none')).toBe(true);
    expect(launchOperation(s, c, 'sabotage', 'karst')).toMatch(/peace/);
    run(s, c, 420);
    expect(threatSummary(s, c).phase).toBe('war');
    expect(c.stats.raids).toBeGreaterThan(0);
    expect(c.nexus).toBeLessThan(NEXUS.start);
  });
  it('escalates: rivals grow, and harder settings press sooner and harder', () => {
    expect(DIFFICULTIES.easy.grace).toBeGreaterThan(DIFFICULTIES.normal.grace);
    expect(DIFFICULTIES.normal.grace).toBeGreaterThan(DIFFICULTIES.hard.grace);
    const left: Record<string, number> = {};
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const s = createCity(4), c = createConflict(4, difficulty);
      const early = { ...c.rivals.karst };
      run(s, c, 22 * 60);
      left[difficulty] = c.nexus;
      expect(c.rivals.karst.strength).toBeGreaterThan(early.strength * 1.5);
      expect(c.rivals.karst.economy).toBeGreaterThan(early.economy * 1.5);
      expect(escalation(c)).toBeGreaterThan(0.4);
    }
    expect(left.easy).toBeGreaterThan(left.normal);
    expect(left.normal).toBeGreaterThan(left.hard);
  });
});

describe('determinism', () => {
  const drive = (s: CityState, c: ConflictState, seconds: number) => {
    for (let t = 0; t < seconds / DT; t++) {
      tickBoth(s, c);
      if (t % 60 === 0) general(s, c);
      if (t % 20 === 0) { const a = advise(s); if (a.affordable && a.kind === 'brief') brief(s, a.site, a.intent!, a.character!); else if (a.affordable && a.kind === 'upgrade') upgradeArchitect(s); }
    }
  };
  it('gives the same game for the same seed and commands, and a different one for another seed', () => {
    const games = [5, 5, 6].map(seed => { const s = createCity(seed), c = createConflict(seed, 'hard'); drive(s, c, 20 * 60); return JSON.stringify([s, c]); });
    expect(games[0]).toBe(games[1]);
    expect(games[0]).not.toBe(games[2]);
  });
  it('survives a save and load round trip and continues identically', () => {
    const s = createCity(7), c = createConflict(7, 'hard');
    drive(s, c, 15 * 60);
    const s2 = JSON.parse(JSON.stringify(s)) as CityState, c2 = JSON.parse(JSON.stringify(c)) as ConflictState;
    expect(c2).toEqual(c);
    drive(s, c, 12 * 60); drive(s2, c2, 12 * 60);
    expect(c.stats.raids + c.stats.strikes).toBeGreaterThan(0);
    expect(JSON.stringify(c2)).toBe(JSON.stringify(c));
    expect(JSON.stringify(s2)).toBe(JSON.stringify(s));
  });
});

describe('raids on the city', () => {
  const layout = { power: 1, commerce: 1, research: 1, housing: 2, farms: 2 };
  const land = (s: CityState, c: ConflictState, id: RivalId, power: number) => {
    noHacks(c); for (const r of RIVAL_ORDER) quiet(c, r);
    const r = pin(c, id, 60);
    r.muster = DT; r.musterPower = power;
    run(s, c, 1);
    return r;
  };
  const damage = (s: CityState) => s.districts.reduce((sum, d) => sum + (d?.damage ?? 0), 0);

  it('cripple an undefended city and bounce off a defended one', () => {
    const open = standingCity(layout);
    const before = open.s.res.alloy;
    land(open.s, open.c, 'karst', 42);
    expect(open.c.stats.breaches).toBe(1);
    expect(damage(open.s)).toBeGreaterThan(2);
    expect(open.c.nexus).toBeCloseTo(NEXUS.start - DIFFICULTIES.normal.nexusHit, 1);
    expect(open.s.res.alloy).toBeLessThan(before - 1000);
    expect(last(open.c).msg).toMatch(/Karst Hold broke through/);
    expect(open.c.effects.unrest).toBeGreaterThan(15);
    expect(open.c.effects.morale).toBeLessThan(-3);

    const walled = standingCity({ ...layout, defence: 4 });
    walled.c.fleet = 20;
    expect(walled.s.rates.defence).toBeCloseTo(40);
    const r = land(walled.s, walled.c, 'karst', 42);
    expect(walled.c.stats.repelled).toBe(1);
    expect(damage(walled.s)).toBe(0);
    expect(walled.c.nexus).toBe(NEXUS.start);
    expect(r.strength).toBeLessThan(50);
    expect(r.resolve).toBeLessThan(100);
    expect(last(walled.c)).toMatchObject({ kind: 'good' });
    expect(walled.c.effects.unrest).toBe(0);
  });
  it('are driven off with light damage when the odds are close', () => {
    const { s, c } = standingCity({ ...layout, defence: 1 });
    land(s, c, 'karst', homeDefence(s, c));
    expect(c.stats.breaches + c.stats.repelled).toBe(0);
    expect(damage(s)).toBeGreaterThan(0);
    expect(damage(s)).toBeLessThanOrEqual(RAID.glanceDamage);
    expect(c.nexus).toBe(NEXUS.start);
  });
  it('go for what each rival values', () => {
    const hitBy = (id: RivalId) => {
      const { s, c } = standingCity({ ...layout, defence: 1 });
      const before = { ...s.res };
      land(s, c, id, homeDefence(s, c) * 1.5);
      const hit = s.districts.filter(d => d && d.damage > 0).map(d => d!.intent).sort();
      return { hit, lost: { credits: before.credits - s.res.credits, alloy: before.alloy - s.res.alloy } };
    };
    const karst = hitBy('karst'), meridian = hitBy('meridian');
    expect(karst.hit).toEqual(['defence', 'power']);
    expect(meridian.hit).toEqual(['commerce', 'research']);
    expect(karst.lost.alloy).toBeGreaterThan(1000);
    expect(karst.lost.credits).toBeLessThan(0);
    expect(meridian.lost.credits).toBeGreaterThan(1000);
    expect(meridian.lost.alloy).toBeLessThan(0);
  });
  it('do far less to the district the player has ordered protected', () => {
    const hitPower = (protect: boolean) => {
      const { s, c } = standingCity({ ...layout, defence: 1 });
      const site = s.districts.findIndex(d => d?.intent === 'power');
      if (protect) expect(setObjective(s, c, { kind: 'protect', site })).toBeNull();
      land(s, c, 'karst', homeDefence(s, c) * 1.5);
      return s.districts[site]!.damage;
    };
    const exposed = hitPower(false), shielded = hitPower(true);
    expect(exposed).toBeGreaterThan(0.3);
    expect(shielded).toBeLessThan(exposed * 0.35);
    const { s, c } = standingCity(layout);
    expect(setObjective(s, c, { kind: 'protect', site: 80 })).toMatch(/no district/);
  });
  it('wear the Nexus down until the city is lost, and it recovers when left in peace', () => {
    const { s, c } = standingCity(layout);
    land(s, c, 'karst', 60);
    const hurt = c.nexus;
    run(s, c, NEXUS.calm + 60);
    expect(c.nexus).toBeGreaterThan(hurt);
    let raids = 1;
    while (!c.over && raids < 40) { land(s, c, raids % 2 ? 'meridian' : 'karst', 80); raids++; }
    expect(c.over).toBe('lose');
    expect(c.nexus).toBe(0);
    expect(c.reason).toMatch(/Nexus has fallen/);
    expect(raids).toBeGreaterThan(8);
    const frozen = JSON.stringify(c);
    run(s, c, 5);
    expect(JSON.stringify(c)).toBe(frozen);
    expect(setPosture(c, 'raid')).toMatch(/over/);
    expect(threatSummary(s, c).phase).toBe('over');
  });
});

describe('doctrine', () => {
  it('deterrence makes rivals think twice where plain defence does not', () => {
    const musters = (posture: 'defend' | 'deter') => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { s, c } = standingCity({ defence: 3 }, seed);
        setPosture(c, posture);
        noHacks(c); quiet(c, 'meridian');
        pin(c, 'karst', 50).raidIn = 0;
        tickBoth(s, c);
        if (c.rivals.karst.muster > 0) n++;
      }
      return n;
    };
    const defend = musters('defend'), deter = musters('deter');
    expect(defend).toBeGreaterThan(deter + 8);
  });
  it('gives warning of a raid on its way', () => {
    const { s, c } = standingCity({});
    noHacks(c); quiet(c, 'meridian');
    pin(c, 'karst', 50).raidIn = 0;
    tickBoth(s, c);
    const t = threatSummary(s, c);
    expect(t.rivals[0].raidIn).toBe(RAID.warning);
    expect(t.headline).toMatch(/Karst Hold raid arrives in 30 seconds/);
    expect(last(c)).toMatchObject({ kind: 'warn' });
  });
  it('posture decides whether the fleet strikes, and how much is left at home', () => {
    const after = (posture: 'defend' | 'raid' | 'allout') => {
      const { s, c } = standingCity({ defence: 2 });
      c.fleet = 100;
      noHacks(c); for (const id of RIVAL_ORDER) quiet(c, id);
      pin(c, 'karst', 30); pin(c, 'meridian', 30);
      setPosture(c, posture);
      const home = homeDefence(s, c);
      run(s, c, 240);
      return { c, home };
    };
    const defend = after('defend'), raid = after('raid'), allout = after('allout');
    expect(defend.c.stats.strikes).toBe(0);
    expect(defend.c.rivals.karst.resolve).toBe(100);
    expect(raid.c.stats.strikesWon).toBeGreaterThan(1);
    expect(allout.c.stats.strikesWon).toBeGreaterThan(raid.c.stats.strikesWon);
    const resolve = (g: { c: ConflictState }) => g.c.rivals.karst.resolve + g.c.rivals.meridian.resolve;
    expect(resolve(raid)).toBeLessThan(190);
    expect(resolve(allout)).toBeLessThan(resolve(raid));
    expect(defend.home).toBeGreaterThan(raid.home);
    expect(raid.home).toBeGreaterThan(allout.home);
    // War is felt at home.
    expect(defend.c.effects).toEqual({ morale: 0, unrest: 0 });
    expect(allout.c.effects.unrest).toBeGreaterThan(raid.c.effects.unrest);
    expect(allout.c.effects.morale).toBeLessThan(raid.c.effects.morale);
    expect(raid.c.effects.morale).toBeLessThan(0);
  });
  it('objective decides what a strike breaks', () => {
    const after = (kind: 'cutPower' | 'breakIndustry' | 'breakForces') => {
      const { s, c } = standingCity({ defence: 2 });
      c.fleet = 100;
      noHacks(c); for (const id of RIVAL_ORDER) quiet(c, id);
      pin(c, 'karst', 30); pin(c, 'meridian', 30);
      setPosture(c, 'raid');
      expect(setObjective(s, c, { kind, rival: 'karst' })).toBeNull();
      run(s, c, 20);
      expect(c.stats.strikesWon).toBe(1);
      expect(c.rivals.meridian.resolve).toBe(100);
      return c.rivals.karst;
    };
    const power = after('cutPower'), industry = after('breakIndustry'), forces = after('breakForces');
    expect(industry.economy).toBeLessThan(forces.economy * 0.92);
    expect(forces.strength).toBeLessThan(industry.strength * 0.85);
    expect(power.brownout).toBeGreaterThan(60);
    expect(industry.brownout).toBe(0);
    expect(power.resolve).toBeLessThan(industry.resolve);
  });
  it('the AI holds the fleet back rather than waste it on a wall it cannot break', () => {
    const { s, c } = standingCity({});
    c.fleet = 20;
    noHacks(c); for (const id of RIVAL_ORDER) quiet(c, id);
    pin(c, 'karst', 80); pin(c, 'meridian', 80);
    setPosture(c, 'raid');
    run(s, c, 200);
    expect(c.stats.strikes).toBe(0);
    expect(c.fleet).toBeGreaterThan(19.9);
  });
  it('a deterrent posture strikes back after a raid', () => {
    const { s, c } = standingCity({ defence: 4 });
    c.fleet = 80;
    setPosture(c, 'deter');
    noHacks(c); for (const id of RIVAL_ORDER) quiet(c, id);
    const r = pin(c, 'karst', 25);
    r.muster = DT; r.musterPower = 17;
    run(s, c, 60);
    expect(c.stats.repelled).toBe(1);
    expect(c.stats.strikesWon).toBe(1);
    expect(c.events.some(e => /struck back at Karst Hold/.test(e.msg))).toBe(true);
  });
});

describe('the fleet', () => {
  it('is bought with credits and alloy, delivered over time, capped and costs upkeep', () => {
    const s = createCity(), c = createConflict();
    s.res = { credits: 5000, alloy: 5000, food: 999, data: 0 };
    expect(commissionFleet(s, c, 10)).toBeNull();
    expect(s.res.credits).toBe(5000 - 10 * FLEET.credits);
    expect(s.res.alloy).toBe(5000 - 10 * FLEET.alloy);
    expect(c.fleet).toBe(0);
    expect(commissionFleet(s, c, fleetCap(s))).toMatch(/fleet of 30/);
    run(s, c, 10 / FLEET.buildRate + 1);
    expect(c.fleet).toBeCloseTo(10);
    expect(totalStrength(s, c)).toBeCloseTo(14);
    expect(fleetUpkeep(c)).toBeCloseTo(10 * FLEET.upkeep);
    setPosture(c, 'allout');
    expect(fleetUpkeep(c)).toBeGreaterThan(10 * FLEET.upkeep);
    const poor = createCity();
    poor.res.credits = 0; poor.res.alloy = 0;
    expect(commissionFleet(poor, c, 1)).toMatch(/Not enough/);
    expect(standDownFleet(c, 4)).toBeNull();
    expect(c.fleet).toBeCloseTo(6);
  });
  it('stands down when it is not paid', () => {
    const s = createCity(), c = createConflict();
    c.fleet = 300; s.res.credits = 0;
    run(s, c, 20);
    expect(c.fleet).toBeLessThan(270);
    expect(c.unpaid).toBe(true);
    expect(c.events.some(e => /not being paid/.test(e.msg))).toBe(true);
    expect(threatSummary(s, c).headline).toMatch(/not being paid/);
  });
});

describe('hacking and sabotage', () => {
  /** Keeps trying an operation until it lands; returns how many tries it took. */
  const until = (s: CityState, c: ConflictState, op: 'brownout' | 'steal' | 'blind' | 'sabotage', id: RivalId, landed: () => boolean) => {
    for (let tries = 1; tries <= 12; tries++) {
      c.rivals[id].opCooldown = 0;
      const data = s.res.data;
      expect(launchOperation(s, c, op, id)).toBeNull();
      expect(s.res.data).toBeCloseTo(data - OPS[op].data);
      if (landed()) return tries;
    }
    throw new Error(`${op} never landed`);
  };
  it('costs data and does what each operation says', () => {
    const { s, c } = standingCity({ research: 2 });
    for (const id of RIVAL_ORDER) quiet(c, id);
    const k = pin(c, 'karst', 40);
    const wall = rivalDefence(k), raid = raidPower(k);
    until(s, c, 'blind', 'karst', () => k.blind > 0);
    expect(rivalDefence(k)).toBeCloseTo(wall * HACK.blindDefence);
    expect(raidPower(k)).toBeLessThan(raid);
    until(s, c, 'brownout', 'karst', () => k.brownout > 0);
    expect(threatSummary(s, c).rivals[0]).toMatchObject({ blinded: true, browned: true });
    const eco = k.economy, credits = s.res.credits;
    until(s, c, 'sabotage', 'karst', () => k.economy < eco * 0.95);
    until(s, c, 'steal', 'karst', () => s.res.credits > credits + 50);
    expect(k.resolve).toBeLessThanOrEqual(90);
    // A blacked-out economy cannot keep its army up.
    run(s, c, 100);
    expect(k.strength).toBeLessThan(36);
  });
  it('is refused without data, during a truce, and while operators regroup', () => {
    const { s, c } = standingCity({});
    expect(launchOperation(s, c, 'brownout', null)).toMatch(/Choose a rival/);
    expect(launchOperation(s, c, 'brownout', 'karst')).toBeNull();
    expect(launchOperation(s, c, 'brownout', 'karst')).toMatch(/more seconds/);
    s.res.data = 10;
    expect(launchOperation(s, c, 'sabotage', 'meridian')).toMatch(/Needs 80 data/);
    expect(launchOperation(s, c, 'firewall')).toMatch(/Needs 25 data/);
    s.res.data = 500; c.rivals.meridian.truce = 100;
    expect(launchOperation(s, c, 'sabotage', 'meridian')).toMatch(/truce/);
  });
  it('can fail, and failure is traced back to the player', () => {
    let failed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { s, c } = standingCity({}, seed);
      const before = c.rivals.meridian.relations;
      launchOperation(s, c, 'sabotage', 'meridian');
      if (/failed/.test(last(c).msg)) { failed++; expect(c.rivals.meridian.relations).toBeLessThan(before); }
    }
    expect(failed).toBeGreaterThan(5);
    expect(failed).toBeLessThan(25);
  });
  it('rivals hack back in character, and a firewall or research keeps most of it out', () => {
    const suffered = (prepare: (s: CityState, c: ConflictState) => void, layout: Partial<Record<Intent, number>> = { power: 2 }) => {
      let n = 0, powerHit = 0, taken = 0, blinded = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { s, c } = standingCity(layout, seed);
        prepare(s, c);
        for (const id of RIVAL_ORDER) quiet(c, id);
        const credits = s.res.credits;
        c.rivals[seed % 2 ? 'karst' : 'meridian'].hackIn = 0;
        tickBoth(s, c);
        n += c.stats.hacksSuffered;
        if (!c.stats.hacksSuffered) { expect(c.stats.hacksBlocked).toBe(1); continue; }
        if (seed % 2) { if (s.districts.some(d => d?.intent === 'power' && d.damage > 0)) powerHit++; }
        else if (c.blind > 0) { blinded++; expect(homeDefence(s, c)).toBeLessThanOrEqual(4 * 1.2 + 1e-9); }
        else if (s.res.credits < credits - 100) taken++;
      }
      return { n, powerHit, taken, blinded };
    };
    const open = suffered(() => {});
    const walled = suffered((s, c) => { expect(launchOperation(s, c, 'firewall')).toBeNull(); });
    const labs = suffered(() => {}, { power: 2, research: 4 });
    expect(open.n).toBeGreaterThan(20);
    expect(open.powerHit).toBeGreaterThan(5);
    expect(open.taken).toBeGreaterThan(3);
    expect(open.blinded).toBeGreaterThan(0);
    expect(open.powerHit + open.taken + open.blinded).toBe(open.n);
    expect(walled.n).toBeLessThan(open.n / 2);
    expect(labs.n).toBeLessThan(open.n);
  });
});

describe('diplomacy', () => {
  const calm = (layout: Partial<Record<Intent, number>> = {}) => {
    const g = standingCity(layout);
    noHacks(g.c); for (const id of RIVAL_ORDER) quiet(g.c, id);
    return g;
  };
  it('gifts move the Broker, but the Castellan only hears the strong', () => {
    const { s, c } = calm();
    pin(c, 'karst', 40);
    const m = c.rivals.meridian.relations, credits = s.res.credits;
    expect(propose(s, c, 'meridian', { kind: 'tribute', credits: 800 })).toBeNull();
    expect(c.rivals.meridian.relations).toBeCloseTo(m + 20);
    expect(s.res.credits).toBe(credits - 800);
    expect(propose(s, c, 'meridian', { kind: 'tribute', credits: 800 })).toMatch(/still weighing/);
    expect(propose(s, c, 'karst', { kind: 'tribute', credits: 800 })).toMatch(/respects strength, not gifts/);
    c.fleet = 60;
    const k = c.rivals.karst.relations;
    expect(propose(s, c, 'karst', { kind: 'tribute', credits: 800 })).toBeNull();
    expect(c.rivals.karst.relations).toBeCloseTo(k + 8);
    c.rivals.meridian.tributeCooldown = 0;
    expect(propose(s, c, 'meridian', { kind: 'tribute', credits: 1e9 })).toMatch(/Not enough/);
  });
  it('trade needs trust, pays both sides and keeps the peace', () => {
    const { s, c } = calm();
    expect(propose(s, c, 'meridian', { kind: 'trade' })).toMatch(/does not trust you enough to trade/);
    c.rivals.meridian.relations = 20;
    expect(propose(s, c, 'meridian', { kind: 'trade' })).toBeNull();
    expect(stanceOf(c, c.rivals.meridian)).toBe('trading');
    expect(setObjective(s, c, { kind: 'breakIndustry', rival: 'meridian' })).toMatch(/trade deal/);
    const plain = calm();
    c.rivals.meridian.raidIn = 0; c.rivals.meridian.hackIn = 0;
    run(s, c, 120); run(plain.s, plain.c, 120);
    expect(s.res.credits).toBeGreaterThan(plain.s.res.credits + 100);
    expect(c.rivals.meridian.relations).toBeGreaterThan(20);
    expect(c.rivals.meridian.muster).toBe(0);
    expect(c.stats.raids + c.stats.hacksSuffered + c.stats.hacksBlocked).toBe(0);
    expect(threatSummary(s, c).rivals[1]).toMatchObject({ stance: 'trading', threat: 'none' });
  });
  it('a truce is refused by a rival with the upper hand, and stops a raid when signed', () => {
    const { s, c } = calm();
    const k = pin(c, 'karst', 50);
    expect(propose(s, c, 'karst', { kind: 'truce' })).toMatch(/sees no reason to stop/);
    c.fleet = 90;
    k.muster = 10; k.musterPower = 35;
    expect(propose(s, c, 'karst', { kind: 'truce' })).toBeNull();
    expect(k.muster).toBe(0);
    expect(stanceOf(c, k)).toBe('truce');
    expect(propose(s, c, 'karst', { kind: 'truce' })).toMatch(/already/);
    expect(setObjective(s, c, { kind: 'cutPower', rival: 'karst' })).toMatch(/truce/);
    c.rivals.meridian.relations = 60; // not hostile, so the AI leaves it alone
    setPosture(c, 'allout');
    k.raidIn = 0;
    run(s, c, 120);
    expect(c.stats.raids).toBe(0);
    expect(c.stats.strikes).toBe(0);
    run(s, c, DIPLOMACY.truceTime);
    expect(k.truce).toBe(0);
    expect(propose(s, c, 'karst', { kind: 'truce' })).toMatch(/not talk about another truce yet/);
  });
  it('rivals can be turned on each other', () => {
    let worked = 0, failed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { s, c } = standingCity({}, seed);
      noHacks(c); for (const id of RIVAL_ORDER) quiet(c, id);
      pin(c, 'karst', 40); pin(c, 'meridian', 40);
      c.rivals.meridian.relations = 30;
      const data = s.res.data;
      expect(propose(s, c, 'meridian', { kind: 'incite' })).toBeNull();
      expect(s.res.data).toBe(data - DIPLOMACY.inciteData);
      if (c.rivals.meridian.feud === 0) { failed++; expect(c.rivals.meridian.relations).toBeLessThan(30); continue; }
      worked++;
      expect(c.rivals.karst.feudWith).toBe('meridian');
      expect(stanceOf(c, c.rivals.karst)).toBe('feuding');
      expect(propose(s, c, 'meridian', { kind: 'incite' })).toMatch(/already fighting/);
      c.rivals.karst.raidIn = 5; // even a rival that was about to raid you turns on the other
      run(s, c, 40);
      expect(c.events.some(e => /struck Karst Hold|struck Meridian Exchange|beaten back/.test(e.msg))).toBe(true);
      expect(c.rivals.karst.resolve).toBeLessThan(98);
      expect(c.rivals.meridian.resolve).toBeLessThan(98);
      expect(c.stats.raids).toBe(0);
    }
    expect(worked).toBeGreaterThan(3);
    expect(failed).toBeGreaterThan(0);
  });
  it('Karst Hold allies only with a trusted equal', () => {
    const { s, c } = calm();
    const k = pin(c, 'karst', 50);
    expect(propose(s, c, 'meridian', { kind: 'pact' })).toMatch(/contracts, not alliances/);
    expect(propose(s, c, 'karst', { kind: 'pact' })).toMatch(/does not trust you enough/);
    k.relations = 75;
    expect(propose(s, c, 'karst', { kind: 'pact' })).toMatch(/only allies with its equals/);
    c.fleet = 60;
    expect(propose(s, c, 'karst', { kind: 'pact' })).toBeNull();
    expect(k.status).toBe('allied');
    expect(stanceOf(c, k)).toBe('allied');
    expect(c.over).toBeNull();
    expect(propose(s, c, 'karst', { kind: 'truce' })).toMatch(/no longer a rival/);
  });
  it('respect for a strong city warms Karst Hold over time', () => {
    const weak = calm(), strong = calm({ defence: 4 });
    strong.c.fleet = 50;
    for (const g of [weak, strong]) { pin(g.c, 'karst', 40); run(g.s, g.c, 300); }
    expect(strong.c.rivals.karst.relations).toBeGreaterThan(weak.c.rivals.karst.relations + 5);
  });
  it('Meridian Exchange can be bought, and then pays into the city', () => {
    const { s, c } = calm();
    const m = pin(c, 'meridian', 40);
    expect(propose(s, c, 'karst', { kind: 'buyout' })).toMatch(/not for sale/);
    expect(propose(s, c, 'meridian', { kind: 'buyout' })).toMatch(/will not sell/);
    m.relations = 60;
    const price = buyoutPrice(c, 'meridian');
    expect(threatSummary(s, c).rivals[1].buyoutPrice).toBe(price);
    s.res.credits = price - 1;
    expect(propose(s, c, 'meridian', { kind: 'buyout' })).toBe(`The price is ${price} credits`);
    m.resolve = 30;
    expect(buyoutPrice(c, 'meridian')).toBeLessThan(price * 0.7); // a shaken rival sells cheap
    m.resolve = 100;
    s.res.credits = price;
    expect(propose(s, c, 'meridian', { kind: 'buyout' })).toBeNull();
    expect(m.status).toBe('absorbed');
    expect(s.res.credits).toBeCloseTo(0);
    const plain = calm();
    plain.s.res.credits = 0;
    run(s, c, 60); run(plain.s, plain.c, 60);
    expect(s.res.credits).toBeGreaterThan(plain.s.res.credits + 100);
  });
  it('a shaken rival yields to a demand from a stronger city', () => {
    const { s, c } = calm();
    const k = pin(c, 'karst', 30);
    c.fleet = 80;
    const before = k.relations;
    expect(propose(s, c, 'karst', { kind: 'demand' })).toMatch(/not ready to give in/);
    expect(k.relations).toBeLessThan(before);
    k.resolve = 25; c.fleet = 0;
    expect(propose(s, c, 'karst', { kind: 'demand' })).toMatch(/will not yield to a weaker city/);
    c.fleet = 80;
    expect(propose(s, c, 'karst', { kind: 'demand' })).toBeNull();
    expect(k.status).toBe('yielded');
  });
});

describe('endings', () => {
  it('a rival whose economy is broken loses the will to fight and yields', () => {
    const { s, c } = standingCity({});
    noHacks(c); for (const id of RIVAL_ORDER) quiet(c, id);
    const k = pin(c, 'karst', 40);
    k.economy *= 0.1;
    run(s, c, 1200);
    expect(k.status).toBe('yielded');
    expect(k.endedAt).toBeGreaterThan(0);
    expect(c.events.some(e => /Karst Hold has yielded/.test(e.msg))).toBe(true);
  });
  it('the game is won when every rival is neutralised, by whatever means', () => {
    const { s, c } = standingCity({ defence: 4 });
    c.fleet = 90;
    c.rivals.karst.relations = 80; c.rivals.meridian.relations = 60;
    expect(propose(s, c, 'karst', { kind: 'pact' })).toBeNull();
    expect(c.over).toBeNull();
    expect(propose(s, c, 'meridian', { kind: 'buyout' })).toBeNull();
    expect(c.over).toBe('win');
    expect(c.reason).toBe('No rival threatens the city any more. Karst Hold stands with you as an ally, and Meridian Exchange has joined your city.');
    expect(threatSummary(s, c)).toMatchObject({ phase: 'over', over: 'win', headline: c.reason });
    expect(propose(s, c, 'karst', { kind: 'truce' })).toMatch(/over/);
    expect(commissionFleet(s, c, 1)).toMatch(/over/);
  });
});

describe('events', () => {
  it('are capped, plainly worded, and use the same shape as city events', () => {
    const s = createCity(9), c = createConflict(9, 'hard');
    const seen = new Set<string>();
    for (let t = 0; t < 30 * 60 / DT && !c.over; t++) {
      tickBoth(s, c);
      if (t % 600 === 0) { setPosture(c, t % 1200 ? 'deter' : 'defend'); for (const e of c.events) seen.add(e.msg); }
      expect(c.events.length).toBeLessThanOrEqual(16);
    }
    for (const e of c.events) seen.add(e.msg);
    expect(seen.size).toBeGreaterThan(5);
    for (const msg of seen) {
      expect(msg).not.toMatch(/[—–]|undefined|NaN/);
      expect(msg.length).toBeLessThan(160);
    }
    expect(c.events.every(e => ['info', 'warn', 'good'].includes(e.kind))).toBe(true);
  });
});
