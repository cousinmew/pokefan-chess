// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, type Plugin } from 'vitest/config';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

// Which music cues have a real file; the rest play the procedural chiptune (src/audio/music.ts).
const musicFiles = existsSync('public/audio') ? readdirSync('public/audio').filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)) : [];
// Sprites with a smaller animated WebP made by fetch-assets (load fix); the rest stay GIF.
const webp = ['front', 'back', 'shiny/front', 'shiny/back'].flatMap((d) => (existsSync(`public/assets/${d}`) ? readdirSync(`public/assets/${d}`).filter((f) => f.endsWith('.webp')).map((f) => `${d}/${f.slice(0, -5)}`) : []));

// One id per build: the service worker's caches are named after it (stampWorker), and the page learns it from the
// worker (src/net/offline.ts readyBuild), so an automatic offline warm up runs once per build per device (src/pwa.ts).
// Only sw.js carries it: the page's chunks keep their hashes when the code does not change (fix, 13 Oct).
const BUILD = Date.now().toString(36);

/** The build's output folder as resolved (N3, 14 Oct: --outDir is honoured; CI and deploy use dist/). */
let outDir = resolve('dist');
function resolvedOut(): Plugin {
  return {
    name: 'resolved-out-dir',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
  };
}

/** Every file under assets/<folder>/ (sprites, cries, trainers, items) with its size: what the asset cache holds. */
function assetFiles(dir: string): string[] {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(join(d, f.name)) : [`${join(d, f.name).slice(dir.length + 1)} ${statSync(join(d, f.name)).size}`]));
  const root = join(dir, 'assets');
  return existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((f) => f.isDirectory()).flatMap((f) => walk(join(root, f.name))).sort() : [];
}

/**
 * Stamps the service worker with this build (its code cache and ready mark, so a deploy starts a fresh code cache) and
 * with the asset set (N2, 14 Oct): a short hash of every file under assets/<folder>/ with its size. Sprite, cry,
 * trainer and item URLs never change between builds, so their cache keeps its name, and its files, across deploys
 * until the set itself changes.
 */
function stampWorker(): Plugin {
  return {
    name: 'stamp-sw',
    apply: 'build',
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const assets = createHash('sha256').update(assetFiles(outDir).join('\n')).digest('hex').slice(0, 10);
      writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD__', BUILD).replaceAll('__ASSETS__', assets));
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
      if (!existsSync(outDir)) return;
      const dir = (d: string) => (existsSync(join(outDir, d)) ? readdirSync(join(outDir, d), { withFileTypes: true }).filter((f) => f.isFile()).map((f) => `${d}/${f.name}`) : []);
      const has = (f: string) => existsSync(join(outDir, f));
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
      writeFileSync(join(outDir, 'offline.json'), JSON.stringify({ files }));
    },
  };
}

/**
 * Only English is in the entry chunk (N1, 14 Oct); a device that saved another language waits for its tables before
 * boot (src/i18n.ts). A small inline script starts those downloads next to the entry chunk's, from the storage keys
 * bootLangs reads, so a French save does not pay one more round trip before its splash.
 */
function preloadSavedLanguage(): Plugin {
  return {
    name: 'preload-saved-language',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files: Record<string, string[]> = {};
        for (const c of Object.values(ctx.bundle ?? {})) {
          const lang = c.type === 'chunk' ? /\/src\/data\/(?:strings|names)\.([\w-]+)\.json$/.exec(c.facadeModuleId ?? '')?.[1] : undefined;
          if (lang) (files[lang] ??= []).push(`./${c.fileName}`);
        }
        const preload = (map: Record<string, string[]>) => {
          try {
            const s = localStorage;
            const want = [new URLSearchParams(location.search).get('review')];
            for (let i = 0; i < s.length; i++) if (/^kc:v1:(p\d+:)?lang$/.test(s.key(i) ?? '')) want.push(JSON.parse(s.getItem(s.key(i)!) ?? 'null') as string);
            for (const l of want) for (const href of map[l ?? ''] ?? []) document.head.append(Object.assign(document.createElement('link'), { rel: 'modulepreload', href }));
          } catch (err) {
            console.warn('language preload skipped:', err);
          }
        };
        return [{ tag: 'script', children: `(${preload.toString()})(${JSON.stringify(files)})`, injectTo: 'head' }];
      },
    },
  };
}

/**
 * Trust fix, 14 Oct: the built page may connect only to itself, the relay (RELAY_URL, read from src/config.ts so the
 * URL lives in one place) and a relay on this machine (the e2e suite's wrangler dev; src/net/online.ts honours
 * ?relay= only for localhost). The browser then enforces README's "the only server the game talks to is its own",
 * whatever a link says. Build only, so the dev server's own socket is left alone.
 */
function connectPolicy(): Plugin {
  return {
    name: 'connect-policy',
    apply: 'build',
    transformIndexHtml() {
      const relay = /RELAY_URL = '(https:\/\/[^']+)'/.exec(readFileSync('src/config.ts', 'utf8'))?.[1];
      if (!relay) throw new Error('connect policy: RELAY_URL missing from src/config.ts');
      const local = ['localhost', '127.0.0.1'].flatMap((h) => [`http://${h}:*`, `ws://${h}:*`]);
      const content = `connect-src 'self' ${relay} ${relay.replace(/^https:/, 'wss:')} ${local.join(' ')}`;
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content }, injectTo: 'head-prepend' as const }];
    },
  };
}

export default defineConfig({
  base: './',
  define: { __MUSIC_FILES__: JSON.stringify(musicFiles), __WEBP__: JSON.stringify(webp), __VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [resolvedOut(), stampWorker(), offlineList(), preloadSavedLanguage(), connectPolicy()],
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
