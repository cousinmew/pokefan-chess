// SPDX-License-Identifier: AGPL-3.0-only
// Owner only (§B21 item 3): downloads all feedback from the relay and writes docs/feedback/<date>.json plus
// docs/feedback/<date>-translations.md, one table per language of suggested wordings, ready to merge by hand into
// src/data/strings.<lang>.json. Nothing is merged automatically.
// The export token is the relay's FEEDBACK_TOKEN secret (set with `wrangler secret put FEEDBACK_TOKEN` in worker/);
// this reads it from $FEEDBACK_TOKEN or the macOS Keychain item "pokefan-feedback-token". It is never printed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const relay = /RELAY_URL = '(https:\/\/[^']+)'/.exec(readFileSync('src/config.ts', 'utf8'))?.[1];
const token = process.env.FEEDBACK_TOKEN || execFileSync('security', ['find-generic-password', '-s', 'pokefan-feedback-token', '-w'], { encoding: 'utf8' }).trim();
const res = await fetch(`${process.env.FEEDBACK_RELAY ?? relay}/feedback/export`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`feedback export failed: HTTP ${res.status}`);
  process.exit(1);
}
const all = await res.json();
const day = new Date().toISOString().slice(0, 10);
mkdirSync('docs/feedback', { recursive: true });
writeFileSync(`docs/feedback/${day}.json`, JSON.stringify(all, null, 1) + '\n');
const cell = (s = '') => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const byLang = {};
for (const e of all.filter((x) => x.kind === 'translation')) (byLang[e.lang] ??= []).push(e);
let md = `# Translation suggestions, ${day}\n\nFrom ?review=<lang> links. Merge by hand into src/data/strings.<lang>.json.\n`;
for (const [lang, rows] of Object.entries(byLang).sort()) {
  md += `\n## ${lang}\n\n| Key | Now | Suggestion | Note | Screen |\n|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${cell(r.key)} | ${cell(r.current)} | ${cell(r.suggestion)} | ${cell(r.note)} | ${cell(r.screen)} |\n`;
}
writeFileSync(`docs/feedback/${day}-translations.md`, md);
const counts = all.reduce((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {});
console.log(`feedback: ${all.length} notes ${JSON.stringify(counts)} -> docs/feedback/${day}.json`);
