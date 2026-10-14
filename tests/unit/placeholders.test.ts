// SPDX-License-Identifier: AGPL-3.0-only
// No "{…}" reaches the screen (online merge, 14 Oct). The controller and netboot groups both added "online.back"
// ("Welcome back! {turn}" for a resumed game, "Your friend is back!" for the friend's return); JSON.parse keeps the
// last of two keys without a word, so the friend's return read "Welcome back! {turn}". Three guards: each data file
// names a key once, fmt() never leaves a placeholder unfilled, and a key shown without values has no placeholder.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS, type Lang, type StringKey } from '../../src/game/text';

const HOLE = /\{\w+\}/;
const en = JSON.parse(readFileSync('src/data/strings.en.json', 'utf8')) as Record<string, string>;

/** The keys an object names twice, at any depth (JSON.parse would keep only the last). */
function namedTwice(json: string): string[] {
  const twice: string[] = [];
  const open: Set<string>[] = [];
  let last = '';
  for (const [t] of json.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]:]/g)) {
    if (t === '{' || t === '[') open.push(new Set());
    else if (t === '}' || t === ']') open.pop();
    else if (t === ':') {
      const keys = open.at(-1)!;
      if (keys.has(last)) twice.push(JSON.parse(last) as string);
      keys.add(last);
    } else last = t;
  }
  return twice;
}

/** The text of each call to `name(...)` in a source file: its top-level arguments (strings and nesting respected). */
function calls(src: string, name: string): string[][] {
  const out: string[][] = [];
  for (const m of src.matchAll(new RegExp(`(?<![\\w.$])(?:this\\.host\\.|h\\.|host\\.)?${name}\\(`, 'g'))) {
    const args: string[] = [];
    let depth = 0;
    let arg = '';
    let i = m.index + m[0].length;
    for (; i < src.length; i++) {
      const c = src[i]!;
      if (c === "'" || c === '"' || c === '`') {
        const end = src.indexOf(c, i + 1);
        arg += src.slice(i, end + 1);
        i = end;
        continue;
      }
      if (depth === 0 && c === ')') break;
      if (depth === 0 && c === ',') {
        args.push(arg.trim());
        arg = '';
        continue;
      }
      if ('([{'.includes(c)) depth++;
      if (')]}'.includes(c)) depth--;
      arg += c;
    }
    if (arg.trim()) args.push(arg.trim());
    out.push(args);
  }
  return out;
}

/** The string keys a piece of source names literally ('online.back', or both keys of a ? : choice). */
const keysIn = (code: string) => [...code.matchAll(/'([A-Za-z]\w*(?:\.\w+)+)'/g)].map((m) => m[1]!).filter((k) => k in en);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
}

describe('placeholders never reach the screen', () => {
  const files = readdirSync('src/data').filter((f) => f.endsWith('.json'));
  it.each(files)('%s names each key once in each object', (f) => {
    expect(namedTwice(readFileSync(join('src/data', f), 'utf8'))).toEqual([]);
  });

  it('the duplicate check sees a key named twice (the merge that hid "Your friend is back!")', () => {
    expect(namedTwice('{\n  "online.back": "Your friend is back!",\n  "a": { "b": 1, "c": "x:y" },\n  "online.back": "Welcome back! {turn}"\n}')).toEqual(['online.back']);
    expect(namedTwice('{ "a": { "k": 1 }, "b": { "k": 2 }, "c": [{ "k": 1 }, { "k": 2 }] }')).toEqual([]);
  });

  it.each(LANGS)('%s: fmt() never shows a placeholder, even when a value is missing', async (l: Lang) => {
    const { fmt, setLang } = await import('../../src/game/text');
    const { loadLanguage } = await import('../../src/i18n');
    await loadLanguage(l);
    setLang(l);
    const shown = Object.keys(en).map((k) => [k, fmt(k as StringKey)] as const).filter(([, s]) => HOLE.test(s));
    setLang('en');
    expect(shown).toEqual([]);
  });

  it('a missing value leaves the rest of the line readable', async () => {
    const { fmt } = await import('../../src/game/text');
    expect(fmt('online.welcome')).toBe('Welcome back!');
    expect(fmt('online.joining')).toBe('Joining room...');
    expect(fmt('online.joining', { code: 'ABCD' })).toBe('Joining room ABCD...');
  });

  it('every key said without values has no placeholder (say, endWith, fmt, toast, el, button, message, { key })', () => {
    const bad: string[] = [];
    for (const file of sources('src')) {
      const src = readFileSync(file, 'utf8');
      const check = (code: string | undefined, how: string) => {
        for (const k of keysIn(code ?? '')) if (HOLE.test(en[k]!)) bad.push(`${file}: ${how} '${k}' (${en[k]})`);
      };
      // Key-only sinks: whatever key they get is shown as it is.
      for (const name of ['say', 'endWith', 'fmt', 'toast']) for (const a of calls(src, name)) if (a.length === 1) check(a[0], name);
      for (const a of calls(src, 'button')) if (a.length < 5) check(a[0], 'button'); // button(key, onClick, testid, cls, vars)
      for (const a of calls(src, 'el')) if (a.length < 4) check(a[2], 'el'); // el(tag, cls, key, vars)
      for (const a of calls(src, 'message')) if (a.length < 3) check(a[0], 'message');
      for (const m of src.matchAll(/\{\s*key:\s*('[\w.]+')\s*\}/g)) check(m[1], '{ key }');
    }
    expect(bad).toEqual([]);
  });

  it('the scan sees a key shown without its values', () => {
    const src = "this.host.say('online.back'); say(a ? 'online.joining' : 'online.left'); fmt('online.you', { team }); el('p', 'x', 'online.codeIs');";
    expect(calls(src, 'say').map((a) => a.flatMap(keysIn))).toEqual([['online.back'], ['online.joining', 'online.left']]);
    expect(calls(src, 'fmt')[0]).toHaveLength(2);
    expect(calls(src, 'el')[0]![2]).toBe("'online.codeIs'");
  });
});
