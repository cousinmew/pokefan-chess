// SPDX-License-Identifier: AGPL-3.0-only
// The build, made once into a temporary folder: N3 (14 Oct) it honours --outDir (sw.js stamped, offline.json written
// there, ./dist untouched), and N1 the entry chunk carries no other language and stays small.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const out = mkdtempSync(join(tmpdir(), 'pfc-build-'));
/** ./dist before the build: each file's modification time (none when there is no dist). */
const snapshot = () => (existsSync('dist') ? readdirSync('dist').map((f) => `${f}:${statSync(join('dist', f)).mtimeMs}`).sort() : []);
let before: string[] = [];

beforeAll(async () => {
  before = snapshot();
  await build({ configFile: 'vite.config.ts', logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
}, 120_000);
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('N3 the build honours --outDir', () => {
  it('stamps sw.js and writes offline.json in the chosen folder, and leaves ./dist alone', () => {
    const sw = readFileSync(join(out, 'sw.js'), 'utf8');
    expect(sw).not.toContain('__BUILD__');
    expect(sw).not.toContain('__ASSETS__');
    expect(sw).toMatch(/const BUILD = '\w+'/);
    const { files } = JSON.parse(readFileSync(join(out, 'offline.json'), 'utf8')) as { files: string[] };
    expect(files.filter((f) => /^assets\/index-[\w-]+\.js$/.test(f))).toHaveLength(1);
    expect(snapshot()).toEqual(before);
  });
});

describe('N1 the entry chunk', () => {
  const entry = () => {
    const src = /<script type="module"[^>]*src="\.\/(assets\/index-[\w-]+\.js)"/.exec(readFileSync(join(out, 'index.html'), 'utf8'))?.[1];
    if (!src) throw new Error('no entry script in index.html');
    return readFileSync(join(out, src));
  };

  it('carries no other language: no French string and no French Pokémon name', () => {
    const js = entry().toString('utf8');
    const en = JSON.parse(readFileSync('src/data/strings.en.json', 'utf8')) as Record<string, string>;
    const fr = JSON.parse(readFileSync('src/data/strings.fr.json', 'utf8')) as Record<string, string>;
    // Longer French lines in plain ASCII that English does not share (so the minifier writes them as they are).
    const only = Object.keys(fr).filter((k) => typeof fr[k] === 'string' && fr[k]!.length > 24 && /^[\x20-\x7e]+$/.test(fr[k]!) && fr[k] !== en[k]);
    expect(only.length).toBeGreaterThan(20);
    expect(only.filter((k) => js.includes(fr[k]!))).toEqual([]);
    expect(js).toContain(en['splash.tap']);
    for (const name of ['BULBIZARRE', 'CARAPUCE', 'RONDOUDOU']) expect(js).not.toContain(`"${name}"`);
  });

  it('is at most 150 KB gzip', () => {
    const kb = gzipSync(entry()).length / 1024;
    console.log(`entry chunk: ${Math.round(entry().length / 1024)} KB, ${Math.round(kb)} KB gzip`);
    expect(kb).toBeLessThanOrEqual(150);
  });
});
