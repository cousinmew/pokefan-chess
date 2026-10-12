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
 * Every species vs Computer and the story can show before the Journey's wild encounters: the two default teams, each
 * computer trainer's team (with BLUE's answers to each starter), BLUE's story stages, the three starters and their
 * evolutions, and Route 1 (Oak's warm-up plays your own team; its first catch PIDGEY and its trainers' teams).
 */
function offlineSpecies(): string[] {
  const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
  const roster = json<{ teams: Record<string, { pieces: Record<string, string | Record<string, string>> }> }>('src/data/roster.gen1.json');
  const trainers = json<{ trainers: Record<string, { team: Record<string, string>; byStarter?: Record<string, Record<string, string>> }> }>('src/data/trainer-teams.json').trainers;
  const kanto = json<{ starters: string[]; evolutions: { from: string; to: string }[] }>('src/data/kanto.json');
  const journey = json<{ places: { id: string; trainers?: { team: string[] }[] }[] }>('src/data/journey.kanto.json');
  const ids = new Set(Object.values(roster.teams).flatMap((t) => Object.values(t.pieces).flatMap((p) => (typeof p === 'string' ? [p] : Object.values(p)))));
  const add = (team: Record<string, string | undefined>) => Object.values(team).forEach((id) => id && ids.add(id));
  for (const t of Object.values(trainers)) [t.team, ...Object.values(t.byStarter ?? {})].forEach(add);
  // Red's stage table in src/board/stages.ts (read as text: importing it here would pull the game's modules into the
  // config). Rocket's stages are computer trainers, above.
  const red = /const RED\b[^=]*=\s*\[([\s\S]*?)\];/.exec(readFileSync('src/board/stages.ts', 'utf8'))?.[1];
  if (!red) throw new Error('offline list: Red stage table not found in src/board/stages.ts');
  for (const [, id] of red.matchAll(/:\s*'([a-z-]+)'/g)) ids.add(id!);
  const line = [...kanto.starters];
  for (const id of line) for (const e of kanto.evolutions) if (e.from === id && !line.includes(e.to)) line.push(e.to);
  line.forEach((id) => ids.add(id));
  ids.add('pidgey'); // the warm-up's first catch (src/campaign/warmup.ts FIRST_CATCH)
  for (const t of journey.places.find((p) => p.id === 'route-1')?.trainers ?? []) t.team.filter((id) => !id.startsWith('@')).forEach((id) => ids.add(id));
  return [...ids];
}

/**
 * Writes dist/offline.json, the core files Install for offline play caches (the service worker fetches them, sw.js):
 * every code chunk and stylesheet (puzzle sets included), the engine, icons and art, and the sprites and cries of
 * offlineSpecies(). Wild encounters are cached as they are first shown, so the list stays a few MB.
 */
function offlineList(): Plugin {
  return {
    name: 'offline-list',
    apply: 'build',
    closeBundle() {
      if (!existsSync('dist')) return;
      const dir = (d: string) => (existsSync(join('dist', d)) ? readdirSync(join('dist', d), { withFileTypes: true }).filter((f) => f.isFile()).map((f) => `${d}/${f.name}`) : []);
      const has = (f: string) => existsSync(join('dist', f));
      const species = (JSON.parse(readFileSync('src/data/kanto.json', 'utf8')) as { species: Record<string, { dex: number }> }).species;
      const dexes = offlineSpecies().map((id) => species[id]?.dex).filter((d): d is number => typeof d === 'number');
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
