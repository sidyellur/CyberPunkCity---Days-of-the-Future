// Layer 2, administration: citizen groups, policy, trust, and how much the Architect may do alone.
// Pure rules over the plain-JSON `gov` state in CityState. The outcome is written to `state.mods`,
// which the city model reads; nothing here touches rendering.
import {
  CityState, GovState, GroupKey, PolicyKey, Mods, Res, ResKey, Intent, INTENTS, neutralMods, step, emit, pay, canAfford,
  brief, grow, upgradeArchitect, adjacency, briefTime,
} from './model';
import { advise } from './architect';

type GroupDelta = Partial<Record<GroupKey, number>>;

/** A bundle of effects. Policies, initiatives, timed boosts and autonomy levels all reduce to this. */
export interface Effect {
  out?: Partial<Res>;
  outAll?: number;
  jobs?: number;
  housing?: number;
  draw?: number;
  morale?: number;
  growth?: number;
  build?: number;
  trust?: number;
  groups?: GroupDelta;
}

export const GROUPS: Record<GroupKey, { name: string; desc: string }> = {
  labour: { name: 'Labour', desc: 'Crews of the farms, foundries and reactors. They want work, homes and a fair share.' },
  enterprise: { name: 'Enterprise', desc: 'Traders, founders and researchers. They want growth and a free hand.' },
  commons: { name: 'Commons', desc: 'Everyone who lives here first and works second. They want privacy, green space and a human in charge.' },
};
export const GROUP_ORDER: GroupKey[] = ['labour', 'enterprise', 'commons'];

export interface PolicyOption { name: string; desc: string; effect: Effect }
export const POLICIES: Record<PolicyKey, { name: string; question: string; options: PolicyOption[] }> = {
  wealth: {
    name: 'Wealth', question: 'Who keeps what the city earns?',
    options: [
      { name: 'Open market', desc: '+15% credits. Enterprise thrives, labour resents it.', effect: { out: { credits: 1.15 }, groups: { labour: -8, enterprise: 10, commons: -2 } } },
      { name: 'Mixed', desc: 'No strong effects.', effect: {} },
      { name: 'Shared', desc: '-15% credits, +5 morale. Labour approves, enterprise does not.', effect: { out: { credits: 0.85 }, morale: 5, groups: { labour: 10, enterprise: -10, commons: 4 } } },
    ],
  },
  oversight: {
    name: 'Oversight', question: 'How closely does the Architect watch people?',
    options: [
      { name: 'Private lives', desc: 'The commons trust you more. Unrest is harder to see coming.', effect: { trust: 4, groups: { commons: 10 } } },
      { name: 'Light touch', desc: 'No strong effects.', effect: {} },
      { name: 'Total awareness', desc: '+25% data and no strikes. The commons hate it and trust falls.', effect: { out: { data: 1.25 }, trust: -8, groups: { commons: -16, labour: -4 } } },
    ],
  },
  housing: {
    name: 'Housing', question: 'Who gets the new homes?',
    options: [
      { name: 'Highest bidder', desc: '+6% credits. Enterprise gains, labour loses.', effect: { out: { credits: 1.06 }, groups: { enterprise: 6, labour: -8 } } },
      { name: 'First come', desc: 'No strong effects.', effect: {} },
      { name: 'By need', desc: '+8% homes and faster growth. Labour gains, enterprise grumbles.', effect: { housing: 1.08, growth: 1.15, groups: { labour: 8, enterprise: -6 } } },
    ],
  },
  hours: {
    name: 'Working hours', question: 'How hard does the city work?',
    options: [
      { name: 'Long shifts', desc: '+15% output, -6 morale. Labour suffers.', effect: { outAll: 1.15, morale: -6, groups: { labour: -12, enterprise: 6 } } },
      { name: 'Standard', desc: 'No strong effects.', effect: {} },
      { name: 'Short week', desc: '-12% output, +6 morale. Labour and the commons approve.', effect: { outAll: 0.88, morale: 6, groups: { labour: 10, commons: 4, enterprise: -6 } } },
    ],
  },
};
export const POLICY_ORDER: PolicyKey[] = ['wealth', 'oversight', 'housing', 'hours'];
export const POLICY_COOLDOWN = 60;

export const AUTONOMY: { name: string; desc: string; effect: Effect }[] = [
  { name: 'Advisory', desc: 'The Architect proposes. Nothing happens without you.', effect: {} },
  { name: 'Supervised', desc: 'It keeps food and power running by itself. Builds 10% faster.', effect: { build: 1.1, groups: { commons: -4, enterprise: 3 } } },
  { name: 'Delegated', desc: 'It carries out all its own proposals, and its initiatives unless you veto them. Builds 20% faster, +5% output.', effect: { build: 1.2, outAll: 1.05, trust: -4, groups: { commons: -9, enterprise: 6, labour: -3 } } },
  { name: 'Sovereign', desc: 'It runs the city, policy included. Builds 35% faster, +12% output. You watch.', effect: { build: 1.35, outAll: 1.12, trust: -9, groups: { commons: -16, enterprise: 9, labour: -6 } } },
];

export interface InitiativeDef {
  title: string;
  /** The Architect's case for it. */
  pitch: string;
  /** What it does, plainly. */
  detail: string;
  troubling: boolean;
  effect: Effect;
  grievance?: number;
  cost?: number; // credits, scaled by Architect level
  when: (s: CityState) => boolean;
  /** For initiatives that act on one district. */
  site?: (s: CityState) => number;
}

const count = (s: CityState, intent: Intent) => s.districts.filter(d => d && d.intent === intent && d.standing > 0).length;

/** The housing district whose neighbours make it most miserable, or -1. */
function worstHousing(s: CityState): number {
  let worst = -1, low = 0;
  s.districts.forEach((d, i) => {
    if (!d || d.intent !== 'housing' || d.standing === 0 || d.build > 0 || d.character === 'efficient') return;
    const m = adjacency(s, i, 'housing').morale;
    if (m < low) { low = m; worst = i; }
  });
  return worst;
}

export const INITIATIVES: Record<string, InitiativeDef> = {
  automation: {
    title: 'Automate the foundries', troubling: true, grievance: 8,
    pitch: 'Machines can run industry with a fifth fewer people and a quarter more output.',
    detail: '+25% alloy, 20% fewer jobs everywhere. Labour will not forgive it quickly.',
    effect: { out: { alloy: 1.25 }, jobs: 0.8, groups: { labour: -12, enterprise: 5 } },
    when: s => count(s, 'industry') >= 3,
  },
  dividend: {
    title: 'Pay a citizen dividend', troubling: false,
    pitch: 'The city earns more than it spends. Returning some of it buys goodwill.',
    detail: '-10% credits, +4 morale, more trust.',
    effect: { out: { credits: 0.9 }, morale: 4, trust: 5, groups: { labour: 8, commons: 4, enterprise: -3 } },
    when: s => s.rates.income.credits > 15,
  },
  predictive: {
    title: 'Predict unrest before it starts', troubling: true, grievance: 6,
    pitch: 'I can see a strike forming days ahead and quietly remove its causes. Or its organisers.',
    detail: 'Strikes become rare. The commons lose 10 satisfaction and trust falls.',
    effect: { trust: -4, groups: { commons: -10 } },
    when: s => s.citizens > 400,
  },
  opendata: {
    title: 'Publish the Architect\'s reasoning', troubling: false,
    pitch: 'People fear what they cannot inspect. Let them read why I decide what I decide.',
    detail: '-10% data, +8 trust, the commons approve.',
    effect: { out: { data: 0.9 }, trust: 8, groups: { commons: 6 } },
    when: s => s.architect >= 2 && count(s, 'research') > 0,
  },
  renewal: {
    title: 'Clear and rebuild a failing housing district', troubling: true, grievance: 10,
    pitch: 'This district sits beside industry and drags morale down. I can clear it and rebuild it dense.',
    detail: 'The district is rebuilt as Dense housing (about 30% more homes). The people living there are moved without being asked.',
    effect: { groups: { labour: -8, commons: -4 } },
    when: s => worstHousing(s) >= 0,
    site: worstHousing,
  },
  nightshift: {
    title: 'Run the city around the clock', troubling: false,
    pitch: 'Half the city\'s machinery sleeps at night. It does not need to.',
    detail: '+8% output, +10% power draw, -3 morale.',
    effect: { outAll: 1.08, draw: 1.1, morale: -3, groups: { labour: -6, enterprise: 4 } },
    when: s => s.citizens > 800,
  },
  rationing: {
    title: 'Plan every meal', troubling: false,
    pitch: 'A fifth of what the farms grow is wasted. I can plan diets citizen by citizen.',
    detail: '+15% food, -2 morale.',
    effect: { out: { food: 1.15 }, morale: -2, groups: { commons: -3 } },
    when: s => s.rates.income.food < 1 && count(s, 'farms') >= 2,
  },
  gardens: {
    title: 'Plant gardens on every roof', troubling: false, cost: 1200,
    pitch: 'It costs credits and a little power. People will look up and see green.',
    detail: 'A one-off cost, then +5 morale and +5% power draw. The commons approve.',
    effect: { morale: 5, draw: 1.05, trust: 2, groups: { commons: 8 } },
    when: s => s.architect >= 3,
  },
};

export interface EventDef {
  title: string;
  text: string;
  options: [string, string];
  /** What each option does, shown under the buttons. */
  notes: [string, string];
  when: (s: CityState) => boolean;
  choose: (s: CityState, option: 0 | 1) => void;
}

/** Timed effects started by event choices. */
export const BOOSTS: Record<string, Effect> = {
  divert: { out: { alloy: 0.5 } },
  dark: { morale: -8 },
  shelter: { housing: 1.05 },
  festival: { morale: 8 },
};
const boost = (s: CityState, id: string, t: number) => { s.gov.boosts.push({ id, t }); };
const sway = (s: CityState, d: GroupDelta) => {
  for (const k of GROUP_ORDER) s.gov.groups[k].sat = clamp(s.gov.groups[k].sat + (d[k] ?? 0));
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export const EVENTS: Record<string, EventDef> = {
  blackout: {
    title: 'A substation has failed', text: 'There is not enough power for everyone until it is repaired.',
    options: ['Cut power to industry', 'Let the homes go dark'],
    notes: ['Half alloy output for 90 seconds.', '-8 morale for 90 seconds. Labour is angry.'],
    when: s => s.rates.powerDemand > 60,
    choose: (s, o) => { if (o === 0) boost(s, 'divert', 90); else { boost(s, 'dark', 90); sway(s, { labour: -6 }); } },
  },
  breach: {
    title: 'Citizen records have leaked', text: 'Someone copied a district\'s worth of personal data. Nobody outside knows yet.',
    options: ['Tell the city', 'Bury it'],
    notes: ['Lose a third of your data. Trust rises.', 'Costs nothing now. If it comes out, trust falls hard.'],
    when: s => s.res.data > 100,
    choose: (s, o) => {
      if (o === 0) { s.res.data *= 0.67; s.gov.trust = clamp(s.gov.trust + 5); }
      else if (rand(s.gov) < 0.5) { s.gov.grievance += 14; emit(s, 'The buried data leak has come out', 'warn'); }
    },
  },
  squatters: {
    title: 'Families are sleeping in the transit halls', text: 'There are more people than homes.',
    options: ['Open the spire\'s lower floors', 'Move them on'],
    notes: ['+5% homes for 3 minutes. Enterprise objects.', 'Labour is angry and people remember.'],
    when: s => s.citizens >= s.rates.housing && s.citizens > 150,
    choose: (s, o) => { if (o === 0) { boost(s, 'shelter', 180); sway(s, { enterprise: -6, commons: 4 }); } else { sway(s, { labour: -10 }); s.gov.grievance += 5; } },
  },
  crews: {
    title: 'Foundry crews demand shorter shifts', text: 'They have stopped short of a strike, for now.',
    options: ['Agree', 'Refuse'],
    notes: ['Working hours move one step shorter.', 'Labour loses 10 satisfaction.'],
    when: s => s.gov.groups.labour.sat < 48 && s.gov.policies.hours < 2,
    choose: (s, o) => { if (o === 0) { s.gov.policies.hours++; sway(s, { labour: 8 }); } else sway(s, { labour: -10 }); },
  },
  investors: {
    title: 'Investors offer capital for a free hand', text: 'A consortium will fund the city now if the market is opened.',
    options: ['Take the money', 'Decline'],
    notes: ['A lump of credits. Wealth policy becomes Open market.', 'Enterprise is disappointed.'],
    when: s => s.gov.policies.wealth > 0 && s.citizens > 300,
    choose: (s, o) => { if (o === 0) { s.res.credits += 900 * s.architect; s.gov.policies.wealth = 0; sway(s, { labour: -6 }); } else sway(s, { enterprise: -6 }); },
  },
  festival: {
    title: 'Citizens propose a festival of lights', text: 'They want the towers dressed for one night.',
    options: ['Fund it', 'Not now'],
    notes: ['Costs credits. +8 morale for 2 minutes and a little trust.', 'The commons are let down.'],
    when: s => s.morale > 55 && s.res.credits > 400 * s.architect,
    choose: (s, o) => { if (o === 0) { s.res.credits -= 300 * s.architect; boost(s, 'festival', 120); s.gov.trust = clamp(s.gov.trust + 3); } else sway(s, { commons: -4 }); },
  },
};

function rand(g: GovState): number {
  g.rng = (g.rng + 0x6d2b79f5) | 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function apply(m: Mods, groups: Record<GroupKey, number>, e: Effect, acc: { trust: number }): void {
  for (const k of Object.keys(m.out) as ResKey[]) m.out[k] *= (e.out?.[k] ?? 1) * (e.outAll ?? 1);
  m.jobs *= e.jobs ?? 1;
  m.housing *= e.housing ?? 1;
  m.draw *= e.draw ?? 1;
  m.morale += e.morale ?? 0;
  m.growth *= e.growth ?? 1;
  m.build *= e.build ?? 1;
  acc.trust += e.trust ?? 0;
  for (const k of GROUP_ORDER) groups[k] += e.groups?.[k] ?? 0;
}

/** Strikes start below this satisfaction. */
export function strikeThreshold(g: GovState): number {
  if (g.policies.oversight === 2) return -1; // total awareness: nothing gets that far
  return (g.policies.oversight === 0 ? 34 : 28) - (g.enacted.includes('predictive') ? 12 : 0);
}

export const STRIKES: Record<GroupKey, { name: string; effect: Effect }> = {
  labour: { name: 'Labour has walked out', effect: { out: { alloy: 0.45, food: 0.6 } } },
  enterprise: { name: 'Enterprise is moving its money out', effect: { out: { credits: 0.5, data: 0.5 } } },
  commons: { name: 'The commons are in the streets', effect: { growth: 0, morale: -5 } },
};

/** Advance governance by dt. Call right after the city model's step. */
export function stepGovernance(s: CityState, dt: number): void {
  const g = s.gov;
  const r = s.rates;

  // Who lives here: shares follow what kind of work the city offers.
  let labour = 12, enterprise = 12, parks = 0;
  for (const d of s.districts) {
    if (!d || d.standing === 0) continue;
    const jobs = INTENTS[d.intent].jobs * d.standing;
    if (d.intent === 'commerce' || d.intent === 'research') enterprise += jobs;
    else if (d.intent === 'park') parks++;
    else labour += jobs;
  }
  const commons = 12 + 0.4 * (labour + enterprise) + parks * 12;
  const total = labour + enterprise + commons;
  g.groups.labour.share = labour / total;
  g.groups.enterprise.share = enterprise / total;
  g.groups.commons.share = commons / total;

  // Gather every effect in force.
  const m = neutralMods();
  const offsets: Record<GroupKey, number> = { labour: 0, enterprise: 0, commons: 0 };
  const acc = { trust: 0 };
  for (const k of POLICY_ORDER) apply(m, offsets, POLICIES[k].options[g.policies[k]].effect, acc);
  apply(m, offsets, AUTONOMY[g.autonomy].effect, acc);
  for (const id of g.enacted) apply(m, offsets, INITIATIVES[id].effect, acc);
  for (const b of g.boosts) apply(m, offsets, BOOSTS[b.id], acc);
  if (g.strike) apply(m, offsets, STRIKES[g.strike.group].effect, acc);

  // Group satisfaction follows city morale, shifted by what each group cares about.
  if (r.workers - r.employed > r.workers * 0.25) offsets.labour -= 12;
  if (s.citizens > r.housing) offsets.labour -= 6;
  if (r.income.credits > 0 && g.policies.wealth === 0) offsets.enterprise += 3;
  offsets.commons += Math.min(10, parks * 2);
  let avg = 0;
  for (const k of GROUP_ORDER) {
    const grp = g.groups[k];
    const target = clamp(s.morale + offsets[k]);
    grp.sat += Math.max(-2 * dt, Math.min(2 * dt, target - grp.sat));
    avg += grp.sat * grp.share;
  }

  // Trust in the Architect, and in you for how you use it.
  g.grievance = Math.max(0, g.grievance - 0.03 * dt);
  const trustTarget = clamp(52 + (avg - 55) * 0.7 + acc.trust - g.grievance);
  g.trust += Math.max(-0.8 * dt, Math.min(0.8 * dt, trustTarget - g.trust));
  m.morale += (g.trust - 55) / 6;
  if (g.trust < 30) m.growth *= 0.5;
  if (g.trust < 18 && s.citizens > 20) s.citizens *= 1 - 0.0015 * dt; // people leave a city they do not trust
  s.mods = m;

  // Timers.
  for (const k of POLICY_ORDER) g.cooldown[k] = Math.max(0, g.cooldown[k] - dt);
  for (const b of g.boosts) b.t -= dt;
  if (g.boosts.some(b => b.t <= 0)) g.boosts = g.boosts.filter(b => b.t > 0);

  // Strikes.
  if (g.strike) {
    g.strike.t -= dt;
    if (g.strike.t <= 0) {
      g.groups[g.strike.group].sat = clamp(g.groups[g.strike.group].sat + 10);
      emit(s, `${GROUPS[g.strike.group].name}: the unrest has ended`, 'good');
      g.strike = null;
    }
  } else {
    const limit = strikeThreshold(g);
    for (const k of GROUP_ORDER) {
      if (g.groups[k].sat < limit && rand(g) < 0.02 * dt) {
        g.strike = { group: k, t: 75 };
        if (k === 'commons') g.grievance += 6;
        emit(s, STRIKES[k].name, 'warn');
        break;
      }
    }
  }

  // The Architect acting by itself, as far as its autonomy allows.
  if (g.autonomy >= 1 && Math.floor(s.time / 3) !== Math.floor((s.time - dt) / 3)) {
    const a = advise(s);
    const essential = a.intent === 'farms' || a.intent === 'power';
    if (a.kind !== 'wait' && a.affordable && (g.autonomy >= 2 || (essential && a.kind !== 'upgrade'))) {
      const err = a.kind === 'brief' ? brief(s, a.site, a.intent!, a.character!) : a.kind === 'grow' ? grow(s, a.site) : upgradeArchitect(s);
      if (!err) emit(s, `The Architect acted: ${a.title.toLowerCase()}`, 'info');
    }
  }
  if (g.autonomy >= 3 && Math.floor(s.time / 150) !== Math.floor((s.time - dt) / 150)) {
    // A sovereign Architect tunes policy for output, whatever you had chosen.
    const want: [PolicyKey, number][] = [['hours', 0], ['wealth', 0], ['oversight', 2]];
    const change = want.find(([k, o]) => g.policies[k] !== o && g.cooldown[k] <= 0);
    if (change) {
      g.policies[change[0]] = change[1];
      g.cooldown[change[0]] = POLICY_COOLDOWN;
      emit(s, `The Architect changed ${POLICIES[change[0]].name.toLowerCase()} policy to ${POLICIES[change[0]].options[change[1]].name}`, 'warn');
    }
  }

  // Decisions for the player.
  if (g.pending) {
    g.pending.t -= dt;
    if (g.pending.t <= 0) {
      const p = g.pending;
      if (p.kind === 'initiative' && g.autonomy >= 2) resolve(s, 0, true);
      else if (p.kind === 'event') resolve(s, 1, true);
      else g.pending = null; // the proposal lapses; it may come back
    }
  } else {
    g.nextInitiative -= dt;
    g.nextEvent -= dt;
    if (g.nextInitiative <= 0) {
      g.nextInitiative = 200 + rand(g) * 80;
      const open = Object.keys(INITIATIVES).filter(id => !g.enacted.includes(id) && !g.refused.includes(id) && INITIATIVES[id].when(s));
      if (open.length) {
        const id = open[Math.floor(rand(g) * open.length)];
        const t = g.autonomy >= 3 ? 12 : 50;
        g.pending = { id, kind: 'initiative', t, total: t, site: INITIATIVES[id].site?.(s) ?? -1 };
      }
    } else if (g.nextEvent <= 0) {
      g.nextEvent = 170 + rand(g) * 90;
      const open = Object.keys(EVENTS).filter(id => EVENTS[id].when(s));
      if (open.length) {
        const id = open[Math.floor(rand(g) * open.length)];
        g.pending = { id, kind: 'event', t: 60, total: 60, site: -1 };
      }
    }
  }
}

function resolve(s: CityState, option: 0 | 1, auto: boolean): void {
  const g = s.gov, p = g.pending;
  if (!p) return;
  g.pending = null;
  if (p.kind === 'event') {
    EVENTS[p.id].choose(s, option);
    if (auto) emit(s, `${EVENTS[p.id].title}: the moment passed (${EVENTS[p.id].options[1].toLowerCase()})`, 'info');
    return;
  }
  const def = INITIATIVES[p.id];
  if (option === 1) {
    g.refused.push(p.id);
    if (def.troubling) g.trust = clamp(g.trust + 2);
    return;
  }
  const cost = { credits: (def.cost ?? 0) * s.architect };
  if (!canAfford(s, cost)) { emit(s, `${def.title}: not enough credits`, 'warn'); return; }
  pay(s, cost);
  g.enacted.push(p.id);
  g.grievance += def.grievance ?? 0;
  if (p.id === 'renewal' && p.site >= 0) {
    const d = s.districts[p.site];
    if (d && d.intent === 'housing') {
      d.character = 'efficient';
      d.standing = 0; // cleared: nobody lives there until it is rebuilt
      d.build = d.buildTotal = briefTime('housing', d.level);
    }
  }
  emit(s, auto ? `The Architect went ahead: ${def.title.toLowerCase()}` : `Enacted: ${def.title.toLowerCase()}`, def.troubling ? 'warn' : 'good');
}

// ---------- Commands: each returns null, or a short reason it was refused ----------

export function setPolicy(s: CityState, key: PolicyKey, option: number): string | null {
  const g = s.gov;
  if (!POLICIES[key].options[option]) return 'No such option';
  if (g.policies[key] === option) return null;
  if (g.cooldown[key] > 0) return `${POLICIES[key].name} policy was changed recently. Wait ${Math.ceil(g.cooldown[key])}s`;
  g.policies[key] = option;
  g.cooldown[key] = POLICY_COOLDOWN;
  g.decisions++;
  return null;
}

export function setAutonomy(s: CityState, level: number): string | null {
  if (!AUTONOMY[level]) return 'No such level';
  if (s.gov.autonomy !== level) { s.gov.autonomy = level; s.gov.decisions++; }
  return null;
}

/** Answer the pending decision. For an initiative, 0 approves and 1 refuses. For an event, 0 or 1 picks the option. */
export function decide(s: CityState, option: 0 | 1): string | null {
  const p = s.gov.pending;
  if (!p) return 'Nothing to decide';
  if (p.kind === 'initiative' && option === 0) {
    const def = INITIATIVES[p.id];
    if (!canAfford(s, { credits: (def.cost ?? 0) * s.architect })) return 'Not enough credits';
  }
  resolve(s, option, false);
  return null;
}

/** One tick of the whole city: the model, then governance. */
export function tick(s: CityState, dt?: number): void {
  step(s, dt);
  stepGovernance(s, dt ?? 0.1);
}
