// SPDX-License-Identifier: AGPL-3.0-only
// Save slot controller (§B18 item 2). Switching player reloads the page, so every module starts clean on the new
// slot's data; a session flag skips the picker on that reload.
import type { Campaign } from './campaign/kanto';
import { DEX, solvedBefore } from './campaign/kanto';
import { goalLine, journeyState } from './campaign/journey';
import type { Trainer } from './campaign/trainer';
import { fmt } from './game/text';
import { bootProfiles, clearProfile, loadFrom, MAX_SLOTS, PLAYER_TRAINER, readDevice, readMeta, removeDevice, removeFrom, saveTo, writeDevice, writeMeta, type ProfileMeta } from './store/persist';
import type { SlotSummary } from './ui/profiles';

const PICKED = 'kc:v1:picked';

function session(write?: boolean): boolean {
  try {
    if (write) window.sessionStorage.setItem(PICKED, '1');
    return window.sessionStorage.getItem(PICKED) === '1';
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
    return true;
  }
}

const meta = (): ProfileMeta => readMeta() ?? { slots: [1], current: 1 };
export const slotCount = () => meta().slots.length;
export const isFull = () => meta().slots.length >= MAX_SLOTS;

// What the page should do after a switch reloads it (change C): resume the save, or start a new game.
const INTENT = 'kc:v1:intent';
export type Intent = 'continue' | 'newgame' | 'menu';
function setIntent(i: Intent): void {
  try {
    window.sessionStorage.setItem(INTENT, i);
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
  }
}
/** Reads and clears the intent left by a switch. */
export function takeIntent(): Intent | null {
  try {
    const i = window.sessionStorage.getItem(INTENT);
    window.sessionStorage.removeItem(INTENT);
    return i === 'continue' || i === 'newgame' || i === 'menu' ? i : null;
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
    return null;
  }
}
/** h:mm from milliseconds of play. */
export const playTime = (ms = 0) => `${Math.floor(ms / 3_600_000)}:${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}`;

/** The picker shows after the splash only when the device has more than one player, once per visit. */
export const needsPicker = () => meta().slots.length > 1 && !session();

/** A save worth CONTINUE, a summary box and a place in SWITCH TRAINER (playtest, 12 Oct): a game in progress, a
 * starter, a name, a YELLOW lesson or win, a game played, a Two Players win, anything caught, and anything else
 * earned (data loss review): the MEIR code, a puzzle result, a badge, a trainer beaten or a route solve. Picking a
 * cartridge, settings, a language or an intro seen are not progress, so a brand-new device shows only NEW GAME, PLAY
 * CHESS and OPTION. */
export function hasProgress(n: number): boolean {
  const c = loadFrom<Partial<Campaign>>(n, 'campaign');
  const g = loadFrom<{ pgn?: unknown; fen?: unknown }>(n, 'game');
  // The puzzle record (the first Puzzles mode had no name, starter or catches); MEIR has its own key (13 Oct).
  const t = loadFrom<Partial<Trainer>>(n, 'trainer');
  const puzzles = typeof t === 'object' && t ? (t.solved ?? 0) + (t.missed ?? 0) + (t.assisted ?? 0) : 0;
  return (
    (!!g && typeof g.pgn === 'string' && typeof g.fen === 'string') ||
    !!c?.starter ||
    !!c?.name ||
    // YELLOW has no name step: its save is real once the cartridge is chosen (§B22 item 2).
    loadFrom<string>(n, 'cartridge') === 'yellow' ||
    (c?.path ?? 0) > 0 ||
    (c?.yellowWins ?? 0) > 0 ||
    (loadFrom<number>(n, 'gamesPlayed') ?? 0) > 0 ||
    (loadFrom<number>(n, 'duoWins') ?? 0) > 0 ||
    Object.values(c?.caught ?? {}).some((x) => x > 0) ||
    loadFrom<string>(n, PLAYER_TRAINER) === 'meir' ||
    puzzles > 0 ||
    !!c?.badges?.length ||
    solvedBefore(c)
  );
}

/** One summary per save; empty saves are left out unless `all` (the "replace which save?" list needs every slot). */
export function summaries(all = false): SlotSummary[] {
  return meta().slots.filter((n) => all || hasProgress(n)).map((n) => {
    const c = loadFrom<Partial<Campaign>>(n, 'campaign');
    return {
      n,
      name: c?.name || fmt('profiles.slot', { n: String(n) }),
      named: !!c?.name,
      cart: loadFrom<'yellow' | 'blue'>(n, 'cartridge'),
      trainer: loadFrom<string>(n, PLAYER_TRAINER) === 'meir' ? 'meir' : 'red-gen1',
      lang: loadFrom<string>(n, 'lang') ?? 'en',
      badges: c?.badges?.length ?? 0,
      dex: DEX.filter((s) => c?.caught?.[s]).length,
      time: playTime(c?.playMs),
      lessons: c?.path ?? 0,
      next: loadFrom<string>(n, 'cartridge') === 'yellow' ? null : goalLine(journeyState(c)),
    };
  });
}

// Set once a switch has started its reload (playtest, 12 Oct): a second tap on NEW GAME or a save while the page
// reloads does nothing, so a double tap can't make two saves.
let leaving = false;

/** Loads save n by reloading the page. Any unfinished NEW GAME is left here, unless this reload starts it. */
export function switchTo(n: number, intent: Intent | null = null): void {
  if (leaving) return;
  leaving = true;
  if (intent !== 'newgame') leaveCreating();
  const m = meta();
  if (m.slots.includes(n)) writeMeta({ ...m, current: n });
  session(true);
  if (intent) setIntent(intent);
  location.reload();
}

// A NEW GAME is "being created" until the starter is chosen (§B22 item 2; the name step until playtest 12 Oct). The session flag names both saves,
// "<from>:<new>": the one to go back to and the one being made, so BACK can only ever drop that new one, and only
// while it is the current save (a stale flag once deleted a real save, playtest 12 Oct). From and new are the same
// when NEW GAME reuses an empty save (first launch).
const CREATING = 'kc:v1:creating';
function session2(set?: string | null): string | null {
  try {
    if (set === null) window.sessionStorage.removeItem(CREATING);
    else if (set !== undefined) window.sessionStorage.setItem(CREATING, set);
    return window.sessionStorage.getItem(CREATING);
  } catch (err) {
    console.warn('session storage blocked:', err instanceof Error ? err.name : err);
    return null;
  }
}
function creating(): { from: number; slot: number } | null {
  const [from, slot] = (session2() ?? '').split(':').map(Number);
  return from && slot ? { from, slot } : null;
}
// The session flag is this tab's own, so the device keeps a note too (review fix): save slot to when its NEW GAME
// started, written only when NEW GAME adds or wipes the slot (a save it reuses in place keeps the note it has, renewed).
// Boot drops a save only through its note (data loss review, 12 Oct): a save without one, so every save from before,
// is never dropped, whatever it holds. A note younger than NEW_GAME_HOLD_MS is a NEW GAME some tab is still making;
// an older one is a tab closed mid NEW GAME. Leaving a NEW GAME unfinished (a switch, or BACK on a save it reused)
// dates the note 0, so the next boot drops that save if it is still empty; the starter, YELLOW, or BACK dropping the
// save clear the note.
const NEW_GAMES = 'newGames';
export const NEW_GAME_HOLD_MS = 30 * 60 * 1000;
const newGames = (): Record<string, number> => readDevice<Record<string, number>>(NEW_GAMES) ?? {};
/** Dates save n's note, or clears it (null). */
function noteNewGame(slot: number, at: number | null): void {
  const notes = newGames();
  if (at === null) delete notes[slot];
  else notes[slot] = at;
  if (Object.keys(notes).length) writeDevice(NEW_GAMES, notes);
  else removeDevice(NEW_GAMES);
}
const noted = (n: number): boolean => typeof newGames()[n] === 'number';
/** Save n is being made by NEW GAME in some tab of this device (this one or another), started recently. */
export const beingMade = (n: number, now = Date.now()): boolean => now - (newGames()[n] ?? -Infinity) < NEW_GAME_HOLD_MS;
/** `made`: NEW GAME added or wiped the slot, so it gets a note. */
function beginCreating(from: number, slot: number, made: boolean): void {
  session2(`${from}:${slot}`);
  if (made || noted(slot)) noteNewGame(slot, Date.now());
}
/** A NEW GAME is unnamed and it is save n (the current one by default): BACK, Escape and B drop it. */
export const isCreating = (n = meta().current): boolean => creating()?.slot === n;
/** The NEW GAME reuses the current empty save in place (a fresh device, §B22 item 2): nothing to drop on BACK. */
export const creatingInPlace = (): boolean => {
  const c = creating();
  return !!c && c.from === c.slot && c.slot === meta().current;
};
/** The starter is chosen (or YELLOW): the new save is real now and its note goes, so boot never drops it. */
export function endCreating(): void {
  const c = creating();
  if (c) noteNewGame(c.slot, null);
  session2(null);
}
/** This tab leaves its NEW GAME unfinished: a save NEW GAME made is dated 0, for the next boot to drop if empty. */
export function leaveCreating(): void {
  const c = creating();
  if (c && noted(c.slot)) noteNewGame(c.slot, 0);
  session2(null);
}
/** BACK during NEW GAME: the unnamed save is dropped and the start menu of the previous save comes back. Does
 * nothing (but leave the NEW GAME) unless the save being created is the current one. */
export function abandonNewGame(): void {
  const c = creating();
  const m = meta();
  if (leaving) return;
  if (!c || c.slot !== m.current) return leaveCreating();
  if (c.from === c.slot) {
    // A reused empty save: forget the cartridge, the intro and a MEIR code typed on the way (it had no progress
    // before). The switch dates its note, if NEW GAME made it, so boot drops it while others exist; else it stays.
    for (const key of ['cartridge', 'campaign', PLAYER_TRAINER]) removeFrom(c.slot, key);
    return switchTo(c.slot, 'menu');
  }
  endCreating();
  clearProfile(c.slot);
  const slots = m.slots.filter((x) => x !== c.slot);
  const back = slots.includes(c.from) ? c.from : (slots[0] ?? 1);
  writeMeta({ slots: slots.length ? slots : [1], current: back });
  switchTo(back, 'menu');
}

/** NEW GAME with all 4 slots in use: this save is wiped and a new game starts in its place (after a 2 s hold). */
export function replaceProfile(n: number): void {
  if (leaving) return;
  beginCreating(meta().current, n, true);
  clearProfile(n);
  switchTo(n, 'newgame');
}

/** NEW GAME on a save with no progress (first launch, or after BACK): that save is reused in place, with no reload
 * and no new slot. Returns false when the current save has progress (then addProfile makes a new one). */
export function reuseEmpty(): boolean {
  const n = meta().current;
  if (leaving || hasProgress(n)) return false;
  beginCreating(n, n, false);
  return true;
}

/** A fresh player in the first free slot; it opens on the cartridge shelf. An empty current save is reused instead. */
export function addProfile(): void {
  if (leaving) return;
  const m = meta();
  if (!hasProgress(m.current)) {
    beginCreating(m.current, m.current, false);
    return switchTo(m.current, 'newgame');
  }
  const n = [1, 2, 3, 4].find((x) => !m.slots.includes(x));
  if (!n || m.slots.length >= MAX_SLOTS) return;
  clearProfile(n);
  writeMeta({ slots: [...m.slots, n].sort(), current: m.current });
  beginCreating(m.current, n, true);
  switchTo(n, 'newgame');
}

/** Boot: the slot list, dropping only a save NEW GAME made and left empty (data loss review, 12 Oct): it has a note
 * older than the hold, it is not this tab's NEW GAME and it has no progress; the last save always stays (bootProfiles).
 * Notes go with their saves, and from a save with progress once nobody is making it (named, then its tab closed). */
export function bootSaves(now = Date.now()): ProfileMeta {
  const idle = (n: number) => !beingMade(n, now) && !isCreating(n);
  const m = bootProfiles((n) => noted(n) && idle(n) && !hasProgress(n));
  for (const n of Object.keys(newGames()).map(Number)) if (!m.slots.includes(n) || (idle(n) && hasProgress(n))) noteNewGame(n, null);
  return m;
}

export function renameProfile(n: number, name: string): void {
  saveTo(n, 'campaign', { ...loadFrom<Partial<Campaign>>(n, 'campaign'), name });
}

/** Deletes a player; deleting the last one leaves an empty slot 1. Reloads when the current player went. */
export function deleteProfile(n: number): boolean {
  if (leaving) return true;
  const m = meta();
  clearProfile(n);
  const slots = m.slots.filter((x) => x !== n);
  const next = { slots: slots.length ? slots : [1], current: m.current === n ? (slots[0] ?? 1) : m.current };
  writeMeta(next);
  if (m.current !== n) return false;
  switchTo(next.current);
  return true;
}
