// SPDX-License-Identifier: AGPL-3.0-only
// What the game says about a turn (C2, C4 and C8, 14 Oct): lines name the people on the plates, Take back says what it
// undid, and YELLOW's one line keeps the check.
import type { Line } from './text';
import { fmt } from './text';

/** Whose move it is: "{name} to move" where plates name the sides (vs Computer, Two Players, online, the Journey's
 * games), else the team the colour wears (W3). */
export const turnLine = (name: string | undefined, team: 'red' | 'rocket'): string => (name ? fmt('turn.named', { name }) : fmt(team === 'red' ? 'turn.red' : 'turn.rocket'));

/** "X wants to battle!" by the opponent's plate name, else the team line (`fallback`). */
export const introLine = (name: string | undefined, fallback: 'intro.vsRocket' | 'intro.vsRed'): string => (name ? fmt('intro.named', { name }) : fmt(fallback));

/** Take back's line: one move, or the computer's reply and yours (newest first, the order they slide back). */
export function tookBack(moves: { piece: string; square: string }[]): string {
  const said = moves.map((m) => fmt('moved', m));
  return said.length > 1 ? fmt('takeback.two', { theirs: said[0]!, yours: said[1]! }) : fmt('takeback.one', { move: said[0] ?? '' });
}

/** YELLOW's single line (§B17): the check when a move also checks, since "in danger" is what the child must act on;
 * else the first line. */
export const oneLine = (lines: Line[]): Line[] => (lines.length ? [lines.find((l) => l.key === 'check') ?? lines[0]!] : []);
