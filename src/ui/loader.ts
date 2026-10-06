// SPDX-License-Identifier: AGPL-3.0-only
// Image load order (load fix): menu icons and the starters first, the current screen's Pokémon as they appear, and
// the battle sprites last, in idle time, two at a time, only once the first screen's images are in.
const queue: (() => Promise<unknown>)[] = [];
const kept: HTMLImageElement[] = [];
let open = false;
let active = 0;
const IDLE_PARALLEL = 2;
const OPEN_ANYWAY_MS = 4000;

const idle = (fn: () => void) => ((window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 50)))(fn);

/** Starts loading now, ahead of everything else (hub icons, starters). */
export function preloadNow(urls: string[], done?: () => void): void {
  let left = urls.length;
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

/** Resolves once the idle queue has run dry (the harness waits on it before a sprite test). */
export function idleDrained(): Promise<void> {
  releaseIdle();
  return new Promise((resolve) => {
    const check = () => (!queue.length && !active ? resolve() : window.setTimeout(check, 50));
    check();
  });
}

/** The first screen's images are in (or it is taking too long): the idle queue may start. */
export function releaseIdle(): void {
  open = true;
  pump();
}
window.setTimeout(releaseIdle, OPEN_ANYWAY_MS);

function pump(): void {
  while (open && active < IDLE_PARALLEL && queue.length) {
    const task = queue.shift()!;
    active++;
    idle(() => {
      void task().finally(() => {
        active--;
        pump();
      });
    });
  }
}
