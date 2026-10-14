# PokeFan Chess: Red vs Rocket

Real chess where every piece is a Gen 1 Pokémon. Red's champion team (Pikachu as king, Charizard as queen, Snorlax, Venusaur, Blastoise, Rapidash and a row of Eevee) plays white against Giovanni and the Rocket crew (Nidoking, Nidoqueen, Rhydon, Arbok, Weezing, Dugtrio and the Rattata swarm). Every capture is a tiny Gen 1 battle, every promotion is an evolution, and chess.js keeps the rules honest. Play a friend on one device, or the computer at four levels from Youngster to Champion.

Play it: https://pokefanchess.com

<!-- Screenshot: added by the owner. -->

## Run it

```
npm i && npm run assets && npm run dev
```

`npm run assets` fetches sprites and cries from PokeAPI into `public/assets/` (gitignored). Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`, `npm run gates`.

## Disclaimer

Unofficial, free, noncommercial fan project. Pokémon © Nintendo, Game Freak, Creatures Inc. and The Pokémon Company. Not affiliated or endorsed. No Nintendo art or audio is stored in this repository; it is fetched at build time and served only alongside the game. There are no ads, donations or tracking, and there never will be.

## Privacy

PokeFan Chess was made by Cousin Mew for a little cousin who loves chess and Pokémon. It is free: no ads, no accounts, no tracking, and there never will be. The game's About & privacy screen (start menu, shelf, OPTION or footer) says the same in plain words.

- **Saves** stay on your device, in this browser's storage (`src/store/persist.ts`). Export save writes a file that only you keep.
- **Save codes** are opt in (OPTION, Make a save code). A copy of that save (trainer name and progress) is kept on the game's small server under the 8 character code only, with no account, name or email, and it is deleted after 180 days without use (`worker/src/Vault.ts`).
- **Feedback** notes (OPTION, FEEDBACK, and translation suggestions) are kept without names or emails: the note (or, for a translation, the line and the suggested wording), its kind, the screen, the language, the game version and the time. Against spam the server counts notes per hour under a hash of the address and the hour, never the address itself, and clears those counts within about two hours (`worker/src/index.ts`, `worker/src/Feedback.ts`).
- **Online games** pass through the same server. A room keeps the moves, each side's team and look and a random seat token, never a name, and a room untouched for a day is deleted (`worker/src/Room.ts`, `worker/src/alarm.ts`).
- **Nothing is sent to anyone else.** No analytics, ads or scripts from other sites; the only server the game talks to is its own (grep gate G2). The site is hosted on GitHub Pages and the server runs on Cloudflare Workers (no Workers logs are turned on in `worker/wrangler.toml`); like any web host, they handle the connection, your IP address included, to deliver the game.

Questions, or a rights holder with a concern? Open an issue on this repository.

## Licences

| What | Licence |
|---|---|
| Code | AGPL-3.0-only |
| Original docs and data | CC-BY-NC-SA-4.0 |
| Stockfish engine (copied from npm at install) | GPL-3.0 |
| Pokémon sprites and cries | © The Pokémon Company, Nintendo, Game Freak, Creatures Inc.; not licensed by this project |

See `REUSE.toml` and `CREDITS.md`.

## Takedown

If a rights holder asks, this project comes down immediately. Open an issue on this repository and it will be actioned the same day.
