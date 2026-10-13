// SPDX-License-Identifier: AGPL-3.0-only
// Cries from same origin files, and a tiny Web Audio synth for ticks and blips. Loading fix, 13 Oct: cries are
// fetched once and decoded into the shared AudioContext (the board's species are preloaded when it is set), so a
// ready cry starts with its event; one that is not ready within CRY_LATE_MS is skipped, never heard late.
import { ASSET_BASE, CRY_VOLUME, SFX_VOLUME } from '../config';
import { whenFree } from '../ui/loader';

export const CRY_LATE_MS = 150; // a cry not ready this long after its event (a select, a faint) is skipped; its file is kept for next time

let ctx: AudioContext | null = null;
let unlocked = false;
const unlockListeners: ((c: AudioContext) => void)[] = [];

/** The shared AudioContext once a gesture has unlocked audio, else null. */
export function audioContext(): AudioContext | null {
  return unlocked ? ctx : null;
}

/** Runs `fn` as soon as audio is unlocked (now, if it already is). */
export function onAudioUnlock(fn: (c: AudioContext) => void): void {
  if (unlocked && ctx) fn(ctx);
  else unlockListeners.push(fn);
}

/** Smoothness (§B21 item 2): building an AudioContext costs over 100 ms on a slow phone. Build it, suspended, in idle
 * time after boot, so the first tap (which may be a move) only resumes it. */
export function prewarmAudio(): void {
  if (ctx || typeof AudioContext === 'undefined') return;
  const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 200));
  idle(() => void context());
}

/** The shared AudioContext, built (suspended) if it is not yet; null where Web Audio is missing. */
function context(): AudioContext | null {
  if (ctx || typeof AudioContext === 'undefined') return ctx;
  try {
    ctx = new AudioContext();
  } catch (err) {
    console.warn('audio context unavailable:', err instanceof Error ? err.message : err);
  }
  return ctx;
}
let blocked = false;
const ext = (() => {
  if (typeof document === 'undefined') return 'ogg';
  const probe = document.createElement('audio');
  return probe.canPlayType('audio/ogg; codecs=vorbis') ? 'ogg' : 'mp3';
})();
const cryUrl = (dex: number) => `${ASSET_BASE}cries/${dex}.${ext}`;

/** Decoded cries, kept for the page's lifetime; 'media' where the file cannot be decoded here (an <audio> plays it). */
const cries = new Map<number, { buffer: AudioBuffer | 'media' | null; ready: Promise<void> }>();

/** Fetches and decodes a cry once (same origin, relative URL; decodeAudioData works while the context is suspended).
 * A network failure forgets it, so a later call tries again. */
function loadCry(dex: number): Promise<void> {
  const known = cries.get(dex);
  if (known) return known.ready;
  const c = context();
  const e: { buffer: AudioBuffer | 'media' | null; ready: Promise<void> } = { buffer: c ? null : 'media', ready: Promise.resolve() };
  cries.set(dex, e);
  if (!c) return e.ready;
  e.ready = fetch(cryUrl(dex))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${cryUrl(dex)} ${r.status}`))))
    .then(
      (data) =>
        c.decodeAudioData(data).then(
          (buf) => void (e.buffer = buf),
          () => void (e.buffer = 'media'),
        ),
      (err: unknown) => {
        console.warn('cry not loaded:', err instanceof Error ? err.message : err);
        cries.delete(dex);
      },
    );
  return e.ready;
}

/** Loads these species' cries ahead of their events, in the loader's priority lane (the board's species, the
 * warm-up's first catch). */
export function preloadCries(dexes: number[]): void {
  for (const dex of new Set(dexes)) if (!cries.has(dex)) whenFree(() => loadCry(dex));
}

/** Audio may play: unlocked, or inside the tap that is about to unlock it (the board hears it before the window). */
const mayPlay = () => unlocked || ((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? false);

export const sound = {
  enabled: true,
  volume: 1,
  /** Called on the first user gesture: browsers only allow audio after one. */
  unlock(): void {
    if (unlocked || typeof AudioContext === 'undefined') return;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch((err: unknown) => console.warn('audio resume failed:', err instanceof Error ? err.message : err));
    unlocked = true;
    blocked = false;
    const c = ctx;
    // The music and the rest start after this frame, so the tap itself stays light.
    window.setTimeout(() => unlockListeners.splice(0).forEach((fn) => fn(c)), 0);
  },
  /** A Pokémon's cry: at once when it is decoded, within CRY_LATE_MS of the call once it arrives, else not at all
   * (still loading for next time). `rate` lowers the pitch (a faint). */
  cry(dex: number, volume = CRY_VOLUME, rate = 1): void {
    if (!this.enabled || blocked || !mayPlay()) return;
    const asked = performance.now();
    const play = () => {
      const buf = cries.get(dex)?.buffer;
      if (!this.enabled || !buf || performance.now() - asked > CRY_LATE_MS) return;
      if (buf === 'media') return this.media(dex, volume, rate);
      if (!unlocked) this.unlock();
      const c = ctx!;
      const src = c.createBufferSource();
      const gain = c.createGain();
      src.buffer = buf;
      src.playbackRate.value = rate;
      gain.gain.value = Math.min(1, volume * this.volume);
      src.connect(gain).connect(c.destination);
      src.start();
    };
    if (cries.get(dex)?.buffer) play();
    else void loadCry(dex).then(play);
  },
  /** Where a cry cannot be decoded into Web Audio: an <audio> element, as before. */
  media(dex: number, volume: number, rate: number): void {
    const el = new Audio(cryUrl(dex));
    el.volume = Math.min(1, volume * this.volume);
    el.preservesPitch = false;
    el.playbackRate = rate;
    el.play().catch((err: unknown) => {
      // Autoplay refused before any gesture: stay quiet until unlock().
      blocked = err instanceof DOMException && err.name === 'NotAllowedError';
    });
  },
  tone(freq: number, ms: number, type: OscillatorType = 'square', slideTo?: number): void {
    if (!this.enabled || !ctx || !unlocked) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + ms / 1000);
    gain.gain.setValueAtTime(Math.max(0.0001, SFX_VOLUME * this.volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + ms / 1000 + 0.02);
  },
  tick(): void {
    this.tone(1400, 18);
  },
  step(): void {
    this.tone(220, 40, 'triangle', 140);
  },
  hit(): void {
    this.tone(160, 120, 'sawtooth', 50);
  },
  sparkle(): void {
    this.tone(880, 160, 'sine', 1760);
  },
  /** A hub tile is chosen (§B16). */
  blip(): void {
    this.tone(1200, 35, 'square', 1500);
  },
  /** A piece is picked up: short rising blip. */
  pickup(): void {
    this.tone(520, 50, 'square', 880);
  },
  /** A piece is put down: soft low thunk. */
  place(): void {
    this.tone(180, 70, 'triangle', 110);
  },
  /** Check: two-tone alarm, twice. */
  alarm(): void {
    [0, 140, 280, 420].forEach((ms, i) => window.setTimeout(() => this.tone(i % 2 ? 660 : 990, 110, 'square'), ms));
  },
  /** One tick of the HP bar draining. */
  hpTick(): void {
    this.tone(1800, 12, 'square');
  },
  /** Castling: two quick hops. */
  castle(): void {
    this.tone(440, 60, 'square', 660);
    window.setTimeout(() => this.tone(660, 80, 'square', 990), 90);
  },
  /** Evolution shimmer: a rising arpeggio. */
  shimmer(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => window.setTimeout(() => this.tone(f, 140, 'triangle', f * 1.01), i * 45));
  },
};
