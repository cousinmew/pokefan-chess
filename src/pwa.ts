// SPDX-License-Identifier: AGPL-3.0-only
// Installable web app (§B18 item 2): the service worker caches the app shell so it opens offline. Install for
// offline play (owner, 12 Oct): Chromium's install prompt is caught at boot and offered from OPTION; iOS gets the
// Share steps; once installed, the core files are fetched into the cache (src/net/offline.ts). Considerate warm up:
// on its own it runs once per build per device and never on data saver or 2G; asked for (install, the OPTION button),
// it is never held back.
import { readyBuild, sparing, UNKNOWN, warmable, warmUp, type Connection } from './net/offline';
import { readDevice, writeDevice } from './store/persist';

/** At boot: the install listeners first (they work under ?debug too), then the service worker. A new worker taking
 * control (a deploy) is asked again whether its build is ready (N4, 14 Oct). */
export function registerShell(): void {
  listenForInstall();
  if (!('serviceWorker' in navigator) || new URLSearchParams(location.search).has('debug')) return;
  navigator.serviceWorker.register('./sw.js').catch((err: unknown) => console.warn('offline cache unavailable:', err instanceof Error ? err.message : err));
  navigator.serviceWorker.addEventListener('controllerchange', recheck);
}

/** Chromium's install prompt event (not in lib.dom). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** installed: runs as an app; prompt: Chromium can install now; ios: Share → Add to Home Screen; none: no way here. */
export type InstallState = 'installed' | 'prompt' | 'ios' | 'none';
/** Warm up progress: null when idle, not known yet or not possible, 0 to 100 once the worker answers, 'ready' when
 * done, 'failed' when the last run found no worker or did not finish (OPTION says to try again later). */
export type WarmState = number | 'ready' | 'failed' | null;

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
let warm: WarmState = null;
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((f) => f());

const media = (q: string) => window.matchMedia?.(q).matches ?? false;
/** Running as an installed app (any display mode the manifest can give), or from the iOS home screen. */
export const isStandalone = (): boolean =>
  ['standalone', 'fullscreen', 'minimal-ui'].some((m) => media(`(display-mode: ${m})`)) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** iPhone and iPad (iPadOS reports a Mac with touch): no install prompt API, only Add to Home Screen. */
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function installState(): InstallState {
  if (installedNow || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  return isIos() ? 'ios' : 'none';
}

/** kc:v1:dev:offlineBuild: the worker build whose core files all got cached on this device (a complete warm up). */
const OFFLINE_BUILD = 'offlineBuild';
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;

/** Ready here from an earlier launch: null until the check answers (once per worker), or while it cannot be asked. */
let readyHere: boolean | null = null;
let checking: Promise<boolean | null> | null = null;
/** The build whose worker last said ready (a complete run, or the check): a 'ready' belongs to that build only. */
let readyFrom: string | null = null;
/** A complete warm up noted on this device is ready only while the newest worker still has it in its build's cache (fix,
 * 13 Oct: Chromium can evict Cache Storage and keep localStorage, so the note alone made a launch skip it and OPTION
 * say ready). The worker names its build, so a new build is not ready until its own run, and the page's code carries
 * no build id (its chunks keep their hashes from build to build). No note: not ready, nothing to ask. No controller (a
 * hard reload): no answer, so nothing is held or failed, and the next check (OPTION, a new controller) asks again (N4,
 * 14 Oct). A 'ready' from another build's worker goes once a newer worker says it is not ready. */
function checkReady(): Promise<boolean | null> {
  checking ??= (readDevice<string>(OFFLINE_BUILD) !== null && warmable() ? readyBuild() : Promise.resolve(null)).then((build) => {
    if (build === UNKNOWN) {
      checking = null;
      readyHere = null;
      return null;
    }
    readyHere = build !== null;
    if (build) {
      writeDevice(OFFLINE_BUILD, build);
      if (warm === null || warm === 'failed') warm = 'ready';
      if (warm === 'ready') readyFrom = build;
    } else if (warm === 'ready' && readyFrom !== null) {
      warm = null;
      readyFrom = null;
    }
    changed();
    return readyHere;
  });
  return checking;
}

/** Another worker controls the page now (a deploy): its build's readiness is asked again, and an installed app that
 * is not ready gets ready for it (N4, 14 Oct: the outgoing worker could answer first and leave a false "Ready to play
 * offline" for the session). */
function recheck(): void {
  checking = null;
  readyHere = null;
  autoWarm();
}

export const warmState = (): WarmState => warm;

/** Calls `f` whenever the install or warm up state changes; returns the unsubscribe. */
export function onInstallChange(f: () => void): () => void {
  watchers.add(f);
  return () => watchers.delete(f);
}

let warming: Promise<void> | null = null;

/** Fetches the core files into the cache once, reporting progress to the watchers. No service worker: nothing to do.
 * One run at a time (accepting the prompt and appinstalled both ask), progress only goes up, and once ready it stays
 * ready (review fix). Progress shows only once the worker answers, and a run that finds none or does not finish ends
 * 'failed' instead of the line just going away (fix, 13 Oct). A complete run remembers the worker's build here. */
export function getReadyOffline(): void {
  if (warm === 'ready' || warming || !warmable()) return;
  const progress = (pct: number) => {
    if (warm === 'ready' || (typeof warm === 'number' && pct <= warm)) return;
    warm = pct;
    changed();
  };
  warming = warmUp(progress).then((build) => {
    if (build) writeDevice(OFFLINE_BUILD, build);
    warm = build ? 'ready' : 'failed';
    readyFrom = build;
    warming = null;
    changed();
  });
}

/** Not asked for (an app launch, OPTION): checks once per worker whether this device is ready; an installed app that is
 * not gets ready, except on data saver or 2G, where OPTION offers it as a button instead (offlineHeld). After a failed
 * run, opening OPTION tries again. No answer (no controller): nothing starts. */
export function autoWarm(): void {
  void checkReady().then((ready) => {
    if (ready === false && warm !== 'ready' && installState() === 'installed' && !sparing(connection())) getReadyOffline();
  });
}

/** An installed app, not ready here, whose automatic warm up waits for data saver or 2G (or whose run there failed):
 * OPTION shows why and the button. Never before the check answered, so a ready app does not flash it. */
export const offlineHeld = (): boolean =>
  installState() === 'installed' && readyHere === false && (warm === null || warm === 'failed') && warmable() && sparing(connection());

/** Opens Chromium's install prompt; the outcome, or 'unavailable' when there is no prompt to show. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null; // a prompt can be shown only once
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') getReadyOffline();
    changed();
    return outcome;
  } catch (err) {
    console.warn('install prompt failed:', err instanceof Error ? err.message : err);
    changed();
    return 'unavailable';
  }
}

/** Keep Chromium's install prompt for OPTION, and note an install made from the browser menu. */
function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    installedNow = true;
    deferred = null;
    getReadyOffline();
    changed();
  });
  // Opened as an app: make sure this build's core files are cached (a new build, or the first iOS home screen launch).
  if (isStandalone()) window.setTimeout(autoWarm, 3000);
}
