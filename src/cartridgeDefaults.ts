// SPDX-License-Identifier: AGPL-3.0-only
// A player's first YELLOW launch sets YELLOW's defaults once (moved out of main.ts): Quick battles (§B17), Big badge
// pieces (§B19 item 3) and the Classic battle style (§B18 item 6). The settings can change them after.
import { YELLOW_DEFAULT_ANIM, type DEFAULT_SETTINGS } from './config';
import { load, save } from './store/persist';

/** True when it changed the settings (they are saved here). */
export function firstYellowDefaults(settings: typeof DEFAULT_SETTINGS): boolean {
  let changed = false;
  if (!load<boolean>('yellowAnim')) {
    settings.anim = YELLOW_DEFAULT_ANIM;
    settings.pieceStyle = 'badge';
    save('yellowAnim', true);
    changed = true;
  }
  if (!load<boolean>('yellowStyle')) {
    settings.battleStyle = 'classic';
    save('yellowStyle', true);
    changed = true;
  }
  if (changed) save('settings', settings);
  return changed;
}
