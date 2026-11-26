// Static game data: buildings, units, research, tiers.

export type Faction = 0 | 1; // 0 = player, 1 = rival corporation
export type BKey =
  | 'core' | 'hab' | 'solar' | 'farm' | 'foundry' | 'market'
  | 'vault' | 'plaza' | 'fusion' | 'hub' | 'turret';
export type UKey = 'enforcer' | 'drone' | 'mech';
export type ResKey = 'credits' | 'alloy' | 'food' | 'data';
export type Res = Record<ResKey, number>;
export type Cost = Partial<Res>;

export const PLAYER_NAME = 'Your Arcology';
export const RIVAL_NAME = 'Vanta Collective';

/** City tiers, the equivalent of ages. Index 0 is tier 1. */
export const TIERS = ['Block', 'District', 'Sector', 'Megacity'];

export interface TierUp { cost: Cost; time: number }
/** TIER_UPS[t] is the upgrade from tier t+1 to tier t+2. */
export const TIER_UPS: TierUp[] = [
  { cost: { credits: 400, alloy: 300 }, time: 30 },
  { cost: { credits: 900, alloy: 700, data: 100 }, time: 45 },
  { cost: { credits: 1800, alloy: 1500, data: 400 }, time: 60 },
];

export interface BDef {
  name: string;
  desc: string;
  size: number;
  cost: Cost;
  time: number;
  hp: number;
  /** Positive = generates, negative = draws. Solar is handled by daylight. */
  power: number;
  workers: number;
  out?: Cost;
  housing?: number;
  tier: number;
  attack?: { dmg: number; range: number; cd: number };
  /** Staffing priority, lower fills first. */
  prio: number;
}

export const BUILDINGS: Record<BKey, BDef> = {
  core: {
    name: 'Nexus Spire', desc: 'Heart of the arcology. Lose it and the city falls.',
    size: 3, cost: {}, time: 0, hp: 3000, power: 12, workers: 0,
    out: { credits: 1, alloy: 0.4 }, housing: 8, tier: 1, attack: { dmg: 16, range: 5.5, cd: 0.7 }, prio: 0,
  },
  hab: {
    name: 'Hab Stack', desc: 'Stacked housing pods. Raises the citizen cap.',
    size: 2, cost: { credits: 80, alloy: 50 }, time: 10, hp: 500, power: -2, workers: 0,
    housing: 8, tier: 1, prio: 0,
  },
  solar: {
    name: 'Solar Canopy', desc: 'Cheap power by day, a trickle at night.',
    size: 2, cost: { credits: 60, alloy: 40 }, time: 8, hp: 300, power: 8, workers: 0,
    tier: 1, prio: 0,
  },
  farm: {
    name: 'Vat Farm', desc: 'Grows protein in vats. Citizens and troops eat.',
    size: 2, cost: { credits: 70, alloy: 30 }, time: 10, hp: 400, power: -3, workers: 3,
    out: { food: 1.5 }, tier: 1, prio: 1,
  },
  foundry: {
    name: 'Scrap Foundry', desc: 'Smelts the old city into alloy.',
    size: 2, cost: { credits: 90, alloy: 20 }, time: 12, hp: 500, power: -4, workers: 4,
    out: { alloy: 1.4 }, tier: 1, prio: 3,
  },
  market: {
    name: 'Trade Exchange', desc: 'Brokers deals for credits.',
    size: 2, cost: { credits: 60, alloy: 60 }, time: 12, hp: 400, power: -3, workers: 3,
    out: { credits: 1.8 }, tier: 1, prio: 4,
  },
  vault: {
    name: 'Data Vault', desc: 'Mines data. Unlocks research.',
    size: 2, cost: { credits: 150, alloy: 120 }, time: 18, hp: 450, power: -6, workers: 3,
    out: { data: 0.6 }, tier: 2, prio: 5,
  },
  plaza: {
    name: 'Holo Plaza', desc: 'Entertainment district. Lifts morale.',
    size: 2, cost: { credits: 180, alloy: 100 }, time: 18, hp: 350, power: -4, workers: 0,
    tier: 2, prio: 0,
  },
  fusion: {
    name: 'Fusion Cell', desc: 'Steady power around the clock. Needs a crew.',
    size: 2, cost: { credits: 300, alloy: 250 }, time: 25, hp: 600, power: 30, workers: 2,
    tier: 2, prio: 2,
  },
  hub: {
    name: 'Security Hub', desc: 'Trains squads and raises the army cap.',
    size: 2, cost: { credits: 120, alloy: 100 }, time: 15, hp: 700, power: -3, workers: 0,
    tier: 1, prio: 0,
  },
  turret: {
    name: 'Sentry Turret', desc: 'Automated defence. Slows down in a brownout.',
    size: 1, cost: { credits: 90, alloy: 80 }, time: 10, hp: 600, power: -2, workers: 0,
    tier: 1, attack: { dmg: 15, range: 5.5, cd: 0.8 }, prio: 0,
  },
};

export const BUILD_ORDER: BKey[] = [
  'hab', 'solar', 'farm', 'foundry', 'market', 'hub', 'turret', 'vault', 'plaza', 'fusion',
];

export interface UDef {
  name: string;
  desc: string;
  hp: number;
  dmg: number;
  range: number;
  cd: number;
  speed: number;
  cost: Cost;
  time: number;
  tier: number;
  supply: number;
}

export const UNITS: Record<UKey, UDef> = {
  enforcer: {
    name: 'Enforcer', desc: 'Armoured infantry. Cheap and tough.',
    hp: 90, dmg: 8, range: 1.3, cd: 0.7, speed: 2.3,
    cost: { credits: 40, alloy: 10 }, time: 8, tier: 1, supply: 1,
  },
  drone: {
    name: 'Striker Drone', desc: 'Fast, long range, fragile.',
    hp: 55, dmg: 10, range: 4.2, cd: 0.9, speed: 3.3,
    cost: { credits: 60, alloy: 35 }, time: 10, tier: 2, supply: 1,
  },
  mech: {
    name: 'Titan Mech', desc: 'Walking siege platform.',
    hp: 340, dmg: 30, range: 2.6, cd: 1.1, speed: 1.6,
    cost: { credits: 150, alloy: 130 }, time: 20, tier: 3, supply: 3,
  },
};
export const UNIT_ORDER: UKey[] = ['enforcer', 'drone', 'mech'];

export type TechKey = 'grid' | 'hydro' | 'auto' | 'armor' | 'targeting';
export interface TechDef { name: string; desc: string; data: number; time: number }
export const TECHS: Record<TechKey, TechDef> = {
  grid: { name: 'Smart Grid', desc: '+25% power generation', data: 60, time: 30 },
  hydro: { name: 'Vertical Vats', desc: '+30% food output', data: 60, time: 30 },
  auto: { name: 'Automation', desc: '+20% credits, alloy and data output', data: 120, time: 40 },
  armor: { name: 'Composite Armour', desc: '+25% squad health', data: 100, time: 40 },
  targeting: { name: 'Smart Targeting', desc: '+25% squad and turret damage', data: 150, time: 45 },
};
export const TECH_ORDER: TechKey[] = ['grid', 'hydro', 'auto', 'armor', 'targeting'];

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFF: Record<Difficulty, { firstWave: number; interval: number; spawn: number; power: number }> = {
  easy: { firstWave: 270, interval: 135, spawn: 0.7, power: 0.85 },
  normal: { firstWave: 210, interval: 120, spawn: 1, power: 1 },
  hard: { firstWave: 140, interval: 85, spawn: 1.4, power: 1.15 },
};

export const MAX_LEVEL = 4;
export const DAY_LENGTH = 180;
export const DAYLIGHT = 115; // seconds of the cycle that count as day

export const lvlMult = (level: number) => 1 + 0.6 * (level - 1);
