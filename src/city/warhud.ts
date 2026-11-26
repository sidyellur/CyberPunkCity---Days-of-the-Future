// HUD markup for conflict: the Defence panel and the top-bar threat chip. Pure functions to HTML.
import { CityState } from './model';
import {
  ConflictState, Objective, RivalSummary, RivalId, threatSummary, POSTURES, POSTURE_ORDER, OPS, FLEET, RIVALS, DIPLOMACY,
} from './conflict';

const bar = (p: number, cls = '') => `<div class="bar ${cls}"><div style="width:${Math.round(Math.max(0, Math.min(1, p)) * 100)}%"></div></div>`;
const fmt = (n: number) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
const pct = (p: number) => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;

const STANCE: Record<string, string> = {
  peaceful: 'Quiet', hostile: 'Hostile', wary: 'Wary', truce: 'Truce', trading: 'Trading', feuding: 'Fighting its neighbour',
  yielded: 'Yielded', absorbed: 'Absorbed', allied: 'Allied',
};
const THREAT: Record<string, [string, string]> = {
  none: ['No threat', 'good'], low: ['You would repel a raid', 'ok'], high: ['A raid would test you', 'low'], severe: ['A raid would break through', 'bad'],
};
const OBJECTIVE_NAME: Record<string, string> = { cutPower: 'Cut their power', breakIndustry: 'Break their industry', breakForces: 'Break their forces' };

/** Small chip for the top bar. Empty in a peaceful city. */
export function threatChip(s: CityState): string {
  const w = s.war;
  if (!w) return '';
  const t = threatSummary(s, w);
  const incoming = t.rivals.find(r => r.raidIn !== null);
  const cls = incoming || t.nexus < 35 ? 'bad' : t.rivals.some(r => r.threat === 'severe') ? 'warn' : '';
  const text = t.phase === 'grace' ? `calm ${Math.ceil(t.graceLeft / 60)}m` : incoming ? `raid ${incoming.raidIn}s` : `${t.nexus}%`;
  return `<div class="chip ${cls}" title="Nexus integrity. At zero the city falls."><b>NEXUS</b><span>${text}</span></div>`;
}

function objectiveText(o: Objective, s: CityState): string {
  if (o.kind === 'none') return 'No objective. The Architect picks its own targets.';
  if (o.kind === 'protect') return `Protecting the district at lot ${o.site + 1}${s.districts[o.site] ? '' : ' (now empty)'}.`;
  return `${OBJECTIVE_NAME[o.kind]}: ${RIVALS[o.rival].name}.`;
}

function rivalCard(s: CityState, w: ConflictState, r: RivalSummary, objective: Objective): string {
  const def = RIVALS[r.id];
  if (r.status !== 'active') {
    return `<div class="rival done"><div class="row"><b>${r.name}</b><i class="good">${STANCE[r.status]}</i></div><p class="note">${def.ai} no longer opposes you.</p></div>`;
  }
  const [threatText, threatCls] = THREAT[r.threat];
  const raid = r.raidIn !== null ? `<p class="alert">Raid arrives in ${r.raidIn}s.</p>` : '';
  const aim = (kind: 'cutPower' | 'breakIndustry' | 'breakForces') =>
    `<button data-act="objective" data-k="${kind}" data-r="${r.id}" class="${objective.kind === kind && objective.rival === r.id ? 'on' : ''}">${OBJECTIVE_NAME[kind].replace(' their ', ' ')}</button>`;
  const op = (k: 'brownout' | 'steal' | 'blind' | 'sabotage') =>
    `<button data-act="op" data-k="${k}" data-r="${r.id}" class="${s.res.data < OPS[k].data ? 'off' : ''}" title="${OPS[k].desc}">${OPS[k].name}<small>${OPS[k].data} DT</small></button>`;
  const offer = (k: string, label: string, note = '') => `<button data-act="offer" data-k="${k}" data-r="${r.id}">${label}${note ? `<small>${note}</small>` : ''}</button>`;
  const special = r.id === 'meridian'
    ? offer('buyout', 'Buy them out', r.buyoutPrice ? `${fmt(r.buyoutPrice)} CR, needs ${DIPLOMACY.buyoutRelations} relations` : '')
    : offer('pact', 'Offer a pact', `needs ${DIPLOMACY.pactRelations} relations`);
  const state = [r.truceLeft > 0 ? `truce ${r.truceLeft}s` : '', r.tradeLeft > 0 ? `trading ${r.tradeLeft}s` : '', r.blinded ? 'blinded' : '', r.browned ? 'blacked out' : ''].filter(Boolean).join(', ');
  return `<div class="rival">
    <div class="row"><b>${r.name}</b><span>${def.ai} · ${STANCE[r.stance] ?? r.stance}</span><i class="${threatCls}">${threatText}</i></div>
    ${raid}
    <div class="stats"><span>Strength <b>${r.strength}</b></span><span>Economy <b>${r.economy}</b></span><span>Relations <b>${r.relations}</b></span></div>
    <div class="row"><span>Will to fight</span><i>${r.resolve}</i></div>${bar(r.resolve / 100, r.resolve < 35 ? 'good' : 'low')}
    ${state ? `<p class="note">Now: ${state}.</p>` : ''}
    <label>Objective for the Architect</label><div class="seg three">${aim('breakForces')}${aim('breakIndustry')}${aim('cutPower')}</div>
    <p class="note">Strike odds under this posture: ${r.strikeOdds > 0 ? r.strikeOdds.toFixed(1) + ' to 1' : 'no strike force'}.</p>
    <label>Operations <i>${pct(r.opChance)} chance</i></label><div class="grid2">${op('blind')}${op('brownout')}${op('steal')}${op('sabotage')}</div>
    <label>Diplomacy</label><div class="grid2">${offer('truce', 'Propose a truce')}${offer('trade', 'Open trade')}${offer('tribute', 'Send a gift', '500 CR')}${offer('demand', 'Demand they yield')}${special}${offer('incite', 'Turn them on their neighbour', `${DIPLOMACY.inciteCredits} CR, ${DIPLOMACY.inciteData} DT`)}</div>
  </div>`;
}

export function warHtml(s: CityState): string {
  const w = s.war;
  const close = '<button data-act="war" class="x" aria-label="Close">✕</button>';
  if (!w) return `<div class="head"><h3>Defence</h3>${close}</div><p class="note">This city has no rivals. Found a new city with rivals to use this panel.</p>`;
  const t = threatSummary(s, w);
  const postures = POSTURE_ORDER.map(k => `<button data-act="posture" data-k="${k}" class="${t.posture === k ? 'on' : ''}">${POSTURES[k].name}</button>`).join('');
  const batch = 10;
  const strain = t.effects.morale < -0.5 ? `<p class="note">War weariness is costing ${Math.round(-t.effects.morale)} morale.</p>` : '';
  return `<div class="head"><h3>Defence</h3>${close}</div>
    <p class="headline">${t.headline}</p>
    <div class="row"><b>Nexus integrity</b><i class="${t.nexus < 35 ? 'bad' : t.nexus < 70 ? 'low' : 'good'}">${t.nexus}%</i></div>${bar(t.nexus / 100, t.nexus < 35 ? 'bad' : t.nexus < 70 ? 'low' : 'good')}
    <div class="stats"><span>Home defence <b>${t.defence}</b></span><span>Fleet <b>${t.fleet}</b>/${t.fleetCap}${t.fleetOrdered ? ` (+${t.fleetOrdered} building)` : ''}</span><span>Upkeep <b>${t.upkeep.toFixed(1)}</b> CR/s</span></div>
    ${t.blinded ? '<p class="alert">Your defence grid is blinded.</p>' : ''}${strain}
    <div class="btns"><button data-act="fleet" data-o="${batch}" class="primary">Commission ${batch} fleet<small>${batch * FLEET.credits} CR ${batch * FLEET.alloy} AL</small></button><button data-act="fleet" data-o="-${batch}">Stand down ${batch}</button></div>
    <p class="note">Defence districts protect the city for free. The fleet can also strike, and costs upkeep.</p>
    <label>Posture: how should the Architect fight?</label><div class="seg four">${postures}</div><p class="note">${POSTURES[t.posture].desc}</p>
    <p class="note">${objectiveText(t.objective, s)} ${t.objective.kind === 'none' ? '' : '<button data-act="objective" data-k="none" class="link">Clear</button>'}</p>
    <div class="btns"><button data-act="op" data-k="firewall" class="${s.res.data < OPS.firewall.data ? 'off' : ''}">Raise a firewall<small>${t.firewall > 0 ? `active ${t.firewall}s` : `${OPS.firewall.data} DT`}</small></button></div>
    ${t.rivals.map(r => rivalCard(s, w, r, t.objective)).join('')}`;
}

export function endHtml(s: CityState): string {
  const w = s.war!;
  const win = w.over === 'win';
  const m = Math.floor(s.time / 60);
  return `<div class="card"><h1>${win ? 'THE CITY <span>STANDS</span>' : 'THE NEXUS <span>HAS FALLEN</span>'}</h1>
    <p class="lede">${w.reason}</p>
    <ul><li>${m} minutes, ${Math.round(s.citizens).toLocaleString()} citizens, Architect level ${s.architect}</li>
    <li>${w.stats.raids} raids: ${w.stats.repelled} repelled, ${w.stats.breaches} broke through</li>
    <li>${w.stats.strikesWon} of ${w.stats.strikes} strikes won</li></ul>
    <div class="btns">${win ? '<button data-act="resume" class="primary">Keep building</button>' : ''}<button data-act="new" class="${win ? '' : 'primary'}">Found a new city</button></div></div>`;
}

export type { RivalId };
