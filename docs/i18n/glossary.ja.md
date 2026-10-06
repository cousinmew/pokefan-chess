# Japanese chess glossary

Terms used in `src/data/strings.ja.json`.

| English | 日本語 |
|---|---|
| check | チェック |
| checkmate | チェックメイト（メイト） |
| stalemate | ステイルメイト |
| castling | キャスリング |
| en passant | アンパッサン |
| promotion | プロモーション |
| pawn | ポーン |
| knight | ナイト |
| bishop | ビショップ |
| rook | ルーク |
| queen | クイーン |
| king | キング |
| piece (generic) | こま |
| capture | とる（こまをとる） |
| fork | フォーク |
| pin | ピン |
| skewer | スキュア |
| discovered attack | ディスカバードアタック（かくれたこうげき） |
| discovered check | ディスカバードチェック |
| double check | ダブルチェック |
| back rank (mate) | バックランク（バックランクメイト） |
| hanging piece | まもりのないこま |
| trapped piece | にげばのないこま |
| passed pawn | パスポーン |
| advanced pawn | すすんだポーン |
| deflection | そらし |
| x-ray attack | エックスレイ（アタック） |
| remove / capture the defender | まもりをとりのぞく / まもりのこまをとる |
| win material | こまをかちとる |
| mate in 1 / in 2 | 1てでメイト / 2てでメイト |
| draw | ひきわけ |
| threefold repetition | おなじきょくめんが3かい |
| fifty-move rule | 50てルール |
| insufficient material | こまがたりない |
| resign | こうさん |
| take back | まった |
| move (a turn) | て（1て、てかず） |
| line (of moves) | てじゅん |
| white / black | しろ / くろ |
| square | マス |
| chessboard | チェスばん |

## Notes for the native reviewer

- Script: almost everything is hiragana/katakana with no spaces, in the spirit of the Gen 1 games, for young readers. The one exception is `footer.disclaimer`, written in polite standard Japanese with kanji (非公式・無料・非営利…), because parents read it. Please check it says exactly: unofficial, free, noncommercial; Pokémon © the four companies; not affiliated or endorsed. The company names stay in Latin letters, joined with 、 instead of "and".
- Official Japanese names are used throughout: レッド, ロケットだん, オーキドはかせ (speaker tag オーキド：), gym leaders (タケシ, カスミ, マチス, エリカ, キョウ, ナツメ, カツラ, サカキ), the Elite Four (カンナ, シバ, キクコ, ワタル), the badges (グレーバッジ…グリーンバッジ), places (マサラタウン, トキワシティ, おつきみやま, むじんはつでんしょ, ふたごじま, チャンピオンロード, セキエイこうげん, ハナダのどうくつ), OLD AMBER = ひみつのコハク, Poké Ball = モンスターボール, Pokédex = ポケモンずかん, HALL OF FAME = でんどういり.
- Doubt 1, the rival: the English rival BLUE is グリーン in Japanese, so `trainer.name.blue`, `plate.blue`, every "BLUE:" line and "CHAMPION BLUE" use グリーン. The cartridge `shelf.blue.name` is the colour, so it is あお (and YELLOW is きいろ). Japanese players know these cartridges as 青 and ピカチュウ; please confirm きいろ/あお read naturally as cartridge names and do not clash with the rival.
- Doubt 2, tactic names: Japanese chess books use the English loanwords (フォーク, ピン, スキュア, ディスカバードアタック, バックランクメイト, パスポーン). For a hanging piece, the term 浮き駒 (うきごま) exists but is opaque to children, so I used まもりのないこま. Deflection is そらし and win material is こまをかちとる; please check these against what Japanese junior chess clubs say.
- Doubt 3, Gen 1 trainer classes: the official classes are used as-is (たんパンこぞう, ミニスカート, むしとりしょうねん, キャンプボーイ, ピクニックガール, とりつかい, ぼうそうぞく, ギャンブラー, りかけいのおとこ, つりびと, かいパンやろう, エリートトレーナー). ぼうそうぞく (biker gang) and かいパンやろう may feel rough for small children; they are faithful to the games.
- The game's own trainers (TOBY, MINA…) and MEIR are plain katakana transliterations (トビー, ミナ… メイール). Please check MEIR = メイール and DEV = デヴ.
- Battle lines copy the original game phrasing: 「{attacker}の{move}！」, 「こうかはばつぐんだ！」, 「こうかはいまひとつのようだ…」, 「あ！やせいの{name}がとびだしてきた！」, 「おや！？{pawn}のようすが…！」, 「めのまえがまっくらになった！」, and Team Rocket's 「やなかんじー！」.
- "{class} {name}" became 「{class}の{name}」 (たんパンこぞうのトビー). For LEGENDARY the class is でんせつ, so it reads でんせつのサンダー.
- Take back uses まった (the chess and shogi word for asking to undo a move).
- The Trainer Rating "~" is translated as やく (about): トレーナーレベルやく{level}.
- `title.name` keeps "PokeFan Chess" in Latin letters as the product name; tell me if a katakana title is wanted.
- Yellow/path strings (ages 4 to 7) are at most 16 characters. `yellow.play.sub` drops "the computer" to fit: ピカチュウでたいせんしよう！
