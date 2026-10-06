// SPDX-License-Identifier: AGPL-3.0-only
// Battle screen, Quick mode board effect and evolution, all on one fixed timestep timeline (§4.5).
import { ANIME, BATTLE, HP_TICK_MS, TYPE_COLORS, TYPE_FLASH_ALPHA, TYPE_FLASH_MS, EVOLVE_END_PERIOD_MS, EVOLVE_FLASH_MS, EVOLVE_MS, EVOLVE_START_PERIOD_MS, MAX_FRAME_MS, QUICK_FX_MS } from '../config';
import { MOVES, species, spriteUrl, type SpeciesId } from '../board/pieces';
import { fmt, type Line } from '../game/text';
import type { Rng } from '../game/rng';
import { sound } from '../audio/audio';
import { FX, type FxRecipe, type Pt } from './fxRecipes';
import { resolveMove } from './types';
import type { BattleSprites } from './sprites';
import { AnimeLayer, FlashGuard } from './anime';

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
  /** YELLOW (§B17): no type effectiveness lines. */
  simple = false;
  /** Battle style Anime (§B18 item 6); reduced motion (calm) falls back to Classic. */
  anime = false;
  /** Flash onsets on the battle clock, at most 3 in any second (WCAG 2.3.1). */
  flashes = new FlashGuard();
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
  private readonly bg: HTMLCanvasElement;
  /** Everything the camera moves (Pokémon and effects); the HP bars and text box stay still. */
  private readonly cam: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly layer = new AnimeLayer();
  private style = false;
  private clock = 0;
  private typeColor = '#ffffff';
  private backdropK = 0;
  private sparkP = -1;
  private impact = false;
  private zoom = 0;
  private typeFlash = false;

  constructor(private readonly rng: Rng) {
    this.el = document.createElement('div');
    this.el.className = 'battle';
    this.el.hidden = true;
    this.el.dataset.testid = 'battle';
    this.el.innerHTML = `<div class="screen"><div class="hp hp-far"><span></span></div><div class="hp hp-near"><span></span></div>
      <div class="cam"><canvas class="anime-bg" width="${W}" height="${H}"></canvas><div class="mon def"></div><div class="mon att"></div><canvas class="fx" width="${W}" height="${H}"></canvas></div><div class="anime-banner" data-testid="anime-banner" hidden></div>
      <div class="textbox battle-text"><p class="tb-main" data-testid="battle-text"></p></div></div>`;
    this.screen = this.el.querySelector('.screen') as HTMLElement;
    this.canvas = this.el.querySelector('canvas.fx') as HTMLCanvasElement;
    this.bg = this.el.querySelector('canvas.anime-bg') as HTMLCanvasElement;
    this.banner = this.el.querySelector('.anime-banner') as HTMLElement;
    this.cam = this.el.querySelector('.cam') as HTMLElement;
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

  state(): { phase: string; t: number; style: string } {
    const id = this.running ? (this.phases[this.i]?.id ?? 'done') : 'none';
    return { phase: id, t: Math.round(this.t) / 1000, style: this.style ? 'anime' : 'classic' };
  }

  /** Camera: push in toward the defender plus a shake (Anime only). */
  private camera(shake: number): void {
    const z = this.zoom ? ` scale(${1 + this.zoom})` : '';
    this.cam.style.transform = shake || z ? `translate(${shake}px, 0)${z}` : '';
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
    this.style = this.anime && !this.calm;
    this.layer.reset();
    this.typeColor = TYPE_COLORS[MOVES[mv.moveId]?.type ?? 'normal'] ?? '#ffffff';
    this.cam.style.transformOrigin = `${(dPos.x / W) * 100}% ${(dPos.y / H) * 100}%`;
    const ko = (p: number) => {
      // Anime KO: a bigger exit, spinning up and away.
      const spin = `translate(-50%, -50%) rotate(${p * ANIME.koSpinDeg}deg) scale(${1 + p * ANIME.koScale})`;
      this.def.style.transform = spin;
      this.place(this.def, dPos, (attackerNear ? 1 : -1) * p * 120, -p * 160, 1 - p);
    };
    const phases: Phase[] = [
      {
        id: 'in',
        ms: BATTLE.inMs,
        enter: () => {
          this.el.hidden = false;
          this.setSprite(this.att, (attackerNear ? sprites?.near : sprites?.far) ?? spriteUrl(a.dex, view(attackerNear), a.shiny));
          this.setSprite(this.def, (attackerNear ? sprites?.far : sprites?.near) ?? spriteUrl(d.dex, view(!attackerNear), d.shiny));
          this.att.hidden = false;
          this.def.className = 'mon def';
          this.att.classList.toggle('mirror', attackerNear && (sprites?.mirrorNear ?? false));
          // Stars (§B12): a coloured aura round that Pokémon in battle.
          this.att.dataset.stars = String(a.stars ?? 0);
          this.def.dataset.stars = String(d.stars ?? 0);
          this.def.classList.toggle('mirror', !attackerNear && (sprites?.mirrorNear ?? false));
          this.setHp(hpA, 1);
          this.setHp(hpD, 1);
          this.textEl.textContent = '';
        },
        tick: (p) => {
          this.el.style.opacity = '1';
          if (this.style) this.backdropK = p * 0.4;
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
          if (this.style) {
            this.backdropK = 0.4 + 0.3 * p;
            this.zoom = ANIME.zoom * 0.4 * p;
            this.camera(0);
          }
        },
      },
      {
        id: 'fx',
        ms: recipe.durationMs,
        enter: () => {
          this.textEl.textContent = usedText;
          this.fx = recipe;
          this.flashColor = this.typeColor;
          this.typeFlash = !this.calm && this.flashes.allow(this.clock);
        },
        tick: (p) => {
          // Anime: the effect slows down just before it lands.
          const q = this.style ? AnimeLayer.slowBeat(p) : p;
          this.fxT = q;
          const act = recipe.actor?.(q, aPos, dPos);
          const dx = act?.dx ?? 0;
          const dy = act?.dy ?? 0;
          this.place(this.att, aPos, dx, dy, act?.alpha ?? 1);
          const shake = this.calm ? 0 : (recipe.shakePx ?? 0) * Math.sin(p * 60) * (1 - p);
          if (this.style) {
            this.backdropK = 0.7 + 0.3 * p;
            this.zoom = ANIME.zoom * (0.4 + 0.6 * p);
            this.layer.trail({ x: aPos.x + dx, y: aPos.y + dy });
            // Squash and stretch along the lunge.
            const v = Math.min(1, Math.hypot(dx, dy) / 60);
            this.att.style.transform = `translate(-50%, -50%) scale(${1 + 0.25 * v}, ${1 - 0.2 * v})`;
          }
          this.camera(shake);
          // Type tinted flash for the first TYPE_FLASH_MS of the effect; none under reduced motion.
          const ms = p * recipe.durationMs;
          this.flash = this.typeFlash && ms < TYPE_FLASH_MS ? TYPE_FLASH_ALPHA * (1 - ms / TYPE_FLASH_MS) : 0;
        },
      },
      {
        id: 'flash',
        ms: BATTLE.flashMs,
        enter: () => {
          this.fx = null;
          this.flash = 0;
          this.camera(0);
          this.place(this.att, aPos, 0, 0);
          this.att.style.transform = '';
          sound.hit();
          if (!this.style) return;
          // One impact frame (dark silhouettes on white), then glow particles; it counts as a flash.
          this.impact = this.flashes.allow(this.clock);
          this.screen.classList.toggle('impact', this.impact);
          this.layer.burst(dPos, () => this.rng.next());
          this.sparkP = 0;
        },
        tick: (p) => {
          if (this.style) {
            // No blinking in Anime: the hit shakes the camera instead (fewer flashes).
            this.sparkP = p * 0.5;
            return this.camera(ANIME.shakePx * Math.sin(p * 40) * (1 - p));
          }
          const half = Math.floor(p * BATTLE.flashCount * 2);
          this.def.style.visibility = half % 2 === 0 && p < 1 && !this.calm ? 'hidden' : 'visible';
        },
      },
      {
        id: 'drain',
        ms: BATTLE.drainMs,
        enter: () => (this.def.style.visibility = 'visible'),
        tick: (p, dt) => {
          if (this.style) this.sparkP = 0.5 + p * 0.5;
          this.setHp(hpD, 1 - p);
          drained += dt;
          if (drained >= HP_TICK_MS) {
            drained = 0;
            sound.hpTick();
          }
        },
      },
    ];
    const banner = () => {
      // Anime: a combo style banner slams in for super effective hits.
      if (!this.style || mv.effKey !== 'battle.super') return;
      this.banner.textContent = fmt('anime.super');
      this.banner.hidden = false;
    };
    if (mv.effKey && !this.simple) phases.push({ id: 'eff', ms: BATTLE.effMs, enter: () => (this.say({ key: mv.effKey! }), banner()) });
    phases.push(
      {
        id: 'faint',
        ms: BATTLE.faintMs,
        enter: () => {
          this.say({ key: 'battle.fainted', vars: { defender: d.name } });
          sound.cry(d.dex, undefined, BATTLE.faintPitch);
          this.sparkP = -1;
          this.backdropK = this.style ? 0.4 : 0;
        },
        tick: (p) => (this.style ? ko(p) : this.place(this.def, dPos, 0, p * 70, 1 - p)),
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
          this.typeFlash = !this.calm && this.flashes.allow(this.clock);
        },
        tick: (p) => {
          this.flashColor = '#ffffff';
          this.flash = this.typeFlash ? 1 - p : 0;
        },
      },
    ]).then(() => {
      this.lines.push({ key: 'evolve.done', vars: { pawn: from.name, piece: to.name } });
    });
  }

  /** Advances the timeline by dt ms. The rAF loop and the harness both drive it through here. */
  update(dt: number): void {
    if (!this.running) return;
    this.clock += dt;
    // The impact frame lasts exactly one frame.
    if (this.impact && this.phases[this.i]?.id === 'flash' && this.t > 0) {
      this.impact = false;
      this.screen.classList.remove('impact');
    }
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
    this.clock = 0;
    this.flashes = new FlashGuard();
    this.backdropK = 0;
    this.sparkP = -1;
    this.zoom = 0;
    if (kind !== 'battle') this.style = false;
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
    this.cam.style.transform = '';
    this.screen.classList.remove('impact');
    this.impact = false;
    this.banner.hidden = true;
    this.att.style.transform = '';
    this.def.style.transform = '';
    this.bg.getContext('2d')?.clearRect(0, 0, W, H);
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
    if (this.style && !quick) this.renderAnime(ctx);
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
    }
  }

  /** Anime layers: backdrop and afterimages behind the Pokémon, glow particles in front. */
  private renderAnime(fg: CanvasRenderingContext2D): void {
    const bg = this.bg.getContext('2d');
    if (!bg) return;
    bg.clearRect(0, 0, W, H);
    if (this.backdropK > 0) this.layer.backdrop(bg, this.typeColor, this.bd, this.backdropK, this.clock / 1000);
    if (this.phases[this.i]?.id === 'fx') this.layer.afterimages(bg, this.att.querySelector('img'), W * 0.34, this.att.classList.contains('mirror'));
    if (this.sparkP >= 0) this.layer.particles(fg, this.typeColor, this.sparkP);
  }
}
