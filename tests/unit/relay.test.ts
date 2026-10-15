// SPDX-License-Identifier: AGPL-3.0-only
// Trust fix (14 Oct): ?debug=1&relay=... points the game at a relay on this machine only (the e2e suite's
// `wrangler dev`). A link naming any other host falls back to RELAY_URL, so a shared "room invite" can never send
// feedback notes, a save upload or an online game to someone else's server.
import { describe, expect, it } from 'vitest';
import { RELAY_URL } from '../../src/config';
import { localRelay, relayBase } from '../../src/net/online';

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
