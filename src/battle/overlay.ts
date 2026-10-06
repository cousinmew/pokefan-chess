// SPDX-License-Identifier: AGPL-3.0-only
// Battle screen, Quick mode board effect and evolution, all on one fixed timestep timeline (§4.5).
import { BATTLE, HP_TICK_MS, TYPE_COLORS, TYPE_FLASH_ALPHA, TYPE_FLASH_MS, EVOLVE_END_PERIOD_MS, EVOLVE_FLASH_MS, EVOLVE_MS, EVOLVE_START_PERIOD_MS, MAX_FRAME_MS, QUICK_FX_MS } from '../config';
import { species, spriteUrl, type SpeciesId } from '../board/pieces';
import { fmt, type Line } from '../game/text';
import type { Rng } from '../game/rng';
import { sound } from '../audio/audio';
import { FX, type FxRecipe, type Pt } from './fxRecipes';
import { resolveMove } from './types';
import roster from '../data/roster.gen1.json';
import type { BattleSprites } from './sprites';

const W = 320;
const H = 288;
// Gen 1 layout: the player's Pokémon near (bottom left, seen from behind), the opponent's far (top right).
const NEAR: Pt = { x: 84, y: 168 };
const FAR: Pt = { x: 236, y: 84 };

interface Phase {
  id: string;
  ms: number;
  enter?: () => void;
  tick?: (p: number, dt: number) => void;
}

export type OverlayKind = 'none' | 'battle' | 'quick' | 'evolve';

export class Overlay {
  readonly el: HTMLElement;
  manual = false;
  /** prefers-reduced-motion: no screen shake and no flashes, the battle still plays. */
  calm = false;
  kind: OverlayKind = 'none';
  lines: Line[] = [];
  sig = 0;
  private readonly screen: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly quickCanvas: HTMLCanvasElement;
  private readonly att: HTMLElement;
  private readonly def: HTMLElement;
  private readonly hpNear: HTMLElement;
  private readonly hpFar: HTMLElement;
  private readonly textEl: HTMLElement;
  private phases: Phase[] = [];
  private i = 0;
  private t = 0;
  private last = 0;
  private resolve: (() => void) | null = null;
  private fx: FxRecipe | null = null;
  private fxT = -1;
  private flash = 0;
  private flashColor = '#ffffff';
  private qa: Pt = { x: 0, y: 0 };
  private qd: Pt = { x: 0, y: 0 };
  private ba: Pt = NEAR;
  private bd: Pt = FAR;

  constructor(private readonly rng: Rng) {
    this.el = document.createElement('div');
    this.el.className = 'battle';
    this.el.hidden = true;
    this.el.dataset.testid = 'battle';
    this.el.innerHTML = `<div class="screen"><div class="hp hp-far"><span></span></div><div class="hp hp-near"><span></span></div>
      <div class="mon def"></div><div class="mon att"></div><canvas width="${W}" height="${H}"></canvas>
      <div class="textbox battle-text"><p class="tb-main" data-testid="battle-text"></p></div></div>`;
    this.screen = this.el.querySelector('.screen') as HTMLElement;
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement;
    this.att = this.el.querySelector('.att') as HTMLElement;
    this.def = this.el.querySelector('.def') as HTMLElement;
    this.hpNear = this.el.querySelector('.hp-near span') as HTMLElement;
    this.hpFar = this.el.querySelector('.hp-far span') as HTMLElement;
    this.textEl = this.el.querySelector('.battle-text p') as HTMLElement;
    this.quickCanvas = document.createElement('canvas');
    this.quickCanvas.className = 'quick-fx';
    this.quickCanvas.hidden = true;
    document.body.append(this.quickCanvas);
    const skipper = (e: Event) => {
      if (this.kind === 'none') return;
      e.stopPropagation();
      e.preventDefault();
      this.skip();
    };
    window.addEventListener('pointerdown', skipper, true);
    window.addEventListener('keydown', skipper, true);
  }

  get running(): boolean {
    return this.kind !== 'none';
  }

  state(): { phase: string; t: number } {
    const id = this.running ? (this.phases[this.i]?.id ?? 'done') : 'none';
    return { phase: id, t: Math.round(this.t) / 1000 };
  }

  /** Full battle screen for one capture. `attackerNear`: the attacker is the player's Pokémon. Resolves once the board may apply it. */
  battle(attacker: SpeciesId, defender: SpeciesId, fxOverride?: string, sprites?: BattleSprites, attackerNear = true): Promise<void> {
    const a = species(attacker);
    const d = species(defender);
    const mv = resolveMove(a, d);
    const recipe = FX[fxOverride ?? mv.fx];
    if (!recipe) throw new Error(`no fx recipe ${mv.fx}`);
    const used: Line = { key: 'battle.used', vars: { attacker: a.name, move: mv.name } };
    const usedText = fmt(used.key, used.vars);
    let shown = 0;
    let drained = HP_TICK_MS;
    const aPos = attackerNear ? NEAR : FAR;
    const dPos = attackerNear ? FAR : NEAR;
    const hpA = attackerNear ? this.hpNear : this.hpFar;
    const hpD = attackerNear ? this.hpFar : this.hpNear;
    const view = (near: boolean) => (near ? 'back' : 'front');
    this.ba = aPos;
    this.bd = dPos;
    const phases: Phase[] = [
      {
        id: 'in',
        ms: BATTLE.inMs,
        enter: () => {
          this.el.hidden = false;
          this.setSprite(this.att, (attackerNear ? sprites?.near : sprites?.far) ?? spriteUrl(a.dex, view(attackerNear)));
          this.setSprite(this.def, (attackerNear ? sprites?.far : sprites?.near) ?? spriteUrl(d.dex, view(!attackerNear)));
          this.att.hidden = false;
          this.def.className = 'mon def';
          this.att.classList.toggle('mirror', attackerNear && (sprites?.mirrorNear ?? false));
          this.def.classList.toggle('mirror', !attackerNear && (sprites?.mirrorNear ?? false));
          this.setHp(hpA, 1);
          this.setHp(hpD, 1);
          this.textEl.textContent = '';
        },
        tick: (p) => {
          this.el.style.opacity = '1';
          this.screen.style.setProperty('--dim', String(p));
          const slide = (near: boolean) => (near ? -1 : 1) * (1 - p) * 180;
          this.place(this.att, aPos, slide(attackerNear), 0);
          this.place(this.def, dPos, slide(!attackerNear), 0);
        },
      },
      {
        id: 'used',
        ms: BATTLE.usedMs,
        enter: () => this.say(used),
        tick: (p) => {
          const n = Math.ceil(usedText.length * Math.min(1, p * 1.4));
          if (Math.floor(n / BATTLE.tickEveryChars) > Math.floor(shown / BATTLE.tickEveryChars)) sound.tick();
          shown = n;
          this.textEl.textContent = usedText.slice(0, n);
        },
      },
      {
        id: 'fx',
        ms: recipe.durationMs,
        enter: () => {
          this.textEl.textContent = usedText;
          this.fx = recipe;
          this.flashColor = TYPE_COLORS[roster.moves[mv.moveId].type] ?? '#ffffff';
        },
        tick: (p) => {
          this.fxT = p;
          const act = recipe.actor?.(p, aPos, dPos);
          this.place(this.att, aPos, act?.dx ?? 0, act?.dy ?? 0, act?.alpha ?? 1);
          const shake = this.calm ? 0 : (recipe.shakePx ?? 0) * Math.sin(p * 60) * (1 - p);
          this.screen.style.transform = shake ? `translate(${shake}px, 0)` : '';
          // Type tinted flash for the first TYPE_FLASH_MS of the effect; none under reduced motion.
          const ms = p * recipe.durationMs;
          this.flash = !this.calm && ms < TYPE_FLASH_MS ? TYPE_FLASH_ALPHA * (1 - ms / TYPE_FLASH_MS) : 0;
        },
      },
      {
        id: 'flash',
        ms: BATTLE.flashMs,
        enter: () => {
          this.fx = null;
          this.flash = 0;
          this.screen.style.transform = '';
          this.place(this.att, aPos, 0, 0);
          sound.hit();
        },
        tick: (p) => {
          const half = Math.floor(p * BATTLE.flashCount * 2);
          this.def.style.visibility = half % 2 === 0 && p < 1 && !this.calm ? 'hidden' : 'visible';
        },
      },
      {
        id: 'drain',
        ms: BATTLE.drainMs,
        enter: () => (this.def.style.visibility = 'visible'),
        tick: (p, dt) => {
          this.setHp(hpD, 1 - p);
          drained += dt;
          if (drained >= HP_TICK_MS) {
            drained = 0;
            sound.hpTick();
          }
        },
      },
    ];
    if (mv.effKey) phases.push({ id: 'eff', ms: BATTLE.effMs, enter: () => this.say({ key: mv.effKey! }) });
    phases.push(
      {
        id: 'faint',
        ms: BATTLE.faintMs,
        enter: () => {
          this.say({ key: 'battle.fainted', vars: { defender: d.name } });
          sound.cry(d.dex, undefined, BATTLE.faintPitch);
        },
        tick: (p) => this.place(this.def, dPos, 0, p * 70, 1 - p),
      },
      { id: 'out', ms: BATTLE.outMs, tick: (p) => (this.el.style.opacity = String(1 - p)) },
    );
    return this.start('battle', phases);
  }

  /** Quick mode: the effect plays over the defender's board square, no battle screen. */
  quick(board: HTMLElement, from: string, to: string, attacker: SpeciesId, defender: SpeciesId): Promise<void> {
    const recipe = FX[resolveMove(attacker, defender).fx];
    if (!recipe) return Promise.resolve();
    const r = board.getBoundingClientRect();
    const c = this.quickCanvas;
    Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    c.width = W;
    c.height = Math.round((W * r.height) / Math.max(1, r.width));
    const centre = (sq: string): Pt => {
      const cell = board.querySelector<HTMLElement>(`[data-square="${sq}"]`)?.getBoundingClientRect();
      if (!cell) return { x: W / 2, y: c.height / 2 };
      const k = W / Math.max(1, r.width);
      return { x: (cell.left - r.left + cell.width / 2) * k, y: (cell.top - r.top + cell.height / 2) * k };
    };
    this.qa = centre(from);
    this.qd = centre(to);
    return this.start('quick', [
      {
        id: 'quick',
        ms: QUICK_FX_MS,
        enter: () => {
          c.hidden = false;
          this.fx = recipe;
        },
        tick: (p) => (this.fxT = p),
      },
    ]);
  }

  /** Evolution: silhouette swaps between pawn and target with an accelerating period, then a flash. */
  evolve(pawn: SpeciesId, into: SpeciesId): Promise<void> {
    const from = species(pawn);
    const to = species(into);
    let acc = 0;
    let showTarget = false;
    return this.start('evolve', [
      {
        id: 'evolve',
        ms: EVOLVE_MS - EVOLVE_FLASH_MS,
        enter: () => {
          this.el.hidden = false;
          this.el.style.opacity = '1';
          this.screen.style.setProperty('--dim', '1');
          this.att.hidden = true;
          this.setHp(this.hpNear, -1);
          this.setHp(this.hpFar, -1);
          this.def.className = 'mon def evo';
          this.def.style.visibility = 'visible';
          this.setSprite(this.def, spriteUrl(from.dex, 'front'));
          this.place(this.def, { x: W / 2, y: 110 }, 0, 0);
          this.say({ key: 'evolve.start', vars: { pawn: from.name } });
          sound.cry(from.dex);
        },
        tick: (p, dt) => {
          acc += dt;
          const period = EVOLVE_START_PERIOD_MS + (EVOLVE_END_PERIOD_MS - EVOLVE_START_PERIOD_MS) * p;
          if (acc >= period) {
            acc = 0;
            showTarget = !showTarget;
            this.setSprite(this.def, spriteUrl((showTarget ? to : from).dex, 'front'));
          }
        },
      },
      {
        id: 'evolve-flash',
        ms: EVOLVE_FLASH_MS,
        enter: () => {
          this.setSprite(this.def, spriteUrl(to.dex, 'front'));
          this.def.className = 'mon def';
          sound.shimmer();
        },
        tick: (p) => {
          this.flashColor = '#ffffff';
          this.flash = this.calm ? 0 : 1 - p;
        },
      },
    ]).then(() => {
      this.lines.push({ key: 'evolve.done', vars: { pawn: from.name, piece: to.name } });
    });
  }

  /** Advances the timeline by dt ms. The rAF loop and the harness both drive it through here. */
  update(dt: number): void {
    if (!this.running) return;
    let left = dt;
    while (this.running) {
      const ph = this.phases[this.i];
      if (!ph) return this.finish();
      const step = Math.min(left, ph.ms - this.t);
      this.t += step;
      left -= step;
      ph.tick?.(ph.ms ? this.t / ph.ms : 1, step);
      if (this.t < ph.ms) break;
      this.i++;
      this.t = 0;
      if (this.i >= this.phases.length) return this.finish();
      this.phases[this.i]?.enter?.();
    }
    this.render();
  }

  /** Jumps to the end at once (T-5). */
  skip(): void {
    if (this.running) this.finish();
  }

  private start(kind: OverlayKind, phases: Phase[]): Promise<void> {
    if (this.running) this.finish();
    this.kind = kind;
    this.phases = phases;
    this.i = 0;
    this.t = 0;
    this.flash = 0;
    this.fx = null;
    this.fxT = -1;
    phases[0]?.enter?.();
    const done = new Promise<void>((res) => (this.resolve = res));
    if (!this.manual) {
      this.last = performance.now();
      requestAnimationFrame((now) => this.loop(now));
    }
    return done;
  }

  private loop(now: number): void {
    if (!this.running || this.manual) return;
    this.update(Math.min(MAX_FRAME_MS, Math.max(0, now - this.last)));
    this.last = now;
    if (this.running) requestAnimationFrame((n) => this.loop(n));
  }

  private finish(): void {
    this.kind = 'none';
    this.fx = null;
    this.flash = 0;
    this.el.hidden = true;
    this.quickCanvas.hidden = true;
    this.screen.style.transform = '';
    const res = this.resolve;
    this.resolve = null;
    res?.();
  }

  private say(line: Line): void {
    this.lines.push(line);
    this.textEl.textContent = fmt(line.key, line.vars);
  }

  /** Puts a sprite in a slot: a preloaded, decoded element when we have one, else a plain img by URL. */
  private setSprite(slot: HTMLElement, src: string | HTMLImageElement): void {
    let img: HTMLImageElement;
    if (typeof src === 'string') {
      img = slot.querySelector<HTMLImageElement>('img.plain') ?? Object.assign(document.createElement('img'), { className: 'plain', alt: '' });
      if (img.getAttribute('src') !== src) img.src = src;
    } else {
      img = src;
    }
    if (slot.firstElementChild !== img) slot.replaceChildren(img);
  }

  private setHp(bar: HTMLElement, frac: number): void {
    const wrap = bar.parentElement as HTMLElement;
    wrap.hidden = frac < 0;
    bar.style.width = `${Math.max(0, frac) * 100}%`;
    bar.style.background = frac > 0.5 ? '#40c040' : frac > 0.2 ? '#e0c020' : '#e03030';
  }

  private place(img: HTMLElement, at: Pt, dx: number, dy: number, alpha = 1): void {
    img.style.left = `${((at.x + dx) / W) * 100}%`;
    img.style.top = `${((at.y + dy) / H) * 100}%`;
    img.style.opacity = String(alpha);
  }

  private render(): void {
    const quick = this.kind === 'quick';
    const c = quick ? this.quickCanvas : this.canvas;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (this.fx && this.fxT >= 0) {
      const rnd = () => {
        const v = this.rng.next();
        this.sig = (this.sig * 31 + Math.floor(v * 1e6)) % 1_000_000_007;
        return v;
      };
      ctx.save();
      this.fx.draw(ctx, this.fxT, quick ? this.qa : this.ba, quick ? this.qd : this.bd, rnd);
      ctx.restore();
    }
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
    }
  }
}
