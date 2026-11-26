// One entry point for the whole simulation: the city model, then governance, then conflict.
import { CityState, DT, createCity, step, emit } from './model';
import { stepGovernance } from './governance';
import { Difficulty, createConflict, stepConflict, threatSummary, commissionFleet, fleetCap, FLEET } from './conflict';

/** `peace` is a sandbox with no rival cities. */
export type Mode = Difficulty | 'peace';

export function newGame(seed: number, mode: Mode = 'normal'): CityState {
  const s = createCity(seed);
  s.war = mode === 'peace' ? null : createConflict(seed, mode);
  return s;
}

/** True once the city has fallen. A won war does not stop the city; you keep building. */
export const isLost = (s: CityState) => s.war?.over === 'lose';

export function tick(s: CityState, dt: number = DT): void {
  if (isLost(s)) return;
  step(s, dt);
  stepGovernance(s, dt);
  const war = s.war;
  if (!war) return;
  stepConflict(s, war, dt);
  for (const e of war.events.splice(0)) emit(s, e.msg, e.kind);

  // A Delegated or Sovereign Architect also looks after the fleet: it fights, you set doctrine.
  if (s.gov.autonomy >= 2 && !war.over && Math.floor(s.time / 5) !== Math.floor((s.time - dt) / 5)) {
    const t = threatSummary(s, war);
    const pressed = t.rivals.some(r => r.threat === 'high' || r.threat === 'severe');
    const room = fleetCap(s) - war.fleet - war.fleetOrdered;
    const batch = 10;
    if (pressed && room >= batch && s.res.credits > FLEET.credits * batch * 2 && s.res.alloy > FLEET.alloy * batch * 2) {
      if (!commissionFleet(s, war, batch)) emit(s, 'The Architect acted: commissioned more fleet', 'info');
    }
  }
}
