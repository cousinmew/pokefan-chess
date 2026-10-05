// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const pinned = '/opt/pw-browsers/chromium';
export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'line',
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: existsSync(pinned) ? { executablePath: pinned } : {},
  },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 30000 },
});
