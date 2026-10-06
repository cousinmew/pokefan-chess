// SPDX-License-Identifier: AGPL-3.0-only
// Grep gates G1 to G6 (§6.2). Usage: node scripts/grep-gates.mjs [G1 G3 ...]. Prints failures only.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      })
    : [];
const read = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return '';
    throw err;
  }
};
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const src = walk('src');
// GATES_DIST points the gates at another build, e.g. the bundle downloaded from the live site.
const dist = walk(process.env.GATES_DIST ?? 'dist');
const fails = [];

if (run('G1')) {
  const raw = existsSync('.brandguard') ? read('.brandguard') : (process.env.BRANDGUARD ?? '');
  const terms = raw.split(/\r?\n/).map((t) => t.trim().toLowerCase()).filter((t) => t && !t.startsWith('#'));
  if (!terms.length) fails.push('G1: no .brandguard file and no $BRANDGUARD secret, refusing to pass silently');
  let log = '';
  try {
    log = git('log', '--all', '--format=%an %ae %cn %ce %s %b');
  } catch (err) {
    if (!String(err.message).includes('does not have any commits')) throw err;
  }
  const corpus = [...tracked.map((f) => [f, read(f)]), ...dist.map((f) => [f, read(f)]), ['git log', log]];
  for (const [file, text] of corpus) {
    const low = `${file}\n${text}`.toLowerCase();
    terms.forEach((t, i) => low.includes(t) && fails.push(`G1: brand term #${i + 1} found in ${file}`));
  }
}
if (run('G2')) {
  // V7: runtime network only to the relay origin. fetch/WebSocket live in src/net/ only; config.ts holds the
  // only absolute URLs, and those must be the repo link, the optional Discord link or the relay.
  const cfg = read('src/config.ts');
  const relay = /RELAY_URL = '(https:\/\/[^']+)'/.exec(cfg)?.[1];
  if (!relay) fails.push('G2: RELAY_URL missing from src/config.ts');
  for (const url of cfg.match(/https?:\/\/[^'"\s)]+/g) ?? []) {
    if (url !== relay && !url.startsWith('https://github.com/cousinmew/') && !url.startsWith('https://discord.')) fails.push(`G2: unexpected origin in config.ts: ${url}`);
  }
  for (const f of src.filter((f) => !f.endsWith('config.ts'))) {
    const t = read(f).replaceAll('http://www.w3.org/2000/svg', '');
    if (/https?:\/\//.test(t)) fails.push(`G2: absolute URL in ${f}`);
    // src/audio/music.ts may fetch its own same origin mp3 files (relative URLs; absolute ones fail above).
    const sameOriginAudio = f === 'src/audio/music.ts' && !/WebSocket|XMLHttpRequest/.test(t);
    if (!f.startsWith('src/net/') && !sameOriginAudio && /\bfetch\(|XMLHttpRequest|WebSocket/.test(t)) fails.push(`G2: network call outside src/net/ in ${f}`);
    if (/XMLHttpRequest/.test(t)) fails.push(`G2: XMLHttpRequest in ${f}`);
  }
}
if (run('G3')) for (const f of src) if (read(f).includes('Math.random')) fails.push(`G3: Math.random in ${f}`);
if (run('G4')) {
  for (const f of [...src, ...walk('scripts')]) if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(read(f))) fails.push(`G4: empty catch in ${f}`);
}
if (run('G5')) {
  const t = tracked.filter((f) => f.startsWith('public/assets/'));
  if (t.length) fails.push(`G5: ${t.length} tracked files under public/assets/`);
}
if (run('G6')) {
  const re = /\b(ads|donate|sponsor|paypal|ko-fi|analytics|gtag)\b/i;
  const text = (f) => !/\.(wasm|png|gif|ogg|mp3|ico)$/.test(f); // binaries hold random byte runs like "aDs"
  for (const f of [...src, ...dist].filter(text)) if (re.test(read(f))) fails.push(`G6: forbidden string in ${f}`);
}

if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log(`grep gates pass: ${(wanted.length ? wanted : ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']).join(' ')}`);
