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
const dist = walk('dist');
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
  for (const f of src.filter((f) => !f.endsWith('config.ts'))) {
    const t = read(f).replaceAll('http://www.w3.org/2000/svg', '');
    if (/\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//.test(t)) fails.push(`G2: network or absolute URL in ${f}`);
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
  for (const f of [...src, ...dist]) if (re.test(read(f))) fails.push(`G6: forbidden string in ${f}`);
}

if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log(`grep gates pass: ${(wanted.length ? wanted : ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']).join(' ')}`);
