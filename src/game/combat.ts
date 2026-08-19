/**
 * THE FIGHT.
 * ==========
 * Nests, monsters, weapons, experience, damage and death. Everything that makes
 * the map dangerous.
 *
 * WHAT THE PLAYER DOES HERE: nothing but move. Weapons fire themselves at
 * whatever is in range. Every decision happens at level-up, choosing cards. That
 * is the brief's locked rule, and it shapes this whole file -- there is no
 * aiming code, no targeting input, no attack button, because there is no attack.
 *
 * EVERYTHING WORKS IN PLAIN METRES. The entity store keeps real longitude and
 * latitude so things draw in the right place on the map, but all the physics
 * here happens in metres east and north of the collision world's origin.
 * Distances then behave the way distances should.
 */

import { EntityKind, type EntityStore, type EntityId } from '../world/entities';
import type { CollisionWorld } from '../world/collision';
import type { FlowField } from '../world/flowField';
import { seededRandom } from '../world/determinism';
import { TUNING } from '../config/tuning';
import { WeaponId, type Loadout } from './upgrades';

/** How big each square of the monster-crowding grid is, in metres. */
const CROWD_CELL_METRES = 4;
const CROWD_GRID_SIZE = 192; // covers 768 m, comfortably more than we simulate

export interface Nest {
  /** Position in metres from the collision origin. */
  x: number;
  y: number;
  /** How long this nest has been alive, in seconds. */
  ageSeconds: number;
  /** Counts down to the next monster. */
  spawnTimer: number;
  entityId: EntityId;
  /** Its own dice, so its monster mix is stable and server-free. */
  seed: number;
  /** How much of the way through destroying it we are, 0 to 1. */
  captureProgress: number;
  /** Sleeping nests are scenery: no monsters, no ageing. */
  awake: boolean;
  /** True while the player is standing close enough to be clearing it. */
  beingCaptured: boolean;
}

export interface CombatEvents {
  onLevelUp: (newLevel: number) => void;
  onDeath: () => void;
  /** A nest has been destroyed. The reward is in essence. */
  onNestCleared: (reward: number) => void;
}

export class Combat {
  private entities: EntityStore;
  private collision: CollisionWorld;
  private flowField: FlowField;
  private events: CombatEvents;

  /* --- the player --- */
  health: number = TUNING.player.maxHealth;
  maxHealth: number = TUNING.player.maxHealth;
  level: number = 1;
  xp: number = 0;
  xpForNextLevel: number = TUNING.levelling.firstLevelXp;
  private invulnerableFor = 0;

  /** True while a level-up card choice is waiting. The world stands still. */
  awaitingCardChoice = false;

  /**
   * Latched the moment health runs out.
   *
   * Without it, regeneration lifts health a hair above zero on the very next
   * frame, the run carries on, and the death event fires again and again --
   * measured: a player "died" at 100 s and the simulation happily continued to
   * 200 s with the death screen being raised repeatedly.
   */
  private dead = false;

  /** Card choices earned but not yet shown, so none is ever lost. */
  private pendingLevelUps = 0;

  /* --- the world --- */
  nests: Nest[] = [];
  private loadout: Loadout;

  /** Seconds since the run began, which is what drives escalation. */
  runTimeSeconds = 0;
  monstersKilled = 0;

  /** Running count, kept up to date on spawn and death so nothing has to scan. */
  private livingMonsters = 0;

  /** Contact damage gathered this frame, before the cap is applied. */
  private contactDamageThisFrame = 0;

  /** Money picked up this run, waiting to be banked. */
  coinsCollected = 0;

  /* --- crowding grid, so monsters spread out instead of stacking --- */
  private crowdHeads = new Int32Array(CROWD_GRID_SIZE * CROWD_GRID_SIZE).fill(-1);
  private crowdNext: Int32Array;

  /* --- scratch, reused so the loop allocates nothing --- */
  private step = { x: 0, y: 0 };
  private resolved = { x: 0, y: 0 };
  private random: () => number;

  constructor(
    entities: EntityStore,
    collision: CollisionWorld,
    flowField: FlowField,
    loadout: Loadout,
    events: CombatEvents
  ) {
    this.entities = entities;
    this.collision = collision;
    this.flowField = flowField;
    this.loadout = loadout;
    this.events = events;
    this.crowdNext = new Int32Array(entities.capacity);
    this.random = seededRandom(1);
  }

  setLoadout(loadout: Loadout): void {
    this.loadout = loadout;
    this.maxHealth = TUNING.player.maxHealth + loadout.maxHealthBonus;
  }

  /* ------------------------------------------------------------------ */
  /* Starting a run                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Place this area's nests. Positions come from the patch of world's own seed,
   * so the same place always has nests in the same spots, with no server and no
   * agreement needed between players.
   */
  placeNests(worldSeed: number): void {
    this.clearNests();
    this.random = seededRandom(worldSeed);
    const roll = seededRandom(worldSeed);

    for (let i = 0; i < TUNING.nests.countPerCell; i++) {
      const spot = this.findOpenSpot(
        roll,
        TUNING.nests.minDistanceMetres,
        TUNING.nests.maxDistanceMetres
      );
      if (!spot) continue;

      const entityId = this.entities.spawn(
        EntityKind.NEST,
        this.collision.toLng(spot.x),
        this.collision.toLat(spot.y),
        TUNING.nests.radiusMetres
      );
      if (entityId < 0) continue;

      this.nests.push({
        x: spot.x,
        y: spot.y,
        ageSeconds: 0,
        spawnTimer: TUNING.nests.startingSpawnIntervalSeconds,
        entityId,
        seed: worldSeed + i * 7919,
        captureProgress: 0,
        beingCaptured: false,
        awake: false,
      });
    }

    this.seedOpeningWave();
  }

  /**
   * Put a handful of monsters already partway to the player, so a run has
   * something in it from the first few seconds rather than the first minute.
   */
  private seedOpeningWave(): void {
    const roll = this.random;

    for (let i = 0; i < TUNING.nests.openingWaveCount; i++) {
      // Try several spots for each one. With monsters confined to roads, a
      // single attempt failed most of the time -- twelve were asked for and
      // three appeared, leaving a lull until the nests could walk some over.
      for (let attempt = 0; attempt < 14; attempt++) {
        const fromNest = this.nests.length ? this.nests[i % this.nests.length] : { x: 1, y: 0 };
        const nestAngle = Math.atan2(fromNest.y, fromNest.x);
        // Spread wider with each failed attempt rather than retrying the same
        // narrow arc.
        const angle = nestAngle + (roll() - 0.5) * (1.5 + attempt * 0.35);
        const distance =
          TUNING.nests.openingWaveMinMetres +
          roll() * (TUNING.nests.openingWaveMaxMetres - TUNING.nests.openingWaveMinMetres);

        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        if (!this.collision.hasClearance(x, y, 1.5)) continue;
        if (
          TUNING.navigation.streetsOnly &&
          this.flowField.streetsAreUsable() &&
          !this.flowField.isOnStreetAt(x, y)
        ) {
          continue;
        }

        this.spawnMonsterAt(0, x, y);
        break;
      }
    }
  }

  private clearNests(): void {
    for (const nest of this.nests) this.entities.release(nest.entityId);
    this.nests = [];
  }

  /**
   * Find somewhere in the open, at a sensible distance, that can actually reach
   * the player. A nest inside a building or across a river would be no threat
   * and no target.
   */
  private findOpenSpot(
    roll: () => number,
    minMetres: number,
    maxMetres: number
  ): { x: number; y: number } | null {
    // Give way gradually rather than all at once.
    //
    // Demanding a full nest's worth of clear ground AND a walkable route is the
    // ideal, but in a dense neighbourhood of terraced shophouses there may be
    // nowhere that generous -- measured on the Han river in Da Nang, where the
    // strict test found nothing at all and left the area with no nests, which is
    // a game with nothing in it. So we relax one requirement at a time and take
    // the best spot still available.
    const attempts: { clearance: number; needsRoute: boolean }[] = [
      { clearance: TUNING.nests.radiusMetres + 2, needsRoute: true },
      { clearance: TUNING.nests.radiusMetres, needsRoute: true },
      { clearance: TUNING.nests.radiusMetres * 0.6, needsRoute: true },
      { clearance: TUNING.nests.radiusMetres * 0.6, needsRoute: false },
      { clearance: 1.5, needsRoute: false },
    ];

    for (const rule of attempts) {
      for (let attempt = 0; attempt < 160; attempt++) {
        const angle = roll() * Math.PI * 2;
        const distance = minMetres + roll() * (maxMetres - minMetres);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;

        if (!this.collision.hasClearance(x, y, rule.clearance)) continue;
        if (rule.needsRoute && this.flowField.ready() && !this.flowField.isReachable(x, y)) {
          continue;
        }
        return { x, y };
      }
    }

    return null;
  }

  /** Wipe everything and start over. */
  reset(): void {
    this.clearNests();
    for (let id = 0; id < this.entities.usedSlots; id++) {
      const kind = this.entities.kind[id];
      if (
        this.entities.alive[id] &&
        (kind === EntityKind.MONSTER || kind === EntityKind.PROJECTILE || kind === EntityKind.XP_ORB)
      ) {
        this.entities.release(id);
      }
    }
    this.health = this.maxHealth;
    this.level = 1;
    this.xp = 0;
    this.xpForNextLevel = TUNING.levelling.firstLevelXp;
    this.runTimeSeconds = 0;
    this.monstersKilled = 0;
    this.livingMonsters = 0;
    this.coinsCollected = 0;
    this.awaitingCardChoice = false;
    this.pendingLevelUps = 0;
    this.dead = false;
  }

  /* ------------------------------------------------------------------ */
  /* One frame                                                           */
  /* ------------------------------------------------------------------ */

  update(deltaSeconds: number, playerX: number, playerY: number): void {
    // While a card choice is open the world holds its breath. Vampire Survivors
    // does the same, and it is what makes a level-up feel like a decision rather
    // than an interruption.
    if (this.awaitingCardChoice || this.dead) return;

    this.runTimeSeconds += deltaSeconds;
    this.invulnerableFor = Math.max(0, this.invulnerableFor - deltaSeconds);

    this.updateNests(deltaSeconds);
    this.rebuildCrowdGrid();
    this.updateMonsters(deltaSeconds, playerX, playerY);

    // Apply the whole frame's crowding at once, capped.
    //
    // Uncapped, the moment the swarm broke through, sixty monsters touching at
    // the same instant removed a full health bar in under a second -- measured:
    // untouched at 386 s, dead at 393 s. That is a light switch, not a fight.
    // Capping it turns being overwhelmed into something you can feel arriving,
    // and gives you a few seconds to decide to walk away.
    if (this.contactDamageThisFrame > 0) {
      const cap = TUNING.player.maxContactDamagePerSecond * deltaSeconds;
      this.damagePlayer(Math.min(this.contactDamageThisFrame, cap));
    }
    this.fireWeapons(deltaSeconds, playerX, playerY);
    this.updateProjectiles(deltaSeconds);
    this.updateOrbs(deltaSeconds, playerX, playerY);

    // A slow trickle of healing, so one careless moment is not permanent.
    this.health = Math.min(this.maxHealth, this.health + TUNING.player.healthRegenPerSecond * deltaSeconds);
  }

  /* ------------------------------------------------------------------ */
  /* Nests                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Where the player REALLY is, in metres. Set every frame by the game loop.
   * Capture is measured from here rather than from the steered character,
   * because the leash is far shorter than the distance to a nest -- so clearing
   * one genuinely requires walking to it.
   */
  private anchorX = 0;
  private anchorY = 0;
  /** How much faster this player clears nests, from permanent upgrades. */
  private captureSpeedMultiplier = 1;

  setAnchor(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
  }

  /** Extra chance of money dropping, from the chosen character. */
  private coinBonus = 0;

  setCoinBonus(bonus: number): void {
    this.coinBonus = bonus;
  }

  setCaptureSpeed(multiplier: number): void {
    this.captureSpeedMultiplier = multiplier;
  }

  private updateNests(deltaSeconds: number): void {
    for (let i = this.nests.length - 1; i >= 0; i--) {
      const nest = this.nests[i];

      // A nest across the neighbourhood is scenery until you walk near it.
      // This is what lets the map carry many of them without a thousand
      // monsters converging from every direction at once.
      const distanceToPlayer = Math.hypot(nest.x - this.anchorX, nest.y - this.anchorY);
      nest.awake = distanceToPlayer < TUNING.nests.activateWithinMetres;
      if (!nest.awake) {
        nest.beingCaptured = false;
        continue;
      }

      nest.ageSeconds += deltaSeconds;

      /* --- are you standing on top of it? --- */
      nest.beingCaptured = distanceToPlayer < TUNING.capture.radiusMetres;

      if (nest.beingCaptured) {
        nest.captureProgress +=
          (deltaSeconds / TUNING.capture.holdSeconds) * this.captureSpeedMultiplier;

        if (nest.captureProgress >= 1) {
          this.destroyNest(i);
          continue;
        }
      } else if (nest.captureProgress > 0) {
        // Drift back down rather than resetting. Stepping aside for a scooter
        // must never cost a minute of standing there.
        nest.captureProgress = Math.max(
          0,
          nest.captureProgress - (deltaSeconds / TUNING.capture.holdSeconds) * TUNING.capture.decayRate
        );
      }

      nest.spawnTimer -= deltaSeconds;
      if (nest.spawnTimer > 0) continue;
      nest.spawnTimer = this.spawnIntervalFor(nest);

      // Cap the swarm as a whole rather than per nest. Attributing each corpse
      // back to the nest that made it would need bookkeeping on every monster
      // for no gameplay benefit -- and my first attempt at it silently
      // decremented whichever nest happened to be first in the list.
      if (this.livingMonsters >= TUNING.nests.maxAlivePerNest * this.nests.length) continue;
      this.spawnMonster(nest);
    }
  }

  /**
   * How fast a nest is producing monsters right now.
   *
   * This single function is the game's entire escalation curve: the longer a
   * nest is left alone, the closer its interval creeps to the floor. It is what
   * makes standing still forever unsurvivable, exactly as the brief demands.
   */
  private spawnIntervalFor(nest: Nest): number {
    const progress = Math.min(1, nest.ageSeconds / TUNING.nests.escalationOverSeconds);
    // Ease in, so a fresh nest is gentle and a mature one is relentless.
    const eased = progress * progress;
    const interval =
      TUNING.nests.startingSpawnIntervalSeconds +
      (TUNING.nests.fastestSpawnIntervalSeconds - TUNING.nests.startingSpawnIntervalSeconds) * eased;

    // A nest being destroyed fights back. This is the "hold position under heavy
    // attack" the brief asks for -- and it is why clearing one is a decision
    // rather than an errand.
    return nest.beingCaptured
      ? interval / TUNING.capture.spawnMultiplierWhileCapturing
      : interval;
  }

  /** A nest is finished. Pay out, remove it, and let a new one rise elsewhere. */
  private destroyNest(index: number): void {
    const nest = this.nests[index];
    const reward = Math.round(
      TUNING.capture.baseReward + (nest.ageSeconds / 60) * TUNING.capture.rewardPerMinuteAlive
    );

    this.entities.release(nest.entityId);
    this.nests.splice(index, 1);

    // The world does not stay quiet. A replacement rises somewhere else, which
    // is what keeps the loop turning.
    const spot = this.findOpenSpot(
      seededRandom(nest.seed + Math.round(this.runTimeSeconds)),
      TUNING.nests.minDistanceMetres,
      TUNING.nests.maxDistanceMetres
    );
    if (spot) {
      const entityId = this.entities.spawn(
        EntityKind.NEST,
        this.collision.toLng(spot.x),
        this.collision.toLat(spot.y),
        TUNING.nests.radiusMetres
      );
      if (entityId >= 0) {
        this.nests.push({
          x: spot.x,
          y: spot.y,
          ageSeconds: 0,
          spawnTimer: TUNING.nests.startingSpawnIntervalSeconds,
          entityId,
          seed: nest.seed + 104729,
          captureProgress: 0,
          beingCaptured: false,
          awake: false,
        });
      }
    }

    this.events.onNestCleared(reward);
  }

  /** The nest currently being cleared, if any, for the progress ring. */
  capturingNest(): Nest | null {
    for (const nest of this.nests) {
      if (nest.beingCaptured || nest.captureProgress > 0) return nest;
    }
    return null;
  }

  /** How far the nearest nest is from your REAL position, in metres. */
  nearestNestDistance(): number {
    let best = Infinity;
    for (const nest of this.nests) {
      best = Math.min(best, Math.hypot(nest.x - this.anchorX, nest.y - this.anchorY));
    }
    return best;
  }

  private spawnMonster(nest: Nest): void {
    const types = TUNING.monsters.types;

    // Weighted pick, so swarmers are common and brutes are not.
    let totalWeight = 0;
    for (const type of types) totalWeight += type.weight;
    let roll = this.random() * totalWeight;
    let variant = 0;
    for (let i = 0; i < types.length; i++) {
      roll -= types[i].weight;
      if (roll <= 0) {
        variant = i;
        break;
      }
    }

    // Appear just outside the nest, never inside a wall.
    // Early in a run, send them out already partway here -- otherwise the first
    // proper wave is a minute of walking away and the street is empty.
    const warmingUp =
      this.runTimeSeconds < TUNING.nests.warmupSeconds &&
      this.random() < TUNING.nests.warmupShare;

    // Appear on a road if we are keeping to the roads, so a monster does not
    // begin its life in somebody's garden with nowhere legal to walk.
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = warmingUp
        ? Math.atan2(nest.y - this.anchorY, nest.x - this.anchorX) +
          (this.random() - 0.5) * (1.6 + attempt * 0.3)
        : this.random() * Math.PI * 2;

      const distance = warmingUp
        ? TUNING.nests.warmupMinMetres +
          this.random() * (TUNING.nests.warmupMaxMetres - TUNING.nests.warmupMinMetres)
        : TUNING.nests.radiusMetres + 1 + this.random() * (4 + attempt * 3);

      const x = warmingUp ? this.anchorX + Math.cos(angle) * distance : nest.x + Math.cos(angle) * distance;
      const y = warmingUp ? this.anchorY + Math.sin(angle) * distance : nest.y + Math.sin(angle) * distance;
      if (!this.collision.hasClearance(x, y, 1.5)) continue;
      if (TUNING.navigation.streetsOnly && this.flowField.streetsAreUsable() && !this.flowField.isOnStreetAt(x, y)) {
        continue;
      }
      this.spawnMonsterAt(variant, x, y);
      return;
    }
  }

  /** Create one monster of a given kind at an exact spot. */
  private spawnMonsterAt(variant: number, x: number, y: number): void {
    const type = TUNING.monsters.types[variant];

    const id = this.entities.spawn(
      EntityKind.MONSTER,
      this.collision.toLng(x),
      this.collision.toLat(y),
      type.radiusMetres,
      type.colour
    );
    if (id < 0) return;

    this.entities.health[id] = type.health;
    this.entities.maxHealth[id] = type.health;
    this.entities.speed[id] = type.speedMps;
    this.entities.damage[id] = type.damagePerSecond;
    this.entities.variant[id] = variant;
    this.entities.value[id] = type.xp;
    this.entities.cooldown[id] = 0;
    this.livingMonsters++;
  }

  /* ------------------------------------------------------------------ */
  /* Monsters                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * File every monster into a grid square, so that pushing them apart only ever
   * compares neighbours instead of every pair. With 400 monsters, every-pair
   * would be 80,000 comparisons a frame; this is about six per monster.
   */
  private rebuildCrowdGrid(): void {
    this.crowdHeads.fill(-1);
    const store = this.entities;

    for (let id = 0; id < store.usedSlots; id++) {
      if (!store.alive[id] || store.kind[id] !== EntityKind.MONSTER) continue;
      const x = this.collision.toLocalX(store.lng[id]);
      const y = this.collision.toLocalY(store.lat[id]);
      const cell = this.crowdCellOf(x, y);
      if (cell < 0) continue;
      this.crowdNext[id] = this.crowdHeads[cell];
      this.crowdHeads[cell] = id;
    }
  }

  private crowdCellOf(x: number, y: number): number {
    const cx = Math.floor(x / CROWD_CELL_METRES) + CROWD_GRID_SIZE / 2;
    const cy = Math.floor(y / CROWD_CELL_METRES) + CROWD_GRID_SIZE / 2;
    if (cx < 0 || cy < 0 || cx >= CROWD_GRID_SIZE || cy >= CROWD_GRID_SIZE) return -1;
    return cy * CROWD_GRID_SIZE + cx;
  }

  private updateMonsters(deltaSeconds: number, playerX: number, playerY: number): void {
    const store = this.entities;
    const types = TUNING.monsters.types;
    this.contactDamageThisFrame = 0;

    for (let id = 0; id < store.usedSlots; id++) {
      if (!store.alive[id] || store.kind[id] !== EntityKind.MONSTER) continue;

      if (store.hitFlash[id] > 0) {
        store.hitFlash[id] = Math.max(0, store.hitFlash[id] - deltaSeconds);
      }

      const x = this.collision.toLocalX(store.lng[id]);
      const y = this.collision.toLocalY(store.lat[id]);

      const toPlayerX = playerX - x;
      const toPlayerY = playerY - y;
      const distance = Math.hypot(toPlayerX, toPlayerY);

      // Wandered too far to matter. Let it go rather than simulate it forever.
      if (distance > TUNING.monsters.despawnBeyondMetres) {
        this.killMonster(id, false);
        continue;
      }

      const type = types[store.variant[id]];

      /* --- shooters stop at range and fire, if they can see you --- */
      const isShooter = type.rangeMetres !== undefined;
      let wantsToMove = true;

      if (isShooter) {
        store.cooldown[id] = Math.max(0, store.cooldown[id] - deltaSeconds);
        const inRange = distance < (type.rangeMetres ?? 0);
        const canSee = inRange && !this.collision.segmentBlocked(x, y, playerX, playerY);

        if (canSee) {
          wantsToMove = false;
          if (store.cooldown[id] <= 0) {
            store.cooldown[id] = type.reloadSeconds ?? 2;
            this.spawnEnemyShot(x, y, toPlayerX / distance, toPlayerY / distance, type);
          }
        }
        // If it cannot see you it closes in -- which means breaking line of
        // sight behind a real building genuinely works, and is the reason this
        // monster type exists at all.
      }

      let moveX = 0;
      let moveY = 0;

      if (wantsToMove) {
        // Follow the shared arrows around the buildings.
        if (this.flowField.sample(x, y, this.step)) {
          moveX = this.step.x;
          moveY = this.step.y;
        } else if (distance > 0.001) {
          moveX = toPlayerX / distance;
          moveY = toPlayerY / distance;
        }
      }

      /* --- push apart from the crowd --- */
      const separation = this.separationFor(id, x, y, store.radiusMetres[id]);
      moveX += separation.x * TUNING.monsters.separationStrength * 0.1;
      moveY += separation.y * TUNING.monsters.separationStrength * 0.1;

      const length = Math.hypot(moveX, moveY);
      if (length > 0.001) {
        moveX /= length;
        moveY /= length;
      }

      const stepSize = store.speed[id] * deltaSeconds;
      let nextX = x + moveX * stepSize;
      let nextY = y + moveY * stepSize;

      // Walls apply to monsters exactly as they do to the player.
      this.collision.resolveCircle(nextX, nextY, store.radiusMetres[id] * 0.6, this.resolved, x, y);
      nextX = this.resolved.x;
      nextY = this.resolved.y;

      /* --- notice if we are jammed, and shove sideways --- */
      const progress = Math.hypot(nextX - x, nextY - y);
      if (wantsToMove && progress < stepSize * 0.3) {
        store.stuckFor[id] += deltaSeconds;
        if (store.stuckFor[id] > TUNING.monsters.unstickAfterSeconds) {
          // Slide along the wall rather than pressing into it.
          const sideX = -moveY;
          const sideY = moveX;
          const nudge = stepSize * 2;
          const tryX = x + sideX * nudge;
          const tryY = y + sideY * nudge;
          this.collision.resolveCircle(tryX, tryY, store.radiusMetres[id] * 0.6, this.resolved, x, y);
          nextX = this.resolved.x;
          nextY = this.resolved.y;
          store.stuckFor[id] = 0;
        }
      } else {
        store.stuckFor[id] = 0;
      }

      store.lng[id] = this.collision.toLng(nextX);
      store.lat[id] = this.collision.toLat(nextY);

      /* --- touching the player hurts --- */
      if (store.damage[id] > 0) {
        const touchDistance = store.radiusMetres[id] + 2.2;
        if (Math.hypot(playerX - nextX, playerY - nextY) < touchDistance) {
          // Gathered up and capped below, rather than applied one monster at a
          // time. Sixty of them touching at once is a swarm closing in, not
          // sixty separate accidents.
          this.contactDamageThisFrame += store.damage[id] * deltaSeconds;
        }
      }
    }
  }

  /** Which way is this monster being crowded? Returns a rough push direction. */
  private separationFor(
    self: EntityId,
    x: number,
    y: number,
    radius: number
  ): { x: number; y: number } {
    const store = this.entities;
    let pushX = 0;
    let pushY = 0;

    const cx = Math.floor(x / CROWD_CELL_METRES) + CROWD_GRID_SIZE / 2;
    const cy = Math.floor(y / CROWD_CELL_METRES) + CROWD_GRID_SIZE / 2;

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const gx = cx + ox;
        const gy = cy + oy;
        if (gx < 0 || gy < 0 || gx >= CROWD_GRID_SIZE || gy >= CROWD_GRID_SIZE) continue;

        let other = this.crowdHeads[gy * CROWD_GRID_SIZE + gx];
        while (other !== -1) {
          if (other !== self) {
            const dx = x - this.collision.toLocalX(store.lng[other]);
            const dy = y - this.collision.toLocalY(store.lat[other]);
            const wanted = radius + store.radiusMetres[other];
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared < wanted * wanted && distanceSquared > 0.0001) {
              const distance = Math.sqrt(distanceSquared);
              const strength = (wanted - distance) / wanted;
              pushX += (dx / distance) * strength;
              pushY += (dy / distance) * strength;
            }
          }
          other = this.crowdNext[other];
        }
      }
    }

    return { x: pushX, y: pushY };
  }

  /* ------------------------------------------------------------------ */
  /* Weapons -- all of which fire themselves                             */
  /* ------------------------------------------------------------------ */

  private fireWeapons(deltaSeconds: number, playerX: number, playerY: number): void {
    for (const weapon of this.loadout.weapons) {
      weapon.cooldown -= deltaSeconds;

      switch (weapon.id) {
        case WeaponId.ORBIT:
          // Not a projectile at all: blades that live around you permanently.
          weapon.spin += deltaSeconds * 2.2;
          this.tickOrbit(weapon.level, weapon.spin, playerX, playerY, deltaSeconds);
          continue;

        case WeaponId.PULSE:
          if (weapon.cooldown <= 0) {
            weapon.cooldown = 3.4 / this.loadout.fireRateMultiplier;
            this.firePulse(weapon.level, playerX, playerY);
          }
          continue;

        default:
          if (weapon.cooldown <= 0) {
            const fired = this.fireAimedWeapon(weapon.id, weapon.level, playerX, playerY);
            weapon.cooldown = fired
              ? this.intervalFor(weapon.id) / this.loadout.fireRateMultiplier
              : 0.15; // nothing in range: check again shortly
          }
      }
    }
  }

  private intervalFor(id: string): number {
    if (id === WeaponId.SCATTER) return 1.1;
    if (id === WeaponId.LANCE) return 1.7;
    return TUNING.weapons.startingBoltIntervalSeconds;
  }

  private rangeFor(id: string): number {
    const base = TUNING.weapons.startingBoltRangeMetres;
    if (id === WeaponId.SCATTER) return base * 0.55;
    if (id === WeaponId.LANCE) return base * 1.35;
    return base;
  }

  /**
   * Reach after upgrades, never past what the player can actually see.
   * The cap is the whole point -- firing at an unseen target reads as the game
   * wasting shots on nothing.
   */
  private cappedRange(id: string): number {
    return Math.min(
      this.rangeFor(id) * this.loadout.rangeMultiplier,
      TUNING.weapons.maxRangeMetres
    );
  }

  /** Fire something that picks a target. Returns false if nothing is in range. */
  private fireAimedWeapon(
    id: string,
    level: number,
    playerX: number,
    playerY: number
  ): boolean {
    const range = this.cappedRange(id);
    const target = this.nearestMonster(playerX, playerY, range);
    if (target < 0) return false;

    const store = this.entities;
    const tx = this.collision.toLocalX(store.lng[target]);
    const ty = this.collision.toLocalY(store.lat[target]);
    const dx = tx - playerX;
    const dy = ty - playerY;
    const distance = Math.hypot(dx, dy) || 1;
    const aimX = dx / distance;
    const aimY = dy / distance;

    const damage = this.damageFor(id, level) * this.loadout.damageMultiplier;
    const pierce = this.loadout.pierce + (id === WeaponId.LANCE ? 4 + level : 0);

    if (id === WeaponId.SCATTER) {
      const shots = 4 + level + this.loadout.extraProjectiles;
      const spread = 0.55;
      for (let i = 0; i < shots; i++) {
        const offset = (i / Math.max(1, shots - 1) - 0.5) * spread * 2;
        const angle = Math.atan2(aimY, aimX) + offset;
        this.spawnPlayerShot(playerX, playerY, Math.cos(angle), Math.sin(angle), damage, pierce, range, 34);
      }
      return true;
    }

    const shots = 1 + this.loadout.extraProjectiles;
    for (let i = 0; i < shots; i++) {
      // Fan extra shots slightly so they do not stack into one.
      const offset = shots === 1 ? 0 : (i / (shots - 1) - 0.5) * 0.32;
      const angle = Math.atan2(aimY, aimX) + offset;
      this.spawnPlayerShot(
        playerX,
        playerY,
        Math.cos(angle),
        Math.sin(angle),
        damage,
        pierce,
        range,
        id === WeaponId.LANCE ? 58 : TUNING.weapons.startingBoltSpeedMps
      );
    }
    return true;
  }

  private damageFor(id: string, level: number): number {
    const base = TUNING.weapons.startingBoltDamage;
    if (id === WeaponId.SCATTER) return base * 0.55 * (1 + (level - 1) * 0.3);
    if (id === WeaponId.LANCE) return base * 1.5 * (1 + (level - 1) * 0.35);
    return base * (1 + (level - 1) * 0.32);
  }

  /**
   * Blades circling the player, cutting whatever comes close.
   *
   * They used to damage only things at the exact ring the blades ride on, which
   * looked right and played terribly: anything that walked THROUGH the ring and
   * reached the player was never touched again. Measured with the character
   * built entirely around this weapon -- four monsters standing on top of the
   * player, blades sweeping empty air, zero kills, dead in 45 seconds.
   *
   * It now cuts anything inside the circle, which is what "blades circle you"
   * plainly means. The target limit is what stops it becoming an unbreakable
   * wall, and that is still there.
   */
  private tickOrbit(
    level: number,
    spin: number,
    playerX: number,
    playerY: number,
    deltaSeconds: number
  ): void {
    const blades = 2 + level;
    const reach = Math.min(14 * this.loadout.rangeMultiplier, TUNING.weapons.maxRangeMetres);
    const damage =
      TUNING.weapons.startingBoltDamage * 1.6 * blades * this.loadout.damageMultiplier * deltaSeconds;

    // `spin` only drives how it will be drawn later; the cutting is the circle.
    void spin;

    this.damageMonstersAround(playerX, playerY, reach, damage, blades * (1 + level));
  }

  /** A ring of force pushing out of the player. */
  private firePulse(level: number, playerX: number, playerY: number): void {
    const radius = Math.min((14 + level * 3) * this.loadout.rangeMultiplier, TUNING.weapons.maxRangeMetres);
    const damage = TUNING.weapons.startingBoltDamage * (1.1 + level * 0.4) * this.loadout.damageMultiplier;
    // A shockwave clears a crowd, not an army. Levelling widens both.
    this.damageMonstersAround(playerX, playerY, radius, damage, 6 + level * 4);
  }

  /**
   * Hurt monsters near a point, but only so many of them.
   *
   * THE TARGET LIMIT IS THE WHOLE POINT. Without it an area weapon hits
   * everything inside its radius at once, so its total damage grows with the
   * size of the crowd -- which makes it a perfect wall. Measured: a ring of
   * monsters formed at 12-15 m and never closed, however many arrived, and a
   * standing player simply could not be killed.
   *
   * A weapon that can only strike a handful of things at a time can be
   * overwhelmed by numbers, which is exactly what a swarm is for.
   */
  private damageMonstersAround(
    x: number,
    y: number,
    radius: number,
    damage: number,
    maxTargets: number
  ): void {
    const store = this.entities;
    const radiusSquared = radius * radius;
    let hit = 0;

    for (let id = 0; id < store.usedSlots && hit < maxTargets; id++) {
      if (!store.alive[id] || store.kind[id] !== EntityKind.MONSTER) continue;
      const dx = this.collision.toLocalX(store.lng[id]) - x;
      const dy = this.collision.toLocalY(store.lat[id]) - y;
      if (dx * dx + dy * dy > radiusSquared) continue;
      this.hurtMonster(id, damage);
      hit++;
    }
  }

  private nearestMonster(x: number, y: number, withinMetres: number): EntityId {
    const store = this.entities;
    let best = -1;
    let bestDistanceSquared = withinMetres * withinMetres;

    for (let id = 0; id < store.usedSlots; id++) {
      if (!store.alive[id] || store.kind[id] !== EntityKind.MONSTER) continue;
      const dx = this.collision.toLocalX(store.lng[id]) - x;
      const dy = this.collision.toLocalY(store.lat[id]) - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        best = id;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Projectiles                                                         */
  /* ------------------------------------------------------------------ */

  private spawnPlayerShot(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    damage: number,
    pierce: number,
    range: number,
    speed: number
  ): void {
    const id = this.entities.spawn(
      EntityKind.PROJECTILE,
      this.collision.toLng(x),
      this.collision.toLat(y),
      1.1
    );
    if (id < 0) return;
    this.entities.velocityEast[id] = dirX * speed;
    this.entities.velocityNorth[id] = dirY * speed;
    this.entities.damage[id] = damage;
    // "health" doubles as how many more monsters this can pass through.
    this.entities.health[id] = 1 + pierce;
    this.entities.lifetime[id] = Math.min(TUNING.weapons.projectileLifetimeSeconds, range / speed + 0.1);
    this.entities.variant[id] = 0; // 0 = the player's
  }

  private spawnEnemyShot(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    type: { shotSpeedMps?: number; shotDamage?: number }
  ): void {
    const speed = type.shotSpeedMps ?? 24;
    const id = this.entities.spawn(
      EntityKind.PROJECTILE,
      this.collision.toLng(x),
      this.collision.toLat(y),
      1.3,
      [255, 120, 60, 255]
    );
    if (id < 0) return;
    this.entities.velocityEast[id] = dirX * speed;
    this.entities.velocityNorth[id] = dirY * speed;
    this.entities.damage[id] = type.shotDamage ?? 8;
    this.entities.health[id] = 1;
    this.entities.lifetime[id] = 2.5;
    this.entities.variant[id] = 1; // 1 = the enemy's
  }

  private updateProjectiles(deltaSeconds: number): void {
    const store = this.entities;

    for (let id = 0; id < store.usedSlots; id++) {
      if (!store.alive[id] || store.kind[id] !== EntityKind.PROJECTILE) continue;

      store.lifetime[id] -= deltaSeconds;
      if (store.lifetime[id] <= 0) {
        store.release(id);
        continue;
      }

      const x = this.collision.toLocalX(store.lng[id]);
      const y = this.collision.toLocalY(store.lat[id]);
      const nextX = x + store.velocityEast[id] * deltaSeconds;
      const nextY = y + store.velocityNorth[id] * deltaSeconds;

      // Buildings stop shots. This is what makes hiding behind a real house work.
      if (this.collision.segmentBlocked(x, y, nextX, nextY)) {
        store.release(id);
        continue;
      }

      store.lng[id] = this.collision.toLng(nextX);
      store.lat[id] = this.collision.toLat(nextY);

      if (store.variant[id] === 0) {
        this.playerShotHitCheck(id, nextX, nextY);
      }
      // Enemy shots are checked against the player by the caller, below.
    }
  }

  /** Did one of our shots hit something? */
  private playerShotHitCheck(id: EntityId, x: number, y: number): void {
    const store = this.entities;
    for (let other = 0; other < store.usedSlots; other++) {
      if (!store.alive[other] || store.kind[other] !== EntityKind.MONSTER) continue;
      const dx = this.collision.toLocalX(store.lng[other]) - x;
      const dy = this.collision.toLocalY(store.lat[other]) - y;
      const reach = store.radiusMetres[other] + store.radiusMetres[id];
      if (dx * dx + dy * dy > reach * reach) continue;

      this.hurtMonster(other, store.damage[id]);
      store.health[id] -= 1;
      if (store.health[id] <= 0) {
        store.release(id);
        return;
      }
    }
  }

  /** Check enemy shots against the player. Called with the player position. */
  checkEnemyShots(playerX: number, playerY: number): void {
    const store = this.entities;
    for (let id = 0; id < store.usedSlots; id++) {
      if (!store.alive[id] || store.kind[id] !== EntityKind.PROJECTILE) continue;
      if (store.variant[id] !== 1) continue;
      const dx = this.collision.toLocalX(store.lng[id]) - playerX;
      const dy = this.collision.toLocalY(store.lat[id]) - playerY;
      if (dx * dx + dy * dy < 9) {
        this.damagePlayer(store.damage[id]);
        store.release(id);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Damage, death, experience                                           */
  /* ------------------------------------------------------------------ */

  private hurtMonster(id: EntityId, damage: number): void {
    const store = this.entities;
    store.health[id] -= damage;
    store.hitFlash[id] = TUNING.monsters.hitFlashSeconds;
    if (store.health[id] <= 0) this.killMonster(id, true);
  }

  private killMonster(id: EntityId, dropXp: boolean): void {
    const store = this.entities;

    if (dropXp) {
      this.monstersKilled++;

      // Drop it somewhere reachable. A monster killed against a wall used to
      // leave its reward INSIDE the building, where nobody can ever walk, and
      // it simply sat there until it rotted.
      const deathX = this.collision.toLocalX(store.lng[id]);
      const deathY = this.collision.toLocalY(store.lat[id]);
      this.collision.resolveCircle(deathX, deathY, 1.6, this.resolved, deathX, deathY);
      const dropLng = this.collision.toLng(this.resolved.x);
      const dropLat = this.collision.toLat(this.resolved.y);

      const orb = this.entities.spawn(EntityKind.XP_ORB, dropLng, dropLat, 1.3);
      if (orb >= 0) {
        this.entities.value[orb] = store.value[id];
        this.entities.lifetime[orb] = TUNING.player.lootLifetimeSeconds;
      }

      // Money is rarer than experience, and buys things that outlast the run.
      if (this.random() < TUNING.player.coinDropChance + this.coinBonus) {
        const coin = this.entities.spawn(EntityKind.COIN, dropLng, dropLat, 1.3);
        if (coin >= 0) {
          this.entities.value[coin] = TUNING.player.coinValue;
          this.entities.lifetime[coin] = TUNING.player.lootLifetimeSeconds;
        }
      }
    }

    this.livingMonsters--;
    store.release(id);
  }

  private damagePlayer(amount: number): void {
    if (this.invulnerableFor > 0) return;
    const taken = amount * (1 - this.loadout.armour);
    this.health -= taken;

    // Only a real hit triggers the grace period, not the steady graze of a
    // crowd -- otherwise standing in a swarm would be free.
    if (taken > 3) this.invulnerableFor = TUNING.player.invulnerableAfterHitSeconds;

    if (this.health <= 0 && !this.dead) {
      this.health = 0;
      this.dead = true;
      this.events.onDeath();
    }
  }

  /**
   * Loot lies where it fell and is collected by walking over it.
   *
   * It used to drift toward the player, which made collecting automatic. By
   * request it no longer does: you go and get it, exactly as in the game this
   * borrows from. Since walking is now the only way to move, this quietly makes
   * a run's reward depend on covering ground rather than standing well.
   */
  private updateOrbs(deltaSeconds: number, playerX: number, playerY: number): void {
    const store = this.entities;
    const pickupRadius = TUNING.player.pickupRadiusMetres * this.loadout.pickupRadiusMultiplier;

    for (let id = 0; id < store.usedSlots; id++) {
      if (!store.alive[id]) continue;
      const kind = store.kind[id];
      if (kind !== EntityKind.XP_ORB && kind !== EntityKind.COIN) continue;

      store.lifetime[id] -= deltaSeconds;
      if (store.lifetime[id] <= 0) {
        store.release(id);
        continue;
      }

      const x = this.collision.toLocalX(store.lng[id]);
      const y = this.collision.toLocalY(store.lat[id]);
      const dx = playerX - x;
      const dy = playerY - y;
      const distance = Math.hypot(dx, dy);

      // Loot no longer comes to you. Walk over it, or leave it lying there.
      //
      // This reverses an earlier decision, and the reason is worth keeping: back
      // when the character was on a 28 m rope it genuinely could not reach most
      // of what it killed, so experience had to fly in or runs produced no
      // levels at all. Without the rope you are free to walk anywhere, so
      // collecting is once again something you do rather than something that
      // happens to you -- which is how the game this borrows from works.
      // Within reach it hops to you over the last couple of metres, rather than
      // needing to be walked over exactly. You still have to come and get it --
      // the sweep is the same width -- but nothing is missed by half a stride,
      // and a coin resting against a kerb is no longer lost.
      if (distance < pickupRadius) {
        if (distance > 1.5) {
          const pull = TUNING.player.finalSnapSpeedMps * deltaSeconds;
          store.lng[id] = this.collision.toLng(x + (dx / distance) * pull);
          store.lat[id] = this.collision.toLat(y + (dy / distance) * pull);
          continue;
        }
        if (kind === EntityKind.COIN) this.coinsCollected += store.value[id];
        else this.gainXp(store.value[id]);
        store.release(id);
      }
    }
  }

  private gainXp(amount: number): void {
    this.xp += amount;

    while (this.xp >= this.xpForNextLevel) {
      this.xp -= this.xpForNextLevel;
      this.level++;
      this.xpForNextLevel = Math.round(
        TUNING.levelling.firstLevelXp * Math.pow(TUNING.levelling.xpGrowthPerLevel, this.level - 1)
      );
      // Owed, not offered. Gaining two levels from one pickup must hand out two
      // cards -- my first version raised the flag twice and showed one screen,
      // silently swallowing the reward.
      this.pendingLevelUps++;
    }

    this.offerNextLevelUpIfIdle();
  }

  /**
   * Show the next owed card choice, if one is owed and none is already open.
   * Called after gaining experience and again after each choice is made.
   */
  offerNextLevelUpIfIdle(): void {
    if (this.awaitingCardChoice || this.pendingLevelUps <= 0) return;
    this.pendingLevelUps--;
    this.awaitingCardChoice = true;
    this.events.onLevelUp(this.level);
  }

  /** How fierce things are right now, 0 to 1. For the HUD and for tuning. */
  pressure(): number {
    let worst = 0;
    for (const nest of this.nests) {
      worst = Math.max(worst, Math.min(1, nest.ageSeconds / TUNING.nests.escalationOverSeconds));
    }
    return worst;
  }

  aliveMonsters(): number {
    return this.livingMonsters;
  }

  /**
   * How far away the nearest monster is, in metres.
   *
   * The camera needs this rather than a simple "are there any monsters",
   * because monsters exist from the moment a nest wakes up -- a hundred metres
   * away and completely invisible. Zooming in for those left the player staring
   * at an empty street while the game happened off screen.
   */
  nearestMonsterDistance(playerX: number, playerY: number): number {
    const store = this.entities;
    let best = Infinity;
    for (let id = 0; id < store.usedSlots; id++) {
      if (!store.alive[id] || store.kind[id] !== EntityKind.MONSTER) continue;
      const dx = this.collision.toLocalX(store.lng[id]) - playerX;
      const dy = this.collision.toLocalY(store.lat[id]) - playerY;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return best === Infinity ? Infinity : Math.sqrt(best);
  }
}
