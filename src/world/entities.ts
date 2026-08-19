/**
 * THE ENTITY STORE -- every moving thing in the game world.
 * ========================================================
 * Monsters, projectiles, pickups, nests and the player all live in here.
 *
 * WHY THIS FILE LOOKS SO ODD
 * A normal programmer would write a list of objects, one object per monster.
 * We deliberately do not, for two reasons that decide whether this game runs at
 * 60 frames per second on a mid-range Android or not:
 *
 * 1. OBJECT POOLING. Creating and throwing away hundreds of monsters every
 *    second forces the browser to keep tidying up memory, and that tidying
 *    happens in a sudden pause you see as a stutter. So we create the maximum
 *    number ONCE, at the start, and then just mark them alive or dead. Nothing
 *    is ever created or destroyed while the game is running.
 *
 * 2. SEPARATE ARRAYS INSTEAD OF OBJECTS. Rather than 400 monster objects each
 *    holding its own position, we keep one long list of every X, one long list
 *    of every Y, and so on. This is uglier to read but far faster to loop over,
 *    and -- more importantly -- it is exactly the shape the graphics card wants,
 *    so we can hand it straight over with no conversion at all.
 *
 * If you are reading this to learn: the pattern is called "structure of arrays",
 * and it is standard practice in games. It looks like premature cleverness until
 * you have 400 monsters, at which point it is the difference between playable
 * and not.
 */

/** What sort of thing an entity is. Numbers, not text, so comparisons are cheap. */
export const EntityKind = {
  PLAYER: 0,
  MONSTER: 1,
  PROJECTILE: 2,
  PICKUP: 3,
  NEST: 4,
  /** Only used in M2, to prove things stay stuck to the map. */
  TEST_MARKER: 5,
  /** Experience dropped by a dead monster. Levels you up during a run. */
  XP_ORB: 6,
  /**
   * Money dropped by a dead monster. Kept forever and spent on permanent
   * upgrades -- deliberately a different thing from experience, so a good run
   * and long-term progress are earned separately.
   */
  COIN: 7,
} as const;

export type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

/** Placeholder colours. Real art comes much later -- these are just shapes. */
export const KIND_COLOURS: Record<number, [number, number, number, number]> = {
  [EntityKind.PLAYER]: [59, 130, 246, 255], // blue -- the one dot, and it is you
  [EntityKind.MONSTER]: [220, 70, 70, 255], // red
  [EntityKind.PROJECTILE]: [250, 220, 120, 255], // pale yellow
  [EntityKind.PICKUP]: [120, 220, 140, 255], // green
  [EntityKind.NEST]: [160, 80, 220, 255], // purple
  [EntityKind.TEST_MARKER]: [180, 180, 190, 200], // grey -- a debug aid, never loot
  [EntityKind.XP_ORB]: [120, 220, 255, 255], // pale blue -- experience
  [EntityKind.COIN]: [255, 200, 50, 255], // gold -- money
};

/** A handle to one entity. It is just its slot number in the arrays. */
export type EntityId = number;

export class EntityStore {
  readonly capacity: number;

  /* Position, kept as real longitude/latitude so game logic can stay in the
   * real world. Float64 because Float32 is not precise enough for coordinates --
   * at Float32 precision a position would jitter by several metres. */
  readonly lng: Float64Array;
  readonly lat: Float64Array;

  /* Velocity in metres per second, east and north. */
  readonly velocityEast: Float32Array;
  readonly velocityNorth: Float32Array;

  /** How big the thing is, in real metres. */
  readonly radiusMetres: Float32Array;

  /* --- combat --- */
  readonly health: Float32Array;
  readonly maxHealth: Float32Array;
  /** Movement speed in metres per second. */
  readonly speed: Float32Array;
  /** Damage dealt on touching the player, per second of contact. */
  readonly damage: Float32Array;
  /** Which flavour of monster, indexing into the monster table. */
  readonly variant: Uint8Array;
  /** Experience granted when killed, or carried by a pickup. */
  readonly value: Float32Array;
  /** Seconds left before this disappears on its own. 0 means forever. */
  readonly lifetime: Float32Array;
  /** General-purpose timer: reload for shooters, wind-up for spawns. */
  readonly cooldown: Float32Array;
  /**
   * How long this has been failing to make progress, in seconds. Monsters use
   * it to notice they are jammed on a corner and shove themselves sideways.
   */
  readonly stuckFor: Float32Array;
  /**
   * Seconds of flashing left after being hit.
   *
   * Without it there is no way to tell a monster you are hurting from one you
   * are missing entirely -- the swarm just mills about and nothing reads as
   * connecting.
   */
  readonly hitFlash: Float32Array;

  /** Colour, four bytes per entity (red, green, blue, alpha). */
  readonly colour: Uint8Array;

  readonly kind: Uint8Array;

  /** 1 if this slot is in use, 0 if it is free to be handed out again. */
  readonly alive: Uint8Array;

  /** Slots currently free. Taking from the end is the fastest thing we can do. */
  private freeSlots: Int32Array;
  private freeCount: number;

  /** Highest slot ever used, so loops can stop early instead of scanning all of it. */
  private highWaterMark = 0;

  constructor(capacity: number) {
    this.capacity = capacity;

    this.lng = new Float64Array(capacity);
    this.lat = new Float64Array(capacity);
    this.velocityEast = new Float32Array(capacity);
    this.velocityNorth = new Float32Array(capacity);
    this.radiusMetres = new Float32Array(capacity);
    this.health = new Float32Array(capacity);
    this.maxHealth = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
    this.damage = new Float32Array(capacity);
    this.variant = new Uint8Array(capacity);
    this.value = new Float32Array(capacity);
    this.lifetime = new Float32Array(capacity);
    this.cooldown = new Float32Array(capacity);
    this.stuckFor = new Float32Array(capacity);
    this.hitFlash = new Float32Array(capacity);
    this.colour = new Uint8Array(capacity * 4);
    this.kind = new Uint8Array(capacity);
    this.alive = new Uint8Array(capacity);

    // Fill the free list with every slot, last one first.
    this.freeSlots = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.freeSlots[i] = capacity - 1 - i;
    this.freeCount = capacity;
  }

  /** How many entities are alive right now. */
  get aliveCount(): number {
    return this.capacity - this.freeCount;
  }

  /** The range that loops need to cover. Everything above this is untouched. */
  get usedSlots(): number {
    return this.highWaterMark;
  }

  /**
   * Bring one entity to life. Returns its id, or -1 if the pool is full.
   *
   * Returning -1 rather than growing the pool is deliberate: a full pool means
   * the game is trying to spawn more than we promised the graphics card we would
   * draw, and silently growing would turn a design problem into a frame-rate
   * problem. The caller should decide what to do about it.
   */
  spawn(
    kind: EntityKindValue,
    lng: number,
    lat: number,
    radiusMetres: number,
    colour: [number, number, number, number] = KIND_COLOURS[kind]
  ): EntityId {
    if (this.freeCount === 0) return -1;

    const id = this.freeSlots[--this.freeCount];

    this.lng[id] = lng;
    this.lat[id] = lat;
    this.velocityEast[id] = 0;
    this.velocityNorth[id] = 0;
    this.radiusMetres[id] = radiusMetres;
    this.kind[id] = kind;
    this.alive[id] = 1;

    // Combat fields start blank; whoever spawns this fills in what it needs.
    this.health[id] = 1;
    this.maxHealth[id] = 1;
    this.speed[id] = 0;
    this.damage[id] = 0;
    this.variant[id] = 0;
    this.value[id] = 0;
    this.lifetime[id] = 0;
    this.cooldown[id] = 0;
    this.stuckFor[id] = 0;
    this.hitFlash[id] = 0;

    const c = id * 4;
    this.colour[c] = colour[0];
    this.colour[c + 1] = colour[1];
    this.colour[c + 2] = colour[2];
    this.colour[c + 3] = colour[3];

    if (id >= this.highWaterMark) this.highWaterMark = id + 1;

    return id;
  }

  /** Return an entity to the pool. Nothing is destroyed; the slot is reused. */
  release(id: EntityId): void {
    if (id < 0 || id >= this.capacity || this.alive[id] === 0) return;
    this.alive[id] = 0;
    this.freeSlots[this.freeCount++] = id;
  }

  /** Kill everything. Used when a run ends. */
  releaseAll(): void {
    for (let id = 0; id < this.highWaterMark; id++) {
      if (this.alive[id]) this.release(id);
    }
    this.highWaterMark = 0;
  }

  /** Move one entity to an exact position. */
  setPosition(id: EntityId, lng: number, lat: number): void {
    this.lng[id] = lng;
    this.lat[id] = lat;
  }
}
