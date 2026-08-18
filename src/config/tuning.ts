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

/**
 * One flavour of monster. The shooting fields are optional because only the
 * spitter uses them -- describing that explicitly is what lets the rest of the
 * code ask "does this one shoot?" without guessing.
 */
export interface MonsterType {
  name: string;
  /** REAL metres per second. Must stay under 1.4 -- see the note below. */
  speedMps: number;
  health: number;
  damagePerSecond: number;
  radiusMetres: number;
  xp: number;
  colour: [number, number, number, number];
  /** Relative chance of a nest producing this one. */
  weight: number;
  /** Shooters only: how far away they stop and open fire. */
  rangeMetres?: number;
  reloadSeconds?: number;
  shotDamage?: number;
  shotSpeedMps?: number;
}

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
     * A monster must be at least this close before the camera counts it as a
     * fight and zooms in.
     *
     * Monsters exist from the moment a nest wakes, well over a hundred metres
     * away. Treating those as "combat" pulled the camera down to a 76 m view of
     * an empty street while everything interesting happened off screen -- the
     * game looked completely dead for the first minute.
     */
    combatWhenMonsterWithinMetres: 55,
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
  /* WALLS -- real buildings, and what to do when there are none             */
  /* ---------------------------------------------------------------------- */
  walls: {
    /**
     * How far around you we load buildings, in metres. Needs to comfortably
     * exceed the navigation view, so monsters never walk through a house that
     * happens to be just off screen.
     */
    loadRadiusMetres: 700,
    /**
     * Walk this far from where the walls were last worked out and we rebuild
     * them. Bigger means less work; smaller means the edge of the world stays
     * further away. This never happens per frame -- only when you travel.
     */
    rebuildAfterMovingMetres: 250,
    /**
     * Below this many real buildings nearby, we decide the neighbourhood is too
     * empty for a good fight and generate obstacles instead.
     * Measured for scale: central London gives ~1545 buildings per km2, Da Nang
     * ~225, and an unmapped area 0.
     */
    tooFewBuildingsForAFight: 25,
    /** How many obstacles to invent when there is nothing real to fight around. */
    fallbackObstacleCount: 18,
    /**
     * How wide the player is, for bumping into things. Slightly smaller than the
     * drawn circle so you can slip down alleys that look passable.
     */
    playerCollisionRadiusMetres: 2.2,
  },

  /* ---------------------------------------------------------------------- */
  /* MONSTERS                                                                */
  /* ---------------------------------------------------------------------- */
  monsters: {
    /**
     * READ THIS BEFORE CHANGING ANY SPEED.
     *
     * HEALTH WAS DOUBLED after the shooters were removed. Without it the front
     * rank died exactly as fast as the next rank arrived, so a siege line formed
     * about 20 m out and never closed -- measured: eight minutes, 440 monsters
     * alive, and the player never once took damage. Tougher monsters break that
     * stalemate by surviving the approach.
     *
     * Every monster speed below is in REAL metres per second, and every one is
     * under 1.4 -- the speed of a walking human. That is a safety rule from the
     * brief, not a balance choice: it guarantees you can always walk away from
     * any fight at a normal pace. Nothing in this game may ever require somebody
     * to hurry in the real world.
     *
     * A consequence worth understanding: the character you steer moves at 22 m/s
     * inside its 28 m leash, which is roughly twenty times faster than the
     * monsters. That is deliberate. The danger is NOT that monsters catch you --
     * it is that hundreds of them close in from every side at once and leave you
     * nowhere to stand. Pressure comes from numbers and encirclement, not speed.
     *
     * If combat ever feels toothless, raise their NUMBERS, not their speed.
     */
    types: [
      {
        name: 'swarmer',
        /** Fast, weak, arrives in crowds. The bread and butter. */
        speedMps: 1.3,
        health: 20,
        damagePerSecond: 10,
        radiusMetres: 1.6,
        xp: 1,
        colour: [220, 70, 70, 255],
        weight: 70,
      },
      {
        name: 'brute',
        /** Slow and tough. Blocks alleys and soaks damage. */
        speedMps: 0.75,
        health: 110,
        damagePerSecond: 22,
        radiusMetres: 2.8,
        xp: 5,
        colour: [180, 60, 110, 255],
        weight: 20,
      },
      {
        name: 'spitter',
        /**
         * Stops at a distance and shoots. Its shots are stopped by real
         * buildings, so ducking behind a house genuinely saves you -- this is
         * the type that makes the map matter tactically.
         */
        speedMps: 1.0,
        health: 18,
        damagePerSecond: 0,
        radiusMetres: 1.8,
        xp: 3,
        colour: [230, 140, 50, 255],
        /**
         * SET TO 0 ON REQUEST: nothing shoots at the player any more.
         *
         * Raise this back to 10 and spitters return. Worth knowing what comes
         * back with them: this is the only monster that makes buildings matter
         * TACTICALLY rather than just physically. Walls still funnel the swarm
         * without it, but ducking behind a house to break line of fire is a
         * move that no longer exists.
         */
        weight: 0,
        rangeMetres: 34,
        reloadSeconds: 2.4,
        shotDamage: 9,
        shotSpeedMps: 26,
      },
      {
        name: 'stalker',
        /**
         * The spitter's replacement. Quick and fragile, and it hurts on contact
         * rather than at range -- so the pressure still varies, but nothing
         * shoots at you.
         */
        speedMps: 1.35,
        health: 46,
        damagePerSecond: 17,
        radiusMetres: 2.0,
        xp: 3,
        colour: [230, 140, 50, 255],
        weight: 10,
      },
    ] as MonsterType[],

    /** Monsters further than this from the player give up and vanish. */
    despawnBeyondMetres: 320,
    /**
     * How hard monsters push each other apart, so a crowd spreads into a mass
     * rather than stacking into one dot. Costs performance -- see the note in
     * PLAYBOOK about the spatial grid.
     */
    separationStrength: 3.2,
    /**
     * If a monster makes no progress for this long, it shoves itself sideways.
     * Real buildings have awkward corners and a swarm will find every one.
     */
    unstickAfterSeconds: 0.7,
  },

  /* ---------------------------------------------------------------------- */
  /* NESTS -- where monsters come from                                       */
  /* ---------------------------------------------------------------------- */
  nests: {
    /** How many exist in each patch of world. */
    countPerCell: 2,
    /**
     * How far from you they are placed, in metres.
     *
     * This is a tighter constraint than it looks. Monsters must stay slower
     * than a walking human, so a nest 200 m away takes them over two and a half
     * minutes to reach you -- measured, and it made the opening of a run
     * completely empty. Nests have to be close enough that something is always
     * arriving, yet far enough that walking to one is a real journey.
     *   CLOSER  = pressure arrives sooner, nests feel less like a destination.
     *   FURTHER = long quiet openings. Below about 100 m the wait disappears.
     */
    minDistanceMetres: 70,
    maxDistanceMetres: 170,
    /** Seconds between monsters when a nest is brand new. */
    startingSpawnIntervalSeconds: 2.2,
    /**
     * The shortest a nest's spawn interval can get, however long it lives.
     * This is the ceiling on how bad things can become if you ignore it.
     */
    fastestSpawnIntervalSeconds: 0.28,
    /**
     * How long a nest takes to reach full fury, in seconds.
     *   SHORTER = pressure escalates alarmingly; a nest is an emergency.
     *   LONGER  = you can safely ignore a nest for a while.
     */
    escalationOverSeconds: 240,
    /**
     * How many monsters are already on their way when a run begins, and how far
     * out they start.
     *
     * Without this the first minute is empty: monsters are slower than walking,
     * so from a nest 120 m away the first one takes a minute and a half to
     * arrive. The brief is explicit that opening the app should never be boring,
     * so the opening wave starts partway along the journey instead of at the
     * nest. They still come from the nests -- they simply set off earlier.
     */
    openingWaveCount: 7,
    openingWaveMinMetres: 34,
    openingWaveMaxMetres: 62,

    /** A nest will not have more than this many of its monsters alive at once. */
    maxAlivePerNest: 220,
    /** How big a nest looks, in metres. */
    radiusMetres: 6,
  },

  /* ---------------------------------------------------------------------- */
  /* CLEARING A NEST -- the part that needs real walking                     */
  /* ---------------------------------------------------------------------- */
  capture: {
    /**
     * How close YOUR REAL POSITION must be to a nest to start clearing it.
     *
     * This is deliberately measured from your GPS anchor and not from the
     * character you steer. The leash is only 28 m, so a nest 100 m away simply
     * cannot be reached by thumb -- you have to walk there. That is the whole
     * design: monsters come to you so opening the app is never boring, but
     * PROGRESS costs footsteps.
     */
    radiusMetres: 26,
    /**
     * Seconds of holding position to destroy a nest.
     *   SHORTER = nests are a quick errand.
     *   LONGER  = clearing one is an event you plan for.
     * Note there is NO time limit on getting there. Nothing in this game may
     * ever reward hurrying in the real world.
     */
    holdSeconds: 50,
    /**
     * How much faster the nest spawns while you are clearing it. This is the
     * "under heavy attack" part -- it fights hardest at the end.
     */
    spawnMultiplierWhileCapturing: 3.4,
    /**
     * How fast progress drains if you step away, as a fraction of fill speed.
     * Deliberately gentle: stepping back from traffic, or GPS drifting, must
     * never wipe out a minute of work.
     */
    decayRate: 0.35,
    /** Essence for clearing a nest, before the age bonus. */
    baseReward: 30,
    /** Extra essence for every minute the nest had been alive. */
    rewardPerMinuteAlive: 8,
  },

  /* ---------------------------------------------------------------------- */
  /* THE PLAYER IN COMBAT                                                    */
  /* ---------------------------------------------------------------------- */
  player: {
    maxHealth: 100,
    /**
     * Health regained per second, so small mistakes are not permanent.
     *
     * Lowered from 0.8. With the shooters gone, this quietly out-healed every
     * scratch a crowd could inflict -- measured: eight minutes with 436 monsters
     * around and health never fell below 112 of 142. Regeneration should forgive
     * a mistake, not erase a siege.
     */
    healthRegenPerSecond: 0.45,
    /**
     * Seconds of protection after being hit, so a crowd cannot delete you.
     * Shortened from 0.55 for the same reason: standing inside a swarm should
     * cost something.
     */
    invulnerableAfterHitSeconds: 0.4,
    /** How close an experience orb must be before it flies to you. */
    pickupRadiusMetres: 14,
    /** How fast orbs fly in once they notice you. */
    pickupSpeedMps: 34,
  },

  /* ---------------------------------------------------------------------- */
  /* WEAPONS -- these fire themselves; the player never aims                 */
  /* ---------------------------------------------------------------------- */
  weapons: {
    /** The weapon everyone starts with. */
    startingBoltDamage: 7,
    startingBoltIntervalSeconds: 0.85,
    startingBoltRangeMetres: 42,
    startingBoltSpeedMps: 40,
    /** How long a shot lives before fading, in seconds. */
    projectileLifetimeSeconds: 2.2,
  },

  /* ---------------------------------------------------------------------- */
  /* LEVELLING                                                               */
  /* ---------------------------------------------------------------------- */
  levelling: {
    /**
     * Experience needed for the first level.
     * Raised from 5, then from 9, both times because levels arrived so fast
     * that the choice stopped feeling like a choice.
     */
    firstLevelXp: 14,
    /**
     * Each level costs this much more than the last.
     *   1.0  = every level costs the same, so they keep coming.
     *   1.35 = levels slow down noticeably, so early choices matter more.
     * Raised from 1.28, then from 1.36. Each level now costs 45% more than the
     * one before, so the early picks compound and late levels are earned rather
     * than collected.
     */
    xpGrowthPerLevel: 1.45,
    /** How many upgrade cards to offer at each level-up. */
    cardsOffered: 3,
  },

  /* ---------------------------------------------------------------------- */
  /* MONSTER NAVIGATION                                                      */
  /* ---------------------------------------------------------------------- */
  navigation: {
    /**
     * How often the whole swarm's routes are recalculated, in milliseconds.
     * This is ONE calculation shared by every monster, so it is cheap -- but it
     * is not free, and it does not need to be instant.
     *   LOWER  = monsters react to your movement faster, more work per second.
     *   HIGHER = monsters briefly keep heading where you WERE. At 250 ms you
     *            would have to sprint to notice.
     */
    recalculateEveryMs: 250,
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
