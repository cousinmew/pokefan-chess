// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const pinned = '/opt/pw-browsers/chromium';
// LIVE_URL=https://.../ runs the shell spec against the deployed site instead of vite preview.
const live = process.env.LIVE_URL;
export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'line',
  retries: 0,
  use: { baseURL: live ?? 'http://localhost:4173' },
  projects: [
    { name: 'chromium', grepInvert: /@webkit/, use: { browserName: 'chromium', launchOptions: existsSync(pinned) ? { executablePath: pinned } : {} } },
    // Mobile Safari engine: the capture battle must play on a phone (tests tagged @webkit).
    { name: 'webkit-iphone', grep: /@webkit/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: live ? undefined : { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 30000 },
});
