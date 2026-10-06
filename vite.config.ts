// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'vitest/config';
import { existsSync, readdirSync } from 'node:fs';

// Which music cues have a real file; the rest play the procedural chiptune (src/audio/music.ts).
const musicFiles = existsSync('public/audio') ? readdirSync('public/audio').filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)) : [];

export default defineConfig({
  base: './',
  define: { __MUSIC_FILES__: JSON.stringify(musicFiles) },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
