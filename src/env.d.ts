// SPDX-License-Identifier: AGPL-3.0-only
/** Music cues with a file in public/audio/ at build time (vite.config.ts). */
declare const __MUSIC_FILES__: string[];
/** Sprites ("front/25", "shiny/back/6") that have a smaller animated WebP next to the GIF (vite.config.ts). */
declare const __WEBP__: string[];
/** The game version from package.json (vite.config.ts), attached to feedback. */
declare const __VERSION__: string;
