// Isometric canvas renderer. Everything is drawn from code: no image assets.
import { BKey, BUILDINGS, UNITS, Faction } from '../sim/defs';
import {
  State, Building, Unit, W, H, GROUND, WATER, RUIN, idx, hash2, isBuilt, bCenter, maxHp, unitMaxHp,
} from '../sim/state';
import { daylight } from '../sim/sim';

export const TW = 64;
export const TH = 32;
const HW = TW / 2, HH = TH / 2;

export interface Camera { x: number; y: number; zoom: number }
export interface Ghost { kind: BKey; x: number; y: number; ok: boolean }
export interface View {
  cam: Camera;
  selUnits: Set<number>;
  selBuilding: number;
  ghost: Ghost | null;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  now: number; // wall-clock seconds, for animation
}

export const FACTION_COLOR: Record<Faction, string> = { 0: '#2ee6ff', 1: '#ff3d8b' };
const AMBER = '#ffc247';

export const isoX = (x: number, y: number) => (x - y) * HW;
export const isoY = (x: number, y: number) => (x + y) * HH;

interface Style { h: number; top: string; left: string; right: string; accent: string; win: string }
const STYLES: Record<BKey, Style> = {
  core: { h: 44, top: '#27345c', left: '#182241', right: '#111a33', accent: '#2ee6ff', win: '#8df3ff' },
  hab: { h: 46, top: '#2b3152', left: '#1c2140', right: '#141832', accent: '#ffb86b', win: '#ffd9a0' },
  solar: { h: 6, top: '#123a7a', left: '#101a36', right: '#0c142b', accent: '#4aa8ff', win: '' },
  farm: { h: 16, top: '#143b33', left: '#11292b', right: '#0c1f22', accent: '#4dffa6', win: '#4dffa6' },
  foundry: { h: 24, top: '#3a2a2a', left: '#291d22', right: '#1e151b', accent: '#ff8a3d', win: '#ff8a3d' },
  market: { h: 30, top: '#3a3420', left: '#292516', right: '#1e1b11', accent: '#ffd84a', win: '#ffe89a' },
  vault: { h: 38, top: '#2c2452', left: '#1f193e', right: '#161230', accent: '#b48cff', win: '#c9adff' },
  plaza: { h: 5, top: '#33204a', left: '#231636', right: '#1a1029', accent: '#ff6ad5', win: '' },
  fusion: { h: 20, top: '#1d3550', left: '#15263c', right: '#0f1c2e', accent: '#7df9ff', win: '#7df9ff' },
  hub: { h: 26, top: '#2a3340', left: '#1c232e', right: '#151a23', accent: '#2ee6ff', win: '#9fb4c8' },
  turret: { h: 10, top: '#2c3444', left: '#1d2330', right: '#151a24', accent: '#2ee6ff', win: '' },
};

export function buildingHeight(b: Building, tier: number): number {
  if (b.kind === 'core') return 124 + (b.faction === 0 ? tier : 2) * 10;
  return STYLES[b.kind].h + (b.level - 1) * 5 + (b.kind === 'turret' ? 12 : 0);
}

function rivalTint(st: Style): Style {
  return { ...st, top: '#3a2036', left: '#29162a', right: '#1e1020', accent: FACTION_COLOR[1], win: '#ff9cc4' };
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private ground: HTMLCanvasElement | null = null;
  private groundFor: number[] | null = null;
  dpr = 1;
  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  /** Screen (CSS px) to fractional tile coordinates. */
  toTile(cam: Camera, sx: number, sy: number): { x: number; y: number } {
    const ix = (sx - this.width / 2) / cam.zoom + cam.x;
    const iy = (sy - this.height / 2) / cam.zoom + cam.y;
    return { x: (ix / HW + iy / HH) / 2, y: (iy / HH - ix / HW) / 2 };
  }
  toScreen(cam: Camera, x: number, y: number, z = 0): { x: number; y: number } {
    return {
      x: (isoX(x, y) - cam.x) * cam.zoom + this.width / 2,
      y: (isoY(x, y) - z - cam.y) * cam.zoom + this.height / 2,
    };
  }

  private buildGround(s: State): void {
    const c = document.createElement('canvas');
    c.width = (W + H) * HW;
    c.height = (W + H) * HH + 4;
    const g = c.getContext('2d')!;
    g.translate(H * HW, 0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = s.tiles[idx(x, y)];
        const n = hash2(x, y, 3);
        const px = isoX(x, y), py = isoY(x, y);
        g.beginPath();
        g.moveTo(px, py); g.lineTo(px + HW, py + HH); g.lineTo(px, py + TH); g.lineTo(px - HW, py + HH);
        g.closePath();
        if (t === WATER) g.fillStyle = n > 0.5 ? '#07243a' : '#082a42';
        else if (t === RUIN) g.fillStyle = '#0b0f1c';
        else g.fillStyle = n > 0.66 ? '#111a33' : n > 0.33 ? '#0f172e' : '#0e152a';
        g.fill();
        if (t === WATER) {
          g.strokeStyle = 'rgba(80,220,255,0.22)';
          g.beginPath();
          g.moveTo(px - 10 + n * 8, py + HH + 2); g.lineTo(px + 4 + n * 8, py + HH + 2);
          g.stroke();
        } else {
          g.strokeStyle = 'rgba(70,200,255,0.07)';
          g.stroke();
          if (t === GROUND && n > 0.93) {
            // Stray street markings.
            g.strokeStyle = 'rgba(255,194,71,0.25)';
            g.beginPath(); g.moveTo(px - 8, py + HH); g.lineTo(px + 8, py + HH); g.stroke();
          }
        }
      }
    }
    this.ground = c;
  }

  private prism(x: number, y: number, w: number, d: number, z0: number, h: number, st: Style, alpha = 1): void {
    const g = this.ctx;
    const ax = isoX(x, y), ay = isoY(x, y) - z0;
    const bx = isoX(x + w, y), by = isoY(x + w, y) - z0;
    const cx = isoX(x + w, y + d), cy = isoY(x + w, y + d) - z0;
    const dx = isoX(x, y + d), dy = isoY(x, y + d) - z0;
    g.globalAlpha = alpha;
    g.fillStyle = st.left;
    g.beginPath(); g.moveTo(dx, dy); g.lineTo(cx, cy); g.lineTo(cx, cy - h); g.lineTo(dx, dy - h); g.closePath(); g.fill();
    g.fillStyle = st.right;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(bx, by); g.lineTo(bx, by - h); g.lineTo(cx, cy - h); g.closePath(); g.fill();
    g.fillStyle = st.top;
    g.beginPath(); g.moveTo(ax, ay - h); g.lineTo(bx, by - h); g.lineTo(cx, cy - h); g.lineTo(dx, dy - h); g.closePath(); g.fill();
    g.strokeStyle = st.accent;
    g.globalAlpha = alpha * 0.55;
    g.lineWidth = 1;
    g.stroke();
    g.globalAlpha = 1;
  }

  /** Dashed rows of lit windows down both visible faces. */
  private windows(x: number, y: number, w: number, d: number, z0: number, h: number, color: string, alpha: number, seed: number): void {
    if (!color || h < 14) return;
    const g = this.ctx;
    const cx = isoX(x + w, y + d), cy = isoY(x + w, y + d) - z0;
    const dx = isoX(x, y + d), dy = isoY(x, y + d) - z0;
    const bx = isoX(x + w, y), by = isoY(x + w, y) - z0;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.globalAlpha = alpha;
    for (let k = 0, zz = 7; zz < h - 3; k++, zz += 8) {
      g.setLineDash([3 + ((seed + k) % 3), 3 + ((seed * 3 + k) % 4)]);
      g.lineDashOffset = (seed * 5 + k * 3) % 9;
      g.beginPath(); g.moveTo(dx + 3, dy - zz + 1.5); g.lineTo(cx - 2, cy - zz - 1); g.stroke();
      g.globalAlpha = alpha * 0.6;
      g.beginPath(); g.moveTo(cx + 2, cy - zz - 1); g.lineTo(bx - 3, by - zz + 1.5); g.stroke();
      g.globalAlpha = alpha;
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  private glow(x: number, y: number, r: number, color: string, alpha = 1): void {
    const g = this.ctx;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  private drawBuilding(s: State, b: Building, v: View, night: number): void {
    const g = this.ctx;
    const def = BUILDINGS[b.kind];
    let st = STYLES[b.kind];
    if (b.faction === 1) st = rivalTint(st);
    else if (b.kind === 'hub' || b.kind === 'turret' || b.kind === 'core') st = { ...st, accent: FACTION_COLOR[0] };
    const size = def.size;
    const pad = 0.1;
    const x = b.x + pad, y = b.y + pad, w = size - pad * 2;
    const built = isBuilt(b);
    const progress = built ? 1 : 1 - b.build / (def.time || 1);
    const alpha = built ? 1 : 0.6;
    const winA = (0.35 + 0.6 * night) * (b.faction === 0 && def.power < 0 ? 0.3 + 0.7 * s.rates.powerRatio : 1);
    const cx = isoX(b.x + size / 2, b.y + size / 2), cy = isoY(b.x + size / 2, b.y + size / 2);
    const t = v.now;

    if (b.kind === 'core') {
      const tier = b.faction === 0 ? s.tier : 2;
      const top = 30 + tier * 10;
      this.prism(x, y, w, w, 0, 44, st, alpha);
      this.windows(x, y, w, w, 0, 44, st.win, winA, b.id);
      this.prism(x + 0.5, y + 0.5, w - 1, w - 1, 44, 40, st, alpha);
      this.windows(x + 0.5, y + 0.5, w - 1, w - 1, 44, 40, st.win, winA, b.id + 1);
      this.prism(x + 1, y + 1, w - 2, w - 2, 84, top, st, alpha);
      this.windows(x + 1, y + 1, w - 2, w - 2, 84, top, st.accent, winA, b.id + 2);
      const tipY = cy - 84 - top;
      g.strokeStyle = st.accent; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, tipY); g.lineTo(cx, tipY - 22); g.stroke();
      this.glow(cx, tipY - 22, 14 + Math.sin(t * 3) * 3, st.accent, 0.9);
      if (b.faction === 0 && s.tierUp > 0) this.progressRing(cx, tipY - 22, 1 - s.tierUp / s.tierTotal, AMBER);
    } else {
      const h = (st.h + (b.level - 1) * 5) * (built ? 1 : Math.max(0.15, progress));
      this.prism(x, y, w, w, 0, h, st, alpha);
      if (built) this.windows(x, y, w, w, 0, h, st.win, winA, b.id);
      const ty = cy - h;
      if (built) switch (b.kind) {
        case 'hab':
          this.prism(x + 0.35, y + 0.35, w - 0.7, w - 0.7, h, 9, st);
          break;
        case 'solar': {
          g.strokeStyle = 'rgba(120,190,255,0.55)'; g.lineWidth = 1;
          for (let i = 1; i < 4; i++) {
            const f = (w * i) / 4;
            g.beginPath(); g.moveTo(isoX(x + f, y), isoY(x + f, y) - h); g.lineTo(isoX(x + f, y + w), isoY(x + f, y + w) - h); g.stroke();
            g.beginPath(); g.moveTo(isoX(x, y + f), isoY(x, y + f) - h); g.lineTo(isoX(x + w, y + f), isoY(x + w, y + f) - h); g.stroke();
          }
          break;
        }
        case 'farm':
          for (const [ox, oy] of [[-14, 0], [14, 0], [0, -7], [0, 7]]) {
            g.fillStyle = st.accent; g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 2 + ox);
            g.beginPath(); g.ellipse(cx + ox, ty + oy, 8, 4, 0, 0, Math.PI * 2); g.fill();
          }
          g.globalAlpha = 1;
          break;
        case 'foundry': {
          this.prism(x + 0.25, y + 0.25, 0.5, 0.5, h, 22, st);
          const sx = isoX(x + 0.5, y + 0.5), sy = isoY(x + 0.5, y + 0.5) - h - 22;
          if (b.workers > 0 || b.faction === 1) {
            this.glow(sx, sy, 10, st.accent, 0.8);
            for (let i = 0; i < 3; i++) {
              const p = (t * 0.5 + i / 3) % 1;
              g.fillStyle = `rgba(150,160,190,${0.3 * (1 - p)})`;
              g.beginPath(); g.arc(sx + p * 8, sy - 6 - p * 26, 3 + p * 6, 0, Math.PI * 2); g.fill();
            }
          }
          break;
        }
        case 'market': {
          const bob = Math.sin(t * 2 + b.id) * 2;
          g.fillStyle = 'rgba(255,216,74,0.18)'; g.strokeStyle = st.accent; g.lineWidth = 1.5;
          g.beginPath(); g.rect(cx - 13, ty - 26 + bob, 26, 14); g.fill(); g.stroke();
          g.fillStyle = st.accent; g.font = 'bold 10px sans-serif'; g.textAlign = 'center';
          g.fillText('¤ ¤ ¤', cx, ty - 16 + bob);
          break;
        }
        case 'vault':
          for (let i = 0; i < 4; i++) {
            const on = Math.sin(t * 4 + i * 1.7 + b.id) > 0;
            g.fillStyle = on ? st.accent : '#3a2f66';
            g.fillRect(cx - 11 + i * 6, ty - 2, 3, 3);
          }
          break;
        case 'plaza': {
          const spin = t * 1.5 + b.id;
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = 'rgba(255,106,213,0.22)';
          g.beginPath(); g.moveTo(cx - 12, ty); g.lineTo(cx, ty - 34); g.lineTo(cx + 12, ty); g.closePath(); g.fill();
          g.strokeStyle = st.accent; g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(cx, ty - 16, 12 + Math.sin(spin) * 3, 5, 0, 0, Math.PI * 2); g.stroke();
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'fusion': {
          const pulse = b.workers > 0 || b.faction === 1 ? 0.75 + 0.25 * Math.sin(t * 5) : 0.25;
          g.fillStyle = '#d8feff'; g.globalAlpha = pulse;
          g.beginPath(); g.arc(cx, ty - 8, 7, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          this.glow(cx, ty - 8, 22, st.accent, pulse);
          break;
        }
        case 'hub': {
          g.strokeStyle = st.accent; g.lineWidth = 2;
          g.beginPath(); g.moveTo(cx - 12, ty + 1); g.lineTo(cx, ty - 5); g.lineTo(cx + 12, ty + 1); g.stroke();
          g.beginPath(); g.moveTo(cx - 12, ty + 7); g.lineTo(cx, ty + 1); g.lineTo(cx + 12, ty + 7); g.stroke();
          if (b.queue.length) this.progressRing(cx, ty - 20, 1 - b.queue[0].t / UNITS[b.queue[0].kind].time, st.accent);
          break;
        }
        case 'turret': {
          const dx = (Math.cos(b.aim) - Math.sin(b.aim)) * HW, dy = (Math.cos(b.aim) + Math.sin(b.aim)) * HH;
          const m = Math.hypot(dx, dy) || 1;
          g.fillStyle = '#3d4a60';
          g.beginPath(); g.ellipse(cx, ty - 5, 8, 6, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = st.accent; g.lineWidth = 3;
          g.beginPath(); g.moveTo(cx, ty - 6); g.lineTo(cx + (dx / m) * 14, ty - 6 + (dy / m) * 14); g.stroke();
          break;
        }
      }
      if (!built) this.progressRing(cx, ty - 14, progress, AMBER);
      else if (b.upgrade > 0) this.progressRing(cx, ty - 26, 1 - b.upgrade / b.upgradeTotal, '#7dff9b');
    }

    const full = maxHp(s, b);
    const top = cy - buildingHeight(b, s.tier) - 12;
    if (built && b.hp < full) this.hpBar(cx, top, 30, b.hp / full, b.faction);
    if (built && b.faction === 0 && def.workers > 0 && b.workers === 0) {
      g.fillStyle = AMBER; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
      g.fillText('NO CREW', cx, top - 4);
    }
  }

  private progressRing(x: number, y: number, p: number, color: string): void {
    const g = this.ctx;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = color;
    g.beginPath(); g.arc(x, y, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, p))); g.stroke();
  }

  private hpBar(x: number, y: number, w: number, frac: number, faction: Faction): void {
    const g = this.ctx;
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    g.fillStyle = frac < 0.35 ? '#ff5252' : FACTION_COLOR[faction];
    g.fillRect(x - w / 2, y, w * Math.max(0, frac), 3);
  }

  private drawUnit(s: State, u: Unit, v: View): void {
    const g = this.ctx;
    const x = isoX(u.x, u.y), y = isoY(u.x, u.y);
    const col = FACTION_COLOR[u.faction];
    const selected = v.selUnits.has(u.id);
    const moving = u.path.length > 0;
    const step = moving ? Math.sin(v.now * 12 + u.id) : 0;
    if (selected) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x, y, u.kind === 'mech' ? 16 : 10, u.kind === 'mech' ? 8 : 5, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(x, y, u.kind === 'mech' ? 11 : 6, u.kind === 'mech' ? 5 : 3, 0, 0, Math.PI * 2); g.fill();
    const right = Math.cos(u.face) - Math.sin(u.face) >= 0 ? 1 : -1;
    let top = y - 20;
    if (u.kind === 'enforcer') {
      g.fillStyle = '#1a2233';
      g.fillRect(x - 3, y - 5 + step, 2.5, 5 - step); g.fillRect(x + 0.5, y - 5 - step, 2.5, 5 + step);
      g.fillStyle = '#2b3852'; g.fillRect(x - 4, y - 13, 8, 9);
      g.fillStyle = col; g.fillRect(x - 4, y - 13, 8, 2);
      g.fillStyle = '#c9d6ea'; g.beginPath(); g.arc(x, y - 16, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.fillRect(x - 2 + right, y - 17, 3, 1.5);
      g.strokeStyle = '#8fa0b8'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + right * 7, y - 9); g.stroke();
    } else if (u.kind === 'drone') {
      const bob = Math.sin(v.now * 4 + u.id) * 2;
      const dy = y - 18 + bob;
      g.fillStyle = '#26324a';
      g.beginPath(); g.moveTo(x - 9, dy); g.lineTo(x, dy - 4); g.lineTo(x + 9, dy); g.lineTo(x, dy + 4); g.closePath(); g.fill();
      g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(x, dy, 2, 0, Math.PI * 2); g.fill();
      this.glow(x, dy, 9, col, 0.5);
      top = dy - 12;
    } else {
      g.fillStyle = '#1a2233';
      g.fillRect(x - 8, y - 9 + step, 5, 9 - step); g.fillRect(x + 3, y - 9 - step, 5, 9 + step);
      g.fillStyle = '#33415c'; g.fillRect(x - 9, y - 24, 18, 16);
      g.fillStyle = col; g.fillRect(x - 9, y - 24, 18, 3);
      g.fillStyle = '#9fe9ff'; g.fillRect(x - 3 + right * 2, y - 19, 6, 3);
      g.strokeStyle = '#8fa0b8'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + right * 9, y - 17); g.lineTo(x + right * 17, y - 15); g.stroke();
      top = y - 32;
    }
    const full = unitMaxHp(s, u.kind, u.faction);
    if (u.hp < full || selected) this.hpBar(x, top - 4, u.kind === 'mech' ? 22 : 14, u.hp / full, u.faction);
  }

  private drawRuin(x: number, y: number, night: number): void {
    const n = hash2(x, y, 11);
    const h = 6 + n * 24;
    const st: Style = { h, top: '#171d30', left: '#10152a', right: '#0b0f20', accent: '#2a3350', win: '' };
    this.prism(x + 0.08, y + 0.08, 0.84, 0.84, 0, h, st);
    if (n > 0.55) {
      const g = this.ctx;
      g.fillStyle = n > 0.8 ? '#ff6ad5' : '#ffc247';
      g.globalAlpha = 0.25 + 0.35 * night;
      g.fillRect(isoX(x + 0.5, y + 0.9) - 4, isoY(x + 0.5, y + 0.9) - h * 0.6, 3, 2);
      g.globalAlpha = 1;
    }
  }

  draw(s: State, v: View): void {
    const g = this.ctx;
    if (this.groundFor !== s.tiles) {
      this.buildGround(s);
      this.groundFor = s.tiles;
    }
    const sun = daylight(s.time);
    const night = 1 - sun;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05070f';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = v.cam.zoom * this.dpr;
    g.setTransform(z, 0, 0, z, (this.width / 2 - v.cam.x * v.cam.zoom) * this.dpr, (this.height / 2 - v.cam.y * v.cam.zoom) * this.dpr);

    g.drawImage(this.ground!, -H * HW, 0);
    if (night > 0.02) {
      g.fillStyle = `rgba(3,4,16,${0.42 * night})`;
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(W * HW, W * HH); g.lineTo((W - H) * HW, (W + H) * HH); g.lineTo(-H * HW, H * HH);
      g.closePath(); g.fill();
    }

    // Visible tile range, with slack for tall buildings.
    const a = this.toTile(v.cam, 0, 0), b = this.toTile(v.cam, this.width, 0);
    const c = this.toTile(v.cam, this.width, this.height + 160 * v.cam.zoom), d = this.toTile(v.cam, 0, this.height + 160 * v.cam.zoom);
    const minX = Math.max(0, Math.floor(Math.min(a.x, d.x)) - 1), maxX = Math.min(W - 1, Math.ceil(Math.max(b.x, c.x)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y)) - 1), maxY = Math.min(H - 1, Math.ceil(Math.max(c.y, d.y)) + 1);

    // Uplink node capture zones sit on the ground.
    for (const n of s.nodes) {
      const nx = isoX(n.x + 0.5, n.y + 0.5), ny = isoY(n.x + 0.5, n.y + 0.5);
      const col = n.owner === -1 ? AMBER : FACTION_COLOR[n.owner];
      g.strokeStyle = col; g.lineWidth = 1.5; g.globalAlpha = 0.5;
      g.setLineDash([6, 6]); g.lineDashOffset = -v.now * 8;
      g.beginPath(); g.ellipse(nx, ny, 2.5 * HW * 1.414, 2.5 * HH * 1.414, 0, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }

    // Placement ghost footprint.
    if (v.ghost) {
      const size = BUILDINGS[v.ghost.kind].size;
      g.fillStyle = v.ghost.ok ? 'rgba(77,255,166,0.35)' : 'rgba(255,82,82,0.4)';
      g.strokeStyle = v.ghost.ok ? '#4dffa6' : '#ff5252';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(isoX(v.ghost.x, v.ghost.y), isoY(v.ghost.x, v.ghost.y));
      g.lineTo(isoX(v.ghost.x + size, v.ghost.y), isoY(v.ghost.x + size, v.ghost.y));
      g.lineTo(isoX(v.ghost.x + size, v.ghost.y + size), isoY(v.ghost.x + size, v.ghost.y + size));
      g.lineTo(isoX(v.ghost.x, v.ghost.y + size), isoY(v.ghost.x, v.ghost.y + size));
      g.closePath(); g.fill(); g.stroke();
    }

    // Selected building footprint and turret range.
    const sel = v.selBuilding ? s.buildings.find(o => o.id === v.selBuilding) : undefined;
    if (sel) {
      const size = BUILDINGS[sel.kind].size;
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(isoX(sel.x, sel.y), isoY(sel.x, sel.y));
      g.lineTo(isoX(sel.x + size, sel.y), isoY(sel.x + size, sel.y));
      g.lineTo(isoX(sel.x + size, sel.y + size), isoY(sel.x + size, sel.y + size));
      g.lineTo(isoX(sel.x, sel.y + size), isoY(sel.x, sel.y + size));
      g.closePath(); g.stroke();
      const atk = BUILDINGS[sel.kind].attack;
      if (atk) {
        const cc = bCenter(sel), r = atk.range + size / 2;
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(isoX(cc.x, cc.y), isoY(cc.x, cc.y), r * HW * 1.414, r * HH * 1.414, 0, 0, Math.PI * 2); g.stroke();
      }
    }

    // Depth-sorted scene.
    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (s.tiles[idx(x, y)] === RUIN) items.push({ depth: x + y + 1, draw: () => this.drawRuin(x, y, night) });
      }
    }
    for (const bl of s.buildings) {
      const size = BUILDINGS[bl.kind].size;
      if (bl.x + size < minX || bl.x > maxX || bl.y + size < minY || bl.y > maxY) continue;
      items.push({ depth: bl.x + bl.y + size, draw: () => this.drawBuilding(s, bl, v, night) });
    }
    for (const n of s.nodes) {
      items.push({ depth: n.x + n.y + 1, draw: () => {
        const nx = isoX(n.x + 0.5, n.y + 0.5), ny = isoY(n.x + 0.5, n.y + 0.5);
        const col = n.owner === -1 ? AMBER : FACTION_COLOR[n.owner];
        this.prism(n.x + 0.35, n.y + 0.35, 0.3, 0.3, 0, 30, { h: 30, top: col, left: '#20283d', right: '#161c2d', accent: col, win: '' });
        this.glow(nx, ny - 34, 12 + Math.sin(v.now * 3 + n.id) * 2, col, 0.9);
        if (Math.abs(n.cap) > 0.01 && Math.abs(n.cap) < 1) this.progressRing(nx, ny - 50, Math.abs(n.cap), FACTION_COLOR[n.cap > 0 ? 0 : 1]);
      } });
    }
    for (const u of s.units) {
      if (u.x < minX - 1 || u.x > maxX + 1 || u.y < minY - 1 || u.y > maxY + 1) continue;
      items.push({ depth: u.x + u.y, draw: () => this.drawUnit(s, u, v) });
    }
    items.sort((p, q) => p.depth - q.depth);
    for (const it of items) it.draw();

    // Ghost building body.
    if (v.ghost) {
      const size = BUILDINGS[v.ghost.kind].size;
      const st = STYLES[v.ghost.kind];
      this.prism(v.ghost.x + 0.1, v.ghost.y + 0.1, size - 0.2, size - 0.2, 0, st.h, { ...st, accent: v.ghost.ok ? '#4dffa6' : '#ff5252' }, 0.5);
    }

    // Effects.
    g.globalCompositeOperation = 'lighter';
    for (const f of s.fx) {
      const col = FACTION_COLOR[f.faction];
      if (f.type === 'shot') {
        g.strokeStyle = col; g.lineWidth = f.big ? 3.5 : 2; g.globalAlpha = Math.min(1, f.t / 0.14);
        g.beginPath(); g.moveTo(isoX(f.x1, f.y1), isoY(f.x1, f.y1) - 12); g.lineTo(isoX(f.x2, f.y2), isoY(f.x2, f.y2) - 10); g.stroke();
        g.globalAlpha = 1;
        this.glow(isoX(f.x2, f.y2), isoY(f.x2, f.y2) - 10, f.big ? 12 : 7, '#ffffff', 0.7);
        g.globalCompositeOperation = 'lighter';
      } else {
        const life = f.big ? 0.7 : 0.35;
        const p = 1 - f.t / life;
        this.glow(isoX(f.x1, f.y1), isoY(f.x1, f.y1) - 8, (f.big ? 70 : 22) * (0.3 + p), '#ffb347', 1 - p);
        g.globalCompositeOperation = 'lighter';
      }
    }
    g.globalCompositeOperation = 'source-over';

    // Screen-space overlays.
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (v.box) {
      g.strokeStyle = '#2ee6ff'; g.fillStyle = 'rgba(46,230,255,0.12)'; g.lineWidth = 1;
      const bx = Math.min(v.box.x0, v.box.x1), by = Math.min(v.box.y0, v.box.y1);
      const bw = Math.abs(v.box.x1 - v.box.x0), bh = Math.abs(v.box.y1 - v.box.y0);
      g.fillRect(bx, by, bw, bh); g.strokeRect(bx, by, bw, bh);
    }
  }
}

export function drawMinimap(canvas: HTMLCanvasElement, s: State): void {
  const g = canvas.getContext('2d')!;
  const k = canvas.width / W;
  g.fillStyle = '#0d1428';
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = s.tiles[idx(x, y)];
      if (t === GROUND) continue;
      g.fillStyle = t === WATER ? '#0c3d5c' : '#222a44';
      g.fillRect(x * k, y * k, k, k);
    }
  }
  for (const n of s.nodes) {
    g.fillStyle = n.owner === -1 ? AMBER : FACTION_COLOR[n.owner];
    g.fillRect((n.x - 0.5) * k, (n.y - 0.5) * k, k * 2, k * 2);
  }
  for (const b of s.buildings) {
    const size = BUILDINGS[b.kind].size;
    g.fillStyle = FACTION_COLOR[b.faction];
    g.fillRect(b.x * k, b.y * k, size * k, size * k);
  }
  g.fillStyle = '#ffffff';
  for (const u of s.units) {
    g.fillStyle = u.faction === 0 ? '#ffffff' : '#ff9cc4';
    g.fillRect(u.x * k - 1, u.y * k - 1, 2.5, 2.5);
  }
}
