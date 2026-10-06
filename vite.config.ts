// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, type Plugin } from 'vitest/config';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Which music cues have a real file; the rest play the procedural chiptune (src/audio/music.ts).
const musicFiles = existsSync('public/audio') ? readdirSync('public/audio').filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)) : [];
// Sprites with a smaller animated WebP made by fetch-assets (load fix); the rest stay GIF.
const webp = ['front', 'back', 'shiny/front', 'shiny/back'].flatMap((d) => (existsSync(`public/assets/${d}`) ? readdirSync(`public/assets/${d}`).filter((f) => f.endsWith('.webp')).map((f) => `${d}/${f.slice(0, -5)}`) : []));

/** Stamps the service worker with this build, so a deploy starts a fresh sprite cache (load fix). */
function stampWorker(): Plugin {
  return {
    name: 'stamp-sw',
    apply: 'build',
    closeBundle() {
      const sw = join('dist', 'sw.js');
      if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD__', Date.now().toString(36)));
    },
  };
}

export default defineConfig({
  base: './',
  define: { __MUSIC_FILES__: JSON.stringify(musicFiles), __WEBP__: JSON.stringify(webp) },
  plugins: [stampWorker()],
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
