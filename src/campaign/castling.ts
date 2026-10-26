// SPDX-License-Identifier: AGPL-3.0-only
// Castling for new players (playtest, 23 Oct): 141 of Lichess's 143 castling puzzles are rated 1200 or more, and in
// half of them castling is not the first move, so VIRIDIAN FOREST's castling trainers set puzzles a new player could
// not solve. These eight are opening positions where the opponent's last move is the set up and castling is the
// answer: Stockfish 19 (depth 20) ranks castling first or within 2 centipawns of the best move in each, and only
// one castling move is legal, so the puzzle's exact answer accepts any castle. Lichess's own pool returns at
// CASTLE_LICHESS_FROM.
import type { PuzzleRow } from './puzzle';

export const CASTLE_ROWS: PuzzleRow[] = [
  ['castle-ruy', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', 'g8f6 e1g1', 600],
  ['castle-italian', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R b KQkq - 0 5', 'd7d6 e1g1', 620],
  ['castle-nimzo', 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4', 'e2e3 e8g8', 640],
  ['castle-qgd', 'rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR w KQkq - 4 5', 'e2e3 e8g8', 660],
  ['castle-petrov', 'rnbqkb1r/ppp2ppp/8/3p4/3Pn3/3B1N2/PPP2PPP/RNBQK2R b KQkq - 1 6', 'f8e7 e1g1', 680],
  ['castle-scotch', 'r1bqk2r/p1p2ppp/2p2n2/3P4/1b6/2NB4/PPP2PPP/R1BQK2R b KQkq - 0 8', 'c6d5 e1g1', 700],
  ['castle-kid', 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5', 'g1f3 e8g8', 720],
  ['castle-sicilian', 'r1bqk2r/pp2ppbp/2np1np1/8/3NP3/2N5/PPP1BPPP/R1BQ1RK1 w kq - 4 8', 'd4b3 e8g8', 750],
];
