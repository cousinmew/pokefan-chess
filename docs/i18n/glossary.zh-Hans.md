# Simplified Chinese chess glossary

Terms used in `src/data/strings.zh-Hans.json`.

| English | 简体中文 |
|---|---|
| check | 将军 |
| checkmate | 将死（一步杀、两步杀） |
| stalemate | 逼和 |
| castling | 王车易位 |
| en passant | 吃过路兵 |
| promotion | 升变 |
| pawn | 兵 |
| knight | 马 |
| bishop | 象 |
| rook | 车 |
| queen | 后 |
| king | 王 |
| capture | 吃子（吃掉） |
| fork | 捉双 |
| pin | 牵制 |
| skewer | 串击 |
| discovered attack | 闪击 |
| discovered check | 闪将 |
| double check | 双将 |
| back rank (mate) | 底线（底线杀） |
| hanging piece | 无保护的棋子 |
| trapped piece | 被困的棋子 |
| win material | 得子 |
| draw | 和棋 |
| threefold repetition | 三次重复局面 |
| fifty move rule | 50步规则 |
| insufficient material | 子力不足 |
| resign | 认输 |
| passed pawn | 通路兵 |
| advanced pawn | 冲兵 |
| remove the defender | 消除保护（吃掉防守子） |
| deflection | 引离 |
| x-ray attack | X光攻击 |
| lone king | 孤王 |
| take back | 悔棋 |
| white / black (side) | 白方 / 黑方 |
| chessboard | 棋盘 |
| chess | 国际象棋 |

## Notes for the native reviewer

- Pokémon world names follow the official Simplified Chinese localisation: 宝可梦, 图鉴, 精灵球, 大木博士, 赤红 (RED), 青绿 (BLUE), 叶子 (LEAF), 火箭队, 武藏和小次郎, gym leaders 小刚/小霞/马志士/莉佳/阿桔/娜姿/夏伯/坂木, Elite Four 科拿/希巴/菊子/阿渡, places 真新镇/常磐市/深灰市/华蓝市/枯叶市/玉虹市/浅红市/金黄市/红莲岛/月见山/无人发电厂/游戏城/双子岛/冠军之路/石英高原/华蓝洞窟, badges 灰色/蓝色/橙色/彩虹/粉红/金色/深红/绿色徽章, OLD AMBER 秘密琥珀. Please check these against the current official naming, especially 双子岛, 游戏城 and the badge names.
- Trainer classes use the official names where they exist (短裤小子, 迷你裙, 捕虫少年, 怪人, 精英训练家, 馆主, 四天王). 露营少年, 野餐少女, 养鸟人, 飙车族, 钓鱼人, 游泳选手 are my choices for a child audience. GAMBLER is 赌徒, the literal official class, which may be unwelcome in a children's game: consider replacing it with something softer.
- The game's own invented trainer names (TOBY, MINA, OSKAR...) are transliterated into short Chinese names (托比, 米娜, 奥斯卡...). The player names keep the official 赤红/叶子 and get simple Chinese names for the others (翠玉, 罗文, 小天, 皮普). MEIR is kept in Latin letters on purpose, since it may be a real child's name: please confirm.
- Speaker prefixes "OAK:" and "BLUE:" become 大木博士： and 青绿：. "LEAGUE" is 宝可梦联盟. "Gramps" is 爷爷.
- Cartridge names YELLOW and BLUE are 黄 and 蓝 (colour words), so the BLUE cartridge does not clash with the rival 青绿. 动画 is used for the "Anime" battle style.
- Mate themes use the common puzzle terms 一步杀/两步杀 in titles and 将死 in sentences. "Advanced pawn" (theme) is 冲兵, while the lesson titled PASSED PAWNS uses 通路兵. "Hanging piece" is spelled out as 无保护的棋子 rather than the jargon 悬子, for children.
- 将军 is used both as the noun "check" and the verb "give check"; please confirm it reads naturally in short commands such as "将军对方的王！".
- The disclaimer keeps the company names in Latin letters and adds no names; "Not affiliated or endorsed" is rendered as 本作品与上述公司无关联，也未获其认可。
- Yellow and path strings stay within 16 characters. Ellipses use 中文省略号 ……, quotes use “ ”.
