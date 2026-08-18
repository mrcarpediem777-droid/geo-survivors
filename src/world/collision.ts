/**
 * WALLS.
 * ======
 * Turns real building outlines into things you cannot walk through.
 *
 * This is the idea the whole game is built on: every player in the world gets a
 * level laid out by their own neighbourhood, for free, forever, with no level
 * designer. Streets become corridors. Squares become open arenas where you get
 * surrounded. A narrow alley becomes a genuine tactical choice.
 *
 * TWO THINGS MAKE THIS FAST ENOUGH
 *
 * 1. WE WORK IN METRES, NOT MAP COORDINATES. Everything here is measured in
 *    plain metres east and north of a nearby origin point. Distances are then
 *    ordinary arithmetic instead of geography, and the numbers stay small enough
 *    to be exact.
 *
 * 2. WE NEVER CHECK EVERY WALL. The area is divided into a grid of squares, and
 *    each wall is filed under the squares it touches. To find what a character
 *    might bump into we look only in the handful of squares it is standing in.
 *    With a few thousand buildings loaded that turns thousands of checks per
 *    character per frame into about three.
 *
 * All of this is worked out ONCE when the player moves to a new area, exactly as
 * the brief asks -- never per frame.
 */

import type { BuildingRing } from './buildingSource';

/** How big each square of the lookup grid is, in metres. */
const GRID_CELL_METRES = 24;

/** One wall: a closed loop of corners, in metres from the origin. */
interface Wall {
  /** x, y, x, y, ... east and north of the origin, in metres. */
  points: Float32Array;
  /** Water blocks movement exactly like a building, but is counted separately. */
  isWater: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CollisionStats {
  wallCount: number;
  gridCells: number;
  buildOriginLng: number;
  buildOriginLat: number;
  /** How far from the origin the data is good for. */
  coverageRadiusMetres: number;
}

export class CollisionWorld {
  /** The point everything is measured from. */
  private originLng = 0;
  private originLat = 0;
  private metresPerLng = 1;
  private readonly metresPerLat = 111320;

  private walls: Wall[] = [];
  private grid = new Map<number, number[]>();
  private coverageRadius = 0;

  /* Scratch values reused every call, so collision allocates nothing. */
  private scratchNearby: number[] = [];

  /* ------------------------------------------------------------------ */
  /* Converting between the real world and our flat metre grid           */
  /* ------------------------------------------------------------------ */

  toLocalX(lng: number): number {
    return (lng - this.originLng) * this.metresPerLng;
  }

  toLocalY(lat: number): number {
    return (lat - this.originLat) * this.metresPerLat;
  }

  toLng(x: number): number {
    return this.originLng + x / this.metresPerLng;
  }

  toLat(y: number): number {
    return this.originLat + y / this.metresPerLat;
  }

  /* ------------------------------------------------------------------ */
  /* Building the walls -- done once per area, never per frame           */
  /* ------------------------------------------------------------------ */

  /**
   * Replace all walls with a fresh set built around a new origin.
   *
   * @param rings          building outlines, in longitude/latitude
   * @param originLng      the point to measure everything from
   * @param originLat      "
   * @param coverageMetres how far out these buildings are trustworthy
   */
  rebuild(
    rings: BuildingRing[],
    originLng: number,
    originLat: number,
    coverageMetres: number
  ): void {
    this.originLng = originLng;
    this.originLat = originLat;
    this.metresPerLng = 111320 * Math.cos((originLat * Math.PI) / 180);
    this.coverageRadius = coverageMetres;

    this.walls = [];
    this.grid.clear();

    for (const ring of rings) {
      // Throw away anything far outside the area we care about, before doing
      // any real work on it.
      const roughX = (ring.minLng - originLng) * this.metresPerLng;
      const roughY = (ring.minLat - originLat) * this.metresPerLat;
      if (Math.abs(roughX) > coverageMetres * 1.5 || Math.abs(roughY) > coverageMetres * 1.5) {
        continue;
      }

      const count = ring.coords.length / 2;
      const points = new Float32Array(count * 2);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (let i = 0; i < count; i++) {
        const x = (ring.coords[i * 2] - originLng) * this.metresPerLng;
        const y = (ring.coords[i * 2 + 1] - originLat) * this.metresPerLat;
        points[i * 2] = x;
        points[i * 2 + 1] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      // A building smaller than a wardrobe is bad data, not architecture.
      if (maxX - minX < 1 && maxY - minY < 1) continue;

      const wallIndex = this.walls.length;
      this.walls.push({ points, minX, minY, maxX, maxY, isWater: ring.kind === 'water' });
      this.fileInGrid(wallIndex, minX, minY, maxX, maxY);
    }
  }

  /** How many of the loaded walls are actual buildings rather than water? */
  buildingCount(): number {
    let count = 0;
    for (const wall of this.walls) if (!wall.isWater) count++;
    return count;
  }

  /** File one wall under every grid square its bounding box touches. */
  private fileInGrid(index: number, minX: number, minY: number, maxX: number, maxY: number): void {
    const cx0 = Math.floor(minX / GRID_CELL_METRES);
    const cx1 = Math.floor(maxX / GRID_CELL_METRES);
    const cy0 = Math.floor(minY / GRID_CELL_METRES);
    const cy1 = Math.floor(maxY / GRID_CELL_METRES);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = cellKey(cx, cy);
        const bucket = this.grid.get(key);
        if (bucket) bucket.push(index);
        else this.grid.set(key, [index]);
      }
    }
  }

  /**
   * Add generated walls directly, in metres, for places with no real buildings.
   * Used by the fallback arena.
   */
  addGeneratedWall(points: Float32Array): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const index = this.walls.length;
    this.walls.push({ points, minX, minY, maxX, maxY, isWater: false });
    this.fileInGrid(index, minX, minY, maxX, maxY);
  }

  /* ------------------------------------------------------------------ */
  /* Using the walls                                                     */
  /* ------------------------------------------------------------------ */

  /** Which walls could possibly touch a circle at this spot? */
  private nearby(x: number, y: number, radius: number): number[] {
    const out = this.scratchNearby;
    out.length = 0;

    const cx0 = Math.floor((x - radius) / GRID_CELL_METRES);
    const cx1 = Math.floor((x + radius) / GRID_CELL_METRES);
    const cy0 = Math.floor((y - radius) / GRID_CELL_METRES);
    const cy1 = Math.floor((y + radius) / GRID_CELL_METRES);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.grid.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const index of bucket) {
          // A wall filed under several squares must only be checked once.
          if (out.indexOf(index) === -1) out.push(index);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle out of any wall it has ended up inside.
   * Returns the corrected position, writing into the object passed in so that
   * nothing is allocated during the game loop.
   *
   * Run a few times so that a character wedged into a corner gets pushed out of
   * both walls rather than bouncing between them.
   */
  resolveCircle(
    x: number,
    y: number,
    radius: number,
    out: { x: number; y: number },
    cameFromX?: number,
    cameFromY?: number
  ): boolean {
    out.x = x;
    out.y = y;
    if (this.walls.length === 0) return false;

    let movedAtAll = false;

    // A few passes, because pushing clear of one wall can nudge you against the
    // next one. Real buildings genuinely do share walls, so this still matters
    // even now that duplicate copies are gone.
    for (let pass = 0; pass < 5; pass++) {
      let movedThisPass = false;
      const candidates = this.nearby(out.x, out.y, radius);

      for (const index of candidates) {
        const wall = this.walls[index];

        // Cheap rejection first: is the circle even near the bounding box?
        if (
          out.x + radius < wall.minX ||
          out.x - radius > wall.maxX ||
          out.y + radius < wall.minY ||
          out.y - radius > wall.maxY
        ) {
          continue;
        }

        const inside = pointInPolygon(out.x, out.y, wall.points);
        const closest = closestPointOnOutline(out.x, out.y, wall.points);

        if (inside) {
          // Standing in a building: shove out through the nearest wall.
          const dx = out.x - closest.x;
          const dy = out.y - closest.y;
          const length = Math.hypot(dx, dy) || 1;
          out.x = closest.x - (dx / length) * radius;
          out.y = closest.y - (dy / length) * radius;
          movedThisPass = true;
        } else if (closest.distance < radius) {
          // Touching from outside: push straight back out.
          const dx = out.x - closest.x;
          const dy = out.y - closest.y;
          const length = Math.hypot(dx, dy) || 1;
          const push = radius - closest.distance;
          out.x += (dx / length) * push;
          out.y += (dy / length) * push;
          movedThisPass = true;
        }
      }

      if (movedThisPass) movedAtAll = true;
      else break;
    }

    // LAST RESORT. In a terrace, buildings share walls, so being shoved out of
    // one puts you straight into the next. Pushing harder just bounces you along
    // the row forever. When that happens, stop pushing and simply look for the
    // nearest patch of open ground.
    //
    // This matters in real play: GPS drift can leave the character a few metres
    // inside a block of shophouses, and without this it would be trapped there.
    if (this.isInsideWall(out.x, out.y) || this.overlapsAnyWall(out.x, out.y, radius)) {
      // Prefer to come out on the side we walked in from. Without this, a
      // character wedged between two terraced houses can be spat out of the far
      // side -- which looks exactly like walking through a solid building.
      const preferX = cameFromX ?? out.x;
      const preferY = cameFromY ?? out.y;
      if (this.findOpenGround(out.x, out.y, radius, preferX, preferY, out)) movedAtAll = true;
    }

    return movedAtAll;
  }

  /**
   * Is there room to place something of this size here, clear of every wall?
   *
   * Checking only whether the middle is inside a wall is not enough: a nest is
   * 6 m across, so a middle sitting a metre from a house puts most of the nest
   * inside the house. That is exactly what a tester saw.
   */
  hasClearance(x: number, y: number, radius: number): boolean {
    return !this.overlapsAnyWall(x, y, radius);
  }

  /** Does a circle here touch any wall at all? */
  private overlapsAnyWall(x: number, y: number, radius: number): boolean {
    for (const index of this.nearby(x, y, radius)) {
      const wall = this.walls[index];
      if (
        x + radius < wall.minX ||
        x - radius > wall.maxX ||
        y + radius < wall.minY ||
        y - radius > wall.maxY
      ) {
        continue;
      }
      if (pointInPolygon(x, y, wall.points)) return true;
      if (closestPointOnOutline(x, y, wall.points).distance < radius) return true;
    }
    return false;
  }

  /**
   * Search outward in rings for the closest spot with room to stand.
   * Bounded, so it can never spin: if nothing is found within about 40 metres we
   * give up and leave the character where it was, which is at least stable.
   */
  private findOpenGround(
    x: number,
    y: number,
    radius: number,
    preferX: number,
    preferY: number,
    out: { x: number; y: number }
  ): boolean {
    for (let ring = 1; ring <= 14; ring++) {
      const distance = ring * radius * 1.4;
      const samples = 8 + ring * 4;

      // Take the whole ring, then pick the option nearest to where we came from,
      // rather than the first one we happen to try.
      let bestX = 0;
      let bestY = 0;
      let bestScore = Infinity;

      for (let i = 0; i < samples; i++) {
        // Twist each ring a little so the sample points do not line up into
        // spokes, which would miss narrow alleys lying between them.
        const angle = (i / samples) * Math.PI * 2 + ring * 0.37;
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance;
        if (this.overlapsAnyWall(px, py, radius)) continue;

        const score = (px - preferX) * (px - preferX) + (py - preferY) * (py - preferY);
        if (score < bestScore) {
          bestScore = score;
          bestX = px;
          bestY = py;
        }
      }

      if (bestScore < Infinity) {
        out.x = bestX;
        out.y = bestY;
        return true;
      }
    }
    return false;
  }

  /**
   * Is the straight line between two points blocked by a building?
   * This is what will give real line-of-sight in M4: a ranged monster behind a
   * house cannot shoot you, and you cannot shoot it.
   */
  segmentBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.walls.length === 0) return false;

    // Walk the line through the grid, checking only the squares it passes over.
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / GRID_CELL_METRES));
    const seen = new Set<number>();

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const bucket = this.grid.get(
        cellKey(Math.floor(px / GRID_CELL_METRES), Math.floor(py / GRID_CELL_METRES))
      );
      if (!bucket) continue;

      for (const index of bucket) {
        if (seen.has(index)) continue;
        seen.add(index);
        if (segmentCrossesOutline(x0, y0, x1, y1, this.walls[index].points)) return true;
      }
    }
    return false;
  }

  /** Is this spot inside a building? Used to avoid spawning monsters in walls. */
  isInsideWall(x: number, y: number): boolean {
    for (const index of this.nearby(x, y, 0.5)) {
      if (pointInPolygon(x, y, this.walls[index].points)) return true;
    }
    return false;
  }

  /** How far from the origin are the walls trustworthy? */
  coverageRadiusMetres(): number {
    return this.coverageRadius;
  }

  wallCount(): number {
    return this.walls.length;
  }

  stats(): CollisionStats {
    return {
      wallCount: this.walls.length,
      gridCells: this.grid.size,
      buildOriginLng: this.originLng,
      buildOriginLat: this.originLat,
      coverageRadiusMetres: this.coverageRadius,
    };
  }

  /** Wall outlines in metres, for drawing them in dev mode. */
  wallOutlines(): Float32Array[] {
    return this.walls.map((w) => w.points);
  }
}

/* -------------------------------------------------------------------- */
/* Geometry helpers                                                      */
/* -------------------------------------------------------------------- */

/** Pack two grid coordinates into one number, for use as a lookup key. */
function cellKey(cx: number, cy: number): number {
  // Offset keeps negatives positive; 65536 is far more grid squares than we
  // will ever have loaded at once.
  return (cx + 32768) * 65536 + (cy + 32768);
}

/**
 * Is a point inside a closed outline?
 *
 * The classic trick: draw a line from the point out to infinity and count how
 * many times it crosses the outline. An odd number means you started inside.
 */
function pointInPolygon(x: number, y: number, points: Float32Array): boolean {
  let inside = false;
  const count = points.length / 2;

  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = points[i * 2];
    const yi = points[i * 2 + 1];
    const xj = points[j * 2];
    const yj = points[j * 2 + 1];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Reused so the hot path allocates nothing. */
const closestResult = { x: 0, y: 0, distance: 0 };

/** The nearest point anywhere on an outline, and how far away it is. */
function closestPointOnOutline(
  x: number,
  y: number,
  points: Float32Array
): { x: number; y: number; distance: number } {
  let bestDistanceSquared = Infinity;
  let bestX = x;
  let bestY = y;
  const count = points.length / 2;

  for (let i = 0, j = count - 1; i < count; j = i++) {
    const ax = points[j * 2];
    const ay = points[j * 2 + 1];
    const bx = points[i * 2];
    const by = points[i * 2 + 1];

    // Closest point on the segment a->b to our point.
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared > 0 ? ((x - ax) * dx + (y - ay) * dy) / lengthSquared : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const px = ax + dx * t;
    const py = ay + dy * t;
    const distanceSquared = (x - px) * (x - px) + (y - py) * (y - py);

    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestX = px;
      bestY = py;
    }
  }

  closestResult.x = bestX;
  closestResult.y = bestY;
  closestResult.distance = Math.sqrt(bestDistanceSquared);
  return closestResult;
}

/** Does a line cross an outline anywhere? */
function segmentCrossesOutline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  points: Float32Array
): boolean {
  const count = points.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    if (
      segmentsIntersect(
        x0,
        y0,
        x1,
        y1,
        points[j * 2],
        points[j * 2 + 1],
        points[i * 2],
        points[i * 2 + 1]
      )
    ) {
      return true;
    }
  }
  return false;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Which side of the line p->q does point r lie on? */
function cross(px: number, py: number, qx: number, qy: number, rx: number, ry: number): number {
  return (qx - px) * (ry - py) - (qy - py) * (rx - px);
}
