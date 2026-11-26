import { State } from './state';

// Key predates the game's final name; kept so existing saves still load.
const KEY = 'neon-arcology-save-v1';

export function saveGame(s: State): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, fx: [], events: [] }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as State;
    return s && s.version === 1 && Array.isArray(s.tiles) ? s : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
