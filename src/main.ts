// Game shell: loop, camera, input, and wiring the HUD to simulation commands.
import './style.css';
import { BKey, UKey, TechKey, Difficulty, BUILDINGS } from './sim/defs';
import { State, W, H, createState, coreOf, bCenter, placementError, getBuilding } from './sim/state';
import { step, DT } from './sim/sim';
import {
  placeBuilding, upgradeBuilding, demolish, setWorkers, trainUnit, cancelTraining, startResearch,
  orderMove, orderAttack,
} from './sim/commands';
import { saveGame, loadGame, clearSave } from './sim/save';
import { Renderer, View, drawMinimap, buildingHeight, isoX, isoY } from './ui/render';
import * as hud from './ui/hud';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('game') as HTMLCanvasElement;
const minimap = $('minimap') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

let state: State = createState('normal', 1);
let running = false;
let difficulty: Difficulty = 'normal';
let overlay: 'start' | 'menu' | 'end' | null = 'start';

const ui: hud.UiState = {
  selUnits: new Set(), selBuilding: 0, build: null, touch: false, showResearch: false, speed: 1, paused: false,
};
const view: View = { cam: { x: 0, y: 0, zoom: 1 }, selUnits: ui.selUnits, selBuilding: 0, ghost: null, box: null, now: 0 };

function toast(msg: string, kind = 'info'): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 4) $('toasts').firstChild!.remove();
  setTimeout(() => el.remove(), 4200);
}

/** Run a command and surface the refusal reason, if any. */
function attempt(err: string | null): boolean {
  if (err) toast(err, 'warn');
  refreshHud(true);
  return !err;
}

function centerOn(x: number, y: number): void {
  view.cam.x = isoX(x, y);
  view.cam.y = isoY(x, y);
}

function clampCamera(): void {
  const t = renderer.toTile(view.cam, renderer.width / 2, renderer.height / 2);
  const cx = Math.max(0, Math.min(W, t.x)), cy = Math.max(0, Math.min(H, t.y));
  if (cx !== t.x || cy !== t.y) centerOn(cx, cy);
}

function startGame(s: State): void {
  state = s;
  running = true;
  overlay = null;
  ui.selUnits.clear();
  ui.selBuilding = 0;
  ui.build = null;
  ui.showResearch = false;
  ui.paused = false;
  view.ghost = null;
  const core = coreOf(state, 0);
  if (core) { const c = bCenter(core); centerOn(c.x + 1, c.y - 1); }
  view.cam.zoom = renderer.width < 700 ? 0.8 : 1;
  refreshOverlay();
  refreshHud(true);
}

// ---------- HUD ----------

const last: Record<string, string> = {};
function setHtml(id: string, html: string): void {
  if (last[id] === html) return;
  last[id] = html;
  $(id).innerHTML = html;
  $(id).classList.toggle('empty', !html);
}

let hudTimer = 0;
function refreshHud(force = false): void {
  if (!force && performance.now() - hudTimer < 200) return;
  hudTimer = performance.now();
  $('hud').classList.toggle('hidden', !running);
  if (!running) return;
  setHtml('topbar', hud.topbar(state, ui));
  setHtml('objectives', hud.objectives(state));
  setHtml('buildbar', hud.buildbar(state, ui));
  setHtml('panel', hud.panel(state, ui));
  drawMinimap(minimap, state);
}

function refreshOverlay(): void {
  const el = $('overlay');
  el.className = overlay ? 'show' : '';
  if (overlay === 'start') el.innerHTML = hud.startScreen(!!loadGame(), difficulty);
  else if (overlay === 'end') el.innerHTML = hud.endScreen(state);
  else if (overlay === 'menu') el.innerHTML = hud.menuScreen();
  else el.innerHTML = '';
}

function setBuild(kind: BKey | null): void {
  ui.build = kind;
  ui.showResearch = false;
  if (kind) {
    ui.selUnits.clear();
    ui.selBuilding = 0;
    const size = BUILDINGS[kind].size;
    const t = renderer.toTile(view.cam, renderer.width / 2, renderer.height / 2);
    const gx = Math.round(t.x - size / 2), gy = Math.round(t.y - size / 2);
    view.ghost = { kind, x: gx, y: gy, ok: !placementError(state, kind, gx, gy) };
  } else {
    view.ghost = null;
  }
}

function placeGhost(keep: boolean): void {
  const g = view.ghost;
  if (!g) return;
  if (attempt(placeBuilding(state, g.kind, g.x, g.y)) && !keep) setBuild(null);
  refreshHud(true);
}

function onAction(el: HTMLElement): void {
  const act = el.dataset.act!;
  const k = el.dataset.k ?? '';
  switch (act) {
    case 'build': {
      const def = BUILDINGS[k as BKey];
      if (def.tier > state.tier) { toast(`${def.name} unlocks at a higher tier: advance your Nexus Spire`, 'warn'); break; }
      setBuild(ui.build === k ? null : (k as BKey));
      break;
    }
    case 'cancel-build': setBuild(null); break;
    case 'confirm-build': placeGhost(false); break;
    case 'deselect': ui.selUnits.clear(); ui.selBuilding = 0; break;
    case 'upgrade': attempt(upgradeBuilding(state, ui.selBuilding)); break;
    case 'demolish': if (attempt(demolish(state, ui.selBuilding))) ui.selBuilding = 0; break;
    case 'crew': {
      const b = getBuilding(state, ui.selBuilding);
      if (b) setWorkers(state, b.id, b.workersWanted + Number(el.dataset.d));
      break;
    }
    case 'train': attempt(trainUnit(state, ui.selBuilding, k as UKey)); break;
    case 'untrain': attempt(cancelTraining(state, ui.selBuilding, Number(el.dataset.i))); break;
    case 'research-toggle': ui.showResearch = !ui.showResearch; ui.build = null; view.ghost = null; break;
    case 'research': attempt(startResearch(state, k as TechKey)); break;
    case 'select-army':
      ui.selUnits.clear(); ui.selBuilding = 0; ui.showResearch = false; setBuild(null);
      for (const u of state.units) if (u.faction === 0) ui.selUnits.add(u.id);
      if (!ui.selUnits.size) toast('No squads yet: build a Security Hub and train some', 'warn');
      break;
    case 'stop':
      for (const u of state.units) if (ui.selUnits.has(u.id)) { u.order = 'idle'; u.path = []; u.target = 0; }
      break;
    case 'pause': ui.paused = !ui.paused; break;
    case 'speed': ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1; break;
    case 'menu': overlay = 'menu'; refreshOverlay(); break;
    case 'resume': overlay = null; refreshOverlay(); break;
    case 'save': toast(saveGame(state) ? 'City saved' : 'Saving is not available here', 'good'); overlay = null; refreshOverlay(); break;
    case 'quit': saveGame(state); running = false; overlay = 'start'; refreshOverlay(); break;
    case 'difficulty': difficulty = k as Difficulty; refreshOverlay(); break;
    case 'new': clearSave(); startGame(createState(difficulty, 1 + Math.floor(Math.random() * 9999))); break;
    case 'continue': { const s = loadGame(); if (s) startGame(s); break; }
  }
  refreshHud(true);
}

for (const id of ['hud', 'overlay']) {
  $(id).addEventListener('pointerdown', e => {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === 'touch') ui.touch = true;
    onAction(el);
  });
}

minimap.addEventListener('pointerdown', e => {
  const k = minimap.clientWidth / W;
  centerOn(e.offsetX / k, e.offsetY / k);
  e.stopPropagation();
});

// ---------- World input ----------

type Picked = { unit?: number; building?: number; enemy: boolean };

function pick(sx: number, sy: number, slack: number): Picked | null {
  let best: Picked | null = null;
  let bestD = slack;
  for (const u of state.units) {
    const p = renderer.toScreen(view.cam, u.x, u.y, 10);
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bestD) { bestD = d; best = { unit: u.id, enemy: u.faction === 1 }; }
  }
  if (best) return best;
  let front = -Infinity;
  for (const b of state.buildings) {
    const size = BUILDINGS[b.kind].size;
    const l = renderer.toScreen(view.cam, b.x, b.y + size), r = renderer.toScreen(view.cam, b.x + size, b.y);
    const bottom = renderer.toScreen(view.cam, b.x + size, b.y + size);
    const top = renderer.toScreen(view.cam, b.x, b.y, buildingHeight(b, state.tier));
    if (sx < l.x || sx > r.x || sy > bottom.y || sy < top.y) continue;
    // Trim the empty corners of the bounding box below the roofline.
    const mid = (l.x + r.x) / 2, half = (r.x - l.x) / 2;
    if (sy > l.y + (bottom.y - l.y) * (1 - Math.abs(sx - mid) / half) + 2) continue;
    const depth = b.x + b.y + size;
    if (depth > front) { front = depth; best = { building: b.id, enemy: b.faction === 1 }; }
  }
  return best;
}

function marker(x: number, y: number): void {
  state.fx.push({ type: 'boom', x1: x, y1: y, x2: x, y2: y, t: 0.3, faction: 0 });
}

function order(sx: number, sy: number, target: Picked | null): void {
  const ids = [...ui.selUnits];
  if (target?.enemy) {
    orderAttack(state, ids, (target.unit ?? target.building)!);
  } else {
    const t = renderer.toTile(view.cam, sx, sy);
    orderMove(state, ids, t.x, t.y);
    marker(t.x, t.y);
  }
}

function ownSelection(): boolean {
  if (!ui.selUnits.size) return false;
  const first = state.units.find(u => ui.selUnits.has(u.id));
  return !!first && first.faction === 0;
}

let lastTap = { t: 0, unit: 0 };
function tap(sx: number, sy: number, secondary: boolean, touch: boolean, shift: boolean): void {
  if (!running || overlay) return;
  if (ui.build && view.ghost) {
    if (secondary) { setBuild(null); refreshHud(true); return; }
    const size = BUILDINGS[ui.build].size;
    const t = renderer.toTile(view.cam, sx, sy);
    const gx = Math.floor(t.x - size / 2 + 0.5), gy = Math.floor(t.y - size / 2 + 0.5);
    const same = view.ghost.x === gx && view.ghost.y === gy;
    view.ghost.x = gx; view.ghost.y = gy;
    view.ghost.ok = !placementError(state, ui.build, gx, gy);
    if (!touch || same) placeGhost(shift);
    return;
  }
  const hit = pick(sx, sy, touch ? 28 : 18);
  const commanding = ownSelection();
  if (secondary) { if (commanding) order(sx, sy, hit); return; }
  ui.showResearch = false;
  if (hit?.unit && !hit.enemy) {
    const now = performance.now();
    if (now - lastTap.t < 350 && lastTap.unit === hit.unit) {
      // Double tap: every visible unit of that type.
      const kind = state.units.find(u => u.id === hit.unit)!.kind;
      for (const u of state.units) {
        const p = renderer.toScreen(view.cam, u.x, u.y);
        if (u.faction === 0 && u.kind === kind && p.x > 0 && p.y > 0 && p.x < renderer.width && p.y < renderer.height) ui.selUnits.add(u.id);
      }
    } else {
      if (!shift) ui.selUnits.clear();
      ui.selUnits.add(hit.unit);
    }
    lastTap = { t: now, unit: hit.unit };
    ui.selBuilding = 0;
  } else if (hit?.enemy && commanding) {
    order(sx, sy, hit);
  } else if (hit?.building) {
    ui.selUnits.clear();
    ui.selBuilding = hit.building;
  } else if (hit?.unit) {
    ui.selUnits.clear();
    ui.selUnits.add(hit.unit);
    ui.selBuilding = 0;
  } else if (touch && commanding) {
    order(sx, sy, null);
  } else {
    ui.selUnits.clear();
    ui.selBuilding = 0;
  }
  refreshHud(true);
}

interface Ptr { x: number; y: number; sx: number; sy: number; button: number; type: string; moved: boolean }
const ptrs = new Map<number, Ptr>();
let pinch = 0;

function zoomAt(sx: number, sy: number, factor: number): void {
  const before = renderer.toTile(view.cam, sx, sy);
  view.cam.zoom = Math.max(0.45, Math.min(2, view.cam.zoom * factor));
  const after = renderer.toTile(view.cam, sx, sy);
  view.cam.x += isoX(before.x, before.y) - isoX(after.x, after.y);
  view.cam.y += isoY(before.x, before.y) - isoY(after.x, after.y);
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ui.touch = e.pointerType === 'touch';
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, button: e.button, type: e.pointerType, moved: false });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
    a.moved = b.moved = true;
  }
});

canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) {
    // Mouse hover: the placement ghost follows the cursor.
    if (ui.build && view.ghost && e.pointerType === 'mouse') {
      const size = BUILDINGS[ui.build].size;
      const t = renderer.toTile(view.cam, e.offsetX, e.offsetY);
      view.ghost.x = Math.floor(t.x - size / 2 + 0.5);
      view.ghost.y = Math.floor(t.y - size / 2 + 0.5);
      view.ghost.ok = !placementError(state, ui.build, view.ghost.x, view.ghost.y);
    }
    return;
  }
  const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
  p.x = e.offsetX; p.y = e.offsetY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
    pinch = d;
    view.cam.x -= dx / 2 / view.cam.zoom;
    view.cam.y -= dy / 2 / view.cam.zoom;
    return;
  }
  if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > (p.type === 'touch' ? 9 : 5)) p.moved = true;
  if (!p.moved) return;
  const boxing = p.type !== 'touch' && p.button === 0 && !ui.build;
  if (boxing) {
    view.box = { x0: p.sx, y0: p.sy, x1: p.x, y1: p.y };
  } else {
    view.cam.x -= dx / view.cam.zoom;
    view.cam.y -= dy / view.cam.zoom;
  }
});

function release(e: PointerEvent): void {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  ptrs.delete(e.pointerId);
  pinch = 0;
  if (e.type === 'pointercancel') { view.box = null; return; }
  if (view.box) {
    const b = view.box;
    view.box = null;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    if (!e.shiftKey) ui.selUnits.clear();
    for (const u of state.units) {
      if (u.faction !== 0) continue;
      const s = renderer.toScreen(view.cam, u.x, u.y, 8);
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) ui.selUnits.add(u.id);
    }
    if (ui.selUnits.size) ui.selBuilding = 0;
    refreshHud(true);
    return;
  }
  if (!p.moved) tap(p.x, p.y, p.button === 2, p.type === 'touch', e.shiftKey);
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

const keys = new Set<string>();
window.addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') {
    if (overlay === 'menu') overlay = null;
    else if (ui.build) setBuild(null);
    else if (ui.showResearch) ui.showResearch = false;
    else { ui.selUnits.clear(); ui.selBuilding = 0; }
    refreshOverlay();
    refreshHud(true);
  } else if (e.key === ' ' && running) {
    e.preventDefault();
    ui.paused = !ui.paused;
    refreshHud(true);
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !state.over) saveGame(state); });

// ---------- Loop ----------

let prev = performance.now();
let acc = 0;
let saveT = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  view.now = now / 1000;
  if (renderer.width !== canvas.clientWidth || renderer.height !== canvas.clientHeight) renderer.resize();

  if (running && !overlay && !ui.paused) {
    acc += dt * ui.speed;
    let n = 0;
    while (acc >= DT && n++ < 12) { step(state); acc -= DT; }
    if (acc > DT) acc = 0;
    saveT += dt;
    if (saveT > 20) { saveT = 0; saveGame(state); }
  }

  const pan = (600 * dt) / view.cam.zoom;
  if (keys.has('arrowleft') || keys.has('a')) view.cam.x -= pan;
  if (keys.has('arrowright') || keys.has('d')) view.cam.x += pan;
  if (keys.has('arrowup') || keys.has('w')) view.cam.y -= pan;
  if (keys.has('arrowdown') || keys.has('s')) view.cam.y += pan;
  clampCamera();

  // Drop selections that no longer exist.
  if (ui.selUnits.size) for (const id of ui.selUnits) if (!state.units.some(u => u.id === id)) ui.selUnits.delete(id);
  if (ui.selBuilding && !getBuilding(state, ui.selBuilding)) ui.selBuilding = 0;
  view.selBuilding = ui.selBuilding;

  for (const ev of state.events.splice(0)) toast(ev.msg, ev.kind);
  if (running && state.over && overlay !== 'end') {
    overlay = 'end';
    clearSave();
    refreshOverlay();
  }

  renderer.draw(state, view);
  refreshHud();
  requestAnimationFrame(frame);
}

// A slow pan across the map behind the title screen.
centerOn(W / 2, H / 2);
view.cam.zoom = 0.7;
refreshOverlay();
refreshHud(true);
requestAnimationFrame(frame);

// Handle for automated checks.
(window as unknown as Record<string, unknown>).__game = {
  get state() { return state; },
  ui, view, renderer,
  start: (d: Difficulty = 'normal', seed = 1) => startGame(createState(d, seed)),
  step: (seconds: number) => { for (let i = 0; i < seconds / DT; i++) step(state); },
};
