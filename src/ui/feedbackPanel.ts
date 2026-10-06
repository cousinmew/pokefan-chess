// SPDX-License-Identifier: AGPL-3.0-only
// Player feedback (§B21 item 3): three buttons (Bug, Too hard, Fun) and an optional short note. The version, screen
// and language are attached; nothing else, and the hint asks children not to write their name.
import { currentLang, fmt } from '../game/text';
import { context, sendFeedback, type FeedbackNote } from '../net/feedback';
import { button, el, toast } from './dom';

export const FEEDBACK_TEXT_MAX = 200;

export function feedbackButton(): HTMLElement {
  const box = el('div', 'feedback-box');
  const open = button('feedback.option', () => box.replaceChildren(form()), 'feedback', 'secondary');
  box.append(open);
  const form = () => {
    const f = el('div', 'feedback-form');
    const text = el('textarea');
    text.maxLength = FEEDBACK_TEXT_MAX;
    text.placeholder = fmt('feedback.hint');
    text.dataset.testid = 'feedback-text';
    const send = (kind: FeedbackNote['kind']) => async () => {
      // Sent, or kept on the device to send later (§B23 item 2): either way the note is safe.
      const res = await sendFeedback({ kind, ...context(currentLang()), text: text.value.slice(0, FEEDBACK_TEXT_MAX) });
      toast(res === 'sent' ? 'feedback.thanks' : 'relay.queued');
      box.replaceChildren(open);
    };
    const row = el('div', 'feedback-kinds');
    row.append(button('feedback.bug', send('bug'), 'feedback-bug'), button('feedback.hard', send('hard'), 'feedback-hard'), button('feedback.fun', send('fun'), 'feedback-fun'));
    f.append(el('p', '', 'feedback.title'), text, row);
    return f;
  };
  return box;
}
