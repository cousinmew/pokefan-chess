# Changelog

## 0.1.0 (S1)

- Scaffold: Vite, strict TypeScript, ESLint, Vitest, Playwright, husky, CI, Pages deploy.
- Roster data, asset fetch script, grep gates, debug harness behind `?debug=1`.
- DOM board with tap and drag, highlights, glyphs, keyboard, promotion picker, check and every end state, Two Players.

## 0.2.0 (S2)

- Battle overlay on every capture: sprites, typed text, 14 procedural effects, flash, HP drain, effectiveness, faint.
- Gen 1 type chart with the fallback rule (Pikachu uses QUICK ATTACK on Ground, Dugtrio uses SLASH on Charizard).
- Evolution sequence on promotion, Quick and Off animation modes, tap or key to skip, cries and synth sounds.

## 0.3.0 (S3)

- Computer opponent: Youngster (seeded random) and Stockfish 19 lite at Gym Leader, Elite Four and Champion, loaded only when needed.
- Minimum think time, 5 s timeout and failure fallback to Youngster with a message, take back vs Youngster and Gym Leader.

## 1.0.0 (S4)

- Splash, title with one tap Battle! quick play and Continue, team and level select, intro card, How to Play, settings screen, end screen with Rematch and Menu.
- Settings, the game in progress and the last quick play are saved locally; everything still works with storage blocked.
- Share button, footer disclaimer and GitHub link, full README and CREDITS. Board palette set to the T3 default.

## 1.1.0 (O1)

- Play Online with a friend: create a room, share the 4 letter code or link, the relay checks every move. Six preset reactions, give up, rematch with swap sides, 60 s to reconnect.

## 1.2.0 (FX and audio)

- Battle effects twice as large and outlined, with a short flash tinted by move type; FX gallery and review sheet.
- Music: title and board loops, battle, victory, defeat and evolution cues, chiptune placeholders until the real tracks land; music volume slider. New sounds for pick up, place, check, HP drain, castling and evolution.

## 1.3.0 (C1)

- Puzzles: 8,035 Lichess puzzles in 18 themes, served near your Trainer Rating (an honest estimate), with hints, auto played replies and saved progress.

## 1.4.0 (C2)

- Kanto Adventure: Oak's starter, a map of 9 routes with the real Red tall grass tables, puzzles that become wild encounters, catch odds earned by how you solved, route mastery, a Pokédex, and My Team skins that play vs Computer and online.

## 1.5.0 (C2b)

- Kanto Journey: Oak's intro, your trainer name, route trainers, rival BLUE three times, story boxes, Trainer Card and Training.
- All 151 in the Pokédex: Red and Blue wild tables, candy and evolution, shinies, stars from Oak, and every caught form as a My Team skin. Effectiveness lines for every Gen 1 type.

## 1.6.0 (C2c)

- Oak's intro with Nidorino, trainer sprites everywhere, battle intro and goal cards with pips, a goal banner over every puzzle, and Oak's mini lessons the first time a theme appears.
- My Team follows rules now: your starter's family is king, queens are fully evolved (after the first badge), pawns are first stage. Old teams were adjusted once, with a note.
- Sprites never show as empty boxes, even on a slow connection.

## 1.7.0 (C3)

- The eight gyms with their leaders and badges, Victory Road checkmate drills, the Elite Four, Champion BLUE as a full game, and the Hall of Fame.
- Every way to complete the Pokédex: starters from your rival, gifts, fossils, a prize, trade evolutions after online wins, the legendary birds, Mewtwo after the Champion, and Mew at 150.
- Players from before the team rules keep their queen.

## 1.8.0 (C4)

- After every puzzle the game waits for you: the winning line replays with arrows and the key idea is drawn, or your mistake is shown with the reply that punishes it and a Show answer button. Step through with ◀ ▶.
- The first four gyms need 3 of 5 to win.

## 1.9.0 (C5)

- A new home hub: Journey, Battle and Trainer tiles with a Pokémon on each, a one line description, your progress, and a "?" to its page in the new How to Play booklet. Continue picks up where you left off.

## 2.0.0 (C6)

- Two cartridges: YELLOW, a simple mode for ages 4 to 7 with Pikachu's Path (12 tiny lessons) and a sticker book, and BLUE, the full story. Pick on first launch; switch in Settings by holding the button for 2 seconds.
- Play in English, Français, עברית or Español. Hebrew reads right to left; the board stays left to right.

## 2.1.0 (C5b)

- Clearer pieces on phones: sprites cropped to fill their square, a bold chip showing each chess piece, a full width board, and three piece styles (Pokémon + badge, Big badge, Classic).
- A Who's who legend under the board (tap a role to find those pieces), press and hold a piece for its card, and an option for still sprites.

## 2.2.0 (C6 saves)

- Up to 4 players per device, each with their own trainer, cartridge, language and progress; an existing save becomes player 1. Who's playing? shows after the splash when there is more than one.
- Export and Import save, "Save protected" in Settings, an opt in save code to carry progress to another device (no names, no accounts, deleted after 180 days unused), and a "Back up your save" note after each badge.
- Installable web app with an offline app shell and a one time Add to Home Screen tip.
- A language button (EN, FR, HE, ES) on every home screen, and YELLOW's Play now picks a level with 1 to 4 stars.

## 2.3.0 (C7)

- BLUE story teams start unevolved (Charmander, Bulbasaur, Squirtle, Ponyta; Nidoran, Ekans, Koffing, Diglett, Rhyhorn) and evolve at 3 and 6 badges with an evolution ceremony.
- Battle style: Anime (speed lines, camera push and shake, afterimages, impact frame, glow, spin out KO, SUPER EFFECTIVE! banner) or Classic; never more than 3 flashes a second, Classic under reduced motion.
- A secret code unlocks MEIR as your trainer.
- Trainers stand beside the board and react to captures, check and the end.

## 2.4.0 (languages, phase 2)

- Six more languages: Deutsch, Italiano, Nederlands, Português, 日本語 and 简体中文, with official Pokémon and move names where the games have them (kana in Japanese).
- Japanese and Chinese use the device's own fonts, and Pokémon names never break across lines.

## 2.5.0 (C8)

- The level pickers show who you will face at each level, and your own trainer opposite.
- Trainers step into the battle screen behind their Pokémon ("Go!", "Oh no!"); in Quick mode the reactions show on the name plates.
- Name plates show titles: "GIOVANNI · Boss", "MEIR · Trainer".

## 2.6.0 (three fixes)

- The secret code works on every keyboard and layout, shows its progress as ten dots, and typing MEIR at the name step works too.
- Menus and starters appear sooner on slow connections: one icon sheet, starters first, battle sprites in idle time, smaller WebP sprites where they help, and a sprite cache after the first visit.
- YELLOW has My Team: pick stickers for each piece, with 30 stickers unlocked in a fixed order by lessons and then wins.

## 2.7.0 (fit, trainer teams, start menu)

- Game screens always fit the window, from 320x480 to 2560x1440, with no scrolling; your name plate and the message box are one bar.
- Each computer trainer brings their own Pokémon: Brock's Geodude and Onix, Jessie & James's Meowth and Arbok, Giovanni's Nidoking, and more.
- A Gen 1 style start menu: CONTINUE, NEW GAME, OPTION and SWITCH TRAINER, with each player's own save, and Two Players where each side plays as their own save.

## 2.8.0 (Russian)

- Русский: the whole game in Russian, with Pokémon names in English as PokéAPI has no Russian ones.

## 2.9.0 (playtest fixes)

- Puzzle reviews show the right move on the board, after your own move, in plain words, with a REPLAY button and an optional coordinates setting.
- The first tap no longer stalls on slow phones.
- Send feedback from OPTION, and translators can suggest better wordings with a review link.

## 2.10.0 (start flow)

- Professor Oak appears at once when a new game starts.
- Change your mind during NEW GAME: BACK returns to the start menu with nothing saved.
- A START button on every screen after the intro: Journey, VS Computer, VS Friend, Online, Pokédex, Option, Save & Quit.
- PLAY CHESS: a quick game without a save.

## 2.11.0 (options and relay)

- BACK in OPTION works from everywhere (it did nothing from the YELLOW gear), and B or Escape go back too.
- When the server can't be reached the game says so; feedback waits on the device and sends later.
- The server protects its free daily allowance: past 80%, new rooms and feedback wait for tomorrow while games in progress finish.

## 2.12.0 (top bar and plates)

- One START button instead of Menu and START; the status line stays centred over the board.
- Each side's moves show in that side's own plate; names and titles fit on one line.

## 2.13.0 (playtest polish)

- A new device sees NEW GAME, not someone else's CONTINUE; CONTINUE shows whose save it is, and NEW GAME never leaves an empty "Player 1" behind.
- The shelf asks "Do you know how chess pieces move?" and YELLOW, the gentle start, comes first.
- In every puzzle you are TEAM RED at the bottom with your own team, the goal ("Checkmate in 1 move") is always in the header, and the plate names the trainer you face.
- Route 1 starts with Oak's three-move warm-up and a first catch that can't fail; the first trainers set the easiest puzzles.
- The map marks cleared places, points to what's next, and says what opens the next place; win and unlock cards after each battle.
- Every screen fits any window, from a 320 px phone to a desktop or a small embed, in portrait and landscape, with no page scroll.
- INSTALL FOR OFFLINE PLAY in OPTION (Android, Windows and other Chrome or Edge browsers; steps for iPhone).
- vs Computer levels are named Easy to Super hard; the trainer shown is the one you face.
- Fixed: the computer stalling after OPTION, old popups acting in a later game, renames being undone, a wrong move in a lesson hiding its goal.
- Screens change with short fades and wipes instead of hard cuts, and big moments (a solve, a win, a badge, a new place) get their beat; every hold can be skipped with a tap after its first quarter second.
- Screens, cards and boards open once their art is drawn (with a cap and a "Loading Pokémon…" line on a slow connection), so no square is blank when you can move; capture battles start with both Pokémon drawn.
- Sprites and cries load in the order you need them: the next board's teams, your My Team and YELLOW's mascots first; the Pokédex and sticker book load only what is on screen. Cries play with their moment, and a cry that would come late is skipped.
- A smaller first download: only English ships at first, other languages load when chosen.
- Every action answers in time: the Journey's evolutions, badges, catches, gifts and Training say what happened, in order; online rematches, a friend leaving or coming back, and a lost connection say what is going on.
- The computer answers one request at a time, so a review and a game can no longer get each other's moves.

## 2.14.0 (trust pass)

- The splash credits the game without naming anyone, "Made by Cousin Mew for my little cousin", with "Free, unofficial fan project" under it.
- The start menu and the first launch shelf end with "Free fan project", then "About · Source on GitHub"; the footer has About next to Source on GitHub.
- A new About & privacy screen, from that row, OPTION and the footer: who made the game, that it is free with no advertising, accounts or tracking, what is stored and where, the source (AGPL-3.0), where to ask a question, the disclaimer and the version.
- On short windows the start menu's items are a little smaller, so the new row fits, and the menu's top can no longer be cut off.
- Delete my save code in OPTION removes the server copy at once (after one question); the save on the device stays. When the server can't delete it (not reached, or a relay from before this version), the code and the save are kept and OPTION says so.
- Feedback notes are deleted 180 days after they are sent, like an unused save code.
- OPTION, About and the README say the same about a save code: it keeps the trainer name picked in the game (like RED or LEAF), never a real name, and the progress. About adds how to delete a code, never to post one, and that GitHub links open GitHub's own site.
- A link can no longer point the game at another server: ?relay= works only for a relay on the same machine (the tests), and the page itself allows connections only to the game and its relay.
- The relay turns Workers Logs off on every deploy.
- The splash credit stays centred when it wraps, the About button fits in every language, the trust row no longer leaves a dot hanging when it wraps and is easier to read on a desktop, and Back from About returns to the same place in OPTION and the hub.
