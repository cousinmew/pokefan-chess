// SPDX-License-Identifier: AGPL-3.0-only
// What paint.spec.ts watches (sprite paint lint, 23 Oct): every image the player could see, frame by frame from the
// page's first script, with no knowledge of the screens. An <img> on screen, under no cover or dip, with no pixels
// yet is a blank: pop-in when it draws later (a retro sprite behind it or a trainer silhouette is a stand-in, kept
// apart). A box whose size changes as its pixels arrive is a jump; layout-shift entries come with the nodes they
// moved. A screen, a panel or the battle screen shown with one of its images not drawn is a late reveal (a trainer
// after his own text box). audit() checks each image on screen keeps its box with no pixels at all, and that no
// trainer on screen is a silhouette for want of a sprite.
import type { Page } from '@playwright/test';

export type Blank = { t: number; ms: number; src: string; at: string; mark: string; stand: string; open?: boolean };
export type Jump = { t: number; src: string; at: string; mark: string; from: string; to: string };
/** kind: 'img' when an image moved (its own box, or one inside a moved node), 'battle' for the battle screen's own
 * motion (its sprites are placed with left and top), 'other' for the rest (text, a panel growing). */
export type Shift = { t: number; v: number; input: boolean; mark: string; kind: 'img' | 'battle' | 'other'; nodes: string[] };
export type Reveal = { t: number; what: string; mark: string; imgs: number; late: string[] };
export type Unreserved = { src: string; at: string; mark: string; box: string; empty: string };
/** A screen cover as it starts to open: `capped` when its wait for the screen's images ran out (?debug=1 marks it). */
export type Open = { t: number; kind: string; capped: boolean; scr: string; mark: string; late: string[] };
export type Pw = { blanks: Blank[]; jumps: Jump[]; shifts: Shift[]; reveals: Reveal[]; opens: Open[]; broken: string[]; unreserved: Unreserved[]; noArt: string[]; mark: string };

export function painter(): void {
  type Rec = { src: string; kept: boolean; done: boolean; broke: boolean; from: number; box: string; stand: string; at: string; mark: string };
  const P: Pw = { blanks: [], jumps: [], shifts: [], reveals: [], opens: [], broken: [], unreserved: [], noArt: [], mark: '' };
  const w = window as unknown as { __pw: Pw; __pwAudit: (mark: string) => number };
  w.__pw = P;
  const short = (u: string) => u.replace(/^.*?\/(assets|art)\//, (_m, d: string) => (d === 'art' ? 'art/' : ''));
  const fetched = new Set<string>();
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => fetched.add(e.name))).observe({ type: 'resource', buffered: true });
  } catch (err) {
    console.warn('paintwatch: no resource timing', err);
  }
  const scr = () => document.querySelector('#app .stage > [data-testid]')?.getAttribute('data-testid') ?? '';
  const where = (e: Element) => {
    const s = scr();
    const own = e.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
    const cls = (e.getAttribute('class') || e.parentElement?.getAttribute('class') || '').split(' ')[0];
    return [s, own !== s ? own : '', cls ? `.${cls}` : ''].filter(Boolean).join(' ');
  };
  const srcOf = (img: HTMLImageElement) => img.src || (img.dataset.src ? new URL(img.dataset.src, location.href).href : '');
  const size = (e: HTMLElement) => `${e.offsetWidth}x${e.offsetHeight}`;
  /** Under a cover not yet opening, or a board dip at least half up. */
  const covered = (e: Element) => {
    if (e.closest('.screen-cover, .board-dip')) return false;
    if (document.querySelector('.screen-cover:not([data-phase="open"])')) return true;
    for (const d of document.querySelectorAll<HTMLElement>('.board-dip')) if (d.parentElement?.contains(e) && Number(getComputedStyle(d).opacity) >= 0.5) return true;
    return false;
  };
  /** On screen for the player: a box in the viewport, not clipped away by a scroller, no hidden or transparent
   * ancestor, no cover over it. */
  const shown = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    for (let n: Element | null = e; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
      if (n !== e && cs.overflow !== 'visible') {
        const c = n.getBoundingClientRect();
        if (r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right) return false;
      }
    }
    return !covered(e);
  };
  /** What stands in while it loads: a trainer silhouette, or a background sprite whose file is in. */
  const stand = (img: HTMLImageElement) => {
    if (img.closest('.trainer-sprite.loading')) return 'silhouette';
    const bg = /url\("?(.*?)"?\)/.exec(getComputedStyle(img).backgroundImage)?.[1];
    return bg && fetched.has(new URL(bg, location.href).href) ? `bg ${short(bg)}` : '';
  };
  const recs = new WeakMap<HTMLImageElement, Rec>();
  const close = (rec: Rec, now: number, open = false) => {
    if (rec.from < 0) return;
    P.blanks.push({ t: Math.round(rec.from), ms: Math.round(now - rec.from), src: short(rec.src), at: rec.at, mark: rec.mark, stand: rec.stand, ...(open ? { open } : {}) });
    rec.from = -1;
  };
  const drawn = (img: HTMLImageElement) => !!img.getAttribute('src') && img.complete && img.naturalWidth > 0;
  /** What the player sees of an image: a silhouette's box, or the parent of a box with no size. */
  const face = (i: HTMLImageElement) => i.closest<HTMLElement>('.trainer-sprite.loading') ?? (i.offsetWidth > 1 && i.offsetHeight > 1 ? i : (i.parentElement ?? i));
  const late = (imgs: HTMLImageElement[]) => imgs.filter((i) => srcOf(i) && i.getClientRects().length > 0 && !drawn(i) && !recs.get(i)?.kept && shown(face(i))).map((i) => `${short(srcOf(i))}${i.closest('.trainer-sprite.loading') ? ' (silhouette)' : ''}`);
  const images = (now: number) => {
    for (const img of Array.from(document.images)) {
      const src = srcOf(img);
      if (!src) continue;
      let rec = recs.get(img);
      if (!rec || rec.src !== src) {
        if (rec) close(rec, now);
        // Chrome keeps the old pixels up while a new src loads: a swap is never blank.
        rec = { src, kept: !!rec && (rec.done || rec.kept) && img.naturalWidth > 0, done: false, broke: false, from: -1, box: '', stand: '', at: '', mark: '' };
        recs.set(img, rec);
      }
      if (rec.done) continue;
      const laid = img.getClientRects().length > 0;
      if (drawn(img)) {
        close(rec, now);
        if (laid && rec.box && rec.box !== size(img)) P.jumps.push({ t: Math.round(now), src: short(src), at: where(img), mark: P.mark, from: rec.box, to: size(img) });
        rec.done = true;
        continue;
      }
      if (img.getAttribute('src') && img.complete) {
        if (laid && !rec.broke) P.broken.push(`${short(src)} @ ${where(img)}`);
        rec.broke = true;
        close(rec, now);
        continue;
      }
      if (!laid) {
        close(rec, now);
        continue;
      }
      rec.box = size(img);
      if (rec.kept) continue;
      if (!shown(face(img))) {
        close(rec, now);
      } else if (rec.from < 0) {
        rec.from = now;
        rec.stand = stand(img);
        rec.at = where(img);
        rec.mark = P.mark;
      }
    }
  };
  /** Each cover as it starts to open, with the images on screen not drawn then. */
  const opened = new WeakSet<Element>();
  const covers = (now: number) => {
    for (const c of document.querySelectorAll<HTMLElement>('.screen-cover[data-phase="open"]')) {
      if (opened.has(c)) continue;
      opened.add(c);
      P.opens.push({ t: Math.round(now), kind: c.dataset.kind ?? '', capped: c.dataset.capped !== undefined, scr: scr(), mark: P.mark, late: late(Array.from(document.images).filter((i) => !c.contains(i))) });
    }
  };
  /** A screen, a panel or the battle screen as it first shows: its images not drawn then. */
  const on = new WeakMap<Element, boolean>();
  const reveals = (now: number) => {
    for (const c of document.querySelectorAll<HTMLElement>('#app .stage > [data-testid], .panel, [data-testid="battle"]')) {
      const vis = !c.hidden && c.getClientRects().length > 0 && shown(c);
      if (vis && !on.get(c)) {
        const imgs = [...c.querySelectorAll('img')];
        // A story box's trainer stands beside it, in the same host.
        if (c.classList.contains('story')) imgs.push(...(c.parentElement?.querySelectorAll<HTMLImageElement>(':scope > .story-trainer img') ?? []));
        P.reveals.push({ t: Math.round(now), what: c.dataset.testid ?? c.className.split(' ').slice(0, 2).join('.'), mark: P.mark, imgs: imgs.length, late: late(imgs) });
      }
      on.set(c, vis);
    }
  };
  const tick = () => {
    const now = performance.now();
    try {
      images(now);
      covers(now);
      reveals(now);
    } catch (err) {
      console.warn('paintwatch:', err);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    type LS = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] };
    const r = (x: DOMRectReadOnly) => `${Math.round(x.x)},${Math.round(x.y)} ${Math.round(x.width)}x${Math.round(x.height)}`;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as LS[]) {
        const els = (e.sources ?? []).map((s) => s.node).filter((n): n is Element => n instanceof Element);
        const kind = els.length && els.every((n) => n.closest('[data-testid="battle"]')) ? 'battle' : els.some((n) => n instanceof HTMLImageElement || n.querySelector('img')) ? 'img' : 'other';
        P.shifts.push({ t: Math.round(e.startTime), v: Number(e.value.toFixed(4)), input: e.hadRecentInput, mark: P.mark, kind, nodes: (e.sources ?? []).map((s) => `${s.node instanceof Element ? where(s.node) : (s.node?.nodeName ?? '?')} ${r(s.previousRect)} -> ${r(s.currentRect)}`) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (err) {
    console.warn('paintwatch: no layout-shift entries', err);
  }
  /** Each image laid out now, swapped for a copy with no pixels (same attributes, no src) and back in one task: no
   * frame paints the copy and no observer of the app sees a style change. A different box is a box not reserved. */
  w.__pwAudit = (mark: string) => {
    let n = 0;
    for (const img of Array.from(document.images)) {
      if (!img.getClientRects().length || img.closest('.screen-cover')) continue;
      n++;
      const box = size(img);
      const probe = document.createElement('img');
      for (const a of img.getAttributeNames()) if (!/^(src|srcset|alt|loading|data-src|data-testid)$/.test(a)) probe.setAttribute(a, img.getAttribute(a)!);
      probe.alt = '';
      img.replaceWith(probe);
      const empty = size(probe);
      probe.replaceWith(img);
      const src = short(srcOf(img));
      const at = where(img);
      if (empty !== box && !P.unreserved.some((u) => u.at === at && u.box === box)) P.unreserved.push({ src, at, mark, box, empty });
    }
    // A trainer with no art at all (no sprite id, or its file failed): a silhouette for good (src/ui/kanto.ts).
    for (const sil of document.querySelectorAll<HTMLElement>('.trainer-sprite.sil')) if (sil.getClientRects().length) P.noArt.push(`${where(sil)} [${mark}]`);
    return n;
  };
}

export const pw = (page: Page) => page.evaluate(() => (window as unknown as { __pw: Pw }).__pw);
/** Names the tour's step: what is recorded from now on is filed under it. */
export const mark = (page: Page, m: string) => page.evaluate((x) => void ((window as unknown as { __pw: Pw }).__pw.mark = x), m);
/** The reserved box check on what is on screen now; returns how many images it looked at. */
export const audit = (page: Page, m: string) => page.evaluate((x) => (window as unknown as { __pwAudit: (mark: string) => number }).__pwAudit(x), m);
