// SPDX-License-Identifier: AGPL-3.0-only
// Review arrows and marks (§B15) on an SVG layer over the board.
import { REVIEW_COLORS } from '../config';
import type { Board } from '../board/board';
import type { Frame } from '../campaign/review';

export function drawFrame(reviewLayer: SVGSVGElement, boardWrap: HTMLElement, board: Board, frame: Frame): void {
  const ns = 'http://www.w3.org/2000/svg';
  const box = boardWrap.getBoundingClientRect();
  reviewLayer.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const centre = (sq: string) => {
    const r = board.squareEl(sq)?.getBoundingClientRect();
    return r ? { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, s: r.width } : { x: 0, y: 0, s: 0 };
  };
  const parts: SVGElement[] = [];
  const defs = document.createElementNS(ns, 'defs');
  for (const c of REVIEW_COLORS) {
    const m = document.createElementNS(ns, 'marker');
    Object.entries({ id: `head-${c[0]}`, viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '3', markerHeight: '3', orient: 'auto-start-reverse' }).forEach(([k, v]) => m.setAttribute(k, v));
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', c[1]);
    m.append(path);
    defs.append(m);
  }
  parts.push(defs);
  for (const a of frame.arrows) {
    const p = centre(a.from);
    const q = centre(a.to);
    const line = document.createElementNS(ns, 'line');
    const color = REVIEW_COLORS.find((c) => c[0] === a.color)?.[1] ?? '#30a030';
    Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: color, 'stroke-width': p.s * 0.16, 'stroke-linecap': 'round', opacity: '0.85', 'marker-end': `url(#head-${a.color})` }).forEach(([k, v]) => line.setAttribute(k, String(v)));
    line.dataset.arrow = `${a.from}${a.to}`;
    line.dataset.color = a.color;
    parts.push(line);
  }
  for (const sq of frame.marks) {
    const c = centre(sq);
    const ring = document.createElementNS(ns, 'circle');
    Object.entries({ cx: c.x, cy: c.y, r: c.s * 0.38, fill: 'none', stroke: '#e03030', 'stroke-width': c.s * 0.08, opacity: '0.85' }).forEach(([k, v]) => ring.setAttribute(k, String(v)));
    ring.dataset.mark = sq;
    parts.push(ring);
  }
  reviewLayer.replaceChildren(...parts);
}
