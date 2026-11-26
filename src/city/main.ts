// Layer 1 game shell: the 3D city, the brief flow, the Architect's proposals and the HUD.
import './game.css';
import * as THREE from 'three';
import {
  CityState, Intent, Character, Cost, ResKey, SIZE, CENTRE, DT, INTENTS, INTENT_ORDER, CHARACTERS, CHARACTER_ORDER, MAX_LEVEL,
  ARCHITECT_UPS, OBJECTIVES, createCity, step, recompute, brief, grow, clearSite, upgradeArchitect, briefCost, briefTime,
  districtStats, adjacency, canAfford, currentObjective,
} from './model';
import { advise, Advice } from './architect';
import {
  Block, BlockStyle, Structure, BLOCK, PITCH, ORIGIN, AMBER, MAGENTA, CYAN, VIOLET, GREEN, ICE, ORANGE,
  buildBlock, buildSpire, disposeBlock, animateStructure, blockCenter,
} from '../slice/city';
import { createStage } from '../slice/stage';

const $ = (id: string) => document.getElementById(id)!;
const SAVE_KEY = 'cyberpunk-city-layer1-v1';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = createStage($('scene') as HTMLCanvasElement, true);

const LABEL: Record<ResKey, string> = { credits: 'CR', alloy: 'AL', food: 'FD', data: 'DT' };
const RES_NAME: Record<ResKey, string> = { credits: 'credits', alloy: 'alloy', food: 'food', data: 'data' };
const fmt = (n: number) => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));
const signed = (n: number, digits = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;

/** How the Architect dresses each kind of district. */
const LOOK: Record<Intent, BlockStyle> = {
  housing: { height: 1, park: 0.05, signs: 0.5, palette: [AMBER, MAGENTA, AMBER], windows: [0, 0, 2] },
  farms: { height: 0.7, park: 0.2, signs: 0.15, palette: [GREEN], windows: [4] },
  industry: { height: 0.55, park: 0, signs: 0.25, palette: [ORANGE, AMBER], windows: [5] },
  commerce: { height: 1.25, park: 0, signs: 1.8, palette: [MAGENTA, CYAN, VIOLET], windows: [2, 1, 3] },
  power: { height: 0.6, park: 0, signs: 0, palette: [ICE, CYAN], windows: [6], lots: 1 },
  research: { height: 1.5, park: 0, signs: 0.2, palette: [VIOLET, CYAN], windows: [3, 1], slim: 0.1 },
  park: { height: 0.3, park: 1, signs: 0, palette: [GREEN], windows: [0] },
};
const INTENT_COLOR: Record<Intent, number> = { housing: AMBER, farms: GREEN, industry: ORANGE, commerce: MAGENTA, power: ICE, research: VIOLET, park: 0x7dffb8 };
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function styleFor(intent: Intent, character: Character, level: number): BlockStyle {
  const base = LOOK[intent];
  const ch = character === 'efficient' ? 1.25 : character === 'green' ? 0.75 : 1;
  return {
    ...base,
    height: base.height * 0.45 * ch * (1 + 0.55 * (level - 1)),
    park: Math.min(1, base.park + (character === 'green' && intent !== 'park' ? 0.25 : 0)),
  };
}

if (stage) boot(stage);

function boot(st: NonNullable<typeof stage>): void {
  const { scene, shared, camera, controls } = st;
  controls.autoRotate = false;
  camera.position.set(330, 210, 400);
  controls.target.set(0, 70, 0);

  const spire = buildSpire(shared);
  spire.structure.start = -100;
  scene.add(spire.structure.group!, spire.structure.holo!);
  animateStructure(null, spire.structure, -1, 0);

  let state: CityState = createCity(1);
  let running = false;
  let paused = false;
  let speed = 1;
  let overlay: 'intro' | 'menu' | null = 'intro';
  let selected = -1;
  let hover = -1;
  let draft: { intent: Intent; character: Character } = { intent: 'housing', character: 'balanced' };
  let confirmClear = false;
  let advice: Advice = advise(state);

  // ---------- 3D districts ----------
  interface Raised { block: Block; intent: Intent; character: Character; level: number; label: THREE.Sprite }
  const raised = new Map<number, Raised>();
  const labelCache = new Map<string, THREE.Texture>();

  function labelTexture(intent: Intent, level: number): THREE.Texture {
    const key = `${intent}${level}`;
    let t = labelCache.get(key);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    const col = hex(INTENT_COLOR[intent]);
    g.fillStyle = 'rgba(6,8,18,0.82)';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = col;
    g.fillRect(0, 0, 6, 64);
    g.font = '600 26px "Chakra Petch", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(INTENTS[intent].name.split(' ').pop()!.toUpperCase(), 18, 26);
    for (let i = 0; i < MAX_LEVEL; i++) {
      g.fillStyle = i < level ? col : 'rgba(255,255,255,0.18)';
      g.fillRect(18 + i * 22, 46, 16, 6);
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    labelCache.set(key, t);
    return t;
  }

  function raise(i: number, instant: boolean): void {
    const d = state.districts[i]!;
    const old = raised.get(i);
    const bx = i % SIZE, bz = Math.floor(i / SIZE);
    const block = buildBlock(shared, bx, bz, state.seed, styleFor(d.intent, d.character, d.level), false);
    const remaining = d.build;
    block.structures.forEach((s, k) => {
      const prev = old && old.intent === d.intent && old.character === d.character ? old.block.structures[k] : undefined;
      s.from = prev ? Math.min(0.95, (prev.height * prev.p) / s.height) : 0;
      if (instant && remaining <= 0) { s.start = -1e6; s.rise = 1; }
      else {
        // Plan first, then rise, finishing as the simulation finishes the build.
        const lead = Math.min(1.6 + k * 0.5, remaining * 0.3);
        s.start = state.time + lead;
        s.rise = Math.max(1, remaining - lead - 0.3);
        if (instant) { s.start = state.time - (d.buildTotal - remaining); s.rise = Math.max(1, d.buildTotal - 0.3); }
      }
      animateStructure(block, s, k, state.time);
    });
    if (old) { scene.remove(old.block.root, old.label); disposeBlock(old.block); (old.label.material as THREE.Material).dispose(); }
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(d.intent, d.level), depthTest: false, transparent: true, fog: false }));
    const c = blockCenter(bx, bz);
    const tallest = Math.max(...block.structures.map(s => s.height));
    label.position.set(c.x, tallest + 16, c.z);
    label.scale.set(44, 11, 1);
    label.renderOrder = 10;
    scene.add(block.root, label);
    raised.set(i, { block, intent: d.intent, character: d.character, level: d.level, label });
  }

  /** Bring the 3D city in line with the simulation. */
  function sync(instant = false): void {
    let changed = false;
    state.districts.forEach((d, i) => {
      const r = raised.get(i);
      if (!d) {
        if (r) { scene.remove(r.block.root, r.label); disposeBlock(r.block); (r.label.material as THREE.Material).dispose(); raised.delete(i); changed = true; }
      } else if (!r || r.intent !== d.intent || r.character !== d.character || r.level !== d.level) {
        raise(i, instant);
        changed = true;
      }
    });
    if (changed || instant) drawLots();
  }

  // Outlines of empty lots, the selection and the Architect's proposed site.
  const lotLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.22, depthWrite: false }));
  lotLines.position.y = 0.3;
  scene.add(lotLines);
  function square(i: number, inset: number): number[] {
    const c = blockCenter(i % SIZE, Math.floor(i / SIZE)), h = BLOCK / 2 - inset;
    const p = [[-h, -h], [h, -h], [h, -h], [h, h], [h, h], [-h, h], [-h, h], [-h, -h]];
    return p.flatMap(([x, z]) => [c.x + x, 0, c.z + z]);
  }
  function drawLots(): void {
    const pts: number[] = [];
    state.districts.forEach((d, i) => { if (!d && i !== CENTRE) pts.push(...square(i, 5), ...square(i, 14)); });
    lotLines.geometry.dispose();
    lotLines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }
  function marker(color: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, depthTest: false, toneMapped: false });
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(square(0, 1), 3)), mat);
    const c0 = blockCenter(0, 0);
    line.position.set(-c0.x, 0.6, -c0.z);
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(BLOCK - 2, BLOCK - 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    fill.position.y = 0.5;
    g.add(line, fill);
    g.visible = false;
    g.renderOrder = 5;
    scene.add(g);
    return g;
  }
  const selMarker = marker(0xffffff), hoverMarker = marker(CYAN), adviceMarker = marker(AMBER);
  function putMarker(m: THREE.Group, i: number): void {
    m.visible = i >= 0;
    if (i < 0) return;
    const c = blockCenter(i % SIZE, Math.floor(i / SIZE));
    m.position.set(c.x, 0, c.z);
  }

  function siteAt(clientX: number, clientY: number): number {
    const p = st.pick(clientX, clientY);
    if (!p) return -1;
    const bx = Math.floor((p.x - ORIGIN) / PITCH), bz = Math.floor((p.z - ORIGIN) / PITCH);
    if (bx < 0 || bz < 0 || bx >= SIZE || bz >= SIZE) return -1;
    const c = blockCenter(bx, bz);
    if (Math.abs(p.x - c.x) > BLOCK / 2 + 2 || Math.abs(p.z - c.z) > BLOCK / 2 + 2) return -1;
    return bz * SIZE + bx;
  }

  // ---------- HUD ----------
  function toast(msg: string, kind = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild!.remove();
    setTimeout(() => el.remove(), 4200);
  }
  function attempt(err: string | null): boolean {
    if (err) toast(err, 'warn');
    else { sync(); advice = advise(state); }
    render(true);
    return !err;
  }
  const costHtml = (cost: Cost) => (Object.keys(cost) as ResKey[]).filter(k => cost[k])
    .map(k => `<span class="c-${k}${state.res[k] < (cost[k] ?? 0) ? ' short' : ''}">${fmt(cost[k]!)} ${LABEL[k]}</span>`).join(' ');
  function shortfall(cost: Cost): string {
    const parts = (Object.keys(cost) as ResKey[]).filter(k => state.res[k] < (cost[k] ?? 0)).map(k => `${fmt(Math.ceil((cost[k] ?? 0) - state.res[k]))} more ${RES_NAME[k]}`);
    return parts.length ? `Needs ${parts.join(' and ')}` : '';
  }
  const bar = (p: number) => `<div class="bar"><div style="width:${Math.round(Math.max(0, Math.min(1, p)) * 100)}%"></div></div>`;

  function topHtml(): string {
    const r = state.rates;
    const chip = (k: ResKey) => `<div class="chip c-${k}" title="${RES_NAME[k]}"><b>${LABEL[k]}</b><span>${fmt(state.res[k])}</span><i class="${r.income[k] < 0 ? 'neg' : ''}">${signed(r.income[k])}</i></div>`;
    return `${chip('credits')}${chip('alloy')}${chip('food')}${chip('data')}
      <div class="chip ${r.powerRatio < 1 ? 'bad' : ''}" title="Power: supply / demand"><b>PWR</b><span>${Math.floor(r.powerSupply)}/${Math.ceil(r.powerDemand)}</span></div>
      <div class="chip ${state.citizens >= r.housing ? 'warn' : ''}" title="Citizens / homes"><b>POP</b><span>${fmt(state.citizens)}/${fmt(r.housing)}</span></div>
      <div class="chip" title="Workers employed / workforce"><b>JOBS</b><span>${fmt(r.employed)}/${fmt(r.workers)}</span></div>
      <div class="chip ${state.morale < 35 ? 'bad' : ''}" title="Morale drives output and growth"><b>MOR</b><span>${Math.round(state.morale)}%</span></div>`;
  }

  function architectHtml(): string {
    const a = advice;
    const o = currentObjective(state);
    const objective = o >= 0 ? `<div class="objective"><b>Objective ${o + 1}/${OBJECTIVES.length}</b>${OBJECTIVES[o].text}</div>` : '<div class="objective"><b>All objectives met</b>The city is yours to shape.</div>';
    let proposal = '';
    if (a.kind !== 'wait') {
      const detail = a.kind === 'brief' ? ` <em>${CHARACTERS[a.character!].name}</em>` : '';
      proposal = `<div class="proposal"><div class="what">${a.title}${detail}</div><div class="cost">${costHtml(a.cost!)}</div>
        ${a.affordable ? '' : `<div class="need">${shortfall(a.cost!)}</div>`}
        <div class="btns"><button data-act="approve" class="primary ${a.affordable ? '' : 'off'}">Approve</button><button data-act="show">Show me</button></div></div>`;
    }
    return `<div class="who">ARCHITECT <span>Level ${state.architect}</span></div><p class="says">${a.reason}</p>${proposal}${objective}`;
  }

  function statLines(intent: Intent, character: Character, level: number): string[] {
    const stt = districtStats({ intent, character }, level);
    const lines: string[] = [];
    for (const k of Object.keys(stt.out) as ResKey[]) lines.push(`<span class="c-${k}">+${stt.out[k]!.toFixed(1)} ${RES_NAME[k]}/s</span> at full staff`);
    if (stt.housing) lines.push(`Homes for <b>${stt.housing}</b>`);
    if (stt.power > 0) lines.push(`<b>+${Math.round(stt.power)}</b> power`);
    if (stt.power < 0) lines.push(`<b>${Math.round(-stt.power)}</b> power draw`);
    if (stt.jobs) lines.push(`<b>${stt.jobs}</b> jobs`);
    if (stt.morale) lines.push(`<b>${signed(stt.morale, 0)}</b> morale`);
    return lines;
  }

  function siteHtml(): string {
    if (selected < 0) return '';
    const close = '<button data-act="close" class="x" aria-label="Close">✕</button>';
    if (selected === CENTRE) {
      const up = ARCHITECT_UPS[state.architect - 1];
      const body = state.archUp > 0
        ? `<p>Upgrading: ${Math.ceil(state.archUp)}s</p>${bar(1 - state.archUp / state.archTotal)}`
        : up ? `<div class="btns"><button data-act="upgrade" class="primary ${canAfford(state, up.cost) ? '' : 'off'}">Upgrade to level ${state.architect + 1}<small>${costHtml(up.cost)} · ${up.time}s</small></button></div>
            <p class="note">${shortfall(up.cost) || `Districts can then grow to level ${state.architect + 1}${state.architect === 1 ? ', and research unlocks' : ''}.`}</p>`
          : '<p class="note">The Architect is at its highest level.</p>';
      return `<div class="head"><h3>The Architect <em>Level ${state.architect}</em></h3>${close}</div>
        <p class="desc">The mind that designs and raises your city. Its spire houses the first citizens and powers the first grid.</p>${body}`;
    }
    const d = state.districts[selected];
    if (!d) {
      const intents = INTENT_ORDER.map(k => {
        const def = INTENTS[k], locked = def.unlock > state.architect;
        return `<button data-act="intent" data-k="${k}" class="intent ${draft.intent === k ? 'on' : ''} ${locked ? 'off' : ''}">
          <i style="background:${hex(INTENT_COLOR[k])}"></i>${def.name}<small>${locked ? `Architect level ${def.unlock}` : costHtml(briefCost(k, draft.character, 1))}</small></button>`;
      }).join('');
      const chars = CHARACTER_ORDER.map(k => `<button data-act="character" data-k="${k}" class="${draft.character === k ? 'on' : ''}">${CHARACTERS[k].name}</button>`).join('');
      const cost = briefCost(draft.intent, draft.character, 1);
      const adj = adjacency(state, selected, draft.intent).notes;
      const locked = INTENTS[draft.intent].unlock > state.architect;
      const recommended = advice.kind === 'brief' && advice.site === selected ? `<p class="note rec">The Architect recommends ${INTENTS[advice.intent!].name.toLowerCase()} here.</p>` : '';
      return `<div class="head"><h3>Empty lot</h3>${close}</div>${recommended}
        <label>What should stand here?</label><div class="intents">${intents}</div>
        <label>Character</label><div class="seg">${chars}</div><p class="note">${CHARACTERS[draft.character].desc}</p>
        <div class="forecast"><b>Forecast</b>${[...statLines(draft.intent, draft.character, 1), ...adj.map(n => `<span class="adj">${n}</span>`)].map(l => `<div>${l}</div>`).join('')}</div>
        <div class="btns"><button data-act="brief" class="primary ${locked || !canAfford(state, cost) ? 'off' : ''}">Issue brief<small>${costHtml(cost)} · ${briefTime(draft.intent, 1)}s</small></button></div>
        ${locked ? '' : `<p class="note">${shortfall(cost)}</p>`}`;
    }
    const def = INTENTS[d.intent];
    const building = d.build > 0;
    const status = building
      ? `<p>${d.standing ? `Growing to level ${d.level}` : 'Rising'}: ${Math.ceil(d.build)}s</p>${bar(1 - d.build / d.buildTotal)}`
      : def.jobs ? `<p>Staffed ${Math.round(d.staffing * 100)}%</p>${bar(d.staffing)}` : '';
    const adj = adjacency(state, selected, d.intent).notes;
    let action = '';
    if (!building) {
      if (d.level >= MAX_LEVEL) action = '<p class="note">At the highest level.</p>';
      else if (d.level >= state.architect) action = `<p class="note">Upgrade the Architect to level ${state.architect + 1} to grow this district.</p>`;
      else {
        const cost = briefCost(d.intent, d.character, d.level + 1);
        action = `<div class="btns"><button data-act="grow" class="primary ${canAfford(state, cost) ? '' : 'off'}">Grow to level ${d.level + 1}<small>${costHtml(cost)} · ${briefTime(d.intent, d.level + 1)}s</small></button></div><p class="note">${shortfall(cost)}</p>`;
      }
    }
    return `<div class="head"><h3><i style="background:${hex(INTENT_COLOR[d.intent])}"></i>${def.name} <em>${CHARACTERS[d.character].name} · Level ${d.level}</em></h3>${close}</div>
      <p class="desc">${def.desc}</p>${status}
      <div class="forecast">${[...statLines(d.intent, d.character, Math.max(1, d.standing || d.level)), ...adj.map(n => `<span class="adj">${n}</span>`)].map(l => `<div>${l}</div>`).join('')}</div>
      ${action}
      <div class="btns"><button data-act="clear" class="danger">${confirmClear ? 'Confirm: clear this site' : 'Clear site'}</button></div>`;
  }

  const last: Record<string, string> = {};
  function setHtml(id: string, html: string): void {
    if (last[id] === html) return;
    last[id] = html;
    $(id).innerHTML = html;
    $(id).classList.toggle('empty', !html);
  }
  let hudT = 0;
  function render(force = false): void {
    if (!force && performance.now() - hudT < 250) return;
    hudT = performance.now();
    $('ui').classList.toggle('hidden', !running);
    if (!running) return;
    setHtml('chips', topHtml());
    setHtml('architect', architectHtml());
    setHtml('site', siteHtml());
    $('pause').textContent = paused ? '▶' : '❚❚';
    $('pause').classList.toggle('on', paused);
    $('speed').textContent = `${speed}×`;
    $('view').textContent = st.walking ? 'Skyline' : 'Street';
    $('glow').classList.toggle('on', st.glow);
  }

  function overlayHtml(): void {
    const el = $('overlay');
    el.className = overlay ? 'show' : '';
    if (overlay === 'intro') {
      const hasSave = !!load();
      el.innerHTML = `<div class="card"><h1>CYBERPUNK <span>CITY</span></h1><p class="sub">Days of the Future</p>
        <p class="lede">Two hundred years from now, cities are not built by hand. You decide what the city needs. A superintelligence designs it and raises it.</p>
        <ul><li><b>Brief the Architect.</b> Pick an empty lot, say what should stand there, and watch it rise.</li>
        <li><b>Or approve its proposals.</b> The Architect reads the city and tells you what it would do next.</li>
        <li><b>Mind the neighbours.</b> Homes beside industry are miserable. Homes beside green space are not.</li>
        <li><b>Build upward.</b> Upgrade the Architect, then grow districts taller.</li></ul>
        <div class="btns">${hasSave ? '<button data-act="continue" class="primary">Continue your city</button><button data-act="new">Found a new city</button>' : '<button data-act="new" class="primary">Found your city</button>'}</div></div>`;
    } else if (overlay === 'menu') {
      el.innerHTML = `<div class="card"><h1>PAUSED</h1><div class="btns col"><button data-act="resume" class="primary">Resume</button>
        <button data-act="rain">${st.rain.visible ? 'Turn rain off' : 'Turn rain on'}</button>
        <button data-act="new" class="danger">Abandon and found a new city</button></div></div>`;
    } else el.innerHTML = '';
  }

  // ---------- Save ----------
  function save(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, events: [] })); } catch { /* storage unavailable */ }
  }
  function load(): CityState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const s = raw ? (JSON.parse(raw) as CityState) : null;
      return s && s.version === 1 && Array.isArray(s.districts) && s.districts.length === SIZE * SIZE ? s : null;
    } catch { return null; }
  }

  function start(s: CityState): void {
    for (const [, r] of raised) { scene.remove(r.block.root, r.label); disposeBlock(r.block); }
    raised.clear();
    state = s;
    recompute(state);
    running = true; paused = false; overlay = null; selected = -1; confirmClear = false;
    sync(true);
    advice = advise(state);
    overlayHtml();
    hint();
    render(true);
  }

  // ---------- Actions ----------
  function act(el: HTMLElement): void {
    const k = el.dataset.k ?? '';
    if (el.dataset.act !== 'clear') confirmClear = false;
    switch (el.dataset.act) {
      case 'approve': {
        const a = advice;
        if (a.kind === 'wait') break;
        if (!a.affordable) { toast(shortfall(a.cost!) || 'Not yet', 'warn'); break; }
        const err = a.kind === 'brief' ? brief(state, a.site, a.intent!, a.character!) : a.kind === 'grow' ? grow(state, a.site) : upgradeArchitect(state);
        if (attempt(err)) focus(a.site);
        break;
      }
      case 'show': selected = advice.site; if (advice.kind === 'brief') draft = { intent: advice.intent!, character: advice.character! }; focus(advice.site); break;
      case 'intent': draft.intent = k as Intent; break;
      case 'character': draft.character = k as Character; break;
      case 'brief': attempt(brief(state, selected, draft.intent, draft.character)); break;
      case 'grow': attempt(grow(state, selected)); break;
      case 'upgrade': attempt(upgradeArchitect(state)); break;
      case 'clear':
        if (!confirmClear) confirmClear = true;
        else { confirmClear = false; attempt(clearSite(state, selected)); }
        break;
      case 'close': selected = -1; break;
      case 'resume': overlay = null; overlayHtml(); break;
      case 'rain': st.rain.visible = !st.rain.visible; overlayHtml(); break;
      case 'new': try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ } start(createCity(1 + Math.floor(Math.random() * 9999))); break;
      case 'continue': { const s = load(); if (s) start(s); break; }
    }
    render(true);
  }
  /** Swing the orbit camera to look at a site without changing its distance. */
  function focus(i: number): void {
    if (i < 0 || st.walking) return;
    const c = i === CENTRE ? { x: 0, z: 0 } : blockCenter(i % SIZE, Math.floor(i / SIZE));
    const delta = new THREE.Vector3(c.x - controls.target.x, 0, c.z - controls.target.z);
    controls.target.add(delta);
    camera.position.add(delta);
  }
  for (const id of ['ui', 'overlay']) {
    $(id).addEventListener('pointerdown', e => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      act(el);
    });
  }
  $('pause').addEventListener('click', () => { paused = !paused; render(true); });
  $('speed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; render(true); });
  $('view').addEventListener('click', () => st.setView(!st.walking));
  $('glow').addEventListener('click', () => { st.glow = !st.glow; render(true); });
  $('menu').addEventListener('click', () => { overlay = 'menu'; overlayHtml(); });

  let hintTimer = 0;
  function hint(): void {
    $('hint').classList.remove('fade');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => $('hint').classList.add('fade'), 8000);
    $('hint').textContent = st.walking
      ? (st.touch ? 'Drag to look around. Hold the button to walk.' : 'Drag to look. W A S D or arrow keys to walk, Shift to run.')
      : (st.touch ? 'Tap a lot to brief the Architect. Drag to orbit, pinch to zoom.' : 'Click a lot to brief the Architect. Drag to orbit, scroll to zoom, right-drag to pan.');
  }
  st.onView = street => {
    ($('walk-hold') as HTMLElement).hidden = !(street && st.touch);
    if (street) selected = -1;
    for (const [, r] of raised) r.label.visible = !street;
    lotLines.visible = !street;
    hint();
    render(true);
  };
  const hold = $('walk-hold');
  hold.addEventListener('pointerdown', e => { st.walkHold = true; hold.setPointerCapture(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel']) hold.addEventListener(ev, () => { st.walkHold = false; });

  // Lot picking: a press and release without dragging.
  let down: { x: number; y: number; id: number } | null = null;
  st.canvas.addEventListener('pointerdown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  st.canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && !st.walking && running && !overlay && e.buttons === 0) hover = siteAt(e.clientX, e.clientY);
  });
  st.canvas.addEventListener('pointerleave', () => { hover = -1; });
  st.canvas.addEventListener('pointerup', e => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId || st.walking || !running || overlay) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7) return;
    const i = siteAt(e.clientX, e.clientY);
    confirmClear = false;
    selected = i;
    if (i >= 0 && !state.districts[i] && advice.kind === 'brief' && advice.site === i) draft = { intent: advice.intent!, character: advice.character! };
    render(true);
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (overlay === 'menu') overlay = null; else selected = -1; overlayHtml(); render(true); }
    else if (e.key === ' ' && running && !st.walking) { e.preventDefault(); paused = !paused; render(true); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) save(); });

  // ---------- Loop ----------
  let prev = performance.now(), acc = 0, saveT = 0, adviceT = 0;
  const rising: Structure[] = [];
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (running && !overlay && !paused) {
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && n++ < 8) { step(state); acc -= DT; }
      if (acc > DT) acc = 0;
      sync();
      saveT += dt; adviceT += dt;
      if (saveT > 15) { saveT = 0; save(); }
      if (adviceT > 1) { adviceT = 0; advice = advise(state); }
      for (const ev of state.events.splice(0)) toast(ev.msg, ev.kind);
    }
    // Animate on the simulation clock, interpolated between ticks, so pause and speed apply.
    const clock = state.time + (running && !overlay && !paused ? acc : 0);
    rising.length = 0;
    for (const [, r] of raised) {
      r.block.structures.forEach((s, k) => {
        if (s.done) return;
        animateStructure(r.block, s, k, clock);
        if (!s.done && s.p > s.from) rising.push(s);
      });
    }
    putMarker(selMarker, selected === CENTRE ? -1 : selected);
    putMarker(hoverMarker, hover === selected || hover === CENTRE ? -1 : hover);
    const showAdvice = running && advice.kind === 'brief' && advice.site !== selected && !st.walking;
    putMarker(adviceMarker, showAdvice ? advice.site : -1);
    adviceMarker.scale.setScalar(1 + (reduced ? 0 : Math.sin(now / 300) * 0.03));
    st.frame(dt, now / 1000, rising, spire.structure, spire.top, rising.length > 0 || state.archUp > 0);
    render();
    requestAnimationFrame(frame);
  }

  overlayHtml();
  render(true);
  drawLots();
  requestAnimationFrame(frame);

  (window as unknown as Record<string, unknown>).__city = {
    get state() { return state; },
    start: (seed = 1) => start(createCity(seed)),
    run: (seconds: number) => { for (let i = 0; i < seconds / DT; i++) step(state); sync(); advice = advise(state); render(true); },
    approve: () => { const el = document.createElement('i'); el.dataset.act = 'approve'; act(el); },
    select: (i: number) => { selected = i; render(true); },
    screen: (i: number) => { const c = blockCenter(i % SIZE, Math.floor(i / SIZE)); const v = new THREE.Vector3(c.x, 0, c.z).project(camera); const r = st.canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    stage: st,
  };
}
