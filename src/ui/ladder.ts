// SPDX-License-Identifier: AGPL-3.0-only
// The level pickers show who you will face (§B20 item 1): each level carries its trainer, name, title and stars,
// and your own trainer (RED or MEIR) stands on the other side.
import type { Side } from '../look';
import { fmt } from '../game/text';
import { el } from './dom';
import { trainerSprite } from './kanto';
import { species } from '../board/pieces';
import { stillUrl } from '../battle/sprites';
import trim from '../data/trim.json';

const TRIM = trim as unknown as Record<string, Record<string, [number, number, number, number, number, number]>>;

/** A loadout chip, 24 to 32 px (loading fix, 14 Oct): the species' still (about 0.8 KB, where its animated sprite was 10
 * to 60 KB that kept the connections busy when a level was tapped), cropped to its opaque box like a board piece; the
 * chosen level's board then shows these same files first. */
function loadoutMon(id: string): HTMLElement {
  const sp = species(id);
  const box = el('span', 'loadout-mon loadout-still');
  const img = el('img');
  img.alt = sp.name;
  img.dataset.species = id;
  img.decoding = 'async';
  img.src = stillUrl(sp.dex, sp.shiny);
  const b = TRIM[sp.shiny ? 'static/shiny' : 'static/front']?.[String(sp.dex)];
  if (b) {
    const [x, y, w, h, W, H] = b;
    const k = 1 / Math.max(w, h);
    Object.assign(img.style, { width: `${W * k * 100}%`, height: `${H * k * 100}%`, left: `${(0.5 - (x + w / 2) * k) * 100}%`, top: `${(0.5 - (y + h / 2) * k) * 100}%` });
  }
  box.append(img);
  return box;
}

/** Trainer sprite, "NAME · Title" and 1 to 4 stars, appended to a level button. */
export function opponentTag(side: Side, level: number, withStars = true): HTMLElement {
  const tag = el('span', 'opponent');
  const sprite = trainerSprite(side.sprite, 'trainer-sprite opponent-sprite');
  sprite.dataset.trainer = side.sprite;
  const text = el('span', 'opponent-text');
  const name = el('b');
  name.textContent = side.name;
  const title = el('small');
  title.textContent = side.title;
  const stars = el('span', 'stars');
  stars.textContent = '★'.repeat(level);
  stars.setAttribute('aria-label', fmt('yellow.stars', { n: String(level) }));
  text.append(name, title, ...(withStars ? [stars] : []));
  tag.append(sprite, text);
  // The trainer's own team (change B): King, Queen and Pawn.
  if (side.team) {
    const crew = el('span', 'loadout');
    crew.dataset.testid = 'loadout';
    for (const role of ['k', 'q', 'p'] as const) {
      const id = side.team[role];
      if (id) crew.append(loadoutMon(id));
    }
    tag.append(crew);
  }
  return tag;
}

/** Your trainer on one side, the ladder of levels on the other. */
export function faceoff(me: Side, ladder: HTMLElement): HTMLElement {
  const row = el('div', 'faceoff');
  const mine = el('div', 'faceoff-me');
  mine.dataset.testid = 'picker-me';
  const sprite = trainerSprite(me.sprite, 'trainer-sprite faceoff-sprite');
  sprite.dataset.trainer = me.sprite;
  const name = el('b');
  name.textContent = me.name;
  mine.append(sprite, name, el('small', '', 'level.vs'));
  row.append(mine, ladder);
  return row;
}
