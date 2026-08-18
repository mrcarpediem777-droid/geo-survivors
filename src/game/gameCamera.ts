/**
 * THE CAMERA -- and the automatic combat zoom.
 * ============================================
 * This solves the first of the two hard problems in the brief.
 *
 * THE PROBLEM: a person walks about 1.4 metres per second. An action game
 * character crosses its arena in a second or two. At a normal map zoom you would
 * be moving roughly two pixels per second, and combat would be impossible.
 *
 * THE ANSWER: when you are fighting, the camera glides in until the screen shows
 * about 76 metres of real ground. At that scale your actual street, your actual
 * junction and your actual buildings are all still clearly recognisable, but the
 * distances are short enough that a game character can cross them meaningfully.
 * When you stop, it glides back out to a view of a few hundred metres so you can
 * see where you are going.
 *
 * NEVER A CUT, NEVER A LOADING SCREEN. The transition is always a smooth glide,
 * because the whole premise of the game is that you never leave the map.
 *
 * HOW WE DRIVE THE MAP: we work out the exact centre and zoom ourselves every
 * frame and then tell the map to be there immediately. We deliberately do not
 * use the map's own animation features -- ours has to be interruptible at any
 * instant, and two animation systems fighting over the same camera produces
 * stutter that is very hard to track down later.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LatLng } from '../location/geo';
import { TUNING } from '../config/tuning';

export class GameCamera {
  private map: MapLibreMap;

  /** Where the camera is looking. Eased toward the character every frame. */
  private centre: LatLng | null = null;

  /** The zoom we are currently at, and the one we are heading toward. */
  private zoom: number;
  private targetZoom: number;

  /** True while the player is actively steering. */
  private inCombat = false;

  /** When the player last touched the controls. */
  private lastEngagedAtMs = 0;

  /** Set while the player has dragged the map themselves -- we back off. */
  private suspended = false;

  constructor(map: MapLibreMap) {
    this.map = map;
    this.zoom = TUNING.camera.startZoom;
    this.targetZoom = TUNING.camera.navigationZoom;

    // If the player grabs the map, stop fighting them for control.
    this.map.on('dragstart', () => {
      this.suspended = true;
    });
  }

  /** Hand control back to the game, e.g. when "centre on me" is tapped. */
  resume(): void {
    this.suspended = false;
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  isInCombat(): boolean {
    return this.inCombat;
  }

  currentZoom(): number {
    return this.zoom;
  }

  /**
   * Advance the camera one frame.
   *
   * @param deltaSeconds  time since the last frame
   * @param followTarget  where the camera should be looking (the character)
   * @param engaged       is the player steering right now?
   * @param nowMs         current time
   */
  update(
    deltaSeconds: number,
    followTarget: LatLng | null,
    engaged: boolean,
    nowMs: number
  ): void {
    if (!followTarget) return;

    // --- Decide whether we are "in combat" -------------------------------
    // For now, steering IS combat. Once monsters exist (M4) this also becomes
    // true when something hostile is nearby, so the camera closes in before you
    // have to react rather than after.
    if (engaged) {
      this.lastEngagedAtMs = nowMs;
      this.inCombat = true;
    } else if (this.inCombat && nowMs - this.lastEngagedAtMs > TUNING.camera.leaveCombatAfterMs) {
      this.inCombat = false;
    }

    this.targetZoom = this.inCombat
      ? TUNING.camera.combatZoom
      : TUNING.camera.navigationZoom;

    if (this.suspended) return;

    // --- Glide the zoom --------------------------------------------------
    // Work out a per-frame easing rate from the transition time in the tuning
    // file, so the number there means what it says regardless of frame rate.
    const zoomEase = 1 - Math.pow(0.001, deltaSeconds * (1000 / TUNING.camera.zoomTransitionMs));
    this.zoom += (this.targetZoom - this.zoom) * zoomEase;

    // --- Glide the centre ------------------------------------------------
    if (!this.centre) {
      this.centre = { ...followTarget };
    } else {
      const followEase = 1 - Math.pow(1 - TUNING.camera.followSmoothing, deltaSeconds * 60);
      this.centre.lng += (followTarget.lng - this.centre.lng) * followEase;
      this.centre.lat += (followTarget.lat - this.centre.lat) * followEase;
    }

    // --- Tell the map ----------------------------------------------------
    // `jumpTo` means "be here now". The smoothness comes from us, above.
    this.map.jumpTo({
      center: [this.centre.lng, this.centre.lat],
      zoom: this.zoom,
    });
  }

  /** Put the camera straight onto a position with no glide. First fix only. */
  snapTo(position: LatLng): void {
    this.centre = { ...position };
    this.suspended = false;
    this.map.jumpTo({
      center: [position.lng, position.lat],
      zoom: this.zoom,
    });
  }
}
