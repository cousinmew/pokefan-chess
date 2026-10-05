// SPDX-License-Identifier: AGPL-3.0-only
// The 14 procedural effects (§4.5), each BATTLE.fxMs long. Drawn in a 320x288 canvas. Randomness only from the rng passed in.
import { BATTLE } from '../config';

export interface Pt {
  x: number;
  y: number;
}
export interface Actor {
  dx: number;
  dy: number;
  alpha?: number;
}
export interface FxRecipe {
  id: string;
  durationMs: number;
  shakePx?: number;
  flashColor?: string;
  /** Optional attacker motion during the effect (lunges, dashes, digging). */
  actor?: (t: number, a: Pt, d: Pt) => Actor;
  draw: (ctx: CanvasRenderingContext2D, t: number, a: Pt, d: Pt, rng: () => number) => void;
}

const lerp = (p: Pt, q: Pt, s: number): Pt => ({ x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const circle = (ctx: CanvasRenderingContext2D, p: Pt, r: number, fill: string) => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
};
const lunge = (k: number) => (t: number, a: Pt, d: Pt): Actor => {
  const s = Math.sin(Math.PI * clamp01(t * 1.4)) * k;
  return { dx: (d.x - a.x) * s, dy: (d.y - a.y) * s };
};
const star = (ctx: CanvasRenderingContext2D, p: Pt, r: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
  }
  ctx.fill();
};

export const FX: Record<string, FxRecipe> = {
  bolt: {
    id: 'bolt',
    durationMs: BATTLE.fxMs,
    flashColor: '#ffffff',
    draw(ctx, t, _a, d, rng) {
      if (Math.floor(t * 12) % 2) return;
      ctx.strokeStyle = '#f8e030';
      ctx.lineWidth = 3;
      for (let b = 0; b < 3; b++) {
        ctx.beginPath();
        let x = d.x + (rng() - 0.5) * 80;
        ctx.moveTo(x, 0);
        for (let s = 1; s <= 8; s++) {
          x += (d.x - x) / (9 - s) + (rng() - 0.5) * 18;
          ctx.lineTo(x, (d.y * s) / 8);
        }
        ctx.stroke();
      }
    },
  },
  flame: {
    id: 'flame',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, a, d, rng) {
      for (let i = 0; i < 24; i++) {
        const s = t * 1.6 - i / 24;
        if (s <= 0 || s >= 1) continue;
        const p = lerp(a, d, s);
        p.x += (rng() - 0.5) * 14 * s;
        p.y += (rng() - 0.5) * 14 * s;
        circle(ctx, p, 3 + 7 * s, i % 3 ? '#f08020' : '#f8d040');
      }
    },
  },
  slam: {
    id: 'slam',
    durationMs: BATTLE.fxMs,
    shakePx: 6,
    actor: lunge(0.6),
    draw(ctx, t, _a, d) {
      if (t < 0.35 || t > 0.8) return;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 10 + (t - 0.35) * 90, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  leaf: {
    id: 'leaf',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, a, d) {
      ctx.fillStyle = '#40b040';
      for (let i = 0; i < 10; i++) {
        const s = clamp01(t * 1.5 - i * 0.05);
        if (s <= 0 || s >= 1) continue;
        const p = lerp(a, d, s);
        const ang = i * 0.7 + t * 14;
        const r = 22 * (1 - s);
        const x = p.x + Math.cos(ang) * r;
        const y = p.y + Math.sin(ang) * r;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * 6, y + Math.sin(ang) * 6);
        ctx.lineTo(x + Math.cos(ang + 2.4) * 6, y + Math.sin(ang + 2.4) * 6);
        ctx.lineTo(x + Math.cos(ang - 2.4) * 6, y + Math.sin(ang - 2.4) * 6);
        ctx.fill();
      }
    },
  },
  water: {
    id: 'water',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, a, d, rng) {
      const head = lerp(a, d, clamp01(t * 2));
      ctx.strokeStyle = '#3070e0';
      ctx.lineWidth = 10 * (1 - clamp01((t - 0.6) * 2.5));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
      if (t > 0.45) for (let i = 0; i < 8; i++) circle(ctx, { x: d.x + (rng() - 0.5) * 50, y: d.y + (rng() - 0.5) * 40 }, 3, '#90c0f8');
    },
  },
  stomp: {
    id: 'stomp',
    durationMs: BATTLE.fxMs,
    shakePx: 4,
    draw(ctx, t, _a, d) {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#b09060';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + 24, 10 + 60 * t, 4 + 14 * t, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
  quick: {
    id: 'quick',
    durationMs: BATTLE.fxMs,
    actor: lunge(0.85),
    draw(ctx, t, a, d, rng) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const p = lerp(a, d, Math.sin(Math.PI * t) * 0.85);
      for (let i = 0; i < 6; i++) {
        const y = p.y + (rng() - 0.5) * 50;
        ctx.beginPath();
        ctx.moveTo(p.x - 70, y);
        ctx.lineTo(p.x - 20, y);
        ctx.stroke();
      }
    },
  },
  horn: {
    id: 'horn',
    durationMs: BATTLE.fxMs,
    actor: lunge(0.6),
    draw(ctx, t, _a, d) {
      if (t > 0.4 && t < 0.85) star(ctx, d, 12 + (t - 0.4) * 50, '#f8f080');
    },
  },
  rockfall: {
    id: 'rockfall',
    durationMs: BATTLE.fxMs,
    shakePx: 3,
    draw(ctx, t, _a, d) {
      ctx.fillStyle = '#808080';
      for (let i = 0; i < 5; i++) {
        const s = clamp01(t * 1.6 - i * 0.12);
        if (s <= 0) continue;
        const x = d.x - 40 + i * 20;
        const y = -20 + (d.y + 10 - (i % 2) * 14 + 20) * s;
        ctx.beginPath();
        ctx.moveTo(x - 9, y);
        ctx.lineTo(x - 3, y - 9);
        ctx.lineTo(x + 8, y - 6);
        ctx.lineTo(x + 9, y + 5);
        ctx.lineTo(x - 4, y + 9);
        ctx.fill();
      }
    },
  },
  dig: {
    id: 'dig',
    durationMs: BATTLE.fxMs,
    shakePx: 3,
    actor(t, a, d) {
      if (t < 0.35) return { dx: 0, dy: (t / 0.35) * 40, alpha: 1 - t / 0.35 };
      if (t < 0.65) return { dx: 0, dy: 40, alpha: 0 };
      const s = (t - 0.65) / 0.35;
      return { dx: (d.x - a.x) * (1 - s), dy: (d.y - a.y) * (1 - s) + 30 * (1 - s), alpha: s };
    },
    draw(ctx, t, a, d, rng) {
      const at = t < 0.4 ? a : t > 0.65 ? d : null;
      if (!at) return;
      for (let i = 0; i < 10; i++) circle(ctx, { x: at.x + (rng() - 0.5) * 60, y: at.y + 26 - rng() * 20 }, 4, '#a08050');
    },
  },
  wrap: {
    id: 'wrap',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, _a, d) {
      ctx.strokeStyle = '#9040c0';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const r = 50 - 30 * t + i * 4;
        ctx.beginPath();
        ctx.ellipse(d.x, d.y - 14 + i * 14, r, r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  },
  sludge: {
    id: 'sludge',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, a, d) {
      for (let i = 0; i < 6; i++) {
        const s = clamp01(t * 1.6 - i * 0.1);
        if (s <= 0) continue;
        if (s >= 1) {
          circle(ctx, { x: d.x - 25 + i * 10, y: d.y + 6 - (i % 2) * 10 }, 9, '#9050a0');
          continue;
        }
        const p = lerp(a, d, s);
        circle(ctx, { x: p.x, y: p.y - Math.sin(Math.PI * s) * 70 }, 6, '#a060b0');
      }
    },
  },
  fang: {
    id: 'fang',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, _a, d) {
      const gap = 36 * (1 - clamp01(t * 2));
      ctx.fillStyle = '#ffffff';
      for (const dir of [-1, 1]) {
        const y = d.y + dir * (gap + 4);
        ctx.beginPath();
        ctx.moveTo(d.x - 26, y + dir * 18);
        ctx.lineTo(d.x + 26, y + dir * 18);
        ctx.lineTo(d.x, y);
        ctx.fill();
      }
    },
  },
  slash: {
    id: 'slash',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, _a, d) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const s = clamp01(t * 2.2 - i * 0.25);
        if (s <= 0) continue;
        const x0 = d.x - 30 + i * 16;
        const y0 = d.y - 30;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + 40 * s, y0 + 60 * s);
        ctx.stroke();
      }
    },
  },
};
