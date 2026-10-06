// SPDX-License-Identifier: AGPL-3.0-only
// Kanto Journey controller (§B11, §B12): Oak's intro, the map, trainer and rival battles (the C1 puzzle player in a
// battle context), towns, tall grass encounters, the Trainer Card, Training, the Pokédex with candy, and My Team.
import { DRILL_LEVEL, ENCOUNTER_PAUSE_MS, INTRO_CARD_MS, PLAYTIME_TICK_MS, TRAINER_NEXT_MS } from '../config';
import { SPECIES } from '../board/pieces';
import { sound } from '../audio/audio';
import { music } from '../audio/music';
import { createRng } from '../game/rng';
import { fmt } from '../game/text';
import { cardScreen, choiceScreen, dexDetail, dexScreen, encounterPanel, goalCard, hofScreen, mapScreen, textGoalCard, nameScreen, oakScreen, placeName, routeScreen, story, teamScreen, trainerIntro, trainingScreen } from '../ui/kanto';
import { exampleOf, lessonScreen, oakIntro } from '../ui/lesson';
import { pool } from './trainer';
import trainers from '../data/trainers.json';
import type { StringKey } from '../game/text';
import { toast } from '../ui/dom';
import { addCatch, awardMew, championLevel, chooseStarter, EVOLUTIONS, evolve, loadCampaign, markSeen, recordRoute, rollEncounter, saveCampaign, sendToOak, STARTERS, throwBall, tradeEvolve, type Campaign, type Route } from './kanto';
import { beatTrainer, clearPlace, nextTrainer, PLACES, placeCleared, RIVAL, routeOf, teamOf, themesFor, trainingThemes, visit, type Drill, type Place, type Trainer } from './journey';
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
}

const PEOPLE = trainers.people as Record<string, string>;
const CLASSES = trainers.classes as Record<string, string>;
/** Sprite of a named person (oak, red, blue, brock...) or a trainer class; undefined means the CSS silhouette. */
export const personSprite = (id: string) => PEOPLE[id];
export const classSprite = (cls: string) => CLASSES[cls];

export class JourneyGame {
  campaign: Campaign = loadCampaign();
  // Encounter rolls: seeded per visit from the clock; the harness reseeds it for tests.
  readonly rng = createRng(Date.now() >>> 0);

  constructor(private readonly host: JourneyHost) {
    window.setInterval(() => {
      if (document.hidden || !this.campaign.starter) return;
      this.campaign = { ...this.campaign, playMs: this.campaign.playMs + PLAYTIME_TICK_MS };
      saveCampaign(this.campaign);
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
    const afterIntro = () => {
      this.set({ ...this.campaign, introSeen: true });
      this.host.show(
        nameScreen((name) => {
          this.set({ ...this.campaign, name });
          this.host.show(
            oakScreen((id) => {
              sound.cry(SPECIES[id]!.dex);
              this.set(chooseStarter(this.campaign, id));
              this.story([fmt('story.oak.starter', { starter: SPECIES[id]!.name })], () =>
                this.story([fmt('story.blue.meet')], () => this.showMap(), personSprite('blue')),
              personSprite('oak'));
            }, () => this.host.goTitle()),
          );
        }, () => this.host.goTitle(), personSprite('red')),
      );
    };
    this.host.show(oakIntro(lines, personSprite('oak'), this.campaign.introSeen, afterIntro));
  }

  showMap(): void {
    this.host.puzzle.stop();
    this.host.modal.hidden = true;
    this.host.show(
      mapScreen(this.campaign, {
        place: (i) => this.enterPlace(PLACES[i]!),
        dex: () => this.showDex(),
        team: () =>
          this.host.show(
            teamScreen(this.campaign, (team) => this.set({ ...this.campaign, team }), () => this.showMap(), () => this.set({ ...this.campaign, teamNotice: [] })),
          ),
        card: () => this.host.show(cardScreen(this.campaign, this.host.puzzle.trainer.rating.r, () => this.showMap())),
        training: () => this.showTraining(),
        back: () => this.host.goTitle(),
        hof: () => this.showHof(() => this.showMap()),
      }),
    );
    // Mew joins once 150 others are caught (§B12), whatever path got there.
    this.checkMew(() => undefined);
  }

  enterPlace(p: Place): void {
    if (p.kind === 'route') return this.showRoute(p);
    if (p.kind === 'town') {
      const lines = (p.story ?? []).map((k) => fmt(k));
      return this.story(lines, () => {
        if (p.id !== 'pallet') this.set(clearPlace(this.campaign, p));
        this.showMap();
      });
    }
    if (p.kind === 'rival') {
      const t = p.trainers?.[0];
      if (!t) return;
      if (placeCleared(this.campaign, p)) return this.showMap();
      return this.story((p.story ?? []).map((k) => fmt(k)), () => this.battle(p, t), personSprite('blue'));
    }
    const intro = (p.story ?? []).map((k) => fmt(k));
    if (p.kind === 'drill') return this.story(intro, () => this.nextDrill(p));
    if (p.kind === 'champion') return this.story(intro, () => this.champion(p), personSprite('blue-champion'));
    // Gyms, challenges and the Elite Four: the next trainer still standing (or a replay of the first).
    const t = nextTrainer(this.campaign, p) ?? p.trainers?.[0];
    if (t) this.story(intro, () => this.battle(p, t), this.spriteOf(t) ?? undefined);
  }

  /** A trainer's sprite: a named person, "-" for none, else the class sprite. */
  private spriteOf(t: Trainer): string | undefined | null {
    if (t.sprite === '-') return null;
    return t.sprite ? personSprite(t.sprite) : classSprite(t.class);
  }

  private showRoute(p: Place): void {
    this.host.puzzle.stop();
    this.set(visit(this.campaign, p));
    const route = routeOf(p) as Route;
    this.host.show(routeScreen(p, this.campaign, { battle: (t) => this.battle(p, t), walk: () => this.walkGrass(p, route), back: () => this.showMap() }));
  }

  /** The theme a trainer teaches: each trainer on a route takes the next of its themes; the rival mixes them all. */
  private focus(p: Place, t: Trainer): string {
    if (t.lesson) return t.lesson;
    if (t.themes === 'learned') return 'mixed';
    const themes = themesFor(p, t);
    return themes[Math.max(0, (p.trainers ?? []).indexOf(t)) % themes.length] ?? 'mixed';
  }

  /** A trainer: `puzzles` puzzles on its theme near your level; win by solving `need` of them (§B11).
   * First time a theme appears, Oak's mini lesson comes first; then the intro card and the goal card (§B14). */
  battle(p: Place, t: Trainer): void {
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
    const modal = this.host.modal;
    modal.replaceChildren(trainerIntro(this.campaign, t, this.spriteOf(t)));
    modal.hidden = false;
    let stage = 0;
    const goal = () => {
      if (stage !== 0) return;
      stage = 1;
      const leads = t.themes === 'learned' ? fmt('goal.rivalLeads', { starter: SPECIES[team[0]!]!.name }) : undefined;
      modal.replaceChildren(goalCard(theme, t.puzzles, t.need, leads));
    };
    const timer = window.setTimeout(goal, INTRO_CARD_MS);
    modal.onclick = () => {
      window.clearTimeout(timer);
      if (stage === 0) return goal();
      modal.onclick = null;
      modal.hidden = true;
      this.runBattle(p, t, theme);
    };
  }

  /** Oak's one screen lesson for a theme, with a looping example from a real puzzle (§B14). */
  async lesson(theme: string, done: () => void): Promise<void> {
    const rows = await pool(theme).catch((err: unknown) => {
      console.warn('lesson example unavailable:', err instanceof Error ? err.message : err);
      return [];
    });
    this.host.show(lessonScreen(theme, exampleOf(rows), done, personSprite('oak')));
  }

  private runBattle(p: Place, t: Trainer, theme: string): void {
    let played = 0;
    let won = 0;
    const who = `${fmt(t.class)} ${fmt(t.name)}`;
    const pips: string[] = [];
    // The banner stays above the board (§B14): your side and goal, then the trainer and the pips.
    const text = (side: 'w' | 'b') =>
      `${fmt('lesson.play', { side: fmt(`side.${side}` as StringKey), goal: fmt(`lesson.${theme}.banner` as StringKey) })}\n${who}: ${pips.join('')}${'○'.repeat(t.puzzles - pips.length)} ${fmt('trainer.progress', { n: String(Math.min(played + 1, t.puzzles)), total: String(t.puzzles), won: String(won), need: String(t.need) })}`;
    const banner = () => this.host.puzzle.refreshBanner();
    const next = () => {
      banner();
      void this.host.puzzle.start();
    };
    void this.host.puzzle.start({
      themes: t.topics ?? (theme === 'mixed' ? themesFor(p, t) : [theme]),
      battle: true,
      boost: t.boost ?? 0,
      banner: text,
      onLeave: () => p.kind === 'route' ? this.showRoute(p) : this.showMap(),
      onResult: (r) => {
        played++;
        if (r !== 'missed') won++;
        pips.push(r === 'missed' ? '✕' : '●');
        banner();
        // Each puzzle restarts the board, so the generation is taken now, not when the battle began.
        const g = this.host.gen();
        window.setTimeout(() => {
          if (g !== this.host.gen()) return;
          if (won >= t.need) return this.win(p, t);
          if (played - won > t.puzzles - t.need) return this.lose(p, t);
          next();
        }, TRAINER_NEXT_MS);
      },
    });
    banner();
  }

  private win(p: Place, t: Trainer): void {
    const before = placeCleared(this.campaign, p);
    let c = beatTrainer(this.campaign, p, t);
    const lines = [fmt(t.defeat)];
    // Badge ceremony (§B13 C3): the gym's badge, and the queen slot with the first one.
    if (p.kind === 'gym' && p.badge && !c.badges.includes(p.badge)) {
      c = { ...c, badges: [...c.badges, p.badge] };
      lines.push(fmt('badge.received', { badge: fmt(`badge.${p.badge}` as StringKey) }));
      if (c.badges.length === 1 && !c.queenOpen) lines.push(fmt('badge.queen'));
    }
    this.set(c);
    music.play('victory');
    const now = placeCleared(this.campaign, p);
    if (!before && now && p.kind === 'route') lines.push(fmt('story.route.cleared', { route: placeName(p) }));
    const next = () => {
      const more = !now ? nextTrainer(this.campaign, p) : null;
      if (more && p.kind === 'league') return this.battle(p, more);
      if (p.kind === 'route' && !now) return this.showRoute(p);
      this.showMap();
    };
    this.story(lines, () => (now && !before ? this.reward(p, next) : next()), this.spriteOf(t) ?? undefined);
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

  /** After an online win, trade evolutions on your team (§B12). */
  onlineWin(): void {
    const { campaign, evolved } = tradeEvolve(this.campaign);
    if (!evolved.length) return;
    this.set(campaign);
    for (const [from, to] of evolved) toast('trade.evolved', { from: SPECIES[from]!.name, to: SPECIES[to]!.name });
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
    music.play('defeat');
    this.story([fmt('trainer.lost', { class: fmt(t.class), name: fmt(t.name) })], () => this.battle(p, t));
  }

  private walkGrass(p: Place, route: Route): void {
    void this.host.puzzle.start({
      themes: route.themes,
      onLeave: () => this.showRoute(p),
      onResult: (result) => {
        this.set(recordRoute(this.campaign, route.id, result));
        if (result === 'missed') return;
        const g = this.host.gen();
        window.setTimeout(() => g === this.host.gen() && this.encounter(p, route, result === 'solved' ? 'first' : 'hint'), ENCOUNTER_PAUSE_MS);
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
        () => this.showMap(),
        (theme) => void this.lesson(theme, () => this.showTraining()),
      ),
    );
  }

  showDex(): void {
    this.host.show(dexScreen(this.campaign, (id) => this.openDex(id), () => this.showMap()));
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

  /** Harness: adds catches directly (tests only). */
  grant(id: string, n = 1, shiny = false): void {
    let c = this.campaign;
    for (let i = 0; i < n; i++) c = addCatch(c, id, shiny, 'route-1');
    this.set(c);
  }
}
