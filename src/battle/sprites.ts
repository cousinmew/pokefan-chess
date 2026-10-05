// SPDX-License-Identifier: AGPL-3.0-only
// Battle sprite preload and the bounded wait before a battle starts.
import roster from '../data/roster.gen1.json';
import { BATTLE } from '../config';
import { species, spriteUrl, type SpeciesId } from '../board/pieces';

interface Entry {
  img: HTMLImageElement;
  ok: Promise<boolean>;
}

/** Decoded images kept for the page's lifetime. The overlay shows these exact elements, so no refetch is needed. */
const cache = new Map<string, Entry>();

function entry(url: string): Entry {
  let e = cache.get(url);
  if (!e) {
    const img = new Image();
    img.alt = '';
    img.src = url;
    e = {
      img,
      ok: img.decode().then(
        () => true,
        () => false,
      ),
    };
    cache.set(url, e);
  }
  return e;
}

/** Starts loading all 28 battle GIFs (14 front, 14 back) in the background. */
export function preloadBattleSprites(): void {
  for (const s of Object.values(roster.species)) {
    entry(spriteUrl(s.dex, 'front'));
    entry(spriteUrl(s.dex, 'back'));
  }
}

/** Resolves when every preload started so far has settled; true when all decoded. */
export async function preloadSettled(): Promise<boolean> {
  return (await Promise.all([...cache.values()].map((e) => e.ok))).every(Boolean);
}

export interface BattleSprites {
  att: HTMLImageElement;
  def: HTMLImageElement;
  mirrorAtt: boolean;
}

/** Waits up to BATTLE.spriteWaitMs for both sprites. Back unavailable: mirrored front. Both unavailable: retro PNG. */
export async function prepareSprites(attacker: SpeciesId, defender: SpeciesId): Promise<BattleSprites> {
  const a = species(attacker).dex;
  const d = species(defender).dex;
  const back = entry(spriteUrl(a, 'back'));
  const front = entry(spriteUrl(a, 'front'));
  const def = entry(spriteUrl(d, 'front'));
  const state = new Map<Entry, boolean | null>([[back, null], [front, null], [def, null]]);
  const all = Promise.all([...state.keys()].map((e) => e.ok.then((ok) => state.set(e, ok))));
  await Promise.race([all, new Promise((r) => window.setTimeout(r, BATTLE.spriteWaitMs))]);
  // A back sprite still loading loses to a front sprite that is ready.
  const backOk = state.get(back) === true || (state.get(back) === null && state.get(front) !== true);
  const att = backOk ? { att: back.img, mirrorAtt: false } : state.get(front) !== false ? { att: front.img, mirrorAtt: true } : { att: entry(spriteUrl(a, 'retro')).img, mirrorAtt: false };
  return { ...att, def: state.get(def) === false ? entry(spriteUrl(d, 'retro')).img : def.img };
}
