// SPDX-License-Identifier: AGPL-3.0-only
// Installable web app (§B18 item 2): the service worker caches the app shell so it opens offline. Install for
// offline play (owner, 12 Oct): Chromium's install prompt is caught at boot and offered from OPTION; iOS gets the
// Share steps; once installed, the core files are fetched into the cache (src/net/offline.ts). Considerate warm up:
// on its own it runs once per build per device and never on data saver or 2G; asked for (install, the OPTION button),
// it is never held back.
import { sparing, warmable, warmUp, type Connection } from './net/offline';
import { readDevice, writeDevice } from './store/persist';

/** At boot: the install listeners first (they work under ?debug too), then the service worker. */
export function registerShell(): void {
  listenForInstall();
  if (!('serviceWorker' in navigator) || new URLSearchParams(location.search).has('debug')) return;
  navigator.serviceWorker.register('./sw.js').catch((err: unknown) => console.warn('offline cache unavailable:', err instanceof Error ? err.message : err));
}

/** Chromium's install prompt event (not in lib.dom). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** installed: runs as an app; prompt: Chromium can install now; ios: Share → Add to Home Screen; none: no way here. */
export type InstallState = 'installed' | 'prompt' | 'ios' | 'none';
/** Warm up progress: null when idle or not possible, 0 to 100 while fetching, 'ready' when done. */
export type WarmState = number | 'ready' | null;

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

/** kc:v1:dev:offlineBuild: the build whose core files all got cached on this device (after a complete warm up). */
const OFFLINE_BUILD = 'offlineBuild';
/** This build is ready here from an earlier launch, so it stays ready without asking the worker again. */
const readyHere = () => readDevice<string>(OFFLINE_BUILD) === __BUILD__;
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;

export const warmState = (): WarmState => warm ?? (readyHere() ? 'ready' : null);

/** Calls `f` whenever the install or warm up state changes; returns the unsubscribe. */
export function onInstallChange(f: () => void): () => void {
  watchers.add(f);
  return () => watchers.delete(f);
}

let warming: Promise<void> | null = null;

/** Fetches the core files into the cache once, reporting progress to the watchers. No service worker: nothing to do.
 * One run at a time (accepting the prompt and appinstalled both ask), progress only goes up, and once ready it stays
 * ready (review fix). A complete run remembers the worker's build on this device. */
export function getReadyOffline(): void {
  if (warmState() === 'ready' || warming || !warmable()) return;
  warm = 0;
  changed();
  const progress = (pct: number) => {
    if (typeof warm !== 'number' || pct <= warm) return;
    warm = pct;
    changed();
  };
  warming = warmUp(progress).then((build) => {
    if (build) writeDevice(OFFLINE_BUILD, build);
    warm = build ? 'ready' : null;
    warming = null;
    changed();
  });
}

/** Not asked for (an app launch, OPTION in an installed app): only while this build is not ready on this device, and
 * never on data saver or 2G, where OPTION offers it as a button instead (offlineHeld). */
export function autoWarm(): void {
  if (installState() === 'installed' && warmState() === null && !sparing(connection())) getReadyOffline();
}

/** An installed app whose automatic warm up waits for data saver or 2G: OPTION shows the line and the button. */
export const offlineHeld = (): boolean => installState() === 'installed' && warmState() === null && !warming && warmable() && sparing(connection());

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
