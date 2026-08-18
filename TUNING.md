# Tuning guide

Every number that changes how the game **feels** lives in one file:
**`src/config/tuning.ts`**. This document explains what each one does and which way to
push it.

**You cannot break the game from this file.** The worst that happens is it feels wrong and
you change the number back. Edit it, save, and the game reloads instantly.

> Numbers marked ⏳ are not used yet — they belong to a milestone we have not built.
> They are listed so you know what is coming.

---

## Camera — how close the map is

| Number | Now | Shows about | What it does |
|---|---|---|---|
| `combatZoom` | 19.5 | **76 m across** | How far in the camera pulls when fighting. |
| `navigationZoom` | 16.5 | 610 m across | How far out it pulls when travelling. |
| `startZoom` | 17.5 | 305 m across | Where it sits when you open the app. |
| `zoomTransitionMs` | 1400 | — | How long the glide between the two takes. |
| `leaveCombatAfterMs` | 4000 | — | Idle time before the camera pulls back out. |
| `followSmoothing` | 0.14 | — | How eagerly the camera chases the character. |
| `pitch` | 0 | — | Map tilt. 0 is straight down. |
| `minZoom` / `maxZoom` | 14 / 20.5 | — | Hard limits on pinch-zooming. |

**Map zoom is a strange scale.** Each +1 *halves* how much ground you see. So 19.5 is
twice as close as 18.5, not 5% closer. Nudge it by 0.5 at a time, and expect that to be
a big change.

Measured on a 375 px-wide phone (the narrow side of a typical phone held upright):

| zoom | ground across the screen |
|---|---|
| 16.5 | 610 m |
| 17.5 | 305 m |
| 18.5 | 152 m |
| 19.0 | 108 m |
| **19.5** | **76 m** ← combat |
| 20.0 | 54 m |

- **Combat feels cramped, you cannot see monsters coming** → *lower* `combatZoom` to 19.0
- **Your character crawls, the fight feels sluggish** → *raise* `combatZoom` to 20.0
- **The zoom transition feels jarring** → *raise* `zoomTransitionMs` toward 2000
- **The zoom feels sluggish and you are waiting for it** → *lower* toward 900
- **The camera yo-yos every time you pause** → *raise* `leaveCombatAfterMs` toward 7000
- **The camera feels like it stopped listening** → *lower* it toward 2500
- **The world slides about under you** → *lower* `followSmoothing` toward 0.08
- **The character drifts away from the middle** → *raise* it toward 0.22

Verified: steering pulls the camera to exactly 19.5, and ten seconds of standing still
returns it to exactly 16.5.

> **The check that matters:** open the dev panel and read the "screen ___ m across" line.
> At combat zoom it should say roughly **60–80 m**. That is the number the whole design
> depends on — close enough for an action game, wide enough to recognise your own street.
>
> ⚠️ **This is measured across the screen's narrow side.** A wider phone shows a bit more.
> If you ever test on a tablet, expect combat to feel much wider and wrong — that is the
> screen, not the tuning.

---

## GPS — turning a jittery signal into a steady point

| Number | Now | What it does |
|---|---|---|
| `smoothingMetresPerSecond` | 2 | **The most important number here.** How freely the smoothed position is allowed to move on its own. |
| `rejectWorseThanMetres` | 100 | Readings worse than this are binned as junk. |
| `minimumAccuracyMetres` | 3 | We never fully trust a phone claiming perfection. |
| `firstFixTimeoutMs` | 20000 | How long to wait before saying "no GPS yet". |

**`smoothingMetresPerSecond` is the one to play with.** It trades steadiness against
responsiveness, and there is no correct answer — only what feels right outdoors.

- **The dot twitches while I stand still** → *lower* it, try 1
- **I start walking and the dot lags behind me** → *raise* it, try 4
- 2 is a little above walking pace, which is a reasonable middle.

> **How to test it properly:** dev panel → tick "Fake GPS" → tick "Add realistic GPS
> wobble". Watch the grey dot (raw) versus the blue dot (smoothed). Measured result at the
> current setting: **5 m of raw jitter becomes 1.3 m — about 3.8× steadier.**

If `rejectWorseThanMetres` is too low you will get no position at all indoors. If it is
too high, a bad wifi-based guess can yank you across town.

---

## The leash — how far the character may roam from the real you

| Number | Now | What it does |
|---|---|---|
| `radiusMetres` | 28 | How far the character can get from your real position. |
| `characterSpeedMps` | 22 | How fast the joystick moves the character. |
| `followStrength` | 0.12 | How firmly the leash drags the character when you walk. |

This is the compromise that makes the game playable **standing still**, which is both
safer and far more pleasant than requiring you to physically dodge.

- **Combat feels cramped, nowhere to kite** → *raise* `radiusMetres` toward 35
- **The game feels disconnected from where I actually am** → *lower* toward 20
- **The character feels sluggish** → *raise* `characterSpeedMps`
- **The character feels twitchy and hard to place** → *lower* it
- **Walking feels like dragging a weight** → *raise* `followStrength` toward 0.2
- **The character snaps to me too eagerly when I walk** → *lower* toward 0.06

⚠️ **Do not raise `radiusMetres` above about 40.** Past that the game stops being about
your real location and the whole premise quietly dies.

> **Measured behaviour, so the number does not surprise you.** The leash is elastic, not a
> wall. Holding the stick at full push settles the character at about **30.8 m** with
> `radiusMetres` set to 28 — roughly 10% of stretch, because the pull-back and your push
> balance out. That is deliberate: a hard wall feels like a bug, a gentle tug feels like a
> rope. If you want a true hard limit of 30 m, set the number to about 27.
>
> Also verified: walking 84 m in the real world while fighting the leash drags the
> character along the whole way — it never gets left behind and never teleports.

---

## Anti-cheat — thresholds for spotting faked GPS

| Number | Now | What it does |
|---|---|---|
| `impossibleSpeedMps` | 11 | Faster than this (≈40 km/h) is not walking. |
| `teleportJumpMetres` | 250 | A single jump bigger than this is a teleport. |
| `straightLineSampleCount` | 12 | How many readings in a row to examine. |
| `straightLineToleranceMetres` | 1.5 | How straight is "too straight" to be human. |

**These only ever write a note in a list. Nothing is blocked and nobody is punished.**
That is deliberate: real GPS does crazy things in tunnels and lifts, and any blocking rule
would punish honest players. We want to see how common cheating is before deciding what to
do about it.

`impossibleSpeedMps` at 11 will legitimately trigger if someone plays on a bus. That is
expected and is exactly why it only logs.

> Verified working: a dead-straight synthetic path and a 2 km teleport are both caught,
> while 20 samples of realistic wobbly walking produce **zero** false alarms.

---

## Walls — real buildings, and what to do without them

| Number | Now | What it does |
|---|---|---|
| `loadRadiusMetres` | 700 | How far around you buildings are loaded. |
| `rebuildAfterMovingMetres` | 250 | How far you must walk before walls are worked out again. |
| `tooFewBuildingsForAFight` | 25 | Below this many real buildings, obstacles are invented instead. |
| `fallbackObstacleCount` | 18 | How many obstacles to invent. |
| `playerCollisionRadiusMetres` | 2.2 | How wide you are for bumping into things. |

- **Monsters appear through walls at the edge of the screen** → *raise* `loadRadiusMetres`
- **First load is slow on mobile data** → *lower* it toward 450
- **Empty places feel like a featureless field** → *raise* `fallbackObstacleCount` toward 30
- **You get snagged on corners** → *lower* `playerCollisionRadiusMetres` toward 1.8
- **You slip through gaps that look too narrow** → *raise* it toward 2.6

> **For scale, measured from real map data:** central London delivers about 1545 buildings
> per km², Da Nang about 225, and an unmapped area 0. `tooFewBuildingsForAFight` at 25 is
> counted within the 700 m load radius, so it trips only in genuinely empty places —
> beaches, open water, countryside.

> **Known rough edge:** the invented arena currently blocks only about 3% of the ground
> around you. That is cover, but it may be too thin to fight around. Worth revisiting once
> M4 gives us monsters to judge it against.

⚠️ `playerCollisionRadiusMetres` is deliberately smaller than the drawn circle, so alleys
that look passable are passable. If you make it larger than the drawn size, the character
will appear to stop short of walls, which reads as broken.

---

## Monsters

Every monster type lives in `TUNING.monsters.types`. Each has speed, health, damage, size,
experience and how common it is.

> ⚠️ **Every speed is under 1.4 m/s, the pace of a walking human, and that is a safety
> rule rather than a balance one.** It guarantees you can always walk away from any fight
> without hurrying. If combat feels too easy, raise their **numbers**, never their speed.

| Type | Speed | Health | What it does |
|---|---|---|---|
| swarmer | 1.3 | 10 | The crowd. Weak alone, lethal in numbers. |
| brute | 0.75 | 60 | Slow wall of meat. Clogs alleys. |
| spitter | 1.0 | 18 | Stops at 34 m and shoots. **Its shots are blocked by real buildings.** |

- **Fights feel toothless** → raise `weight` on brutes, or lower `fastestSpawnIntervalSeconds`
- **Fights feel unfair** → raise `startingSpawnIntervalSeconds`, or lower monster `damagePerSecond`
- **Monsters clump into one blob** → raise `separationStrength`
- **Monsters snag on corners** → lower `unstickAfterSeconds` toward 0.4

---

## Nests

| Number | Now | What it does |
|---|---|---|
| `countPerCell` | 2 | How many exist near you. |
| `minDistanceMetres` / `maxDistanceMetres` | 70 / 170 | How far away they sit. |
| `startingSpawnIntervalSeconds` | 2.2 | Seconds between monsters, when new. |
| `fastestSpawnIntervalSeconds` | 0.28 | The floor. How bad it can ever get. |
| `escalationOverSeconds` | 240 | How long a nest takes to reach full fury. |
| `maxAlivePerNest` | 220 | Ceiling on the swarm size. |

> **The distance numbers are tighter than they look.** Monsters must stay slower than a
> walking human, so a nest 200 m away takes them over two and a half minutes to reach you.
> Measured at the original 120–260 m, the first three minutes of a run were completely
> empty. At 70–170 m the first monsters arrive around 60–90 seconds and never stop.

---

## The player in a fight

| Number | Now | What it does |
|---|---|---|
| `maxHealth` | 100 | |
| `healthRegenPerSecond` | 0.8 | So one mistake is not permanent. |
| `invulnerableAfterHitSeconds` | 0.55 | Stops a crowd deleting you instantly. |
| `pickupRadiusMetres` | 14 | How close experience must be to rush to you. |

> **Experience always drifts toward you**, quickly inside that radius and slowly from
> anywhere else. That "slowly from anywhere" part is not decoration: weapons kill out to
> 42 m, the leash holds you within 28 m, and without it a measured three-minute run
> produced 36 kills and **not a single level** — everything died just out of reach.

---

## Levelling and cards

| Number | Now | What it does |
|---|---|---|
| `firstLevelXp` | 5 | Experience for the first level. |
| `xpGrowthPerLevel` | 1.28 | How much dearer each level gets. |
| `cardsOffered` | 3 | Cards shown at each level-up. |

Measured run, standing perfectly still and always taking the **first** card offered (a
deliberately poor strategy): **level 10, 87 kills, 273 monsters at peak, died at 4 minutes.**
A player who moves and chooses well should do considerably better.

- **Levels come too fast to feel earned** → raise `xpGrowthPerLevel` toward 1.4
- **Progress stalls and runs feel flat** → lower it toward 1.15
- **Too many choices interrupt the fight** → this is the wrong dial; raise `xpGrowthPerLevel`

The card pool itself is in `src/game/upgrades.ts`, with a comment at the top explaining how
the weapons are meant to differ. There are 13 cards: 4 weapons and 9 passives, plus the
starting bolt.

---

## Performance ⏳ *(mostly M6)*

| Number | Now | What it does |
|---|---|---|
| `targetFps` | 60 | What we are aiming for on a mid-range Android. |
| `lowFpsWarningThreshold` | 40 | Below this, suggest low power mode. |
| `devReadoutIntervalMs` | 500 | How often the dev panel numbers refresh. |

---

## Numbers that do **not** exist yet

Spawn rate, monster speed, damage, the XP curve and the upgrade cards all arrive in **M4**,
and they will land in this same file with the same kind of guide. The brief's rule holds:
**if a number affects how the game feels, it lives in `tuning.ts` and nowhere else.**
