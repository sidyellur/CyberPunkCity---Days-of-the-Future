// HUD markup. Pure functions from game state to HTML strings; main.ts wires up the actions.
import {
  BUILDINGS, BUILD_ORDER, UNITS, UNIT_ORDER, TECHS, TECH_ORDER, TIERS, TIER_UPS, MAX_LEVEL,
  DAY_LENGTH, DAYLIGHT, RIVAL_NAME, Cost, BKey, lvlMult,
} from '../sim/defs';
import { State, Building, canAfford, isBuilt, maxHp, upgradeCost, upgradeTime, unitMaxHp } from '../sim/state';
import { OBJECTIVES } from '../sim/sim';

export interface UiState {
  selUnits: Set<number>;
  selBuilding: number;
  build: BKey | null;
  touch: boolean;
  showResearch: boolean;
  speed: number;
  paused: boolean;
}

const RES_LABEL: Record<string, string> = { credits: 'CR', alloy: 'AL', food: 'FD', data: 'DT' };
const RES_NAME: Record<string, string> = { credits: 'Credits', alloy: 'Alloy', food: 'Food', data: 'Data' };

export const fmt = (n: number) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));
const rate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

export function costHtml(s: State, cost: Cost): string {
  const parts = (Object.keys(cost) as (keyof Cost)[]).filter(k => cost[k]).map(k =>
    `<span class="c-${k}${s.res[k] < (cost[k] ?? 0) ? ' short' : ''}">${cost[k]} ${RES_LABEL[k]}</span>`);
  return parts.join(' ') || 'Free';
}

export function topbar(s: State, ui: UiState): string {
  const r = s.rates;
  const chip = (k: 'credits' | 'alloy' | 'food' | 'data') =>
    `<div class="chip c-${k}" title="${RES_NAME[k]}"><b>${RES_LABEL[k]}</b><span>${fmt(s.res[k])}</span><i class="${r.income[k] < 0 ? 'neg' : ''}">${rate(r.income[k])}</i></div>`;
  const t = s.time % DAY_LENGTH;
  const day = t < DAYLIGHT;
  const left = Math.ceil(day ? DAYLIGHT - t : DAY_LENGTH - t);
  return `
    ${chip('credits')}${chip('alloy')}${chip('food')}${chip('data')}
    <div class="chip ${r.powerRatio < 1 ? 'bad' : ''}" title="Power: supply / demand"><b>PWR</b><span>${Math.floor(r.powerSupply)}/${Math.ceil(r.powerDemand)}</span></div>
    <div class="chip ${s.citizens >= r.housing ? 'warn' : ''}" title="Citizens / housing (idle)"><b>POP</b><span>${Math.floor(s.citizens)}/${r.housing}</span><i>${r.idle} idle</i></div>
    <div class="chip ${s.morale < 35 ? 'bad' : ''}" title="Morale drives output and growth"><b>MOR</b><span>${Math.round(s.morale)}%</span></div>
    <div class="chip" title="Army supply"><b>ARMY</b><span>${r.supply}/${r.supplyCap}</span></div>
    <div class="chip tier" title="City tier"><b>TIER</b><span>${TIERS[s.tier - 1]}</span></div>
    <div class="chip" title="${day ? 'Daylight: solar at full output' : 'Night: solar at a trickle'}"><b>${day ? 'DAY' : 'NIGHT'}</b><span>${left}s</span></div>
    <div class="spacer"></div>
    <button data-act="pause" class="${ui.paused ? 'on' : ''}">${ui.paused ? '▶' : '❚❚'}</button>
    <button data-act="speed" class="${ui.speed > 1 ? 'on' : ''}">${ui.speed}×</button>
    <button data-act="menu">☰</button>`;
}

export function objectives(s: State): string {
  const i = OBJECTIVES.findIndex((_, n) => !(s.objectives & (1 << n)));
  if (i < 0) return '';
  const done = OBJECTIVES.length - OBJECTIVES.filter((_, n) => !(s.objectives & (1 << n))).length;
  return `<div class="obj-head">Objective ${done + 1}/${OBJECTIVES.length}</div><div class="obj-text">${OBJECTIVES[i].text}</div>`;
}

export function buildbar(s: State, ui: UiState): string {
  const btns = BUILD_ORDER.map(k => {
    const d = BUILDINGS[k];
    const locked = d.tier > s.tier;
    const cls = [ui.build === k ? 'on' : '', locked ? 'locked' : !canAfford(s, d.cost) ? 'poor' : ''].join(' ');
    return `<button class="bbtn ${cls}" data-act="build" data-k="${k}" title="${d.desc}">
      <span class="swatch k-${k}"></span><span class="nm">${d.name}</span>
      <span class="cost">${locked ? `${TIERS[d.tier - 1]} tier` : costHtml(s, d.cost)}</span></button>`;
  });
  const army = s.units.filter(u => u.faction === 0).length;
  return btns.join('') +
    `<button class="bbtn util ${ui.showResearch ? 'on' : ''}" data-act="research-toggle"><span class="nm">Research</span><span class="cost">${s.research ? TECHS[s.research].name : `${s.techs.length}/${TECH_ORDER.length} done`}</span></button>
     <button class="bbtn util" data-act="select-army"><span class="nm">Select army</span><span class="cost">${army} ${army === 1 ? 'unit' : 'units'}</span></button>`;
}

function bar(frac: number, cls = ''): string {
  return `<div class="bar ${cls}"><div style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></div></div>`;
}

function researchPanel(s: State): string {
  const hasVault = s.buildings.some(b => b.faction === 0 && b.kind === 'vault' && isBuilt(b));
  const rows = TECH_ORDER.map(k => {
    const t = TECHS[k];
    const done = s.techs.includes(k);
    const active = s.research === k;
    const state = done ? '<span class="tag good">Done</span>'
      : active ? bar(1 - s.researchT / t.time, 'wide')
      : `<button data-act="research" data-k="${k}" class="${s.res.data < t.data || s.research || !hasVault ? 'poor' : ''}">${t.data} DT</button>`;
    return `<div class="row"><div><b>${t.name}</b><small>${t.desc}</small></div>${state}</div>`;
  }).join('');
  return `<div class="p-head"><h3>Research</h3><button data-act="research-toggle" class="x">✕</button></div>
    ${hasVault ? '' : `<p class="hint">Build a Data Vault (District tier) to gather data and research.</p>`}${rows}`;
}

function buildingPanel(s: State, b: Building): string {
  const def = BUILDINGS[b.kind];
  const full = maxHp(s, b);
  const head = `<div class="p-head"><h3>${b.faction === 1 ? 'Rival ' : ''}${def.name} <em>${b.kind === 'core' ? TIERS[(b.faction === 0 ? s.tier : 2) - 1] : 'Lv ' + b.level}</em></h3><button data-act="deselect" class="x">✕</button></div>
    ${bar(b.hp / full, 'hp')}<small>${Math.ceil(b.hp)} / ${full} HP</small>`;
  if (b.faction === 1) return head + `<p class="hint">${RIVAL_NAME} structure. Select squads and target it to attack.</p>`;
  if (!isBuilt(b)) {
    return head + `<p>Under construction: ${Math.ceil(b.build)}s</p>${bar(1 - b.build / def.time, 'wide')}
      <div class="btns"><button data-act="demolish" class="danger">Cancel (refund)</button></div>`;
  }
  const lines: string[] = [`<p class="desc">${def.desc}</p>`];
  const stats: string[] = [];
  if (def.out) for (const k of Object.keys(def.out) as (keyof Cost)[]) stats.push(`${((def.out[k] ?? 0) * lvlMult(b.level)).toFixed(1)} ${RES_NAME[k]}/s at full crew`);
  if (def.housing) stats.push(`Houses ${Math.floor(def.housing * (1 + 0.5 * (b.level - 1)))}`);
  if (def.power > 0) stats.push(`+${Math.round(def.power * lvlMult(b.level))} power${b.kind === 'solar' ? ' by day' : ''}`);
  if (def.power < 0) stats.push(`${Math.round(-def.power * (1 + 0.3 * (b.level - 1)))} power draw`);
  if (def.attack) stats.push(`${Math.round(def.attack.dmg * lvlMult(b.level))} damage, range ${def.attack.range}`);
  if (b.kind === 'plaza') stats.push(`+${12 * b.level} morale`);
  lines.push(`<small>${stats.join(' · ')}</small>`);
  if (def.workers > 0) {
    lines.push(`<div class="row crew"><span>Crew <b>${b.workers}</b> / ${b.workersWanted} assigned (max ${def.workers})</span>
      <span><button data-act="crew" data-d="-1">−</button><button data-act="crew" data-d="1">+</button></span></div>`);
  }
  const btns: string[] = [];
  if (b.kind === 'core') {
    if (s.tierUp > 0) lines.push(`<p>Advancing to ${TIERS[s.tier]}: ${Math.ceil(s.tierUp)}s</p>${bar(1 - s.tierUp / s.tierTotal, 'wide')}`);
    else if (s.tier < TIERS.length) {
      const up = TIER_UPS[s.tier - 1];
      btns.push(`<button data-act="upgrade" class="${canAfford(s, up.cost) ? '' : 'poor'}">Advance to ${TIERS[s.tier]}<small>${costHtml(s, up.cost)} · ${up.time}s</small></button>`);
    } else lines.push('<p class="hint">Your city is a Megacity. Finish the rival.</p>');
  } else {
    if (b.upgrade > 0) lines.push(`<p>Upgrading: ${Math.ceil(b.upgrade)}s</p>${bar(1 - b.upgrade / b.upgradeTotal, 'wide')}`);
    else if (b.level >= MAX_LEVEL) lines.push('<small>Max level</small>');
    else if (b.level >= s.tier) btns.push(`<button class="poor" data-act="upgrade">Upgrade<small>Needs ${TIERS[s.tier] ?? 'next'} tier</small></button>`);
    else btns.push(`<button data-act="upgrade" class="${canAfford(s, upgradeCost(b)) ? '' : 'poor'}">Upgrade to Lv ${b.level + 1}<small>${costHtml(s, upgradeCost(b))} · ${upgradeTime(b)}s</small></button>`);
    btns.push(`<button data-act="demolish" class="danger">Demolish</button>`);
  }
  if (b.kind === 'vault') btns.unshift(`<button data-act="research-toggle">Research</button>`);
  if (b.kind === 'hub') {
    const train = UNIT_ORDER.map(k => {
      const u = UNITS[k];
      const locked = u.tier > s.tier;
      return `<button data-act="train" data-k="${k}" class="${locked || !canAfford(s, u.cost) ? 'poor' : ''}" title="${u.desc}">${u.name}<small>${locked ? `${TIERS[u.tier - 1]} tier` : costHtml(s, u.cost)}</small></button>`;
    }).join('');
    lines.push(`<div class="btns train">${train}</div>`);
    if (b.queue.length) {
      lines.push(`<div class="queue">${b.queue.map((q, i) => `<button data-act="untrain" data-i="${i}" title="Cancel">${UNITS[q.kind].name}${i === 0 ? ` ${Math.ceil(q.t)}s` : ''} ✕</button>`).join('')}</div>`);
    }
  }
  return head + lines.join('') + `<div class="btns">${btns.join('')}</div>`;
}

function unitsPanel(s: State, ui: UiState): string {
  const units = s.units.filter(u => ui.selUnits.has(u.id));
  const mine = units[0]?.faction === 0;
  const counts = UNIT_ORDER.map(k => [k, units.filter(u => u.kind === k).length] as const).filter(([, n]) => n);
  const hp = units.reduce((a, u) => a + u.hp, 0), full = units.reduce((a, u) => a + unitMaxHp(s, u.kind, u.faction), 0);
  return `<div class="p-head"><h3>${mine ? 'Squad' : 'Hostiles'} <em>${counts.map(([k, n]) => `${n} ${UNITS[k].name}${n > 1 ? 's' : ''}`).join(', ')}</em></h3><button data-act="deselect" class="x">✕</button></div>
    ${bar(hp / (full || 1), 'hp')}
    ${mine ? `<p class="hint">${ui.touch ? 'Tap the ground to move, tap a hostile to attack.' : 'Right-click to move or attack. Drag to box-select.'} Hold near an Uplink Node to capture it.</p>
    <div class="btns"><button data-act="stop">Stop</button></div>` : ''}`;
}

export function panel(s: State, ui: UiState): string {
  if (ui.build) {
    const d = BUILDINGS[ui.build];
    return `<div class="p-head"><h3>Place ${d.name}</h3><button data-act="cancel-build" class="x">✕</button></div>
      <p class="desc">${d.desc}</p><small>${costHtml(s, d.cost)} · ${d.time}s build</small>
      <p class="hint">${ui.touch ? 'Tap a tile to position it, then confirm.' : 'Click to place. Hold Shift to place several. Esc cancels.'}</p>
      ${ui.touch ? '<div class="btns"><button data-act="confirm-build">Confirm</button></div>' : ''}`;
  }
  if (ui.showResearch) return researchPanel(s);
  const b = ui.selBuilding ? s.buildings.find(o => o.id === ui.selBuilding) : undefined;
  if (b) return buildingPanel(s, b);
  if (ui.selUnits.size) return unitsPanel(s, ui);
  return '';
}

export function startScreen(hasSave: boolean, difficulty: string): string {
  const diff = (k: string, label: string) => `<button data-act="difficulty" data-k="${k}" class="${difficulty === k ? 'on' : ''}">${label}</button>`;
  return `<div class="card">
    <h1>NEON <span>ARCOLOGY</span></h1>
    <p class="tag-line">Raise a megacity. Outlast the ${RIVAL_NAME}.</p>
    <ul>
      <li>Build around your <b>Nexus Spire</b>: feed, house and power your citizens.</li>
      <li>Citizens crew your buildings. Keep morale up and the grid out of brownout.</li>
      <li>Advance through four tiers: Block, District, Sector, Megacity.</li>
      <li>Train squads, hold Uplink Nodes, survive the raids, and bring down the rival Nexus.</li>
    </ul>
    <div class="seg">${diff('easy', 'Easy')}${diff('normal', 'Normal')}${diff('hard', 'Hard')}</div>
    <div class="btns">
      ${hasSave ? '<button data-act="continue" class="primary">Continue</button><button data-act="new">New city</button>' : '<button data-act="new" class="primary">Found your city</button>'}
    </div>
  </div>`;
}

export function endScreen(s: State): string {
  const win = s.over === 'win';
  const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
  return `<div class="card">
    <h1>${win ? 'CITY <span>ASCENDANT</span>' : 'NEXUS <span>LOST</span>'}</h1>
    <p class="tag-line">${win ? `The ${RIVAL_NAME} Nexus has fallen. The skyline is yours.` : `The ${RIVAL_NAME} overran your Spire.`}</p>
    <ul><li>Time: ${m}m ${sec}s</li><li>Tier reached: ${TIERS[s.tier - 1]}</li><li>Raids weathered: ${s.ai.waves}</li></ul>
    <div class="btns"><button data-act="new" class="primary">New city</button></div>
  </div>`;
}

export function menuScreen(): string {
  return `<div class="card">
    <h1>PAUSED</h1>
    <div class="btns col">
      <button data-act="resume" class="primary">Resume</button>
      <button data-act="save">Save now</button>
      <button data-act="quit">Quit to title</button>
    </div>
  </div>`;
}
