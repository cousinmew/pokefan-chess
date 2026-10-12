// SPDX-License-Identifier: AGPL-3.0-only
// What the BLUE hub shows about you (§B16): the mini Trainer Card and each tile's progress chip.
import { trainingThemes } from '../campaign/journey';
import { DEX, type Campaign } from '../campaign/kanto';
import { fmt, type StringKey } from '../game/text';
import type { HubData } from './screens';

/** `rating` is null before the first puzzle ("new", ux #15); `quick` is null before the first quick game. */
export function hubData(c: Campaign, rating: number | null, quick: { mode: string; level: number } | null, continueText: string | null): HubData {
  const lessons = trainingThemes(c).length;
  return {
    continueText,
    card: { name: c.name || fmt('name.1'), level: rating, badges: c.badges },
    // A brand-new save has no "last time" to play like (ux #15).
    subs: quick ? {} : { battle: 'hub.battle.subNew' },
    chips: {
      journey: c.champion ? fmt('hub.chip.champion') : c.starter ? fmt('hub.chip.badges', { n: String(c.badges.length) }) : fmt('hub.chip.new'),
      // The string system has no plural forms, so one lesson has its own line.
      training: lessons === 1 ? fmt('hub.chip.lesson1') : fmt('hub.chip.lessons', { n: String(lessons) }),
      battle: quick?.mode === 'two-players' ? fmt('hub.chip.quickTwo') : fmt('hub.chip.quickLevel', { level: fmt(`level.${quick?.level ?? 1}` as StringKey) }),
      computer: fmt('hub.chip.levels'),
      two: fmt('hub.chip.device'),
      online: fmt('hub.chip.code'),
      dex: fmt('hub.chip.dex', { n: String(DEX.filter((s) => c.caught[s]).length) }),
      team: fmt('hub.chip.team', { n: String(Object.values(c.team).filter(Boolean).length) }),
      card: rating === null ? fmt('hub.chip.levelNew') : fmt('hub.chip.level', { n: String(Math.round(rating)) }),
    },
  };
}
