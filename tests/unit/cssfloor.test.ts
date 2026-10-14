// SPDX-License-Identifier: AGPL-3.0-only
// The stylesheet on the app's oldest browsers (review, 14 Oct): it already needs Safari 15.4 (:has(), dvh), but
// color-mix() needs 16.2. A custom property keeps a color-mix() value there, and the colour that reads it is then
// invalid, so the reduced-motion capture tint faded the square to transparent. Every color-mix() needs a plain colour
// for the same rule before it and an @supports guard around it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');

/** Each rule `selector { property: value }` with the @supports conditions around it (one level of nesting is enough here). */
function rules(text: string): { selector: string; prop: string; value: string; supports: string[] }[] {
  const out: { selector: string; prop: string; value: string; supports: string[] }[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of text.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const selector = stack.pop() ?? '';
      for (const decl of buf.split(';')) {
        const at = decl.indexOf(':');
        if (at > 0) out.push({ selector, prop: decl.slice(0, at).trim(), value: decl.slice(at + 1).trim(), supports: stack.filter((s) => s.startsWith('@supports')) });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}

describe('style.css on Safari 15.4', () => {
  it('every color-mix() is guarded by @supports, after a plain colour for the same rule', () => {
    const all = rules(css);
    const mixed = all.filter((r) => r.value.includes('color-mix('));
    expect(mixed.length).toBeGreaterThan(0);
    for (const r of mixed) {
      expect(r.supports.some((s) => s.includes('color-mix(')), `${r.selector} { ${r.prop} } outside @supports`).toBe(true);
      const plain = all.find((x) => x.selector === r.selector && x.prop === r.prop && !x.value.includes('color-mix(') && !x.supports.length);
      expect(plain, `${r.selector} { ${r.prop} } has no plain colour first`).toBeTruthy();
    }
  });
});
