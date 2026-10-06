// SPDX-License-Identifier: AGPL-3.0-only
// Sends one piece of feedback to the relay (§B21 item 3). No names, no emails, no accounts.
import { relayBase } from './online';

export interface FeedbackNote {
  kind: 'translation' | 'bug' | 'hard' | 'fun';
  lang: string;
  version: string;
  screen: string;
  key?: string;
  current?: string;
  suggestion?: string;
  note?: string;
  text?: string;
}

export async function sendFeedback(note: FeedbackNote): Promise<boolean> {
  try {
    const res = await fetch(`${relayBase()}/feedback`, { method: 'POST', body: JSON.stringify(note), headers: { 'Content-Type': 'application/json' } });
    return res.ok;
  } catch (err) {
    console.warn('feedback not sent:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** What every note carries: the game version, the screen and the language. */
export const context = (lang: string) => ({ lang, version: __VERSION__, screen: document.body.dataset.screen ?? '' });
