// Layer 3 conflict engine: rival cities, doctrine, raids, hacking and diplomacy.
// Pure and DOM-free; the state is plain JSON (it carries its own seeded RNG) so it can be saved as-is.
// The player sets doctrine (posture and objective); the city's AI plans and fights.
import { CityState, Intent, ResKey, INTENTS, CENTRE, neighbours, damageDistrict } from './model';

// ---------- Tunable numbers ----------

export type Difficulty = 'easy' | 'normal' | 'hard';
export interface DifficultyDef {
  name: string;
  /** Seconds of peace before anyone makes a move. */
  grace: number;
  /** Multiplies how fast rival economies grow, and how large they can get. */
  growth: number;
  cap: number;
  /** Multiplies the time between rival raids and hacks (higher is gentler). */
  tempo: number;
  /** Multiplies how strong a rival wants its odds to be before it attacks (higher is more timid). */
  caution: number;
  /** Nexus integrity lost to a full breach. */
  nexusHit: number;
  /** Multiplies how fast relations sour on their own. */
  drift: number;
}
export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { name: 'Easy', grace: 540, growth: 0.8, cap: 0.75, tempo: 1.3, caution: 1.15, nexusHit: 6, drift: 0.6 },
  normal: { name: 'Normal', grace: 480, growth: 1, cap: 1, tempo: 1, caution: 1, nexusHit: 9, drift: 1 },
  hard: { name: 'Hard', grace: 420, growth: 1.4, cap: 1.3, tempo: 0.7, caution: 0.75, nexusHit: 12, drift: 1.5 },
};

export type RivalId = 'karst' | 'meridian';
export interface RivalDef {
  name: string;
  /** The intelligence that runs it. */
  ai: string;
  desc: string;
  economy: number; // starting economy
  growth: number; // logistic growth per second
  cap: number; // economy ceiling
  militarism: number; // strength it aims for per point of economy
  fort: number; // multiplies its strength when defending at home
  security: number; // subtracted from the chance your hacks succeed
  commit: number; // share of its strength sent on a raid
  caution: number; // odds (its raid power over your defence) it wants before attacking
  raidEvery: number; // seconds between raids
  hackEvery: number; // seconds between hacks
  hacks: RivalHack[]; // what it tries, picked at random
  targets: Intent[]; // what its raids go for, in order of preference
  loot: ResKey; // what its raiders carry off
  relations: number; // starting relations with you
  baseline: number; // where relations settle if you do nothing
  greed: number; // how far a gift of credits moves it
  respect: number; // relations gained per second while you are at least as strong as it is
  tradeAt: number; // relations needed before it will trade
}
export type RivalHack = 'siphon' | 'blind' | 'grid';
export const RIVALS: Record<RivalId, RivalDef> = {
  karst: {
    name: 'Karst Hold', ai: 'The Castellan',
    desc: 'A fortress state cut into the mountain. It respects strength, strikes at defences and power, and cannot be bought.',
    economy: 30, growth: 0.0009, cap: 190, militarism: 0.65, fort: 1.35, security: 0.1, commit: 0.7, caution: 0.75,
    raidEvery: 220, hackEvery: 420, hacks: ['grid'], targets: ['defence', 'power', 'industry'], loot: 'alloy',
    relations: -35, baseline: -40, greed: 0.4, respect: 0.03, tradeAt: 30,
  },
  meridian: {
    name: 'Meridian Exchange', ai: 'The Broker',
    desc: 'A corporate tower-state. It hires its soldiers, raids for profit, hacks often, and everything it owns has a price.',
    economy: 45, growth: 0.0013, cap: 300, militarism: 0.4, fort: 0.9, security: 0.3, commit: 0.55, caution: 0.6,
    raidEvery: 270, hackEvery: 210, hacks: ['siphon', 'siphon', 'blind'], targets: ['commerce', 'research', 'industry'], loot: 'credits',
    relations: -10, baseline: -20, greed: 1, respect: 0.008, tradeAt: 15,
  },
};
export const RIVAL_ORDER: RivalId[] = ['karst', 'meridian'];

export type Posture = 'defend' | 'deter' | 'raid' | 'allout';
export interface PostureDef {
  name: string;
  desc: string;
  home: number; // share of the fleet kept over the city
  defMult: number; // multiplies home defence
  show: number; // multiplies how strong your defence looks to a rival weighing a raid
  strike: number; // share of the fleet sent on a strike
  strikeEvery: number; // seconds between strikes; 0 means never on its own
  minOdds: number; // the AI only strikes when it expects at least these odds
  upkeep: number; // multiplies fleet upkeep
  strain: number; // war weariness this posture holds the city at
}
export const POSTURES: Record<Posture, PostureDef> = {
  defend: { name: 'Defend', desc: 'Keep every ship over the city. No strikes.', home: 1, defMult: 1.2, show: 1, strike: 0, strikeEvery: 0, minOdds: 9, upkeep: 1, strain: 0 },
  deter: { name: 'Deter', desc: 'Show strength so rivals think twice. Strike back only when raided.', home: 0.85, defMult: 1, show: 1.5, strike: 0.5, strikeEvery: 0, minOdds: 1, upkeep: 1, strain: 4 },
  raid: { name: 'Raid', desc: 'Hold the city with half the fleet and strike when the odds are good.', home: 0.5, defMult: 1, show: 1, strike: 0.6, strikeEvery: 80, minOdds: 1, upkeep: 1.25, strain: 14 },
  allout: { name: 'All-out', desc: 'Throw nearly everything at the enemy. The city is left thin and people feel it.', home: 0.2, defMult: 1, show: 0.9, strike: 1, strikeEvery: 50, minOdds: 0.75, upkeep: 1.6, strain: 38 },
};
export const POSTURE_ORDER: Posture[] = ['defend', 'deter', 'raid', 'allout'];

export const FLEET = {
  credits: 60, alloy: 45, // cost per point of strength
  upkeep: 0.06, // credits per point per second
  buildRate: 0.5, // points delivered per second
  capBase: 10, capPerLevel: 20, // largest fleet the city can run, by Architect level
  unpaidDecay: 0.01, // share of the fleet lost per second when upkeep cannot be paid
};
/** Citizens' militia: the defence a city has with no defence districts and no fleet. */
export const MILITIA = 4;

export const RAID = {
  warning: 30, // seconds between a rival massing and the raid landing
  holdRelations: 20, // rivals at or above these relations do not raid or hack
  misjudge: 0.3, // rivals misread your defence by up to this share either way
  holdResolve: 20, // rivals below this resolve stay home
  repelBelow: 0.85, // raid power over defence below this is thrown back cleanly
  breachAbove: 1.15, // above this the raid breaks through; in between it is driven off with light damage
  breachSpan: 1.5, // how far past 1 the odds must go for a total breach
  glanceDamage: 0.15,
  damageBase: 0.2, damageSpan: 0.6, // district damage at breach 0 and the extra at breach 1
  extraTargets: 3, // districts hit beyond the first at a total breach
  lootBase: 0.03, lootSpan: 0.1, lootCap: 4000, // share of the stockpile carried off
  protect: 0.25, protectNear: 0.6, // damage multipliers for the protected district and its neighbours
  repelLoss: 0.35, breachLoss: 0.1, // share of the raiding force the rival loses
  repelResolve: 4, // resolve a rival loses when its raid is thrown back
  fleetLossBreach: 0.15, fleetLossRepel: 0.02, // share of the home fleet you lose
  escalateOver: 1800, // seconds after the grace period for pressure to rise one full step
  escalateMax: 2,
};
export const STRIKE = {
  resolve: 8, // rival resolve lost per successful strike, times the margin (1 to 2)
  industry: 0.1, // share of economy destroyed by "break their industry"
  power: 80, powerResolve: 3, // brownout seconds and extra resolve from "cut their power"
  forces: 0.2, // share of strength destroyed by "break their forces"
  plainEconomy: 0.04, plainForces: 0.08, // a strike with no objective does a little of both
  winLoss: 0.06, failLoss: 0.14, // share of the strike force you lose
  failEnemyLoss: 0.05,
  relations: 10, // relations lost per strike
  retaliateAfter: 20, // seconds before a deterrent strike-back
  strain: 3, // war weariness from a failed strike
};
export const OPS = {
  brownout: { name: 'Brownout', data: 40, desc: 'Black out their grid. Their economy runs at half for two minutes.' },
  steal: { name: 'Siphon', data: 30, desc: 'Drain credits and alloy from their accounts.' },
  blind: { name: 'Blind', data: 35, desc: 'Blind their sensors. Their defences and raids are weaker for two minutes.' },
  sabotage: { name: 'Sabotage', data: 80, desc: 'Wreck their foundries for good.' },
  firewall: { name: 'Firewall', data: 25, desc: 'Harden your own networks against intrusion for four minutes.' },
} as const;
export type Op = keyof typeof OPS;
export const HACK = {
  base: 0.8, // chance one of your operations works, before the rival's security
  researchBonus: 0.05, researchBonusMax: 0.15, // per research district
  cooldown: 40, // seconds between operations against the same rival
  detect: 0.3, // chance a successful operation is traced back to you
  relations: 8, // relations lost when traced or when an operation fails
  brownoutTime: 120, brownoutMult: 0.5, brownoutResolve: 5,
  blindTime: 120, blindDefence: 0.5, blindRaid: 0.75,
  stealCredits: 4, stealAlloy: 2, stealEconomy: 0.02, // per point of their economy
  sabotageEconomy: 0.08, sabotageStrength: 0.1, sabotageResolve: 5,
  firewallTime: 240, firewallMult: 0.25,
  // Rival hacks against you
  enemyBase: 0.7, enemyResearch: 0.08, enemyResearchMax: 0.4, // each research district makes intrusion harder
  siphonCredits: 0.06, siphonData: 0.1, siphonCap: 800,
  enemyBlindTime: 75, enemyBlindMult: 0.6, // your defence districts while blinded
  gridDamage: 0.35, gridTargets: 2,
  strain: 4,
};
export const DIPLOMACY = {
  truceTime: 300, truceCooldown: 240, truceRelations: -15, truceResolve: 50, truceStrength: 1.5, truceWarm: 0.02,
  tributePerPoint: 40, tributeMaxGain: 20, tributeCooldown: 60, tributeMinStrength: 0.5,
  tradeTime: 600, tradeIncome: 0.03, tradeWarm: 0.04, tradeGrowth: 1.2,
  inciteData: 60, inciteCredits: 300, inciteBase: 0.5, inciteTime: 300, inciteFail: 12, inciteRepeat: 0.15,
  feudLoss: 0.1, feudDefenderLoss: 0.12, feudEconomy: 0.06, feudResolve: 3,
  pactRelations: 70, // Karst Hold: an alliance between equals
  buyoutRelations: 50, buyoutPerEconomy: 55, buyoutFloor: 0.4, // Meridian Exchange: a price that falls with its resolve
  demandResolve: 35, demandStrength: 1.2, demandRefused: 6,
  tribute: 0.02, absorbed: 0.04, // credits per second per point of economy from a yielded or absorbed rival
  drift: 0.01, // relations per second toward the rival's baseline
  respectCap: 45, // respect alone cannot lift relations past this
};
export const RESOLVE = { start: 100, recover: 0.02, brokenBelow: 0.6, drain: 0.15 };
export const STRENGTH_REGEN = 0.004; // share of the gap to its target a rival closes per second, as a share of the target
export const NEXUS = { start: 100, regen: 0.03, calm: 90 };
export const STRAIN = { decay: 0.04, breach: 25, glance: 6, moralePerPoint: 0.25, relief: 30 };
const MAX_EVENTS = 16;

// ---------- State ----------

export type RivalStatus = 'active' | 'yielded' | 'absorbed' | 'allied';
export type Stance = 'peaceful' | 'hostile' | 'wary' | 'truce' | 'trading' | 'feuding' | 'yielded' | 'absorbed' | 'allied';
export interface Rival {
  id: RivalId;
  status: RivalStatus;
  economy: number;
  /** Highest economy it has reached; falling far below this breaks its will. */
  peak: number;
  strength: number;
  /** 0 to 100. At zero the rival yields. */
  resolve: number;
  /** -100 to 100. */
  relations: number;
  raidIn: number;
  hackIn: number;
  /** Seconds until a massed raid lands; 0 when none is on its way. */
  muster: number;
  musterPower: number;
  truce: number;
  truceCooldown: number;
  trade: number;
  tributeCooldown: number;
  brownout: number;
  blind: number;
  opCooldown: number;
  feudWith: RivalId | null;
  feud: number;
  incited: number;
  /** Game time at which it was neutralised; 0 while it is still a rival. */
  endedAt: number;
}
export type Objective =
  | { kind: 'none' }
  | { kind: 'protect'; site: number }
  | { kind: 'cutPower' | 'breakIndustry' | 'breakForces'; rival: RivalId };
export type Offer =
  | { kind: 'truce' | 'trade' | 'pact' | 'buyout' | 'demand' }
  | { kind: 'tribute'; credits: number }
  | { kind: 'incite'; against?: RivalId };
export interface ConflictEvent { msg: string; kind: 'info' | 'warn' | 'good' }
export interface ConflictState {
  version: 1;
  seed: number;
  rng: number;
  difficulty: Difficulty;
  time: number;
  posture: Posture;
  objective: Objective;
  fleet: number;
  fleetOrdered: number;
  unpaid: boolean;
  /** Nexus integrity, 0 to 100. At zero the city is broken. */
  nexus: number;
  sinceBreach: number;
  strikeIn: number;
  retaliate: RivalId | null;
  /** Seconds your defence districts stay blinded by a rival hack. */
  blind: number;
  firewall: number;
  /** War weariness, 0 to 100. */
  strain: number;
  /** Pressure the city layer should apply: `morale` is added to the morale target, `unrest` is 0 to 100. */
  effects: { morale: number; unrest: number };
  rivals: Record<RivalId, Rival>;
  stats: { raids: number; repelled: number; breaches: number; strikes: number; strikesWon: number; hacksSuffered: number; hacksBlocked: number; lootLost: number };
  over: null | 'win' | 'lose';
  reason: string;
  events: ConflictEvent[];
}

export function createConflict(seed = 1, difficulty: Difficulty = 'normal'): ConflictState {
  const diff = DIFFICULTIES[difficulty];
  const c: ConflictState = {
    version: 1, seed, rng: (seed * 2654435761 + 0x9e3779b9) >>> 0, difficulty, time: 0,
    posture: 'defend', objective: { kind: 'none' },
    fleet: 0, fleetOrdered: 0, unpaid: false,
    nexus: NEXUS.start, sinceBreach: NEXUS.calm, strikeIn: 0, retaliate: null, blind: 0, firewall: 0,
    strain: 0, effects: { morale: 0, unrest: 0 },
    rivals: {} as Record<RivalId, Rival>,
    stats: { raids: 0, repelled: 0, breaches: 0, strikes: 0, strikesWon: 0, hacksSuffered: 0, hacksBlocked: 0, lootLost: 0 },
    over: null, reason: '', events: [],
  };
  for (const id of RIVAL_ORDER) {
    const def = RIVALS[id];
    c.rivals[id] = {
      id, status: 'active', economy: def.economy, peak: def.economy, strength: def.economy * def.militarism,
      resolve: RESOLVE.start, relations: def.relations,
      // These count down from the end of the grace period.
      raidIn: def.raidEvery * diff.tempo * (0.25 + 0.5 * rnd(c)),
      hackIn: def.hackEvery * diff.tempo * (0.25 + 0.5 * rnd(c)),
      muster: 0, musterPower: 0, truce: 0, truceCooldown: 0, trade: 0, tributeCooldown: 0,
      brownout: 0, blind: 0, opCooldown: 0, feudWith: null, feud: 0, incited: 0, endedAt: 0,
    };
  }
  return c;
}

// ---------- Helpers ----------

/** Mulberry32, with its state kept in the conflict state so saves replay identically. */
function rnd(c: ConflictState): number {
  c.rng = (c.rng + 0x6d2b79f5) >>> 0;
  let t = c.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const tick = (v: number, dt: number) => Math.max(0, v - dt);
function emit(c: ConflictState, msg: string, kind: ConflictEvent['kind'] = 'info'): void {
  c.events.push({ msg, kind });
  if (c.events.length > MAX_EVENTS) c.events.shift();
}
const inGrace = (c: ConflictState) => c.time < DIFFICULTIES[c.difficulty].grace;
/** 0 at the end of the grace period, rising to RAID.escalateMax. */
export function escalation(c: ConflictState): number {
  return clamp((c.time - DIFFICULTIES[c.difficulty].grace) / RAID.escalateOver, 0, RAID.escalateMax);
}
const effectiveEconomy = (r: Rival) => r.economy * (r.brownout > 0 ? HACK.brownoutMult : 1);
const underTreaty = (r: Rival) => r.truce > 0 || r.trade > 0;
const researchCount = (city: CityState) => city.districts.filter(d => d && d.intent === 'research' && d.standing > 0).length;

export const fleetCap = (city: CityState) => FLEET.capBase + FLEET.capPerLevel * city.architect;
export const fleetUpkeep = (c: ConflictState) => c.fleet * FLEET.upkeep * POSTURES[c.posture].upkeep;
/** What stands between a raid and the city right now. */
export function homeDefence(city: CityState, c: ConflictState): number {
  const p = POSTURES[c.posture];
  return (MILITIA + city.rates.defence * (c.blind > 0 ? HACK.enemyBlindMult : 1) + c.fleet * p.home) * p.defMult;
}
/** What the AI can send on a strike under the current posture. */
export const strikePower = (c: ConflictState) => c.fleet * POSTURES[c.posture].strike;
/** Everything the city could bring to bear; what rivals weigh when they judge you. */
export const totalStrength = (city: CityState, c: ConflictState) => MILITIA + city.rates.defence + c.fleet;
/** What a strike on this rival has to beat. */
export const rivalDefence = (r: Rival) => r.strength * RIVALS[r.id].fort * (r.blind > 0 ? HACK.blindDefence : 1);
/** What a rival would send if it raided now. */
export const raidPower = (r: Rival) => r.strength * RIVALS[r.id].commit * (r.blind > 0 ? HACK.blindRaid : 1);

export function stanceOf(c: ConflictState, r: Rival): Stance {
  if (r.status !== 'active') return r.status;
  if (r.truce > 0) return 'truce';
  if (r.trade > 0) return 'trading';
  if (r.feud > 0) return 'feuding';
  if (inGrace(c)) return 'peaceful';
  return r.relations < RAID.holdRelations ? 'hostile' : 'wary';
}

function neutralise(c: ConflictState, r: Rival, status: RivalStatus, msg: string): void {
  r.status = status;
  r.endedAt = c.time;
  r.muster = 0; r.truce = 0; r.trade = 0; r.feud = 0; r.feudWith = null;
  for (const id of RIVAL_ORDER) if (c.rivals[id].feudWith === r.id) { c.rivals[id].feudWith = null; c.rivals[id].feud = 0; }
  if (c.objective.kind !== 'none' && c.objective.kind !== 'protect' && c.objective.rival === r.id) c.objective = { kind: 'none' };
  if (c.retaliate === r.id) c.retaliate = null;
  c.strain = Math.max(0, c.strain - STRAIN.relief);
  emit(c, msg, 'good');
  checkOver(c);
}

function checkOver(c: ConflictState): void {
  if (c.over) return;
  if (c.nexus <= 0) {
    c.nexus = 0;
    c.over = 'lose';
    c.reason = 'The Nexus has fallen. Too many raids broke through and the city can no longer govern itself.';
    emit(c, c.reason, 'warn');
    return;
  }
  if (RIVAL_ORDER.every(id => c.rivals[id].status !== 'active')) {
    const how: Record<RivalStatus, string> = { active: '', yielded: 'has yielded', absorbed: 'has joined your city', allied: 'stands with you as an ally' };
    c.over = 'win';
    c.reason = `No rival threatens the city any more. ${RIVAL_ORDER.map(id => `${RIVALS[id].name} ${how[c.rivals[id].status]}`).join(', and ')}.`;
    emit(c, c.reason, 'good');
  }
}

// ---------- The step ----------

/** Advance the conflict. Call right after `step(city, dt)` from the city model. */
export function stepConflict(city: CityState, c: ConflictState, dt: number): void {
  if (c.over) return;
  c.time += dt;
  const diff = DIFFICULTIES[c.difficulty];
  const p = POSTURES[c.posture];

  // Fleet: deliveries, upkeep.
  if (c.fleetOrdered > 0) {
    const built = Math.min(c.fleetOrdered, FLEET.buildRate * dt);
    c.fleetOrdered -= built; c.fleet += built;
  }
  const upkeep = fleetUpkeep(c) * dt;
  if (upkeep > 0) {
    if (city.res.credits >= upkeep) {
      city.res.credits -= upkeep;
      c.unpaid = false;
    } else {
      if (!c.unpaid) emit(c, 'The fleet is not being paid. Ships are standing down.', 'warn');
      c.unpaid = true;
      c.fleet = Math.max(0, c.fleet * (1 - FLEET.unpaidDecay * dt));
    }
  }

  c.blind = tick(c.blind, dt);
  c.firewall = tick(c.firewall, dt);
  c.sinceBreach += dt;
  if (c.sinceBreach >= NEXUS.calm && c.nexus < NEXUS.start) c.nexus = Math.min(NEXUS.start, c.nexus + NEXUS.regen * dt);

  for (const id of RIVAL_ORDER) {
    const r = c.rivals[id], def = RIVALS[id];
    if (r.status !== 'active') {
      // A neutralised rival pays into the city.
      city.res.credits += r.economy * (r.status === 'absorbed' ? DIPLOMACY.absorbed : DIPLOMACY.tribute) * dt;
      continue;
    }
    stepRival(city, c, r, def, diff, dt);
    if (c.over) return;
  }

  // The player's AI: strikes under the current doctrine.
  if (!inGrace(c)) {
    c.strikeIn = tick(c.strikeIn, dt);
    if (c.strikeIn === 0) {
      if (c.retaliate && p.strike > 0) {
        const r = c.rivals[c.retaliate];
        c.retaliate = null;
        if (r.status === 'active' && !underTreaty(r)) strike(c, r, true);
        c.strikeIn = p.strikeEvery || STRIKE.retaliateAfter;
      } else if (p.strikeEvery > 0) {
        const r = pickStrikeTarget(c);
        if (r) strike(c, r, false);
        c.strikeIn = p.strikeEvery;
      }
    }
  }
  if (c.over) return;

  // Strain at home.
  const floor = inGrace(c) ? 0 : p.strain;
  c.strain = c.strain > floor ? Math.max(floor, c.strain - STRAIN.decay * dt) : Math.min(floor, c.strain + STRAIN.decay * 4 * dt);
  c.strain = clamp(c.strain, 0, 100);
  c.effects.unrest = Math.round(c.strain);
  c.effects.morale = Math.round(-c.strain * STRAIN.moralePerPoint) || 0; // never -0
}

function stepRival(city: CityState, c: ConflictState, r: Rival, def: RivalDef, diff: DifficultyDef, dt: number): void {
  r.truce = tick(r.truce, dt);
  r.truceCooldown = tick(r.truceCooldown, dt);
  r.tributeCooldown = tick(r.tributeCooldown, dt);
  r.opCooldown = tick(r.opCooldown, dt);
  r.blind = tick(r.blind, dt);
  if (r.trade > 0) {
    r.trade = tick(r.trade, dt);
    city.res.credits += r.economy * DIPLOMACY.tradeIncome * dt;
    r.relations += DIPLOMACY.tradeWarm * def.greed * dt;
    if (r.trade === 0) emit(c, `The trade deal with ${def.name} has run out.`);
  }
  if (r.truce > 0) r.relations += DIPLOMACY.truceWarm * dt;
  if (r.feud > 0) {
    r.feud = tick(r.feud, dt);
    if (r.feud === 0) r.feudWith = null;
  }

  // Economy and forces.
  if (r.brownout > 0) r.brownout = tick(r.brownout, dt);
  else {
    const cap = def.cap * diff.cap;
    r.economy += def.growth * diff.growth * (r.trade > 0 ? DIPLOMACY.tradeGrowth : 1) * r.economy * Math.max(0, 1 - r.economy / cap) * dt;
  }
  r.peak = Math.max(r.peak, r.economy);
  const eco = effectiveEconomy(r), target = eco * def.militarism;
  const pace = STRENGTH_REGEN * Math.max(target, 1) * dt;
  r.strength += clamp(target - r.strength, -pace, pace);

  // Will to fight.
  const broken = r.peak * RESOLVE.brokenBelow;
  if (eco < broken) r.resolve -= RESOLVE.drain * (1 - eco / broken) * dt;
  else r.resolve = Math.min(RESOLVE.start, r.resolve + RESOLVE.recover * dt);
  if (r.resolve <= 0) {
    r.resolve = 0;
    neutralise(c, r, 'yielded', `${def.name} has yielded. ${def.ai} accepts your terms and will pay tribute.`);
    return;
  }

  // Relations settle toward the rival's baseline, and rise while you are its equal.
  if (!underTreaty(r)) {
    const base = def.baseline - 10 * escalation(c);
    r.relations += clamp(base - r.relations, -1, 1) * DIPLOMACY.drift * diff.drift * dt;
    if (totalStrength(city, c) >= r.strength && r.relations < DIPLOMACY.respectCap) r.relations += def.respect * dt;
  }
  r.relations = clamp(r.relations, -100, 100);

  if (inGrace(c)) return;
  const esc = escalation(c);

  // A raid already on its way lands whatever has been signed since, unless a treaty holds.
  if (r.muster > 0) {
    if (underTreaty(r)) { r.muster = 0; return; }
    r.muster = tick(r.muster, dt);
    if (r.muster === 0) resolveRaid(city, c, r, def, diff);
    return;
  }
  if (underTreaty(r)) return;
  const hostile = r.relations < RAID.holdRelations;

  r.raidIn -= dt;
  if (r.raidIn <= 0) {
    const every = def.raidEvery * diff.tempo / (1 + 0.5 * esc);
    r.raidIn = every * (0.8 + 0.4 * rnd(c));
    if (r.feud > 0 && r.feudWith && c.rivals[r.feudWith].status === 'active') {
      feudClash(c, r, c.rivals[r.feudWith]);
    } else if (hostile && r.resolve >= RAID.holdResolve) {
      const odds = raidPower(r) / (homeDefence(city, c) * POSTURES[c.posture].show * (1 + RAID.misjudge * (2 * rnd(c) - 1)));
      const wants = def.caution * diff.caution / (1 + 0.25 * esc);
      if (odds >= wants) {
        r.muster = RAID.warning;
        r.musterPower = raidPower(r) * (0.9 + 0.2 * rnd(c));
        emit(c, `${def.name} is massing a raid. It will arrive in ${RAID.warning} seconds.`, 'warn');
      } else {
        // Deterred: it waits, and thinks a little better of you for it.
        r.raidIn *= 0.5;
        r.hackIn -= 40;
        r.relations += 2;
      }
    }
  }

  r.hackIn -= dt;
  if (r.hackIn <= 0) {
    r.hackIn = def.hackEvery * diff.tempo / (1 + 0.25 * esc) * (0.8 + 0.4 * rnd(c));
    if (hostile && r.feud === 0) enemyHack(city, c, r, def);
  }
}

// ---------- Raids on the city ----------

function pickTargets(city: CityState, c: ConflictState, def: RivalDef, n: number): number[] {
  const pool: { i: number; rank: number }[] = [];
  city.districts.forEach((d, i) => {
    if (!d || d.standing === 0 || d.damage >= 1) return;
    const pref = def.targets.indexOf(d.intent);
    pool.push({ i, rank: (pref < 0 ? def.targets.length + 1 : pref) + rnd(c) });
  });
  pool.sort((a, b) => a.rank - b.rank);
  return pool.slice(0, n).map(t => t.i);
}

function resolveRaid(city: CityState, c: ConflictState, r: Rival, def: RivalDef, diff: DifficultyDef): void {
  const p = POSTURES[c.posture];
  const defence = homeDefence(city, c);
  const odds = r.musterPower / defence;
  const sent = Math.min(r.strength, r.musterPower);
  r.musterPower = 0;
  c.stats.raids++;
  if (p.strike > 0 && p.strikeEvery === 0) { c.retaliate = r.id; c.strikeIn = STRIKE.retaliateAfter; }

  if (odds < RAID.repelBelow) {
    c.stats.repelled++;
    r.strength -= sent * RAID.repelLoss;
    r.resolve -= RAID.repelResolve;
    c.fleet *= 1 - RAID.fleetLossRepel * p.home;
    emit(c, `Raid from ${def.name} thrown back. Your defences held.`, 'good');
    return;
  }
  const protectedSite = c.objective.kind === 'protect' ? c.objective.site : -1;
  const shield = (i: number) => (i === protectedSite ? RAID.protect : protectedSite >= 0 && neighbours(protectedSite).includes(i) ? RAID.protectNear : 1);
  if (odds <= RAID.breachAbove) {
    r.strength -= sent * (RAID.repelLoss + RAID.breachLoss) / 2;
    c.fleet *= 1 - RAID.fleetLossRepel * p.home;
    c.strain += STRAIN.glance;
    const [i] = pickTargets(city, c, def, 1);
    const dealt = i === undefined ? 0 : damageDistrict(city, i, RAID.glanceDamage * shield(i));
    emit(c, dealt > 0
      ? `Raid from ${def.name} driven off, but ${INTENTS[city.districts[i]!.intent].name.toLowerCase()} took light damage.`
      : `Raid from ${def.name} driven off at the city's edge.`, 'warn');
    return;
  }

  // Breach.
  const breach = clamp((odds - 1) / RAID.breachSpan, 0.1, 1);
  c.stats.breaches++;
  r.strength -= sent * RAID.breachLoss;
  r.resolve = Math.min(RESOLVE.start, r.resolve + 2);
  c.fleet *= 1 - RAID.fleetLossBreach * breach * p.home;
  const hit = pickTargets(city, c, def, 1 + Math.round(breach * RAID.extraTargets));
  const names = new Set<string>();
  for (const i of hit) {
    if (damageDistrict(city, i, (RAID.damageBase + RAID.damageSpan * breach) * shield(i)) > 0) names.add(INTENTS[city.districts[i]!.intent].name.toLowerCase());
  }
  const taken = Math.min(RAID.lootCap, city.res[def.loot] * (RAID.lootBase + RAID.lootSpan * breach));
  city.res[def.loot] -= taken;
  c.stats.lootLost += taken;
  c.nexus -= diff.nexusHit * breach;
  c.sinceBreach = 0;
  c.strain += STRAIN.breach * breach;
  const what = names.size ? `Damage to ${[...names].join(', ')}.` : 'No district was standing in its path.';
  emit(c, `${def.name} broke through. ${what}${taken >= 1 ? ` Raiders took ${Math.round(taken)} ${def.loot}.` : ''} Nexus at ${Math.max(0, Math.round(c.nexus))}%.`, 'warn');
  checkOver(c);
}

function feudClash(c: ConflictState, a: Rival, b: Rival): void {
  const power = raidPower(a), wall = rivalDefence(b);
  if (power > wall * 0.6) {
    a.strength *= 1 - DIPLOMACY.feudLoss;
    b.strength *= 1 - DIPLOMACY.feudDefenderLoss;
    b.economy *= 1 - DIPLOMACY.feudEconomy;
    emit(c, `${RIVALS[a.id].name} struck ${RIVALS[b.id].name}. Both are weaker for it.`);
  } else {
    a.strength *= 1 - DIPLOMACY.feudLoss * 1.5;
    emit(c, `${RIVALS[a.id].name} attacked ${RIVALS[b.id].name} and was beaten back.`);
  }
  a.resolve -= DIPLOMACY.feudResolve; b.resolve -= DIPLOMACY.feudResolve;
}

function enemyHack(city: CityState, c: ConflictState, r: Rival, def: RivalDef): void {
  const kind = def.hacks[Math.floor(rnd(c) * def.hacks.length)];
  const chance = HACK.enemyBase * (c.firewall > 0 ? HACK.firewallMult : 1) * (1 - Math.min(HACK.enemyResearchMax, researchCount(city) * HACK.enemyResearch));
  if (rnd(c) >= chance) {
    c.stats.hacksBlocked++;
    emit(c, c.firewall > 0 ? `Your firewall turned back an intrusion from ${def.name}.` : `An intrusion from ${def.name} was caught and shut out.`, 'good');
    return;
  }
  c.stats.hacksSuffered++;
  c.strain += HACK.strain;
  if (kind === 'siphon') {
    const credits = Math.min(HACK.siphonCap, city.res.credits * HACK.siphonCredits);
    const data = city.res.data * HACK.siphonData;
    city.res.credits -= credits; city.res.data -= data;
    c.stats.lootLost += credits;
    emit(c, `${def.name} hacked the treasury and drained ${Math.round(credits)} credits${data >= 1 ? ` and ${Math.round(data)} data` : ''}.`, 'warn');
  } else if (kind === 'blind') {
    c.blind = HACK.enemyBlindTime;
    r.raidIn = Math.min(r.raidIn, 15);
    emit(c, `${def.name} has blinded your defence grid. Expect a raid while it is down.`, 'warn');
  } else {
    const plants: number[] = [];
    city.districts.forEach((d, i) => { if (d && d.intent === 'power' && d.standing > 0) plants.push(i); });
    let n = 0;
    for (let k = 0; k < HACK.gridTargets && plants.length; k++) {
      const [i] = plants.splice(Math.floor(rnd(c) * plants.length), 1);
      if (damageDistrict(city, i, HACK.gridDamage) > 0) n++;
    }
    emit(c, n ? `${def.name} sabotaged the grid. ${n} power ${n === 1 ? 'district is' : 'districts are'} damaged.` : `${def.name} probed the grid and found nothing to break.`, n ? 'warn' : 'info');
  }
}

// ---------- The player's strikes ----------

function pickStrikeTarget(c: ConflictState): Rival | null {
  const o = c.objective;
  if (o.kind !== 'none' && o.kind !== 'protect') {
    const r = c.rivals[o.rival];
    return r.status === 'active' && !underTreaty(r) ? r : null;
  }
  // No named target: go for the weakest rival that is actually hostile.
  let best: Rival | null = null;
  for (const id of RIVAL_ORDER) {
    const r = c.rivals[id];
    if (r.status !== 'active' || underTreaty(r) || r.relations >= RAID.holdRelations) continue;
    if (!best || rivalDefence(r) < rivalDefence(best)) best = r;
  }
  return best;
}

function strike(c: ConflictState, r: Rival, retaliation: boolean): void {
  const p = POSTURES[c.posture], def = RIVALS[r.id];
  const sent = c.fleet * p.strike;
  if (sent < 1) return;
  const wall = Math.max(1, rivalDefence(r));
  // The AI does not throw ships away: it holds when the expected odds are poor.
  if (sent / wall < p.minOdds * 0.9) return;
  const odds = sent * (0.9 + 0.2 * rnd(c)) / wall;
  c.stats.strikes++;
  r.relations = Math.max(-100, r.relations - STRIKE.relations);
  if (odds < 1) {
    c.fleet -= sent * STRIKE.failLoss;
    r.strength *= 1 - STRIKE.failEnemyLoss;
    c.strain += STRIKE.strain;
    emit(c, `Your strike on ${def.name} was beaten back.`, 'warn');
    return;
  }
  c.stats.strikesWon++;
  const m = Math.min(2, odds);
  c.fleet -= sent * STRIKE.winLoss / m;
  r.resolve -= STRIKE.resolve * m;
  const kind = c.objective.kind !== 'none' && c.objective.kind !== 'protect' && c.objective.rival === r.id ? c.objective.kind : 'plain';
  let did: string;
  if (kind === 'breakIndustry') {
    r.economy *= 1 - STRIKE.industry * m;
    did = 'Its foundries are burning.';
  } else if (kind === 'cutPower') {
    r.brownout += STRIKE.power * m;
    r.resolve -= STRIKE.powerResolve * m;
    did = 'Its grid is down.';
  } else if (kind === 'breakForces') {
    r.strength *= 1 - STRIKE.forces * m;
    did = 'Its garrison is badly mauled.';
  } else {
    r.economy *= 1 - STRIKE.plainEconomy * m;
    r.strength *= 1 - STRIKE.plainForces * m;
    did = 'It lost ships and stores.';
  }
  emit(c, `${retaliation ? 'Your fleet struck back at' : 'Your fleet struck'} ${def.name}. ${did}`, 'good');
}

// ---------- Commands: each returns null, or a short reason it was refused ----------

export function setPosture(c: ConflictState, posture: Posture): string | null {
  if (c.over) return 'The conflict is over';
  if (!POSTURES[posture]) return 'Unknown posture';
  if (c.posture === posture) return null;
  c.posture = posture;
  c.strikeIn = Math.max(c.strikeIn, 10); // orders take a moment to reach the fleet
  emit(c, `Doctrine set: ${POSTURES[posture].name.toLowerCase()}.`);
  return null;
}

export function setObjective(city: CityState, c: ConflictState, objective: Objective): string | null {
  if (c.over) return 'The conflict is over';
  if (objective.kind === 'none') { c.objective = { kind: 'none' }; return null; }
  if (objective.kind === 'protect') {
    const i = objective.site;
    if (i === CENTRE) return 'The Nexus is always defended';
    if (!city.districts[i]) return 'There is no district there to protect';
    c.objective = { kind: 'protect', site: i };
    return null;
  }
  const r = c.rivals[objective.rival];
  if (!r) return 'Unknown rival';
  if (r.status !== 'active') return `${RIVALS[r.id].name} is no longer a threat`;
  if (r.truce > 0) return `You have a truce with ${RIVALS[r.id].name}`;
  if (r.trade > 0) return `You have a trade deal with ${RIVALS[r.id].name}`;
  c.objective = { kind: objective.kind, rival: objective.rival };
  return null;
}

/** Order more fleet strength. It is paid for now and delivered over time. */
export function commissionFleet(city: CityState, c: ConflictState, points: number): string | null {
  if (c.over) return 'The conflict is over';
  if (!(points > 0)) return 'Order at least one ship';
  if (c.fleet + c.fleetOrdered + points > fleetCap(city) + 1e-9) return `The city can run a fleet of ${fleetCap(city)} at this Architect level`;
  const credits = points * FLEET.credits, alloy = points * FLEET.alloy;
  if (city.res.credits < credits || city.res.alloy < alloy) return 'Not enough resources';
  city.res.credits -= credits; city.res.alloy -= alloy;
  c.fleetOrdered += points;
  return null;
}

/** Retire part of the fleet to save upkeep. Nothing is refunded. */
export function standDownFleet(c: ConflictState, points: number): string | null {
  if (c.over) return 'The conflict is over';
  if (!(points > 0)) return 'Nothing to stand down';
  if (c.fleet <= 0) return 'There is no fleet to stand down';
  c.fleet = Math.max(0, c.fleet - points);
  return null;
}

/** Chance that one of your operations against this rival works. */
export function opChance(city: CityState, rivalId: RivalId): number {
  return clamp(HACK.base - RIVALS[rivalId].security + Math.min(HACK.researchBonusMax, researchCount(city) * HACK.researchBonus), 0.05, 0.95);
}

/** Hacking and sabotage. `firewall` protects your own city and needs no rival. */
export function launchOperation(city: CityState, c: ConflictState, op: Op, rivalId: RivalId | null = null): string | null {
  if (c.over) return 'The conflict is over';
  const o = OPS[op];
  if (!o) return 'Unknown operation';
  if (op === 'firewall') {
    if (c.firewall > HACK.firewallTime / 2) return 'The firewall is already up';
    if (city.res.data < o.data) return `Needs ${o.data} data`;
    city.res.data -= o.data;
    c.firewall = HACK.firewallTime;
    emit(c, 'Firewall raised. Intrusions will find it much harder to get in.', 'good');
    return null;
  }
  const r = rivalId ? c.rivals[rivalId] : undefined;
  if (!r) return 'Choose a rival to target';
  const def = RIVALS[r.id];
  if (r.status !== 'active') return `${def.name} is no longer a threat`;
  if (inGrace(c)) return 'The cities are still at peace. No one has made a move yet';
  if (r.truce > 0) return `You have a truce with ${def.name}`;
  if (r.opCooldown > 0) return `Your operators need ${Math.ceil(r.opCooldown)} more seconds before the next operation`;
  if (city.res.data < o.data) return `Needs ${o.data} data`;
  city.res.data -= o.data;
  r.opCooldown = HACK.cooldown;

  if (rnd(c) >= opChance(city, r.id)) {
    r.relations = Math.max(-100, r.relations - HACK.relations);
    emit(c, `${o.name} against ${def.name} failed and was traced back to you.`, 'warn');
    return null;
  }
  const eco = effectiveEconomy(r);
  if (op === 'brownout') {
    r.brownout = Math.max(r.brownout, HACK.brownoutTime);
    r.resolve -= HACK.brownoutResolve;
    emit(c, `${def.name} has gone dark. Its economy is running at half.`, 'good');
  } else if (op === 'steal') {
    const credits = eco * HACK.stealCredits, alloy = eco * HACK.stealAlloy;
    city.res.credits += credits; city.res.alloy += alloy;
    r.economy *= 1 - HACK.stealEconomy;
    emit(c, `Siphoned ${Math.round(credits)} credits and ${Math.round(alloy)} alloy from ${def.name}.`, 'good');
  } else if (op === 'blind') {
    r.blind = HACK.blindTime;
    emit(c, `${def.name} is blind. Its defences and raids are weaker for now.`, 'good');
  } else {
    r.economy *= 1 - HACK.sabotageEconomy;
    r.strength *= 1 - HACK.sabotageStrength;
    r.resolve -= HACK.sabotageResolve;
    emit(c, `Sabotage in ${def.name}. Foundries are wrecked and will not be rebuilt soon.`, 'good');
  }
  if (rnd(c) < HACK.detect) {
    r.relations = Math.max(-100, r.relations - HACK.relations);
    if (r.trade > 0) { r.trade = 0; emit(c, `${def.name} traced the attack to you and tore up the trade deal.`, 'warn'); }
  }
  return null;
}

/** What Meridian Exchange would cost to buy outright, right now. */
export function buyoutPrice(c: ConflictState, rivalId: RivalId): number {
  const r = c.rivals[rivalId];
  return Math.round(r.economy * DIPLOMACY.buyoutPerEconomy * (DIPLOMACY.buyoutFloor + (1 - DIPLOMACY.buyoutFloor) * r.resolve / RESOLVE.start) / 10) * 10;
}

/** Diplomacy. A refusal by the rival is returned as the reason, in plain words. */
export function propose(city: CityState, c: ConflictState, rivalId: RivalId, offer: Offer): string | null {
  if (c.over) return 'The conflict is over';
  const r = c.rivals[rivalId];
  if (!r) return 'Unknown rival';
  const def = RIVALS[r.id];
  if (r.status !== 'active') return `${def.name} is no longer a rival`;
  const mine = totalStrength(city, c);

  switch (offer.kind) {
    case 'truce': {
      if (r.truce > 0) return `You already have a truce with ${def.name}`;
      if (r.truceCooldown > 0) return `${def.name} will not talk about another truce yet`;
      const willing = r.relations >= DIPLOMACY.truceRelations || r.resolve < DIPLOMACY.truceResolve || mine >= r.strength * DIPLOMACY.truceStrength;
      if (!willing) return `${def.name} sees no reason to stop. Improve relations, or show more strength`;
      r.truce = DIPLOMACY.truceTime;
      r.truceCooldown = DIPLOMACY.truceTime + DIPLOMACY.truceCooldown;
      r.muster = 0;
      if (c.objective.kind !== 'none' && c.objective.kind !== 'protect' && c.objective.rival === r.id) c.objective = { kind: 'none' };
      emit(c, `Truce signed with ${def.name} for ${Math.round(DIPLOMACY.truceTime / 60)} minutes.`, 'good');
      return null;
    }
    case 'tribute': {
      const credits = Math.floor(offer.credits);
      if (!(credits > 0)) return 'Offer some credits';
      if (r.tributeCooldown > 0) return `${def.name} is still weighing your last gift`;
      if (city.res.credits < credits) return 'Not enough credits';
      if (mine < r.strength * DIPLOMACY.tributeMinStrength && def.greed < 1) return `${def.name} respects strength, not gifts. Build up your forces first`;
      city.res.credits -= credits;
      const gain = Math.min(DIPLOMACY.tributeMaxGain, credits / DIPLOMACY.tributePerPoint * def.greed);
      r.relations = Math.min(100, r.relations + gain);
      r.tributeCooldown = DIPLOMACY.tributeCooldown;
      emit(c, `${def.name} accepted ${credits} credits. Relations improved.`, 'good');
      return null;
    }
    case 'trade': {
      if (r.trade > DIPLOMACY.tradeTime / 2) return `You already trade with ${def.name}`;
      if (r.relations < def.tradeAt) return `${def.name} does not trust you enough to trade. Improve relations first`;
      r.trade = DIPLOMACY.tradeTime;
      r.muster = 0;
      if (c.objective.kind !== 'none' && c.objective.kind !== 'protect' && c.objective.rival === r.id) c.objective = { kind: 'none' };
      emit(c, `Trade deal signed with ${def.name}. Credits will flow both ways for ${Math.round(DIPLOMACY.tradeTime / 60)} minutes.`, 'good');
      return null;
    }
    case 'incite': {
      const otherId = offer.against ?? RIVAL_ORDER.find(id => id !== r.id && c.rivals[id].status === 'active');
      const other = otherId ? c.rivals[otherId] : undefined;
      if (!other || other.id === r.id || other.status !== 'active') return 'There is no other rival to turn them against';
      if (inGrace(c)) return 'The cities are still at peace. No one would believe it yet';
      if (r.feud > 0) return `${def.name} is already fighting ${RIVALS[other.id].name}`;
      if (city.res.data < DIPLOMACY.inciteData) return `Needs ${DIPLOMACY.inciteData} data`;
      if (city.res.credits < DIPLOMACY.inciteCredits) return `Needs ${DIPLOMACY.inciteCredits} credits`;
      city.res.data -= DIPLOMACY.inciteData; city.res.credits -= DIPLOMACY.inciteCredits;
      const chance = clamp(DIPLOMACY.inciteBase + r.relations / 200 - r.incited * DIPLOMACY.inciteRepeat, 0.05, 0.9);
      r.incited++;
      if (rnd(c) >= chance) {
        r.relations = Math.max(-100, r.relations - DIPLOMACY.inciteFail);
        other.relations = Math.max(-100, other.relations - DIPLOMACY.inciteFail / 2);
        emit(c, `${def.name} saw through the forged evidence. Both rivals trust you less.`, 'warn');
        return null;
      }
      r.feud = other.feud = DIPLOMACY.inciteTime;
      r.feudWith = other.id; other.feudWith = r.id;
      r.muster = 0; other.muster = 0;
      r.raidIn = Math.min(r.raidIn, 30);
      emit(c, `${def.name} and ${RIVALS[other.id].name} have turned on each other. They will leave you alone while it lasts.`, 'good');
      return null;
    }
    case 'pact': {
      if (r.id !== 'karst') return `${def.ai} signs contracts, not alliances. Offer to buy it out instead`;
      if (r.relations < DIPLOMACY.pactRelations) return `${def.name} does not trust you enough for an alliance`;
      if (mine < r.strength) return `${def.name} only allies with its equals. Build up your forces`;
      neutralise(c, r, 'allied', `${def.name} has signed an alliance. ${def.ai} calls you an equal.`);
      return null;
    }
    case 'buyout': {
      if (r.id !== 'meridian') return `${def.name} is not for sale`;
      if (r.relations < DIPLOMACY.buyoutRelations) return `${def.ai} will not sell to someone it does not trust. Improve relations first`;
      const price = buyoutPrice(c, r.id);
      if (city.res.credits < price) return `The price is ${price} credits`;
      city.res.credits -= price;
      neutralise(c, r, 'absorbed', `${def.name} has been bought out for ${price} credits. Its towers now answer to your Architect.`);
      return null;
    }
    case 'demand': {
      if (inGrace(c)) return 'The cities are still at peace';
      if (r.resolve > DIPLOMACY.demandResolve || mine < r.strength * DIPLOMACY.demandStrength) {
        r.relations = Math.max(-100, r.relations - DIPLOMACY.demandRefused);
        return r.resolve > DIPLOMACY.demandResolve ? `${def.name} is not ready to give in. Wear down its resolve first` : `${def.name} will not yield to a weaker city`;
      }
      neutralise(c, r, 'yielded', `${def.name} has yielded to your demand. ${def.ai} will pay tribute.`);
      return null;
    }
  }
}

// ---------- Read-only summary for the HUD ----------

export type ThreatLevel = 'none' | 'low' | 'high' | 'severe';
export interface RivalSummary {
  id: RivalId;
  name: string;
  ai: string;
  status: RivalStatus;
  stance: Stance;
  relations: number;
  strength: number;
  economy: number;
  resolve: number;
  /** How its raid would fare against the city today. */
  threat: ThreatLevel;
  /** Seconds until a massed raid lands, or null. */
  raidIn: number | null;
  truceLeft: number;
  tradeLeft: number;
  blinded: boolean;
  browned: boolean;
  /** Odds a strike under the current posture would have (1 is even); 0 with no strike force. */
  strikeOdds: number;
  opChance: number;
  buyoutPrice: number | null;
}
export interface ThreatSummary {
  phase: 'grace' | 'war' | 'over';
  graceLeft: number;
  /** The single most pressing thing, as a sentence. */
  headline: string;
  nexus: number;
  posture: Posture;
  objective: Objective;
  defence: number;
  fleet: number;
  fleetOrdered: number;
  fleetCap: number;
  upkeep: number;
  blinded: boolean;
  firewall: number;
  effects: { morale: number; unrest: number };
  rivals: RivalSummary[];
  over: null | 'win' | 'lose';
  reason: string;
}

export function threatSummary(city: CityState, c: ConflictState): ThreatSummary {
  const defence = homeDefence(city, c);
  const rivals: RivalSummary[] = RIVAL_ORDER.map(id => {
    const r = c.rivals[id], def = RIVALS[id];
    const odds = raidPower(r) / defence;
    const active = r.status === 'active';
    const threat: ThreatLevel = !active || underTreaty(r) || inGrace(c) || r.relations >= RAID.holdRelations ? 'none'
      : odds < RAID.repelBelow ? 'low' : odds <= RAID.breachAbove + 0.5 ? 'high' : 'severe';
    return {
      id, name: def.name, ai: def.ai, status: r.status, stance: stanceOf(c, r),
      relations: Math.round(r.relations), strength: Math.round(r.strength), economy: Math.round(r.economy), resolve: Math.round(r.resolve),
      threat, raidIn: active && r.muster > 0 ? Math.ceil(r.muster) : null,
      truceLeft: Math.ceil(r.truce), tradeLeft: Math.ceil(r.trade), blinded: r.blind > 0, browned: r.brownout > 0,
      strikeOdds: active ? strikePower(c) / Math.max(1, rivalDefence(r)) : 0,
      opChance: opChance(city, id), buyoutPrice: id === 'meridian' && active ? buyoutPrice(c, id) : null,
    };
  });
  const grace = DIFFICULTIES[c.difficulty].grace;
  const incoming = rivals.filter(r => r.raidIn !== null).sort((a, b) => a.raidIn! - b.raidIn!)[0];
  const worst = rivals.find(r => r.threat === 'severe') ?? rivals.find(r => r.threat === 'high');
  let headline: string;
  if (c.over) headline = c.reason;
  else if (incoming) headline = `${incoming.name} raid arrives in ${incoming.raidIn} seconds.`;
  else if (c.nexus < 35) headline = `The Nexus is at ${Math.round(c.nexus)}%. One or two more breaches will break the city.`;
  else if (c.unpaid) headline = 'The fleet is not being paid and is shrinking.';
  else if (inGrace(c)) headline = `The rival cities are quiet for about ${Math.max(1, Math.round((grace - c.time) / 60))} more minutes. Use the time to prepare.`;
  else if (c.blind > 0) headline = 'Your defence grid is blinded. The city is easier to raid until it recovers.';
  else if (worst) headline = worst.threat === 'severe' ? `${worst.name} could break through your defences. Raise more defence or fleet.` : `${worst.name} is strong enough to test your defences.`;
  else if (rivals.some(r => r.status === 'active')) headline = 'Your defences can hold what the rivals can send today.';
  else headline = 'No rival threatens the city.';
  return {
    phase: c.over ? 'over' : inGrace(c) ? 'grace' : 'war', graceLeft: Math.max(0, Math.ceil(grace - c.time)), headline,
    nexus: Math.round(c.nexus), posture: c.posture, objective: c.objective, defence: Math.round(defence),
    fleet: Math.round(c.fleet), fleetOrdered: Math.round(c.fleetOrdered), fleetCap: fleetCap(city), upkeep: fleetUpkeep(c),
    blinded: c.blind > 0, firewall: Math.ceil(c.firewall), effects: { ...c.effects }, rivals, over: c.over, reason: c.reason,
  };
}
