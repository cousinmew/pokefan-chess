// SPDX-License-Identifier: AGPL-3.0-only
// Gen 1 style text box: flavour line, teaching caption, blinking tick.
import { fmt, type Line } from '../game/text';

export class TextBox {
  readonly el: HTMLElement;
  private readonly main: HTMLElement;
  private readonly caption: HTMLElement;
  lastKeys: string[] = [];

  constructor(private readonly captionsOn: () => boolean) {
    this.el = document.createElement('div');
    this.el.className = 'textbox';
    this.el.innerHTML = '<p class="tb-main" data-testid="text-main"></p><p class="tb-caption" data-testid="text-caption"></p><span class="tb-tick" aria-hidden="true">▼</span>';
    this.main = this.el.querySelector('.tb-main') as HTMLElement;
    this.caption = this.el.querySelector('.tb-caption') as HTMLElement;
  }

  show(lines: Line[]): void {
    if (!lines.length) return;
    this.lastKeys = lines.map((l) => l.key);
    this.main.textContent = lines.map((l) => fmt(l.key, l.vars)).join(' ');
    const caps = lines.flatMap((l) => (l.caption ? [fmt(l.caption)] : []));
    this.caption.textContent = this.captionsOn() ? caps.join(' · ') : '';
  }

  plain(text: string): void {
    this.main.textContent = text;
    this.caption.textContent = '';
  }
}
