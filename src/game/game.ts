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
import { offsetByMetres } from '../location/geo';

/**
 * How many things can exist at once. The brief targets 400 monsters, so this
 * leaves room for them plus projectiles, pickups and nests.
 */
const ENTITY_CAPACITY = 1200;

/** How big things are, in real metres. Placeholder sizes for M2. */
const PLAYER_RADIUS_M = 3;
const TEST_MARKER_RADIUS_M = 2.5;

export interface GameStats {
  fps: number;
  entitiesAlive: number;
  entitiesDrawn: number;
  inCombat: boolean;
  zoom: number;
  leashTension: number;
  distanceFromAnchor: number;
}

export class Game {
  readonly entities = new EntityStore(ENTITY_CAPACITY);
  readonly layer: EntityLayer;
  readonly camera: GameCamera;
  readonly joystick: Joystick;
  readonly character: PlayerCharacter;

  private map: MapLibreMap;
  private playerEntity: EntityId = -1;

  /** Your real smoothed position, handed in from the location module. */
  private anchor: LatLng | null = null;

  private running = false;
  private lastFrameMs = 0;

  /* Frame-rate measurement, averaged over a second so the number is readable. */
  private framesThisSecond = 0;
  private fpsAccumulatorMs = 0;
  private measuredFps = 0;

  constructor(map: MapLibreMap, uiContainer: HTMLElement, startAt: LatLng) {
    this.map = map;
    this.layer = new EntityLayer(this.entities);
    this.camera = new GameCamera(map);
    this.joystick = new Joystick(uiContainer);
    this.character = new PlayerCharacter(startAt);
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

    // 2. Move the character, honouring the leash.
    this.character.update(deltaSeconds, this.anchor, input);

    // 3. Copy the character into the data the graphics card will read.
    if (this.playerEntity >= 0) {
      this.entities.setPosition(this.playerEntity, this.character.lng, this.character.lat);
    }

    // 4. Move the camera to follow, zooming in or out as combat starts or ends.
    this.camera.update(deltaSeconds, this.character.at(), engaged, nowMs);

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
      leashTension: this.character.leashTension(this.anchor),
      distanceFromAnchor: this.character.distanceFromAnchor(this.anchor),
    };
  }
}
