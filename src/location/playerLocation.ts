/**
 * MODULE 1 OF 3: WHERE THE PLAYER IS.
 * ===================================
 * The three big parts of this game are deliberately kept apart:
 *   1. WHERE THE PLAYER IS      <-- this file
 *   2. WHAT THE WORLD CONTAINS  (src/world/)
 *   3. WHAT THE PLAYER OWNS     (src/profile/)
 * Nothing else in the game is allowed to talk to the GPS directly. Everything
 * asks this file instead. That is what will let us swap the world module for a
 * real server later without touching anything else.
 *
 * WHAT THIS FILE PRODUCES: the ANCHOR.
 * The anchor is the smoothed, trustworthy version of your real-world position.
 * It is NOT the character you steer -- that arrives in M2 and is leashed to this.
 */

import type { LatLng } from './geo';
import { GpsSmoother } from './kalman';
import { AntiCheat } from './antiCheat';
import { TUNING } from '../config/tuning';

/** What the rest of the game is told about your position. */
export interface AnchorState {
  /** The smoothed position the game should use. Null before the first fix. */
  anchor: LatLng | null;
  /** The unsmoothed position straight from the phone. Dev panel only. */
  raw: LatLng | null;
  /** How wrong the phone says the raw reading might be, in metres. */
  accuracyMetres: number;
  /** Where the position is coming from. */
  source: 'real-gps' | 'fake-gps-dev' | 'none';
  /** Plain-language status, safe to show the player. */
  status:
    | 'starting'
    | 'waiting-for-fix'
    | 'live'
    | 'permission-denied'
    | 'unavailable'
    | 'timed-out';
  /** Human-readable explanation when something went wrong. */
  message: string;
}

type Listener = (state: AnchorState) => void;

export class PlayerLocation {
  private smoother = new GpsSmoother();
  readonly antiCheat = new AntiCheat();

  private listeners: Listener[] = [];
  private watchId: number | null = null;
  private firstFixTimer: ReturnType<typeof setTimeout> | null = null;

  /** When dev mode takes over, this holds the pretend position. */
  private fakePosition: LatLng | null = null;

  private state: AnchorState = {
    anchor: null,
    raw: null,
    accuracyMetres: Infinity,
    source: 'none',
    status: 'starting',
    message: 'Starting up',
  };

  /* ------------------------------------------------------------------ */
  /* Listening                                                           */
  /* ------------------------------------------------------------------ */

  /** Be told whenever the position changes. Returns a function to stop listening. */
  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    listener(this.state); // give the newcomer the current state immediately
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  current(): AnchorState {
    return this.state;
  }

  private emit(patch: Partial<AnchorState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  /* ------------------------------------------------------------------ */
  /* Real GPS                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Ask the phone to start reporting where we are.
   *
   * IMPORTANT AND EASY TO TRIP OVER: browsers only allow this on a secure
   * connection -- an https:// address, or localhost on your own computer.
   * Opening the game over a plain wifi address from another device will fail.
   * That is exactly why we deploy to Vercel for phone testing.
   */
  startRealGps(): void {
    if (!('geolocation' in navigator)) {
      this.emit({
        status: 'unavailable',
        message: 'This browser cannot do location at all.',
      });
      return;
    }

    if (!window.isSecureContext) {
      this.emit({
        status: 'unavailable',
        message:
          'Location needs a secure (https) connection. Open the deployed link, not a plain wifi address.',
      });
      return;
    }

    this.emit({ status: 'waiting-for-fix', message: 'Looking for satellites...' });

    // If nothing arrives at all, say so rather than hanging forever.
    this.firstFixTimer = setTimeout(() => {
      if (this.state.status === 'waiting-for-fix') {
        this.emit({
          status: 'timed-out',
          message: 'No GPS fix yet. Try stepping outside or away from tall buildings.',
        });
      }
    }, TUNING.gps.firstFixTimeoutMs);

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handleRealReading(position),
      (error) => this.handleError(error),
      {
        // Ask for the real GPS chip rather than a cheap wifi guess. Costs battery.
        enableHighAccuracy: true,
        // Never hand us a cached reading older than 2 seconds.
        maximumAge: 2000,
        timeout: TUNING.gps.firstFixTimeoutMs,
      }
    );
  }

  private handleRealReading(position: GeolocationPosition): void {
    // Dev-mode fake GPS wins if it is switched on -- ignore the real phone.
    if (this.fakePosition) return;

    const raw: LatLng = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    const accuracy = position.coords.accuracy;

    // Throw away readings the phone itself admits are near-useless. These are
    // usually wifi or cell-tower guesses that would yank the anchor across town.
    if (accuracy > TUNING.gps.rejectWorseThanMetres) {
      console.info(`[gps] ignored a reading claiming +/-${accuracy.toFixed(0)} m`);
      return;
    }

    if (this.firstFixTimer) {
      clearTimeout(this.firstFixTimer);
      this.firstFixTimer = null;
    }

    // Anti-cheat looks at the RAW reading, before smoothing hides the evidence.
    this.antiCheat.inspect(raw, accuracy, position.timestamp);

    const anchor = this.smoother.update(raw, accuracy, position.timestamp);

    this.emit({
      anchor,
      raw,
      accuracyMetres: accuracy,
      source: 'real-gps',
      status: 'live',
      message: 'Location live',
    });
  }

  private handleError(error: GeolocationPositionError): void {
    if (this.firstFixTimer) {
      clearTimeout(this.firstFixTimer);
      this.firstFixTimer = null;
    }

    // Translate the browser error numbers into something a human can act on.
    if (error.code === error.PERMISSION_DENIED) {
      this.emit({
        status: 'permission-denied',
        message:
          'Location permission was refused. Tap the padlock in the address bar, allow location, then reload.',
      });
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      this.emit({
        status: 'unavailable',
        message: 'The phone cannot work out where it is right now.',
      });
    } else {
      this.emit({
        status: 'timed-out',
        message: 'Location is taking too long. Try going outside.',
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Fake GPS -- DEV MODE ONLY                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Take over from the real phone GPS and pretend to be at a given spot.
   * This is what lets you test the whole game sitting at your desk.
   * Only the dev panel calls this, and the dev panel cannot exist in a
   * production build.
   */
  setFakePosition(position: LatLng): void {
    const isFirstFake = this.fakePosition === null;
    this.fakePosition = position;

    if (isFirstFake) {
      // Do not let the smoother slide slowly from your real location to the fake
      // one -- that would look like a bug. Jump straight there instead.
      this.smoother.reset();
      this.antiCheat.reset();
    }

    const now = performance.timeOrigin + performance.now();
    const anchor = isFirstFake
      ? this.smoother.forceTo(position, now)
      : this.smoother.update(position, TUNING.gps.minimumAccuracyMetres, now);

    this.emit({
      anchor,
      raw: position,
      accuracyMetres: TUNING.gps.minimumAccuracyMetres,
      source: 'fake-gps-dev',
      status: 'live',
      message: 'DEV: using fake GPS',
    });
  }

  /** Hand control back to the real phone GPS. */
  clearFakePosition(): void {
    if (!this.fakePosition) return;
    this.fakePosition = null;
    this.smoother.reset();
    this.antiCheat.reset();
    this.emit({
      source: 'real-gps',
      status: 'waiting-for-fix',
      message: 'Back on real GPS, waiting for a fix...',
    });
  }

  isUsingFakeGps(): boolean {
    return this.fakePosition !== null;
  }

  /** How unsure the smoother currently is, in metres. Dev readout only. */
  smoothingUncertaintyMetres(): number {
    return this.smoother.uncertaintyMetres();
  }

  /** Shut everything down. */
  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.firstFixTimer) clearTimeout(this.firstFixTimer);
  }
}
