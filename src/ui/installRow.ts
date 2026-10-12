// SPDX-License-Identifier: AGPL-3.0-only
// INSTALL FOR OFFLINE PLAY in OPTION (owner, 12 Oct: no native APK or EXE, the web app installs instead).
// Chromium: the caught install prompt. iOS: the Share → Add to Home Screen steps. Installed: a plain status line.
// Anything else: a hint, never a dead button. Works the same under ?debug, where there is no service worker.
import { fmt } from '../game/text';
import { getReadyOffline, installState, onInstallChange, promptInstall, warmState } from '../pwa';
import { button, el } from './dom';

let outcome: 'accepted' | 'dismissed' | null = null;

export function installRow(): HTMLElement {
  const box = el('section', 'install-box');
  box.dataset.testid = 'install-box';
  let panelOpen = false;
  const render = () => {
    const state = installState();
    const parts: HTMLElement[] = [];
    if (state === 'installed') {
      const p = el('p', 'install-status', 'install.installed');
      p.dataset.testid = 'install-installed';
      parts.push(p);
    } else if (state === 'none') {
      // Just declined in Chromium: the result line below says so, and the hint would be wrong there.
      if (!outcome) {
        const p = el('p', 'install-hint', 'install.unsupported');
        p.dataset.testid = 'install-hint';
        parts.push(p);
      }
    } else {
      parts.push(
        button('install.option', () => {
          if (state === 'ios') return ((panelOpen = !panelOpen), render());
          void promptInstall().then((o) => {
            if (o !== 'unavailable') outcome = o;
            render();
          });
        }, 'install'),
      );
    }
    if (state === 'ios' && panelOpen) {
      // The Add to Home Screen tip's wording, then the steps.
      const panel = el('div', 'hub-note install-ios');
      panel.dataset.testid = 'install-ios';
      const steps = el('ol', 'install-steps');
      for (const k of ['install.ios1', 'install.ios2', 'install.ios3'] as const) steps.append(el('li', '', k));
      panel.append(el('p', '', 'tip.home'), steps, button('tip.ok', () => ((panelOpen = false), render()), 'install-ios-ok', 'secondary'));
      parts.push(panel);
    }
    if (outcome && state !== 'installed') {
      const p = el('p', 'install-result', outcome === 'accepted' ? 'install.accepted' : 'install.dismissed');
      p.dataset.testid = 'install-result';
      p.setAttribute('role', 'status');
      parts.push(p);
    }
    const w = warmState();
    if (w !== null) {
      const p = el('p', 'install-progress');
      p.dataset.testid = 'install-progress';
      p.setAttribute('role', 'status');
      p.textContent = w === 'ready' ? fmt('install.ready') : fmt('install.warming', { n: String(w) });
      parts.push(p);
    }
    box.replaceChildren(...parts);
  };
  render();
  // Re-render on prompt, install and progress events while this screen is open; drop the listener once it is gone.
  let shown = false;
  const stop = onInstallChange(() => {
    if (box.isConnected) return ((shown = true), render());
    if (shown) stop();
  });
  window.requestAnimationFrame(() => (shown = box.isConnected));
  // Opened as an app whose files are not cached yet: the warm up starts from here too (no-op without a worker).
  if (installState() === 'installed' && warmState() === null) getReadyOffline();
  return box;
}
