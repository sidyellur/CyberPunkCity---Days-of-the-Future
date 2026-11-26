// Layer 1 city simulation: districts raised by brief, feeding one shared economy.
// Pure and DOM-free; the state is plain JSON so it can be saved as-is.

export const SIZE = 9; // blocks per side; the centre block is the Architect's plaza
export const CENTRE = (SIZE * SIZE - 1) / 2;
export const DT = 0.1;

export type Intent = 'housing' | 'farms' | 'industry' | 'commerce' | 'power' | 'research' | 'park' | 'defence';
export type Character = 'efficient' | 'balanced' | 'green';
export type ResKey = 'credits' | 'alloy' | 'food' | 'data';
export type Res = Record<ResKey, number>;
export type Cost = Partial<Res>;

export interface IntentDef {
  name: string;
  desc: string;
  cost: Cost;
  time: number;
  out?: Cost; // per second at level 1, fully staffed and powered
  housing?: number;
  jobs: number;
  power: number; // positive generates, negative draws
  morale: number;
  unlock: number; // Architect level required
  defence?: number; // protection rating at level 1, fully staffed
}

export const INTENTS: Record<Intent, IntentDef> = {
  housing: { name: 'Housing', desc: 'Homes for your citizens.', cost: { credits: 120, alloy: 80 }, time: 14, housing: 60, jobs: 0, power: -4, morale: 0, unlock: 1 },
  farms: { name: 'Vertical farms', desc: 'Stacked grow-halls. Feeds the city.', cost: { credits: 100, alloy: 60 }, time: 14, out: { food: 3 }, jobs: 20, power: -3, morale: 0, unlock: 1 },
  industry: { name: 'Industry', desc: 'Foundries and fabricators. Makes alloy, and noise.', cost: { credits: 140, alloy: 60 }, time: 16, out: { alloy: 2.4 }, jobs: 28, power: -6, morale: -3, unlock: 1 },
  commerce: { name: 'Commerce', desc: 'Markets and offices. Earns credits.', cost: { credits: 120, alloy: 100 }, time: 16, out: { credits: 3.5 }, jobs: 24, power: -4, morale: 0, unlock: 1 },
  power: { name: 'Power', desc: 'Reactor halls. Feeds the grid.', cost: { credits: 150, alloy: 120 }, time: 18, jobs: 10, power: 36, morale: 0, unlock: 1 },
  research: { name: 'Research', desc: 'Labs and data vaults. Produces data.', cost: { credits: 260, alloy: 200 }, time: 22, out: { data: 0.8 }, jobs: 18, power: -8, morale: 0, unlock: 2 },
  defence: { name: 'Defence', desc: 'Drone bays and shield grids. Protects the city.', cost: { credits: 200, alloy: 220 }, time: 20, jobs: 20, power: -8, morale: 0, unlock: 2, defence: 10 },
  park: { name: 'Green space', desc: 'Open ground and trees. Lifts morale.', cost: { credits: 80, alloy: 40 }, time: 10, jobs: 0, power: -1, morale: 7, unlock: 1 },
};
/** Intents offered in the brief menu. Defence joins once the conflict layer is live. */
export const INTENT_ORDER: Intent[] = ['housing', 'farms', 'industry', 'commerce', 'power', 'park', 'research'];

export interface CharacterDef { name: string; desc: string; out: number; housing: number; jobs: number; draw: number; morale: number; cost: number }
export const CHARACTERS: Record<Character, CharacterDef> = {
  efficient: { name: 'Dense', desc: 'More of everything, harder to live in.', out: 1.25, housing: 1.3, jobs: 1.2, draw: 1.1, morale: -2, cost: 1.15 },
  balanced: { name: 'Balanced', desc: 'No strong trade-offs.', out: 1, housing: 1, jobs: 1, draw: 1, morale: 0, cost: 1 },
  green: { name: 'Green', desc: 'Less output, lighter on the grid, happier people.', out: 0.8, housing: 0.75, jobs: 0.9, draw: 0.7, morale: 2, cost: 1 },
};
export const CHARACTER_ORDER: Character[] = ['efficient', 'balanced', 'green'];

export const MAX_LEVEL = 4;
export const ARCHITECT_UPS: { cost: Cost; time: number }[] = [
  { cost: { credits: 1500, alloy: 1200 }, time: 30 },
  { cost: { credits: 6000, alloy: 5000, data: 300 }, time: 45 },
  { cost: { credits: 20000, alloy: 16000, data: 1200 }, time: 60 },
];
export const levelMult = (level: number) => 1 + 0.75 * (level - 1);
/** Damage repaired per second: a wrecked district is whole again in about four minutes. */
export const REPAIR_RATE = 0.004;

export interface District {
  intent: Intent;
  character: Character;
  level: number;
  /** Seconds of construction left. While a district grows it keeps working at `standing`. */
  build: number;
  buildTotal: number;
  /** Level that is finished and in use; 0 while the first build is still rising. */
  standing: number;
  staffing: number;
  /** 0 (intact) to 1 (wrecked). Damage cuts what the district provides and repairs over time. */
  damage: number;
}

export interface Rates {
  income: Res;
  powerSupply: number;
  powerDemand: number;
  powerRatio: number;
  housing: number;
  jobs: number;
  workers: number;
  employed: number;
  moraleTarget: number;
  starving: boolean;
  defence: number;
}

export interface CityState {
  version: 1;
  seed: number;
  time: number;
  res: Res;
  citizens: number;
  morale: number;
  architect: number;
  archUp: number;
  archTotal: number;
  districts: (District | null)[];
  rates: Rates;
  objectives: number;
  events: { msg: string; kind: 'info' | 'warn' | 'good' }[];
}

export function createCity(seed = 1): CityState {
  const s: CityState = {
    version: 1, seed, time: 0,
    res: { credits: 700, alloy: 450, food: 300, data: 0 },
    citizens: 24, morale: 62, architect: 1, archUp: 0, archTotal: 0,
    districts: new Array<District | null>(SIZE * SIZE).fill(null),
    rates: {
      income: { credits: 0, alloy: 0, food: 0, data: 0 }, powerSupply: 0, powerDemand: 0, powerRatio: 1,
      housing: 0, jobs: 0, workers: 0, employed: 0, moraleTarget: 60, starving: false, defence: 0,
    },
    objectives: 0, events: [],
  };
  recompute(s);
  return s;
}

export const siteXY = (i: number) => ({ x: i % SIZE, y: Math.floor(i / SIZE) });
export function neighbours(i: number): number[] {
  const { x, y } = siteXY(i);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < SIZE - 1) out.push(i + 1);
  if (y > 0) out.push(i - SIZE);
  if (y < SIZE - 1) out.push(i + SIZE);
  return out;
}

export function canAfford(s: CityState, cost: Cost): boolean {
  return (Object.keys(cost) as ResKey[]).every(k => s.res[k] >= (cost[k] ?? 0));
}
function pay(s: CityState, cost: Cost): void {
  for (const k of Object.keys(cost) as ResKey[]) s.res[k] -= cost[k] ?? 0;
}
const round5 = (n: number) => Math.round(n / 5) * 5;

export function briefCost(intent: Intent, character: Character, level: number): Cost {
  const base = INTENTS[intent].cost, m = Math.pow(2.5, level - 1) * CHARACTERS[character].cost;
  const out: Cost = {};
  for (const k of Object.keys(base) as ResKey[]) out[k] = round5((base[k] ?? 0) * m);
  return out;
}
export const briefTime = (intent: Intent, level: number) => Math.round(INTENTS[intent].time * Math.pow(1.4, level - 1));

function emit(s: CityState, msg: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
  s.events.push({ msg, kind });
  if (s.events.length > 12) s.events.shift();
}

/** What a district contributes at a given level, before staffing, power and morale. */
export function districtStats(d: { intent: Intent; character: Character }, level: number) {
  const def = INTENTS[d.intent], ch = CHARACTERS[d.character], m = levelMult(level);
  const out: Cost = {};
  if (def.out) for (const k of Object.keys(def.out) as ResKey[]) out[k] = (def.out[k] ?? 0) * m * ch.out;
  return {
    out,
    housing: Math.round((def.housing ?? 0) * m * ch.housing),
    jobs: Math.round(def.jobs * m * ch.jobs),
    power: def.power > 0 ? def.power * m * ch.out : def.power * (1 + 0.5 * (level - 1)) * ch.draw,
    morale: def.morale * (def.morale > 0 ? 1 + 0.5 * (level - 1) : 1) + ch.morale * (def.jobs > 0 || def.housing ? 1 : 0),
    defence: (def.defence ?? 0) * m * ch.out,
  };
}

/** How a district and its neighbours affect each other. Positive is good. */
export function adjacency(s: CityState, i: number, intent: Intent): { morale: number; outMult: number; notes: string[] } {
  let morale = 0, outMult = 1;
  const notes: string[] = [];
  const count = (k: Intent) => neighbours(i).filter(n => s.districts[n]?.intent === k).length;
  if (intent === 'housing') {
    const ind = count('industry'), park = count('park'), com = count('commerce');
    if (ind) { morale -= 4 * ind; notes.push(`Next to industry: -${4 * ind} morale`); }
    if (park) { morale += 3 * park; notes.push(`Next to green space: +${3 * park} morale`); }
    if (com) { morale += com; notes.push(`Shops nearby: +${com} morale`); }
  } else if (intent === 'commerce') {
    const homes = Math.min(2, count('housing'));
    if (homes) { outMult += 0.2 * homes; notes.push(`Customers next door: +${20 * homes}% credits`); }
  } else if (intent === 'industry') {
    const homes = count('housing');
    if (homes) { morale -= 4 * homes; notes.push(`Next to housing: -${4 * homes} morale`); }
  } else if (intent === 'park') {
    const homes = count('housing');
    if (homes) { morale += 3 * homes; notes.push(`Serves ${homes} housing ${homes === 1 ? 'district' : 'districts'}: +${3 * homes} morale`); }
  }
  return { morale, outMult, notes };
}

// Farms fill first, so a city that has collapsed can still feed itself back to health.
const STAFF_ORDER: Intent[] = ['farms', 'power', 'defence', 'industry', 'commerce', 'research'];
const SPIRE = { housing: 40, power: 24, credits: 2, alloy: 1.2 };

/** Derive rates from the current districts. Safe to call at any time. */
export function recompute(s: CityState): void {
  const r = s.rates;
  const live: { i: number; d: District; st: ReturnType<typeof districtStats> }[] = [];
  s.districts.forEach((d, i) => {
    if (!d) return;
    d.damage ??= 0; // saves from before damage existed
    if (d.standing > 0) live.push({ i, d, st: districtStats(d, d.standing) });
  });

  // Staffing: 60% of citizens work; essential services fill first.
  r.workers = Math.floor(s.citizens * 0.6);
  let free = r.workers;
  r.jobs = 0;
  for (const intent of STAFF_ORDER) {
    for (const l of live) {
      if (l.d.intent !== intent) continue;
      const take = Math.min(l.st.jobs, free);
      l.d.staffing = l.st.jobs ? take / l.st.jobs : 1;
      free -= take;
      r.jobs += l.st.jobs;
    }
  }
  for (const l of live) if (!INTENTS[l.d.intent].jobs) l.d.staffing = 1;
  r.employed = r.workers - free;

  const archMult = 1 + 0.5 * (s.architect - 1);
  let supply = SPIRE.power * archMult, demand = 0, housing = SPIRE.housing * archMult;
  r.defence = 0;
  for (const l of live) {
    const intact = 1 - l.d.damage;
    if (l.st.power > 0) supply += l.st.power * l.d.staffing * intact; else demand -= l.st.power;
    housing += l.st.housing * intact;
    r.defence += l.st.defence * l.d.staffing * intact;
  }
  r.powerSupply = supply; r.powerDemand = demand;
  r.powerRatio = demand > 0 ? Math.min(1, supply / demand) : 1;
  r.housing = Math.floor(housing);

  const moraleMult = 0.6 + (0.6 * s.morale) / 100;
  const inc: Res = { credits: SPIRE.credits * archMult, alloy: SPIRE.alloy * archMult, food: 0, data: 0 };
  let moraleTerms = 0, adj = 0;
  for (const l of live) {
    const a = adjacency(s, l.i, l.d.intent);
    adj += a.morale;
    moraleTerms += l.st.morale;
    for (const k of Object.keys(l.st.out) as ResKey[]) {
      inc[k] += (l.st.out[k] ?? 0) * l.d.staffing * (l.st.power < 0 ? r.powerRatio : 1) * moraleMult * a.outMult * (1 - l.d.damage);
    }
  }
  inc.food -= s.citizens * 0.02;
  r.income = inc;
  r.starving = s.res.food <= 0 && inc.food < 0;

  let target = 60 + Math.max(-30, Math.min(30, moraleTerms + adj / 2));
  if (r.starving) target -= 30;
  target -= 30 * (1 - r.powerRatio);
  if (s.citizens > r.housing) target -= 15;
  if (r.workers - r.employed > Math.max(8, r.workers * 0.25)) target -= 8; // idle hands
  r.moraleTarget = Math.max(0, Math.min(100, target));
}

export const OBJECTIVES: { text: string; done: (s: CityState) => boolean }[] = [
  { text: 'Brief the Architect to raise vertical farms', done: s => standing(s, 'farms') > 0 },
  { text: 'Raise a power district', done: s => standing(s, 'power') > 0 },
  { text: 'Raise a housing district', done: s => standing(s, 'housing') > 0 },
  { text: 'Put people to work: raise industry and commerce', done: s => standing(s, 'industry') > 0 && standing(s, 'commerce') > 0 },
  { text: 'Grow the city to 150 citizens', done: s => s.citizens >= 150 },
  { text: 'Upgrade the Architect to level 2', done: s => s.architect >= 2 },
  { text: 'Grow a district to level 2', done: s => s.districts.some(d => d && d.standing >= 2) },
  { text: 'Reach 500 citizens across 14 districts', done: s => s.citizens >= 500 && s.districts.filter(d => d && d.standing).length >= 14 },
  { text: 'Upgrade the Architect to level 4 and reach 1,500 citizens', done: s => s.architect >= 4 && s.citizens >= 1500 },
];
function standing(s: CityState, intent: Intent): number {
  return s.districts.filter(d => d && d.intent === intent && d.standing > 0).length;
}
export const currentObjective = (s: CityState) => OBJECTIVES.findIndex((_, i) => !(s.objectives & (1 << i)));

export function step(s: CityState, dt: number = DT): void {
  s.time += dt;
  for (const d of s.districts) {
    if (!d) continue;
    if (d.damage > 0) d.damage = Math.max(0, d.damage - REPAIR_RATE * dt);
    if (d.build <= 0) continue;
    d.build = Math.max(0, d.build - dt);
    if (d.build === 0) {
      d.standing = d.level;
      emit(s, d.level === 1 ? `${INTENTS[d.intent].name} district complete` : `${INTENTS[d.intent].name} district grown to level ${d.level}`, 'good');
    }
  }
  if (s.archUp > 0) {
    s.archUp = Math.max(0, s.archUp - dt);
    if (s.archUp === 0) { s.architect++; emit(s, `The Architect has reached level ${s.architect}`, 'good'); }
  }
  recompute(s);
  const r = s.rates;
  for (const k of Object.keys(r.income) as ResKey[]) s.res[k] = Math.max(0, s.res[k] + r.income[k] * dt);

  const drift = 1.5 * dt;
  s.morale += Math.max(-drift, Math.min(drift, r.moraleTarget - s.morale));

  if (!r.starving && s.morale >= 35 && s.citizens < r.housing) {
    s.citizens = Math.min(r.housing, s.citizens + (0.5 + s.citizens * 0.012) * (s.morale / 60) * dt);
  } else if ((r.starving || s.morale < 20) && s.citizens > 10) {
    s.citizens = Math.max(10, s.citizens * (1 - 0.006 * dt));
  }
  OBJECTIVES.forEach((o, i) => { if (!(s.objectives & (1 << i)) && o.done(s)) s.objectives |= 1 << i; });
}

// ---------- Commands: each returns null, or a short reason it was refused ----------

export function brief(s: CityState, i: number, intent: Intent, character: Character): string | null {
  if (i === CENTRE || i < 0 || i >= s.districts.length) return 'That is the Architect\'s plaza';
  if (s.districts[i]) return 'This site already has a district';
  if (INTENTS[intent].unlock > s.architect) return `${INTENTS[intent].name} needs a level ${INTENTS[intent].unlock} Architect`;
  const cost = briefCost(intent, character, 1);
  if (!canAfford(s, cost)) return 'Not enough resources';
  pay(s, cost);
  const t = briefTime(intent, 1);
  s.districts[i] = { intent, character, level: 1, build: t, buildTotal: t, standing: 0, staffing: 0, damage: 0 };
  return null;
}

export function grow(s: CityState, i: number): string | null {
  const d = s.districts[i];
  if (!d) return 'Nothing here to grow';
  if (d.build > 0) return 'Still under construction';
  if (d.level >= MAX_LEVEL) return 'Already at the highest level';
  if (d.level >= s.architect) return `Upgrade the Architect to level ${s.architect + 1} first`;
  const cost = briefCost(d.intent, d.character, d.level + 1);
  if (!canAfford(s, cost)) return 'Not enough resources';
  pay(s, cost);
  d.level++;
  d.build = d.buildTotal = briefTime(d.intent, d.level);
  return null;
}

export function clearSite(s: CityState, i: number): string | null {
  const d = s.districts[i];
  if (!d) return 'Nothing here to clear';
  const cost = briefCost(d.intent, d.character, 1);
  for (const k of Object.keys(cost) as ResKey[]) s.res[k] += Math.round((cost[k] ?? 0) * 0.3);
  s.districts[i] = null;
  recompute(s);
  return null;
}

/** Damage a district (from an attack, sabotage or disaster). Returns the damage actually dealt. */
export function damageDistrict(s: CityState, i: number, amount: number): number {
  const d = s.districts[i];
  if (!d || d.standing === 0 || amount <= 0) return 0;
  const before = d.damage;
  d.damage = Math.min(1, d.damage + amount);
  return d.damage - before;
}

export function upgradeArchitect(s: CityState): string | null {
  if (s.architect >= MAX_LEVEL) return 'The Architect is at its highest level';
  if (s.archUp > 0) return 'Upgrade already under way';
  const up = ARCHITECT_UPS[s.architect - 1];
  if (!canAfford(s, up.cost)) return 'Not enough resources';
  pay(s, up.cost);
  s.archUp = s.archTotal = up.time;
  return null;
}
