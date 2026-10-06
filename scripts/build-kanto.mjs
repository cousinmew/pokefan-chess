// SPDX-License-Identifier: AGPL-3.0-only
// Builds src/data/kanto.json from PokéAPI (§B4, §B5): Red tall grass tables per route, Gen 1 types, and each
// species' first damaging Red/Blue level up move (Tackle if none). Run locally; `--check` re-fetches and diffs.
import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://pokeapi.co/api/v2';
const OUT = 'src/data/kanto.json';
// One route before each stop of Part B §B2, with that stop's Lichess themes.
const ROUTES = [
  { id: 'route-1', name: 'ROUTE 1', area: 'kanto-route-1-area', themes: ['mateIn1'] },
  { id: 'viridian-forest', name: 'VIRIDIAN FOREST', area: 'viridian-forest-area', themes: ['castling', 'hangingPiece'] },
  { id: 'route-3', name: 'ROUTE 3', area: 'kanto-route-3-area', themes: ['hangingPiece', 'trappedPiece', 'advantage'] },
  { id: 'route-6', name: 'ROUTE 6', area: 'kanto-route-6-area', themes: ['fork'] },
  { id: 'route-7', name: 'ROUTE 7', area: 'kanto-route-7-area', themes: ['promotion', 'advancedPawn'] },
  { id: 'route-14', name: 'ROUTE 14', area: 'kanto-route-14-area', themes: ['pin'] },
  { id: 'route-8', name: 'ROUTE 8', area: 'kanto-route-8-area', themes: ['discoveredAttack', 'discoveredCheck', 'doubleCheck'] },
  { id: 'route-21', name: 'ROUTE 21', area: 'kanto-sea-route-21-area', themes: ['capturingDefender', 'deflection', 'mateIn2', 'backRankMate'] },
  { id: 'route-22', name: 'ROUTE 22', area: 'kanto-route-22-area', themes: ['mixed'] },
];
const STARTERS = [1, 4, 7];
// Move type -> one of the 14 FX recipes (§B5). Normal moves pick by name, as v1 did.
const TYPE_FX = { electric: 'bolt', fire: 'flame', grass: 'leaf', water: 'water', rock: 'rockfall', ground: 'dig', poison: 'sludge', ice: 'water', fighting: 'slam', flying: 'quick', bug: 'fang', psychic: 'bolt', ghost: 'sludge', dragon: 'flame' };
const NORMAL_FX = { scratch: 'slash', slash: 'slash', 'fury-swipes': 'slash', bite: 'fang', 'hyper-fang': 'fang', 'super-fang': 'fang', 'horn-attack': 'horn', 'fury-attack': 'horn', peck: 'horn', 'quick-attack': 'quick', wrap: 'wrap', bind: 'wrap', constrict: 'wrap', stomp: 'stomp', pound: 'stomp' };
const GEN1_GROUPS = new Set(['red-blue', 'yellow']);

const cache = new Map();
async function get(path) {
  if (cache.has(path)) return cache.get(path);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${API}/${path}/`);
    if (res.ok) {
      const json = await res.json();
      cache.set(path, json);
      return json;
    }
    if (res.status === 404) throw new Error(`404 ${path}`);
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`failed ${path}`);
}

async function routeTable(area) {
  const d = await get(`location-area/${area}`);
  const out = [];
  for (const e of d.pokemon_encounters) {
    const red = e.version_details.find((v) => v.version.name === 'red');
    const walk = red?.encounter_details.filter((x) => x.method.name === 'walk') ?? [];
    if (!walk.length) continue;
    out.push({ species: e.pokemon.name, slots: walk.map((x) => x.chance), min: Math.min(...walk.map((x) => x.min_level)), max: Math.max(...walk.map((x) => x.max_level)) });
  }
  return out;
}

/** Gen 1 values of a move: past_values recorded at a later version group hold what Gen 1 used. */
async function gen1Move(name) {
  const m = await get(`move/${name}`);
  let power = m.power;
  let type = m.type.name;
  for (const pv of m.past_values) {
    if (GEN1_GROUPS.has(pv.version_group.name)) continue;
    if (pv.power !== null) power = pv.power;
    if (pv.type) type = pv.type.name;
    break;
  }
  return { power: power ?? 0, type };
}

async function speciesEntry(idOrName) {
  const p = await get(`pokemon/${idOrName}`);
  const sp = await get(`pokemon-species/${p.species.name}`);
  // past_types holds types up to and including the named generation; the earliest entry is what Gen 1 used.
  const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
  const genNo = (t) => ROMAN.indexOf(t.generation.name.replace('generation-', ''));
  const gen1 = [...p.past_types].sort((a, b) => genNo(a) - genNo(b))[0];
  const types = (gen1 ?? p).types.map((t) => t.type.name);
  const learned = p.moves
    .flatMap((mv) => mv.version_group_details.filter((v) => v.version_group.name === 'red-blue' && v.move_learn_method.name === 'level-up').map((v) => ({ name: mv.move.name, level: v.level_learned_at })))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  let move = 'tackle';
  for (const l of learned) {
    if ((await gen1Move(l.name)).power > 0) {
      move = l.name;
      break;
    }
  }
  const name = sp.names.find((n) => n.language.name === 'en').name.toUpperCase();
  return [p.name, { dex: p.id, name, types, move }];
}

async function build() {
  const routes = [];
  const names = new Set();
  for (const r of ROUTES) {
    const encounters = await routeTable(r.area);
    encounters.forEach((e) => names.add(e.species));
    routes.push({ ...r, encounters });
  }
  const species = {};
  for (const n of [...STARTERS, ...names]) {
    const [key, entry] = await speciesEntry(n);
    species[key] = entry;
  }
  const moves = {};
  for (const s of Object.values(species)) {
    if (moves[s.move]) continue;
    const m = await gen1Move(s.move);
    const name = (await get(`move/${s.move}`)).names.find((n) => n.language.name === 'en').name.toUpperCase();
    moves[s.move] = { name, type: m.type, fx: m.type === 'normal' ? (NORMAL_FX[s.move] ?? 'slam') : (TYPE_FX[m.type] ?? 'slam') };
  }
  return { schema: 1, source: 'PokeAPI location-area (version red, method walk), pokemon past_types generation-i, red-blue level-up learnsets', starters: ['bulbasaur', 'charmander', 'squirtle'], routes, species, moves };
}

const data = await build();
if (process.argv.includes('--check')) {
  const committed = JSON.parse(readFileSync(OUT, 'utf8'));
  const a = JSON.stringify(committed.routes);
  const b = JSON.stringify(data.routes);
  if (a !== b) {
    console.error('kanto.json routes differ from PokéAPI');
    process.exit(1);
  }
  console.log(`kanto routes match PokéAPI (${data.routes.length} routes)`);
} else {
  writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`wrote ${OUT}: ${data.routes.length} routes, ${Object.keys(data.species).length} species, ${Object.keys(data.moves).length} moves`);
  for (const r of data.routes) console.log(`${r.name}: ${r.encounters.map((e) => `${e.species} ${e.slots.join('/')}`).join(', ')} = ${r.encounters.flatMap((e) => e.slots).reduce((x, y) => x + y, 0)}%`);
}
