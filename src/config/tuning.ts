/**
 * THE TUNING FILE  --  every number that changes how the game FEELS lives here.
 * ============================================================================
 * You are meant to edit this file. Nothing in here will break the game if you
 * change it; the worst that happens is the game feels wrong and you change it back.
 *
 * Read TUNING.md (in the project root) for a plain-language guide to what each
 * number does and which way to push it for a given feeling.
 *
 * RULE FOR CLAUDE: no gameplay number may be typed anywhere else in the codebase.
 * If a number affects feel, it belongs in this file.
 */

export const TUNING = {
  /* ---------------------------------------------------------------------- */
  /* CAMERA -- how close the map is, and how it moves                        */
  /* ---------------------------------------------------------------------- */
  camera: {
    /**
     * "Zoom" on a map is a number from roughly 0 (whole planet) to 22 (a tabletop).
     * Each +1 halves how much ground you see.
     *
     * COMBAT zoom: tight enough that the player character can cross the screen in
     * a few seconds, loose enough that you can still recognise your own street.
     *
     * MEASURED on a 375 px-wide phone at latitude 16: this shows **76 metres**
     * of real ground across the screen, which is inside the 60-80 m the whole
     * design depends on. Check it yourself in the dev panel readout.
     */
    combatZoom: 19.5,
    /**
     * NAVIGATION zoom: pulled back so you can see where the nests are and plan a
     * walk. MEASURED: about 610 metres across on the same phone.
     */
    navigationZoom: 16.5,
    /** Zoom on first load, before we know if there is a fight. About 305 m across. */
    startZoom: 17.5,
    /** How long the smooth zoom between navigation and combat takes, in milliseconds. */
    zoomTransitionMs: 1400,
    /**
     * How long after you stop steering before the camera pulls back out to the
     * navigation view.
     *   TOO SHORT and the camera yo-yos every time you pause for breath.
     *   TOO LONG and it feels like it has stopped listening to you.
     */
    leaveCombatAfterMs: 4000,
    /**
     * How quickly the camera catches up to the character, as a fraction per
     * frame. Lower is lazier and calmer; higher glues the character to the
     * middle of the screen and makes the world feel like it is sliding about.
     */
    followSmoothing: 0.14,
    /** Map tilt in degrees. 0 = straight down. Keep low; tilt hurts readability. */
    pitch: 0,
    /**
     * Hard limits so the player can never pinch-zoom somewhere unplayable.
     * maxZoom is deliberately a little above combatZoom, leaving room to tune
     * the fight tighter without hitting the ceiling.
     */
    minZoom: 14,
    maxZoom: 20.5,
  },

  /* ---------------------------------------------------------------------- */
  /* GPS ANCHOR -- turning jittery real GPS into a stable point              */
  /* ---------------------------------------------------------------------- */
  gps: {
    /**
     * How much we let the smoothed position drift on its own, in metres per second.
     * This is the single most important smoothing number.
     *   LOWER  (e.g. 0.5) = very steady, but slow to notice you started walking.
     *   HIGHER (e.g. 6)   = responds to walking instantly, but jitters when still.
     * 2 m/s is a little above walking pace, which is a good compromise.
     */
    smoothingMetresPerSecond: 2,
    /**
     * GPS readings claiming worse accuracy than this (in metres) are thrown away
     * entirely -- they are usually wifi-based guesses, not real GPS.
     */
    rejectWorseThanMetres: 100,
    /** Assume at least this much error even if the phone claims it is perfect. */
    minimumAccuracyMetres: 3,
    /** Give up waiting for a first GPS fix after this long and show a message. */
    firstFixTimeoutMs: 20000,
  },

  /* ---------------------------------------------------------------------- */
  /* THE LEASH -- how far the character may roam from your real position     */
  /* ---------------------------------------------------------------------- */
  leash: {
    /**
     * The character you steer with the joystick can never get further than this
     * many metres from your real (smoothed) GPS position.
     *   SMALLER = more honest to your real location, less room to dodge.
     *   LARGER  = more comfortable combat, but the game drifts from reality.
     * Used from M2 onward.
     */
    radiusMetres: 28,
    /** How fast the steered character moves, in metres per second. */
    characterSpeedMps: 22,
    /**
     * How firmly the leash pulls the character back when you walk away.
     * 0 = no pull (character left behind), 1 = instantly snapped along with you.
     */
    followStrength: 0.12,
  },

  /* ---------------------------------------------------------------------- */
  /* ANTI-CHEAT -- detection thresholds. We only ever LOG, never block.      */
  /* ---------------------------------------------------------------------- */
  antiCheat: {
    /** Faster than this between two readings (metres/second) is not walking. ~40 km/h. */
    impossibleSpeedMps: 11,
    /** A single jump further than this many metres is a teleport, not movement. */
    teleportJumpMetres: 250,
    /** How many readings in a row must be suspiciously straight to flag it. */
    straightLineSampleCount: 12,
    /**
     * How straight is "too straight". Real GPS always wobbles; a perfect line
     * means software is generating the positions. 0 = perfectly straight.
     */
    straightLineToleranceMetres: 1.5,
  },

  /* ---------------------------------------------------------------------- */
  /* PERFORMANCE                                                             */
  /* ---------------------------------------------------------------------- */
  performance: {
    /** What we are aiming for on a mid-range Android. */
    targetFps: 60,
    /** Below this for a sustained period, suggest low power mode. */
    lowFpsWarningThreshold: 40,
    /** How often the on-screen dev readout refreshes, in milliseconds. */
    devReadoutIntervalMs: 500,
  },
} as const;
