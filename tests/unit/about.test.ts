// SPDX-License-Identifier: AGPL-3.0-only
// Trust pass (14 Oct): the About & privacy copy stays true to the code it describes, credits Cousin Mew as is in every
// language, and keeps clear of the words grep gate G6 forbids in the bundle.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPIRE_MS } from '../../worker/src/alarm';
import { KEEP_MS } from '../../worker/src/keep';
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
    expect(KEEP_MS).toBe(180 * DAY);
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
    expect(en['about.feedback']).toBe('Feedback notes have no name or email field and are deleted after 180 days.');
    for (const l of LANGS) expect(load(l)['about.feedback'], l).toContain('180');
  });

  // Trust fix (14 Oct): OPTION, About and the README said three different things about the trainer name. A save holds
  // only a name from the six preset buttons (or MEIR), never one typed in, so every place says so the same way.
  it('says the same about the trainer name everywhere: picked in the game, never a real name', () => {
    expect(en['about.code']).toContain('(the trainer name picked in the game, like {red} or {leaf}, never a real name, and your progress)');
    expect(en['save.code.note']).toContain('only the trainer name picked in the game and your progress, never a real name, email or account');
    for (const l of LANGS) for (const k of ['about.code', 'save.code.note']) expect(load(l)[k], `${l} ${k}`).not.toMatch(/No name or email|Aucun nom ni e-mail|kein Name und keine E-Mail/);
    for (const l of LANGS) expect(load(l)['about.code'], l).toMatch(/\{red\}[^{]*\{leaf\}/);
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).not.toMatch(/no account, name or email/);
    expect(readme).toContain('the trainer name picked in the game, like RED or LEAF, never a real name');
    const kanto = readFileSync('src/ui/kanto.ts', 'utf8');
    expect(kanto).toMatch(/for \(let i = 1; i <= 6; i\+\+\) row\.append\(button\(`name\.\$\{i\}`/); // the name step has buttons, no text field
  });

  it('names the way to delete a save code, which the relay has (DELETE /save/:code)', () => {
    for (const l of LANGS) expect(load(l)['about.delete'], l).toMatch(/\{button\}[\s\S]*\{option\}|\{option\}[\s\S]*\{button\}/);
    expect(readFileSync('worker/src/index.ts', 'utf8')).toMatch(/req\.method === 'DELETE'\) return withCors\(await vault\.fetch\('https:\/\/vault\/delete'/);
    expect(readFileSync('src/ui/saveSettings.ts', 'utf8')).toMatch(/button\('save\.code\.delete', askDelete, 'save-code-delete'/);
  });

  it('keeps "AGPL-3.0" on one line (a non-breaking hyphen) in every language', () => {
    for (const l of LANGS) expect(load(l)['about.source'], l).toContain('AGPL\u20113.0');
  });

  it('lists one line per claim, each with its own string', () => {
    expect(ABOUT_STORED.map((k) => `about.${k}`).every((k) => typeof en[k] === 'string')).toBe(true);
  });
});
