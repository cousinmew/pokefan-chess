// SPDX-License-Identifier: AGPL-3.0-only
// What happens after the splash (change C): the cartridge shelf on a player's first launch, then the Gen 1 style
// start menu (CONTINUE, NEW GAME, OPTION, SWITCH TRAINER), the save list, the "replace which save?" list, and the
// Two Players picker where each side plays as a save or as a guest. Moved out of main.ts.
import { CARTRIDGE_HOLD_MS } from './config';
import type { Color, TeamSkin } from './board/pieces';
import type { Campaign } from './campaign/kanto';
import type { Lang } from './game/text';
import { fmt } from './game/text';
import { addProfile, deleteProfile, isFull, needsPicker, renameProfile, replaceProfile, slotCount, summaries, switchTo, takeIntent } from './profiles';
import { currentSlot, loadFrom } from './store/persist';
import { button, el, screen } from './ui/dom';
import { profileScreen, type SlotSummary } from './ui/profiles';
import { holdButton } from './ui/settings';
import { shelfScreen, type Cartridge } from './ui/shelf';
import { startMenu, summaryBox, type MenuItem } from './ui/startMenu';

export interface StartHost {
  show(view: HTMLElement): void;
  goTitle(): void;
  /** CONTINUE: the journey spot, or the game in progress, or the home screen. */
  resume(): void;
  settings(back: () => void): void;
  pickCart(c: Cartridge): void;
  lang(l: Lang): void;
  currentLang(): Lang;
  unlockMeir(): void;
  hasCart(): boolean;
  /** NEW GAME after its cartridge is chosen: BLUE opens Oak's intro, YELLOW its home. */
  newGame(): void;
}

/** A save as a Two Players side: its trainer, name and team (null slot = guest). */
export interface DuoSide {
  slot: number | null;
  name: string;
  trainer: 'red' | 'meir';
  team: TeamSkin;
}

export function duoSide(slot: number | null, color: Color): DuoSide {
  if (slot === null) return { slot, name: fmt(color === 'w' ? 'plate.red' : 'plate.blue'), trainer: 'red', team: {} };
  const c = loadFrom<Partial<Campaign>>(slot, 'campaign');
  const yellow = loadFrom<string>(slot, 'cartridge') === 'yellow';
  const team: TeamSkin = { ...(c?.team ?? {}) };
  if (yellow) delete team.k; // the King is always Pikachu in YELLOW
  return { slot, name: c?.name || fmt('profiles.slot', { n: String(slot) }), trainer: loadFrom<string>(slot, 'trainer') === 'meir' ? 'meir' : 'red', team };
}

export class StartFlow {
  private readonly params = new URLSearchParams(location.search);

  constructor(private readonly host: StartHost) {}

  /** Runs once the splash is dismissed. Tests (?debug=1) skip the start menu unless they ask for it with &menu. */
  afterSplash(): void {
    const intent = takeIntent();
    if (intent === 'continue' && this.host.hasCart()) return this.host.resume();
    if (intent === 'newgame') return this.host.hasCart() ? this.host.newGame() : this.shelf(() => this.host.newGame());
    if (this.params.has('debug') && !this.params.has('menu')) {
      if (needsPicker()) return this.players();
      return this.host.hasCart() ? this.host.goTitle() : this.shelf(() => this.host.goTitle());
    }
    if (!this.host.hasCart()) return this.shelf(() => this.menu());
    this.menu();
  }

  shelf(then: () => void): void {
    const again = () => this.shelf(then);
    this.host.show(shelfScreen(this.host.currentLang(), (c) => (this.host.pickCart(c), then()), (l) => (this.host.lang(l), again()), () => this.host.unlockMeir()));
  }

  private current(): SlotSummary | undefined {
    return summaries().find((s) => s.n === currentSlot());
  }

  menu(): void {
    const items: MenuItem[] = [];
    const me = this.current();
    if (this.host.hasCart()) items.push({ id: 'continue', run: () => this.host.resume() });
    items.push({ id: 'new', run: () => this.newGame() }, { id: 'option', run: () => this.host.settings(() => this.menu()) });
    if (slotCount() > 1) items.push({ id: 'switch', run: () => this.players(() => this.menu()) });
    this.host.show(startMenu(items, me && this.host.hasCart() ? summaryBox(me) : null));
  }

  /** SWITCH TRAINER (and C6's "Who's playing?"): one summary per save; picking one loads it and carries on. */
  players(back?: () => void): void {
    const again = () => this.players(back);
    this.host.show(
      profileScreen(summaries(), currentSlot(), {
        pick: (n) => switchTo(n, 'continue'),
        add: () => this.newGame(),
        refresh: again,
        back,
        rename: (n, name) => (renameProfile(n, name), again()),
        remove: (n) => deleteProfile(n) || again(),
      }),
    );
  }

  /** NEW GAME: a fresh save in the next free slot; with all 4 in use, a named 2 s hold picks the one to replace. */
  newGame(): void {
    if (!isFull()) return addProfile();
    const list = el('div', 'replace-list');
    for (const s of summaries()) {
      const row = el('div', 'replace-row');
      row.append(summaryBox(s, `replace-box-${s.n}`), holdButton(fmt('start.replaceHold', { name: s.name }), CARTRIDGE_HOLD_MS, () => replaceProfile(s.n), `replace-${s.n}`));
      list.append(row);
    }
    this.host.show(screen('replace', el('h2', '', 'start.replace'), list, button('back', () => this.menu(), 'back', 'secondary')));
  }

  /** Two Players (change C): each side plays as one of the saves, or as a guest. */
  duo(start: (w: number | null, b: number | null) => void, back: () => void): void {
    const pick: Record<Color, number | null> = { w: currentSlot(), b: null };
    const all = summaries();
    const column = (color: Color) => {
      const col = el('div', `duo-col duo-${color}`);
      col.append(el('h3', '', color === 'w' ? 'duo.red' : 'duo.rocket'));
      const options: [number | null, string][] = [...all.map((s) => [s.n, s.name] as [number, string]), [null, fmt('duo.guest')]];
      const buttons = options.map(([n, name]) => {
        const b = el('button', 'duo-pick');
        b.type = 'button';
        b.dataset.testid = `duo-${color}-${n ?? 'guest'}`;
        b.textContent = name;
        b.onclick = () => {
          pick[color] = n;
          buttons.forEach((x) => x.classList.toggle('on', x === b));
        };
        b.classList.toggle('on', pick[color] === n);
        return b;
      });
      col.append(...buttons);
      return col;
    };
    const cols = el('div', 'duo-cols');
    cols.append(column('w'), column('b'));
    this.host.show(screen('duo', el('h2', '', 'duo.title'), cols, button('duo.start', () => start(pick.w, pick.b), 'duo-start', 'primary'), button('back', back, 'back', 'secondary')));
  }
}
