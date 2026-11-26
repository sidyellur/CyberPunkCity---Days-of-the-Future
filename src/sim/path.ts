// Grid A* with 8-way movement and no corner cutting.
import { State, W, H, idx, inBounds, walkable } from './state';

const N = W * H;
const g = new Float32Array(N);
const f = new Float32Array(N);
const from = new Int32Array(N);
const stamp = new Int32Array(N);
const closed = new Int32Array(N);
let run = 0;
const heap: number[] = [];

function push(n: number) {
  heap.push(n);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (f[heap[p]] <= f[heap[i]]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}
function pop(): number {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
      if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Path from one tile to another as a flat [x0, y0, x1, y1, ...] list of tile-centre waypoints,
 * excluding the start tile. The goal tile may be blocked (a building being attacked); the path
 * then stops on the last free tile before it. Returns null when there is no route.
 */
export function findPath(s: State, sx: number, sy: number, gx: number, gy: number): number[] | null {
  sx = Math.floor(sx); sy = Math.floor(sy); gx = Math.floor(gx); gy = Math.floor(gy);
  if (!inBounds(sx, sy) || !inBounds(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];
  run++;
  heap.length = 0;
  const start = idx(sx, sy), goal = idx(gx, gy);
  const goalOpen = walkable(s, gx, gy);
  const open = (x: number, y: number) => walkable(s, x, y) || (x === sx && y === sy);
  g[start] = 0;
  f[start] = Math.hypot(gx - sx, gy - sy);
  from[start] = -1;
  stamp[start] = run;
  push(start);
  while (heap.length) {
    const cur = pop();
    if (closed[cur] === run) continue;
    closed[cur] = run;
    if (cur === goal) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (closed[n] === run) continue;
      const isGoal = n === goal;
      if (!open(nx, ny) && !(isGoal && !goalOpen)) continue;
      if (dx !== 0 && dy !== 0 && (!open(cx + dx, cy) || !open(cx, cy + dy))) {
        // Allow a diagonal final step into a blocked goal only when not cutting a corner.
        continue;
      }
      const cost = g[cur] + (dx !== 0 && dy !== 0 ? 1.4142 : 1);
      if (stamp[n] !== run || cost < g[n]) {
        stamp[n] = run;
        g[n] = cost;
        f[n] = cost + Math.hypot(gx - nx, gy - ny);
        from[n] = cur;
        push(n);
      }
    }
  }
  if (closed[goal] !== run) return null;
  const out: number[] = [];
  let n = goal;
  while (n !== start && n !== -1) {
    out.push((n % W) + 0.5, ((n / W) | 0) + 0.5);
    n = from[n];
  }
  // `out` is goal..start as [x, y] pairs; reverse pairwise.
  const path: number[] = [];
  for (let i = out.length - 2; i >= 0; i -= 2) path.push(out[i], out[i + 1]);
  if (!goalOpen) path.length -= 2;
  return path;
}

