// SPDX-License-Identifier: AGPL-3.0-only
// Glicko-2 (Glickman 2012), one puzzle = one game in its own rating period (§B6).
import { RATING_START, RATING_TAU } from '../config';

export interface Rating {
  r: number;
  rd: number;
  vol: number;
}

const SCALE = 173.7178;
const RD_MIN = 45; // as Lichess: a rating never becomes fully certain
const RD_MAX = 350;

export const startRating = (): Rating => ({ ...RATING_START });

/** New rating after one result (1 = solved, 0 = missed) against a puzzle of rating `opp` and deviation `oppRd`. */
export function update(p: Rating, opp: number, oppRd: number, score: 0 | 1): Rating {
  const mu = (p.r - 1500) / SCALE;
  const phi = p.rd / SCALE;
  const muJ = (opp - 1500) / SCALE;
  const phiJ = oppRd / SCALE;
  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
  const e = 1 / (1 + Math.exp(-g * (mu - muJ)));
  const v = 1 / (g * g * e * (1 - e));
  const delta = v * g * (score - e);
  // Volatility by the Illinois algorithm.
  const a = Math.log(p.vol * p.vol);
  const f = (x: number) => (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) - (x - a) / (RATING_TAU * RATING_TAU);
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * RATING_TAU) < 0) k++;
    B = a - k * RATING_TAU;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * g * (score - e);
  return { r: muNew * SCALE + 1500, rd: Math.min(RD_MAX, Math.max(RD_MIN, phiNew * SCALE)), vol };
}
