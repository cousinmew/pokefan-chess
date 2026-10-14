// SPDX-License-Identifier: AGPL-3.0-only
// The stylesheet's own rules (pacing, 12 Oct): two @keyframes with one name silently replace each other (the SOLVED
// stamp used the map's CLEARED keyframes, so it landed off centre and popped out at full opacity).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');

describe('style.css', () => {
  it('names every @keyframes once', () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!);
    const twice = names.filter((n, i) => names.indexOf(n) !== i);
    expect(twice).toEqual([]);
  });

  it('every animation it uses has its keyframes', () => {
    const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!));
    const used = [...css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)].flatMap((m) => m[1]!.split(',').map((a) => a.trim().split(/\s+/).find((w) => /^[a-z][\w-]*$/.test(w) && !KEYWORDS.has(w))).filter((w): w is string => !!w));
    expect(used.filter((n) => !defined.has(n))).toEqual([]);
  });
});

/** Animation shorthand words that are not keyframe names. */
const KEYWORDS = new Set(['none', 'infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'forwards', 'backwards', 'both', 'alternate', 'reverse', 'normal', 'paused', 'running', 'step-start', 'step-end', 'steps', 'cubic-bezier', 'var', 'calc', 'alternate-reverse', 'start', 'end', 'jump-start', 'jump-end', 'jump-none', 'jump-both']);
