// SPDX-License-Identifier: AGPL-3.0-only
// YELLOW's My Team controller (fix 3): the picker screen, the skins for Play and Friend, and a win's unlock.
// Reads and writes the shared save directly, so BLUE and YELLOW always see the same stickers and team.
import type { Color, TeamSkin } from '../board/pieces';
import { loadCampaign, saveCampaign, type Campaign } from './kanto';
import { classicTeam, countWin, grantUnlocks, pick, yellowSkin, type YellowSlot } from './yellowTeam';
import { yellowTeamScreen } from '../ui/yellowTeam';

export interface YellowHost {
  show(view: HTMLElement): void;
  home(): void;
  /** Keeps the in memory save in step (main's journey.campaign). */
  saved(c: Campaign): void;
}

export class YellowMode {
  constructor(private readonly host: YellowHost) {}

  private store(c: Campaign): void {
    saveCampaign(c);
    this.host.saved(c);
  }

  team(slot: YellowSlot = 'p'): void {
    const c = loadCampaign();
    this.host.show(
      yellowTeamScreen(c, slot, (s) => this.team(s), {
        pick: (s, id) => (this.store(pick(loadCampaign(), s, id)), this.team(s)),
        classic: () => (this.store(classicTeam(loadCampaign())), this.team(slot)),
        back: () => this.host.home(),
      }),
    );
  }

  /** The YELLOW team plays in Play (your side) and Friend (the first player); the King stays Pikachu. */
  skins(mode: string, human: Color): Partial<Record<Color, TeamSkin>> | null {
    if (mode !== 'computer' && mode !== 'two-players') return null;
    return { [mode === 'computer' ? human : 'w']: yellowSkin(loadCampaign()) };
  }

  /** A win vs Computer after the 12 lessons unlocks the next sticker: saved now, and returned for the end panel to
   * show (C5, 14 Oct: a toast at the mate was gone before the panel came). */
  win(): string[] {
    const { campaign, got } = grantUnlocks(countWin(loadCampaign()));
    this.store(campaign);
    return got;
  }
}
