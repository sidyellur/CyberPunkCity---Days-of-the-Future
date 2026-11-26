// HUD markup for governance: the Govern panel and the decision card. Pure functions to HTML.
import { CityState } from './model';
import {
  GROUPS, GROUP_ORDER, POLICIES, POLICY_ORDER, AUTONOMY, INITIATIVES, EVENTS, STRIKES,
} from './governance';

const bar = (p: number, cls = '') => `<div class="bar ${cls}"><div style="width:${Math.round(Math.max(0, Math.min(1, p)) * 100)}%"></div></div>`;
const mood = (n: number) => (n < 30 ? 'bad' : n < 50 ? 'low' : n < 70 ? 'ok' : 'good');

/** The decision waiting for the player, shown on the Architect's card. Empty when there is none. */
export function pendingHtml(s: CityState): string {
  const p = s.gov.pending;
  if (!p) return '';
  // Whole seconds only, so the card (and its buttons) redraws once a second at most.
  const left = bar(Math.ceil(p.t) / p.total, 'timer');
  if (p.kind === 'event') {
    const e = EVENTS[p.id];
    return `<div class="decision event"><div class="tag">The city needs a decision</div><div class="what">${e.title}</div><p>${e.text}</p>
      <div class="choice"><button data-act="decide" data-o="0" class="primary">${e.options[0]}</button><small>${e.notes[0]}</small></div>
      <div class="choice"><button data-act="decide" data-o="1">${e.options[1]}</button><small>${e.notes[1]}</small></div>
      ${left}<small class="auto">If you do not choose in ${Math.ceil(p.t)}s: ${e.options[1].toLowerCase()}.</small></div>`;
  }
  const d = INITIATIVES[p.id];
  const auto = s.gov.autonomy >= 2 ? `The Architect goes ahead in ${Math.ceil(p.t)}s unless you refuse.` : `The proposal lapses in ${Math.ceil(p.t)}s.`;
  const cost = d.cost ? ` Costs ${d.cost * s.architect} credits.` : '';
  return `<div class="decision ${d.troubling ? 'troubling' : ''}"><div class="tag">The Architect proposes</div><div class="what">${d.title}</div>
    <p class="pitch">${d.pitch}</p><p class="detail">${d.detail}${cost}</p>
    <div class="btns"><button data-act="decide" data-o="0" class="primary">Approve</button><button data-act="decide" data-o="1">Refuse</button></div>
    ${left}<small class="auto">${auto}</small></div>`;
}

export function governHtml(s: CityState): string {
  const g = s.gov;
  const levels = AUTONOMY.map((a, i) => `<button data-act="autonomy" data-o="${i}" class="${g.autonomy === i ? 'on' : ''}">${a.name}</button>`).join('');
  const groups = GROUP_ORDER.map(k => {
    const grp = g.groups[k];
    return `<div class="group" title="${GROUPS[k].desc}"><div class="row"><b>${GROUPS[k].name}</b><span>${Math.round(grp.share * 100)}% of the city</span><i class="${mood(grp.sat)}">${Math.round(grp.sat)}</i></div>${bar(grp.sat / 100, mood(grp.sat))}</div>`;
  }).join('');
  const policies = POLICY_ORDER.map(k => {
    const p = POLICIES[k];
    const opts = p.options.map((o, i) => `<button data-act="policy" data-k="${k}" data-o="${i}" class="${g.policies[k] === i ? 'on' : ''}">${o.name}</button>`).join('');
    const wait = g.cooldown[k] > 0 ? ` <i>can change again in ${Math.ceil(g.cooldown[k])}s</i>` : '';
    return `<label>${p.question}</label><div class="seg">${opts}</div><p class="note">${p.options[g.policies[k]].desc}${wait}</p>`;
  }).join('');
  const strike = g.strike ? `<p class="alert">${STRIKES[g.strike.group].name}. ${Math.ceil(g.strike.t)}s until it ends.</p>` : '';
  const enacted = g.enacted.length ? `<label>In force</label><ul class="enacted">${g.enacted.map(id => `<li>${INITIATIVES[id].title}</li>`).join('')}</ul>` : '';
  return `<div class="head"><h3>Govern</h3><button data-act="govern" class="x" aria-label="Close">✕</button></div>
    ${strike}
    <div class="trust"><div class="row"><b>Trust in the Architect</b><i class="${mood(g.trust)}">${Math.round(g.trust)}</i></div>${bar(g.trust / 100, mood(g.trust))}
      <p class="note">Trust lifts or drags morale. Below 30 the city stops growing; lower still and people leave.</p></div>
    <label>How much may the Architect do alone?</label><div class="seg four">${levels}</div><p class="note">${AUTONOMY[g.autonomy].desc}</p>
    <label>Citizens</label>${groups}
    ${policies}${enacted}`;
}
