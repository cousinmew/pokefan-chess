# Russian chess glossary

Terms used in `src/data/strings.ru.json`.

| English | Русский |
|---|---|
| check | шах |
| checkmate | мат |
| stalemate | пат |
| castling | рокировка |
| en passant | взятие на проходе |
| promotion | превращение пешки |
| pawn | пешка |
| knight | конь |
| bishop | слон |
| rook | ладья |
| queen | ферзь |
| king | король |
| capture | взятие (взять, забрать) |
| fork | вилка |
| pin | связка |
| skewer | сквозной удар |
| discovered attack | вскрытое нападение |
| discovered check | вскрытый шах |
| double check | двойной шах |
| back rank (mate) | мат по последней горизонтали |
| hanging piece | незащищённая фигура |
| trapped piece | пойманная фигура |
| capturing the defender | уничтожение защитника |
| win material | выигрыш материала |
| draw | ничья |
| threefold repetition | троекратное повторение |
| insufficient material | недостаточно материала |
| resign | сдаться |
| passed pawn | проходная пешка |
| advanced pawn | продвинутая пешка |
| deflection | отвлечение |
| x-ray attack | рентген |
| take back | вернуть ход |
| line (variation) | вариант |
| light / dark squares | белые / чёрные поля |
| chessboard | шахматная доска |
| puzzle | задача |

## Notes for the native reviewer

- Pokémon, move and Kanto place names stay in Latin script and are never declined (PIKACHU, HARDEN, PALLET TOWN, MT. MOON, ROUTE 1). Where grammar needs a case, the sentence is rebuilt: "покемон {name}", "фигурой {mover}", "для твоего покемона {name}". Please check that these still sound natural.
- Generic places are translated, and the proper part stays in Latin: СТАДИОН PEWTER, ЛАБОРАТОРИЯ CINNABAR, ВЕРШИНА VICTORY ROAD, ЭЛЕКТРОСТАНЦИЯ (POWER PLANT), ИГРОВОЙ ЗАЛ (GAME CORNER), ЛИГА, ЗАЛ СЛАВЫ. Gym = "стадион", as in the Russian dub of the anime.
- Badges are translated as ЗНАЧОК «ВАЛУН», «КАСКАД», «ГРОМ», «РАДУГА», «ДУША», «БОЛОТО», «ВУЛКАН», «ЗЕМЛЯ». This is a doubt: keeping BOULDERBADGE etc. in Latin would match the rule for names.
- Trainer classes are translated (МАЛЬЧИШКА, ДЕВЧОНКА, ЛОВЕЦ ЖУКОВ, ТУРИСТ, ТУРИСТКА, ПТИЧНИК, СУПЕРБОТАН, АС-ТРЕНЕР...). Trainer names stay in Latin. "Youngster" as a computer level is also "Мальчишка".
- Gender: Russian past tense marks gender, and the player can be a boy or a girl. Strings that talk to the player use the present tense or neutral forms ("Победа твоя!", "Партия сдана.", "Тебя не было слишком долго"). A few rival and trainer lines still use the masculine for the player ("ты добрался", "ты заслужил", "ты нашёл мат", "где ты уже был"). Please decide whether to make them neutral too.
- Numbers with nouns: Russian plural forms change with the number (1 звезда, 2 звезды, 5 звёзд), and there are no plural rules in the string system. Counts are written as "Значки: {n}", "Звёзды: {n}", "Ходов в запасе: {limit}" to stay correct for every number.
- Pokémon are animate masculine ("твой {from}", "{name} пойман"). With a female Pokémon (NIDORINA) this reads as masculine, which is normal for "покемон".
- TEAM ROCKET stays in Latin as a name; "TEAM RED" is translated as КОМАНДА RED, because it is not a name in the source. The Russian anime dub says "Команда R"; we did not use it.
- Pokédex = "Покедекс", Poké Ball = "покебол", candy = "конфеты", shiny = "сияющий", sticker = "наклейка", cartridge = "картридж".
- "Hanging piece" is "незащищённая фигура" in titles and "фигура без защиты" in the simple goal lines. "X-ray" is "рентген", the usual name among Russian players.
- The player is addressed with "ты" everywhere, and "играйте/ходите" only where two players share one screen.
