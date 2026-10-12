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

/**
 * Writes dist/offline.json, the core files Install for offline play fetches into the cache (src/net/offline.ts):
 * every code chunk and stylesheet (puzzle sets included), the engine, icons and art, and the sprites and cries of
 * the two vs Computer teams. Other sprites are cached as they are first shown, so the list stays a few MB.
 */
function offlineList(): Plugin {
  return {
    name: 'offline-list',
    apply: 'build',
    closeBundle() {
      if (!existsSync('dist')) return;
      const dir = (d: string) => (existsSync(join('dist', d)) ? readdirSync(join('dist', d), { withFileTypes: true }).filter((f) => f.isFile()).map((f) => `${d}/${f.name}`) : []);
      const has = (f: string) => existsSync(join('dist', f));
      const roster = JSON.parse(readFileSync('src/data/roster.gen1.json', 'utf8')) as { species: Record<string, { dex: number }>; teams: Record<string, { pieces: Record<string, string | Record<string, string>> }> };
      const ids = new Set(Object.values(roster.teams).flatMap((t) => Object.values(t.pieces).flatMap((p) => (typeof p === 'string' ? [p] : Object.values(p)))));
      const dexes = [...ids].map((id) => roster.species[id]?.dex).filter((d): d is number => typeof d === 'number');
      const sprites = dexes.flatMap((d) => [
        ...['front', 'back'].map((k) => (has(`assets/${k}/${d}.webp`) ? `assets/${k}/${d}.webp` : `assets/${k}/${d}.gif`)),
        `assets/static/front/${d}.png`,
        `assets/retro/${d}.png`,
        `assets/cries/${d}.ogg`,
        `assets/cries/${d}.mp3`,
      ]);
      const files = ['index.html', 'manifest.webmanifest', ...dir('assets').filter((f) => /\.(js|css)$/.test(f)), ...dir('engine'), ...dir('icons'), ...dir('art'), ...dir('assets/items'), ...dir('assets/trainers'), ...dir('audio'), ...sprites].filter(has);
      writeFileSync(join('dist', 'offline.json'), JSON.stringify({ files }));
    },
  };
}

export default defineConfig({
  base: './',
  define: { __MUSIC_FILES__: JSON.stringify(musicFiles), __WEBP__: JSON.stringify(webp), __VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [stampWorker(), offlineList()],
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
