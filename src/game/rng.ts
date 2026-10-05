// SPDX-License-Identifier: AGPL-3.0-only
// Seeded mulberry32. The only randomness source in src/ (G3).

export interface Rng {
  next(): number;
  seed(n: number): number;
  calls(): number;
}

export function createRng(initial = 1): Rng {
  let state = initial >>> 0;
  let count = 0;
  return {
    next() {
      count++;
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    seed(n: number) {
      state = n >>> 0;
      count = 0;
      return n;
    },
    calls: () => count,
  };
}

export const rng = createRng(1);
