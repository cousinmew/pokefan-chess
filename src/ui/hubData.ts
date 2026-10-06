// SPDX-License-Identifier: AGPL-3.0-only
// What the BLUE hub shows about you (§B16): the mini Trainer Card and each tile's progress chip.
import { trainingThemes } from '../campaign/journey';
import { DEX, type Campaign } from '../campaign/kanto';
import { fmt, type StringKey } from '../game/text';
import type { HubData } from './screens';

export function hubData(c: Campaign, rating: number, quick: { mode: string; level: number }, continueText: string | null): HubData {
  return {
    continueText,
    card: { name: c.name || fmt('name.1'), level: rating, badges: c.badges },
    chips: {
      journey: c.champion ? fmt('hub.chip.champion') : c.starter ? fmt('hub.chip.badges', { n: String(c.badges.length) }) : fmt('hub.chip.new'),
      training: fmt('hub.chip.lessons', { n: String(trainingThemes(c).length) }),
      battle: quick.mode === 'two-players' ? fmt('hub.chip.quickTwo') : fmt('hub.chip.quickLevel', { level: fmt(`level.${quick.level}` as StringKey) }),
      computer: fmt('hub.chip.levels'),
      two: fmt('hub.chip.device'),
      online: fmt('hub.chip.code'),
      dex: fmt('hub.chip.dex', { n: String(DEX.filter((s) => c.caught[s]).length) }),
      team: fmt('hub.chip.team', { n: String(Object.values(c.team).filter(Boolean).length) }),
      card: fmt('hub.chip.level', { n: String(Math.round(rating)) }),
    },
  };
}
