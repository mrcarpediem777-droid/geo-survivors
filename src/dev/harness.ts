/**
 * THE MEASURING INSTRUMENT.
 * =========================
 * Every balance number in TUNING.md and PLAYBOOK.md came from running the real
 * game headlessly and watching what happened. Until now that code was typed
 * fresh into a browser console each time, and it went wrong repeatedly:
 *
 *   - The screen-off pause added in M6 froze runs silently. A frozen run looks
 *     exactly like a run that survived without dying, so the same setup measured
 *     three times gave "survived 200 s", "survived 200 s", and "died at 95 s".
 *     Every comparison built on that was worthless, including a "bug" it led me
 *     to find and fix in code that was working correctly.
 *   - A tower comparison measured a bridge a kilometre outside the navigation
 *     grid, where everything reads as blocked, and proved nothing.
 *   - A street-kind check computed grid coordinates by hand, got the origin
 *     wrong, and reported a fault that did not exist.
 *
 * All three have the same cause: an instrument nobody could see failing. So it
 * lives in the repository now, with the traps written into it rather than
 * remembered.
 *
 * IT IS DEV-ONLY. Imported from `main.ts` behind the same env flag as the rest
 * of the developer tools, so it cannot reach a player's build.
 *
 * Run it from the browser console:
 *
 *     await __geo.harness.run()                 // the standard set
 *     await __geo.harness.run({ repeats: 5 })   // more repeats, less noise
 */

import type { Game } from '../game/game';
import type { Profile } from '../profile/profile';
import type { PlayerLocation } from '../location/playerLocation';

/** Where every measurement starts. A real street, with real buildings. */
const TEST_LAT = 16.0605;
const TEST_LNG = 108.22;

/** Simulated seconds per step. Twenty steps a second. */
const STEP_MS = 50;

export interface Scenario {
  name: string;
  /** Applied to the save before the run. */
  profile?: Record<string, unknown>;
  /** Seconds of simulated play before giving up. */
  seconds?: number;
}

export interface Result {
  name: string;
  /** Seconds survived, or the horizon if still alive. */
  survived: number;
  died: boolean;
  kills: number;
  level: number;
  /** Health as a percentage at each 15-second mark. */
  healthTrace: number[];
  lowestHealthPercent: number;
}

export class Harness {
  private game: Game;
  private profile: Profile;
  private location: PlayerLocation;

  constructor(game: Game, profile: Profile, location: PlayerLocation) {
    this.game = game;
    this.profile = profile;
    this.location = location;
  }

  /**
   * Run one scenario once.
   *
   * Every trap this instrument has fallen into is disarmed here explicitly,
   * rather than being something the caller has to remember.
   */
  once(scenario: Scenario): Result {
    const game = this.game as unknown as Record<string, unknown>;
    const combat = (game.combat as Record<string, unknown>) ?? {};
    const hud = game.hud as Record<string, unknown>;

    this.profile.update({
      // A clean slate unless the scenario says otherwise, so a previous run's
      // purchases cannot leak into this one -- which they did, repeatedly.
      essence: 0,
      metaLevels: {},
      equippedBySlot: {},
      ownedEquipment: [],
      towers: [],
      ownedBuildings: [],
      clearedByCell: {},
      selectedCharacter: 'wanderer',
      // The opening cards pause the world. Reset the save during testing and the
      // game silently sits still forever.
      tutorialComplete: true,
      ...(scenario.profile ?? {}),
    } as never);

    this.location.setFakePosition({ lat: TEST_LAT, lng: TEST_LNG });

    // Stop the real animation loop; we drive the clock ourselves.
    const realRequestFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame;

    (game.restartRun as () => void)();
    // The anchor is set through GPS smoothing, which takes seconds to settle.
    // Measurements cannot wait for it, so it is placed exactly.
    game.anchor = { lat: TEST_LAT, lng: TEST_LNG };

    // Nothing may block: a card screen, a death screen or the tutorial all
    // pause the world, and a paused run reports as a survivor.
    hud.showCards = (_level: number, cards: { id: string }[], pick: (card: unknown) => void) =>
      pick(cards[0]);
    hud.showDeath = () => undefined;
    for (const screen of ['cardScreen', 'deathScreen', 'shopScreen']) {
      const element = hud[screen] as HTMLElement | undefined;
      if (element) element.style.display = 'none';
    }
    const tutorial = game.tutorial as { root?: HTMLElement } | null;
    if (tutorial?.root) tutorial.root.style.display = 'none';

    // Long enough to see the whole shape -- deaths land around 80-110 seconds --
    // and short enough that the standard set finishes while you are still
    // interested. At 200 the full set took minutes, which is how a test nobody
    // runs gets written.
    const horizon = scenario.seconds ?? 130;
    const trace: number[] = [];
    let nextMark = 0;
    let lowest = 100;
    /*
     * A FIXED CLOCK, AND IT MUST BE A LATE ONE.
     *
     * Starting from `performance.now()` was the last big source of noise: the
     * routing rebuild is scheduled against the timestamp we pass in, so starting
     * at a different number put every rebuild somewhere different, and two runs
     * of the same setup came out 79 s and 130 s apart.
     *
     * The obvious fix -- pick a small round number -- was WORSE, and quietly.
     * "How long since the routes were rebuilt" is `now - lastBuild`, and the
     * last real build happened at the browser's own clock, which by then is
     * millions of milliseconds. Starting at one million made that difference
     * NEGATIVE, so the rebuild never triggered and the swarm spent the whole run
     * navigating a stale map. The game looked far easier than it is: 109 kills
     * and a comfortable survival where the truth is death at about eighty
     * seconds.
     *
     * So the clock is fixed AND far in the future, which forces a rebuild on the
     * first frame and puts every later one on our own timeline.
     */
    let now = 1_000_000_000;
    game.lastFrameMs = now;

    for (let step = 0; step < (horizon * 1000) / STEP_MS; step++) {
      // THE ONE THAT COST THE MOST. The game correctly stops dead when the page
      // is hidden, and the pane these measurements run in IS hidden -- so runs
      // froze partway and reported themselves as survivors.
      game.hidden = false;

      now += STEP_MS;
      (game.tick as (ms: number) => void)(now);

      const health = combat.health as number;
      const maxHealth = combat.maxHealth as number;
      const percent = (100 * health) / maxHealth;
      if (percent < lowest) lowest = percent;

      const runTime = combat.runTimeSeconds as number;
      if (runTime >= nextMark) {
        nextMark += 15;
        trace.push(Math.round(percent));
      }
      if (combat.dead as boolean) break;
    }

    window.requestAnimationFrame = realRequestFrame;

    return {
      name: scenario.name,
      survived: Math.round(combat.runTimeSeconds as number),
      died: combat.dead as boolean,
      kills: combat.monstersKilled as number,
      level: combat.level as number,
      healthTrace: trace,
      lowestHealthPercent: Math.round(lowest),
    };
  }

  /**
   * Run a scenario several times and report the middle result.
   *
   * Repeats are not optional politeness. Measured with the freeze bug present,
   * one configuration gave 156 kills, 140 kills and 40 kills on three
   * consecutive runs -- a single run of anything here means very little.
   */
  repeat(scenario: Scenario, times = 3): Result & { spread: string } {
    const runs: Result[] = [];
    for (let i = 0; i < times; i++) runs.push(this.once(scenario));

    const middle = [...runs].sort((a, b) => a.survived - b.survived)[Math.floor(times / 2)];
    return {
      ...middle,
      spread: runs.map((r) => `${r.survived}s/${r.kills}k`).join('  '),
    };
  }

  /** The standard set, so a change can be checked against a known picture. */
  async run(options: { repeats?: number; scenarios?: Scenario[] } = {}): Promise<string> {
    const repeats = options.repeats ?? 3;
    const scenarios: Scenario[] = options.scenarios ?? [
      { name: 'nothing bought' },
      { name: 'every upgrade maxed', profile: { metaLevels: { vigour: 10, edge: 10, reach: 6, greed: 6, haste: 6, resolve: 5 } } },
      { name: 'full equipment', profile: { equippedBySlot: { weapon: 'rig', armour: 'padded', charm: 'lens' }, ownedEquipment: ['rig', 'padded', 'lens'] } },
      {
        name: 'three towers nearby',
        profile: {
          towers: [
            { lat: TEST_LAT, lng: TEST_LNG + 0.00025, level: 1, builtAtMs: 0 },
            { lat: TEST_LAT + 0.0002, lng: TEST_LNG, level: 1, builtAtMs: 0 },
            { lat: TEST_LAT - 0.00025, lng: TEST_LNG, level: 1, builtAtMs: 0 },
          ],
        },
      },
    ];

    const lines = [
      `Geo-Survivors balance, ${repeats} runs each, median shown`,
      `standing still at ${TEST_LAT}, ${TEST_LNG}`,
      '',
      'scenario                  survived  kills  level  lowest   every run',
      '------------------------------------------------------------------------',
    ];

    for (const scenario of scenarios) {
      const result = this.repeat(scenario, repeats);
      lines.push(
        result.name.padEnd(24) +
          String(result.died ? `${result.survived}s` : `>${result.survived}s`).padStart(9) +
          String(result.kills).padStart(7) +
          String(result.level).padStart(7) +
          String(`${result.lowestHealthPercent}%`).padStart(8) +
          '   ' +
          result.spread
      );
      // Let the browser breathe between scenarios, or a long set locks the page.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const report = lines.join('\n');
    console.log(report);
    return report;
  }
}
