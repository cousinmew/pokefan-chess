// SPDX-License-Identifier: AGPL-3.0-only
// Image load order (load fix): menu icons and the starters first, the current screen's Pokémon as they appear, and
// the battle sprites last, in idle time, two at a time, only once the first screen's images are in. Loading fix,
// 13 Oct: idle work waits while a screen's visible images load, and a priority lane (the boards' stills, cries,
// backs and animated fronts, src/battle/sprites.ts) goes before it, waiting only while a cover or dip holds its
// screen for its images (src/ui/transitions.ts).
export const PRIORITY_PARALLEL = 4; // priority lane loads at a time: small files (cries, stills) are round trip bound
export const PAUSE_MAX_MS = 5000; // longest a screen's loading images hold both queues

const queue: (() => Promise<unknown>)[] = [];
const lane: (() => Promise<unknown>)[] = [];
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

/** Queues a low priority load; it starts once the first screen is ready, in idle time. */
export function whenIdle(task: () => Promise<unknown>): void {
  queue.push(task);
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
    const check = () => (!queue.length && !active && !lane.length && !laneActive ? resolve() : window.setTimeout(check, 50));
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
  if (scheduled || lanePaused || (!lane.length && (paused || !open || !queue.length))) return;
  scheduled = true;
  idle(() => {
    scheduled = false;
    if (lanePaused) return;
    while (laneActive < PRIORITY_PARALLEL && lane.length) run(lane.shift()!, true);
    // Idle work waits for the whole lane, and for the screen's images.
    while (open && !paused && !lane.length && !laneActive && active < IDLE_PARALLEL && queue.length) run(queue.shift()!, false);
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
