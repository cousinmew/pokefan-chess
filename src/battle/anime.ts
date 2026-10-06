// SPDX-License-Identifier: AGPL-3.0-only
// Anime battle style (§B18 item 6): original procedural effects only, drawn with additive blending on two canvases.
// Behind the Pokémon: a type coloured speed line backdrop and the attacker's afterimages. In front: glow particles.
import { ANIME } from '../config';
import type { Pt } from './fxRecipes';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export class AnimeLayer {
  private ghosts: Pt[] = [];
  private parts: Particle[] = [];
  private spin = 0;

  reset(): void {
    this.ghosts = [];
    this.parts = [];
    this.spin = 0;
  }

  /** Remaps the effect's progress: normal speed, then a slow beat before the impact. */
  static slowBeat(p: number): number {
    const { slowFrom: f, slowShare: s } = ANIME;
    return p < f ? (p / f) * s : s + ((p - f) / (1 - f)) * (1 - s);
  }

  /** Remembers where the attacker was, for its afterimage trail. */
  trail(at: Pt): void {
    const last = this.ghosts[this.ghosts.length - 1];
    if (last && Math.hypot(last.x - at.x, last.y - at.y) < 2) return;
    this.ghosts.push(at);
    if (this.ghosts.length > ANIME.ghosts) this.ghosts.shift();
  }

  /** A burst of glow particles round the defender at the hit. */
  burst(at: Pt, rnd: () => number): void {
    this.parts = Array.from({ length: ANIME.particles }, () => {
      const a = rnd() * Math.PI * 2;
      const v = 60 + rnd() * 160;
      return { x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + rnd() * 4 };
    });
  }

  /** Backdrop: speed lines toward the defender, turning slowly; `k` 0..1 is how strong. */
  backdrop(ctx: CanvasRenderingContext2D, color: string, focus: Pt, k: number, t: number): void {
    const { width: w, height: h } = ctx.canvas;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * k;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.55 * k;
    ctx.strokeStyle = color;
    this.spin += 0.002;
    const n = ANIME.speedLines;
    const far = Math.hypot(w, h);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.spin + t * 0.6;
      const inner = 40 + ((i * 37) % 30);
      ctx.moveTo(focus.x + Math.cos(a) * inner, focus.y + Math.sin(a) * inner);
      ctx.lineTo(focus.x + Math.cos(a) * far, focus.y + Math.sin(a) * far);
    }
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  /** Afterimages of the attacker's sprite, oldest faintest. */
  afterimages(ctx: CanvasRenderingContext2D, img: CanvasImageSource | null, size: number, mirror: boolean): void {
    if (!img) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.ghosts.forEach((g, i) => {
      ctx.globalAlpha = ((i + 1) / (this.ghosts.length + 1)) * 0.45;
      ctx.save();
      ctx.translate(g.x, g.y);
      if (mirror) ctx.scale(-1, 1);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    });
    ctx.restore();
  }

  /** Glow particles flying out and fading over `p` 0..1. */
  particles(ctx: CanvasRenderingContext2D, color: string, p: number): void {
    if (!this.parts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const s = p * 0.45; // seconds of flight shown over the phase
    for (const q of this.parts) {
      const x = q.x + q.vx * s;
      const y = q.y + q.vy * s + 90 * s * s;
      ctx.globalAlpha = (1 - p) * 0.35;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, q.r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, q.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Counts flash onsets on the battle clock and refuses any that would make more than 3 in 1 s (WCAG 2.3.1). */
export class FlashGuard {
  readonly onsets: number[] = [];

  allow(nowMs: number): boolean {
    const recent = this.onsets.filter((t) => nowMs - t < 1000).length;
    if (recent >= ANIME.maxFlashesPerSec) return false;
    this.onsets.push(nowMs);
    return true;
  }

  /** The most flash onsets in any 1 s window so far. */
  worstSecond(): number {
    return this.onsets.reduce((m, t) => Math.max(m, this.onsets.filter((u) => u >= t && u - t < 1000).length), 0);
  }
}
