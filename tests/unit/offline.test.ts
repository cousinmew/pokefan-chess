// SPDX-License-Identifier: AGPL-3.0-only
// Considerate warm up (12 Oct): data saver and 2G hold the automatic offline download back (src/net/offline.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sparing } from '../../src/net/offline';

describe('sparing: no automatic warm up', () => {
  it('on data saver, whatever the speed', () => {
    expect(sparing({ saveData: true, effectiveType: '4g' })).toBe(true);
    expect(sparing({ saveData: true })).toBe(true);
  });

  it('on 2G and slow 2G', () => {
    expect(sparing({ saveData: false, effectiveType: '2g' })).toBe(true);
    expect(sparing({ effectiveType: 'slow-2g' })).toBe(true);
  });

  it('not on 3G, 4G, or where the browser does not say (Safari, Firefox)', () => {
    expect(sparing({ saveData: false, effectiveType: '3g' })).toBe(false);
    expect(sparing({ saveData: false, effectiveType: '4g' })).toBe(false);
    expect(sparing({})).toBe(false);
    expect(sparing(undefined)).toBe(false);
  });
});

// N4 (14 Oct): the ready check after a deploy, after a hard reload, and before it answers. Browser globals are
// stand-ins here; the e2e side is in tests/e2e/install.spec.ts.
type Listener = () => void;
function browser(o: { controller: object | null; standalone?: boolean; saveData?: boolean; note?: string; active?: object }) {
  const swListeners: Record<string, Listener[]> = {};
  const store = new Map<string, string>(o.note ? [['kc:v1:dev:offlineBuild', JSON.stringify(o.note)]] : []);
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('window', {
    setTimeout: (f: () => void, ms: number) => globalThis.setTimeout(f, ms),
    clearTimeout: (t: number) => globalThis.clearTimeout(t),
    caches: {},
    addEventListener: () => undefined,
    matchMedia: (q: string) => ({ matches: !!o.standalone && q === '(display-mode: standalone)' }),
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
  vi.stubGlobal('navigator', {
    userAgent: 'test',
    platform: 'Linux',
    maxTouchPoints: 0,
    connection: { saveData: !!o.saveData },
    serviceWorker: {
      controller: o.controller,
      register: () => Promise.resolve({}),
      getRegistration: () => Promise.resolve({ installing: null, waiting: null, active: o.active ?? o.controller ?? {} }),
      addEventListener: (type: string, f: Listener) => (swListeners[type] ??= []).push(f),
      removeEventListener: () => undefined,
    },
  });
  return { store, fire: (type: string) => (swListeners[type] ?? []).forEach((f) => f()) };
}

describe('readyBuild: no controller is no answer', () => {
  beforeEach(() => (vi.resetModules(), vi.useFakeTimers()));
  afterEach(() => (vi.useRealTimers(), vi.unstubAllGlobals()));

  it("a registration that controls nothing (a hard reload) answers 'unknown', not 'not ready'", async () => {
    browser({ controller: null });
    const { readyBuild } = await import('../../src/net/offline');
    const answer = readyBuild();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await answer).toBe('unknown');
  });

  it("a worker done activating that controls nothing answers 'unknown' at once: its claim is over (review, 14 Oct)", async () => {
    browser({ controller: null, active: { state: 'activated' } });
    const { readyBuild } = await import('../../src/net/offline');
    let answer: string | null | undefined;
    void readyBuild().then((a) => (answer = a));
    await vi.advanceTimersByTimeAsync(0);
    expect(answer).toBe('unknown');
  });

  it('a worker still activating: the check waits for the claim, and a warm up asked for always waits', async () => {
    browser({ controller: null, active: { state: 'activating' } });
    const { readyBuild } = await import('../../src/net/offline');
    let answer: string | null | undefined;
    void readyBuild().then((a) => (answer = a));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(answer).toBe('unknown');
    vi.resetModules();
    browser({ controller: null, active: { state: 'activated' } });
    const { warmUp } = await import('../../src/net/offline');
    let warmed: string | null | undefined;
    void warmUp(() => undefined).then((b) => (warmed = b));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(warmed).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(warmed).toBeNull();
  });
});

describe('pwa: what the ready check claims', () => {
  beforeEach(() => (vi.resetModules(), vi.useFakeTimers()));
  afterEach(() => (vi.useRealTimers(), vi.unstubAllGlobals(), vi.doUnmock('../../src/net/offline')));
  const withWorker = async (answers: (string | null)[], warmed: string | null = null) => {
    const readyBuild = vi.fn(() => Promise.resolve(answers.shift() ?? null));
    const warmUp = vi.fn((progress: (n: number) => void) => (progress(50), Promise.resolve(warmed)));
    vi.doMock('../../src/net/offline', async (orig) => ({ ...(await orig<typeof import('../../src/net/offline')>()), readyBuild, warmUp }));
    return { readyBuild, warmUp, pwa: await import('../../src/pwa') };
  };

  it("'unknown' (no controller): no held line, no warm up, no ready; the next OPTION open asks again", async () => {
    browser({ controller: null, standalone: true, saveData: true, note: 'b1' });
    const { readyBuild, warmUp, pwa } = await withWorker(['unknown', 'b1']);
    pwa.autoWarm();
    await vi.advanceTimersByTimeAsync(0);
    expect(pwa.offlineHeld()).toBe(false);
    expect(pwa.warmState()).toBeNull();
    expect(warmUp).not.toHaveBeenCalled();
    pwa.autoWarm(); // OPTION again
    await vi.advanceTimersByTimeAsync(0);
    expect(readyBuild).toHaveBeenCalledTimes(2);
    expect(pwa.warmState()).toBe('ready');
  });

  it("the check's state for OPTION: asking, then 'unknown' with a re-render, then answered on the next ask", async () => {
    browser({ controller: null, standalone: true, saveData: true, note: 'b1' });
    const { pwa } = await withWorker(['unknown', 'b1']);
    expect(pwa.checkState()).toBeNull();
    const renders: unknown[] = [];
    pwa.onInstallChange(() => renders.push(pwa.checkState()));
    pwa.autoWarm();
    expect(pwa.checkState()).toBe('asking');
    await vi.advanceTimersByTimeAsync(0);
    expect(renders).toEqual(['unknown']);
    pwa.autoWarm();
    await vi.advanceTimersByTimeAsync(0);
    expect(pwa.checkState()).toBe('answered');
  });

  it('a new worker taking over: a ready answer from the one before is asked again, and the new build gets ready once', async () => {
    const b = browser({ controller: {}, standalone: true, note: 'b1' });
    const { warmUp, pwa } = await withWorker(['b1', null], 'b2');
    pwa.registerShell();
    pwa.autoWarm();
    await vi.advanceTimersByTimeAsync(0);
    expect(pwa.warmState()).toBe('ready');
    b.fire('controllerchange'); // build b2 activates; its cache has no complete warm up yet
    await vi.advanceTimersByTimeAsync(0);
    expect(warmUp).toHaveBeenCalledTimes(1);
    expect(pwa.warmState()).toBe('ready');
    expect(b.store.get('kc:v1:dev:offlineBuild')).toBe('"b2"');
  });

  it('the same build still ready after a controller change: no warm up, never a step back from ready', async () => {
    const b = browser({ controller: {}, standalone: true, note: 'b1' });
    const { warmUp, pwa } = await withWorker(['b1', 'b1'], 'b1');
    const seen: unknown[] = [];
    pwa.onInstallChange(() => seen.push(pwa.warmState()));
    pwa.registerShell();
    pwa.autoWarm();
    await vi.advanceTimersByTimeAsync(0);
    b.fire('controllerchange');
    await vi.advanceTimersByTimeAsync(0);
    expect(warmUp).not.toHaveBeenCalled();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'ready')).toBe(true);
  });
});
