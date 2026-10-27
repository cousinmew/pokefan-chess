// SPDX-License-Identifier: AGPL-3.0-only
// Sprite references (sprite paint lint, 23 Oct): every species and trainer the data names is one the game knows, its
// files are in public/assets (npm run assets) in the form the game asks for, each board sprite set has its trim box,
// and what index.html preloads exists. A missing file is a blank box or a stand-in at runtime; a missing trim box
// sizes a piece by its own pixels, so it jumps when the still gives way to the animation (src/board/board.ts).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import kanto from '../../src/data/kanto.json';
import roster from '../../src/data/roster.gen1.json';
import trainers from '../../src/data/trainers.json';
import trainerTeams from '../../src/data/trainer-teams.json';
import journey from '../../src/data/journey.kanto.json';
import yellow from '../../src/data/yellow-unlocks.json';
import hubItems from '../../src/data/hub-items.json';
import trim from '../../src/data/trim.json';

const A = 'public/assets';
const SPECIES = kanto.species as Record<string, { dex: number }>;
const PEOPLE = trainers.people as Record<string, string>;
const CLASSES = trainers.classes as Record<string, string>;
const has = (f: string) => existsSync(`${A}/${f}`) && statSync(`${A}/${f}`).size > 0;
/** What src/board/pieces.ts spriteUrl() asks for: the animated WebP when fetch-assets made one, else the GIF. */
const anim = (path: string) => (has(`${path}.webp`) ? `${path}.webp` : `${path}.gif`);

type Team = Record<string, string>;
type Place = { id: string; leader?: string; trainers?: { id: string; class: string; sprite?: string; team: string[] }[]; reward?: { gift?: string[]; choice?: string[] } };
const PLACES = journey.places as Place[];

/** Every species id the data names, with where: teams, trainers' parties, gifts, wild encounters, unlocks. */
function named(): [string, string][] {
  const out: [string, string][] = [];
  const add = (where: string, ids: (string | undefined)[]) => ids.forEach((id) => id && !id.startsWith('@') && out.push([where, id]));
  const pieces = (p: Record<string, string | Team>) => Object.values(p).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
  for (const [k, t] of Object.entries(roster.teams)) add(`roster.gen1.json teams.${k}`, pieces(t.pieces as Record<string, string | Team>));
  add('roster.gen1.json species', Object.keys(roster.species));
  for (const [k, t] of Object.entries(trainerTeams.trainers as Record<string, { team: Team; byStarter?: Record<string, Team> }>)) {
    add(`trainer-teams.json ${k}`, Object.values(t.team));
    for (const [s, team] of Object.entries(t.byStarter ?? {})) add(`trainer-teams.json ${k} byStarter.${s}`, [s, ...Object.values(team)]);
  }
  for (const p of PLACES) {
    for (const t of p.trainers ?? []) add(`journey.kanto.json ${p.id} ${t.id}`, t.team);
    add(`journey.kanto.json ${p.id} reward`, [...(p.reward?.gift ?? []), ...(p.reward?.choice ?? [])]);
  }
  add('journey.kanto.json rival.counter', Object.entries(journey.rival.counter).flat());
  add('kanto.json starters', kanto.starters);
  for (const e of kanto.evolutions) add('kanto.json evolutions', [e.from, e.to]);
  for (const r of kanto.routes as { id: string; encounters: { species: string }[]; blue?: { species: string }[] }[]) add(`kanto.json routes ${r.id}`, [...r.encounters, ...(r.blue ?? [])].map((e) => e.species));
  add('yellow-unlocks.json', yellow.unlocks);
  return out;
}

describe('sprite references', () => {
  it('every species the data names is a Kanto species', () => {
    expect(named().filter(([, id]) => !SPECIES[id]).map(([where, id]) => `${id} (${where})`)).toEqual([]);
  });

  it("every Kanto species has each file the game asks for: animated front and back, shiny too, stills, Gen 1 sprite, cry", () => {
    const missing: string[] = [];
    for (const [id, { dex }] of Object.entries(SPECIES)) {
      const want = [anim(`front/${dex}`), anim(`back/${dex}`), anim(`shiny/front/${dex}`), anim(`shiny/back/${dex}`), `static/front/${dex}.png`, `static/shiny/${dex}.png`, `retro/${dex}.png`, `cries/${dex}.ogg`];
      // A WebP that fails falls back to its GIF (src/battle/sprites.ts), so a WebP needs one beside it.
      want.push(...want.filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, '.gif')));
      missing.push(...want.filter((f) => !has(f)).map((f) => `${id}: ${f}`));
    }
    expect(missing).toEqual([]);
  });

  it('every board sprite set has a trim box for every species', () => {
    const sets = trim as unknown as Record<string, Record<string, number[]>>;
    const missing: string[] = [];
    for (const set of ['front', 'shiny/front', 'static/front', 'static/shiny']) {
      for (const [id, { dex }] of Object.entries(SPECIES)) {
        const b = sets[set]?.[String(dex)];
        if (!b || b.length !== 6 || b.some((n) => !Number.isFinite(n)) || b[2]! <= 0 || b[3]! <= 0) missing.push(`${set} ${id} (${dex})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every trainer the data names has a sprite file', () => {
    const bad: string[] = [];
    const sprites = new Set([...Object.values(PEOPLE), ...Object.values(CLASSES)]);
    for (const p of PLACES) {
      if (p.leader && !PEOPLE[p.leader]) bad.push(`${p.id} leader ${p.leader}: not in trainers.json people`);
      for (const t of p.trainers ?? []) {
        // As journeyGame.ts spriteOf(): '-' none, 'red' the player's own, a person, else the class.
        if (t.sprite === '-' || t.sprite === 'red') continue;
        if (t.sprite ? !PEOPLE[t.sprite] : !CLASSES[t.class]) bad.push(`${p.id} ${t.id}: ${t.sprite ? `person ${t.sprite}` : `class ${t.class}`} has no sprite id`);
      }
    }
    for (const k of Object.keys(trainerTeams.trainers)) if (!sprites.has(k)) bad.push(`trainer-teams.json ${k}: not a sprite id in trainers.json`);
    for (const id of sprites) if (!has(`trainers/${id}.png`)) bad.push(`trainers/${id}.png missing`);
    if (!existsSync('public/art/meir.png')) bad.push('public/art/meir.png missing');
    expect(bad).toEqual([]);
  });

  it("index.html's preloads and the hub's item sheet exist", () => {
    const html = readFileSync('index.html', 'utf8');
    const preloads = [...html.matchAll(/<link rel="preload" as="image" href="\.\/([^"]+)"/g)].map((m) => m[1]!);
    expect(preloads.length).toBeGreaterThan(0);
    expect(preloads.filter((f) => !existsSync(`public/${f}`))).toEqual([]);
    expect(has('items/hub-sheet.png')).toBe(true);
    expect(hubItems.items.filter((i) => !has(`items/${i}.png`))).toEqual([]);
  });
});
