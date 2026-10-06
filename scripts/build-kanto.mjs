// SPDX-License-Identifier: AGPL-3.0-only
// Builds the Kanto data from PokéAPI (§B4, §B5, §B12): src/data/kanto.json (Red and Blue tall grass tables per route,
// all 151 species with Gen 1 types and first damaging Red/Blue level up move, evolution chains), src/data/sources.kanto.json
// (how each of the 151 is obtained) and src/data/types.gen1.json (Gen 1 type relations). Run locally; `--check` diffs.
// Responses are cached on disk outside the repo (~/Code/pokefan-chess-data/pokeapi/), so reruns are fast and polite.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = 'https://pokeapi.co/api/v2';
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
// Move type -> one of the 14 FX recipes (§B5). Normal moves pick by name, as v1 did.
const TYPE_FX = { electric: 'bolt', fire: 'flame', grass: 'leaf', water: 'water', rock: 'rockfall', ground: 'dig', poison: 'sludge', ice: 'water', fighting: 'slam', flying: 'quick', bug: 'fang', psychic: 'bolt', ghost: 'sludge', dragon: 'flame' };
const NORMAL_FX = { scratch: 'slash', slash: 'slash', 'fury-swipes': 'slash', bite: 'fang', 'hyper-fang': 'fang', 'super-fang': 'fang', 'horn-attack': 'horn', 'fury-attack': 'horn', peck: 'horn', 'quick-attack': 'quick', wrap: 'wrap', bind: 'wrap', constrict: 'wrap', stomp: 'stomp', pound: 'stomp' };
const GEN1_GROUPS = new Set(['red-blue', 'yellow']);

const cache = new Map();
const DISK = join(homedir(), 'Code/pokefan-chess-data/pokeapi');
const CHECK = process.argv.includes('--check');
mkdirSync(DISK, { recursive: true });
async function get(path) {
  if (cache.has(path)) return cache.get(path);
  const file = join(DISK, `${path.replaceAll('/', '_')}.json`);
  // --check always asks PokéAPI again; a normal build reuses the disk cache.
  if (!CHECK && existsSync(file)) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    cache.set(path, json);
    return json;
  }
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${API}/${path}/`);
    if (res.ok) {
      const json = await res.json();
      cache.set(path, json);
      writeFileSync(file, JSON.stringify(json));
      return json;
    }
    if (res.status === 404) throw new Error(`404 ${path}`);
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`failed ${path}`);
}

async function routeTable(area, version = 'red') {
  const d = await get(`location-area/${area}`);
  const out = [];
  for (const e of d.pokemon_encounters) {
    const red = e.version_details.find((v) => v.version.name === version);
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

const GEN1_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon'];

/** Gen 1 relations: the earliest past_damage_relations entry when there is one, else today's; only Gen 1 types. */
async function typeChart() {
  const chart = {};
  for (const t of GEN1_TYPES) {
    const d = await get(`type/${t}`);
    const past = [...(d.past_damage_relations ?? [])].sort((a, b) => a.generation.url.localeCompare(b.generation.url, 'en', { numeric: true }))[0];
    const rel = past?.damage_relations ?? d.damage_relations;
    const row = {};
    for (const [key, mult] of [['double_damage_to', 2], ['half_damage_to', 0.5], ['no_damage_to', 0]]) {
      for (const x of rel[key]) if (GEN1_TYPES.includes(x.name)) row[x.name] = mult;
    }
    chart[t] = row;
  }
  return chart;
}

/** Every Gen 1 evolution: from, to, trigger (level-up, use-item, trade), level or item, and stage (1 or 2). */
async function evolutions(names) {
  const out = [];
  const families = {};
  const seen = new Set();
  for (const n of names) {
    const sp = await get(`pokemon-species/${n}`);
    const url = sp.evolution_chain.url.replace(/\/$/, '').split('/').pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const chain = (await get(`evolution-chain/${url}`)).chain;
    const idOf = (node) => Number(node.species.url.replace(/\/$/, '').split('/').pop());
    // Later generation babies (Pichu, Cleffa, Tyrogue...) sit at the root: their Gen 1 children start a family.
    const walk = (node, stage, base) => {
      if (idOf(node) > 151) {
        for (const next of node.evolves_to) if (idOf(next) <= 151) walk(next, 1, next.species.name);
        return;
      }
      families[node.species.name] = base;
      for (const next of node.evolves_to) {
        if (idOf(next) > 151) continue;
        const det = next.evolution_details[0] ?? {};
        out.push({ from: node.species.name, to: next.species.name, trigger: det.trigger?.name ?? 'level-up', level: det.min_level ?? null, item: det.item?.name ?? null, stage });
        walk(next, stage + 1, base);
      }
    };
    walk(chain, 1, chain.species.name);
  }
  return { evolutions: out, families };
}

/** Every Kanto area's Red and Blue encounters, any method: where each species can be met in the wild. */
async function kantoWild() {
  const region = await get('region/kanto');
  const wild = {};
  for (const loc of region.locations) {
    let l;
    try {
      l = await get(`location/${loc.name}`);
    } catch (err) {
      console.warn(`skip ${loc.name}: ${err.message}`);
      continue;
    }
    for (const a of l.areas) {
      const d = await get(`location-area/${a.name}`);
      for (const e of d.pokemon_encounters) {
        for (const v of e.version_details) {
          if (v.version.name !== 'red' && v.version.name !== 'blue') continue;
          const methods = [...new Set(v.encounter_details.map((x) => x.method.name))];
          for (const m of methods) {
            (wild[e.pokemon.name] ??= []).push({ area: a.name, version: v.version.name, method: m });
          }
        }
      }
    }
  }
  return wild;
}

// Planned sources not in PokéAPI's encounter tables (Part B §B12), built in C3.
const PLANNED = {
  eevee: 'gift', lapras: 'gift', hitmonlee: 'gift', hitmonchan: 'gift', magikarp: 'gift',
  omanyte: 'fossil', kabuto: 'fossil', aerodactyl: 'fossil',
  articuno: 'legendary', zapdos: 'legendary', moltres: 'legendary', mewtwo: 'legendary', mew: 'award',
  bulbasaur: 'starter', charmander: 'starter', squirtle: 'starter', porygon: 'prize',
};

async function build() {
  const routes = [];
  for (const r of ROUTES) routes.push({ ...r, encounters: await routeTable(r.area), blue: await routeTable(r.area, 'blue') });
  const names = [];
  for (let id = 1; id <= 151; id++) names.push((await get(`pokemon/${id}`)).name);
  const species = {};
  for (const n of names) {
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
  const { evolutions: evo, families } = await evolutions(names);
  const wild = await kantoWild();
  const sources = {};
  for (const n of names) {
    const list = [];
    if (wild[n]) list.push({ kind: 'wild', where: [...new Set(wild[n].map((w) => `${w.area} (${w.version}, ${w.method})`))] });
    for (const e of evo.filter((x) => x.to === n)) list.push({ kind: e.trigger === 'trade' ? 'trade' : 'evolve', from: e.from });
    if (PLANNED[n]) list.push({ kind: PLANNED[n] });
    sources[n] = list;
  }
  const kanto = { schema: 2, source: 'PokeAPI location-area (versions red and blue, method walk), pokemon past_types (earliest), red-blue level-up learnsets, evolution chains', starters: ['bulbasaur', 'charmander', 'squirtle'], routes, species, moves, evolutions: evo, families };
  return { kanto, sources, types: await typeChart() };
}

const data = await build();
const FILES = { kanto: 'src/data/kanto.json', sources: 'src/data/sources.kanto.json', types: 'src/data/types.gen1.json' };
if (CHECK) {
  const committed = JSON.parse(readFileSync(FILES.kanto, 'utf8'));
  const diffs = [];
  if (JSON.stringify(committed.routes) !== JSON.stringify(data.kanto.routes)) diffs.push('routes');
  if (JSON.stringify(committed.evolutions) !== JSON.stringify(data.kanto.evolutions)) diffs.push('evolutions');
  if (readFileSync(FILES.types, 'utf8') !== JSON.stringify(data.types, null, 1) + '\n') diffs.push('types');
  if (diffs.length) {
    console.error(`Kanto data differs from PokéAPI: ${diffs.join(', ')}`);
    process.exit(1);
  }
  console.log(`kanto routes match PokéAPI (${data.kanto.routes.length} routes, Red and Blue), evolutions and Gen 1 types too`);
} else {
  writeFileSync(FILES.kanto, JSON.stringify(data.kanto, null, 1) + '\n');
  writeFileSync(FILES.sources, JSON.stringify(data.sources, null, 1) + '\n');
  writeFileSync(FILES.types, JSON.stringify(data.types, null, 1) + '\n');
  // Team rules data (§B14), shared by My Team and the relay: family, evolved or first stage, final, legendary.
  const LEGENDARY = ['articuno', 'zapdos', 'moltres', 'mewtwo', 'mew'];
  const rules = {};
  for (const id of Object.keys(data.kanto.species)) {
    rules[id] = {
      fam: data.kanto.families[id] ?? id,
      evolved: data.kanto.evolutions.some((e) => e.to === id),
      final: !data.kanto.evolutions.some((e) => e.from === id),
      legendary: LEGENDARY.includes(id),
    };
  }
  writeFileSync('worker/src/species-rules.json', JSON.stringify(rules) + '\n');
  // Localized names (§B17): PokéAPI's own names per language for species and moves; the game shows them in capitals.
  const roster = JSON.parse(readFileSync('src/data/roster.gen1.json', 'utf8'));
  const moveIds = [...new Set([...Object.keys(data.kanto.moves), ...Object.keys(roster.moves)])];
  // Game language -> PokéAPI language. Japanese uses the kana names (ja-hrkt) so young children can read them.
  const API_LANG = { fr: 'fr', es: 'es', de: 'de', it: 'it', ja: 'ja-hrkt', 'zh-Hans': 'zh-hans' };
  for (const [lang, api] of Object.entries(API_LANG)) {
    const names = { _source: `PokéAPI names (${api}), generated by scripts/build-kanto.mjs`, species: {}, moves: {} };
    for (const id of Object.keys(data.kanto.species)) {
      const sp = await get(`pokemon-species/${(await get(`pokemon/${id}`)).species.name}`);
      const n = sp.names.find((x) => x.language.name === api)?.name;
      if (n) names.species[id] = n.toUpperCase();
    }
    for (const id of moveIds) {
      const n = (await get(`move/${id}`)).names.find((x) => x.language.name === api)?.name;
      if (n) names.moves[id] = n.toUpperCase();
    }
    writeFileSync(`src/data/names.${lang}.json`, JSON.stringify(names, null, 1) + '\n');
    console.log(`names.${lang}.json: ${Object.keys(names.species).length} species, ${Object.keys(names.moves).length} moves`);
  }
  const k = data.kanto;
  console.log(`wrote ${FILES.kanto}: ${k.routes.length} routes, ${Object.keys(k.species).length} species, ${Object.keys(k.moves).length} moves, ${k.evolutions.length} evolutions`);
  for (const r of k.routes) console.log(`${r.name}: red ${r.encounters.map((e) => `${e.species} ${e.slots.join('/')}`).join(', ')} | blue ${r.blue.map((e) => `${e.species} ${e.slots.join('/')}`).join(', ')}`);
  const none = Object.entries(data.sources).filter(([, v]) => !v.length).map(([n]) => n);
  console.log(`species without a source: ${none.length ? none.join(', ') : 'none'}`);
}
