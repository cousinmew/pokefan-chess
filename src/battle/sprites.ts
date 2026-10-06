// SPDX-License-Identifier: AGPL-3.0-only
// Battle sprite preload and the bounded wait before a battle starts.
import roster from '../data/roster.gen1.json';
import { BATTLE } from '../config';
import { species, spriteUrl, type SpeciesId } from '../board/pieces';
import { idleDrained, whenIdle } from '../ui/loader';

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

/** Queues all 28 battle sprites (14 front, 14 back) for idle time, after the menus (load fix). A battle that starts
 * first loads its own two sprites straight away. */
export function preloadBattleSprites(): void {
  for (const s of Object.values(roster.species)) {
    whenIdle(() => entry(spriteUrl(s.dex, 'front')).ok);
    whenIdle(() => entry(spriteUrl(s.dex, 'back')).ok);
  }
}

/** Resolves when every preload started so far has settled; true when all decoded. */
export async function preloadSettled(): Promise<boolean> {
  await idleDrained();
  return (await Promise.all([...cache.values()].map((e) => e.ok))).every(Boolean);
}

export interface BattleSprites {
  near: HTMLImageElement;
  far: HTMLImageElement;
  mirrorNear: boolean;
}

/** Waits up to BATTLE.spriteWaitMs for both sprites: the player's Pokémon from behind (near), the opponent's front (far).
 * Back unavailable: mirrored front. Nothing available: retro PNG. */
export async function prepareSprites(nearId: SpeciesId, farId: SpeciesId): Promise<BattleSprites> {
  const ns = species(nearId);
  const fs = species(farId);
  const n = ns.dex;
  const f = fs.dex;
  const back = entry(spriteUrl(n, 'back', ns.shiny));
  const front = entry(spriteUrl(n, 'front', ns.shiny));
  const far = entry(spriteUrl(f, 'front', fs.shiny));
  const state = new Map<Entry, boolean | null>([[back, null], [front, null], [far, null]]);
  const all = Promise.all([...state.keys()].map((e) => e.ok.then((ok) => state.set(e, ok))));
  await Promise.race([all, new Promise((r) => window.setTimeout(r, BATTLE.spriteWaitMs))]);
  // A back sprite still loading loses to a front sprite that is ready.
  const backOk = state.get(back) === true || (state.get(back) === null && state.get(front) !== true);
  const near = backOk ? { near: back.img, mirrorNear: false } : state.get(front) !== false ? { near: front.img, mirrorNear: true } : { near: entry(spriteUrl(n, 'retro')).img, mirrorNear: false };
  return { ...near, far: state.get(far) === false ? entry(spriteUrl(f, 'retro')).img : far.img };
}
