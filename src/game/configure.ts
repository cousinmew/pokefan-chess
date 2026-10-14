// SPDX-License-Identifier: AGPL-3.0-only
// Sets the game up for a mode before its board shows (moved out of main.ts, 14 Oct): who wears Red's look, each
// side's team, the looks, and the controller's mode, side and level.
import type { Look } from '../../worker/src/protocol';
import type { App, Mode, Setup } from '../appTypes';
import { setSkins, setWears, type Color, type TeamSkin } from '../board/pieces';
import type { Campaign } from '../campaign/kanto';
import { withoutRival, yourPuzzleTeam } from '../campaign/rivalTeam';
import { applyLooks, computerTeam, type Side } from '../look';
import type { DuoSide } from '../startFlow';

export interface ConfigureHost {
  app: App;
  /** The warm-up's bar never stays under another game (W5). */
  stopPath(): void;
  /** YELLOW's own team for Play and Friend (fix 3), else null. */
  yellowSkins(mode: Mode, human: Color): Partial<Record<Color, TeamSkin>> | null;
  campaign(): Campaign;
  look(): Look;
  guest(): boolean;
  duo(): Record<Color, DuoSide> | null;
  /** Who set the puzzle; a `team` of theirs plays on their side (C10). */
  puzzleOpponent(): Side | undefined;
  /** A Journey game's computer side: Champion BLUE's party (C9); empty for a drill. */
  challengeTeam(computer: Color): Partial<Record<Color, TeamSkin>>;
}

/** Returns the colour wearing Red's look in the game on the board (W3: you, in puzzles and the Path). */
export function configure(h: ConfigureHost, setup: Setup): Color {
  const { app } = h;
  if (setup.mode !== 'path') h.stopPath();
  const c = h.campaign();
  const duo = h.duo();
  const red = setup.mode === 'puzzle' || setup.mode === 'path' ? setup.human : 'w';
  setWears(red); // W3: there you are always TEAM RED, whatever colour you play
  // Skins (§B5): your team on your side vs Computer; online sets both sides from the relay.
  const ys = h.yellowSkins(setup.mode, setup.human);
  const cpu: Color = setup.human === 'w' ? 'b' : 'w'; // vs Computer, the trainer brings their own team (change B)
  const mine = (skin: TeamSkin) => withoutRival(skin, c.starter, h.look().stage ?? 2); // no rival's starter on your side (playtest, 12 Oct)
  const theirs = setup.mode === 'computer' ? { [cpu]: computerTeam(setup.level, cpu, c.starter) } : {};
  if (duo && setup.mode === 'two-players') setSkins({ w: duo.w.team, b: duo.b.team });
  else if (ys) setSkins({ ...theirs, ...ys });
  else if (setup.mode === 'computer') setSkins({ ...theirs, [setup.human]: h.guest() ? {} : mine(c.team) });
  else if (setup.mode === 'puzzle' || setup.mode === 'path') {
    const them = setup.mode === 'puzzle' ? h.puzzleOpponent()?.team : null; // a rival brings their own team (C10)
    setSkins({ ...(them ? { [cpu]: them } : {}), ...(h.guest() || !c.starter ? {} : { [setup.human]: yourPuzzleTeam(c, h.look().stage ?? 2) }) }); // W3, design D; BLUE's warm-up (W5); what a rival avoids
  } else if (setup.mode === 'challenge') setSkins({ ...h.challengeTeam(cpu), [setup.human]: mine({}) }); // your default team, no rival's starter in it (review, 14 Oct); Champion BLUE his party (§B14, C9)
  else if (setup.mode !== 'online') setSkins({});
  if (setup.mode !== 'online') applyLooks({ w: h.look(), b: h.look() });
  app.mode = setup.mode;
  app.human = setup.mode === 'two-players' ? 'w' : setup.human;
  app.board.mine = app.human;
  app.board.groundAll = setup.mode === 'puzzle'; // a soft shadow under every one of your pieces (design D)
  app.level = setup.level;
  app.aiFailed = false;
  return red;
}
