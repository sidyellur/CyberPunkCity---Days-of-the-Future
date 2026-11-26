// Kits without a browser: three.js geometry and materials work in Node; only the canvas textures of
// `createShared` do not, so `Shared` is stubbed with untextured materials.
// The second half runs against EVERY registered kit (src/slice/kits/*.kit.ts), so a new kit is
// checked for the budget and for top-down growth just by existing.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { BlockStyle, Block, Character, Shared, buildBlock, disposeBlock, CYAN, MAGENTA, AMBER } from '../src/slice/city';
import { GROUND_ZONE, DistrictKit, LotCtx } from '../src/slice/kits/kit';
import { allKits, kitById, kitFor } from '../src/slice/kits/index';
import { cached, merge, box, tint, tiersFromRoof, windowBoxDown, FLOOR } from '../src/slice/kits/core';

function stubShared(): Shared {
  return {
    windows: Array.from({ length: 7 }, () => new THREE.MeshStandardMaterial()),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true }),
    signs: Array.from({ length: 12 }, (_, i) => ({ mat: new THREE.MeshBasicMaterial(), vertical: i % 2 === 0, color: CYAN })),
    ground: new THREE.MeshStandardMaterial(),
    sprite: new THREE.Texture() as THREE.CanvasTexture,
    spire: new THREE.MeshStandardMaterial(),
  };
}
const shared = stubShared();
const CHARACTERS: Character[] = ['efficient', 'balanced', 'green'];
/** The game's `styleFor` (src/city/main.ts) for a middling intent. */
const style = (level: number, character: Character = 'balanced', more: Partial<BlockStyle> = {}): BlockStyle => ({
  height: 0.45 * (character === 'efficient' ? 1.25 : character === 'green' ? 0.75 : 1) * (1 + 0.55 * (level - 1)),
  park: 0.05, signs: 0.5, palette: [CYAN, MAGENTA, AMBER], windows: [0, 1, 2], level, character, cheap: false, ...more,
});
const SITES: [number, number, number][] = [[3, 3, 1], [5, 4, 1], [0, 8, 7], [6, 2, 42], [2, 7, 1234], [4, 5, 99]];

const shape = (b: Block) => b.structures.map(s => [s.x, s.z, s.radius, s.height, s.group?.children.length ?? -1,
  s.group?.children.map(c => (c as THREE.Mesh).geometry.attributes.position.count)]);

describe('buildBlock with a kit', () => {
  it('is unchanged when the kit declines every lot', () => {
    for (const [bx, bz, seed] of SITES) {
      const decline: DistrictKit = { id: 'decline', lot: ctx => { ctx.rng(); ctx.rng(); return null; } };
      expect(shape(buildBlock(shared, bx, bz, seed, style(2, 'balanced', { kit: decline }), false)))
        .toEqual(shape(buildBlock(shared, bx, bz, seed, style(2), false)));
    }
  });

  it('gives the kit the same lots, in the same order, at every level', () => {
    for (const [bx, bz, seed] of SITES) {
      const seen: LotCtx[][] = [];
      for (let level = 1; level <= 4; level++) {
        const lots: LotCtx[] = [];
        const kit: DistrictKit = { id: 'spy', lot: ctx => { lots.push({ ...ctx, r: [...ctx.r, ctx.rng(), ctx.rng()] }); return null; } };
        const block = buildBlock(shared, bx, bz, seed, style(level, 'balanced', { kit }), false);
        expect(lots.length).toBe(block.structures.filter(s => s.group).length);
        seen.push(lots);
      }
      for (let level = 1; level < 4; level++) {
        expect(seen[level].map(c => [c.index, c.count, c.x, c.z, c.w, c.d, c.r, c.accent.getHex()]))
          .toEqual(seen[0].map(c => [c.index, c.count, c.x, c.z, c.w, c.d, c.r, c.accent.getHex()]));
        seen[level].forEach((c, i) => { expect(c.H).toBeGreaterThan(seen[level - 1][i].H); expect(c.level).toBe(level + 1); });
      }
    }
  });

  it('carves the block the way the kit asks, unless the style says otherwise', () => {
    const four: DistrictKit = { id: 'four', lots: 4, lot: () => null };
    expect(buildBlock(shared, 3, 3, 1, style(1, 'balanced', { kit: four }), false).structures.length).toBe(4);
    expect(buildBlock(shared, 3, 3, 1, style(1, 'balanced', { kit: four, lots: 1 }), false).structures.length).toBe(1);
  });

  it('uses the kit build, makes a hologram when none is given, and cleans up', () => {
    const sharedGeo = cached('test:unit', () => new THREE.BoxGeometry(1, 1, 1));
    const spare = vi.fn();
    const kit: DistrictKit = {
      id: 'box', lots: 2,
      lot: ctx => {
        const group = new THREE.Group();
        const m = new THREE.Mesh(sharedGeo, shared.neon);
        m.position.set(ctx.x, ctx.H / 2, ctx.z); m.scale.set(ctx.w, ctx.H, ctx.d);
        group.add(m);
        return { group, height: ctx.H, dispose: spare };
      },
    };
    const block = buildBlock(shared, 3, 3, 1, style(1, 'balanced', { kit, park: 0 }), false);
    expect(block.structures.length).toBe(2);
    const disposed = vi.spyOn(sharedGeo, 'dispose');
    for (const s of block.structures) {
      expect(s.group!.children.length).toBe(1);
      expect(s.holo).toBeInstanceOf(THREE.LineSegments);
      expect(s.holo!.geometry.attributes.position.count).toBe(24);
    }
    disposeBlock(block);
    expect(spare).toHaveBeenCalledTimes(2);
    expect(disposed).not.toHaveBeenCalled();
  });
});

describe('kit helpers', () => {
  it('merge copes with mixed parts and leaves cached geometry alone', () => {
    const dome = cached('test:dome', () => new THREE.SphereGeometry(1, 6, 4).toNonIndexed());
    const g = merge([box(1, 1, 1, 0, 0, 0, tint(0xff0000)), dome, new THREE.PlaneGeometry(1, 1)])!;
    expect(g.attributes.position.count).toBe(36 + dome.attributes.position.count + 6);
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
    expect(dome.attributes.color).toBeUndefined();
    expect(merge([])).toBeNull();
  });

  it('tiersFromRoof keeps the top fixed and grows at the bottom', () => {
    const tiers = [{ w: 4, d: 4, cx: 0, cz: 0, floors: 2 }, { w: 8, d: 8, cx: 0, cz: 0, floors: 3 }, { w: 12, d: 12, cx: 0, cz: 0, floors: 0 }];
    expect(tiersFromRoof(FLOOR, tiers).map(t => [t.w, t.h])).toEqual([[4, FLOOR]]);
    const tall = tiersFromRoof(10 * FLOOR, tiers);
    expect(tall.map(t => t.w)).toEqual([4, 8, 12]);
    expect(tall[2].y0).toBe(0);
    expect(tall[0].y0).toBeCloseTo(8 * FLOOR);
    expect(tall[2].h).toBeCloseTo(5 * FLOOR);
  });

  it('windowBoxDown anchors the window pattern to the roof', () => {
    const v = (h: number) => { const g = windowBoxDown(10, h, 10, 0, 50, 0, 60); return [...(g.attributes.uv.array as Float32Array)].filter((_, i) => i % 2 === 1 && i < 8); };
    expect(Math.max(...v(20))).toBeCloseTo(Math.max(...v(40)));
    expect(Math.min(...v(40))).toBeLessThan(Math.min(...v(20)));
  });
});

// ---------- Every registered kit ----------

/** Where the geometry is, measured down from the roof: all vertices that are above the ground zone at the lower level. */
function topSignature(group: THREE.Group, top: number, depth: number): string[] {
  const out: string[] = [];
  group.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  group.traverse(o => {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geo) return;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const below = top - p.y;
      // Rounded to 0.1 m, nudged so that values on a round number do not straddle a rounding boundary.
      if (below < depth) out.push([p.x, below, p.z].map(v => Math.round((v + 0.0137) * 10)).join(' '));
    }
  });
  return out.sort();
}

describe('the registry', () => {
  it('finds the example kit and keeps it out of the game', () => {
    expect(kitById('example')).toBeDefined();
    expect(kitById('example')!.intents).toEqual([]);
    expect(new Set(allKits.map(k => k.id)).size).toBe(allKits.length);
    // The same answer whatever the level: kitFor does not take one.
    for (const k of allKits) for (const intent of k.intents) for (const c of k.characters ?? CHARACTERS) expect(kitFor(intent, c)).toBeDefined();
  });
});

describe.each(allKits.map(k => [k.id, k] as const))('kit %s', (_id, kit) => {
  const each = (f: (bx: number, bz: number, seed: number, character: Character) => void) => {
    for (const [bx, bz, seed] of SITES) for (const character of CHARACTERS) f(bx, bz, seed, character);
  };
  /** `lots[k]` and `made[k]` (false when the kit declined) line up with the structures that have a group. */
  const build = (bx: number, bz: number, seed: number, character: Character, level: number, cheap = false) => {
    const lots: LotCtx[] = [], made: boolean[] = [];
    const spy: DistrictKit = { id: kit.id, lots: kit.lots, lot: ctx => { const b = kit.lot(ctx); lots.push(ctx); made.push(!!b); return b; } };
    const block = buildBlock(shared, bx, bz, seed, style(level, character, { kit: spy, cheap }), false);
    return { block, lots, made, built: block.structures.filter(s => s.group) };
  };

  it('stays within 3 meshes per lot, with shared materials and no lights', () => {
    const fromShared = new Set<THREE.Material>([...shared.windows, shared.neon, ...shared.signs.map(s => s.mat)]);
    each((bx, bz, seed, character) => {
      for (const level of [1, 4]) for (const cheap of [false, true]) {
        const { block } = build(bx, bz, seed, character, level, cheap);
        for (const s of block.structures) {
          if (!s.group) continue;
          let meshes = 0;
          s.group.traverse(o => {
            expect((o as THREE.Light).isLight, 'no lights in a kit').toBeFalsy();
            const m = o as THREE.Mesh;
            if (!m.geometry) return;
            meshes++;
            for (const mat of [m.material].flat()) expect(fromShared.has(mat) || mat.userData.shared === true, 'materials must be shared (mats(), ctx.shared)').toBe(true);
          });
          expect(meshes, 'meshes per lot').toBeLessThanOrEqual(3);
          expect(s.group.position.y).toBe(0);
          expect(s.height).toBeGreaterThan(0);
        }
        disposeBlock(block);
      }
    });
  });

  it('builds the same thing twice and stays on its lot', () => {
    each((bx, bz, seed, character) => {
      const a = build(bx, bz, seed, character, 3), b = build(bx, bz, seed, character, 3);
      expect(shape(a.block)).toEqual(shape(b.block));
      a.built.forEach((s, k) => {
        if (!a.made[k]) return; // a declined lot is a plain tower
        const ctx = a.lots[k];
        const bounds = new THREE.Box3().setFromObject(s.group!);
        expect(bounds.min.y).toBeGreaterThanOrEqual(-0.01);
        expect(bounds.max.y).toBeLessThanOrEqual(s.height + 0.01);
        expect(bounds.min.x).toBeGreaterThanOrEqual(ctx.x - ctx.w / 2 - 1.5);
        expect(bounds.max.x).toBeLessThanOrEqual(ctx.x + ctx.w / 2 + 1.5);
        expect(bounds.min.z).toBeGreaterThanOrEqual(ctx.z - ctx.d / 2 - 1.5);
        expect(bounds.max.z).toBeLessThanOrEqual(ctx.z + ctx.d / 2 + 1.5);
      });
    });
  });

  it.skipIf(kit.freeform)('grows top-down: above the ground zone, each level looks like the one before', () => {
    each((bx, bz, seed, character) => {
      const levels = [1, 2, 3, 4].map(level => build(bx, bz, seed, character, level));
      for (let l = 1; l < 4; l++) {
        expect(levels[l].made, 'declining a lot must not depend on level').toEqual(levels[0].made);
        levels[l].built.forEach((s, k) => {
          if (!levels[l].made[k]) return;
          const prev = levels[l - 1].built[k];
          expect(s.height, 'height must not shrink as H grows').toBeGreaterThanOrEqual(prev.height);
          const depth = prev.height - GROUND_ZONE;
          expect(topSignature(s.group!, s.height, depth), `lot ${k}, level ${l} to ${l + 1}: geometry above the ground zone moved relative to the roof`)
            .toEqual(topSignature(prev.group!, prev.height, depth));
        });
      }
    });
  });
});
