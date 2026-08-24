/**
 * THE GAME.
 * =========
 * Owns everything that moves, and runs the loop that moves it.
 *
 * Deliberately small: it holds the pieces and ticks them in the right order.
 * The interesting decisions live in the pieces themselves.
 *
 * THE LOOP ORDER MATTERS and is worth stating:
 *   1. read the thumb
 *   2. move the character (which respects the leash to your real position)
 *   3. copy the character into the drawing data
 *   4. move the camera to follow
 * Doing 4 before 2 would make the camera lag one frame behind the character,
 * which reads as a subtle, maddening looseness that is very hard to diagnose
 * once other things are moving too.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';

import { EntityStore, EntityKind, type EntityId } from '../world/entities';
import { EntityLayer } from '../render/entityLayer';
import { PlayerCharacter } from './playerCharacter';
import { GameCamera } from './gameCamera';
import { Joystick } from '../ui/joystick';
import type { LatLng } from '../location/geo';
import { offsetByMetres, distanceMetres } from '../location/geo';
import { CollisionWorld } from '../world/collision';
import { BuildingSource } from '../world/buildingSource';
import { addFallbackArena } from '../world/fallbackArena';
import { FlowField } from '../world/flowField';
import { Combat } from './combat';
import { CombatHud } from '../ui/combatHud';
import type { Tutorial } from '../ui/tutorial';
import { freshLoadout, pickCards, type Loadout, type UpgradeCard } from './upgrades';
import { seededRandom } from '../world/determinism';
import { bonusesFrom, costToBuy, META_UPGRADES, type MetaLevels } from './metaProgress';
import { CHARACTERS, characterById } from './characters';
import { bonusesFromEquipment, itemById } from './equipment';
import { preloadAd, watchAdFor } from '../app/rewardedAd';
import type { Journal } from '../app/journal';
import type { Profile } from '../profile/profile';
import { worldCellFor } from '../world/determinism';
import { activeBasemap } from '../config/basemap';
import { TUNING } from '../config/tuning';

/**
 * How many things can exist at once.
 *
 * The brief targets 400 monsters; this leaves room for nearly a thousand, plus
 * every projectile, pickup and nest. Raised because a swarm that cannot exceed
 * the player's damage output means a standing player can never lose.
 */
const ENTITY_CAPACITY = 2200;

/** How big things are, in real metres. Placeholder sizes for M2. */
const PLAYER_RADIUS_M = 3;
const TEST_MARKER_RADIUS_M = 2.5;

export interface WallStats {
  /** Walls currently loaded. */
  wallCount: number;
  /** How many of those are real buildings rather than invented ones. */
  realBuildings: number;
  /** How many were generated because the area was too empty. */
  generated: number;
  /** Are we currently standing in a place with no real buildings? */
  usingFallbackArena: boolean;
  tilesFetched: number;
  loading: boolean;
}

export interface GameStats {
  fps: number;
  entitiesAlive: number;
  entitiesDrawn: number;
  inCombat: boolean;
  zoom: number;
  monsters: number;
  nests: number;
  pressure: number;
  level: number;
  health: number;
  walls: WallStats;
  leashTension: number;
  distanceFromAnchor: number;
}

export class Game {
  readonly entities = new EntityStore(ENTITY_CAPACITY);
  readonly layer: EntityLayer;
  readonly camera: GameCamera;
  readonly joystick: Joystick;
  readonly character: PlayerCharacter;

  readonly collision = new CollisionWorld();
  readonly flowField = new FlowField();
  readonly combat: Combat;
  readonly hud: CombatHud;

  /** Everything the player has picked up this run. */
  loadout: Loadout = freshLoadout();
  /** How many times each card has been taken, so limits are respected. */
  private cardsTaken = new Map<string, number>();
  private cardRandom = seededRandom(7);
  readonly buildings: BuildingSource;

  private map: MapLibreMap;
  private playerEntity: EntityId = -1;

  /** Where the walls were last worked out, so we know when to redo them. */
  private wallsBuiltAt: LatLng | null = null;
  private wallsLoading = false;
  private realBuildingCount = 0;
  private generatedCount = 0;

  /** Reused every frame so collision allocates nothing. */
  private resolved = { x: 0, y: 0 };

  /** Your real smoothed position, handed in from the location module. */
  private anchor: LatLng | null = null;

  private running = false;
  private lastFrameMs = 0;

  /* Frame-rate measurement, averaged over a second so the number is readable. */
  private framesThisSecond = 0;
  private fpsAccumulatorMs = 0;
  private measuredFps = 0;

  /** Where permanent progress is kept. Set by main.ts right after construction. */
  profile: Profile | null = null;

  /**
   * The teacher, if there is one. Optional so the game can be built and tested
   * without it, and so a player who has finished it carries no extra weight.
   */
  tutorial: Tutorial | null = null;

  /**
   * Everything the player has banked THIS run, kept so the death screen can
   * offer to double it. Coins themselves are banked the instant they are picked
   * up -- losing a run must never lose money you walked over to collect.
   */
  private coinsThisRun = 0;
  /** One revive per run. Two would make dying meaningless rather than costly. */
  private revivedThisRun = false;

  /**
   * How far the player has actually walked this run, in metres.
   *
   * Measured between real GPS anchors rather than character positions, so it is
   * genuinely footsteps. Recorded in the journal; the position itself never is.
   */
  private metresWalkedThisRun = 0;
  /** The log, if there is one. */
  journal: Journal | null = null;

  /** Which emoji the player is drawn as, decided by the chosen character. */
  playerSprite = 7;

  /** Where full-screen things (the ad placeholder) are hung. */
  private uiContainer: HTMLElement;

  constructor(map: MapLibreMap, uiContainer: HTMLElement, startAt: LatLng, useMirror = false) {
    this.map = map;
    this.uiContainer = uiContainer;
    this.buildings = new BuildingSource(useMirror);
    this.layer = new EntityLayer(this.entities);
    this.camera = new GameCamera(map);
    this.joystick = new Joystick(uiContainer);
    this.character = new PlayerCharacter(startAt);
    this.hud = new CombatHud(uiContainer);
    this.hud.onStatusTapped = () => this.openShop();

    this.combat = new Combat(this.entities, this.collision, this.flowField, this.loadout, {
      onLevelUp: (level) => this.offerCards(level),
      onDeath: () => this.handleDeath(),
      onNestCleared: (reward) => this.handleNestCleared(reward),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Levelling and death                                                 */
  /* ------------------------------------------------------------------ */

  private offerCards(level: number): void {
    const cards = pickCards(
      this.loadout,
      this.cardsTaken,
      TUNING.levelling.cardsOffered,
      this.cardRandom
    );

    // Nothing left to offer -- everything is maxed. Carry on rather than stall.
    if (cards.length === 0) {
      this.combat.awaitingCardChoice = false;
      return;
    }

    this.hud.showCards(level, cards, (card: UpgradeCard) => {
      card.apply(this.loadout);
      this.cardsTaken.set(card.id, (this.cardsTaken.get(card.id) ?? 0) + 1);
      this.combat.setLoadout(this.loadout);
      this.combat.awaitingCardChoice = false;
      // If that pickup was worth two levels, show the next card straight away.
      this.combat.offerNextLevelUpIfIdle();
    });
  }

  /** A nest has been cleared. Bank the reward permanently, straight away. */
  private handleNestCleared(reward: number): void {
    if (!this.profile) return;
    const data = this.profile.get();
    this.profile.update({
      essence: data.essence + reward,
      nestsCleared: data.nestsCleared + 1,
    });
    this.hud.showNestCleared(reward, data.essence + reward);
    this.journal?.record('nest-cleared', {
      reward,
      metresWalked: Math.round(this.metresWalkedThisRun),
      runSeconds: Math.round(this.combat.runTimeSeconds),
    });
  }

  /**
   * Open the permanent-upgrade shop.
   *
   * Available at any moment, including mid-run. The brief forbids anything that
   * makes somebody hurry in the real world, and being unable to spend what you
   * earned until you get home is a small version of exactly that.
   */
  openShop(): void {
    if (!this.profile) return;
    const data = this.profile.get();
    this.hud.showShop(
      data.essence,
      data.metaLevels,
      data.unlockedCharacters,
      data.selectedCharacter,
      data.ownedEquipment,
      data.equippedBySlot,
      (id) => this.buyUpgrade(id),
      (id) => this.chooseOrBuyCharacter(id),
      (id) => this.buyOrEquip(id),
      this.lowPower,
      (on) => {
        this.setLowPower(on);
        this.profile?.update({ lowPowerMode: on });
        this.journal?.record('low-power', { on });
        this.openShop();
      },
      this.journal?.summary() ?? 'nothing recorded yet',
      () => this.exportJournal(),
      () => {}
    );
  }

  /**
   * Hand the log to the player.
   *
   * Clipboard first, because on a phone a downloaded file is somewhere you then
   * have to go and find. If the browser refuses -- some do, unless the tap is
   * very fresh -- fall back to putting it on screen where it can be selected by
   * hand. Never leaves the phone either way.
   */
  private exportJournal(): void {
    if (!this.journal) return;
    const text = this.journal.export();

    navigator.clipboard?.writeText(text).then(
      () => this.hud.showNote('Play log copied — ' + this.journal!.count() + ' entries'),
      () => this.showJournalText(text)
    );
  }

  private showJournalText(text: string): void {
    const box = document.createElement('textarea');
    box.value = text;
    box.readOnly = true;
    Object.assign(box.style, {
      position: 'absolute',
      inset: '8% 6%',
      zIndex: '80',
      padding: '12px',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.18)',
      background: '#0d1117',
      color: '#9fb3c8',
      font: '400 11px/1.5 ui-monospace, monospace',
    } satisfies Partial<CSSStyleDeclaration>);
    box.addEventListener('click', () => box.select());

    const done = document.createElement('button');
    done.textContent = 'Done';
    done.style.cssText =
      'position:absolute;bottom:3%;left:50%;transform:translateX(-50%);z-index:81;' +
      'padding:11px 26px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);' +
      'background:rgba(13,17,23,0.95);color:#e6edf3;font:600 13px system-ui,sans-serif;cursor:pointer';
    done.addEventListener('click', () => {
      box.remove();
      done.remove();
    });

    this.uiContainer.append(box, done);
    box.select();
  }

  /**
   * Tapping a character either selects it, or buys it if it is not yours yet.
   * One control for both, because two would need explaining.
   */
  private chooseOrBuyCharacter(id: string): void {
    if (!this.profile) return;
    const data = this.profile.get();
    const hero = CHARACTERS.find((c) => c.id === id);
    if (!hero) return;

    if (data.unlockedCharacters.includes(id)) {
      this.profile.update({ selectedCharacter: id });
    } else {
      if (data.essence < hero.cost) return;
      this.profile.update({
        essence: data.essence - hero.cost,
        unlockedCharacters: [...data.unlockedCharacters, id],
        selectedCharacter: id,
      });
    }

    // A character only takes effect from the next run, so say so by starting one.
    this.openShop();
    this.restartRun();
  }

  /**
   * One tap does everything an item needs: buy it if you do not own it, wear it
   * if you do, take it off if you are already wearing it. Same reasoning as the
   * character buttons -- a separate "equip" step would need explaining, and this
   * needs none.
   */
  private buyOrEquip(id: string): void {
    if (!this.profile) return;
    const data = this.profile.get();
    const item = itemById(id);
    if (!item) return;

    let owned = data.ownedEquipment;
    let essence = data.essence;

    if (!owned.includes(id)) {
      if (essence < item.cost) return;
      essence -= item.cost;
      owned = [...owned, id];
    }

    const worn = { ...data.equippedBySlot };
    // Tapping what you already wear takes it off. One item to a slot, so
    // choosing a new one silently replaces whatever was there.
    if (worn[item.slot] === id) delete worn[item.slot];
    else worn[item.slot] = id;

    this.profile.update({ essence, ownedEquipment: owned, equippedBySlot: worn });

    // Equipment is folded in at the start of a run, so it only means anything
    // from the next one. Start it, exactly as choosing a character does.
    this.openShop();
    this.restartRun();
  }

  private buyUpgrade(id: string): void {
    if (!this.profile) return;
    const data = this.profile.get();
    const upgrade = META_UPGRADES.find((u) => u.id === id);
    if (!upgrade) return;

    const cost = costToBuy(upgrade, data.metaLevels);
    if (cost === null || data.essence < cost) return;

    const levels = { ...data.metaLevels, [id]: (data.metaLevels[id] ?? 0) + 1 };
    this.profile.update({ essence: data.essence - cost, metaLevels: levels });

    // Redraw with the new totals, and apply anything that takes effect at once.
    this.openShop();
    this.combat.setCaptureSpeed(this.metaBonuses().captureSpeedMultiplier);
  }

  /** Everything permanent the player has bought, as plain multipliers. */
  private metaBonuses() {
    return bonusesFrom((this.profile?.get().metaLevels ?? {}) as MetaLevels);
  }

  private handleDeath(): void {
    // Records survive death even though the run does not.
    if (this.profile) {
      const data = this.profile.get();
      this.profile.update({
        bestSurvivalSeconds: Math.max(data.bestSurvivalSeconds, Math.round(this.combat.runTimeSeconds)),
        bestLevel: Math.max(data.bestLevel, this.combat.level),
      });
    }

    this.journal?.record('run-ended', {
      seconds: Math.round(this.combat.runTimeSeconds),
      level: this.combat.level,
      kills: this.combat.monstersKilled,
      coins: this.coinsThisRun,
      metresWalked: Math.round(this.metresWalkedThisRun),
      character: this.profile?.get().selectedCharacter ?? 'wanderer',
    });

    const minutes = Math.floor(this.combat.runTimeSeconds / 60);
    const seconds = Math.floor(this.combat.runTimeSeconds % 60);
    this.hud.showDeath(
      `Survived ${minutes}m ${seconds}s · level ${this.combat.level} · ${this.combat.monstersKilled} killed`,
      () => this.restartRun(),
      {
        canRevive: !this.revivedThisRun,
        coinsThisRun: this.coinsThisRun,
        onRevive: () => this.watchAdToRevive(),
        onDoubleCoins: () => this.watchAdToDoubleCoins(),
      }
    );
  }

  /**
   * The two ad offers. Both go through `watchAdFor`, which pays the reward on
   * every path there is -- played, failed, closed early, or our own code
   * throwing. See the note at the top of `rewardedAd.ts`.
   */
  private watchAdToRevive(): void {
    this.revivedThisRun = true;
    void watchAdFor(this.uiContainer, 'another go', () => {
      this.journal?.record('ad', { placement: 'revive' });
      const px = this.collision.toLocalX(this.character.lng);
      const py = this.collision.toLocalY(this.character.lat);
      this.combat.revive(px, py);
    });
  }

  private watchAdToDoubleCoins(): void {
    const owed = this.coinsThisRun;
    // Zeroed before the ad rather than after, so a player who taps twice while
    // it loads cannot be paid twice.
    this.coinsThisRun = 0;
    void watchAdFor(this.uiContainer, owed + ' coins', () => {
      this.journal?.record('ad', { placement: 'double-coins', coins: owed });
      if (this.profile) {
        this.profile.update({ essence: this.profile.get().essence + owed });
      }
      this.restartRun();
    });
  }

  /** Start a fresh run from where the player is standing. */
  restartRun(): void {
    this.loadout = freshLoadout();
    this.cardsTaken.clear();
    this.coinsThisRun = 0;
    this.revivedThisRun = false;
    this.metresWalkedThisRun = 0;
    this.journal?.record('run-started', {
      character: this.profile?.get().selectedCharacter ?? 'wanderer',
      lowPower: this.lowPower,
    });
    // Ask for the next ad now, long before anyone might want one. An ad that
    // starts loading when the button is tapped shows a spinner instead.
    preloadAd();
    // Whoever you chose to play as decides what you start holding and what
    // you are good at. This happens before permanent upgrades, so both stack.
    const hero = characterById(this.profile?.get().selectedCharacter ?? 'wanderer');
    this.loadout.weapons = [{ id: hero.startingWeapon, level: 1, cooldown: 0, spin: 0 }];
    this.loadout.maxHealthBonus += hero.healthBonus;
    this.loadout.damageMultiplier *= hero.damageMultiplier;
    this.loadout.rangeMultiplier *= hero.rangeMultiplier;
    this.loadout.fireRateMultiplier *= hero.fireRateMultiplier;
    this.loadout.pickupRadiusMultiplier *= hero.pickupMultiplier;
    this.loadout.armour = Math.min(0.6, this.loadout.armour + hero.armour);
    this.playerSprite = hero.sprite;
    this.layer.playerSprite = hero.sprite;

    // Fold permanent progress into the fresh loadout.
    const meta = this.metaBonuses();
    this.loadout.maxHealthBonus += meta.bonusHealth;
    this.loadout.damageMultiplier *= meta.damageMultiplier;
    this.loadout.rangeMultiplier *= meta.rangeMultiplier;
    this.loadout.pickupRadiusMultiplier *= meta.pickupMultiplier;
    this.loadout.regenBonus += meta.regenBonus;

    // Then whatever is worn in the three equipment slots, on top of both.
    const kit = bonusesFromEquipment(this.profile?.get().equippedBySlot ?? {});
    this.loadout.damageMultiplier *= kit.damageMultiplier;
    this.loadout.fireRateMultiplier *= kit.fireRateMultiplier;
    this.loadout.rangeMultiplier *= kit.rangeMultiplier;
    this.loadout.extraProjectiles += kit.extraProjectiles;
    this.loadout.pierce += kit.pierce;
    this.loadout.maxHealthBonus += kit.healthBonus;
    this.loadout.armour = Math.min(0.6, this.loadout.armour + kit.armour);
    this.loadout.regenBonus += kit.regenBonus;
    this.loadout.pickupRadiusMultiplier *= kit.pickupMultiplier;
    this.loadout.xpMultiplier *= kit.xpMultiplier;

    this.combat.setCoinBonus(hero.coinBonus + kit.coinBonus);
    this.combat.setLoadout(this.loadout);
    this.combat.setCaptureSpeed(meta.captureSpeedMultiplier * kit.captureSpeedMultiplier);
    this.combat.reset();

    // Re-seed the nests from wherever the walls were built. Falling back to
    // that rather than requiring a GPS fix matters: without it, restarting
    // before the first fix silently left a world with no nests in it at all.
    const around = this.anchor ?? this.wallsBuiltAt;
    if (around) {
      const cell = worldCellFor(around.lat, around.lng);
      this.combat.placeNests(cell.seed);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Register our drawing layer with the map and create the starting entities.
   * Must be called after the map's style has loaded.
   */
  start(): void {
    if (this.running) return;

    // Adding the layer here is what puts our game objects INSIDE the map's own
    // drawing pass, rather than on a sheet of glass above it.
    if (!this.map.getLayer(this.layer.id)) {
      this.map.addLayer(this.layer);
    }

    this.playerEntity = this.entities.spawn(
      EntityKind.PLAYER,
      this.character.lng,
      this.character.lat,
      PLAYER_RADIUS_M
    );

    this.running = true;
    this.lastFrameMs = performance.now();
    this.watchVisibility();
    requestAnimationFrame(this.tick);
  }

  /**
   * Drop a ring of markers at fixed real-world positions around a point.
   *
   * This exists for one reason: to PROVE the drawing layer is genuinely welded
   * to the map. Zoom in, zoom out, drag the map about -- if these dots stay
   * exactly on the same patches of pavement the whole time, the hardest part of
   * M2 works. If they slide even slightly, it does not.
   *
   * They are removed once there are real things to look at.
   */
  spawnTestMarkers(around: LatLng): void {
    // Clear any previous set so repeated calls do not pile up.
    for (let id = 0; id < this.entities.usedSlots; id++) {
      if (this.entities.alive[id] && this.entities.kind[id] === EntityKind.TEST_MARKER) {
        this.entities.release(id);
      }
    }

    // Two rings and a centre cross, at distances that mean something: 10 m is
    // roughly a house frontage, 25 m is the leash, 50 m is most of a screen at
    // combat zoom.
    for (const radius of [10, 25, 50]) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const at = offsetByMetres(
          around,
          Math.cos(angle) * radius,
          Math.sin(angle) * radius
        );
        this.entities.spawn(
          EntityKind.TEST_MARKER,
          at.lng,
          at.lat,
          TEST_MARKER_RADIUS_M
        );
      }
    }
  }

  /** Tell the game where the player really is. Called by the location module. */
  setAnchor(anchor: LatLng): void {
    const first = this.anchor === null;
    // Count the footsteps before replacing the old position. Jumps of more than
    // a bus length are dropped: those are the GPS re-thinking where it is, not
    // somebody sprinting, and counting them would flatter the numbers.
    if (this.anchor) {
      const step = distanceMetres(this.anchor, anchor);
      if (step < 15) this.metresWalkedThisRun += step;
    }
    this.anchor = anchor;

    if (first) {
      this.character.snapTo(anchor);
      this.camera.snapTo(anchor);
      // Test markers used to appear here. They were scaffolding for M2 -- rings
      // at 10, 25 and 50 m that proved game objects stay welded to the map --
      // and they did their job three milestones ago. Now there are monsters and
      // pickups to look at, orange diamonds sitting in the street are just
      // clutter that reads as loot. Still available from the dev panel.
    }

    // Work out the walls when we arrive, and again only after real travel --
    // never per frame, as the brief requires.
    const moved = this.wallsBuiltAt ? distanceMetres(this.wallsBuiltAt, anchor) : Infinity;
    if (!this.wallsLoading && moved > TUNING.walls.rebuildAfterMovingMetres) {
      void this.rebuildWalls(anchor);
    }
  }

  /**
   * Fetch the real buildings around a point and turn them into walls. If the
   * neighbourhood turns out to be nearly empty, invent some obstacles so the
   * fight still has shape.
   */
  /** Whatever went wrong last time we tried to build the walls. */
  wallError: string | null = null;

  async rebuildWalls(around: LatLng): Promise<void> {
    if (this.wallsLoading) return;
    this.wallsLoading = true;
    this.wallError = null;

    try {
      const rings = activeBasemap.hasBuildingGeometry
        ? await this.buildings.buildingsNear(around.lng, around.lat, TUNING.walls.loadRadiusMetres)
        : [];

      this.collision.rebuild(rings, around.lng, around.lat, TUNING.walls.loadRadiusMetres);
      // Water blocks movement but is not architecture -- a lakeside field is
      // still an empty field, and still needs a generated arena.
      this.realBuildingCount = this.collision.buildingCount();

      // Somewhere with almost nothing built on it: a beach, a park, open
      // countryside, or simply an area nobody has mapped. Generate structure.
      this.generatedCount = 0;
      if (this.realBuildingCount < TUNING.walls.tooFewBuildingsForAFight) {
        const cell = worldCellFor(around.lat, around.lng);
        this.generatedCount = addFallbackArena(
          this.collision,
          cell.seed,
          TUNING.walls.fallbackObstacleCount
        );
      }

      // Give the pathfinding its own copy of where the buildings are. Done here,
      // once, rather than every time monsters need directions.
      this.flowField.rasteriseWalls(this.collision, 0, 0);

      // ...and paint the roads on top, so the swarm pours down streets rather
      // than drifting across back gardens in a straight line.
      const streets = this.buildings.streetsNear(
        around.lng,
        around.lat,
        TUNING.walls.loadRadiusMetres
      );
      this.flowField.rasteriseStreets(
        streets,
        around.lng,
        around.lat,
        111320 * Math.cos((around.lat * Math.PI) / 180),
        TUNING.navigation.streetHalfWidthMetres,
        TUNING.navigation.offStreetPenalty,
        TUNING.navigation.streetsOnly
      );
      this.flowField.update(0, 0, performance.now());

      // Nests belong to the patch of world, so they move with it.
      const cell = worldCellFor(around.lat, around.lng);
      this.combat.placeNests(cell.seed);

      this.wallsBuiltAt = { ...around };
    } catch (error) {
      // Previously this threw into a floating promise: the walls silently never
      // appeared, and with them went the nests, the monsters and the markers,
      // with nothing on screen to say why.
      this.wallError = error instanceof Error ? error.message : String(error);
      console.error('[walls] could not build them', error);
    } finally {
      this.wallsLoading = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The loop                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * LOW POWER MODE, and stopping dead when the screen is off.
   *
   * The second of those is not a setting and is never off. A phone in a pocket
   * with the screen dark was, until now, still drawing sixty frames a second of
   * a map nobody was looking at -- which is the single most wasteful thing this
   * game could possibly do to somebody halfway through a walk.
   */
  lowPower = false;
  /** Set by the browser when the game is hidden: pocket, lock, another app. */
  private hidden = false;
  /** When the next frame is allowed, used only while low power is on. */
  private nextFrameDueMs = 0;

  setLowPower(on: boolean): void {
    this.lowPower = on;
    this.combat.setMonsterCap(on ? TUNING.performance.lowPower.maxMonstersAlive : null);
  }

  private watchVisibility(): void {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      // Coming back, forget how long we were away -- otherwise the first frame
      // after unlocking is a twenty-minute step and everything teleports.
      if (!this.hidden) this.lastFrameMs = performance.now();
    });
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return;

    // Nobody is looking. Keep the loop alive so we notice when they come back,
    // but do no work at all.
    if (this.hidden) {
      requestAnimationFrame(this.tick);
      return;
    }

    // Thirty frames a second instead of sixty. The map library only redraws
    // when we ask it to, so skipping our frame skips its work as well -- and
    // that is the larger half of the saving.
    if (this.lowPower) {
      if (nowMs < this.nextFrameDueMs) {
        requestAnimationFrame(this.tick);
        return;
      }
      this.nextFrameDueMs = nowMs + TUNING.performance.lowPower.frameIntervalMs;
    }

    // Cap the step. If the phone is interrupted -- a notification, the screen
    // locking -- we could come back to a "frame" that lasted 30 seconds, and
    // everything would teleport. Better to lose a little time than to break.
    const deltaSeconds = Math.min((nowMs - this.lastFrameMs) / 1000, 0.1);
    this.lastFrameMs = nowMs;

    this.measureFps(deltaSeconds);

    // 1. Read the thumb.
    const input = this.joystick.read();
    const engaged = this.joystick.isEngaged();

    // Remember where the character was standing before it moved, so that if it
    // gets wedged we know which side to let it out on.
    const cameFromLng = this.character.lng;
    const cameFromLat = this.character.lat;

    // Everything stops while a card is being chosen, or after death.
    // The opening cards hold the world still. Without this, somebody reading
    // "you move by walking" would already be losing health to a swarm they have
    // not been told about yet.
    const paused = this.hud.isBlocking() || (this.tutorial?.isBlocking() ?? false);

    // SAFETY CATCH. The world holds still while a card choice is open, so if
    // that flag is ever set without a screen actually on display, the game
    // freezes solid with no way out -- monsters stop, capture stops, nothing
    // explains why. Caught this happening during testing. If the two ever
    // disagree, believe the screen.
    if (this.combat.awaitingCardChoice && !paused) {
      this.combat.awaitingCardChoice = false;
      this.combat.offerNextLevelUpIfIdle();
    }

    // 1b. IF YOUR REAL POSITION IS INSIDE A BUILDING, LEASH TO THE DOORSTEP.
    //
    // Testing indoors puts the anchor inside a house. The leash then pulls the
    // character into the wall while collision shoves it back out, every single
    // frame -- and since the camera follows the character, the whole map
    // vibrates. Resolving the anchor out of the building first removes the tug
    // of war at its source.
    let leashCentre = this.anchor;
    if (this.anchor && this.collision.wallCount() > 0) {
      const ax = this.collision.toLocalX(this.anchor.lng);
      const ay = this.collision.toLocalY(this.anchor.lat);
      if (this.collision.resolveCircle(ax, ay, 1.0, this.resolved, ax, ay)) {
        leashCentre = {
          lng: this.collision.toLng(this.resolved.x),
          lat: this.collision.toLat(this.resolved.y),
        };
      }
    }

    // 2. Move the character, honouring the leash and any upgrades taken.
    if (!paused) {
      this.character.update(deltaSeconds, leashCentre, input);
    }

    // 2b. Push the character out of any building it has walked into.
    // Done after movement rather than by refusing the move, because sliding
    // along a wall feels far better than sticking to it.
    if (this.collision.wallCount() > 0) {
      const localX = this.collision.toLocalX(this.character.lng);
      const localY = this.collision.toLocalY(this.character.lat);
      if (
        this.collision.resolveCircle(
          localX,
          localY,
          TUNING.walls.playerCollisionRadiusMetres,
          this.resolved,
          this.collision.toLocalX(cameFromLng),
          this.collision.toLocalY(cameFromLat)
        )
      ) {
        this.character.placeAt(
          this.collision.toLng(this.resolved.x),
          this.collision.toLat(this.resolved.y)
        );
      }
    }

    // 3. Copy the character into the data the graphics card will read.
    if (this.playerEntity >= 0) {
      this.entities.setPosition(this.playerEntity, this.character.lng, this.character.lat);
    }

    // 3b. Refresh the swarm's shared routes, a few times a second rather than
    // every frame. One calculation serves every monster.
    if (
      this.collision.wallCount() > 0 &&
      this.flowField.msSinceBuild(nowMs) >
        TUNING.navigation.recalculateEveryMs *
          (this.lowPower ? TUNING.performance.lowPower.flowFieldIntervalMultiplier : 1)
    ) {
      this.flowField.update(
        this.collision.toLocalX(this.character.lng),
        this.collision.toLocalY(this.character.lat),
        nowMs
      );
    }

    // 3c. The fight itself: nests, monsters, weapons, damage, experience.
    if (!paused && this.collision.wallCount() > 0) {
      const px = this.collision.toLocalX(this.character.lng);
      const py = this.collision.toLocalY(this.character.lat);

      // Capture is measured from where you REALLY are, not from the character
      // you steer -- that is what makes clearing a nest cost footsteps.
      if (this.anchor) {
        this.combat.setAnchor(
          this.collision.toLocalX(this.anchor.lng),
          this.collision.toLocalY(this.anchor.lat)
        );
      }

      this.combat.update(deltaSeconds, px, py);
      this.combat.checkEnemyShots(px, py);

      // Teach whatever is happening right now. A rule explained while you watch
      // it happen sticks; the same rule in a wall of text at the start does not.
      if (this.tutorial) {
        let nearestNest: number | null = null;
        for (const nest of this.combat.nests) {
          const d = Math.hypot(nest.x - px, nest.y - py);
          if (nearestNest === null || d < nearestNest) nearestNest = d;
        }
        this.tutorial.update(deltaSeconds, {
          monstersAlive: this.combat.aliveMonsters(),
          monstersKilled: this.combat.monstersKilled,
          coinsCollected: this.combat.coinsCollected,
          healthFraction: this.combat.health / this.combat.maxHealth,
          nearestNestMetres: nearestNest,
        });
      }
    }

    // 4. Move the camera to follow, zooming in or out as combat starts or ends.
    // Only monsters close enough to actually see count as a fight.
    const underThreat =
      this.combat.nearestMonsterDistance(
        this.collision.toLocalX(this.character.lng),
        this.collision.toLocalY(this.character.lat)
      ) < TUNING.camera.combatWhenMonsterWithinMetres;
    this.camera.update(deltaSeconds, this.character.at(), engaged || underThreat, nowMs);

    // 4b. Point at the nests, clamping any that are off screen to the edge.
    this.updateNestMarkers();

    // 4c. The nest you are standing on, if any.
    const capturing = this.combat.capturingNest();
    this.hud.updateCapture(
      capturing?.captureProgress ?? 0,
      capturing?.beingCaptured ?? false,
      TUNING.capture.radiusMetres
    );

    // 5. Refresh the small bars and numbers.
    const c = this.combat;
    const minutes = Math.floor(c.runTimeSeconds / 60);
    const seconds = Math.floor(c.runTimeSeconds % 60);
    // The status line doubles as a diagnostic. When something upstream fails --
    // no walls means no nests means no monsters -- this is the difference
    // between "nothing is happening" and knowing exactly which step broke.
    // Bank whatever was picked up, as it is picked up. Losing a run should
    // never lose the money you walked over to collect.
    if (this.combat.coinsCollected > 0 && this.profile) {
      const banked = this.combat.coinsCollected;
      this.combat.coinsCollected = 0;
      this.coinsThisRun += banked;
      this.profile.update({ essence: this.profile.get().essence + banked });
    }

    const nestDistance = this.combat.nearestNestDistance();
    const essence = this.profile?.get().essence ?? 0;

    const walls = this.wallError
      ? `walls FAILED`
      : this.wallsLoading
        ? 'walls loading'
        : `w${this.collision.wallCount()}`;

    this.hud.update(
      c.health,
      c.maxHealth,
      c.xp,
      c.xpForNextLevel,
      `${minutes}:${String(seconds).padStart(2, '0')} LV${c.level} ${walls} ` +
        `nest ${Number.isFinite(nestDistance) ? Math.round(nestDistance) + 'm' : '--'} ` +
        `m${c.aliveMonsters()} ${essence}✦`
    );

    // Ask the map to draw. Our layer draws as part of that same pass, which is
    // precisely why it cannot fall out of step with the streets underneath.
    this.map.triggerRepaint();

    requestAnimationFrame(this.tick);
  };

  /**
   * Work out where each nest is on screen, and pin an arrow to the edge for any
   * that are out of view. Without these the first minute of a run looks like
   * nothing is happening at all.
   */
  private updateNestMarkers(): void {
    const canvas = this.map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const margin = 26;

    const markers = this.combat.nests.map((nest) => {
      const lng = this.collision.toLng(nest.x);
      const lat = this.collision.toLat(nest.y);
      const point = this.map.project([lng, lat]);

      const distance = Math.hypot(
        nest.x - this.collision.toLocalX(this.character.lng),
        nest.y - this.collision.toLocalY(this.character.lat)
      );

      const onScreen =
        point.x > margin && point.x < width - margin && point.y > margin && point.y < height - margin;

      return {
        screenX: Math.max(margin, Math.min(width - margin, point.x)),
        screenY: Math.max(margin, Math.min(height - margin, point.y)),
        distanceMetres: distance,
        onScreen,
      };
    });

    this.hud.updateNestMarkers(markers);
  }

  private measureFps(deltaSeconds: number): void {
    this.framesThisSecond++;
    this.fpsAccumulatorMs += deltaSeconds * 1000;
    if (this.fpsAccumulatorMs >= 1000) {
      this.measuredFps = this.framesThisSecond;
      this.framesThisSecond = 0;
      this.fpsAccumulatorMs = 0;
    }
  }

  stop(): void {
    this.running = false;
  }

  stats(): GameStats {
    return {
      fps: this.measuredFps,
      entitiesAlive: this.entities.aliveCount,
      entitiesDrawn: this.layer.drawnLastFrame(),
      inCombat: this.camera.isInCombat(),
      zoom: this.camera.currentZoom(),
      monsters: this.combat.aliveMonsters(),
      nests: this.combat.nests.length,
      pressure: this.combat.pressure(),
      level: this.combat.level,
      health: this.combat.health,
      walls: {
        wallCount: this.collision.wallCount(),
        realBuildings: this.realBuildingCount,
        generated: this.generatedCount,
        usingFallbackArena: this.generatedCount > 0,
        tilesFetched: this.buildings.stats.tilesFetched,
        loading: this.wallsLoading,
      },
      leashTension: this.character.leashTension(this.anchor),
      distanceFromAnchor: this.character.distanceFromAnchor(this.anchor),
    };
  }
}
