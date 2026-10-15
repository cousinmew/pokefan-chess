// SPDX-License-Identifier: AGPL-3.0-only
// Trust fix (14 Oct): ?debug=1&relay=... points the game at a relay on this machine only (the e2e suite's
// `wrangler dev`). A link naming any other host falls back to RELAY_URL, so a shared "room invite" can never send
// feedback notes, a save upload or an online game to someone else's server.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELAY_URL } from '../../src/config';
import { localRelay, relayBase } from '../../src/net/online';
import { deleteSave } from '../../src/net/saveCode';

const q = (relay: string, debug = true) => `?${debug ? 'debug=1&' : ''}relay=${encodeURIComponent(relay)}`;

describe('relayBase', () => {
  it.each(['http://localhost:8788', 'http://localhost:9', 'http://127.0.0.1:8788', 'https://localhost:8443'])('uses a relay on this machine: %s', (r) => {
    expect(relayBase(q(r))).toBe(new URL(r).origin);
  });

  it.each([
    'https://evil.example',
    'https://pokefan-chess-relay.attacker.workers.dev',
    'http://localhost.evil.example:8788',
    'http://evil.example/?h=localhost',
    'http://user@evil.example',
    'http://192.168.1.5:8788',
    'http://[::1]:8788',
    'javascript:alert(1)',
    'ws://localhost:8788',
    'file:///etc/passwd',
    'not a url',
  ])('falls back to RELAY_URL for an outside or odd origin: %s', (r) => {
    expect(relayBase(q(r))).toBe(RELAY_URL);
  });

  it('ignores ?relay= without ?debug, and an empty one', () => {
    expect(relayBase(q('http://localhost:8788', false))).toBe(RELAY_URL);
    expect(relayBase('?debug=1&relay=')).toBe(RELAY_URL);
    expect(relayBase('')).toBe(RELAY_URL);
  });

  it('keeps only the origin, never a path, query or credentials', () => {
    expect(localRelay('http://localhost:8788/extra?x=1#y')).toBe('http://localhost:8788');
    expect(localRelay('http://me:pw@localhost:8788')).toBe('http://localhost:8788');
    expect(localRelay(null)).toBeNull();
  });
});

// Delete my save code (15 Oct): only the relay's 204 means the copy is gone. A relay deployed before DELETE /save/:code
// answers 404 (its catch-all) or a proxy 405 while it still holds the save, and a browser stops a cross-origin DELETE
// at its CORS preflight (a network error): each must throw, so the game keeps the code and says it was not deleted.
describe('deleteSave', () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (res: Response | Error) => {
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => (calls.push([url, init]), res instanceof Error ? Promise.reject(res) : res));
    return calls;
  };

  it('resolves on 204, what the relay answers whether or not a copy was left', async () => {
    const calls = answer(new Response(null, { status: 204 }));
    await expect(deleteSave('ABCD2345')).resolves.toBeUndefined();
    expect(calls).toEqual([[`${RELAY_URL}/save/ABCD2345`, { method: 'DELETE' }]]);
  });

  it.each([
    [404, 'not found'],
    [405, 'method not allowed'],
    [200, 'ok'],
    [500, 'error code: 1101'],
    [503, 'relay unavailable, try again later'],
  ])('throws on %i, so the code is kept', async (status, body) => {
    answer(new Response(body, { status }));
    await expect(deleteSave('ABCD2345')).rejects.toThrow(`relay answered ${status}`);
  });

  it('throws when the request never gets an answer (offline, or the CORS preflight of an old relay)', async () => {
    answer(new TypeError('Failed to fetch'));
    await expect(deleteSave('ABCD2345')).rejects.toThrow('Failed to fetch');
  });
});
