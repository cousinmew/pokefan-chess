// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  },
};
// Object.keys(localStorage) lists the stored keys; the Map stands in through a Proxy.
const ls = (window as unknown as { localStorage: object }).localStorage;
(window as unknown as { localStorage: object }).localStorage = new Proxy(ls, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });

const { bootProfiles, load, save, useProfile, profileData, restoreProfile } = await import('../../src/store/persist');
const { packSave, unpackSave, isSaveFile } = await import('../../src/store/backup');
const { normalizeSaveCode, SAVE_CODE_RE } = await import('../../src/net/saveCode');

afterEach(() => store.clear());

describe('save slots (§B18 item 2)', () => {
  it('moves a save from before profiles into slot 1, once', () => {
    store.set('kc:v1:cartridge', '"blue"');
    store.set('kc:v1:campaign', '{"name":"JADE"}');
    const m = bootProfiles();
    expect(m).toEqual({ slots: [1], current: 1 });
    expect(store.get('kc:v1:p1:cartridge')).toBe('"blue"');
    expect(store.has('kc:v1:cartridge')).toBe(false);
    expect(load<{ name: string }>('campaign')?.name).toBe('JADE');
    expect(JSON.parse(store.get('kc:v1:profiles')!)).toEqual({ slots: [1], current: 1 });
  });

  it('keeps slots apart', () => {
    store.set('kc:v1:profiles', JSON.stringify({ slots: [1, 2], current: 2 }));
    bootProfiles();
    save('lang', 'he');
    useProfile(1);
    expect(load('lang')).toBeNull();
    expect(store.get('kc:v1:p2:lang')).toBe('"he"');
  });

  it('exports and imports a profile, minus device only keys', () => {
    bootProfiles();
    save('campaign', { name: 'SKY', badges: ['boulder'] });
    save('room:ABCD', 'seat');
    const file = packSave(1);
    expect(isSaveFile(file)).toBe(true);
    expect(Object.keys(file.data).sort()).toEqual(['campaign']);
    expect(unpackSave(JSON.parse(JSON.stringify(file)), 2)).toBe(true);
    expect(profileData(2)).toEqual({ campaign: { name: 'SKY', badges: ['boulder'] } });
    expect(unpackSave({ app: 'other', v: 1, data: {} }, 2)).toBe(false);
    restoreProfile(3, { 'bad key!': 1, ok: 2 });
    expect(profileData(3)).toEqual({ ok: 2 });
  });

  it('reads save codes the way people type them', () => {
    expect(normalizeSaveCode('abcd-2345')).toBe('ABCD2345');
    expect(SAVE_CODE_RE.test('ABCD2345')).toBe(true);
    expect(SAVE_CODE_RE.test('ABCD1O45')).toBe(false);
  });
});
