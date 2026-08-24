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

## Clearing nests

| Number | Now | What it does |
|---|---|---|
| `radiusMetres` | 26 | How close your REAL position must be. |
| `holdSeconds` | 50 | How long you stand there. |
| `spawnMultiplierWhileCapturing` | 3.4 | How much harder the nest fights back. |
| `decayRate` | 0.35 | How fast progress fades if you step away. |
| `baseReward` | 30 | Essence per nest. |
| `rewardPerMinuteAlive` | 8 | Extra essence for an older nest. |

- **Clearing feels like a chore** → *lower* `holdSeconds` toward 35
- **Clearing feels too easy** → *raise* `spawnMultiplierWhileCapturing` toward 5
- **Losing progress to GPS drift is infuriating** → *lower* `decayRate` toward 0.15
- **Progress needs to matter more** → *raise* `baseReward`

⚠️ **`radiusMetres` is measured from your GPS anchor, never from the steered character.**
That is the entire point: the rope is 28 m, so a nest at 140 m cannot be reached by thumb.
Verified — a full minute of pushing the stick yields zero progress. If you ever measure
this from the character instead, walking stops being required and half the design dies.

⚠️ **Never add a time limit on reaching a nest.** Not a countdown, not a bonus for speed,
not a nest that expires. The brief forbids it and it is the one rule that keeps this game
safe to play outdoors.

---

## Permanent upgrades

Six of them, in `src/game/metaProgress.ts` with their costs. Bought with essence, kept
forever, and deliberately modest — a new player should not simply be worse at the game
than an old one. If they ever start deciding runs, shrink them.

**Two of these used to do nothing at all.** "Reach" added metres to the leash and
"Haste" made you walk faster on the thumbstick. Both of those things stopped existing
the day the thumbstick was removed and your circle was pinned to your real position —
but the shop went on selling them. They now give weapon range and healing instead,
which are things that exist. The same was true of two level-up cards, "Light Feet" and
"Long Rope"; they are now "Keen Eye" (+25% experience) and "Second Wind" (heal faster).

## Equipment

Eleven items in `src/game/equipment.ts`, in three slots — weapon, armour, charm — with
**one item worn per slot**. That limit is the whole design: without it the shop is a
shopping list and every player ends up wearing the same things. With it, money buys a
decision.

Every item is one line in that file. To change what something costs or does, change the
number next to it; nothing else needs touching.

**What a full set is worth, measured** (standing still on a Da Nang street, no level-up
cards taken, so the numbers are low across the board but comparable):

| Worn | Survived | Killed |
|---|---|---|
| nothing | 90 s | 35 |
| Balanced Rig | 92 s | 36 |
| Rig + Plates + Lens | 97 s | 40 |

Wide enough to feel, nowhere near enough to win for you. Re-measure these after any change
to the numbers below — they moved once already when the damage curve was fixed.

**One item had to be thrown out.** A "Splitter" giving +1 projectile and +1 pierce turned
a run that died at 97 seconds into one still at full health after 240. Either half did it
alone: the plain bolt fires *one* shot, so "+1" is simply double damage, and monsters
queue along a street, so a piercing shot hits the whole queue. Extra shots and piercing
stay as level-up cards, earned inside a run and lost with it. A permanent purchase that
makes the game unlosable is not an upgrade, it is an off switch.

### The flat line and the wall, and how it was fixed

The armour slot used to be worth about **one second**. +60 health bought one. So did
15% armour, and so did healing three points a second. Pushing the numbers further barely
helped. That was not the items' fault — it was the shape of the fight. Sampled every ten
seconds:

```
 0s  hp 200   12 monsters   nearest 17 m
30s  hp 200   52 monsters   nearest 33 m
60s  hp 200   98 monsters   nearest 19 m
90s  hp 200  143 monsters   nearest  4 m
97s  dead
```

Not one monster touched the player in ninety-nine seconds. Health read full at every
sample and then the whole bar went inside the last nine. Nothing protective could matter,
because there was nothing to be protected from until it was already over — and the player
never got the one warning this game wants to give: *you are at half health, walk away.*

**Three things were changed together.** Each is a number here, and each was necessary;
the first two alone did almost nothing.

**1. The crowd presses on you as it closes** — `player.crowdPressure`. Anything nearer
than 20 m hurts a little, more the closer it is, capped at 3.5 a second however thick the
crowd. The cap is sensitive: at 7 a second the crowd simply held the ceiling from fifty
seconds in, which is a slower wall, not a bleed.

**2. Reinforcements arrive early enough to be the slope** — `nests.warmupMinMetres` /
`warmupMaxMetres`, moved from 42–70 m to 24–46 m. At 42–70 m, by road and at a monster's
pace, the first ones took a full minute to walk in, so widening the pressure radius found
nothing to press with.

**3. Monsters were slowed** — see `monsters.types`. This one is a safety rule, not
balance. See below.

The result, standing still on the same street:

```
  0s 100%   15s 99%   30s 93%   45s 91%   60s 89%   75s 73%   90s 47%   dead at 106 s
```

Of 200 points of health, **120 are now taken gradually and 84 by the swarm actually
landing on you** in the last few seconds. It used to be nought and two hundred.

### Monsters were faster than a walking human

The swarmer moved at 1.30 m/s and the stalker at 1.35. An ordinary walking pace is about
1.3. The brief requires monsters to be *clearly* slower than a walking human **so that a
player can always walk away** — and measured, they could not: fleeing a crowd on foot
lost health the entire way and still ended in death at 106 s.

This had been true for a long time and was invisible, because nothing ever touched you
until the last few seconds, so walking away was never worth trying. The moment the crowd
could press on you, the broken escape route mattered.

Speeds are now 0.95 (swarmer), 0.6 (brute), 0.8 (spitter), 1.05 (stalker). **Nothing here
may go above about 1.05.** With them, walking away from the crowd at 70% health:

```
survived the full 240 s, walked 168 m, dipped to 54%, recovered to 89%
```

### Healing pauses while something is hurting you

`player.regenPausedAfterHurtSeconds`. Healing 2.2 a second was worth six extra seconds of
life; healing 3.0 a second was worth **seventy-seven** — because the squeeze from a
closing crowd is a couple of points a second, so anything healing faster than that made
the middle of a run free. A cliff that steep between 2.2 and 3.0 is not something to
balance on, and stacking a Field Kit with the Mending upgrade and a few Second Wind cards
walks straight over it.

So healing now happens when nothing is pressing on you. That is also the behaviour this
game wants: breaking away from a swarm is always allowed, always works, and now pays.

### And a maxed-out player must still be beatable

With every permanent upgrade bought, weapons reach 34 m while the crowd only starts to
press at 20 — so nothing ever reached that player at all, and they sat at **full health
after two and a half minutes** standing still. That is the immortal perimeter this file
warns about under `maxAlivePerNest`, and the remedy it prescribes is numbers, not speed:
`nests.escalationOverSeconds` went from 240 to 150. The same player is now at 28% by 110
seconds, while a player with nothing dies at 106 as before — early nests are nowhere near
full fury yet, so the weak end is untouched.

Cost in frames, at the peak of that run: **217 monsters, median 1.70 ms and 99th
percentile 7.3 ms** of the 16.7 ms budget.

### What defence is worth now

Standing still, +60 health buys **three** seconds rather than one. That is still not much,
and it is meant not to be: standing still is not a strategy this game supports. The armour
slot is what lets you disengage and come back — the 240-second survival above is what a
Padded Jacket and a Field Kit are actually for.

---

## A nest's age decides everything about it

One clock — `nests.escalationOverSeconds` — decides how fast a nest spawns, how
long it takes to destroy (`capture.youngHoldFraction`), how hard it fights while
you do (`capture.youngResistanceFraction`), and what it pays
(`capture.rewardPerMinuteAlive`). One idea, four effects, so a nest that *looks*
old behaves old in every way.

| nest alive | hold | fights back | pays |
|---|---|---|---|
| 0 s | 23 s | ×1.72 | 30 |
| 60 s | 34 s | ×2.39 | 38 |
| 150 s+ | 50 s | ×3.40 | 50 |

Only the last of those four used to exist. Without the others a new player could
not clear their first nest at all — measured, they walked 97 m, arrived on 82%
health, reached 8% progress and died five seconds later. Afterwards, the same
player clears one at 70 seconds.

Nests age only while **awake** (`nests.activateWithinMetres`), so a neighbourhood
you have not visited is full of young ones.

---

## Streets, and how many nests

| Number | Now | What it does |
|---|---|---|
| `streetsOnly` | true | Monsters may walk **only** on roads. |
| `offStreetPenalty` | 2.5 | Used when roads-only is off: how much dearer leaving a road is. |
| `streetHalfWidthMetres` | 2.5 | How wide a road counts as. |
| `countPerCell` | 12 | Nests scattered across the neighbourhood. |
| `activateWithinMetres` | 190 | How close you must be before a nest wakes up. |
| `openingWaveCount` | 12 | Monsters already on their way when a run starts. |
| `warmupSeconds` | 75 | How long early spawns take a short cut toward you. |
| `warmupShare` | 0.45 | What fraction of them take it. |

**The opening is the fiddliest part of the whole game, because monsters must stay slower
than a walking person and now go the long way round by road.** Three measured attempts:

| Setting | Result |
|---|---|
| Opening wave at 34–62 m | first arrivals took **a minute** — an empty street |
| Every early spawn at 26–48 m | dead at **60 s** on level one — reinforcements on your head |
| Now: 16–34 m, then 45% at 42–70 m | fight from second zero, longest gap **16 s**, death at 112 s |

- **The start feels empty** → *raise* `openingWaveCount`, or *lower* `warmupMinMetres`
- **The start is overwhelming** → *lower* `warmupShare` toward 0.25
| `hitFlashSeconds` | 0.12 | How long a monster flashes white when hit. |

**Measured with roads-only on:** roads cover 45% of the ground and **82% of monsters are
standing on one** at any moment. The rest are the edges of a crowd spilling onto the
verge, which is what a crowd does.

A side effect worth knowing: monsters now arrive in columns down the street rather than as
a cloud from every side, so fewer are in weapon range at once and kill counts drop. That
is the funnelling the whole idea was for, but it does change the balance.

⚠️ **`streetsOnly` switches itself off wherever roads cover less than an eighth of the
area** — a beach, a park, an unmapped district. Without that guard there would be nowhere
legal to walk and the game would look dead, which this project has already shipped twice
by accident.

- **Monsters still cut across open ground** → *raise* `offStreetPenalty` toward 4
- **Monsters take absurd detours** → *lower* it toward 1.5; at 1 roads are ignored entirely
- **Roads feel too wide, everything counts as a street** → *lower* `streetHalfWidthMetres`
- **The neighbourhood feels empty** → *raise* `countPerCell`, or `activateWithinMetres`
- **Too many swarms at once** → *lower* `activateWithinMetres` toward 120

⚠️ **`offStreetPenalty` is capped at 8 in the code**, and for a real reason: the routing
sorts squares into a ring of buckets, and a step dearer than the ring is long gets
processed out of order. Going past the cap silently made whole districts unreachable.

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
