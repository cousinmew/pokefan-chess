// SPDX-License-Identifier: AGPL-3.0-only
// Sends feedback to the relay (§B21 item 3). No names, no emails, no accounts. When the relay can't be reached
// (§B23 item 2: down, or over its daily budget) the note waits on this device, at most 20, and is retried on the next
// launch and every 5 minutes while the game is open.
import { readDevice, writeDevice } from '../store/persist';
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

export const FEEDBACK_QUEUE_MAX = 20;
export const FEEDBACK_RETRY_MS = 5 * 60_000;
const QUEUE = 'feedbackQueue';

/** 'sent', 'dropped' (the relay refused it as malformed, so retrying is pointless) or 'failed' (try again later). */
async function post(note: FeedbackNote): Promise<'sent' | 'dropped' | 'failed'> {
  try {
    const res = await fetch(`${relayBase()}/feedback`, { method: 'POST', body: JSON.stringify(note), headers: { 'Content-Type': 'application/json' } });
    if (res.ok) return 'sent';
    return res.status === 400 || res.status === 413 ? 'dropped' : 'failed';
  } catch (err) {
    console.warn('feedback not sent:', err instanceof Error ? err.message : err);
    return 'failed';
  }
}

export const queued = (): FeedbackNote[] => readDevice<FeedbackNote[]>(QUEUE) ?? [];

/** Sends now, or keeps it for later: 'sent' or 'queued'. */
export async function sendFeedback(note: FeedbackNote): Promise<'sent' | 'queued'> {
  if ((await post(note)) !== 'failed') return 'sent';
  writeDevice(QUEUE, [...queued(), note].slice(-FEEDBACK_QUEUE_MAX));
  return 'queued';
}

/** Sends what is waiting, oldest first; stops at the first failure and keeps the rest. */
export async function flushFeedback(): Promise<number> {
  const waiting = queued();
  let done = 0;
  for (const note of waiting) {
    if ((await post(note)) === 'failed') break;
    done++;
  }
  if (done) writeDevice(QUEUE, waiting.slice(done));
  return done;
}

/** On launch, and every 5 minutes while open. */
export function startFeedbackRetry(): void {
  if (queued().length) void flushFeedback();
  window.setInterval(() => queued().length && void flushFeedback(), FEEDBACK_RETRY_MS);
}

/** What every note carries: the game version, the screen and the language. */
export const context = (lang: string) => ({ lang, version: __VERSION__, screen: document.body.dataset.screen ?? '' });
