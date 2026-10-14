// SPDX-License-Identifier: AGPL-3.0-only
// Cards and boxes over the screen (pacing, 12 Oct, §3 of the spec). The modal layer's dim fades in when it opens and
// every card pops in (CSS); here: each panel put in the modal ignores input for CARD_GUARD_MS (a story box guards each
// of its lines itself, LINE_GUARD_MS), and a trainer slides in only on its first appearance since the modal opened,
// so Brock no longer enters twice (story, then his "wants to battle!" card). Also the Gen 1 "!" over a trainer.
import { TRAINER_SPOT_MS } from '../config';
import { guard } from './pace';

const seen = new Set<string>();

function once(sprite: HTMLElement): void {
  const id = sprite.querySelector('img')?.dataset.trainer ?? 'sil';
  if (seen.has(id)) sprite.classList.remove('slide-in');
  else {
    seen.add(id);
    sprite.classList.add('slide-in');
  }
}

/** Once at boot, on the modal layer. */
export function watchModal(modal: HTMLElement): void {
  new MutationObserver((records) => {
    // Hidden at the end of a task: the sequence is over and the next one slides its trainers in again. Hidden and
    // shown again in one task (a story box handing over to a card) is the same sequence.
    if (modal.hidden) return seen.clear();
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.parentElement === modal && n.classList.contains('panel') && !n.classList.contains('story')) guard(n);
        if (n.classList.contains('trainer-sprite')) once(n);
        n.querySelectorAll<HTMLElement>('.trainer-sprite').forEach(once);
      }
    }
  }).observe(modal, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
}

/** A4: the modal opens clear (it blocks input, nothing dims yet) and a Gen 1 "!" pops over the tapped trainer row or
 * ▶ card for TRAINER_SPOT_MS; then the dim fades in under the card `then` puts up. */
export function trainerSpot(modal: HTMLElement, anchor: Element | null, then: () => void): void {
  modal.replaceChildren();
  modal.classList.add('clear');
  modal.hidden = false;
  const mark = document.createElement('span');
  mark.className = 'trainer-spot';
  mark.dataset.testid = 'trainer-spot';
  mark.textContent = '!';
  const r = anchor?.getBoundingClientRect();
  if (r && r.width) Object.assign(mark.style, { left: `${r.left + r.width / 2}px`, top: `${Math.max(24, r.top)}px` });
  modal.onclick = null;
  modal.append(mark);
  window.setTimeout(() => {
    const live = mark.isConnected && !modal.hidden; // show() cleared the modal meanwhile: nothing acts later (bugs #8)
    mark.remove();
    if (!live) return;
    modal.classList.remove('clear');
    then();
  }, TRAINER_SPOT_MS);
}
