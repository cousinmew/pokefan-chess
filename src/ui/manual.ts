// SPDX-License-Identifier: AGPL-3.0-only
// How to Play as a game manual (§B16): tabbed, numbered pages, one per mode plus Your Pieces and Battles & Catching.
// Each page loops a small demo (the lesson's mini board, or a battle effect), lists 3 rules and has "Try it".
import { FX } from '../battle/fxRecipes';
import { createRng } from '../game/rng';
import { fmt, type StringKey } from '../game/text';
import { GLYPHS, speciesFor, spriteUrl, type Role } from '../board/pieces';
import { button, el, screen } from './dom';
import { miniBoard } from './lesson';

export const PAGES = ['journey', 'training', 'battle', 'computer', 'two', 'online', 'pieces', 'catching'] as const;
export type Page = (typeof PAGES)[number];

// Demo lines: real, legal moves that show what each mode is about.
const SCHOLAR = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEMOS: Partial<Record<Page, [string, string[], number]>> = {
  journey: ['r3k3/7p/8/1N6/8/8/8/4K3 b - - 0 1', ['h7h6', 'b5c7', 'e8e7', 'c7a8'], 4],
  training: ['k7/8/1K6/8/8/8/8/7Q w - - 0 1', ['h1h8'], 1],
  battle: [START, SCHOLAR, 7],
  computer: [START, ['e2e4', 'c7c5', 'g1f3', 'd7d6'], 4],
  two: [START, ['d2d4', 'd7d5', 'c2c4', 'e7e6'], 4],
  online: [START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 4],
};

/** A looping battle effect on a small canvas, between two sprites (Battles & Catching). */
function fxDemo(): HTMLElement {
  const box = el('div', 'fx-demo');
  box.dataset.testid = 'fx-demo';
  const a = el('img', 'fx-a');
  const d = el('img', 'fx-d');
  a.src = spriteUrl(speciesFor('w', 'q', 'd1').dex, 'back');
  d.src = spriteUrl(speciesFor('b', 'p', 'a7').dex, 'front');
  a.alt = d.alt = '';
  const c = el('canvas');
  c.width = 320;
  c.height = 288;
  box.append(d, a, c);
  const rng = createRng(7);
  const recipe = FX.flame!;
  let t = 0;
  const timer = window.setInterval(() => {
    if (!box.isConnected) return window.clearInterval(timer);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    t = (t + 0.04) % 1.4;
    ctx.clearRect(0, 0, 320, 288);
    if (t < 1) recipe.draw(ctx, t, { x: 84, y: 168 }, { x: 236, y: 84 }, () => rng.next());
  }, 40);
  return box;
}

function legend(): HTMLElement {
  const box = el('div', 'legend');
  const rows: [Role, StringKey, string, string][] = [
    ['k', 'role.k', 'e1', 'e8'], ['q', 'role.q', 'd1', 'd8'], ['r', 'role.r', 'a1', 'a8'], ['b', 'role.bLight', 'f1', 'c8'],
    ['b', 'role.bDark', 'c1', 'f8'], ['n', 'role.n', 'b1', 'b8'], ['p', 'role.p', 'a2', 'a7'],
  ];
  const head = el('div', 'legend-row legend-head');
  head.append(el('b', '', 'team.red'), el('span'), el('b', '', 'team.rocket'));
  box.append(head);
  for (const [role, label, w, b] of rows) {
    const row = el('div', 'legend-row');
    const name = el('span', 'role');
    name.textContent = `${GLYPHS.w[role]} ${fmt(label)}`;
    const img = (color: 'w' | 'b', sq: string) => {
      const i = el('img', 'legend-sprite');
      i.src = spriteUrl(speciesFor(color, role, sq).dex);
      i.alt = speciesFor(color, role, sq).name;
      return i;
    };
    row.append(img('w', w), name, img('b', b));
    box.append(row);
  }
  return box;
}

/** The booklet, open on `page`. `tryIt` jumps into that page's mode. */
export function manualScreen(page: Page, tryIt: (p: Page) => void, back: () => void, footer: HTMLElement): HTMLElement {
  const tabs = el('div', 'manual-tabs');
  tabs.setAttribute('role', 'tablist');
  const pages = el('div', 'manual-pages');
  const show = (p: Page) => {
    for (const t of tabs.children) t.setAttribute('aria-selected', String((t as HTMLElement).dataset.page === p));
    for (const pg of pages.children) (pg as HTMLElement).hidden = (pg as HTMLElement).dataset.page !== p;
  };
  PAGES.forEach((p, i) => {
    const tab = button(`manual.${p}.title` as StringKey, () => show(p), `manual-tab-${p}`, 'manual-tab');
    tab.setAttribute('role', 'tab');
    tab.dataset.page = p;
    tabs.append(tab);
    const pg = el('section', 'manual-page');
    pg.dataset.page = p;
    pg.dataset.testid = `manual-page-${p}`;
    const num = el('span', 'page-num');
    num.textContent = fmt('manual.page', { n: String(i + 1) });
    const h = el('h3', '', `manual.${p}.title` as StringKey);
    const demo = p === 'pieces' ? legend() : p === 'catching' ? fxDemo() : DEMOS[p] ? miniBoard(...DEMOS[p]!) : el('div');
    const rules = el('ul', 'manual-rules');
    for (const n of [1, 2, 3]) rules.append(el('li', '', `manual.${p}.${n}` as StringKey));
    pg.append(num, h, demo, rules, button('manual.try', () => tryIt(p), 'manual-try', 'primary'));
    pages.append(pg);
  });
  show(page);
  return screen('howto', el('h2', '', 'manual.title'), tabs, pages, button('back', back, 'back', 'secondary'), footer);
}
