/**
 * THE GPS SMOOTHER (a "Kalman filter")
 * ====================================
 * WHAT PROBLEM THIS SOLVES
 * Phone GPS lies. Stand perfectly still and your reported position will hop
 * around by 5-20 metres every second. If the game character sat exactly where
 * GPS said, it would twitch and teleport constantly.
 *
 * THE IDEA, IN ONE PARAGRAPH
 * We keep a running "best guess" of where you are, plus a number saying how
 * unsure we are about it. Every time a new GPS reading arrives, we blend it into
 * the best guess. How much we trust the new reading depends on two things:
 *   - how accurate the phone claims the reading is, and
 *   - how long it has been since the last one (the longer, the more you could
 *     genuinely have moved, so the more we should trust fresh data).
 * A precise reading pulls the guess a lot. A vague one barely moves it.
 * The result is a point that stays rock-steady when you stand still, but still
 * follows you properly when you start walking.
 *
 * We run this maths separately on latitude and longitude, which is fine at the
 * scale the game cares about.
 */

import type { LatLng } from './geo';
import { TUNING } from '../config/tuning';
import { metresPerDegreeLng } from './geo';

export class GpsSmoother {
  /** Our current best guess. Null until the very first reading arrives. */
  private estimate: LatLng | null = null;

  /**
   * How unsure we are, expressed as "variance" in metres squared.
   * Big number = we do not trust our guess much = new readings pull it hard.
   */
  private variance = -1;

  /** Timestamp of the last reading we processed. */
  private lastTimestampMs = 0;

  /**
   * Feed in one raw GPS reading, get back the smoothed position.
   *
   * @param reading      where the phone thinks you are
   * @param accuracyM    how wrong the phone thinks it might be, in metres
   * @param timestampMs  when the reading was taken
   */
  update(reading: LatLng, accuracyM: number, timestampMs: number): LatLng {
    // Never fully trust a phone claiming perfect accuracy -- it is never true.
    const accuracy = Math.max(accuracyM, TUNING.gps.minimumAccuracyMetres);

    // FIRST EVER READING: we have nothing to blend with, so just accept it.
    if (this.estimate === null || this.variance < 0) {
      this.estimate = { lat: reading.lat, lng: reading.lng };
      this.variance = accuracy * accuracy;
      this.lastTimestampMs = timestampMs;
      return { ...this.estimate };
    }

    // TIME PASSED: the longer since the last reading, the more you could have
    // genuinely moved, so the less certain our old guess is. Grow the doubt.
    const elapsedSeconds = Math.max(0, (timestampMs - this.lastTimestampMs) / 1000);
    if (elapsedSeconds > 0) {
      const drift = TUNING.gps.smoothingMetresPerSecond;
      this.variance += elapsedSeconds * drift * drift;
      this.lastTimestampMs = timestampMs;
    }

    // THE BLEND. `gain` is between 0 and 1 and answers: "how much do I move my
    // guess toward this new reading?" A very accurate reading (small accuracy)
    // pushes gain toward 1. A vague reading pushes it toward 0.
    const gain = this.variance / (this.variance + accuracy * accuracy);

    this.estimate.lat += gain * (reading.lat - this.estimate.lat);
    this.estimate.lng += gain * (reading.lng - this.estimate.lng);

    // Having used the reading, we are now more certain than we were.
    this.variance = (1 - gain) * this.variance;

    return { ...this.estimate };
  }

  /**
   * Our current uncertainty as a plain radius in metres -- handy for drawing a
   * "how sure are we" circle and for the dev readout.
   */
  uncertaintyMetres(): number {
    return this.variance < 0 ? Infinity : Math.sqrt(this.variance);
  }

  /**
   * Throw away all history. Used when dev-mode fake GPS is switched on or off,
   * so the fake position does not slowly drift in from wherever you really are.
   */
  reset(): void {
    this.estimate = null;
    this.variance = -1;
    this.lastTimestampMs = 0;
  }

  /**
   * Jump the smoother straight to a position with no blending.
   * Only used by dev mode, where positions are exact by definition.
   */
  forceTo(position: LatLng, timestampMs: number): LatLng {
    this.estimate = { lat: position.lat, lng: position.lng };
    this.variance = TUNING.gps.minimumAccuracyMetres * TUNING.gps.minimumAccuracyMetres;
    this.lastTimestampMs = timestampMs;
    return { ...this.estimate };
  }
}

/**
 * Small helper used by the dev panel: how far apart two readings are, expressed
 * as a speed in metres per second. Shared with the anti-cheat code.
 */
export function speedBetweenMps(
  a: LatLng,
  b: LatLng,
  millisecondsApart: number
): number {
  if (millisecondsApart <= 0) return 0;
  const midLat = (a.lat + b.lat) / 2;
  const dx = (b.lng - a.lng) * metresPerDegreeLng(midLat);
  const dy = (b.lat - a.lat) * 111320;
  return Math.hypot(dx, dy) / (millisecondsApart / 1000);
}
