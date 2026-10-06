// SPDX-License-Identifier: AGPL-3.0-only
// YELLOW's My Team (fix 3): five big slots shown as pieces, tap one, then tap a sticker. Only stickers that may
// stand in that slot are offered (no rule text). The King is always Pikachu. Below: the next sticker as a silhouette.
import { defaultSpecies, GLYPHS, SPECIES } from '../board/pieces';
import { fmt, type StringKey } from '../game/text';
import type { Campaign } from '../campaign/kanto';
import { eligible, nextUnlock, YELLOW_SLOTS, type YellowSlot } from '../campaign/yellowTeam';
import { button, el, screen } from './dom';
import { mon } from './kanto';

export interface YellowTeamActions {
  pick(slot: YellowSlot, id: string): void;
  classic(): void;
  back(): void;
}

const current = (c: Campaign, slot: YellowSlot) => (slot === 'b' ? c.team.bLight : c.team[slot]) ?? defaultSpecies('w', slot, false);

export function yellowTeamScreen(c: Campaign, selected: YellowSlot, select: (s: YellowSlot) => void, a: YellowTeamActions): HTMLElement {
  const slots = el('div', 'yslots');
  for (const s of YELLOW_SLOTS) {
    const b = el('button', `yslot${s === selected ? ' on' : ''}`);
    b.type = 'button';
    b.dataset.testid = `yslot-${s}`;
    b.dataset.species = current(c, s);
    b.setAttribute('aria-pressed', String(s === selected));
    const glyph = el('span', 'yslot-glyph');
    glyph.textContent = GLYPHS.w[s];
    b.append(mon(current(c, s), 'menu-sprite', false, false, true), glyph);
    b.onclick = () => select(s);
    slots.append(b);
  }
  const grid = el('div', 'ystickers');
  const ids = eligible(c, selected);
  for (const id of ids) {
    const b = el('button', `ysticker${id === current(c, selected) ? ' on' : ''}`);
    b.type = 'button';
    b.dataset.testid = `ysticker-${id}`;
    b.setAttribute('aria-label', SPECIES[id]!.name);
    b.append(mon(id));
    b.onclick = () => a.pick(selected, id);
    grid.append(b);
  }
  if (!ids.length) grid.append(el('p', 'small', 'yellow.none'));
  const kids: Node[] = [el('h2', '', 'yellow.team'), el('p', '', 'yellow.team.pick'), slots, grid, button('yellow.classic', a.classic, 'yellow-classic', 'secondary')];
  const next = nextUnlock(c);
  if (next) {
    const box = el('div', 'ynext');
    box.dataset.testid = 'yellow-next';
    const t = el('p');
    t.textContent = fmt(`yellow.next.${next.by}` as StringKey, { name: SPECIES[next.id]!.name });
    box.append(mon(next.id, 'menu-sprite', true), t);
    kids.push(box);
  }
  kids.push(button('back', a.back, 'back', 'secondary'));
  return screen('yellow-team', ...kids);
}
