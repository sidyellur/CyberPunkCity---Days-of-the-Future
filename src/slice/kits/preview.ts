// Kit preview (kits.html): a ring of blocks around the plaza, built with one kit, on the game's stage.
//
//   kits.html?kit=<id>          a kit by id (see index.ts); without it, the kit the game would pick
//            &intent=housing    the game look to dress it in (default housing), and the kit when ?kit is absent
//            &level=1..4  &character=efficient|balanced|green  &seed=N
//            &grow=1            cycle level 1 -> 4 on a timer, with the game's level-up animation
//            &plain=1           no kit: the plain towers, for comparison
//            &cheap=1|0         force the small-screen variant on or off (default: by screen size)
//            &view=wide|low|street|top   &spire=1   &rain=0   &glow=0
//
// The corner shows draw calls and triangles; scripts read the same from `window.__kits` (scripts/kitshots.mjs).
import * as THREE from 'three';
import {
  AMBER, CYAN, GREEN, ICE, MAGENTA, ORANGE, VIOLET, MID, Block, BlockStyle, Character, Structure,
  animateStructure, buildBlock, buildSpire, disposeBlock,
} from '../city';
import { createStage } from '../stage';
import { allKits, kitById, kitFor } from './index';
import type { DistrictKit } from './kit';
import { mats } from './core';

// A copy of LOOK and styleFor from src/city/main.ts (which cannot be imported: it boots the game).
// Preview only; if the game's table changes, this just previews slightly different proportions.
const LOOK: Record<string, BlockStyle> = {
  housing: { height: 1, park: 0.05, signs: 0.5, palette: [AMBER, MAGENTA, AMBER], windows: [0, 0, 2] },
  farms: { height: 0.7, park: 0.2, signs: 0.15, palette: [GREEN], windows: [4] },
  industry: { height: 0.55, park: 0, signs: 0.25, palette: [ORANGE, AMBER], windows: [5] },
  commerce: { height: 1.25, park: 0, signs: 1.8, palette: [MAGENTA, CYAN, VIOLET], windows: [2, 1, 3] },
  power: { height: 0.6, park: 0, signs: 0, palette: [ICE, CYAN], windows: [6], lots: 1 },
  research: { height: 1.5, park: 0, signs: 0.2, palette: [VIOLET, CYAN], windows: [3, 1], slim: 0.1 },
  park: { height: 0.3, park: 1, signs: 0, palette: [GREEN], windows: [0] },
  defence: { height: 0.5, park: 0, signs: 0, palette: [0xff5a4d, ICE], windows: [5, 1], lots: 2 },
};
const CHARACTERS: Character[] = ['efficient', 'balanced', 'green'];

interface Options { kit: DistrictKit | undefined; intent: string; character: Character; level: number; seed: number; cheap: boolean | undefined }

function styleFor(o: Options): BlockStyle {
  const base = LOOK[o.intent];
  const ch = o.character === 'efficient' ? 1.25 : o.character === 'green' ? 0.75 : 1;
  return {
    ...base,
    height: base.height * 0.45 * ch * (1 + 0.55 * (o.level - 1)),
    park: Math.min(1, base.park + (o.character === 'green' && o.intent !== 'park' ? 0.25 : 0)),
    // What the game adds to use a kit:
    kit: o.kit, level: o.level, character: o.character, cheap: o.cheap,
  };
}

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) && isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
const statsEl = document.getElementById('stats')!;
const stage = createStage(document.getElementById('scene') as HTMLCanvasElement, true);

if (stage) {
  const { scene, shared, camera, controls, renderer } = stage;
  const intent = LOOK[q.get('intent') ?? ''] ? q.get('intent')! : 'housing';
  const character = CHARACTERS.includes(q.get('character') as Character) ? (q.get('character') as Character) : 'balanced';
  const kitId = q.get('kit');
  const opts: Options = {
    intent, character,
    kit: q.get('plain') === '1' ? undefined : kitId ? kitById(kitId) : kitFor(intent, character),
    level: Math.min(4, Math.max(1, Math.round(num('level', 1)))),
    seed: num('seed', 1),
    cheap: q.has('cheap') ? q.get('cheap') === '1' : undefined,
  };
  const unknown = kitId && !kitById(kitId) ? `no kit "${kitId}" (have: ${allKits.map(k => k.id).join(', ') || 'none'})` : '';
  const pinned = !!kitId; // ?kit= keeps that kit whatever the character

  stage.rain.visible = q.get('rain') !== '0';
  stage.glow = q.get('glow') !== '0';
  controls.autoRotate = false;
  const views: Record<string, [number, number, number, number, number, number]> = {
    wide: [300, 200, 370, 0, 60, 0], low: [150, 40, 215, 0, 55, 0], street: [52, 9, 150, 95, 38, 60], top: [10, 420, 60, 0, 0, 0],
  };
  const v = views[q.get('view') ?? ''] ?? views.wide;
  camera.position.set(v[0], v[1], v[2]);
  controls.target.set(v[3], v[4], v[5]);

  const spire = buildSpire(shared);
  if (q.get('spire') === '1') {
    spire.structure.start = -100;
    scene.add(spire.structure.group!, spire.structure.holo!);
    animateStructure(null, spire.structure, -1, 0);
  }

  // The eight blocks around the plaza.
  const sites: [number, number][] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) sites.push([MID + dx, MID + dz]);
  let blocks: Block[] = [];
  let now = 0;

  /** Rebuild every block. `continueFrom` matches structures by index, exactly as `raise()` does in the game. */
  function build(continueFrom: boolean, riseSeconds: number): void {
    const style = styleFor(opts);
    const next = sites.map(([bx, bz], b) => {
      const block = buildBlock(shared, bx, bz, opts.seed, style, false);
      block.structures.forEach((s, k) => {
        const prev = continueFrom ? blocks[b]?.structures[k] : undefined;
        s.from = prev ? Math.min(0.95, (prev.height * prev.p) / s.height) : 0;
        if (riseSeconds <= 0) { s.start = -1e6; s.rise = 1; }
        else { s.start = now + 1.6 + k * 0.5; s.rise = riseSeconds; }
        animateStructure(block, s, k, now);
      });
      return block;
    });
    for (const old of blocks) { scene.remove(old.root); disposeBlock(old); }
    blocks = next;
    stale = true;
    for (const b of blocks) scene.add(b.root);
  }

  /** What the kit blocks cost: meshes drawn (one draw call each) and triangles, plus the worst single lot. */
  function measure() {
    let calls = 0, triangles = 0, lots = 0, worstLot = 0, worstLotTriangles = 0;
    const count = (o: THREE.Object3D): [number, number] => {
      let c = 0, t = 0;
      o.traverse(n => {
        const m = n as THREE.Mesh;
        if (!m.geometry || (n as THREE.LineSegments).isLineSegments) return;
        const inst = (n as THREE.InstancedMesh).isInstancedMesh ? (n as THREE.InstancedMesh).count : 1;
        if (!inst) return;
        c++;
        t += ((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) * inst;
      });
      return [c, t];
    };
    for (const b of blocks) {
      const [c, t] = count(b.root);
      calls += c; triangles += t;
      for (const s of b.structures) {
        if (!s.group) continue;
        const [lc, lt] = count(s.group);
        lots++;
        worstLot = Math.max(worstLot, lc); worstLotTriangles = Math.max(worstLotTriangles, lt);
      }
    }
    return { blocks: blocks.length, lots, calls, triangles, perBlockCalls: +(calls / blocks.length).toFixed(1), perBlockTriangles: Math.round(triangles / blocks.length), worstLot, worstLotTriangles };
  }

  const rising: Structure[] = [];
  let frames = 0, stale = true;
  let frame = { calls: 0, triangles: 0 };
  renderer.info.autoReset = false; // the glow pipeline renders several passes; count the whole frame

  function draw(dt: number): void {
    rising.length = 0;
    for (const b of blocks) b.structures.forEach((s, k) => {
      animateStructure(b, s, k, now);
      if (!s.done && now >= s.start - 1.6) rising.push(s);
    });
    renderer.info.reset();
    stage!.frame(dt, now, rising, spire.structure, spire.top, rising.length > 0);
    frame = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    frames++;
    if (frames % 15 === 1 || stale) {
      stale = false;
      const m = measure();
      const over = !!opts.kit && m.worstLot > 3;
      statsEl.classList.toggle('over', over);
      statsEl.textContent = [
        unknown || `kit ${opts.kit?.id ?? '(plain towers)'}  ${opts.intent}  ${opts.character}  level ${opts.level}  seed ${opts.seed}`,
        `kit blocks: ${m.calls} draw calls, ${Math.round(m.triangles).toLocaleString('en')} triangles  (${m.blocks} blocks, ${m.lots} lots)`,
        `per block:  ${m.perBlockCalls} draw calls, ${m.perBlockTriangles.toLocaleString('en')} triangles`,
        `worst lot:  ${m.worstLot} meshes${over ? ' OVER BUDGET (3)' : ''}, ${Math.round(m.worstLotTriangles).toLocaleString('en')} triangles`,
        `whole frame: ${frame.calls} draw calls, ${frame.triangles.toLocaleString('en')} triangles`,
      ].join('\n');
    }
  }

  const growing = q.get('grow') === '1';
  if (growing) opts.level = 1;
  build(false, growing ? 5 : num('rise', 0));
  let nextGrow = 9;

  let last = performance.now();
  function tick(t: number): void {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    now += dt;
    if (growing && now >= nextGrow) {
      nextGrow = now + 9;
      // Level 4 wraps to a fresh level 1, like clearing the site and briefing again.
      const wrap = opts.level === 4;
      opts.level = wrap ? 1 : opts.level + 1;
      build(!wrap, 5);
    }
    draw(dt);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // For scripts. Time only moves forward; `advance` skips ahead, `set` rebuilds.
  Object.assign(window, {
    __kits: {
      stage, kits: allKits.map(k => k.id), mats: mats(),
      get frames() { return frames; },
      get info() { return { kit: opts.kit?.id ?? null, level: opts.level, character: opts.character, cheap: opts.cheap, ...measure(), frameCalls: frame.calls, frameTriangles: frame.triangles }; },
      advance(seconds: number) { now += seconds; draw(0); },
      /** Rebuild with new options. `rise` > 0 animates; `grow` continues from what stands (a level-up). `kit: null` is plain towers. */
      set(change: { level?: number; character?: Character; seed?: number; cheap?: boolean; kit?: string | null; intent?: string }, rise = 0, grow = false) {
        if (change.level) opts.level = change.level;
        if (change.seed !== undefined) opts.seed = change.seed;
        if (change.cheap !== undefined) opts.cheap = change.cheap;
        if (change.intent && LOOK[change.intent]) opts.intent = change.intent;
        if (change.character) opts.character = change.character;
        if (change.kit !== undefined) opts.kit = change.kit ? kitById(change.kit) : undefined; // null: plain towers
        else if (!pinned && (change.character || change.intent)) opts.kit = kitFor(opts.intent, opts.character);
        build(grow, rise);
        draw(0);
      },
      view(name: string) { const p = views[name] ?? views.wide; camera.position.set(p[0], p[1], p[2]); controls.target.set(p[3], p[4], p[5]); draw(0); },
    },
  });
}
