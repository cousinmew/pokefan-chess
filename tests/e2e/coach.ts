// SPDX-License-Identifier: AGPL-3.0-only
// A save's first puzzle shows three coach marks, once per save (W3): your team, the goal, and after the set up move
// "They moved. Now find your move!". The set up move waits for the first two (fix, 14 Oct), so a spec that walks a
// save's first puzzle taps them away as a player does, and checks they really showed.
import { expect, type Page } from '@playwright/test';

/** The three marks in English, in order (strings.en.json coach.you with TEAM RED, coach.goal, coach.them). */
export const COACH_EN = ['These are yours: TEAM RED, at the bottom.', 'Your goal is always up here.', 'They moved. Now find your move!'];

interface Bubble {
  text: string;
  x: number;
  y: number;
  /** What a tap on the bubble would act on: the layer ignores the pointer, so the tap reaches what is under it. */
  under: string;
}

/** Taps through the first puzzle's three coach marks like a player, in any language: each bubble must show, and its
 * centre, where the tap lands, must not lie over a control (nor over a square once the board is yours). Afterwards the
 * marks are gone and the board takes the next tap. Returns the three lines. */
export async function passCoach(page: Page, timeout = 15_000): Promise<string[]> {
  const lines: string[] = [];
  for (let i = 0; i < 3; i++) {
    // The next bubble: the first two before the set up move, the third once it has landed.
    const next = await page.waitForFunction(
      ({ last, board }) => {
        const coach = document.querySelector<HTMLElement>('[data-testid="coach"]');
        const bubble = coach?.querySelector<HTMLElement>('.coach-bubble');
        const text = coach?.querySelector('.coach-text')?.textContent ?? '';
        if (!coach?.isConnected || coach.hidden || !bubble || !text || text === last) return false;
        const r = bubble.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const acts = document.elementFromPoint(x, y)?.closest(`button, input, select, textarea, a, label, [role="menuitem"]${board ? ', [data-square]' : ''}`);
        return { text, x, y, under: acts ? acts.outerHTML.slice(0, 100) : '' };
      },
      { last: lines.at(-1) ?? '', board: i === 2 },
      { timeout },
    );
    const bubble = (await next.jsonValue()) as Bubble;
    expect(bubble.under, `coach mark ${i + 1} ("${bubble.text}") lies over something a tap acts on`).toBe('');
    lines.push(bubble.text);
    await page.mouse.click(bubble.x, bubble.y);
  }
  await expect(page.getByTestId('coach')).toBeHidden();
  expect(new Set(lines).size, `three different coach marks: ${lines.join(' | ')}`).toBe(3);
  return lines;
}
