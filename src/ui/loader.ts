// SPDX-License-Identifier: AGPL-3.0-only
// Image load order (load fix): menu icons and the starters first, the current screen's Pokémon as they appear, and
// the battle sprites last, in idle time, two at a time, only once the first screen's images are in. Loading fix,
// 14 Oct: idle work waits while a screen's visible images load, and a priority lane (the boards' stills, cries,
// backs and animated fronts, src/battle/sprites.ts) goes before it, waiting only while a cover or dip holds its
// screen for its images (src/ui/transitions.ts). Review, 14 Oct: the Journey's panel cries (whenIdleFirst) wait like
// idle work, ahead of the rest of it, so a board's cries, backs and fronts never queue behind them.
export const PRIORITY_PARALLEL = 4; // priority lane loads at a time: small files (cries, stills) are round trip bound
export const PAUSE_MAX_MS = 5000; // longest a screen's loading images hold both queues

const queue: (() => Promise<unknown>)[] = [];
const lane: (() => Promise<unknown>)[] = [];
const soon: (() => Promise<unknown>)[] = []; // idle work that goes before the rest (panel cries)
const kept: HTMLImageElement[] = [];
let open = false;
let active = 0;
let laneActive = 0;
let paused = 0; // holds on idle work
let lanePaused = 0; // holds on the priority lane too
let scheduled = false;
const IDLE_PARALLEL = 2;
const OPEN_ANYWAY_MS = 4000;

const idle = (fn: () => void) => ((window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 50)))(fn);

/** Starts loading now, ahead of everything else (hub icons, starters). */
export function preloadNow(urls: string[], done?: () => void): void {
  let left = urls.length;
  if (!left) done?.();
  for (const u of urls) {
    const img = new Image();
    img.fetchPriority = 'high';
    img.onload = img.onerror = () => --left === 0 && done?.();
    img.src = u;
    kept.push(img);
  }
}

const asked = new Set<string>();
/** Fetches and decodes the next screen's stills ahead of its tap (paint lint, 26 Oct; a few KB in all), each once, as
 * idle work ahead of the rest: after the priority lane, so a board's own stills, cries and backs never wait for them
 * (in the lane, the level picker's art held up a board's backs on Slow 4G). */
export function prefetch(urls: string[]): void {
  for (const u of urls) {
    if (asked.has(u)) continue;
    asked.add(u);
    const task = () => {
      const img = new Image();
      img.fetchPriority = 'low';
      img.src = u;
      kept.push(img);
      return img.decode().catch(() => undefined);
    };
    whenIdleFirst(task);
  }
}

/** Queues a low priority load; it starts once the first screen is ready, in idle time. */
export function whenIdle(task: () => Promise<unknown>): void {
  queue.push(task);
  pump();
}

/** Queues a small load (a panel's cry, a few KB) as idle work, ahead of the rest of it: like idle work it waits for
 * the first screen, a screen's loading images and the whole priority lane, so a board drawn meanwhile goes first. */
export function whenIdleFirst(task: () => Promise<unknown>): void {
  soon.push(task);
  pump();
}

/** Queues a load ahead of every idle one (the boards' stills, cries, backs and fronts): it waits only while a cover
 * or dip holds its screen for its images, not for the first screen. */
export function whenFree(task: () => Promise<unknown>): void {
  lane.push(task);
  pump();
}

/** Idle work waits until `until` settles (a screen's visible images loading), at most PAUSE_MAX_MS; the priority lane
 * waits too, for at most `laneMs` (the cover or dip holding the screen until then). */
export function pauseWhile(until: Promise<unknown>, laneMs = 0): void {
  hold(until, PAUSE_MAX_MS, false);
  if (laneMs > 0) hold(until, Math.min(laneMs, PAUSE_MAX_MS), true);
}

const needed = new Set<Promise<unknown>>();
/** The next cover opens only once `p` has settled too (within the cover's cap): an image the screen shows right after
 * its reveal that is not in its DOM yet (the intro card's king over a Classic style board, src/board/board.ts). */
export function neededAtReveal(p: Promise<unknown>): void {
  needed.add(p);
  const drop = () => void needed.delete(p);
  void p.then(drop, drop);
}

/** Settles once everything neededAtReveal() was given has (at once when nothing is pending). */
export const revealNeeds = (): Promise<void> => Promise.all([...needed].map((p) => p.catch(() => undefined))).then(() => undefined);

function hold(until: Promise<unknown>, ms: number, both: boolean): void {
  if (both) lanePaused++;
  else paused++;
  let once = false;
  const end = () => {
    if (once) return;
    once = true;
    window.clearTimeout(cap);
    if (both) lanePaused--;
    else paused--;
    pump();
  };
  const cap = window.setTimeout(end, ms);
  void until.then(end, end);
}

/** Whether a pause holds idle work (tests). */
export const loaderPaused = (): boolean => paused > 0 || lanePaused > 0;

/** Resolves once both queues have run dry (the harness waits on it before a sprite test). */
export function idleDrained(): Promise<void> {
  releaseIdle();
  return new Promise((resolve) => {
    const check = () => (!queue.length && !soon.length && !active && !lane.length && !laneActive ? resolve() : window.setTimeout(check, 50));
    check();
  });
}

/** The first screen's images are in (or it is taking too long): the idle queue may start. */
export function releaseIdle(): void {
  open = true;
  pump();
}
if (typeof window !== 'undefined') window.setTimeout(releaseIdle, OPEN_ANYWAY_MS); // (unit tests import it without a DOM)

/** Starts what may start, in idle time; a pause that began meanwhile is checked again then. */
function pump(): void {
  if (scheduled || lanePaused || (!lane.length && (paused || !open || (!queue.length && !soon.length)))) return;
  scheduled = true;
  idle(() => {
    scheduled = false;
    if (lanePaused) return;
    while (laneActive < PRIORITY_PARALLEL && lane.length) run(lane.shift()!, true);
    // Idle work waits for the whole lane, and for the screen's images; the panel cries go first.
    while (open && !paused && !lane.length && !laneActive && active < IDLE_PARALLEL && (soon.length || queue.length)) run((soon.length ? soon : queue).shift()!, false);
  });
}

function run(task: () => Promise<unknown>, first: boolean): void {
  if (first) laneActive++;
  else active++;
  let p: Promise<unknown>;
  try {
    p = task();
  } catch (err) {
    p = Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
  void p
    .catch((err: unknown) => console.warn('preload failed:', err instanceof Error ? err.message : err))
    .finally(() => {
      if (first) laneActive--;
      else active--;
      pump();
    });
}
