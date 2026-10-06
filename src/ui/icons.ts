// SPDX-License-Identifier: AGPL-3.0-only
// Home hub icons (§B16 addendum): PokeAPI item sprites where one exists, else original 16 px pixel art drawn here
// in the same style. Every icon renders at 2x or 3x, pixelated.
import hubItems from '../data/hub-items.json';
const PAL: Record<string, string> = { K: '#181818', R: '#e03030', W: '#f8f8f8', G: '#a0a0a0', B: '#58a8f8', S: '#b8e0a0', D: '#802020', Y: '#f0c020' };

const BALL = ['..KKK..', '.KRRRK.', 'KRRRRRK', 'KKKWKKK', 'KWWWWWK', '.KWWWK.', '..KKK..'];

/** Original pixel art, one string per row; "." is transparent. */
const ART: Record<string, string[]> = {
  // Two Poké Balls side by side (Two Players).
  'two-balls': [...Array(4).fill('................'), ...BALL.map((r) => `${r}..${r}`), ...Array(5).fill('................')],
  // A link cable (Online).
  'link-cable': ['................', '.KKK........KKK.', '.KGK........KGK.', '.KGK........KGK.', '.KKK........KKK.', '..K..........K..', '..K..........K..', '..K..........K..', '...K........K...', '....K......K....', '.....KK..KK.....', '.......KK.......', '................', '................', '................', '................'],
  // A red handheld Pokédex (Pokédex).
  dex: ['..KKKKKKKKKKKK..', '.KRRRRRRRRRRRRK.', '.KRBRRRRRRRRRRK.', '.KRRRRRRRRRRRRK.', '.KRKKKKKKKKKKRK.', '.KRKSSSSSSSSKRK.', '.KRKSSSSSSSSKRK.', '.KRKSSSSSSSSKRK.', '.KRKSSSSSSSSKRK.', '.KRKKKKKKKKKKRK.', '.KRRRRRRRRRRRRK.', '.KRKKRRRRRRDDRK.', '.KRKKRRRRRRDDRK.', '.KRRRRRRRRRRRRK.', '..KKKKKKKKKKKK..', '................'],
  // A row of six Poké Balls (My Team): six 4 px balls, so the row is 29 px wide (drawn at 2x).
  'six-balls': [...['.KK.', 'KRRK', 'KKKK', 'KWWK', '.KK.'].map((r) => [r, r, r, r, r, r].join('.'))],
  // A simple gear (Settings).
  // A sticker book with a star (YELLOW My Team).
  book: ['................', '..KKKKKKKKKKKK..', '.KYYYYYYYYYYYYK.', '.KYYYYYKYYYYYYK.', '.KYYYYKRKYYYYYK.', '.KYKKKRRRKKKYYK.', '.KYKRRRRRRRKYYK.', '.KYYKRRRRRKYYYK.', '.KYYKRRKRRKYYYK.', '.KYKRKYYYKRKYYK.', '.KYKKYYYYYKKYYK.', '.KYYYYYYYYYYYYK.', '.KKKKKKKKKKKKKK.', '.KWWWWWWWWWWWWK.', '..KKKKKKKKKKKK..', '................'],
  gear: ['.......KK.......', '....K..KK..K....', '...KKKKKKKKKK...', '....KGGGGGGK....', '..KKGGGKKGGGKK..', '..KGGKK..KKGGK..', 'KKKGGK....KGGKKK', 'KKKGGK....KGGKKK', '..KGGKK..KKGGK..', '..KKGGGKKGGGKK..', '....KGGGGGGK....', '...KKKKKKKKKK...', '....K..KK..K....', '.......KK.......', '................', '................'],
};

export type PixelIcon = keyof typeof ART;

export function pixelIcon(name: PixelIcon, cls = 'tile-icon'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const rows = ART[name]!;
  const w = Math.max(...rows.map((r) => r.length));
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${rows.length}`);
  svg.setAttribute('class', `${cls} pixel-svg`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.icon = name;
  // 3x for 16 px art, 2x for wider art, so every icon fits its 60 px slot.
  const scale = w > 16 ? 2 : 3;
  svg.style.width = `${w * scale}px`;
  svg.style.height = `${rows.length * scale}px`;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = PAL[ch];
      if (!fill) return;
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', '1');
      r.setAttribute('height', '1');
      r.setAttribute('fill', fill);
      svg.append(r);
    }),
  );
  return svg;
}

/** A PokeAPI item sprite from assets/items/ (fetched at build time, never hotlinked). */
/** The hub's item icons come from one sheet (assets/items/hub-sheet.png, preloaded by index.html). */
export const HUB_SHEET = 'assets/items/hub-sheet.png';

export function itemIcon(item: string, cls = 'tile-icon'): HTMLElement {
  const i = hubItems.items.indexOf(item);
  const n = hubItems.items.length;
  const span = document.createElement('span');
  span.className = `${cls} item-icon sheet-icon`;
  span.setAttribute('aria-hidden', 'true');
  span.dataset.icon = item;
  span.style.backgroundImage = `url("${HUB_SHEET}")`;
  span.style.backgroundSize = `${n * 100}% 100%`;
  span.style.backgroundPosition = `${n > 1 ? (i / (n - 1)) * 100 : 0}% 0`;
  return span;
}

/** Marks the page when the sheet is in, so the first screens know their icons are ready. */
export function warmHubSheet(): void {
  const img = new Image();
  img.fetchPriority = 'high';
  img.onload = () => (document.documentElement.dataset.hubSheet = 'ready');
  img.src = HUB_SHEET;
}
