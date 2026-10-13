// SPDX-License-Identifier: AGPL-3.0-only
// What loading.spec.ts and loading-cues.spec.ts watch (loading fix, 14 Oct): a fresh context on a CDP network profile
// (Slow 4G and Fast 4G as in the brief, an empty HTTP cache, the service worker blocked) with a recorder of what the
// player sees and hears, frame by frame, from the page's first script.
import { test, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 };
export const FAST_4G = { offline: false, latency: 165, downloadThroughput: 1_012_500, uploadThroughput: 84_375 };
const ALL_THEMES = ['advancedPawn', 'advantage', 'backRankMate', 'capturingDefender', 'castling', 'deflection', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'fork', 'hangingPiece', 'mateIn1', 'mateIn2', 'pin', 'promotion', 'skewer', 'trappedPiece', 'xRayAttack'];
/** A BLUE save past the warm-up: PIDGEY pawns (the warm-up's first catch puts them there). */
export const SAVE = { v: 2, name: 'JADE', starter: 'bulbasaur', introSeen: true, teamRules: 2, caught: { bulbasaur: 1, pidgey: 1 }, team: { p: 'pidgey' }, warmup: true, lessonsSeen: ALL_THEMES, tips: ['puzzle'], puzzlesStarted: 5, journey: { cleared: [], beaten: [], visited: ['route-1'] } };
/** A late BLUE save (review, 14 Oct): seven badges and every route walked, so the Journey's panel cries (every route's
 * wild Pokémon, the gifts still to come) are about 30 files; no saves in the other tests had more than two routes. */
const ROUTES_ALL = ['route-1', 'viridian-forest', 'route-3', 'route-6', 'route-7', 'route-14', 'route-8', 'route-21', 'route-22'];
export const LATE_SAVE = {
  ...SAVE,
  puzzlesStarted: 40,
  badges: ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano'],
  journey: {
    cleared: ['route-1', 'viridian', 'rival-1', 'viridian-forest', 'route-3', 'rival-2', 'route-6', 'route-7', 'route-14', 'route-8', 'route-21', 'route-22'],
    beaten: ['r1-toby', 'r1-mina', 'rival-1', 'vf-oskar', 'vf-liam', 'vf-pip', 'gym-brock', 'r3-dev', 'r3-rosa', 'r3-finn', 'rival-2', 'gym-misty', 'r6-kai', 'r6-noor', 'gym-ltsurge', 'r7-ines', 'r7-theo', 'gym-erika', 'r14-sasha', 'r14-omar', 'gym-koga', 'r8-june', 'r8-hugo', 'r8-ada', 'gym-sabrina', 'r21-mo', 'r21-lena', 'gym-blaine', 'r22-jun', 'r22-vera'],
    visited: ROUTES_ALL,
  },
};
/** A mate in 1 for Route 1's trainer (the set up a6-a8, then e2-e1). */
export const QUIET1 = ['0BLbM', '8/8/R7/2pk4/8/4p3/PPP1r3/2K5 w - - 0 49', 'a6a8 e2e1', 480];

type KC = Record<string, (...a: unknown[]) => unknown>;
export const kc = <T>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { __kc: KC }).__kc[f as string]!(...(a as unknown[])) as T, [fn, args] as const);

/** Frame by frame what the player sees (in the page, from its first script): the cover, holds, blank board pieces,
 * the intro card when it is inserted, the battle's first frame, cries as they start, and taps. */
function recorder(): void {
  type Img = { w: number; complete: boolean; src: string; mirror?: boolean };
  const w = window as unknown as { __ld: Record<string, unknown> };
  const L = {
    armed: false,
    frames: [] as Record<string, unknown>[],
    intros: [] as { t: number; complete: boolean; w: number; opacity: string }[],
    battles: [] as { t: number; att: Img; def: Img; near: Img; far: Img }[],
    cries: [] as { t: number; url: string; how: string; called?: number }[],
    taps: [] as { t: number; sq: string; id: string; up?: boolean }[],
    encounters: [] as { t: number; complete: boolean; w: number }[],
  };
  w.__ld = L;
  const short = (u: string) => u.replace(/^.*?\/assets\//, '');
  const imgOf = (i: HTMLImageElement | null | undefined): Img => ({ w: i?.naturalWidth ?? 0, complete: !!i?.complete, src: short(i?.currentSrc || i?.src || ''), mirror: !!i?.closest('.mirror') });
  const shown = (e: HTMLElement | null) => !!e && !e.hidden && e.style.opacity !== '0' && getComputedStyle(e).display !== 'none';
  let battleOn = false;
  const tick = () => {
    try {
      sample();
    } catch (err) {
      console.warn('loading.spec recorder:', err);
    }
    requestAnimationFrame(tick);
  };
  const sample = () => {
    if (L.armed) {
      const cov = document.querySelector<HTMLElement>('.screen-cover');
      const board = document.querySelector('.board');
      const blanks: string[] = [];
      let total = 0;
      if (board?.isConnected) {
        for (const sq of board.querySelectorAll<HTMLElement>('.sq[data-piece]')) {
          total++;
          const img = sq.querySelector<HTMLImageElement>('img.piece');
          if (!img || !img.complete || !img.naturalWidth) blanks.push(`${sq.dataset.square!}${img ? `:${short(img.src)}` : ''}`);
        }
      }
      const intro = document.querySelector<HTMLElement>('[data-testid="intro"]');
      const introImg = intro?.querySelector('img');
      L.frames.push({
        t: performance.now(),
        cover: cov ? `${cov.dataset.kind}:${cov.dataset.phase ?? 'up'}` : '',
        // The cover's wait for its images ran out (src/ui/transitions.ts, ?debug=1 only).
        capped: cov?.dataset.capped !== undefined,
        trans: document.documentElement.dataset.transition !== undefined || !!document.querySelector('.board-dip'),
        hold: document.body.dataset.hold ?? '',
        board: !!board?.isConnected,
        total,
        blanks,
        intro: intro ? { op: getComputedStyle(intro.querySelector('.panel') ?? intro).opacity, ok: !!introImg && introImg.complete && introImg.naturalWidth > 0 } : null,
        selected: !!document.querySelector('.sq.selected'),
        skip: document.body.dataset.skippable !== undefined,
        label: document.querySelector<HTMLElement>('.screen-cover .cover-label:not([hidden])')?.textContent ?? '',
        scr: document.querySelector('#app .stage > [data-testid]')?.getAttribute('data-testid') ?? '',
        // Trainer sprites on the screen not drawn yet, and silhouettes standing in.
        tr: [...document.querySelectorAll<HTMLImageElement>('#app .stage img[data-trainer]')].filter((i) => !i.complete || !i.naturalWidth).length,
        sil: document.querySelectorAll('#app .stage .trainer-sprite.loading, #app .stage .trainer-sprite.sil').length,
      });
      const bat = document.querySelector<HTMLElement>('[data-testid="battle"]');
      const on = shown(bat);
      if (on && !battleOn) L.battles.push({ t: performance.now(), att: imgOf(bat!.querySelector('.mon.att img')), def: imgOf(bat!.querySelector('.mon.def img')), near: imgOf(bat!.querySelector('.t-near img')), far: imgOf(bat!.querySelector('.t-far img')) });
      battleOn = on;
      (L as unknown as { battleOn: boolean }).battleOn = on;
    }
  };
  requestAnimationFrame(tick);
  // The intro card and the encounter panel, the moment they are inserted.
  new MutationObserver((recs) => {
    for (const r of recs) {
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const intro = n.matches('[data-testid="intro"]') ? n : n.querySelector<HTMLElement>('[data-testid="intro"]');
        if (intro) {
          const img = intro.querySelector('img');
          L.intros.push({ t: performance.now(), complete: !!img?.complete, w: img?.naturalWidth ?? 0, opacity: getComputedStyle(intro.querySelector('.panel') ?? intro).opacity });
        }
        const enc = n.matches('[data-testid="encounter"]') ? n : n.querySelector<HTMLElement>('[data-testid="encounter"]');
        if (enc) {
          const img = enc.querySelector('img');
          L.encounters.push({ t: performance.now(), complete: !!img?.complete, w: img?.naturalWidth ?? 0 });
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
  // Cries as they start: a Web Audio buffer (traced back to its file) or a media element's 'playing'.
  const urlOf = new WeakMap<object, string>();
  const ab = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function (this: Response) {
    const url = this.url;
    return ab.call(this).then((b) => (urlOf.set(b, url), b));
  };
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer, ...rest: unknown[]) {
    const url = urlOf.get(data) ?? '';
    return (decode as (...a: unknown[]) => Promise<AudioBuffer>).call(this, data, ...rest).then((buf) => (url && urlOf.set(buf, url), buf));
  } as typeof decode;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...a: unknown[]) {
    L.cries.push({ t: performance.now(), url: short((this.buffer && urlOf.get(this.buffer)) ?? ''), how: `buffer:${this.context.state}` });
    return (start as (...x: unknown[]) => void).apply(this, a);
  } as typeof start;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const called = performance.now();
    this.addEventListener('playing', () => L.cries.push({ t: performance.now(), called, url: short(this.currentSrc || this.src), how: 'media' }), { once: true });
    return play.call(this);
  };
  const tapOf = (e: Event) => {
    const at = e.target as Element | null;
    return { t: performance.now(), sq: (at?.closest?.('[data-square]') as HTMLElement | null)?.dataset.square ?? '', id: (at?.closest?.('[data-testid]') as HTMLElement | null)?.dataset.testid ?? '' };
  };
  window.addEventListener('pointerdown', (e) => L.taps.push(tapOf(e)), true);
  window.addEventListener('pointerup', (e) => L.taps.push({ ...tapOf(e), up: true }), true);
}

export type Frame = { t: number; cover: string; capped: boolean; trans: boolean; hold: string; board: boolean; total: number; blanks: string[]; intro: { op: string; ok: boolean } | null; selected: boolean; skip: boolean; label: string; scr: string; tr: number; sil: number };
export type Ld = { frames: Frame[]; intros: { t: number; complete: boolean; w: number; opacity: string }[]; battles: { t: number; att: { w: number; complete: boolean; src: string; mirror: boolean }; def: { w: number; complete: boolean; src: string; mirror: boolean }; near: { w: number; src: string }; far: { w: number; src: string } }[]; cries: { t: number; url: string; how: string; called?: number }[]; taps: { t: number; sq: string; id: string; up?: boolean }[]; encounters: { t: number; complete: boolean; w: number }[]; battleOn: boolean };
export const ld = (page: Page) => page.evaluate(() => (window as unknown as { __ld: Ld }).__ld);
export const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
export const FEN_D5 = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

/** The recorder saw battle number `n` (from 0) come and go. */
export async function battleOver(page: Page, n: number): Promise<void> {
  await page.waitForFunction((i) => (window as unknown as { __ld: Ld }).__ld.battles.length > i, n, { timeout: 30_000 });
  await page.waitForFunction(() => !(window as unknown as { __ld: Ld }).__ld.battleOn, null, { timeout: 30_000 });
}
export const arm = (page: Page) => page.evaluate(() => ((window as unknown as { __ld: { armed: boolean; frames: unknown[] } }).__ld.armed = true));
export const now = (page: Page) => page.evaluate(() => performance.now());

/** A fresh context (empty HTTP cache) on a network profile, the recorder in, `store` seeded once. */
export async function fresh(browser: Browser, store: Record<string, unknown>, net: typeof SLOW_4G | null, cpu = 4, reducedMotion: 'reduce' | 'no-preference' = 'no-preference', newDevice = false): Promise<{ context: BrowserContext; page: Page }> {
  // The config's storage (the BLUE cartridge) unless `newDevice`: nothing stored at all.
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion, ...(newDevice ? { storageState: { cookies: [], origins: [] } } : {}) });
  await context.addInitScript(recorder);
  await context.addInitScript((kv) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
  }, store);
  const page = await context.newPage();
  if (net) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', net);
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  return { context, page };
}

/** Boots on ?debug=1 and leaves the splash once the first screen's own loads are done (a player reads it). */
export async function boot(page: Page, query = '?debug=1', tap = true): Promise<void> {
  await page.goto(`./${query}`, { timeout: 120_000 });
  await page.getByTestId('screen-splash').waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => performance.getEntriesByType('resource').filter((r) => /assets\/(front|retro|trainers)\//.test(r.name)).length >= 4, null, { timeout: 60_000 }).catch(() => undefined);
  if (tap) await page.getByTestId('screen-splash').click({ timeout: 60_000 });
}

/** The first frame at or after `t0` where `pred` holds. */
export const firstFrame = (frames: Frame[], t0: number, pred: (f: Frame) => boolean) => frames.find((f) => f.t >= t0 && pred(f));
/** Every frame from `from` on that shows a blank piece. */
export const blankFrames = (frames: Frame[], from: number) => frames.filter((f) => f.t >= from && f.board && f.blanks.length > 0);

export const cartBlue = { 'kc:v1:cartridge': 'blue' };
export const blueSave = { ...cartBlue, 'kc:v1:campaign': SAVE };
