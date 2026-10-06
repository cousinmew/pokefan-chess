// SPDX-License-Identifier: AGPL-3.0-only
// Kanto Journey controller (§B11, §B12): Oak's intro, the map, trainer and rival battles (the C1 puzzle player in a
// battle context), towns, tall grass encounters, the Trainer Card, Training, the Pokédex with candy, and My Team.
import { ENCOUNTER_PAUSE_MS, PLAYTIME_TICK_MS, TRAINER_NEXT_MS } from '../config';
import { SPECIES } from '../board/pieces';
import { sound } from '../audio/audio';
import { music } from '../audio/music';
import { createRng } from '../game/rng';
import { fmt } from '../game/text';
import { cardScreen, dexDetail, dexScreen, encounterPanel, mapScreen, nameScreen, oakScreen, placeName, routeScreen, story, teamScreen, trainerIntro, trainingScreen } from '../ui/kanto';
import { toast } from '../ui/dom';
import { addCatch, chooseStarter, evolve, loadCampaign, markSeen, recordRoute, rollEncounter, saveCampaign, sendToOak, throwBall, type Campaign, type Route } from './kanto';
import { beatTrainer, clearPlace, PLACES, placeCleared, routeOf, teamOf, themesFor, trainingThemes, visit, type Place, type Trainer } from './journey';
import type { PuzzleGame } from './puzzleGame';

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
}

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

  private story(keys: string[], done: () => void): void {
    story(this.host.modal, keys, done);
  }

  /** Title > Kanto Journey: Oak on a fresh save, else the map at the furthest point reached. */
  open(): void {
    this.campaign = loadCampaign();
    if (this.campaign.starter) return this.showMap();
    const lines = PLACES[0]!.story!.map((k) => fmt(k));
    this.story(lines, () =>
      this.host.show(
        nameScreen((name) => {
          this.set({ ...this.campaign, name });
          this.host.show(
            oakScreen((id) => {
              this.set(chooseStarter(this.campaign, id));
              this.story([fmt('story.oak.starter', { starter: SPECIES[id]!.name })], () => this.showMap());
            }, () => this.host.goTitle()),
          );
        }, () => this.host.goTitle()),
      ),
    );
  }

  showMap(): void {
    this.host.puzzle.stop();
    this.host.modal.hidden = true;
    this.host.show(
      mapScreen(this.campaign, {
        place: (i) => this.enterPlace(PLACES[i]!),
        dex: () => this.showDex(),
        team: () => this.host.show(teamScreen(this.campaign, (team) => this.set({ ...this.campaign, team }), () => this.showMap())),
        card: () => this.host.show(cardScreen(this.campaign, this.host.puzzle.trainer.rating.r, () => this.showMap())),
        training: () => this.showTraining(),
        back: () => this.host.goTitle(),
      }),
    );
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
      return this.story((p.story ?? []).map((k) => fmt(k)), () => this.battle(p, t));
    }
    toast('map.gymSoon');
  }

  private showRoute(p: Place): void {
    this.host.puzzle.stop();
    this.set(visit(this.campaign, p));
    const route = routeOf(p) as Route;
    this.host.show(routeScreen(p, this.campaign, { battle: (t) => this.battle(p, t), walk: () => this.walkGrass(p, route), back: () => this.showMap() }));
  }

  /** A trainer: `puzzles` puzzles on the route theme near your level; win by solving `need` of them (§B11). */
  battle(p: Place, t: Trainer): void {
    this.set(markSeen(this.campaign, teamOf(this.campaign, t)));
    music.play('battle');
    const intro = trainerIntro(this.campaign, t);
    this.host.modal.replaceChildren(intro);
    this.host.modal.hidden = false;
    this.host.modal.onclick = () => {
      this.host.modal.onclick = null;
      this.host.modal.hidden = true;
      this.runBattle(p, t);
    };
  }

  private runBattle(p: Place, t: Trainer): void {
    let played = 0;
    let won = 0;
    const who = `${fmt(t.class)} ${fmt(t.name)}`;
    const banner = () => this.host.puzzle.setBanner(`${who}: ${fmt('trainer.progress', { n: String(Math.min(played + 1, t.puzzles)), total: String(t.puzzles), won: String(won), need: String(t.need) })}`);
    const next = () => {
      banner();
      void this.host.puzzle.start();
    };
    void this.host.puzzle.start({
      themes: themesFor(p, t),
      battle: true,
      onLeave: () => p.kind === 'route' ? this.showRoute(p) : this.showMap(),
      onResult: (r) => {
        played++;
        if (r !== 'missed') won++;
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
    this.set(beatTrainer(this.campaign, p, t));
    music.play('victory');
    const lines = [fmt(t.defeat)];
    if (!before && placeCleared(this.campaign, p) && p.kind === 'route') lines.push(fmt('story.route.cleared', { route: placeName(p) }));
    this.story(lines, () => (p.kind === 'route' && !placeCleared(this.campaign, p) ? this.showRoute(p) : this.showMap()));
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
