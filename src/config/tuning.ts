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
     * SET THIS TO 0 TO REMOVE THE THUMBSTICK ENTIRELY. The character is then
     * pinned to your real position and moves only when you do, and the stick
     * disappears from the screen.
     *
     * Before doing that, the two things the brief warned about, in your own
     * words: dodging becomes something you do with your feet on a pavement
     * while looking at a phone, and the character inherits the raw wobble of
     * GPS, which is 5-20 m. The leash exists precisely to avoid both. It is
     * NOW SET TO 0 ON THE DESIGNER'S DECISION, made after the trade-off was put
     * to her: there is no steered character any more. You are the blue dot,
     * exactly where your phone says you are, and the only way to move is to
     * walk. Set it back to 28 to restore the rope and the thumbstick.
     */
    radiusMetres: 0,
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
     * HEALTH IS A BALANCE BETWEEN TWO MEASURED FAILURES, and it is worth knowing
     * which way each one goes.
     *
     * Too tough (55 for a swarmer) and the starting weapon needs seven seconds
     * per kill: eleven kills in a whole run, no experience, no upgrades, dead at
     * level one. Too fragile and a fully upgraded player pushes the swarm back
     * to a ring that never closes and cannot lose.
     *
     * What actually brings monsters to you is NUMBERS, not toughness -- they
     * arrive because a single-target weapon cannot keep up with ninety of them.
     *
     * The older note below still applies to the shape of the problem. This is the number
     * that decides whether the game is a fight or a screensaver. Measured: a
     * monster needs about four seconds under fire to close from the edge of your
     * weapons to touching distance, so anything that dies faster than that can
     * never actually reach you -- and for a long while nothing did.
     *
     * Health was doubled once already after the shooters were removed. Without it the front
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
     *
     * SPEEDS WERE CUT ONCE MORE, and this one is a safety rule rather than a
     * balance choice. The swarmer used to move at 1.30 m/s and the stalker at
     * 1.35, against an ordinary walking pace of about 1.3. The brief says
     * monsters must be CLEARLY slower than a walking human so that a player can
     * always walk away -- and measured, they could not: fleeing a crowd on foot
     * lost health the entire way and still ended in death.
     *
     * It went unnoticed because nothing ever touched the player until the last
     * few seconds of a run, so walking away was never worth trying. The moment
     * the crowd could press on you, the broken escape route mattered. Nothing
     * here may go above about 1.05 m/s.
     */
    types: [
      {
        name: 'swarmer',
        /** Fast, weak, arrives in crowds. The bread and butter. */
        speedMps: 0.95,
        health: 26,
        damagePerSecond: 6,
        radiusMetres: 1.6,
        /*
         * WORTH MORE THAN IT WAS. Not because levels should come faster in
         * principle -- they were deliberately slowed twice, and that stands --
         * but because a SECOND change landed on top without anyone re-measuring:
         * loot stopped flying to the player and has to be walked over. Two
         * brakes were applied to the same wheel.
         *
         * Measured after both: ten minutes of walking and fighting produced
         * LEVEL 3. Fifteen minutes of walking produced level 2. At that rate the
         * weapon evolutions -- which need a weapon at level four and a passive
         * taken three times -- could not be reached by anybody, ever, and the
         * cards themselves stopped being a source of depth at all.
         *
         * The curve is untouched. Only what a body is worth has changed, which
         * also means walking over the loot pays properly for the walk.
         */
        xp: 3,
        colour: [220, 70, 70, 255],
        weight: 70,
      },
      {
        name: 'brute',
        /** Slow and tough. Blocks alleys and soaks damage. */
        speedMps: 0.6,
        health: 120,
        damagePerSecond: 13,
        radiusMetres: 2.8,
        xp: 9,
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
        speedMps: 0.8,
        health: 18,
        damagePerSecond: 0,
        radiusMetres: 1.8,
        xp: 5,
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
        speedMps: 1.05,
        health: 50,
        damagePerSecond: 9,
        radiusMetres: 2.0,
        xp: 5,
        colour: [230, 140, 50, 255],
        weight: 10,
      },
    ] as MonsterType[],

    /** Monsters further than this from the player give up and vanish. */
    despawnBeyondMetres: 320,
    /** How long a monster flashes white after being hit, in seconds. */
    /**
     * How long a monster flashes white after being hit, in seconds.
     * Lengthened from 0.12 -- at that speed the tester never saw it at all
     * among a hundred moving shapes.
     */
    hitFlashSeconds: 0.22,
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
    /**
     * How many exist in each patch of world.
     *
     * Raised from 2. Most are asleep at any moment -- see activateWithinMetres
     * -- so the map can carry a dozen without a dozen swarms converging at once.
     * Walking around then means finding them, which is the point.
     */
    countPerCell: 12,
    /**
     * A nest is scenery until your real position is this close. Then it wakes,
     * starts ageing and starts spawning.
     *   SMALLER = the neighbourhood is quiet; you choose your fights.
     *   LARGER  = several nests feed the same swarm and pressure stacks fast.
     */
    activateWithinMetres: 190,
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
    maxDistanceMetres: 420,
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
     *
     * Shortened from 240 to pay for the slower monsters. With everything in the
     * game bought and the player standing still, a maxed loadout kills at 34 m
     * while the crowd only starts to press at 20 -- so nothing ever reached
     * them, and at 240 they sat at FULL HEALTH after two and a half minutes.
     * That is the immortal perimeter this file warns about further up, and the
     * remedy it prescribes is numbers rather than speed. At 150 the same player
     * is down to 56% by 110 s, while a player with nothing still dies at 89 --
     * unchanged, because early nests are nowhere near full fury yet.
     */
    escalationOverSeconds: 150,
    /**
     * How many monsters are already on their way when a run begins, and how far
     * out they start.
     *
     * Without this the first minute is empty: monsters are slower than walking,
     * so from a nest 120 m away the first one takes a minute and a half to
     * arrive. The brief is explicit that opening the app should never be boring,
     * so the opening wave starts partway along the journey instead of at the
     * nest. They still come from the nests -- they simply set off earlier.
     *
     * Brought closer a second time. Confining monsters to roads made them walk
     * further than the straight line, and from 34-62 m the first one still took
     * about a minute to arrive -- which is a minute of looking at an empty
     * street. From 16-34 m the fight starts in the first ten seconds.
     */
    openingWaveCount: 12,
    /**
     * For this long after a run starts, monsters from a nest appear partway
     * along their journey rather than at the nest itself.
     *
     * Without it there is an opening wave, it dies, and then a measured 55
     * seconds of nothing while the real ones walk over -- monsters are slower
     * than a person by design and now go the long way round by road, so the
     * first proper wave is a minute out however the nests are placed. This
     * bridges that gap and then gets out of the way.
     */
    warmupSeconds: 75,
    /**
     * How far out the warm-up reinforcements appear.
     *
     * Pushed back to 42-70 m once, because at 26-48 m every awake nest was
     * dropping monsters on the player's head and a run ended at 60 seconds on
     * level one. Brought forward again to 24-46 m now that the crowd presses on
     * you gradually instead of arriving all at once: at 42-70 m, by road and at
     * a monster's pace, the first reinforcements took SIXTY SECONDS to walk in,
     * so two thirds of every run was a flat line with nothing near you. The
     * thing that made 26-48 m brutal -- monsters landing on you intact -- is
     * also what the slower speeds and the pressure curve now handle.
     */
    warmupMinMetres: 24,
    warmupMaxMetres: 46,
    /**
     * What share of early spawns take the short cut. The rest set off from the
     * nest properly, so the stream keeps building behind the first arrivals.
     */
    warmupShare: 0.45,
    openingWaveMinMetres: 16,
    openingWaveMaxMetres: 34,

    /**
     * A nest will not have more than this many of its monsters alive at once.
     *
     * THIS NUMBER DECIDES WHETHER THE GAME CAN BE LOST. Raised from 220 after
     * measuring the reason a standing player was immortal: nests reach the cap,
     * spawning stops, and the player's damage keeps growing with every level --
     * so a perimeter forms at about 15 m and never closes again. The swarm has
     * to be able to out-grow the player, or standing still is a win.
     */
    maxAlivePerNest: 450,
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
     * How much faster the nest spawns while you are clearing it, AT THE VERY
     * END. It starts at the ordinary rate and works up to this as the nest dies.
     *
     * It used to be applied flat from the first second, which quietly made a
     * first nest impossible: measured, a fresh player walked 97 m, arrived on
     * 82% health, reached 8% progress and died five seconds later with nothing
     * to show for a minute of real walking. A moderately upgraded player, by
     * contrast, cleared three in a row and never dropped below 84% -- a cliff
     * between impossible and trivial, with no game in between.
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
    /**
     * Raised from 100. Once monsters could genuinely reach the player, several
     * touching at once removed a hundred health in about two seconds -- runs
     * ended at level one, before a single upgrade. With no way to dodge, health
     * has to be the buffer that movement used to be.
     */
    maxHealth: 180,
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
     * Healing stops for this long after anything hurts you.
     *
     * Without it, healing simply cancelled the crowd. Measured: healing 2.2 a
     * second was worth six extra seconds of life, and 3.0 a second was worth
     * SEVENTY-SEVEN -- because the squeeze from a closing crowd is a couple of
     * points a second, so anything healing faster than that made the whole
     * middle of a run free. A cliff like that between 2.2 and 3.0 is not
     * something to balance on; stacking a Field Kit with the Mending upgrade and
     * a few Second Wind cards would walk straight over it.
     *
     * So healing is now something that happens when you are NOT being pressed --
     * which is the behaviour this game wants anyway. Walking away from a swarm
     * is always allowed and always works, and this makes it pay.
     *   ZERO   = healing cancels the crowd again.
     *   LONGER = you must properly break away before you recover.
     */
    regenPausedAfterHurtSeconds: 4,
    /**
     * The most a crowd can take off you per second, however many are touching.
     *
     * Being surrounded should feel like drowning, not like a switch. Without
     * this, the instant the swarm broke through, sixty monsters at once emptied
     * a full health bar in under a second.
     *   LOWER  = you can wade through a crowd; being surrounded stops mattering.
     *   HIGHER = the moment they reach you is the moment you die.
     */
    maxContactDamagePerSecond: 42,
    /**
     * THE CROWD PRESSING IN, before it actually reaches you.
     *
     * Measured on a Da Nang street, standing still: across a 99-second run NOT
     * ONE monster ever touched the player. Health read 200 of 200 at every
     * ten-second sample right up to the end, and then the whole bar vanished
     * inside the last nine seconds. The run was a flat line and then a wall.
     *
     * That shape made every defensive number in the game worthless -- +60 health
     * bought ONE second, and so did 15% armour, and so did healing three points
     * a second. Not because the numbers were small, but because there was
     * nothing to defend against until it was already over. It also meant the
     * player got no warning: no moment of "I am at half health, time to walk
     * away", which is the one decision this game actually wants you to make.
     *
     * So monsters now press on you as they close, not only when they land on
     * you. Anything nearer than this hurts a little, more the closer it is.
     * Health becomes something spent across a run instead of a cliff at the end.
     *   ZERO   = back to the flat line and the wall.
     *   HIGHER radius = you feel the swarm from further off.
     *   HIGHER share  = closing in hurts more relative to being caught.
     */
    crowdPressure: {
      /** How far away a monster can still press on you, in metres. */
      radiusMetres: 20,
      /** At point-blank, what fraction of its bite the pressure is worth. */
      share: 0.2,
      /**
       * However thick the crowd, pressure alone can never exceed this.
       *
       * Sized by measurement, and it is sensitive. At 7 a second the crowd held
       * the ceiling continuously from about fifty seconds in, which is not a
       * bleed, it is a slower wall. At 3.5 health drifts down all run -- 100%,
       * 96% at thirty seconds, 91% at a minute -- and only steepens once the
       * swarm is genuinely on top of you.
       */
      maxPerSecond: 3.5,
    },
    /**
     * Seconds of protection after being hit, so a crowd cannot delete you.
     * Shortened from 0.55 for the same reason: standing inside a swarm should
     * cost something.
     */
    invulnerableAfterHitSeconds: 0.4,
    /**
     * Getting up again after watching an ad: how much room is cleared around
     * you, and how long you are untouchable for.
     *
     * Both exist because handing somebody a full health bar while forty monsters
     * are standing on them is not a second chance -- it is a second death, sold
     * at the price of an advert. The crowd is swept away without dropping loot,
     * so this buys time and never rewards dying.
     */
    reviveClearRadiusMetres: 26,
    reviveGraceSeconds: 3,
    /**
     * How close you must be to sweep something up.
     *
     * Loot does NOT fly to you any more, by request: you collect it by walking
     * over it, the way Vampire Survivors does.
     *
     * But walking is 1.4 m/s and monsters die up to 34 m away in every
     * direction, so this number decides whether walking is worth anything at
     * all. At 6 m a four-minute walk collected almost nothing. At 11 m, strolling
     * down a street sweeps a band 22 m wide, which is enough to be rewarding
     * without loot chasing you.
     *   SMALLER = you must walk deliberately over each piece.
     *   LARGER  = closer to the old behaviour where everything came to you.
     */
    pickupRadiusMetres: 11,
    /**
     * How fast loot hops the last couple of metres into your hand, once you are
     * already close enough to have earned it.
     *
     * This is not the old magnetism: the distance at which loot notices you is
     * still `pickupRadiusMetres`, and you still have to walk there. It only
     * removes the frustration of missing something by half a stride, or of a
     * coin resting just the wrong side of a kerb.
     */
    finalSnapSpeedMps: 26,
    /** How long loot lies on the ground before fading, in seconds. */
    lootLifetimeSeconds: 120,
    /** Chance that a dead monster leaves money as well as experience. */
    coinDropChance: 0.16,
    /** How much a coin is worth. */
    coinValue: 3,
  },

  /* ---------------------------------------------------------------------- */
  /* WEAPONS -- these fire themselves; the player never aims                 */
  /* ---------------------------------------------------------------------- */
  weapons: {
    /** The weapon everyone starts with. */
    startingBoltDamage: 11,
    startingBoltIntervalSeconds: 0.85,
    /**
     * How far the starting weapon reaches.
     *
     * Cut from 42 m. At combat zoom the screen shows about 76 m across, so
     * anything beyond roughly 34 m from the middle is off the edge -- and
     * watching your weapon fire at something you cannot see is unreadable. If
     * you cannot see it, you should not be shooting it.
     */
    startingBoltRangeMetres: 24,
    startingBoltSpeedMps: 40,
    /**
     * A hard ceiling on every weapon's reach, applied AFTER upgrade cards.
     *
     * Without this, stacking the range card eventually pushes shots past the
     * edge of the screen again and the same unreadable problem returns. Range
     * upgrades still help -- they get short weapons up to this line faster --
     * but nothing ever fires at something you cannot see.
     */
    maxRangeMetres: 34,
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
    /**
     * How much dearer it is for a monster to step off a road.
     *
     *   1   = roads are ignored; monsters cut straight across yards.
     *   3.5 = they follow streets and only cut a corner when it is worth it.
     *   10  = they will walk absurdly far rather than cross a car park.
     */
    offStreetPenalty: 2.5,
    /**
     * Keep monsters ON the roads rather than merely preferring them.
     *
     * With this on, anything that is not a road is a wall as far as monsters
     * are concerned, so a swarm arrives down the street and around the corner
     * rather than across the neighbours' yards.
     *
     * It switches itself off wherever roads cover less than an eighth of the
     * area -- a beach, a park, an unmapped district -- because otherwise there
     * would be nowhere for anything to walk and the game would look dead.
     */
    streetsOnly: true,
    /**
     * How wide a road counts as, either side of its centre line, in metres.
     *
     * Lowered from 5. At 5 m the painted roads covered 53% of the whole
     * neighbourhood, which makes "prefer streets" meaningless -- almost
     * everywhere was a street. Narrow roads make the preference bite.
     */
    streetHalfWidthMetres: 2.5,
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

    /**
     * How often the PLACEHOLDER ad pretends to fail, 0 to 1.
     *
     * MONETIZATION.md asks for the failure path to be exercised deliberately,
     * because it carries the promise that matters most in this game's business
     * model: the reward is paid whether or not the ad turns up. A path that is
     * tested once and then never again is a path that quietly rots.
     *
     * Set to 0 to see the ordinary run of things, or 1 to watch every failure.
     * A real ad network replaces all of this and supplies its own failures.
     */
    fakeAdFailureRate: 0.25,

    /**
     * LOW POWER MODE.
     *
     * This is a game you are asked to take on an hour's walk, which makes the
     * battery a design constraint and not an afterthought: a game that strands
     * somebody a mile from home with a dead phone has done real harm, and no
     * amount of good combat makes up for it.
     *
     * Three things drain a phone here. The GPS chip, which we cannot turn down
     * without breaking the entire game. The screen, which is not ours. And the
     * drawing -- which is ours, and is the whole of what this section reduces.
     *
     * Every one of these is a CEILING, not a target. Nothing is made worse when
     * the mode is off.
     */
    lowPower: {
      /**
       * Milliseconds between frames. 33 is thirty a second.
       *
       * Halving the frame rate roughly halves the drawing work, and the map
       * library redraws only when we ask it to -- so this quietly halves ITS
       * work too, which is the larger half. Thirty a second on a map that moves
       * at walking pace is hard to tell from sixty.
       */
      frameIntervalMs: 33,
      /**
       * The swarm stops growing here rather than at `maxAlivePerNest`.
       *
       * Kept high enough that the fight is still the fight. Being told the game
       * is "the cheap version" whenever you want your battery to last is a poor
       * trade, and the number below is far past the point where a crowd reads as
       * a crowd.
       */
      maxMonstersAlive: 150,
      /** Pathfinding is rebuilt half as often. It costs about 4 ms each time. */
      flowFieldIntervalMultiplier: 2,
    },

    /**
     * Offer low power mode when the phone's battery falls below this fraction.
     * Only Android tells us; iPhones keep it to themselves, so there the mode is
     * still there, it simply has to be switched on by hand.
     */
    offerLowPowerBelowBattery: 0.25,
  },
} as const;
