// The three platforms on the waterfront viaduct, in world metres along the rail.
export const QUAY_STOPS = [
  { x: -285, name: 'West Quay' }, { x: 123, name: 'Meridian Exchange' }, { x: 282, name: 'East Quay' },
] as const;

const service = [1, 0, 1, 2] as const;
const dwell = 3;
let cycle = 0;
const legs = service.map((from, i) => {
  const to = service[(i + 1) % service.length];
  const duration = Math.abs(QUAY_STOPS[to].x - QUAY_STOPS[from].x) / 15;
  const start = cycle;
  cycle += dwell + duration;
  return { from, to, start, duration };
});

export function quayJourney(seconds: number) {
  const time = seconds % cycle;
  const leg = legs.find(({ start, duration }) => time < start + dwell + duration) ?? legs[0];
  const elapsed = time - leg.start;
  const travel = Math.max(0, (elapsed - dwell) / leg.duration);
  const progress = travel * travel * (3 - 2 * travel);
  const departure = QUAY_STOPS[leg.from], arrival = QUAY_STOPS[leg.to];
  return {
    x: departure.x + (arrival.x - departure.x) * progress,
    speed: 4 * travel * (1 - travel),
    from: leg.from, to: leg.to, stopped: elapsed < dwell, direction: Math.sign(arrival.x - departure.x),
    nextArrival: seconds - time + leg.start + dwell + leg.duration,
  };
}
