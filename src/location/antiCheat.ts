/**
 * ANTI-CHEAT -- LOG ONLY, NEVER BLOCK.
 * ====================================
 * People will fake their GPS. That is guaranteed for any game that uses location.
 * At this stage we do NOT punish anyone and we do NOT block anything -- we only
 * write a note in a list. Reasons:
 *   1. Real GPS genuinely does crazy things (tunnels, lifts, tall buildings), so
 *      any blocking rule would punish honest players.
 *   2. We want to know how common and what shape the cheating is BEFORE deciding
 *      what to do about it.
 * These flags get exported with the analytics log in M6.
 *
 * HONEST LIMITATION, WORTH KNOWING NOW:
 * Android has a proper built-in "this location is fake" flag, but web pages are
 * not allowed to read it -- only real installed apps can. So while we are a web
 * app the checks below are all indirect guesswork. When/if we port to native,
 * `checkMockProviderFlag` is where the real check drops in, and it becomes far
 * more reliable. This is flagged in PLAYBOOK.md too.
 */

import type { LatLng } from './geo';
import { TUNING } from '../config/tuning';
import { speedBetweenMps } from './kalman';

export type CheatFlagKind =
  | 'impossible-speed'
  | 'teleport-jump'
  | 'mock-provider-suspected'
  | 'unnaturally-straight-path';

export interface CheatFlag {
  kind: CheatFlagKind;
  /** When it happened. */
  timestampMs: number;
  /** Plain-language description, safe to show in the dev panel. */
  detail: string;
}

interface Sample {
  position: LatLng;
  timestampMs: number;
  accuracyM: number;
}

export class AntiCheat {
  /** Everything we have flagged this session. */
  readonly flags: CheatFlag[] = [];

  /** Recent positions, used for the straight-line test. */
  private recent: Sample[] = [];

  /**
   * Feed every RAW GPS reading through here (raw, not smoothed -- smoothing
   * would hide exactly the artefacts we are looking for).
   */
  inspect(position: LatLng, accuracyM: number, timestampMs: number): void {
    const previous = this.recent[this.recent.length - 1];

    if (previous) {
      const gapMs = timestampMs - previous.timestampMs;
      const speed = speedBetweenMps(previous.position, position, gapMs);
      const jumpMetres = (speed * gapMs) / 1000;

      // 1. IMPOSSIBLE SPEED. Faster than a person can move without a vehicle.
      //    Note this fires legitimately if someone plays on a bus, which is
      //    exactly why we only log it.
      if (speed > TUNING.antiCheat.impossibleSpeedMps) {
        this.flag(
          'impossible-speed',
          timestampMs,
          `Moved at ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(0)} km/h)`
        );
      }

      // 2. TELEPORT. One enormous jump between two consecutive readings.
      if (jumpMetres > TUNING.antiCheat.teleportJumpMetres) {
        this.flag(
          'teleport-jump',
          timestampMs,
          `Jumped ${jumpMetres.toFixed(0)} m in ${(gapMs / 1000).toFixed(1)} s`
        );
      }
    }

    // 3. SUSPICIOUSLY PERFECT DATA. See the note above about the real Android flag.
    this.checkMockProviderFlag(position, accuracyM, timestampMs);

    // Keep a rolling window of recent readings for the straightness test.
    this.recent.push({ position, timestampMs, accuracyM });
    if (this.recent.length > TUNING.antiCheat.straightLineSampleCount) {
      this.recent.shift();
    }

    // 4. UNNATURALLY STRAIGHT PATH.
    this.checkStraightLine(timestampMs);
  }

  /**
   * Indirect stand-in for Android's real mock-location flag, which the browser
   * will not give us. We look for data that is too clean to be real.
   */
  private checkMockProviderFlag(position: LatLng, accuracyM: number, timestampMs: number): void {
    // Real GPS never reports zero error.
    if (accuracyM === 0) {
      this.flag('mock-provider-suspected', timestampMs, 'Reported accuracy of exactly 0 m');
      return;
    }
    // Real GPS coordinates have many decimal places. A coordinate that lands on
    // a tidy round number is almost certainly typed in by a spoofing tool.
    const latLooksTyped = Number.isInteger(position.lat * 10000);
    const lngLooksTyped = Number.isInteger(position.lng * 10000);
    if (latLooksTyped && lngLooksTyped) {
      this.flag(
        'mock-provider-suspected',
        timestampMs,
        'Coordinates are suspiciously round numbers'
      );
    }
  }

  /**
   * Real walking wobbles. A path with no wobble at all was drawn by software.
   * We take the most recent run of readings, draw a straight line from the first
   * to the last, and measure how far the middle ones stray from it. If none of
   * them stray more than a metre or so, that is not a human being walking.
   */
  private checkStraightLine(timestampMs: number): void {
    if (this.recent.length < TUNING.antiCheat.straightLineSampleCount) return;

    const first = this.recent[0].position;
    const last = this.recent[this.recent.length - 1].position;

    // Ignore a stationary player -- standing still is trivially "straight".
    const totalMetres = speedBetweenMps(first, last, 1000) * 1;
    if (totalMetres < 20) return;

    const midLat = (first.lat + last.lat) / 2;
    const mPerLng = 111320 * Math.cos((midLat * Math.PI) / 180);

    // Convert to flat metres so we can do simple geometry.
    const toXY = (p: LatLng) => ({
      x: (p.lng - first.lng) * mPerLng,
      y: (p.lat - first.lat) * 111320,
    });

    const end = toXY(last);
    const lineLength = Math.hypot(end.x, end.y);
    if (lineLength === 0) return;

    let maxDeviation = 0;
    for (let i = 1; i < this.recent.length - 1; i++) {
      const p = toXY(this.recent[i].position);
      // Perpendicular distance from point to the line through origin and `end`.
      const deviation = Math.abs(end.x * p.y - end.y * p.x) / lineLength;
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    if (maxDeviation < TUNING.antiCheat.straightLineToleranceMetres) {
      this.flag(
        'unnaturally-straight-path',
        timestampMs,
        `${this.recent.length} readings deviated at most ${maxDeviation.toFixed(2)} m from a straight line`
      );
      // Clear the window so one straight stretch does not flag on every reading.
      this.recent = [];
    }
  }

  private flag(kind: CheatFlagKind, timestampMs: number, detail: string): void {
    // Do not spam: ignore a repeat of the same kind within 5 seconds.
    const last = this.flags[this.flags.length - 1];
    if (last && last.kind === kind && timestampMs - last.timestampMs < 5000) return;

    this.flags.push({ kind, timestampMs, detail });
    console.warn(`[anti-cheat] ${kind}: ${detail}`);
  }

  /** Wipe history -- called when dev-mode fake GPS is toggled, since it would flag constantly. */
  reset(): void {
    this.recent = [];
  }
}
