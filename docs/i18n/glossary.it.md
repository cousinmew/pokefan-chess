# Italian chess glossary

Terms used in `src/data/strings.it.json`.

| English | Italiano |
|---|---|
| check | scacco |
| checkmate | scacco matto (matto) |
| stalemate | stallo |
| castling | arrocco (arroccare) |
| en passant | en passant (presa en passant) |
| promotion | promozione (promuovere) |
| pawn | pedone |
| knight | cavallo |
| bishop | alfiere |
| rook | torre |
| queen | regina |
| king | re |
| capture | presa (prendere; "mangiare" in the ages 4 to 7 strings) |
| fork | forchetta |
| pin | inchiodatura (inchiodare) |
| skewer | infilata |
| discovered attack | attacco di scoperta |
| discovered check | scacco di scoperta |
| double check | scacco doppio |
| back rank (mate) | ultima traversa (matto del corridoio) |
| hanging piece | pezzo in presa |
| trapped piece | pezzo intrappolato |
| draw | patta ("pareggio" in the ages 4 to 7 strings) |
| resign | arrendersi (abbandonare) |
| passed pawn | pedone passato |
| advanced pawn | pedone avanzato |
| win material | guadagnare materiale |
| remove the defender | eliminare il difensore |
| deflection | deviazione |
| x-ray attack | attacco ai raggi X |
| threefold repetition | triplice ripetizione |
| 50 move rule | regola delle 50 mosse |
| insufficient material | materiale insufficiente |
| square (light / dark) | casa (chiara / scura) |
| chessboard | scacchiera |
| puzzle | problema |

## Notes for the native reviewer

- **Queen = "regina", not "donna".** "Donna" is the formal term in Italian chess literature, but "regina" is what children (and most casual players) say. Please confirm.
- **Puzzle = "problema".** Chess sites use "problemi"; "puzzle" in Italian suggests a jigsaw. "Esercizio" was used for the Victory Road drills.
- **Capture in the ages 4 to 7 strings = "mangiare"** ("Mangia un pezzo!"), the word Italian children actually use; the 8+ strings use "prendere"/"presa"/"cattura".
- **Characters kept in English: RED, BLUE, LEAF and the other trainer names.** The Italian games call the rival "BLU" and the hero "ROSSO", but RED/BLUE are also team names and nameplates elsewhere in the data, and the French file keeps them. The cartridge names are translated ("GIALLO", "BLU"), so BLUE the rival and BLU the cartridge now differ. Reviewer: decide whether the rival should be "BLU".
- **Official Italian names used** for places (Biancavilla, Smeraldopoli, Plumbeopoli, Celestopoli, Aranciopoli, Azzurropoli, Fucsiapoli, Zafferanopoli, Isola Cannella, Monte Luna, Isole Spumarine, Via Vittoria, Altopiano Blu, Grotta Celeste), badges (Medaglia Sasso, Cascata, Tuono, Arcobaleno, Anima, Palude, Vulcano, Terra), Superquattro, Capopalestra, Campione, Sala d'Onore, Scheda Allenatore, Recluta Rocket, Cromatico (shiny). Please verify from memory of the games: "AMBRA ANTICA" (Old Amber), "GITANTE" (Picnicker), "PUPA" (Lass), "CENTAURO" (Biker), "GIOCATORE" (Gambler), "ORNITOLOGO" (Bird Keeper).
- **Youngster = "Bullo".** This is the official trainer class, but it is also the name of the easiest computer level, and "bullo" means "bully" in everyday Italian. An alternative would be "Ragazzino" (unofficial).
- **Move names:** "RAFFORZATORE" (Harden) is used in the Metapod joke; the battle line "{attacker} usa {move}!" follows the games' present tense. "{defender} è esausto!" is the games' fainting line.
- **Team Rocket's "blasting off again"** is rendered "Sembra che il Team Rocket sia stato sconfitto di nuovo!". The Italian anime catchphrase may be different; please replace with the one Italian kids know.
- **Gender:** strings address the player with masculine agreements where unavoidable ("Sei stato via", "Ti sei arreso", "il tuo amico"). Where possible, sentences were rephrased to stay neutral (for example "Ottimo lavoro!" rather than "Bravo!"). Placeholders that hold piece or Pokémon names ({piece}, {front}, {back}) were written without articles so gender does not matter.
- **"Pokémon + badge" / "Big badge"** (piece style) use "simbolo" for the chess glyph badge, to avoid confusion with gym badges ("medaglie").
- **Pikachu's Path = "Il Sentiero di Pikachu"**, sticker book = "Album delle figurine" (figurine is the word Italian children use for collectible stickers).
