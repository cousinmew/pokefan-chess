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
  use: {
    baseURL: live ?? 'http://localhost:4173',
    // The offline service worker would bypass page.route mocks; the PWA test opts back in.
    serviceWorkers: 'block',
    // Tests start on the BLUE cartridge, as a returning player; the shelf test clears this to see first launch.
    storageState: { cookies: [], origins: [{ origin: new URL(live ?? 'http://localhost:4173').origin, localStorage: [{ name: 'kc:v1:cartridge', value: '"blue"' }] }] },
  },
  projects: [
    // @slow (the full gym walk, ~3 min) runs only in CI, before every deploy; the local gate skips it.
    { name: 'chromium', grepInvert: process.env.CI ? /@webkit|@fxsheet|@spritesheet|@hubsheet|@i18nsheet|@legibilitysheet|@perf/ : /@webkit|@fxsheet|@spritesheet|@hubsheet|@i18nsheet|@legibilitysheet|@slow|@perf/, use: { browserName: 'chromium', launchOptions: existsSync(pinned) ? { executablePath: pinned } : {} } },
    // Review sheets for docs/, only with SHEETS=1 (npm run sheets), so the gate never rewrites them.
    ...(process.env.SHEETS
      ? [
          { name: 'spritesheet', grep: /@spritesheet/, use: { browserName: 'chromium' as const, viewport: { width: 1000, height: 800 } } },
          { name: 'legibilitysheet', grep: /@legibilitysheet/, use: { browserName: 'chromium' as const } },
          { name: 'i18nsheet', grep: /@i18nsheet/, use: { browserName: 'chromium' as const } },
          { name: 'hubsheet', grep: /@hubsheet/, use: { browserName: 'chromium' as const } },
          { name: 'fxsheet', grep: /@fxsheet/, use: { browserName: 'chromium' as const, viewport: { width: 360, height: 640 } } },
        ]
      : []),
    // Slow 4G sprite timings (§ load fix), only with PERF=1.
    ...(process.env.PERF ? [{ name: 'perf', grep: /@perf/, use: { browserName: 'chromium' as const } }] : []),
    // Mobile Safari engine: tests tagged @webkit run only here, @both run here and in chromium.
    { name: 'webkit-iphone', grep: /@webkit|@both/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: live
    ? undefined
    : [
        { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 30000 },
        // Local relay for the online tests; a 5 s reconnect window stands in for the real 60 s.
        { command: 'npm --prefix worker run dev -- --port 8788 --inspector-port 9239 --var RECONNECT_MS:5000 --var ALLOWED_ORIGINS:http://localhost:4173 --var FEEDBACK_TOKEN:local-test-token --var TEST_CLIENTS:1', url: 'http://localhost:8788/health', reuseExistingServer: true, timeout: 90000, env: { WRANGLER_SEND_METRICS: 'false' } },
      ],
});
