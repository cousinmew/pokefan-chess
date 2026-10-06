// SPDX-License-Identifier: AGPL-3.0-only
// The 14 procedural effects (§4.5), each BATTLE.fxMs long, drawn in a 320x288 canvas.
// Sizes are scaled by FX_SCALE so they read at 360x640. Randomness only from the rng passed in.
import { BATTLE, FX_SCALE as K } from '../config';

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
  /** Optional attacker motion during the effect (lunges, dashes, digging). */
  actor?: (t: number, a: Pt, d: Pt) => Actor;
  draw: (ctx: CanvasRenderingContext2D, t: number, a: Pt, d: Pt, rng: () => number) => void;
}

const lerp = (p: Pt, q: Pt, s: number): Pt => ({ x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const INK = '#181818';

/** Filled circle with a dark rim, so effects stay bold on any background. */
const blob = (ctx: CanvasRenderingContext2D, p: Pt, r: number, fill: string) => {
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5 * K;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};
/** Thick line with a dark outline underneath. */
const bold = (ctx: CanvasRenderingContext2D, color: string, width: number, path: () => void) => {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 2 * K;
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  path();
  ctx.stroke();
};
const poly = (ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) => {
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5 * K;
  ctx.beginPath();
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};
const lunge = (k: number) => (t: number, a: Pt, d: Pt): Actor => {
  const s = Math.sin(Math.PI * clamp01(t * 1.4)) * k;
  return { dx: (d.x - a.x) * s, dy: (d.y - a.y) * s };
};
const star = (ctx: CanvasRenderingContext2D, p: Pt, r: number, color: string) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
    pts.push([p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr]);
  }
  poly(ctx, pts, color);
};

export const FX: Record<string, FxRecipe> = {
  bolt: {
    id: 'bolt',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, _a, d, rng) {
      if (Math.floor(t * 12) % 2) return;
      for (let b = 0; b < 3; b++) {
        const pts: Pt[] = [];
        let x = d.x + (rng() - 0.5) * 60 * K;
        pts.push({ x, y: 0 });
        for (let s = 1; s <= 8; s++) {
          x += (d.x - x) / (9 - s) + (rng() - 0.5) * 18 * K;
          pts.push({ x, y: (d.y * s) / 8 });
        }
        bold(ctx, '#f8e030', 3 * K, () => pts.forEach((p) => ctx.lineTo(p.x, p.y)));
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
        p.x += (rng() - 0.5) * 14 * K * s;
        p.y += (rng() - 0.5) * 14 * K * s;
        blob(ctx, p, (3 + 7 * s) * K, i % 3 ? '#f07818' : '#f8d040');
      }
    },
  },
  slam: {
    id: 'slam',
    durationMs: BATTLE.fxMs,
    shakePx: 6 * K,
    actor: lunge(0.6),
    draw(ctx, t, _a, d) {
      if (t < 0.35 || t > 0.85) return;
      const r = (10 + (t - 0.35) * 90) * K;
      bold(ctx, '#ffffff', 4 * K, () => ctx.arc(d.x, d.y, r, 0, Math.PI * 2));
    },
  },
  leaf: {
    id: 'leaf',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, a, d) {
      for (let i = 0; i < 10; i++) {
        const s = clamp01(t * 1.5 - i * 0.05);
        if (s <= 0 || s >= 1) continue;
        const p = lerp(a, d, s);
        const ang = i * 0.7 + t * 14;
        const r = 22 * K * (1 - s);
        const x = p.x + Math.cos(ang) * r;
        const y = p.y + Math.sin(ang) * r;
        const z = 7 * K;
        poly(ctx, [[x + Math.cos(ang) * z, y + Math.sin(ang) * z], [x + Math.cos(ang + 2.4) * z, y + Math.sin(ang + 2.4) * z], [x + Math.cos(ang - 2.4) * z, y + Math.sin(ang - 2.4) * z]], '#38b038');
      }
    },
  },
  water: {
    id: 'water',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, a, d, rng) {
      const head = lerp(a, d, clamp01(t * 2));
      const w = 10 * K * (1 - clamp01((t - 0.6) * 2.5));
      if (w > 0) bold(ctx, '#3070e0', w, () => {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(head.x, head.y);
      });
      if (t > 0.45) for (let i = 0; i < 8; i++) blob(ctx, { x: d.x + (rng() - 0.5) * 50 * K, y: d.y + (rng() - 0.5) * 40 * K }, 3 * K, '#90c0f8');
    },
  },
  stomp: {
    id: 'stomp',
    durationMs: BATTLE.fxMs,
    shakePx: 4 * K,
    draw(ctx, t, _a, d) {
      ctx.globalAlpha = 1 - t;
      bold(ctx, '#c0a070', 6 * K, () => ctx.ellipse(d.x, d.y + 24 * K, (10 + 50 * t) * K, (4 + 12 * t) * K, 0, 0, Math.PI * 2));
      ctx.globalAlpha = 1;
    },
  },
  quick: {
    id: 'quick',
    durationMs: BATTLE.fxMs,
    actor: lunge(0.85),
    draw(ctx, t, a, d, rng) {
      const p = lerp(a, d, Math.sin(Math.PI * t) * 0.85);
      for (let i = 0; i < 6; i++) {
        const y = p.y + (rng() - 0.5) * 50 * K;
        bold(ctx, '#ffffff', 2 * K, () => {
          ctx.moveTo(p.x - 70 * K, y);
          ctx.lineTo(p.x - 20 * K, y);
        });
      }
    },
  },
  horn: {
    id: 'horn',
    durationMs: BATTLE.fxMs,
    actor: lunge(0.6),
    draw(ctx, t, _a, d) {
      if (t > 0.4 && t < 0.9) star(ctx, d, (12 + (t - 0.4) * 50) * K, '#f8f080');
    },
  },
  rockfall: {
    id: 'rockfall',
    durationMs: BATTLE.fxMs,
    shakePx: 3 * K,
    draw(ctx, t, _a, d) {
      for (let i = 0; i < 5; i++) {
        const s = clamp01(t * 1.6 - i * 0.12);
        if (s <= 0) continue;
        const x = d.x + (i - 2) * 20 * K;
        const y = -20 * K + (d.y + 10 * K - (i % 2) * 14 * K + 20 * K) * s;
        const z = K;
        poly(ctx, [[x - 9 * z, y], [x - 3 * z, y - 9 * z], [x + 8 * z, y - 6 * z], [x + 9 * z, y + 5 * z], [x - 4 * z, y + 9 * z]], '#8a7a6a');
      }
    },
  },
  dig: {
    id: 'dig',
    durationMs: BATTLE.fxMs,
    shakePx: 3 * K,
    actor(t, a, d) {
      if (t < 0.35) return { dx: 0, dy: (t / 0.35) * 40, alpha: 1 - t / 0.35 };
      if (t < 0.65) return { dx: 0, dy: 40, alpha: 0 };
      const s = (t - 0.65) / 0.35;
      return { dx: (d.x - a.x) * (1 - s), dy: (d.y - a.y) * (1 - s) + 30 * (1 - s), alpha: s };
    },
    draw(ctx, t, a, d, rng) {
      const at = t < 0.4 ? a : t > 0.65 ? d : null;
      if (!at) return;
      for (let i = 0; i < 10; i++) blob(ctx, { x: at.x + (rng() - 0.5) * 60 * K, y: at.y + (26 - rng() * 20) * K }, 4 * K, '#b08850');
    },
  },
  wrap: {
    id: 'wrap',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, _a, d) {
      for (let i = 0; i < 3; i++) {
        const r = (50 - 30 * t + i * 4) * K * 0.75;
        bold(ctx, '#a048d0', 4 * K, () => ctx.ellipse(d.x, d.y + (i - 1) * 14 * K, r, r * 0.3, 0, 0, Math.PI * 2));
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
          blob(ctx, { x: d.x + (i - 2.5) * 10 * K, y: d.y + (6 - (i % 2) * 10) * K }, 9 * K, '#9050a0');
          continue;
        }
        const p = lerp(a, d, s);
        blob(ctx, { x: p.x, y: p.y - Math.sin(Math.PI * s) * 70 * K }, 6 * K, '#a868c0');
      }
    },
  },
  fang: {
    id: 'fang',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, _a, d) {
      const gap = 30 * K * (1 - clamp01(t * 2));
      for (const dir of [-1, 1]) {
        const y = d.y + dir * (gap + 4 * K);
        poly(ctx, [[d.x - 26 * K, y + dir * 18 * K], [d.x + 26 * K, y + dir * 18 * K], [d.x, y]], '#ffffff');
      }
    },
  },
  slash: {
    id: 'slash',
    durationMs: BATTLE.fxMs,
    draw(ctx, t, _a, d) {
      for (let i = 0; i < 3; i++) {
        const s = clamp01(t * 2.2 - i * 0.25);
        if (s <= 0) continue;
        const x0 = d.x + (i - 1.5) * 16 * K;
        const y0 = d.y - 30 * K;
        bold(ctx, '#ffffff', 3 * K, () => {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + 40 * K * s, y0 + 60 * K * s);
        });
      }
    },
  },
};
