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
