/**
 * THE LEASHED CHARACTER.
 * ======================
 * This is the thing you actually steer. It is NOT your GPS position.
 *
 * THE PROBLEM IT SOLVES (from the brief, worth restating because it is the
 * heart of the whole design):
 *   - Phone GPS is accurate to 5-20 metres and jitters constantly, so dodging
 *     with it would be impossible.
 *   - And a game that required people to physically run around outdoors while
 *     staring at a screen would be genuinely dangerous.
 *
 * THE ANSWER: two separate positions.
 *   - The ANCHOR is where you really are, smoothed. It moves when you walk.
 *   - The CHARACTER is what you steer with your thumb. It is tied to the anchor
 *     by an invisible rope about 28 metres long.
 *
 * So fine movement -- dodging, kiting, positioning -- is thumb work you can do
 * standing perfectly still on a street corner. Coarse movement -- getting to a
 * nest across the neighbourhood -- is real walking, which drags the rope along
 * with you and the character comes too.
 *
 * The game is therefore fully playable without moving your feet, which is both
 * safer and much more pleasant than the alternative.
 */

import type { LatLng } from '../location/geo';
import { distanceMetres, offsetByMetres, metresPerDegreeLng } from '../location/geo';
import { TUNING } from '../config/tuning';

/** Which way the thumb is pushing. Each between -1 and 1; (0,0) means no input. */
export interface JoystickInput {
  east: number;
  north: number;
}

export class PlayerCharacter {
  /** Where the steered character currently is. */
  private position: LatLng;

  /** Whether we have a real anchor yet. Before the first GPS fix we cannot exist. */
  private placed = false;

  constructor(startAt: LatLng) {
    this.position = { ...startAt };
  }

  get lng(): number {
    return this.position.lng;
  }

  get lat(): number {
    return this.position.lat;
  }

  at(): LatLng {
    return this.position;
  }

  /**
   * Put the character exactly on the anchor. Used for the very first GPS fix,
   * and whenever the anchor teleports so far that following would look absurd
   * (dev-mode fake GPS being dragged across the city, for instance).
   */
  snapTo(anchor: LatLng): void {
    this.position = { ...anchor };
    this.placed = true;
  }

  /**
   * Advance the character by one frame.
   *
   * @param deltaSeconds how long since the last frame
   * @param anchor       your real, smoothed position
   * @param input        which way the thumb is pushing
   */
  update(
    deltaSeconds: number,
    anchor: LatLng | null,
    input: JoystickInput,
    /** From upgrade cards: 1 = unchanged. */
    speedMultiplier = 1,
    /** From upgrade cards: extra metres of rope. */
    leashBonusMetres = 0
  ): void {
    if (!anchor) return;

    const radius = TUNING.leash.radiusMetres + leashBonusMetres;

    // A leash of zero means "there is no thumbstick": you simply are wherever
    // your real position is. Handled here rather than by deleting the joystick,
    // so the decision stays one number in the tuning file and can be tried on a
    // street and undone in the cafe afterwards.
    if (TUNING.leash.radiusMetres <= 0) {
      this.position.lng = anchor.lng;
      this.position.lat = anchor.lat;
      this.placed = true;
      return;
    }

    // First fix, or the anchor jumped absurdly far: just appear there.
    if (!this.placed || distanceMetres(anchor, this.position) > radius * 6) {
      this.snapTo(anchor);
      return;
    }

    // --- 1. Thumb movement -------------------------------------------------
    const push = Math.hypot(input.east, input.north);
    if (push > 0.02) {
      // Clamp to 1 so pushing diagonally is not faster than pushing straight,
      // but allow gentler pushes to move more slowly.
      const strength = Math.min(push, 1);
      const step = TUNING.leash.characterSpeedMps * speedMultiplier * strength * deltaSeconds;

      this.position = offsetByMetres(
        this.position,
        (input.east / push) * step,
        (input.north / push) * step
      );
    }

    // --- 2. The leash ------------------------------------------------------
    // If the character has ended up outside the rope, ease it back toward the
    // edge rather than snapping. Snapping feels like a bug; easing feels like
    // being gently pulled, which is exactly what it is.
    const distance = distanceMetres(anchor, this.position);

    if (distance > radius) {
      const overshoot = distance - radius;

      // Frame-rate independent easing. Without the exponent, the leash would
      // pull twice as hard at 120fps as at 60fps, and the game would literally
      // feel different on different phones.
      const ease = 1 - Math.pow(1 - TUNING.leash.followStrength, deltaSeconds * 60);

      // How far to move back toward the anchor this frame. Always enough to stop
      // the character escaping entirely, however hard the thumb pushes.
      const pullBack = Math.max(overshoot * ease, overshoot - radius * 0.5);

      const metresPerLng = metresPerDegreeLng((anchor.lat + this.position.lat) / 2);
      const eastGap = (anchor.lng - this.position.lng) * metresPerLng;
      const northGap = (anchor.lat - this.position.lat) * 111320;
      const gapLength = Math.hypot(eastGap, northGap) || 1;

      this.position = offsetByMetres(
        this.position,
        (eastGap / gapLength) * pullBack,
        (northGap / gapLength) * pullBack
      );
    }
  }

  /**
   * Move the character to an exact spot without any easing.
   * Used by wall collision, which has already decided where it is allowed to be.
   */
  placeAt(lng: number, lat: number): void {
    this.position.lng = lng;
    this.position.lat = lat;
  }

  /** How far the character currently is from your real position, in metres. */
  distanceFromAnchor(anchor: LatLng | null): number {
    if (!anchor) return 0;
    return distanceMetres(anchor, this.position);
  }

  /** How much of the leash is used up, 0 (on top of you) to 1 (at full stretch). */
  leashTension(anchor: LatLng | null): number {
    if (!anchor) return 0;
    return Math.min(1, this.distanceFromAnchor(anchor) / TUNING.leash.radiusMetres);
  }
}
