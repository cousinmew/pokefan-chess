// SPDX-License-Identifier: AGPL-3.0-only
// Music: six cues. Plays public/audio/<cue>.mp3 when the build found it, else a short procedural chiptune,
// so the game is never silent. Loops use Web Audio buffers, so loop points are sample exact.
import { MUSIC_LOOPS, MUSIC_STING_GAIN, type MusicCue } from '../config';
import { audioContext, onAudioUnlock } from './audio';

/** [midi note, 0 = rest; length in eighth notes]. Original placeholder tunes. */
type Note = [number, number];
interface Tune {
  bpm: number;
  lead: Note[];
  bass: Note[];
}
const TUNES: Record<MusicCue, Tune> = {
  title: { bpm: 132, lead: [[72, 2], [76, 2], [79, 2], [76, 2], [77, 2], [81, 2], [79, 4], [76, 2], [74, 2], [72, 2], [74, 2], [76, 4], [0, 4]], bass: [[48, 4], [55, 4], [53, 4], [55, 4], [48, 4], [43, 4], [48, 8]] },
  board: { bpm: 104, lead: [[67, 3], [0, 1], [64, 2], [65, 2], [67, 4], [69, 2], [67, 2], [65, 3], [0, 1], [62, 2], [64, 2], [65, 4], [64, 4]], bass: [[48, 8], [53, 8], [50, 8], [55, 8]] },
  battle: { bpm: 180, lead: [[72, 1], [75, 1], [79, 1], [84, 3], [0, 1], [84, 1], [86, 4]], bass: [[48, 6], [50, 6]] },
  victory: { bpm: 150, lead: [[72, 1], [72, 1], [72, 1], [72, 3], [68, 3], [70, 3], [72, 2], [70, 1], [72, 6]], bass: [[48, 6], [44, 6], [46, 6], [48, 3]] },
  defeat: { bpm: 96, lead: [[67, 2], [66, 2], [65, 2], [64, 6]], bass: [[43, 6], [36, 6]] },
  evolution: { bpm: 200, lead: [[60, 1], [64, 1], [67, 1], [72, 1], [76, 1], [79, 1], [84, 4]], bass: [[48, 4], [55, 6]] },
};
const LOOPING: MusicCue[] = ['title', 'board'];
const FILES = new Set<string>(__MUSIC_FILES__);
const buffers = new Map<MusicCue, Promise<AudioBuffer | null>>();

function decoded(c: AudioContext, cue: MusicCue): Promise<AudioBuffer | null> {
  let p = buffers.get(cue);
  if (!p) {
    p = fetch(`audio/${cue}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`audio/${cue}.mp3 ${r.status}`))))
      .then((b) => c.decodeAudioData(b))
      .catch((err: unknown) => {
        console.warn('music file unusable, using the chiptune:', err instanceof Error ? err.message : err);
        return null;
      });
    buffers.set(cue, p);
  }
  return p;
}

/** Schedules one pass of a tune into `out`; returns its length in seconds. */
function synth(c: AudioContext, tune: Tune, out: AudioNode, at: number): number {
  const step = 60 / tune.bpm / 2;
  const voice = (notes: Note[], type: OscillatorType, level: number) => {
    let t = at;
    for (const [midi, len] of notes) {
      if (midi) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
        g.gain.setValueAtTime(level, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len * step * 0.95);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + len * step);
      }
      t += len * step;
    }
    return t - at;
  };
  return Math.max(voice(tune.lead, 'square', 0.18), voice(tune.bass, 'triangle', 0.3));
}

class Music {
  current: MusicCue | null = null;
  enabled = true;
  private loopVolume = 0.3;
  private stingVolume = 1;
  private loopGain: GainNode | null = null;
  private timer = 0;

  setVolumes(loop: number, sting: number, enabled: boolean): void {
    this.loopVolume = loop;
    this.stingVolume = sting;
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      const cue = this.current;
      this.stop();
      if (enabled && cue) this.play(cue);
    }
    if (this.loopGain) this.loopGain.gain.value = this.enabled ? loop : 0;
  }

  /** Looping cues replace the current loop; one-shot cues play over a ducked loop. */
  play(cue: MusicCue): void {
    if (!LOOPING.includes(cue)) return this.sting(cue);
    if (this.current === cue && this.loopGain) return;
    this.stop();
    this.current = cue;
    if (!this.enabled) return;
    onAudioUnlock((c) => {
      if (this.current !== cue || this.loopGain) return;
      const g = c.createGain();
      g.gain.value = this.loopVolume;
      g.connect(c.destination);
      this.loopGain = g;
      if (FILES.has(cue)) {
        void decoded(c, cue).then((buf) => (buf ? this.loopBuffer(c, g, cue, buf) : this.loopSynth(c, g, cue)));
      } else {
        this.loopSynth(c, g, cue);
      }
    });
  }

  stop(): void {
    window.clearTimeout(this.timer);
    this.loopGain?.disconnect();
    this.loopGain = null;
    this.current = null;
  }

  private loopBuffer(c: AudioContext, g: GainNode, cue: MusicCue, buf: AudioBuffer): void {
    if (this.loopGain !== g) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const [start, end] = MUSIC_LOOPS[cue] ?? [0, 0];
    src.loopStart = start;
    src.loopEnd = end > start ? end : buf.duration;
    src.connect(g);
    src.start();
  }

  private loopSynth(c: AudioContext, g: GainNode, cue: MusicCue): void {
    let at = c.currentTime + 0.05;
    const pass = () => {
      if (this.loopGain !== g) return;
      const len = synth(c, TUNES[cue], g, at);
      at += len;
      // Schedule the next pass a little before this one ends.
      this.timer = window.setTimeout(pass, Math.max(50, (at - c.currentTime - 0.25) * 1000));
    };
    pass();
  }

  private sting(cue: MusicCue): void {
    const c = audioContext();
    if (!c || !this.enabled) return;
    const g = c.createGain();
    g.gain.value = this.stingVolume * MUSIC_STING_GAIN;
    g.connect(c.destination);
    const duck = this.loopGain;
    const now = c.currentTime;
    const done = (len: number) => {
      if (duck && duck === this.loopGain) {
        duck.gain.setValueAtTime(this.loopVolume * 0.25, now);
        duck.gain.setValueAtTime(this.loopVolume, now + len);
      }
    };
    if (FILES.has(cue)) {
      void decoded(c, cue).then((buf) => {
        if (!buf) return done(synth(c, TUNES[cue], g, c.currentTime));
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(g);
        src.start();
        done(buf.duration);
      });
    } else {
      done(synth(c, TUNES[cue], g, now));
    }
  }
}

export const music = new Music();
