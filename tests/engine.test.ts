// The whole game together: city, governance and conflict through the one engine entry point.
import { describe, it, expect } from 'vitest';
import { brief, grow, upgradeArchitect, CityState, DT } from '../src/city/model';
import { advise } from '../src/city/architect';
import { decide, setAutonomy, INITIATIVES } from '../src/city/governance';
import { newGame, tick, isLost, Mode } from '../src/city/engine';
import {
  commissionFleet, fleetCap, setPosture, setObjective, propose, launchOperation, threatSummary, rivalDefence, raidPower,
  FLEET, RIVAL_ORDER, RIVALS, POSTURES, RAID, HACK, OPS,
} from '../src/city/conflict';

function approve(s: CityState, ignoreWar = false): void {
  const a = advise(s);
  if (a.kind === 'wait' || !a.affordable || (ignoreWar && a.intent === 'defence')) return;
  a.kind === 'brief' ? brief(s, a.site, a.intent!, a.character!) : a.kind === 'grow' ? grow(s, a.site) : upgradeArchitect(s);
}

/**
 * A capable commander (the same play as the conflict engine's own scripted general): keeps the
 * fleet full, hides behind deterrence until a strike would win, blinds a rival before hitting it,
 * and demands surrender whenever it might be given.
 */
function command(s: CityState): void {
  const c = s.war!;
  if (c.over) return;
  const reserve = 300 * s.architect * s.architect;
  if (fleetCap(s) - c.fleet - c.fleetOrdered >= 5 && s.res.credits > reserve + 5 * FLEET.credits && s.res.alloy > reserve + 5 * FLEET.alloy) commissionFleet(s, c, 5);
  if (threatSummary(s, c).phase === 'grace') return;
  if (c.firewall === 0 && s.res.data >= 200) launchOperation(s, c, 'firewall');
  const active = RIVAL_ORDER.map(id => c.rivals[id]).filter(r => r.status === 'active');
  for (const r of active) propose(s, c, r.id, { kind: 'demand' });
  const target = active.filter(r => r.truce === 0 && r.trade === 0).sort((a, b) => rivalDefence(a) - rivalDefence(b))[0];
  if (!target) return;
  const worst = Math.max(...active.map(raidPower));
  const holds = (p: 'raid' | 'allout') => (4 + s.rates.defence + c.fleet * POSTURES[p].home) * RAID.repelBelow > worst;
  const wins = (p: 'raid' | 'allout', wall: number) => c.fleet * POSTURES[p].strike > wall * 1.1;
  const pick = (w: number) => (wins('raid', w) && holds('raid') ? 'raid' : wins('allout', w) && holds('allout') ? 'allout' : null);
  const now = pick(rivalDefence(target));
  if (now) {
    setPosture(c, now);
    setObjective(s, c, { kind: 'breakForces', rival: target.id });
  } else if (pick(target.strength * RIVALS[target.id].fort * HACK.blindDefence) && s.res.data >= OPS.blind.data) {
    launchOperation(s, c, 'blind', target.id);
  } else {
    setPosture(c, 'deter');
    if (s.res.data >= (s.architect < 4 ? 600 : 100)) launchOperation(s, c, 'sabotage', target.id);
  }
}

function play(mode: Mode, minutes: number, commander: boolean, autonomy = 0, ignoreWar = false): CityState {
  const s = newGame(3, mode);
  setAutonomy(s, autonomy);
  for (let t = 0; t < minutes * 60 / DT && !isLost(s) && s.war?.over !== 'win'; t++) {
    tick(s);
    if (t % 20) continue;
    if (s.gov.pending) decide(s, s.gov.pending.kind === 'initiative' && INITIATIVES[s.gov.pending.id].troubling ? 1 : 0);
    // The commander goes first every few seconds so defence gets its share before the Architect spends.
    if (commander && s.war && t % 60 === 0) command(s);
    if (autonomy < 2) approve(s, ignoreWar);
  }
  const w = s.war;
  console.log(`${mode}${commander ? ' commander' : ' bystander'}${autonomy ? ` autonomy ${autonomy}` : ''}`, {
    over: w?.over ?? 'n/a', minutes: +(s.time / 60).toFixed(1), citizens: Math.round(s.citizens), morale: Math.round(s.morale), trust: Math.round(s.gov.trust),
    architect: s.architect, nexus: w ? Math.round(w.nexus) : 'n/a', fleet: w ? Math.round(w.fleet) : 0, defence: Math.round(s.rates.defence),
    rivals: w ? RIVAL_ORDER.map(id => `${id}:${w.rivals[id].status}:${Math.round(w.rivals[id].resolve)}`).join(' ') : '',
    raids: w ? `${w.stats.raids} (${w.stats.repelled} repelled, ${w.stats.breaches} breaches)` : '', reason: w?.reason ?? '',
  });
  return s;
}

describe('the whole game', () => {
  it('a peaceful city has no war and skips the war objectives', () => {
    const s = play('peace', 12, false);
    expect(s.war).toBeNull();
    expect(s.objectives & (1 << 11)).toBeTruthy();
  });
  it('war strain reaches morale and trust', () => {
    const calm = newGame(3, 'normal'), strained = newGame(3, 'normal');
    for (const s of [calm, strained]) { s.res.food = 99999; for (let i = 0; i < 300; i++) tick(s); }
    strained.war!.strain = 80;
    for (const s of [calm, strained]) for (let i = 0; i < 600; i++) { if (s === strained) s.war!.strain = 80; tick(s); }
    expect(strained.rates.moraleTarget).toBeLessThan(calm.rates.moraleTarget - 8);
    expect(strained.gov.trust).toBeLessThan(calm.gov.trust - 3);
  });
  it('the Architect proposes defence once it can build it', () => {
    const s = newGame(3, 'normal');
    s.res = { credits: 99999, alloy: 99999, food: 99999, data: 0 };
    s.architect = 2;
    const seen = new Set<string>();
    for (let t = 0; t < 4000; t++) { tick(s); if (t % 20 === 0) { const a = advise(s); if (a.intent) seen.add(a.intent); approve(s); } }
    expect(seen.has('defence')).toBe(true);
    expect(s.rates.defence).toBeGreaterThan(0);
  });
  for (const mode of ['easy', 'normal'] as const) {
    it(`a capable commander wins on ${mode}`, () => {
      expect(play(mode, 90, true).war!.over).toBe('win');
    });
  }
  it('following the Architect alone, with no commander, keeps the city standing on normal', () => {
    const s = play('normal', 60, false);
    expect(s.war!.over).toBeNull();
    expect(s.war!.nexus).toBeGreaterThan(50);
  });
  it('ignoring the rivals on normal loses the city, and the game stops', () => {
    const s = play('normal', 75, false, 0, true);
    expect(s.war!.over).toBe('lose');
    const frozen = s.time;
    tick(s);
    expect(s.time).toBe(frozen);
  });
  it('a Delegated Architect builds and defends the city by itself', () => {
    const s = play('normal', 45, false, 2);
    expect(s.war!.over).toBeNull();
    expect(s.war!.nexus).toBeGreaterThan(60);
    expect(s.rates.defence).toBeGreaterThan(20);
  });
});
