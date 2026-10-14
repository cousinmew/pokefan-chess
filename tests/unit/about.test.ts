// SPDX-License-Identifier: AGPL-3.0-only
// Trust pass (14 Oct): the About & privacy copy stays true to the code it describes, credits Cousin Mew as is in every
// language, and keeps clear of the words grep gate G6 forbids in the bundle.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPIRE_MS } from '../../worker/src/alarm';
import { ABOUT_STORED } from '../../src/ui/about';

const LANGS = ['en', 'fr', 'he', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh-Hans', 'ru'];
const load = (l: string) => JSON.parse(readFileSync(`src/data/strings.${l}.json`, 'utf8')) as Record<string, string>;
const en = load('en');
const DAY = 24 * 60 * 60 * 1000;

describe('About & privacy copy', () => {
  it.each(LANGS)('%s credits Cousin Mew as is, on the splash and in About', (l) => {
    const t = load(l);
    expect(t['splash.credit']).toContain('Cousin Mew');
    expect(t['about.made']).toContain('Cousin Mew');
  });

  it('uses none of the words grep gate G6 forbids in the bundle, in any language', () => {
    const g6 = /\b(ads|donate|sponsor|paypal|ko-fi|analytics|gtag)\b/i;
    for (const l of LANGS) {
      const t = load(l);
      for (const k of Object.keys(t).filter((x) => /^(about|trust)\.|^splash\./.test(x))) expect(t[k], `${l} ${k}`).not.toMatch(g6);
    }
  });

  it('says what the code does: save codes go after 180 days unused, rooms a day after their last move', () => {
    const vault = readFileSync('worker/src/Vault.ts', 'utf8');
    expect(vault).toMatch(/const KEEP_MS = 180 \* 24 \* 60 \* 60 \* 1000;/);
    expect(vault).toMatch(/setAlarm\(Date\.now\(\) \+ KEEP_MS\)/); // every read or write pushes the expiry back
    for (const l of LANGS) expect(load(l)['about.code'], l).toContain('180');
    expect(en['about.code']).toContain('180 days without use');
    expect(EXPIRE_MS).toBe(DAY);
    expect(en['about.online']).toContain('an untouched room is deleted after a day');
  });

  it('says what the server is sent: no name or email in a feedback note or an online join', () => {
    const fields = /const LIMITS = \{([^}]*)\}/.exec(readFileSync('worker/src/Feedback.ts', 'utf8'))![1]!;
    expect(fields).not.toMatch(/name|mail/i);
    const join = /\{ type: 'join'[^}]*\}/.exec(readFileSync('worker/src/protocol.ts', 'utf8'))![0];
    expect(join).not.toMatch(/name|mail/i);
    expect(en['about.feedback']).toBe('Feedback notes are kept without names or emails.');
  });

  it('lists one line per claim, each with its own string', () => {
    expect(ABOUT_STORED.map((k) => `about.${k}`).every((k) => typeof en[k] === 'string')).toBe(true);
  });
});
