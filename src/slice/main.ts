// Visual slice: a district raised by the Architect. No gameplay; this is a look-and-feel test.
import './slice.css';
import {
  BLOCKS, MID, INTENTS, Character, Block, Structure, buildBlock, buildSpire, disposeBlock, animateStructure,
} from './city';
import { createStage } from './stage';

const $ = (id: string) => document.getElementById(id)!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = createStage($('scene') as HTMLCanvasElement, reduced);

if (stage) {
  const { scene, shared } = stage;
  const spire = buildSpire(shared);
  scene.add(spire.structure.group!, spire.structure.holo!);

  let character: Character = 'balanced';
  let blocks: Block[] = [];
  let order: { block: Block; s: Structure; index: number }[] = [];
  let clock = 0;
  let seed = 7;
  let finished = false;

  function raise(newSeed: number, prebuiltShare: number): void {
    for (const b of blocks) { scene.remove(b.root); disposeBlock(b); }
    seed = newSeed;
    blocks = [];
    order = [];
    for (let bz = 0; bz < BLOCKS; bz++) for (let bx = 0; bx < BLOCKS; bx++) {
      if (bx === MID && bz === MID) continue;
      const block = buildBlock(shared, bx, bz, seed, INTENTS[character].style);
      blocks.push(block);
      scene.add(block.root);
      block.structures.forEach((s, index) => order.push({ block, s, index }));
    }
    // Build outward from the spire.
    order.sort((a, b) => a.s.dist + a.s.x * 0.013 - (b.s.dist + b.s.x * 0.013));
    const prebuilt = Math.floor(order.length * prebuiltShare);
    order.forEach(({ s }, i) => {
      s.rise = 5 + (s.height / 60) * 1.4;
      s.start = i < prebuilt ? -100 : 3.5 + (i - prebuilt) * 0.2;
    });
    const sp = spire.structure;
    sp.done = false; sp.p = 0;
    sp.start = prebuilt > 0 ? -100 : 0.6;
    if (prebuilt === 0) sp.group!.visible = false;
    clock = 0;
    finished = false;
    advance(0);
  }

  const rising: Structure[] = [];
  function advance(dt: number): void {
    clock += dt;
    rising.length = 0;
    const sp = spire.structure;
    animateStructure(null, sp, -1, clock);
    if (sp.p > 0 && !sp.done) rising.push(sp);
    let built = 0;
    for (const { block, s, index } of order) {
      animateStructure(block, s, index, clock);
      if (s.done) built++;
      else if (s.p > 0) rising.push(s);
    }
    const total = order.length;
    $('meter-fill').style.width = `${(built / total) * 100}%`;
    if (built === total && sp.done) {
      finished = true;
      $('status').innerHTML = `<b>ARCHITECT</b> District complete. ${total} structures, tallest ${Math.round(spire.top)} m.`;
    } else {
      $('status').innerHTML = `<b>ARCHITECT</b> ${built < 3 && !sp.done ? 'Surveying the ground' : 'Raising the district'}: ${built} / ${total}`;
    }
  }

  let hintTimer = 0;
  function hint(): void {
    $('hint').classList.remove('fade');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => $('hint').classList.add('fade'), 7000);
    $('hint').textContent = stage!.walking
      ? (stage!.touch ? 'Drag to look around. Hold the button to walk.' : 'Drag to look. W A S D or arrow keys to walk, Shift to run.')
      : (stage!.touch ? 'Drag to orbit, pinch to zoom, two fingers to pan.' : 'Drag to orbit, scroll to zoom, right-drag to pan.');
  }
  stage.onView = street => {
    $('view-sky').classList.toggle('on', !street);
    $('view-street').classList.toggle('on', street);
    ($('walk-hold') as HTMLElement).hidden = !(street && stage.touch);
    hint();
  };
  const hold = $('walk-hold');
  hold.addEventListener('pointerdown', e => { stage.walkHold = true; hold.setPointerCapture(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel']) hold.addEventListener(ev, () => { stage.walkHold = false; });

  const intentsEl = $('intents');
  (Object.keys(INTENTS) as Character[]).forEach(k => {
    const b = document.createElement('button');
    b.textContent = INTENTS[k].label;
    b.dataset.k = k;
    b.addEventListener('click', () => { character = k; refreshIntent(); raise(seed + 1, 0); });
    intentsEl.appendChild(b);
  });
  function refreshIntent(): void {
    for (const b of Array.from(intentsEl.children) as HTMLElement[]) b.classList.toggle('on', b.dataset.k === character);
    $('blurb').textContent = INTENTS[character].blurb;
  }
  $('view-sky').addEventListener('click', () => stage.setView(false));
  $('view-street').addEventListener('click', () => stage.setView(true));
  $('rebuild').addEventListener('click', () => raise(seed + 1, 0));
  $('skip').addEventListener('click', () => advance(1e4));
  $('rain').addEventListener('click', e => { stage.rain.visible = !stage.rain.visible; (e.currentTarget as HTMLElement).classList.toggle('on', stage.rain.visible); });
  $('glow').addEventListener('click', e => { stage.glow = !stage.glow; (e.currentTarget as HTMLElement).classList.toggle('on', stage.glow); });

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!finished) advance(dt);
    stage!.frame(dt, now / 1000, rising, spire.structure, spire.top, !finished);
    requestAnimationFrame(frame);
  }

  refreshIntent();
  hint();
  // Open on a skyline already under way: the inner ring stands, the rest is still rising.
  raise(seed, reduced ? 1 : 0.3);
  if (reduced) advance(1e4);
  requestAnimationFrame(frame);

  (window as unknown as Record<string, unknown>).__slice = {
    advance, setView: stage.setView, camera: stage.camera, controls: stage.controls,
    get info() { return { structures: order.length }; },
  };
}
