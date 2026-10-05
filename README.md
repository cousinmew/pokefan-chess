# PokeFan Chess: Red vs Rocket

Chess where every piece is a Gen 1 Pokémon. Team Red (Pikachu, Charizard, Snorlax, Venusaur, Blastoise, Rapidash, Eevee) plays white against Team Rocket (Nidoking, Nidoqueen, Rhydon, Arbok, Weezing, Dugtrio, Rattata). The rules are real chess, enforced by chess.js.

Status: early build. Two Players on one device works, with capture battles and evolutions; the computer opponent and the title screens are coming.

## Run it

```
npm ci
npm run assets   # fetches sprites and cries into public/assets (never committed)
npm run dev
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`, `npm run gates`.

## Licence

Code AGPL-3.0-only. Original docs and data CC-BY-NC-SA-4.0. See `REUSE.toml`.

Unofficial, free, noncommercial fan project. Pokémon © Nintendo, Game Freak, Creatures Inc. and The Pokémon Company. Not affiliated or endorsed. No Nintendo art or audio is stored in this repository; it is fetched from PokeAPI at build time.
