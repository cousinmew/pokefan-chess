// SPDX-License-Identifier: AGPL-3.0-only
// Copies the Stockfish lite single threaded build into public/engine/ (§4.6). Gitignored, refreshed on install.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/engine', { recursive: true });
for (const ext of ['js', 'wasm']) copyFileSync(`node_modules/stockfish/bin/stockfish-19-lite-single.${ext}`, `public/engine/stockfish-19-lite-single.${ext}`);
console.log('copy-engine: public/engine ready');
