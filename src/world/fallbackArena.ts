/**
 * THE FALLBACK ARENA.
 * ===================
 * What to do when the real world has no walls to offer: open countryside, a
 * beach, the middle of a park, a lake, or simply a neighbourhood nobody has
 * mapped yet.
 *
 * The brief asks for this as an edge case. Measurement suggests it is not one.
 * Even with the better of the two map providers, building coverage varies
 * enormously by country -- and a fight in a completely empty field is a fight
 * with no tactics in it at all: nothing to break line of sight, no chokepoints,
 * nowhere that piercing beats spread.
 *
 * So we invent some. The obstacles are generated from the same seed as
 * everything else in that patch of world, which means:
 *   - the same place always generates the same arena,
 *   - two players standing together see identical obstacles,
 *   - and it still costs no server.
 *
 * They are placed to leave the middle clear, so you never appear inside one.
 */

import { seededRandom } from './determinism';
import type { CollisionWorld } from './collision';

/** Never put an obstacle closer than this to the player's arrival point. */
const CLEAR_RADIUS_METRES = 22;

/** How far out obstacles are scattered. */
const ARENA_RADIUS_METRES = 170;

export interface ArenaShape {
  centreX: number;
  centreY: number;
  halfWidth: number;
  halfHeight: number;
  rotation: number;
}

/**
 * Work out the obstacles for a patch of world. Pure maths: the same seed always
 * produces the same result, on every phone, forever.
 */
export function generateArenaShapes(seed: number, count: number): ArenaShape[] {
  const random = seededRandom(seed);
  const shapes: ArenaShape[] = [];

  let attempts = 0;
  while (shapes.length < count && attempts < count * 12) {
    attempts++;

    // Scatter by angle and distance rather than on a grid, so it does not read
    // as a chessboard.
    const angle = random() * Math.PI * 2;
    const distance = CLEAR_RADIUS_METRES + random() * (ARENA_RADIUS_METRES - CLEAR_RADIUS_METRES);
    const centreX = Math.cos(angle) * distance;
    const centreY = Math.sin(angle) * distance;

    // A mix of long thin walls and chunky blocks. The thin ones make corridors
    // and chokepoints; the chunky ones make things to hide behind.
    const chunky = random() < 0.45;
    const halfWidth = chunky ? 4 + random() * 7 : 6 + random() * 14;
    const halfHeight = chunky ? 4 + random() * 7 : 1.5 + random() * 2.5;

    // Keep a little breathing room between obstacles so nothing seals shut.
    let tooClose = false;
    for (const other of shapes) {
      const gap = Math.hypot(other.centreX - centreX, other.centreY - centreY);
      const need = Math.max(halfWidth, halfHeight) + Math.max(other.halfWidth, other.halfHeight) + 9;
      if (gap < need) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    shapes.push({
      centreX,
      centreY,
      halfWidth,
      halfHeight,
      rotation: random() * Math.PI,
    });
  }

  return shapes;
}

/**
 * Add generated obstacles to the collision world, positioned around its origin.
 *
 * @param howMany  more obstacles for emptier places -- see the caller
 */
export function addFallbackArena(collision: CollisionWorld, seed: number, howMany: number): number {
  const shapes = generateArenaShapes(seed, howMany);

  for (const shape of shapes) {
    const cos = Math.cos(shape.rotation);
    const sin = Math.sin(shape.rotation);

    // Four corners of a rotated rectangle.
    const corners = new Float32Array(8);
    const offsets: [number, number][] = [
      [-shape.halfWidth, -shape.halfHeight],
      [shape.halfWidth, -shape.halfHeight],
      [shape.halfWidth, shape.halfHeight],
      [-shape.halfWidth, shape.halfHeight],
    ];

    for (let i = 0; i < 4; i++) {
      const [ox, oy] = offsets[i];
      corners[i * 2] = shape.centreX + ox * cos - oy * sin;
      corners[i * 2 + 1] = shape.centreY + ox * sin + oy * cos;
    }

    collision.addGeneratedWall(corners);
  }

  return shapes.length;
}
