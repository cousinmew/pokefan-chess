// SPDX-License-Identifier: AGPL-3.0-only
// Shapes shared by the game controller (main.ts) and the modes it drives.
import type { AiLevel, DEFAULT_SETTINGS } from './config';
import type { Board } from './board/board';
import type { Color, Role } from './board/pieces';
import type { Overlay } from './battle/overlay';
import type { Game, Outcome } from './game/chess';
import type { Engine } from './ai/engine';
import type { TextBox } from './ui/textBox';
import type { OnlineGame } from './net/onlineGame';
import type { PuzzleGame } from './campaign/puzzleGame';
import type { JourneyGame } from './campaign/journeyGame';
import type { DrillStatus } from './campaign/drill';
import type { Rng } from './game/rng';

export type Mode = 'two-players' | 'computer' | 'online' | 'puzzle' | 'challenge' | 'path';

/** A Journey game vs the computer (Victory Road drills, Champion BLUE): optional move limit, result to the Journey. */
export interface Challenge {
  fen?: string;
  level: AiLevel;
  limit?: number;
  onEnd(result: DrillStatus): void;
}
export interface Setup {
  mode: Mode;
  human: Color;
  level: AiLevel;
}
export interface SavedGame extends Setup {
  fen: string;
  pgn: string;
}

export interface App {
  game: Game;
  board: Board;
  text: TextBox;
  overlay: Overlay;
  settings: typeof DEFAULT_SETTINGS;
  mode: Mode;
  level: AiLevel;
  human: Color;
  engine: Engine;
  online: OnlineGame;
  puzzle: PuzzleGame;
  campaignRng: Rng;
  journey: JourneyGame;
  aiFailed: boolean;
  ended: boolean;
  busy: boolean;
  playMove(from: string, to: string, promotion?: Role): Outcome | null;
  restart(fen?: string): void;
  setMode(mode: Mode, level?: AiLevel, human?: Color): void;
  takeBack(): boolean;
}
