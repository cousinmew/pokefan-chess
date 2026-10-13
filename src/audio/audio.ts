// SPDX-License-Identifier: AGPL-3.0-only
// Cries from same origin files, and a tiny Web Audio synth for ticks and blips. Loading fix, 14 Oct: cries are
// fetched once and decoded into the shared AudioContext (the board's species when it is set, the Journey's next panels
// ahead of them), so a ready cry starts with its event. A board event's cry not ready within CRY_LATE_MS is skipped,
// never heard late; a panel's (the starter pick, a wild encounter, a gift choice) may come up to CRY_PANEL_LATE_MS late.
import { ASSET_BASE, CRY_VOLUME, SFX_VOLUME } from '../config';
import { whenFree, whenIdleFirst } from '../ui/loader';

export const CRY_LATE_MS = 150; // a board event's cry (a select, a check, a faint) not ready this long after its event is skipped; its file is kept for next time
export const CRY_PANEL_LATE_MS = 1000; // any other cry belongs to a panel that stays up (the starter pick, a wild encounter, a gift choice): it may start this late, never later

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

interface Cry {
  /** The file (a few KB), fetched once; null when that failed (the entry is then dropped, so a later call tries again). */
  data: Promise<ArrayBuffer | null>;
  /** Decoded into the shared AudioContext; 'media' where the file cannot be decoded here (an <audio> plays it). */
  buffer: AudioBuffer | 'media' | null;
  decoded: Promise<void> | null;
}
/** Cries kept for the page's lifetime. */
const cries = new Map<number, Cry>();
/** Species that have stood on a board this page load (src/battle/sprites.ts warmBoard): their cries are its events'. */
const onBoard = new Set<number>();

/** Fetches a cry's file once (same origin, relative URL). */
function fetchCry(dex: number): Cry {
  const known = cries.get(dex);
  if (known) return known;
  const e: Cry = { data: Promise.resolve(null), buffer: null, decoded: null };
  cries.set(dex, e);
  e.data = fetch(cryUrl(dex))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${cryUrl(dex)} ${r.status}`))))
    .catch((err: unknown) => {
      console.warn('cry not loaded:', err instanceof Error ? err.message : err);
      if (cries.get(dex) === e) cries.delete(dex);
      return null;
    });
  return e;
}

/** Fetches and decodes a cry once (decodeAudioData works while the context is suspended); where Web Audio is
 * missing, an <audio> plays it. */
function loadCry(dex: number): Promise<void> {
  const c = context();
  if (!c) {
    const e = cries.get(dex) ?? { data: Promise.resolve(null), buffer: null, decoded: null };
    e.buffer = 'media';
    cries.set(dex, e);
    return (e.decoded = Promise.resolve());
  }
  const e = fetchCry(dex);
  e.decoded ??= e.data.then((data) =>
    data
      ? c.decodeAudioData(data).then(
          (buf) => void (e.buffer = buf),
          () => void (e.buffer = 'media'),
        )
      : undefined,
  );
  return e.decoded;
}

/** Cries queued in the loader that have not started yet: to decode (the priority lane), and only to fetch (idle). */
const toDecode = new Set<number>();
const toFetch = new Set<number>();

/** Loads these species' cries ahead of their events: decoded at once, in the loader's priority lane (the board's, the
 * warm-up's first catch), or with `later` only fetched (a few KB each) in idle time, ahead of the other idle work but
 * after everything a board asked for, and decoded when first heard (the starters, the next wild encounters, the gifts:
 * a panel waits a few milliseconds for that). A cry already loading or queued is not queued again (review, 14 Oct). */
export function preloadCries(dexes: number[], later = false): void {
  for (const dex of new Set(dexes)) {
    const e = cries.get(dex);
    if (later) {
      if (e || toFetch.has(dex) || toDecode.has(dex)) continue;
      toFetch.add(dex);
      whenIdleFirst(() => (toFetch.delete(dex), fetchCry(dex).data));
    } else {
      if (e?.decoded || toDecode.has(dex)) continue;
      toDecode.add(dex);
      whenFree(() => (toDecode.delete(dex), loadCry(dex)));
    }
  }
}

/** The species on a board (src/battle/sprites.ts warmBoard), decoded ahead: their cries belong to its events (a
 * select, a check, a faint, an evolution), so each plays with its event or, not ready within CRY_LATE_MS, not at all. */
export function boardCries(dexes: number[]): void {
  for (const dex of dexes) onBoard.add(dex);
  preloadCries(dexes);
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
  /** A Pokémon's cry: at once when it is decoded, else once it is, if that is soon enough (CRY_LATE_MS for a board
   * event's, CRY_PANEL_LATE_MS for a panel's), else not at all (still loading for next time). `rate` lowers the pitch
   * (a faint). */
  cry(dex: number, volume = CRY_VOLUME, rate = 1): void {
    if (!this.enabled || blocked || !mayPlay()) return;
    const asked = performance.now();
    const late = onBoard.has(dex) ? CRY_LATE_MS : CRY_PANEL_LATE_MS;
    const play = () => {
      const buf = cries.get(dex)?.buffer;
      if (!this.enabled || !buf || performance.now() - asked > late) return;
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
