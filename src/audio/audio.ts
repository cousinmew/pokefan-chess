// SPDX-License-Identifier: AGPL-3.0-only
// Cries from same origin files, and a tiny Web Audio synth for ticks and blips.
import { ASSET_BASE, CRY_VOLUME, SFX_VOLUME } from '../config';

let ctx: AudioContext | null = null;
let blocked = false;
const ext = (() => {
  if (typeof document === 'undefined') return 'ogg';
  const probe = document.createElement('audio');
  return probe.canPlayType('audio/ogg; codecs=vorbis') ? 'ogg' : 'mp3';
})();

export const sound = {
  enabled: true,
  /** Called on the first user gesture: browsers only allow audio after one. */
  unlock(): void {
    if (ctx || typeof AudioContext === 'undefined') return;
    ctx = new AudioContext();
    blocked = false;
  },
  cry(dex: number, volume = CRY_VOLUME, rate = 1): void {
    if (!this.enabled || blocked) return;
    const el = new Audio(`${ASSET_BASE}cries/${dex}.${ext}`);
    el.volume = volume;
    el.preservesPitch = false;
    el.playbackRate = rate;
    el.play().catch((err: unknown) => {
      // Autoplay refused before any gesture: stay quiet until unlock().
      blocked = err instanceof DOMException && err.name === 'NotAllowedError';
    });
  },
  tone(freq: number, ms: number, type: OscillatorType = 'square', slideTo?: number): void {
    if (!this.enabled || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + ms / 1000);
    gain.gain.setValueAtTime(SFX_VOLUME, now);
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
};
