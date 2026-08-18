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
import { freshLoadout, pickCards, type Loadout, type UpgradeCard } from './upgrades';
import { seededRandom } from '../world/determinism';
import { worldCellFor } from '../world/determinism';
import { activeBasemap } from '../config/basemap';
import { TUNING } from '../config/tuning';

/**
 * How many things can exist at once. The brief targets 400 monsters, so this
 * leaves room for them plus projectiles, pickups and nests.
 */
const ENTITY_CAPACITY = 1200;

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

  constructor(map: MapLibreMap, uiContainer: HTMLElement, startAt: LatLng, useMirror = false) {
    this.map = map;
    this.buildings = new BuildingSource(useMirror);
    this.layer = new EntityLayer(this.entities);
    this.camera = new GameCamera(map);
    this.joystick = new Joystick(uiContainer);
    this.character = new PlayerCharacter(startAt);
    this.hud = new CombatHud(uiContainer);

    this.combat = new Combat(this.entities, this.collision, this.flowField, this.loadout, {
      onLevelUp: (level) => this.offerCards(level),
      onDeath: () => this.handleDeath(),
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

  private handleDeath(): void {
    const minutes = Math.floor(this.combat.runTimeSeconds / 60);
    const seconds = Math.floor(this.combat.runTimeSeconds % 60);
    this.hud.showDeath(
      `Survived ${minutes}m ${seconds}s · level ${this.combat.level} · ${this.combat.monstersKilled} killed`,
      () => this.restartRun()
    );
  }

  /** Start a fresh run from where the player is standing. */
  restartRun(): void {
    this.loadout = freshLoadout();
    this.cardsTaken.clear();
    this.combat.setLoadout(this.loadout);
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
    this.anchor = anchor;

    if (first) {
      this.character.snapTo(anchor);
      this.camera.snapTo(anchor);
      this.spawnTestMarkers(anchor);
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
  async rebuildWalls(around: LatLng): Promise<void> {
    if (this.wallsLoading) return;
    this.wallsLoading = true;

    try {
      const rings = activeBasemap.hasBuildingGeometry
        ? await this.buildings.buildingsNear(around.lng, around.lat, TUNING.walls.loadRadiusMetres)
        : [];

      this.collision.rebuild(rings, around.lng, around.lat, TUNING.walls.loadRadiusMetres);
      this.realBuildingCount = this.collision.wallCount();

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
      this.flowField.update(0, 0, performance.now());

      // Nests belong to the patch of world, so they move with it.
      const cell = worldCellFor(around.lat, around.lng);
      this.combat.placeNests(cell.seed);

      this.wallsBuiltAt = { ...around };
    } finally {
      this.wallsLoading = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* The loop                                                            */
  /* ------------------------------------------------------------------ */

  private tick = (nowMs: number): void => {
    if (!this.running) return;

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
    const paused = this.hud.isBlocking();

    // 2. Move the character, honouring the leash and any upgrades taken.
    if (!paused) {
      this.character.update(
        deltaSeconds,
        this.anchor,
        input,
        this.loadout.moveSpeedMultiplier,
        this.loadout.leashBonusMetres
      );
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
      this.flowField.msSinceBuild(nowMs) > TUNING.navigation.recalculateEveryMs
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
      this.combat.update(deltaSeconds, px, py);
      this.combat.checkEnemyShots(px, py);
    }

    // 4. Move the camera to follow, zooming in or out as combat starts or ends.
    // Monsters nearby count as combat too, not just touching the stick.
    const underThreat = this.combat.aliveMonsters() > 0;
    this.camera.update(deltaSeconds, this.character.at(), engaged || underThreat, nowMs);

    // 5. Refresh the small bars and numbers.
    const c = this.combat;
    const minutes = Math.floor(c.runTimeSeconds / 60);
    const seconds = Math.floor(c.runTimeSeconds % 60);
    this.hud.update(
      c.health,
      c.maxHealth,
      c.xp,
      c.xpForNextLevel,
      `${minutes}:${String(seconds).padStart(2, '0')}  LV${c.level}  ${c.aliveMonsters()}▲  ${c.monstersKilled}✝`
    );

    // Ask the map to draw. Our layer draws as part of that same pass, which is
    // precisely why it cannot fall out of step with the streets underneath.
    this.map.triggerRepaint();

    requestAnimationFrame(this.tick);
  };

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
