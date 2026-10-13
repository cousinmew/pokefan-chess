// SPDX-License-Identifier: AGPL-3.0-only
// Considerate warm up (12 Oct): data saver and 2G hold the automatic offline download back (src/net/offline.ts).
import { describe, expect, it } from 'vitest';
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
