// The Architect, rule-based: it reads the city's numbers and proposes the next move.
// The player approves, ignores it, or briefs something else.
import {
  CityState, Intent, Character, Cost, SIZE, CENTRE, INTENTS, MAX_LEVEL, ARCHITECT_UPS,
  briefCost, canAfford, neighbours, siteXY,
} from './model';
import { threatSummary } from './conflict';

export interface Advice {
  kind: 'brief' | 'grow' | 'upgrade' | 'wait';
  site: number;
  intent?: Intent;
  character?: Character;
  cost?: Cost;
  affordable: boolean;
  /** What the Architect wants to do, as a short imperative. */
  title: string;
  /** Why, in the Architect's voice. */
  reason: string;
}

/** Best empty site for an intent: close to the spire, and kind to its neighbours. */
export function chooseSite(s: CityState, intent: Intent): number {
  let best = -1, bestScore = -Infinity;
  const mid = (SIZE - 1) / 2;
  for (let i = 0; i < s.districts.length; i++) {
    if (i === CENTRE || s.districts[i]) continue;
    const { x, y } = siteXY(i);
    let score = -Math.hypot(x - mid, y - mid);
    for (const n of neighbours(i)) {
      const k = s.districts[n]?.intent;
      if (!k) continue;
      if (intent === 'housing') score += k === 'industry' ? -3 : k === 'park' ? 2 : k === 'commerce' ? 1 : 0;
      else if (intent === 'industry') score += k === 'housing' ? -3 : k === 'industry' || k === 'power' ? 0.5 : 0;
      else if (intent === 'commerce') score += k === 'housing' ? 2 : 0;
      else if (intent === 'park') score += k === 'housing' ? 2.5 : k === 'park' ? -1 : 0;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** The Architect spreads only so far at each level, then asks to be upgraded and builds upward. */
export const lotBudget = (s: CityState) => Math.min(SIZE * SIZE - 1, 20 * s.architect);

function proposeBrief(s: CityState, intent: Intent, reason: string, essential = false): Advice | null {
  // Keep a few lots in hand for essentials (food, power, green space, research).
  const used = s.districts.filter(d => d).length;
  if (used >= lotBudget(s) + (essential ? 4 : 0)) return null;
  const site = chooseSite(s, intent);
  if (site < 0) return null;
  // Lean green when people are unhappy, dense when they are content and the city needs output.
  const character: Character = s.morale < 45 ? 'green' : s.morale > 72 && intent !== 'housing' && intent !== 'park' ? 'efficient' : 'balanced';
  const cost = briefCost(intent, character, 1);
  return { kind: 'brief', site, intent, character, cost, affordable: canAfford(s, cost), title: `Raise ${INTENTS[intent].name.toLowerCase()}`, reason };
}

function proposeGrow(s: CityState, intent: Intent, reason: string): Advice | null {
  let site = -1, low = Infinity;
  s.districts.forEach((d, i) => {
    if (d && d.intent === intent && d.build === 0 && d.level < s.architect && d.level < MAX_LEVEL && d.level < low) { low = d.level; site = i; }
  });
  if (site < 0) return null;
  const d = s.districts[site]!;
  const cost = briefCost(d.intent, d.character, d.level + 1);
  return { kind: 'grow', site, intent, cost, affordable: canAfford(s, cost), title: `Grow ${INTENTS[intent].name.toLowerCase()} to level ${d.level + 1}`, reason };
}

/** A need is met by a new district while there is room, otherwise by growing an existing one. */
function meet(s: CityState, intent: Intent, reason: string, essential = false): Advice | null {
  const count = s.districts.filter(d => d?.intent === intent).length;
  const building = s.districts.some(d => d?.intent === intent && d.build > 0);
  if (building) return null; // already being dealt with
  // Once a couple of districts of this kind exist, build upward before spreading further.
  const growFirst = count >= 2;
  return (growFirst ? proposeGrow(s, intent, reason) : null) ?? proposeBrief(s, intent, reason, essential) ?? proposeGrow(s, intent, reason);
}

export function advise(s: CityState): Advice {
  const r = s.rates;
  const foodSeconds = r.income.food < 0 ? s.res.food / -r.income.food : Infinity;
  const upgrade = (reason: string): Advice | null => {
    if (s.architect >= MAX_LEVEL || s.archUp > 0) return null;
    const up = ARCHITECT_UPS[s.architect - 1];
    return { kind: 'upgrade', site: CENTRE, cost: up.cost, affordable: canAfford(s, up.cost), title: `Upgrade the Architect to level ${s.architect + 1}`, reason };
  };
  const used = s.districts.filter(d => d).length;
  // Defence: one district before the rivals move, more whenever a raid could get through.
  const defend = (): Advice | null => {
    const war = s.war;
    if (!war || war.over || s.architect < 2) return null;
    const have = s.districts.filter(d => d?.intent === 'defence').length;
    const t = threatSummary(s, war);
    const worst = t.rivals.find(x => x.threat === 'severe') ?? t.rivals.find(x => x.threat === 'high');
    if (worst) return meet(s, 'defence', `${worst.name} could get through our defences.`, true);
    // Keep the walls growing with the city, even while nobody is at the gate.
    if (have < s.architect + 1) return meet(s, 'defence', have ? 'Our defences should grow with the city.' : 'The rival cities will not stay quiet. We should be ready.', true);
    return null;
  };
  const checks: (() => Advice | null)[] = [
    () => (r.income.food < 0.3 || foodSeconds < 180 ? meet(s, 'farms', r.starving ? 'People are going hungry.' : 'Food stores are running down.', true) : null),
    () => (r.powerRatio < 1 ? meet(s, 'power', 'The grid is in brownout. Output is down across the city.', true) : r.powerSupply - r.powerDemand < 8 ? meet(s, 'power', 'The grid has almost no headroom.', true) : null),
    defend,
    () => (s.morale < 48 || r.moraleTarget < 48 ? meet(s, 'park', 'Morale is slipping. People need room to breathe.', true) : null),
    () => (s.architect >= 2 && s.districts.filter(d => d?.intent === 'research').length < s.architect ? proposeBrief(s, 'research', 'I need data to grow further.', true) : null),
    () => (s.citizens >= r.housing * 0.9 ? meet(s, 'housing', 'Homes are nearly full. The city cannot grow.') : null),
    () => {
      const idle = r.workers - r.employed;
      if (idle < Math.max(6, r.workers * 0.15)) return null;
      const intent: Intent = s.res.alloy < s.res.credits * 0.8 ? 'industry' : 'commerce';
      return meet(s, intent, `${idle} workers have nothing to do.`);
    },
    // Out of room at this level: the way forward is up.
    () => (used >= lotBudget(s) ? upgrade('I have used the ground I can manage at this level. Upgrade me and I will build upward.') : null),
    () => (used >= 6 * s.architect ? upgrade('I can design taller, denser districts with more capacity.') : null),
    () => proposeGrow(s, s.res.alloy < s.res.credits ? 'industry' : 'commerce', 'The city is stable. Time to build upward.'),
    () => proposeGrow(s, 'housing', 'The city is stable. Time to build upward.'),
  ];
  for (const check of checks) {
    const a = check();
    if (a) return a;
  }
  return { kind: 'wait', site: -1, affordable: false, title: 'Hold steady', reason: 'The city is balanced. I will tell you when something needs attention.' };
}
