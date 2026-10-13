// SPDX-License-Identifier: AGPL-3.0-only
// Kanto Journey controller (§B11, §B12): Oak's intro, the map, trainer and rival battles (the C1 puzzle player in a
// battle context), towns, tall grass encounters, the Trainer Card, Training, the Pokédex with candy, and My Team.
import { BADGE_IN_MS, DRILL_LEVEL, GYM_NEED_EARLY, GYM_NEED_LATE, PLAYTIME_TICK_MS, WIN_BEAT_MS } from '../config';
import type { CoverKind } from '../ui/transitions';
import { defaultSpecies, SPECIES } from '../board/pieces';
import { stageEvolutions, stageFor } from '../board/stages';
import { myTrainer, trainerSpriteId } from '../look';
import { abandonNewGame, endCreating, hasProgress, isCreating } from '../profiles';
import { sound } from '../audio/audio';
import { music } from '../audio/music';
import { createRng } from '../game/rng';
import { fmt } from '../game/text';
import { cardScreen, choiceScreen, dexDetail, dexScreen, encounterPanel, goalCard, hofScreen, textGoalCard, nameScreen, oakScreen, story, teamScreen, trainerIntro, trainingScreen } from '../ui/kanto';
import { badgeCard, mapScreen, placeCard, routeScreen, tapCard, winCard } from '../ui/journeyMap';
import { trainerSpot } from '../ui/cards';
import { exampleOf, lessonScreen, oakIntro } from '../ui/lesson';
import { pool, shownLevel } from './trainer';
import trainers from '../data/trainers.json';
import type { StringKey } from '../game/text';
import { toast } from '../ui/dom';
import { currentSlot, isGuest, PLAYER_TRAINER, save } from '../store/persist';
import { addCatch, addPlayTime, awardMew, championLevel, chooseStarter, EVOLUTIONS, evolve, loadCampaign, markSeen, recordRoute, rollEncounter, saveCampaign, sendToOak, STARTERS, throwBall, tradeEvolve, type Campaign, type Route } from './kanto';
import { beatTrainer, clearPlace, goalLine, nextGoal, nextTrainer, PLACES, placeCleared, RIVAL, routeOf, teamOf, themesFor, trainerName, trainingThemes, visit, WARMUP_PLACE, type Drill, type Place, type Trainer } from './journey';
import { warmup, type WarmupHost } from './warmup';
import { THEMES } from './trainer';
import type { PuzzleGame } from './puzzleGame';
import type { Challenge } from '../main';
import type { DrillStatus } from './drill';

export interface JourneyHost {
  show(view: HTMLElement): void;
  /** The shared overlay layer for story boxes and panels. */
  modal: HTMLElement;
  puzzle: PuzzleGame;
  goTitle(): void;
  /** Bumps when the player leaves a game view; stale timers check it. */
  gen(): number;
  /** The evolution animation (the board's battle overlay). */
  evolveAnim(from: string, to: string): Promise<void>;
  /** A full game vs the computer on the board (Victory Road drills, Champion BLUE). */
  startChallenge(ch: Challenge): void;
  /** The YELLOW engine on the main board, for Oak's Route 1 warm-up (W5). */
  path: WarmupHost['path'];
  /** Pacing (§2): a cover up on a tap that waits for its screen (Oak's lesson loads first); uncover() shows what is
   * mounted (an error). */
  cover(kind: CoverKind): Promise<void>;
  uncover(): void;
  /** A battle decided (pacing §5): your plate hops and theirs shakes and fades, or the other way round. */
  beat(won: boolean): void;
}

const PEOPLE = trainers.people as Record<string, string>;
const CLASSES = trainers.classes as Record<string, string>;
/** Sprite of a named person (oak, red, blue, brock...) or a trainer class; undefined means the CSS silhouette. */
export const personSprite = (id: string) => (id === 'red' ? trainerSpriteId(myTrainer()) : PEOPLE[id]);
export const classSprite = (cls: string) => CLASSES[cls];
/** After a miss: "Win 2 more of the next 3.", but "Win the next one!" / "Win the next 2!" when every one is needed
 * (playtest, 12 Oct: "Win 1 more of the next 1."). */
export const leftLine = (still: number, left: number): string =>
  still !== left ? fmt('trainer.left', { need: String(still), left: String(left) }) : left === 1 ? fmt('trainer.leftOne') : fmt('trainer.leftAll', { n: String(left) });

export class JourneyGame {
  campaign: Campaign = loadCampaign();
  // Encounter rolls: seeded per visit from the clock; the harness reseeds it for tests.
  readonly rng = createRng(Date.now() >>> 0);

  constructor(private readonly host: JourneyHost) {
    // Play time goes into the save as stored, so a rename or a YELLOW lesson written elsewhere is kept (bugs #6), and
    // every save with progress counts it (the start menu's TIME, ux #8); a guest's game is not saved.
    window.setInterval(() => {
      if (document.hidden || isGuest() || !hasProgress(currentSlot())) return;
      this.campaign = addPlayTime(PLAYTIME_TICK_MS);
    }, PLAYTIME_TICK_MS);
  }

  private set(c: Campaign): void {
    this.campaign = c;
    saveCampaign(c);
  }

  private story(keys: string[], done: () => void, sprite?: string): void {
    story(this.host.modal, keys, done, sprite);
  }

  /** Title > Kanto Journey: Oak on a fresh save, else the map at the furthest point reached. */
  open(): void {
    this.campaign = loadCampaign();
    if (this.campaign.starter) return this.showMap();
    // Oak's intro (§B14): Oak, three lines, Nidorino; your name beside RED; the starter, with its cry; then BLUE.
    const lines = PLACES[0]!.story!.map((k) => fmt(k));
    // While the NEW GAME is unnamed, Back drops it like ◀ BACK; afterwards it is the save's own way home (bugs #2).
    const back = () => (isCreating() ? abandonNewGame() : this.host.goTitle());
    const afterIntro = () => {
      this.set({ ...this.campaign, introSeen: true });
      // Typing MEIR at the name step unlocks MEIR as your trainer too (fix 1).
      const meir = () => {
        save(PLAYER_TRAINER, 'meir');
        sound.shimmer();
        toast('secret.meir');
      };
      // The starter's Back returns to the name step (playtest, 12 Oct: it dropped a new save into a hub with no
      // starter); a NEW GAME stays "being created", with ◀ BACK on the name step, until the starter is chosen.
      const naming = () =>
        this.host.show(
          nameScreen((name) => {
            if (name === 'MEIR') meir();
            this.set({ ...this.campaign, name });
            this.host.show(
              oakScreen((id) => {
                endCreating(); // the save exists from here; BACK is gone (§B22 item 2)
                sound.cry(SPECIES[id]!.dex);
                this.set(chooseStarter(this.campaign, id));
                this.story([fmt('story.oak.starter', { starter: SPECIES[id]!.name })], () =>
                  this.story([fmt('story.blue.meet')], () => this.showMap(), personSprite('blue')),
                personSprite('oak'));
              }, naming),
            );
          }, back, personSprite('red'), true),
        );
      naming();
    };
    this.host.show(oakIntro(lines, personSprite('oak'), this.campaign.introSeen, afterIntro));
  }

  /** Where Pokédex, My Team, Trainer Card and Training go back to: the map, or the home hub (§B16). */
  private exit: () => void = () => this.showMap();

  /** Opens one of the Trainer screens straight from the hub; Back returns to the hub. */
  openFromHub(what: 'dex' | 'team' | 'card' | 'training', back: () => void): void {
    this.campaign = loadCampaign();
    this.exit = back;
    if (what === 'dex') this.showDex();
    else if (what === 'team') this.showTeam();
    else if (what === 'card') this.showCard();
    else this.showTraining();
  }

  private showTeam(): void {
    this.host.show(teamScreen(this.campaign, (team) => this.set({ ...this.campaign, team }), () => this.exit(), () => this.set({ ...this.campaign, teamNotice: [] })));
  }

  private showCard(): void {
    this.host.show(cardScreen(this.campaign, shownLevel(this.host.puzzle.trainer), () => this.exit()));
  }

  /** `justCleared`: a place cleared a moment ago, stamped on the map with the victory sting (W5). */
  showMap(justCleared?: string): void {
    this.exit = () => this.showMap();
    save('last', 'journey');
    this.host.puzzle.stop();
    this.host.path.stop();
    this.host.modal.hidden = true;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.host.show(
      mapScreen(this.campaign, {
        place: (i) => this.enterPlace(PLACES[i]!),
        next: () => this.go(),
        dex: () => this.showDex(),
        team: () => this.showTeam(),
        card: () => this.showCard(),
        training: () => this.showTraining(),
        back: () => this.host.goTitle(),
        hof: () => this.showHof(() => this.showMap()),
        stamped: () => music.play('victory'), // the map sting plays with the stamp (pacing §5)
      }, justCleared, calm),
    );
    // Mew joins once 150 others are caught (§B12), whatever path got there.
    this.checkMew(() => undefined);
  }

  enterPlace(p: Place): void {
    if (p.kind === 'route') return this.needsWarmup(p) ? this.warmup(() => this.showRoute(p)) : this.showRoute(p);
    if (p.kind === 'town') {
      const lines = (p.story ?? []).map((k) => fmt(k));
      return this.story(lines, () => {
        if (p.id === 'pallet') return this.showMap();
        // A town is a place (W5, ux #9): its card says what is there and what is next.
        const first = !placeCleared(this.campaign, p);
        this.set(clearPlace(this.campaign, p));
        tapCard(this.host.modal, placeCard(p, nextGoal(this.campaign), true), () => this.showMap(first ? p.id : undefined));
      });
    }
    if (p.kind === 'rival') {
      const t = p.trainers?.[0];
      if (!t) return;
      if (placeCleared(this.campaign, p)) return this.showMap();
      return this.story((p.story ?? []).map((k) => fmt(k)), () => this.battle(p, t, 'story'), personSprite('blue'));
    }
    const intro = (p.story ?? []).map((k) => fmt(k));
    if (p.kind === 'drill') return this.story(intro, () => this.nextDrill(p));
    if (p.kind === 'champion') return this.story(intro, () => this.champion(p), personSprite('blue-champion'));
    // Gyms, challenges and the Elite Four: the next trainer still standing (or a replay of the first).
    const t = nextTrainer(this.campaign, p) ?? p.trainers?.[0];
    if (t) this.story(intro, () => this.battle(p, t, 'story'), this.spriteOf(t) ?? undefined);
  }

  /** The map's ▶ (W5): straight into the next goal's battle; towns, rivals, gyms and drills open as from the map. */
  private go(): void {
    const g = nextGoal(this.campaign);
    if (!g) return;
    const { place: p, trainer: t } = g;
    if (p.kind !== 'route' || !t) return this.enterPlace(p);
    const fight = () => {
      this.showRoute(p);
      this.battle(p, t);
    };
    if (this.needsWarmup(p)) this.warmup(fight);
    else fight();
  }

  /** Oak's warm-up runs the first time a save enters Route 1 (W5, design G). */
  private needsWarmup(p: Place): boolean {
    return p.id === WARMUP_PLACE && !this.campaign.warmup;
  }

  private warmup(then: () => void): void {
    this.host.puzzle.stop();
    warmup({ modal: this.host.modal, path: this.host.path, campaign: () => this.campaign, set: (c) => this.set(c), rng: this.rng, oak: personSprite('oak') }, then);
  }

  /** A trainer's sprite: a named person, "-" for none, else the class sprite. */
  private spriteOf(t: Trainer): string | undefined | null {
    if (t.sprite === '-') return null;
    return t.sprite ? personSprite(t.sprite) : classSprite(t.class);
  }

  private showRoute(p: Place): void {
    this.host.puzzle.stop();
    this.host.path.stop();
    this.set(visit(this.campaign, p));
    const route = routeOf(p) as Route;
    this.host.show(routeScreen(p, this.campaign, { battle: (t) => this.battle(p, t), walk: () => this.walkGrass(p, route), back: () => this.showMap(), sprite: (t) => this.spriteOf(t) ?? undefined }));
  }

  /** The theme a trainer teaches: each trainer on a route takes the next of its themes; the rival mixes them all. */
  private focus(p: Place, t: Trainer): string {
    if (t.lesson) return t.lesson;
    if (t.easy) return 'mateIn1'; // the first trainers (W5)
    if (t.themes === 'learned') return 'mixed';
    const themes = themesFor(p, t);
    return themes[Math.max(0, (p.trainers ?? []).indexOf(t)) % themes.length] ?? 'mixed';
  }

  /** A trainer: `puzzles` puzzles on its theme near your level; win by solving `need` of them (§B11).
   * First time a theme appears, Oak's mini lesson comes first; then the intro card and the goal card (§B14).
   * `from`: a tap on a trainer row or ▶ (A4), or a story box or card handing over in the same tap (B2). */
  battle(p: Place, t: Trainer, from: 'tap' | 'story' = 'tap'): void {
    const theme = this.focus(p, t);
    if (THEMES.includes(theme) && !this.campaign.lessonsSeen.includes(theme)) {
      return void this.lesson(theme, () => {
        this.set({ ...this.campaign, lessonsSeen: [...this.campaign.lessonsSeen, theme] });
        if (p.kind === 'route') this.showRoute(p);
        else this.showMap();
        this.battle(p, t);
      });
    }
    const team = teamOf(this.campaign, t);
    this.set(markSeen(this.campaign, team));
    music.play('battle');
    void pool(theme).catch(() => undefined); // the puzzles load while the cards show (pacing A7)
    const modal = this.host.modal;
    // Pacing A4 to A6: a "!" over the trainer you tapped, then the dim and "wants to battle!", which waits for a tap
    // (it no longer leaves by itself, so a late tap can never skip the goal card); the goal card waits for one too.
    // Both ignore taps for CARD_GUARD_MS. show() clears the modal, so nothing here acts on a later screen (bugs #8).
    // B2 (Fix, 13 Oct): after a story (a gym leader, a lost retry, the Elite Four's next trainer) the card swaps in at
    // once in the same task, so the dim stays up and a trainer who stood in the story is in the card, not sliding.
    const intro = () => {
      modal.replaceChildren(trainerIntro(this.campaign, t, this.spriteOf(t)));
      modal.hidden = false;
      let stage = 0;
      modal.onclick = () => {
        if (stage++ === 0) {
          const leads = t.themes === 'learned' ? fmt('goal.rivalLeads', { starter: SPECIES[team[0]!]!.name }) : undefined;
          return modal.replaceChildren(goalCard(theme, t.puzzles, this.needOf(p, t), leads));
        }
        modal.onclick = null;
        modal.hidden = true;
        this.runBattle(p, t, theme); // the battle bars close over this screen and open on the board
      };
    };
    if (from === 'story') return intro();
    trainerSpot(modal, document.querySelector('.trainer-row.next') ?? document.querySelector('[data-testid="map-current"]'), intro);
  }

  /** Oak's one screen lesson for a theme, with a looping example from a real puzzle (§B14). */
  async lesson(theme: string, done: () => void): Promise<void> {
    void this.host.cover('screen'); // up at once, held while the example loads (pacing §2)
    try {
      const rows = await pool(theme).catch((err: unknown) => {
        console.warn('lesson example unavailable:', err instanceof Error ? err.message : err);
        return [];
      });
      this.host.show(lessonScreen(theme, exampleOf(rows), done, personSprite('oak')));
    } finally {
      this.host.uncover();
    }
  }

  /** Solves needed: gyms 1 to 4 take GYM_NEED_EARLY, gyms 5 to 8 GYM_NEED_LATE (config.ts), others their own. */
  needOf(p: Place, t: Trainer): number {
    if (p.kind !== 'gym') return t.need;
    return PLACES.filter((x) => x.kind === 'gym').indexOf(p) < 4 ? GYM_NEED_EARLY : GYM_NEED_LATE;
  }

  private runBattle(p: Place, t: Trainer, theme: string): void {
    const need = this.needOf(p, t);
    let played = 0;
    let won = 0;
    let missed = false;
    const who = trainerName(t);
    const pips: string[] = [];
    // The banner (§B14, W3): the trainer, the pips and what is still needed; the goal is in the header now.
    const text = () => {
      const pipLine = `${who} ${pips.join('')}${'○'.repeat(t.puzzles - pips.length)}`;
      const left = t.puzzles - played;
      const still = need - won;
      if (still <= 0 || still > left) return pipLine; // decided either way
      return `${pipLine} ${missed ? leftLine(still, left) : fmt('trainer.need', { n: String(still) })}`;
    };
    const next = () => {
      this.host.puzzle.refreshBanner();
      void this.host.puzzle.start();
    };
    void this.host.puzzle.start({
      themes: t.topics ?? (theme === 'mixed' ? themesFor(p, t) : [theme]),
      battle: true,
      easy: t.easy,
      boost: t.boost ?? 0,
      banner: text,
      // The trainer you are battling stands on the top plate (W3, ux #5), not the story stage's Rocket trainer.
      opponent: { sprite: this.spriteOf(t) ?? '', name: who, title: '' },
      onLeave: () => p.kind === 'route' ? this.showRoute(p) : this.showMap(),
      // The pip changes the moment a puzzle is decided (design J), before the review.
      onAttempt: (r) => {
        played++;
        if (r !== 'missed') won++;
        missed = r === 'missed';
        pips.push(r === 'missed' ? '✕' : '●');
        this.host.puzzle.refreshBanner(true);
      },
      onResult: () => {
        // Called on Continue after the review (§B15): no timer, the player decides when to move on.
        if (won >= need) return this.win(p, t, `${pips.join('')}${'○'.repeat(t.puzzles - pips.length)}`);
        if (played - won > t.puzzles - need) return this.lose(p, t);
        next();
      },
    });
  }

  /** A trainer beaten (W5, pacing §5), in order: the beat on the board, "You won!", the defeat quote, the badge card,
   * the queen line, the card with what opened. "Next: …" is said once, last. The map then stamps the place. */
  private win(p: Place, t: Trainer, pips: string): void {
    const before = placeCleared(this.campaign, p);
    const stageBefore = stageFor(this.campaign.badges.length);
    let c = beatTrainer(this.campaign, p, t);
    let badge: string | undefined;
    let queen = false;
    // Badge ceremony (§B13 C3): the gym's badge, and the queen slot with the first one.
    if (p.kind === 'gym' && p.badge && !c.badges.includes(p.badge)) {
      c = { ...c, badges: [...c.badges, p.badge] };
      badge = p.badge;
      queen = c.badges.length === 1 && !c.queenOpen;
      save('backupDue', true); // the hub then offers "Back up your save" (§B18 item 2)
    }
    this.set(c);
    const now = placeCleared(this.campaign, p);
    const cleared = !before && now;
    const goal = goalLine(this.campaign);
    const next = () => {
      const more = !now ? nextTrainer(this.campaign, p) : null;
      if (more && p.kind === 'league') return this.battle(p, more, 'story'); // after the quote: the same sequence
      if (p.kind === 'route' && !now) return this.showRoute(p);
      this.showMap(cleared ? p.id : undefined);
    };
    const modal = this.host.modal;
    const sprite = this.spriteOf(t);
    const quote = [fmt(t.defeat)];
    const after = queen ? [fmt('badge.queen')] : [];
    if (goal && !cleared) (badge ? after : quote).push(goal); // on the unlock card when there is one
    const unlock = () => tapCard(modal, placeCard(p, nextGoal(this.campaign)), () => this.reward(p, next));
    const last = () => (cleared ? unlock() : next());
    const afterBadge = () => (after.length ? this.story(after, last, sprite ?? undefined) : last());
    const badgeStep = () => {
      if (!badge) return last();
      tapCard(modal, badgeCard(badge), afterBadge);
      window.setTimeout(() => sound.shimmer(), BADGE_IN_MS); // the shimmer as the badge lands
    };
    const card = () => tapCard(modal, winCard(this.campaign, p, t, sprite, pips), () => this.story(quote, badgeStep, sprite ?? undefined));
    // A badge that crosses 3 or 6 evolves both story teams (§B18 item 5): one evolution ceremony per piece, before
    // the cards. Rocket's stage brings a new trainer and team (change B), not an evolution: only Red's pieces evolve.
    const evos = stageEvolutions('w', stageBefore, stageFor(this.campaign.badges.length), (role, dark) => defaultSpecies('w', role, dark));
    this.afterBeat(true, () => {
      if (!evos.length) return card();
      modal.hidden = true;
      music.play('evolution');
      void evos.reduce((done, [a, b]) => done.then(() => this.host.evolveAnim(a, b)), Promise.resolve()).then(card);
    });
  }

  /** The beat after the last Continue (pacing §5): the board stays, the plates react, the sting plays, and input waits
   * WIN_BEAT_MS (the modal is up but clear); then the dim fades in under `then`'s card. */
  private afterBeat(won: boolean, then: () => void): void {
    const modal = this.host.modal;
    music.play(won ? 'victory' : 'defeat');
    this.host.beat(won);
    modal.onclick = null;
    modal.replaceChildren();
    modal.classList.add('clear');
    modal.hidden = false;
    const g = this.host.gen();
    window.setTimeout(() => {
      if (g !== this.host.gen()) return; // the screen changed meanwhile (bugs #8)
      modal.classList.remove('clear');
      then();
    }, WIN_BEAT_MS);
  }

  /** Rewards for clearing a place the first time (§B12 part 2): gifts, then a choice. Never twice. */
  private reward(p: Place, done: () => void): void {
    if (!p.reward || this.campaign.rewards.includes(p.id)) return done();
    this.set({ ...this.campaign, rewards: [...this.campaign.rewards, p.id] });
    const counter = RIVAL.counter[this.campaign.starter ?? ''] ?? 'squirtle';
    const lines: string[] = [];
    for (const g of p.reward.gift ?? []) {
      // The other two starters (§B12): one for the first rival win, BLUE's own for the second.
      const id = g === '@starter-other' ? (STARTERS.find((s) => s !== this.campaign.starter && s !== counter) ?? 'bulbasaur') : g === '@starter-rival' ? counter : g;
      this.set(addCatch(this.campaign, id, false, p.id));
      lines.push(fmt(g.startsWith('@starter') ? 'reward.starter' : 'reward.gift', { name: SPECIES[id]!.name }));
    }
    const choose = () => {
      const ids = p.reward?.choice;
      if (!ids) return done();
      this.host.show(
        choiceScreen(ids, (id) => {
          sound.cry(SPECIES[id]!.dex);
          this.set(addCatch(this.campaign, id, false, p.id));
          this.story([fmt('reward.gift', { name: SPECIES[id]!.name })], done);
        }),
      );
    };
    if (lines.length) this.story(lines, choose, personSprite('oak'));
    else choose();
  }

  /** Mew (§B12): once 150 others are caught. */
  private checkMew(done: () => void): void {
    const next = awardMew(this.campaign);
    if (!next) return done();
    this.set(next);
    sound.shimmer();
    this.story([fmt('mew.line')], done, personSprite('oak'));
  }

  /** After an online win, trade evolutions on your team (§B12), saved at once. Returns them [from, to] for the end
   * panel to tell, as it comes after the end hold (fix, 13 Oct: a toast here was gone before the panel showed). */
  onlineWin(): [string, string][] {
    const { campaign, evolved } = tradeEvolve(this.campaign);
    if (evolved.length) this.set(campaign);
    return evolved;
  }

  /** Victory Road (§B2 row 10): mate a lone king within the limit, queen first, then rook. */
  private nextDrill(p: Place): void {
    const d = p.drills?.find((x) => !this.campaign.journey.cleared.includes(x.id)) ?? p.drills?.[0];
    if (!d) return this.showMap();
    const modal = this.host.modal;
    modal.replaceChildren(textGoalCard(fmt(d.title), fmt(d.goal, { limit: String(d.limit) }), fmt('drill.moves', { n: String(d.limit) })));
    modal.hidden = false;
    modal.onclick = () => {
      modal.onclick = null;
      modal.hidden = true;
      this.host.startChallenge({ fen: d.fen, level: DRILL_LEVEL, limit: d.limit, onEnd: (r) => this.drillEnd(p, d, r) });
    };
  }

  private drillEnd(p: Place, d: Drill, r: DrillStatus): void {
    if (r !== 'mate') {
      const why = fmt(r === 'limit' ? 'drill.why.limit' : r === 'draw' ? 'drill.why.draw' : 'drill.why.lost');
      return this.story([fmt('drill.fail', { why })], () => this.nextDrill(p));
    }
    let c = { ...this.campaign, journey: { ...this.campaign.journey, cleared: [...this.campaign.journey.cleared, d.id] } };
    const done = (p.drills ?? []).every((x) => c.journey.cleared.includes(x.id));
    if (done) c = clearPlace(c, p);
    this.set(c);
    this.story([fmt('drill.done'), ...(done ? [fmt('drill.cleared')] : [])], () => (done ? this.showMap() : this.nextDrill(p)));
  }

  /** BLUE's champion team: his starter's final form, then two Gen 1 favourites. */
  private championTeam(): string[] {
    let id = RIVAL.counter[this.campaign.starter ?? ''] ?? 'squirtle';
    for (let e = EVOLUTIONS.find((x) => x.from === id); e; e = EVOLUTIONS.find((x) => x.from === id)) id = e.to;
    return [id, 'pidgeot', 'alakazam'];
  }

  /** Champion BLUE (§B2 row 12): a full game vs the computer at a level set by your Trainer Level. */
  private champion(p: Place): void {
    const level = championLevel(this.host.puzzle.trainer.rating.r);
    const blue: Trainer = { id: 'champion', class: 'trainer.class.champion', name: 'trainer.name.blue', team: this.championTeam(), defeat: 'champion.won', puzzles: 1, need: 1 };
    const modal = this.host.modal;
    music.play('battle');
    modal.replaceChildren(trainerIntro(this.campaign, blue, personSprite('blue-champion')));
    modal.hidden = false;
    let stage = 0;
    modal.onclick = () => {
      if (stage++ === 0) {
        modal.replaceChildren(textGoalCard(fmt('champion.title'), fmt('champion.goal', { level: String(level), name: fmt(`level.${level}` as StringKey) })));
        return;
      }
      modal.onclick = null;
      modal.hidden = true;
      this.host.startChallenge({
        level,
        onEnd: (r) => {
          if (r !== 'mate') return this.story([fmt('champion.lost')], () => this.showMap(), personSprite('blue-champion'));
          const team = [...new Set([this.campaign.starter ?? 'pikachu', ...Object.values(this.campaign.team).map((v) => (v ?? '').split(':')[0]!)])].filter((x) => SPECIES[x]).slice(0, 6);
          this.set({ ...clearPlace(this.campaign, p), champion: true, hallOfFame: [...this.campaign.hallOfFame, { date: new Date().toISOString().slice(0, 10), team }] });
          this.story([fmt('champion.won')], () => this.showHof(() => this.showMap()), personSprite('blue-champion'));
        },
      });
    };
  }

  private showHof(done: () => void): void {
    const last = this.campaign.hallOfFame[this.campaign.hallOfFame.length - 1];
    music.play('victory');
    this.host.show(hofScreen(this.campaign, last?.team ?? [this.campaign.starter ?? 'pikachu'], done));
  }

  private lose(p: Place, t: Trainer): void {
    this.afterBeat(false, () => this.story([fmt('trainer.lost', { class: fmt(t.class), name: fmt(t.name) })], () => this.battle(p, t, 'story')));
  }

  private walkGrass(p: Place, route: Route): void {
    void this.host.puzzle.start({
      themes: route.themes,
      ownsNext: true,
      onLeave: () => this.showRoute(p),
      // Called on Continue after the review (§B15): a miss walks on to a fresh puzzle, a solve meets a Pokémon.
      onResult: (result) => {
        this.set(recordRoute(this.campaign, route.id, result));
        if (result === 'missed') return void this.host.puzzle.start();
        this.encounter(p, route, result === 'solved' ? 'first' : 'hint');
      },
    });
  }

  private encounter(p: Place, route: Route, solve: 'first' | 'hint'): void {
    const { slot, shiny } = rollEncounter(this.campaign, route, solve, this.rng);
    this.set(markSeen(this.campaign, [slot.species]));
    music.play('battle');
    sound.cry(SPECIES[slot.species]!.dex);
    if (shiny) sound.shimmer();
    const modal = this.host.modal;
    const panel = encounterPanel(
      slot.species,
      shiny,
      () => {
        const res = throwBall(this.campaign, route.id, slot, solve, this.rng, shiny);
        this.set(res.campaign);
        if (res.caught) music.play('victory');
        return res.caught;
      },
      () => {
        modal.hidden = true;
        void this.host.puzzle.start();
      },
      () => {
        modal.hidden = true;
        this.showRoute(p);
      },
    );
    modal.replaceChildren(panel);
    modal.hidden = false;
  }

  private showTraining(): void {
    this.host.puzzle.stop();
    this.host.show(
      trainingScreen(
        trainingThemes(this.campaign),
        (theme) => void this.host.puzzle.start({ themes: [theme], onResult: () => undefined, onLeave: () => this.showTraining() }),
        () => this.exit(),
        (theme) => void this.lesson(theme, () => this.showTraining()),
      ),
    );
  }

  showDex(): void {
    this.host.show(dexScreen(this.campaign, (id) => this.openDex(id), () => this.exit()));
  }

  private openDex(id: string): void {
    const modal = this.host.modal;
    modal.replaceChildren(
      dexDetail(this.campaign, id, {
        evolve: (e) => {
          const next = evolve(this.campaign, e);
          if (!next) return;
          this.set(next);
          modal.hidden = true;
          void this.host.evolveAnim(e.from, e.to).then(() => {
            toast('dex.title');
            this.showDex();
            this.openDex(e.to);
          });
        },
        oak: () => {
          const next = sendToOak(this.campaign, id);
          if (!next) return;
          this.set(next);
          this.openDex(id);
        },
        close: () => {
          modal.hidden = true;
          this.showDex();
        },
      }),
    );
    modal.hidden = false;
  }

  /** A puzzle starts (W3): counts it on the save and says whether this is the save's first, for the coach marks. */
  firstSteps(): { n: number; coach: boolean } {
    const c = this.campaign;
    const coach = !c.tips.includes('puzzle');
    this.set({ ...c, puzzlesStarted: c.puzzlesStarted + 1, tips: coach ? [...c.tips, 'puzzle'] : c.tips });
    return { n: c.puzzlesStarted, coach };
  }

  /** Harness: adds catches directly (tests only). */
  grant(id: string, n = 1, shiny = false): void {
    let c = this.campaign;
    for (let i = 0; i < n; i++) c = addCatch(c, id, shiny, 'route-1');
    this.set(c);
  }
}
