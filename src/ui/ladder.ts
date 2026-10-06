// SPDX-License-Identifier: AGPL-3.0-only
// The level pickers show who you will face (§B20 item 1): each level carries its trainer, name, title and stars,
// and your own trainer (RED or MEIR) stands on the other side.
import type { Side } from '../look';
import { fmt } from '../game/text';
import { el } from './dom';
import { trainerSprite } from './kanto';

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
