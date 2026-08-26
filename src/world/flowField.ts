/**
 * HOW MONSTERS FIND YOU.
 * ======================
 * Hundreds of monsters all want to reach the same place: you. The obvious way --
 * have each one work out its own route around the buildings -- is also the way
 * that kills the frame rate, because that work is repeated hundreds of times for
 * an answer that is nearly identical every time.
 *
 * So we invert it, exactly as the brief asks. ONCE, a few times a second, we
 * work out for the whole neighbourhood: "if you are standing on this spot, which
 * way is the player?" The answer is a grid of arrows -- a FLOW FIELD. Every
 * monster then simply reads the arrow under its feet and walks that way. One
 * calculation serves the entire swarm.
 *
 * The arrows route around real buildings, which is what makes monsters pour down
 * streets and funnel through alleys instead of drifting through walls.
 *
 * HOW THE ARROWS ARE WORKED OUT
 * We flood outward from the player, like water filling a maze, recording how far
 * each square is from them by the shortest walkable route. Each square's arrow
 * then points at whichever neighbour has the lower number. Because the flood
 * cannot pass through buildings, the distances -- and therefore the arrows --
 * follow the streets.
 *
 * WHY IT IS FAST
 * Every square is visited once, and squares are visited in order of distance
 * using a small ring of buckets rather than a sorted list, which is the standard
 * trick when the step costs are small whole numbers. Roughly 40,000 squares get
 * processed in a couple of milliseconds.
 */

import type { CollisionWorld } from './collision';
import type { StreetLine } from './buildingSource';

/**
 * How big each square of the field is, in metres.
 *
 * Coarsened from 3 m. Preferring roads made every route cost several times more
 * to work out -- the flood went from 4 ms to 19 ms, which at four rebuilds a
 * second is a dropped frame four times a second. Fewer, larger squares cost
 * proportionally less, and 4 m is still finer than any alley worth routing down.
 */
const CELL_METRES = 4;

/** How far the field reaches from its centre, in metres. */
const FIELD_RADIUS_METRES = 260;

/** Squares across the whole field. */
const SIZE = Math.ceil((FIELD_RADIUS_METRES * 2) / CELL_METRES);

/* Step costs. Whole numbers so the bucket trick works; 14/10 approximates the
 * diagonal of a square being about 1.41 times its side. */
const STRAIGHT_COST = 10;
const DIAGONAL_COST = 14;
const UNREACHABLE = 0x7fffffff;

/**
 * The dearest a single step can ever be, which sets the size of the bucket ring.
 *
 * THIS CAUGHT ME OUT. The ring works because a square's neighbours always land
 * within one lap of it, so a handful of buckets reused over and over keeps
 * everything in order without sorting. Adding an off-road penalty multiplied
 * step costs by 3.5, so neighbours could land 49 buckets ahead of a 15-bucket
 * ring -- entries wrapped around, were processed out of order, and whole
 * districts came out unreachable. The ring must be at least as long as the
 * dearest possible step.
 */
const MAX_STEP_PENALTY = 8;
/**
 * How many distinct street costs there can be. Street multipliers are rounded
 * into these, so the router can look a step up instead of working it out.
 */
const STREET_TIERS = 8;
/** Tier n means this multiplier. Nothing may exceed MAX_STEP_PENALTY. */
const TIER_MULTIPLIER = [1, 1.15, 1.35, 1.5, 1.7, 2.2, 2.7, 3.2];
const BUCKET_COUNT = DIAGONAL_COST * MAX_STEP_PENALTY + 1;

/**
 * Neighbour offsets: four sides, then four corners.
 *
 * Held as three flat arrays rather than one array of triples on purpose. The
 * tidy-looking version costs a small unpacking step every single time it is
 * read, and this is read about 320,000 times per rebuild -- which measured at
 * 17 ms, more than an entire frame. Flat arrays brought that down sharply.
 */
const NEIGHBOUR_DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const NEIGHBOUR_DY = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const NEIGHBOUR_COST = new Int8Array([
  STRAIGHT_COST, STRAIGHT_COST, STRAIGHT_COST, STRAIGHT_COST,
  DIAGONAL_COST, DIAGONAL_COST, DIAGONAL_COST, DIAGONAL_COST,
]);

/** 1 / sqrt(2), for turning a diagonal step into a unit-length arrow. */
const INV_SQRT2 = 0.7071067811865476;

export class FlowField {
  /** Where the middle of the field sits, in the collision world's metres. */
  private originX = 0;
  private originY = 0;

  /** 1 where a building stands. Worked out once per area, not per update. */
  private blocked = new Uint8Array(SIZE * SIZE);

  /**
   * 1 where there is a road.
   *
   * Walking off-road is made deliberately expensive, so the shortest route is
   * almost always along a street. Without this, monsters take the geometric
   * short cut across yards and car parks -- technically correct, and completely
   * wrong for a game whose whole idea is that your streets are the corridors.
   */
  private onStreet = new Uint8Array(SIZE * SIZE);
  /**
   * Which tier of street each square belongs to, 0 (a main road) to 7 (steps).
   *
   * Kept as a tier rather than a multiplier so the cost of a step stays a
   * LOOKUP. This inner loop runs eight times for every one of ~17,000 squares
   * several times a second; a multiply and a round in there is not free, and the
   * whole rebuild has a 4 ms budget.
   */
  private streetTier = new Uint8Array(SIZE * SIZE);
  /** tier * 8 + direction -> whole-number cost. Filled by rasteriseStreets. */
  private tierStepCost = new Int32Array(STREET_TIERS * 8);

  /** How much dearer a step is when it leaves the road. */
  private offStreetPenalty = 1;

  /**
   * When true, monsters route ALONG roads only and treat everything else as
   * impassable -- which is what "keep them on the pavements" means.
   *
   * Switched off automatically wherever roads are too sparse to route on, so a
   * beach, a park or an unmapped neighbourhood still works. Without that guard
   * this would silently make the whole area unreachable and the game would look
   * broken again, which is a mistake this project has already made twice.
   */
  private streetsOnly = false;

  /** The eight neighbour costs with the penalty already applied and rounded. */
  private offStreetCost = new Int32Array([
    STRAIGHT_COST, STRAIGHT_COST, STRAIGHT_COST, STRAIGHT_COST,
    DIAGONAL_COST, DIAGONAL_COST, DIAGONAL_COST, DIAGONAL_COST,
  ]);

  /** Shortest walkable distance to the player, per square. */
  private distance = new Int32Array(SIZE * SIZE);

  /** The arrow, split into its two parts, each between -1 and 1. */
  private flowX = new Float32Array(SIZE * SIZE);
  private flowY = new Float32Array(SIZE * SIZE);

  /* The bucket queue: squares waiting to be processed, grouped by distance.
   * `queueHead` is the first square in each bucket, and `queueNext` chains the
   * rest -- a linked list held in a flat array, so nothing is allocated while
   * the game is running. */
  private queueHead = new Int32Array(BUCKET_COUNT).fill(-1);
  /**
   * How many squares are waiting, so "is anything left?" is a comparison rather
   * than a scan.
   *
   * With the off-road penalty the costs climb far higher, so the flood walks
   * through thousands of mostly-empty buckets -- and scanning all 113 of them
   * each time cost 18 ms, more than a whole frame. Counting is free.
   */
  private queuedCount = 0;
  private queueNext = new Int32Array(SIZE * SIZE);

  private hasField = false;
  private lastBuildMs = 0;

  /* Statistics for the dev readout. */
  stats = { walkableCells: 0, blockedCells: 0, streetCells: 0, streetsOnly: false, lastBuildMs: 0, lastRasteriseMs: 0 };

  /* ------------------------------------------------------------------ */
  /* Step 1: work out where the buildings are. Once per area.            */
  /* ------------------------------------------------------------------ */

  /**
   * Mark which squares are inside buildings.
   *
   * Deliberately separate from working out the arrows, because buildings only
   * change when you travel to a new area, while the arrows change constantly.
   * Doing this every time would be the single most expensive mistake available.
   */
  rasteriseWalls(collision: CollisionWorld, centreX: number, centreY: number): void {
    const started = performance.now();

    this.originX = centreX;
    this.originY = centreY;
    this.blocked.fill(0);

    let blockedCount = 0;
    for (let cy = 0; cy < SIZE; cy++) {
      for (let cx = 0; cx < SIZE; cx++) {
        const worldX = this.cellToWorldX(cx);
        const worldY = this.cellToWorldY(cy);
        if (collision.isInsideWall(worldX, worldY)) {
          this.blocked[cy * SIZE + cx] = 1;
          blockedCount++;
        }
      }
    }

    this.onStreet.fill(0);
    this.stats.blockedCells = blockedCount;
    this.stats.walkableCells = SIZE * SIZE - blockedCount;
    this.stats.lastRasteriseMs = performance.now() - started;
    this.hasField = false;
  }

  /**
   * Paint the roads onto the grid, so the flood can be told to follow them.
   *
   * Roads arrive as thin lines; a real street is several metres wide and a
   * monster should be able to use any part of it, so each segment is stamped
   * with some width. Done once per area alongside the buildings.
   */
  rasteriseStreets(
    streets: StreetLine[],
    originLng: number,
    originLat: number,
    metresPerLng: number,
    halfWidthMetres: number,
    penalty: number,
    strict: boolean,
    /** Width and cost per street kind. Without it every street is the same. */
    kinds?: {
      byKind: Record<string, { halfWidth: number; cost: number }>;
      fallback: { halfWidth: number; cost: number };
      notWalkable: string[];
    }
  ): void {
    this.offStreetPenalty = Math.min(penalty, MAX_STEP_PENALTY);
    for (let n = 0; n < 8; n++) {
      this.offStreetCost[n] = Math.round(NEIGHBOUR_COST[n] * this.offStreetPenalty);
    }
    // The lookup the router uses instead of doing arithmetic per step.
    for (let tier = 0; tier < STREET_TIERS; tier++) {
      const multiplier = Math.min(TIER_MULTIPLIER[tier], MAX_STEP_PENALTY);
      for (let n = 0; n < 8; n++) {
        this.tierStepCost[tier * 8 + n] = Math.round(NEIGHBOUR_COST[n] * multiplier);
      }
    }
    this.streetTier.fill(0);
    let painted = 0;

    /** Nearest tier for a multiplier, so the table stays small. */
    const tierFor = (cost: number): number => {
      let best = 0;
      let bestGap = Infinity;
      for (let t = 0; t < STREET_TIERS; t++) {
        const gap = Math.abs(TIER_MULTIPLIER[t] - cost);
        if (gap < bestGap) {
          bestGap = gap;
          best = t;
        }
      }
      return best;
    };

    // A set rather than an array: this is asked once per street, and there are
    // several thousand of them.
    const notWalkable = kinds ? new Set(kinds.notWalkable) : null;

    const stampRadius = Math.max(1, Math.round(halfWidthMetres / CELL_METRES));

    for (const street of streets) {
      /*
       * A BRIDGE BEATS THE WATER UNDERNEATH IT.
       *
       * Everything below refuses to paint a road onto a blocked square, which is
       * right for a building and catastrophic for a bridge: water is solid, so a
       * river became an absolute barrier that neither the swarm nor the player
       * could ever cross. Measured on the Han river -- twelve solid points out of
       * twenty-five sampled across it, and not one carrying a road, in a city
       * with six bridges.
       *
       * So a bridge unblocks what it crosses. Narrowly: `bridgeRadius` is
       * deliberately tighter than an ordinary road stamp, because the whole
       * character of a bridge is that it is the ONLY way across and everything
       * has to funnel onto it.
       */
      const isBridge = street.bridge === true;

      // What kind of street is this, and what does the map say it is like?
      const rule = kinds ? (kinds.byKind[street.kind] ?? kinds.fallback) : null;

      // A railway is not a footpath and a runway is not a high street. Both turn
      // up in the street layer around Da Nang, and letting a swarm march down a
      // runway would be a strange thing to ship.
      if (notWalkable !== null && notWalkable.has(street.kind)) continue;

      const tier = rule ? tierFor(rule.cost) : 0;
      const radius = isBridge
        ? Math.max(1, Math.round((halfWidthMetres * 0.8) / CELL_METRES))
        : rule
          ? Math.max(1, Math.round(rule.halfWidth / CELL_METRES))
          : stampRadius;
      const points = street.coords;
      for (let i = 0; i + 3 < points.length; i += 2) {
        const ax = (points[i] - originLng) * metresPerLng;
        const ay = (points[i + 1] - originLat) * 111320;
        const bx = (points[i + 2] - originLng) * metresPerLng;
        const by = (points[i + 3] - originLat) * 111320;

        // Walk the segment in steps of about one square.
        const length = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(length / CELL_METRES));

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          const cx = this.worldToCellX(px);
          const cy = this.worldToCellY(py);
          if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;

          for (let ox = -radius; ox <= radius; ox++) {
            for (let oy = -radius; oy <= radius; oy++) {
              const nx = cx + ox;
              const ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
              const index = ny * SIZE + nx;
              // A bridge carves its own way through; anything else respects the
              // walls it was given.
              if (this.blocked[index]) {
                if (!isBridge) continue;
                this.blocked[index] = 0;
              }
              if (!this.onStreet[index]) {
                painted++;
                this.streetTier[index] = tier;
              } else if (tier < this.streetTier[index]) {
                // Two streets over one square: the better one wins. A footpath
                // crossing a main road must not make the road slow.
                this.streetTier[index] = tier;
              }
              this.onStreet[index] = 1;
            }
          }
        }
      }
    }

    this.stats.streetCells = painted;

    // Only worth insisting on roads if there are enough of them to get anywhere.
    const walkable = SIZE * SIZE - this.stats.blockedCells;
    this.streetsOnly = strict && painted > walkable * 0.12;
    this.stats.streetsOnly = this.streetsOnly;

    this.hasField = false;
  }

  /* ------------------------------------------------------------------ */
  /* Step 2: work out the arrows. A few times a second.                  */
  /* ------------------------------------------------------------------ */

  /**
   * Flood outward from the player and turn the result into arrows.
   * @returns false if the player is outside the area the field covers.
   */
  update(playerX: number, playerY: number, nowMs: number): boolean {
    const started = performance.now();

    let startCx = this.worldToCellX(playerX);
    let startCy = this.worldToCellY(playerY);
    if (startCx < 1 || startCy < 1 || startCx >= SIZE - 1 || startCy >= SIZE - 1) {
      return false;
    }

    // IF THE PLAYER IS INSIDE A BUILDING, FLOOD FROM THE NEAREST DOORSTEP.
    //
    // This is not a rare edge case -- it is what happens to anybody testing
    // indoors, which is most first attempts. GPS puts them inside a shop or a
    // flat, the flood starts in a sealed room, nothing outside it is reachable,
    // so no nest can be placed and the game appears completely dead. Nothing on
    // screen explains why, because from the code's point of view nothing failed.
    // Standing indoors, or -- with roads-only routing -- standing in a garden,
    // means the flood has nowhere to begin. Start it at the nearest place
    // monsters are allowed to be instead.
    const startUsable =
      !this.blocked[startCy * SIZE + startCx] &&
      (!this.streetsOnly || this.onStreet[startCy * SIZE + startCx] === 1);

    if (!startUsable) {
      const escaped = this.nearestOpenCell(startCx, startCy);
      if (!escaped) return false;
      startCx = escaped.cx;
      startCy = escaped.cy;
    }

    this.distance.fill(UNREACHABLE);
    this.queueHead.fill(-1);
    this.queuedCount = 0;

    const startIndex = startCy * SIZE + startCx;
    this.distance[startIndex] = 0;
    this.pushToBucket(startIndex, 0);

    // Walk the buckets in order of distance. Because every step costs either 10
    // or 14, a square's neighbours always land within 14 of it -- so a small
    // ring of 15 buckets, reused over and over, is enough to keep everything in
    // order without ever sorting anything.
    let processed = 0;
    let currentCost = 0;
    const maxCost = UNREACHABLE;

    while (currentCost < maxCost) {
      const bucket = currentCost % BUCKET_COUNT;
      let index = this.queueHead[bucket];

      if (index === -1) {
        currentCost++;
        // Nothing left anywhere: stop.
        if (processed > 0 && this.bucketsEmpty()) break;
        if (currentCost > SIZE * SIZE * DIAGONAL_COST) break;
        continue;
      }

      this.queueHead[bucket] = -1;

      while (index !== -1) {
        const next = this.queueNext[index];
        this.queuedCount--;
        const cost = this.distance[index];

        // A square can be queued more than once; only the cheapest visit counts.
        if (cost === currentCost) {
          processed++;
          const cx = index % SIZE;
          const cy = (index / SIZE) | 0;

          for (let n = 0; n < 8; n++) {
            const dx = NEIGHBOUR_DX[n];
            const dy = NEIGHBOUR_DY[n];
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;

            const neighbourIndex = ny * SIZE + nx;
            if (this.blocked[neighbourIndex]) continue;
            // Keeping to the pavements: everything else is a wall as far as
            // routing is concerned.
            if (this.streetsOnly && !this.onStreet[neighbourIndex]) continue;

            // Do not let monsters cut a corner diagonally through the gap
            // between two buildings that touch at their corners.
            if (dx !== 0 && dy !== 0) {
              if (this.blocked[cy * SIZE + nx] && this.blocked[ny * SIZE + cx]) continue;
            }

            // Leaving the road is dearer, so the cheapest route -- and
            // therefore the arrows -- hug the streets.
            // Rounded to a whole number: the bucket ring only works on integers.
            const stepCost = this.onStreet[neighbourIndex]
              ? this.tierStepCost[this.streetTier[neighbourIndex] * 8 + n]
              : this.offStreetCost[n];
            const newCost = cost + stepCost;
            if (newCost < this.distance[neighbourIndex]) {
              this.distance[neighbourIndex] = newCost;
              this.pushToBucket(neighbourIndex, newCost);
            }
          }
        }

        index = next;
      }

      currentCost++;
    }

    this.buildArrows();
    this.hasField = true;
    this.lastBuildMs = nowMs;
    this.stats.lastBuildMs = performance.now() - started;
    return true;
  }

  /** Search outward for the closest square that is not inside a building. */
  private nearestOpenCell(cx: number, cy: number): { cx: number; cy: number } | null {
    // 40 rings at 3 m a ring is 120 m -- further than any building is wide.
    for (let ring = 1; ring < 40; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          // Only the edge of each ring, so squares are not retested.
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 1 || ny < 1 || nx >= SIZE - 1 || ny >= SIZE - 1) continue;
          const index = ny * SIZE + nx;
          if (this.blocked[index]) continue;
          if (this.streetsOnly && !this.onStreet[index]) continue;
          return { cx: nx, cy: ny };
        }
      }
    }
    return null;
  }

  private bucketsEmpty(): boolean {
    return this.queuedCount === 0;
  }

  private pushToBucket(index: number, cost: number): void {
    const bucket = cost % BUCKET_COUNT;
    this.queueNext[index] = this.queueHead[bucket];
    this.queueHead[bucket] = index;
    this.queuedCount++;
  }

  /** Turn the distance numbers into a direction for every square. */
  private buildArrows(): void {
    for (let cy = 1; cy < SIZE - 1; cy++) {
      for (let cx = 1; cx < SIZE - 1; cx++) {
        const index = cy * SIZE + cx;
        if (this.blocked[index] || this.distance[index] === UNREACHABLE) {
          this.flowX[index] = 0;
          this.flowY[index] = 0;
          continue;
        }

        // Point at whichever neighbour is closest to the player.
        let bestCost = this.distance[index];
        let bestDx = 0;
        let bestDy = 0;

        for (let n = 0; n < 8; n++) {
          const dx = NEIGHBOUR_DX[n];
          const dy = NEIGHBOUR_DY[n];
          const neighbourIndex = (cy + dy) * SIZE + (cx + dx);
          if (this.blocked[neighbourIndex]) continue;
          const cost = this.distance[neighbourIndex];
          if (cost < bestCost) {
            bestCost = cost;
            bestDx = dx;
            bestDy = dy;
          }
        }

        // The step is always one of nine fixed directions, so the length is
        // either 0, 1 or the diagonal -- no need to work out a square root.
        if (bestDx !== 0 && bestDy !== 0) {
          this.flowX[index] = bestDx * INV_SQRT2;
          this.flowY[index] = bestDy * INV_SQRT2;
        } else {
          this.flowX[index] = bestDx;
          this.flowY[index] = bestDy;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Using it                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Which way should something standing here walk?
   * Writes into the object passed in, so calling this for 400 monsters every
   * frame allocates nothing at all.
   */
  sample(worldX: number, worldY: number, out: { x: number; y: number }): boolean {
    out.x = 0;
    out.y = 0;
    if (!this.hasField) return false;

    // Blend the four squares around this point rather than taking just the one
    // underneath. Without this the arrows jump abruptly at every square edge,
    // and a monster walking beside a building repeatedly gets an arrow aimed
    // straight into the corner, is pushed back out, and jams there. Measured:
    // 16% of monsters never arrived. Blending makes the arrows flow smoothly
    // around corners instead.
    const fx = (worldX - this.originX + FIELD_RADIUS_METRES) / CELL_METRES - 0.5;
    const fy = (worldY - this.originY + FIELD_RADIUS_METRES) / CELL_METRES - 0.5;

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= SIZE || y0 + 1 >= SIZE) return false;

    const tx = fx - x0;
    const ty = fy - y0;

    let sumX = 0;
    let sumY = 0;
    let sumWeight = 0;

    for (let j = 0; j <= 1; j++) {
      for (let i = 0; i <= 1; i++) {
        const index = (y0 + j) * SIZE + (x0 + i);
        // A square inside a building has no opinion, so give it no say.
        if (this.blocked[index]) continue;
        const weight = (i === 0 ? 1 - tx : tx) * (j === 0 ? 1 - ty : ty);
        if (weight <= 0) continue;
        sumX += this.flowX[index] * weight;
        sumY += this.flowY[index] * weight;
        sumWeight += weight;
      }
    }

    if (sumWeight <= 0) return false;

    const length = Math.hypot(sumX, sumY);
    if (length < 1e-4) return false;

    out.x = sumX / length;
    out.y = sumY / length;
    return true;
  }

  /** How far, along the streets, is this spot from the player? Metres. */
  walkingDistanceMetres(worldX: number, worldY: number): number {
    const cx = this.worldToCellX(worldX);
    const cy = this.worldToCellY(worldY);
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return Infinity;
    const cost = this.distance[cy * SIZE + cx];
    return cost === UNREACHABLE ? Infinity : (cost / STRAIGHT_COST) * CELL_METRES;
  }

  /** Can something standing here reach the player at all? */
  isReachable(worldX: number, worldY: number): boolean {
    return Number.isFinite(this.walkingDistanceMetres(worldX, worldY));
  }

  /** Are there enough roads here to insist monsters use them? */
  streetsAreUsable(): boolean {
    return this.streetsOnly;
  }

  /**
   * Which tier of street this spot is, or -1 for none.
   *
   * Exists so the effect of the street-kind table can be MEASURED rather than
   * assumed -- the first attempt at checking it guessed the grid maths by hand,
   * got the origin wrong, and reported every monster standing on the same kind
   * of road, which was nonsense.
   */
  streetTierAt(worldX: number, worldY: number): number {
    const cx = this.worldToCellX(worldX);
    const cy = this.worldToCellY(worldY);
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return -1;
    const index = cy * SIZE + cx;
    return this.onStreet[index] ? this.streetTier[index] : -1;
  }

  /** Is this spot on a road? For checking the routing actually works. */
  isOnStreetAt(worldX: number, worldY: number): boolean {
    const cx = this.worldToCellX(worldX);
    const cy = this.worldToCellY(worldY);
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return false;
    return this.onStreet[cy * SIZE + cx] === 1;
  }

  /** Is a spot inside a building, according to the field's own copy? */
  isBlockedAt(worldX: number, worldY: number): boolean {
    const cx = this.worldToCellX(worldX);
    const cy = this.worldToCellY(worldY);
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return true;
    return this.blocked[cy * SIZE + cx] === 1;
  }

  /** Does the field still cover this spot, or have we walked off the edge? */
  covers(worldX: number, worldY: number): boolean {
    const margin = CELL_METRES * 4;
    return (
      Math.abs(worldX - this.originX) < FIELD_RADIUS_METRES - margin &&
      Math.abs(worldY - this.originY) < FIELD_RADIUS_METRES - margin
    );
  }

  msSinceBuild(nowMs: number): number {
    return this.hasField ? nowMs - this.lastBuildMs : Infinity;
  }

  ready(): boolean {
    return this.hasField;
  }

  /* ------------------------------------------------------------------ */
  /* Converting between metres and squares                               */
  /* ------------------------------------------------------------------ */

  private worldToCellX(worldX: number): number {
    return Math.floor((worldX - this.originX + FIELD_RADIUS_METRES) / CELL_METRES);
  }

  private worldToCellY(worldY: number): number {
    return Math.floor((worldY - this.originY + FIELD_RADIUS_METRES) / CELL_METRES);
  }

  private cellToWorldX(cx: number): number {
    return this.originX - FIELD_RADIUS_METRES + (cx + 0.5) * CELL_METRES;
  }

  private cellToWorldY(cy: number): number {
    return this.originY - FIELD_RADIUS_METRES + (cy + 0.5) * CELL_METRES;
  }

  /** Field size in squares, for tests and the dev readout. */
  static get gridSize(): number {
    return SIZE;
  }

  static get cellMetres(): number {
    return CELL_METRES;
  }
}
