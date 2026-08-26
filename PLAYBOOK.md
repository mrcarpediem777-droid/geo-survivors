# Geo-Survivors — Playbook

**This file is written for you, not for a programmer.** Every session, start by asking
Claude: *"Read PLAYBOOK.md and tell me where we left off."*

---

## Where we are right now

| | |
|---|---|
| **Milestone reached** | **M5 — clearing nests and permanent progress** ✅ |
| **Next milestone** | M13 — a measuring instrument that fails loudly |
| **Code lives at** | https://github.com/mrcarpediem777-droid/geo-survivors |
| **Live URL** | **https://geo-survivors.vercel.app** |
| **Vercel dashboard** | https://vercel.com/abc-70f4/geo-survivors |

---

## The 60-second version

- **To play it on your computer:** run the command below, open http://localhost:5173
- **To play it on your phone:** it must be deployed first (GPS refuses to work otherwise)
- **To test without going outside:** long-press the bottom-left corner of the screen

---

## How to start the game on your computer

Open a terminal in the project folder and run:

```bash
npm run dev
```

Then open **http://localhost:5173** in your browser. Leave the terminal running; it
rebuilds the game automatically every time a file changes. Press `Ctrl+C` in the
terminal to stop it.

The first time you run it, your browser will ask for permission to use your location.
Say yes. On a desktop computer the location will be roughly right (it uses your
internet connection, not GPS), which is fine — use fake GPS for real testing.

---

## How to test without going outside (dev mode)

This is the important one. It lets you test everything sitting at your desk.

1. **Open the panel:** press and hold the **bottom-left corner** of the screen for one
   second. On a computer you can also just press the **`** key (top-left, above Tab).
2. **Tick "Fake GPS".** An orange marker appears at the middle of the map. The game now
   believes that marker is you and ignores your real location entirely.
3. **Move around:**
   - **Drag the orange marker** to teleport anywhere in the world.
   - **Arrow keys or WASD** to walk at a realistic human pace (1.4 m/s).
   - **Hold Shift** to move about four times faster, for covering ground quickly.
4. **Tick "Add realistic GPS wobble"** to make the fake GPS jitter the way a real phone
   does. Use this to check the game still feels stable when the signal is poor. You will
   see a small grey dot (the raw jittery reading) and a blue dot (the smoothed position
   the game actually uses). **The blue dot staying calm while the grey dot dances around
   is the smoothing doing its job.**

The panel also shows: frames per second, the current zoom, how many metres of real ground
fit across your screen, GPS accuracy, and the world cell (explained below).

**Dev mode cannot reach real players.** It is not hidden — it is physically deleted from
the version we put on the internet. Verified: the deployed bundle contains none of it.

---

## How to put it on the internet (deploy)

**Already set up. Deploying is now automatic** — every time Claude saves work to GitHub,
Vercel rebuilds https://geo-survivors.vercel.app within about a minute. You do not have to
do anything, ever.

Verified on the live site: the dev panel is **absent** from the public build, and the
corrected camera numbers are live.

If you ever need to deploy by hand, run:

```bash
npm run build
```

and drag the resulting `dist` folder onto https://vercel.com/new.

---

## How to test on your phone

**You must use the deployed https:// link.** This is not a preference, it is a rule the
browser enforces: **web pages are only allowed to read your location over a secure
(https) connection.** Opening the game via a `192.168.x.x` wifi address will load the map
fine but silently refuse to give it your position — which looks exactly like a bug and
is not one.

1. Open the Vercel link on your phone's browser.
2. Allow location when asked. Choose **"Precise"** if offered — "Approximate" is useless
   for this game.
3. You should see a real map of where you are, with a blue dot on you.

**Tip:** if the blue dot is in the wrong place indoors, that is normal. GPS needs a view
of the sky. Step outside and it will settle within a few seconds.

---

## How to play what exists so far

There are no enemies yet. What you can do is stand in a game world made of your own street.

**On your phone:** put your thumb anywhere on the **lower half** of the screen and drag.
A ring appears where you touched and you steer from there — you never have to look for it.
The top of the screen still drags the map around.

**On your computer:** open the dev panel (**`** key), tick **Fake GPS**, then:

| Keys | What they are |
|---|---|
| **Arrow keys** | **your feet** — this is you physically walking, and it moves your real position |
| **WASD** | **your thumb** — this steers the character on its leash |

That split is the whole design in miniature. Try holding WASD until the character stops
at the edge of its rope, then walk with the arrow keys and watch it get dragged along.

**Two dots, and the difference matters:**
- the **hollow blue ring** is where you really are (your smoothed GPS)
- the **solid blue circle** is the character you steer
- the gap between them is the leash

**There is a game now.** Purple nests sit 70–170 m away and pour monsters at you. Your
weapons fire themselves — you never aim. Kill things, collect the blue sparks, and at each
level pick one of three cards. Standing still gets you about four minutes.

**Walls are real.** Try to walk your character into the building next to you — it
will not go. Press **show/hide walls** in the dev panel to highlight in red exactly what
the game treats as solid; those shapes should sit precisely on the buildings the map has
drawn.

**What you see on the street, and nothing else:**

| | |
|---|---|
| 🔵 | you |
| 🕷️ 🐗 🦂 | monsters — spider, boar, scorpion |
| 💠 | experience — **walk over it to collect** |
| 🪙 | money — kept forever, spent on permanent upgrades |
| 🕳️ | a nest |

Monsters flash white when you hurt them. Loot lies where it fell: nothing comes to you,
so a run's reward depends on covering ground. Measured: standing still for five minutes
earns almost nothing, while walking a slow loop reached level 8 with 162 coins and 497
kills — and died doing it.

Test markers used to sit here too — grey rings at 10, 25 and 50 m that proved game
objects stay welded to the map. They were scaffolding for M2 and are no longer shown in
play, because clutter in the street reads as loot. The dev panel can still summon them.

Steer for a moment and the camera glides in to combat view (about 76 m across). Stand
still for four seconds and it glides back out to about 610 m. Never a cut.

The dev panel also has **stress test**, which drops 400 dots on you to see what your
phone can actually draw.

---

## What each folder does, in plain language

```
src/
├── config/          ← THE TWO FILES YOU WILL EDIT
│   ├── basemap.ts       which map provider we use. One line to switch.
│   └── tuning.ts        EVERY number that changes how the game feels.
│
├── location/        ← "WHERE THE PLAYER IS"
│   ├── geo.ts           converting between map coordinates and metres
│   ├── kalman.ts        the GPS smoother — turns jittery readings into a steady point
│   ├── antiCheat.ts     spots faked GPS. Only writes notes; never blocks anyone.
│   └── playerLocation.ts the one place allowed to talk to the phone's GPS
│
├── world/           ← "WHAT THE WORLD CONTAINS"
│   └── determinism.ts   how nests get decided without a server (see below)
│
├── profile/         ← "WHAT THE PLAYER OWNS"
│   └── profile.ts       your settings and progress, saved on your phone
│
├── game/            ← THE GAME ITSELF
│   ├── game.ts          owns everything that moves, and runs the loop
│   ├── playerCharacter.ts the character you steer, and its leash
│   └── gameCamera.ts    the automatic combat zoom
│
├── render/
│   └── entityLayer.ts   draws game objects INSIDE the map (see below)
│
├── map/
│   └── mapView.ts       the real map on screen, and the dots drawn on it
│
├── ui/
│   ├── joystick.ts      the thumb control -- the only input during combat
│   ├── hud.ts           the status bar and buttons over the map
│   └── devPanel.ts      your testing cockpit (never ships to players)
│
└── main.ts          ← wiring. Creates the pieces and introduces them.
```

**Why the three "modules" are kept apart:** later, `world/` gets replaced by a real
server while `location/` and `profile/` stay exactly as they are. Keeping them separate
now is what stops that from becoming a rewrite.

---

## The clever bit: nests without a server

Rather than a server deciding where monster nests are and telling everyone, **every phone
works out the same answer independently.** It takes two facts everyone agrees on — which
patch of world you are standing in, and which 6-hour block of time it is — and feeds them
into a dice-roller that always rolls the same numbers for the same input.

The result: two players standing next to each other see identical nests, with no server
and no internet cost. When we add multiplayer, the server only has to remember what people
*did*, never what the world *looks like*. **That is the difference between a $25/month
backend and a $1,000/month one.**

You can watch this working in the dev panel: drag the fake GPS marker a long way and the
"world cell" code changes. Drag it a short way and it stays the same.

---

## The blank map bug, and what it taught us

**The symptom:** on a phone in Da Nang the game showed a white screen with the blue dot
floating on it. The phone was fine, Chrome was fine, the graphics were fine, the map even
drew a frame. Map data was requested and **never arrived, with no error of any kind**.

**The actual cause, after one wrong turn:** MapLibre does all its map-data unpacking in a
*worker* — a second thread the browser runs alongside the page. By default it looks for
that worker in a file sitting next to itself. Our build tool bundles everything into one
file with a scrambled name, so **the file MapLibre went looking for did not exist.** It
was a plain 404 on the live site.

No worker means no tiles, and — cruelly — no error either. Requests go out, results never
come back, and the map sits there looking innocent.

**Why it was invisible until deployment:** during development the original files are still
lying around where MapLibre expects them, so it works perfectly on your computer. It only
breaks in the built version. This is a nasty class of bug and worth remembering: *if
something works locally and fails deployed, suspect the build, not the network.*

**The fix** is three lines at the top of `src/map/mapView.ts`: bundle the worker
explicitly and tell MapLibre exactly where it is.

> **The wrong turn, kept here on purpose.** The first diagnosis was that the network in
> Vietnam was blocking the map servers — the evidence genuinely pointed that way, since
> requests hung silently rather than failing. That was wrong; the tile servers were always
> reachable. The lesson: "requests hang with no error" pointed at the network, but it was
> equally consistent with nobody being home to receive the answer.

### The tile mirror (kept, but now dormant)

Built during that wrong turn, and kept because it is genuinely useful: if map data ever
fails to arrive for 12 seconds, the game re-routes every map request through our own
address (`/maptiles/...`) before giving up. Bad mobile signal outdoors is a real scenario
and this is a reasonable safety net.

It is **off unless needed**, and the choice is remembered so an affected player waits only
once. One subtlety if it ever needs revisiting: the map's recipe file names its data with
full web addresses, so mirroring only the first request is not enough — **every** request
is rewritten, in one place, `transformRequest` in `src/map/mapView.ts`.

> ⚠️ **Two files must be kept in step:** `vercel.json` (the live site) and the `proxy`
> section of `vite.config.ts` (your computer). They set up the same mirror in the two
> places the game runs. Change one, change the other.

> 💰 **Cost note:** mirrored map data travels through Vercel and counts toward its free
> allowance (100 GB/month). Only players whose network needs the mirror use it, so today
> that is a handful of testers and nowhere near the limit. If the game ever gets popular
> in a region that needs mirroring, this becomes a real bill and we should host map data
> properly instead. Flagging it now so it is not a surprise later.

---

## Clearing a nest — the part that needs your feet

**This is where walking becomes the point.**

Nests sit 70–170 m away. The character you steer is on a 28 m rope, so a nest is
simply out of reach of your thumb — measured: a full minute of pushing the stick gets the
character 30.7 m out, and a nest at 140 m registers **zero** progress. There is no way to
do this sitting down.

Walk to it, and once **your real position** is within 26 m a bar starts filling. Hold
your ground for about 50 seconds while the nest spawns monsters **three and a half times
faster** — it fights hardest at the end. Then it dies, pays out essence, and a
replacement rises somewhere else.

**Nothing rushes you.** There is no timer on the journey and never will be; the brief
forbids anything that would make a person hurry across a road. Step away and progress
fades slowly rather than resetting, so backing off from a scooter costs you a few seconds,
not a minute.

**Coins buy characters.** Tap the status line at the top of the screen to open the shop.
Five characters, each starting with a different weapon and a different shape of strengths,
so the cards worth taking change with who you are playing:

| | | |
|---|---|---|
| 🔵 | **Wanderer** | free — the plain, fair one |
| 🌀 | **Bladedancer** | 220 — orbiting blades, tough, wants the swarm on top of it |
| 🎯 | **Sniper** | 320 — the lance, longest reach, fragile |
| 🛡️ | **Bruiser** | 400 — scattergun, shrugs off damage, short reach |
| 🧲 | **Collector** | 520 — sweeps loot from twice as far, finds far more money, fights badly |

None is strictly better than another, and the free one is deliberately a fair baseline
rather than the worst — a starter ten times weaker than what you can buy would be a
miserable first impression, and it edges toward selling power, which the brief rules out.

**Essence also buys permanent upgrades.** Six of them, in the same shop, spent on
upgrades that survive death — health, damage, reach, pickup range, movement and clearing
speed. Deliberately small: they widen the door, they do not walk through it for
you. The cards inside a run are still where the real decisions live.

The shop opens at any time, including mid-fight, for the same reason there is no travel
timer: being unable to spend what you earned until you get home is a small version of
being made to hurry.

Measured end to end: walking 140 m at normal pace cleared a nest at **131 seconds** — 81
walking, 50 holding — and paid 62 essence for a nest that had been alive three and a half
minutes.

---

## How the fight works

**You never attack.** Weapons fire on their own at whatever is in range. The only thing you
control is where you stand, and the only decisions you make are the cards at level-up. That
is the brief's locked rule, and everything else follows from it.

**Monsters find you with one shared calculation.** Rather than have each of 400 monsters
work out its own way around the buildings, the game floods the neighbourhood outward from
you a few times a second and leaves behind a grid of arrows: *from this spot, that way is
the player*. Every monster just reads the arrow under its feet. Because the flood cannot
cross buildings, the arrows follow the streets — which is why monsters pour down roads and
funnel through gaps instead of drifting through walls.

**Three kinds of monster, and the third is the interesting one.** Swarmers are fast and
weak, brutes are slow and tough, and spitters stop at a distance and shoot. Spitter shots
are blocked by real buildings, so **stepping behind a real house genuinely saves you.**
That single rule is what makes your neighbourhood tactical rather than decorative.

**Pressure only goes up.** Each nest spawns faster the longer it is left alone, easing from
one monster every two seconds to one every third of a second. Standing still forever is not
survivable — which is the point. M5 is where you get to do something about it.

### What play-testing on a phone caught that simulation could not

Five faults, none of which any measurement would have found, because every one
of them is about what a person sees:

1. **The game looked completely dead indoors.** Monster routing floods outward
   from your square; test inside a building and the flood is sealed in a room, so
   no nest can be placed and nothing spawns. Measured with the player in a real
   building: **0%** of the surrounding ground was reachable. It now floods from
   the nearest open ground outside.
2. **The camera zoomed in on nothing.** Combat zoom triggered on "a monster
   exists", and monsters exist the moment a nest wakes 100 m away. The screen
   clamped to 76 m of empty street while the game happened out of view. Now a
   monster must be within 55 m.
3. **The map shook.** Indoors, the leash pulled the character into a wall while
   collision shoved it back out, every frame — and the camera follows the
   character. The leash now centres on the nearest open ground.
4. **Nests appeared inside houses and in rivers.** Placement checked only the
   nest's centre, and water was not modelled at all. Both fixed; water is now
   solid, which turns a river into a natural wall.
5. **Everything looked the same, and levels arrived too fast.** Pickups are now
   gold diamonds, nests are rings, you are a white blob. Levels take roughly
   twice as long.

**The lesson, recorded because it cost several rounds:** measurement found real
bugs but was blind to every one of these, because no simulation ever ran from
inside a building or looked at a screen. Get it in front of a person early.

### Two bugs a simulated run caught that eyes would not

Both were found by running four minutes of game in a fraction of a second and reading the
numbers, rather than by playing:

1. **Three minutes of nothing at the start.** Monsters must be slower than a walking human
   (a safety rule, not a balance one), so nests at the original 120–260 m took them over
   two and a half minutes to arrive. Nests moved to 70–170 m.

2. **Not a single level-up in a whole run.** Weapons kill out to 42 m, experience was only
   collected within 14 m, and the leash holds you inside 28 m. Everything died just out of
   reach and rotted. 36 kills, zero levels. Experience now always drifts toward you.

After both: level 10, 87 kills, 273 monsters at peak — standing perfectly still and
deliberately always taking the first card offered.

### What it costs

Measured with 190 monsters on screen, on this machine:

| | |
|---|---|
| Whole fight simulation | 0.24 ms a frame |
| Handing entities to the graphics card | 0.06 ms a frame |
| Routing calculation for the entire swarm | 4.2 ms, four times a second |
| **Budget for 60 fps** | **16.7 ms a frame** |
| Monsters found standing inside a building | **0** |
| Entities drawn at once, one draw call | **455**, including 440 monsters |

The real question — what a mid-range Android does with all of that plus the map — is
answered by the frame counter in the dev panel, on your phone, outdoors.

---

## Buildings as level design — and the map provider problem

**This nearly sank M3, and the cause was not what anyone would guess.**

The game reads building outlines out of the map data. Measuring what actually arrived was
alarming: in central London the map delivered **55 buildings per km²** where OpenStreetMap
has about **1445**. In Hoi An it delivered **1.4** against roughly **6900**. Under 4% of
reality, and in some places under 0.1%.

The first conclusion — that Vietnam is poorly mapped — was **wrong**, and it would have
sent you on a pointless trip to Hoi An. OpenStreetMap has the buildings. Our map provider
simply was not shipping them.

Swapping to the other provider already in the config fixed it completely:

| Place | OpenFreeMap (old) | Versatiles (now) |
|---|---|---|
| London, Soho | 55 / km² | **1545 / km²** |
| Hoi An | 1.4 / km² | **2711 / km²** |
| Da Nang, Hai Chau | 1.9 / km² | **225 / km²** |

Median building footprint in Da Nang: **76 m²** — real shophouses, not just landmarks.
**M3 works in your own neighbourhood.** No trip required.

The cost: the new provider has no worldwide delivery network and is about 5× slower to
answer (1.7s a tile against 0.33s). We route it through our own address instead, which
caches it near you — measured back down to 0.4s. That is the tile mirror from earlier,
now earning its keep as a speed feature rather than a workaround.

### The two bugs that made walls unusable

**1. Every building arrived two to four times.** Map squares overlap slightly at the
joins, so a building near an edge is delivered by both neighbouring squares, clipped
differently in each. Two nearly-identical walls sitting on top of each other trap a
player: pushed out of one, they land inside the other, forever. Measured: 20 of 120
buildings trapped a character. Fixed by giving each building exactly one owner — the
square its middle falls into. 514 duplicate copies dropped in Da Nang alone.

**2. Terraced houses share walls.** Being shoved out of one shophouse puts you inside the
next, and pushing harder just walks you along the row. Now, when a character is genuinely
wedged, the game stops pushing and searches outward for the nearest open ground —
preferring the side it came in from, so it never gets spat out through the far wall.

**Verified after both fixes**, on 590 real Da Nang buildings:

| Check | Result |
|---|---|
| Walking straight at a building | **203 of 203 blocked**, none walked through |
| Dropped inside a building | **583 of 583 freed**, none stuck |
| Line of sight through a building | **40 of 40 blocked** (this is what M4 projectiles will use) |
| Cost per character per frame | 0.0011 ms — room for **15,000 checks a frame**, far more than the 400 monsters we need |

### Where there are no buildings

Open sea, countryside, a big park, or simply an unmapped neighbourhood: the game invents
obstacles instead, so a fight still has cover and chokepoints. They come from the same
seed as everything else in that patch of world, so **the same place always generates the
same arena** and two players standing together see the same one. Verified: identical
across repeated builds, and the spot you arrive at is always clear.

---

## Why the game objects cannot drift off the map

This is the piece the brief called make-or-break for M2, so it is worth knowing how it
works.

The easy way to draw a game over a map is to lay a second sheet of glass on top and keep
the two in step by hand. It is also the way that breaks: during a zoom the two update on
slightly different schedules and the game visibly slides against the streets.

Instead, our game objects are registered as a **layer inside the map itself** — drawn in
the map's own painting pass, using the map's own camera, sitting in the stack alongside
its roads and buildings. They cannot drift, because there is nothing for them to drift
against.

**Three bugs lived in here, and all three drew absolutely nothing while every obvious
check still said everything was fine.** Recorded because that pattern will come back:

1. **The wrong matrix.** The map offers several ways to convert a position to a place on
   screen. The obvious-looking one works in an internal coordinate system, not the one we
   use. Entities ended up about 430 million pixels off screen.
2. **Numbers too small to exist.** Graphics cards use 32-bit numbers, worth about 7
   digits. A position on the world map is a fraction of the way across the entire Earth,
   which eats all 7. Measured: the smallest difference such a number can express near
   Vietnam is **2.3 metres on the ground**, while a monster is 2.5 metres across. Building
   a square around a point simply collapsed it to nothing. Fixed the way professional map
   and globe renderers do it — do the big subtraction on the processor in 64-bit, and send
   the graphics card only small local offsets.
3. **An edit that silently did not happen.** A search-and-replace matched nothing, changed
   nothing, and reported nothing. The old code kept running. Found by asking the browser to
   print the function it was actually executing, rather than trusting the file.

**How we know it works now:** not by looking at it, but by reading the actual pixels back
off the screen. A marker's exact colour appears at its projected position in 13 samples
across zoom levels 16 to 20 with the map panned off-centre, and a control point 40 m away
is correctly empty.

---

## Battery — please read before testing outdoors

This game keeps the screen on, uses GPS continuously, and draws constantly. That is close
to the worst-case power drain a phone has. Expect **roughly 15–25% battery per hour**,
possibly more on an older phone in hot weather.

We have not measured this properly yet — that happens in M6, along with a **low power
mode** toggle that reduces monster counts and map redraws. Until then:

- Do not go out for a long test session on a half-charged phone.
- Heat makes it worse. A phone in direct sun in Hoi An will throttle itself and the frame
  rate will drop — that is the phone protecting itself, not our code being slow.

---

## Spending coins: equipment

The shop now sells **eleven pieces of equipment** as well as the five characters and the
six permanent upgrades. Three slots — weapon, armour, charm — and **one item worn in
each**, so a full set is a combination rather than a purchase. Tap to buy, tap again to
take it off, tap another in the same slot to swap. Everything is kept forever and nothing
is consumable: running out of something halfway through a walk, far from home, is exactly
the kind of pressure this game refuses to create.

Buying *everything in the game* — a full set plus every permanent upgrade maxed — makes a
run about a third longer (99 s → 131 s standing still). That is the intended band. It
widens the door; it does not walk through it for you.

### Five things that were quietly broken

**Two permanent upgrades and two level-up cards did literally nothing.** "Reach" and
"Long Rope" added metres to the leash; "Haste" and "Light Feet" made you walk faster on
the thumbstick. The thumbstick was removed when your circle was pinned to your real GPS
position — and all four went on being sold and offered anyway, one of them for coins. A
card that silently does nothing is worse than a weak card, because there is no way for a
player to find out. They now give weapon range, healing, experience and healing again.

**An equipment item made the game unlosable.** A "Splitter" giving +1 projectile and +1
pierce turned a run that died at 97 seconds into one still at full health after 240 — and
each half did that on its own, because the starting weapon fires *one* shot (so "+1" is
double damage) and monsters queue along a street (so one piercing shot hits the queue).
It was cut. Extra shots and piercing remain level-up cards, earned in a run and lost with
it.

**Defence was worth about one second, and that was not the items' fault.** Measured
standing still, +60 health bought one second of life. So did 15% armour, and so did
healing three points a second. Pushing the numbers far higher barely moved them. A trace
of a whole run showed why:

```
 0s  hp 200   12 monsters   nearest 17 m
30s  hp 200   52 monsters   nearest 33 m
60s  hp 200   98 monsters   nearest 19 m
90s  hp 200  143 monsters   nearest  4 m
97s  dead
```

Not one monster touched the player in ninety-nine seconds. Health sat full the whole way
and then the entire bar went inside the last nine. **There was no middle.** Nothing
protective could matter, because there was nothing to be protected from until it was
already too late — and the player never got the one warning this game exists to give:
*you are at half health, walk away.*

### Fixing it took three changes, and two of them alone did nothing

**The crowd now presses on you as it closes.** Anything nearer than 20 m hurts a little,
more the closer it is, capped low. On its own this changed almost nothing — widening the
radius found nothing to press with, because at that point in a run there was nobody near.

**So reinforcements were moved closer**, from 42–70 m to 24–46 m. At the old distance, by
road and at a monster's pace, the first ones took a full minute to walk in. Two thirds of
every run was a flat line simply because the map was empty around you.

**And monsters turned out to be faster than a walking human.** The swarmer moved at
1.30 m/s and the stalker at 1.35, against an ordinary walking pace of about 1.3. The
brief requires them to be *clearly* slower so that a player can always walk away — and
measured, they could not: fleeing a crowd on foot lost health the whole way and still
ended in death. This had been true for a long time and was invisible, because nothing
ever touched you until the last few seconds, so walking away was never worth trying. The
moment the crowd could press on you, the broken escape route mattered.

The run now looks like this standing still, and 120 of the 200 points of health are taken
gradually against 84 by the swarm actually landing on you — it used to be nought and two
hundred:

```
  0s 100%   15s 99%   30s 93%   45s 91%   60s 89%   75s 73%   90s 47%   dead at 106 s
```

And walking away from the crowd at 70% health now works, which is the whole point:

```
survived the full 240 s, walked 168 m, dipped to 54%, recovered to 89%
```

**Healing had to be reined in separately.** Healing 2.2 a second was worth six extra
seconds; healing 3.0 a second was worth seventy-seven, because the squeeze from a closing
crowd is a couple of points a second and anything faster than that cancelled it outright.
A cliff that steep is not something to balance on — a Field Kit plus the Mending upgrade
plus a few Second Wind cards would step straight over it. Healing now pauses while
something is hurting you, so it is the reward for breaking away rather than a way to
ignore the crowd.

**And a maxed-out player has to stay beatable.** With every permanent upgrade bought,
weapons reach 34 m while the crowd only begins to press at 20, so nothing reached that
player at all — they stood at full health after two and a half minutes. Nests now reach
full fury in 150 seconds instead of 240, which brings them down to 28% by 110 seconds
while leaving a player who owns nothing dying at 106, exactly as before. At the peak of
that run: 217 monsters, median frame 1.70 ms, 99th percentile 7.3 ms of the 16.7 ms
budget.

Standing still, +60 health is now worth three seconds rather than one. That is still
deliberately small: standing still is not a strategy this game supports. The armour slot
is what lets you disengage and come back — the 240-second survival above is what a Padded
Jacket and a Field Kit are actually for.

---

## Installing it on a phone (M6)

The game can now be **put on the home screen** and opens like an app — its own
icon, no browser bar, no address to type. On Android the game offers this itself
after a minute and a half of play; on iPhone, Safari has no such offer, so it has
to be done by hand: **Share → Add to Home Screen**.

The offer waits deliberately. A prompt that appears the second a stranger opens
something asks for a commitment before they know what the thing is, gets refused,
and the browser remembers the refusal — so the one chance is spent on the worst
possible moment.

### It genuinely works with no signal

Tested by switching the server off completely and reloading: the page, the map
canvas and the game all came up. That matters on a walk — a lift, the back of a
building, a street with no bars — where the alternative is the game turning into
a browser error page mid-run.

**The rule the offline helper follows: never trap somebody on an old version.**
The usual way this goes wrong is serving the cached copy first, forever, so a
player keeps playing a build from three weeks ago and every fix we deploy is
invisible to them. Nothing is served from the cache while the network is
answering; the cache is a safety net, not a shortcut. `vercel.json` also tells
the phone never to cache the helper itself, because an old copy of *that* file
would pin somebody to an old game permanently.

**Map tiles are deliberately not cached.** They are large and there are thousands
of them; filling somebody's phone with a city's worth of map is not ours to do
quietly. The browser keeps its own copies anyway.

### `vercel.json` cannot have comments in it — a deploy died on this

Every other file in this project explains itself in comments. `vercel.json` cannot:
JSON has no comments, and Vercel checks the file against a strict list of allowed
keys, so the usual dodge of adding a `"//"` key **fails the whole build**.

What that looks like is nasty, because nothing appears to be wrong. The push
succeeds, git is clean, the commit is on GitHub — and the live site quietly stays
on the previous version. It was caught only because the new files 404'd when
checked afterwards, which is the reason every deploy here ends with actually
fetching something new from the live site rather than trusting that a green push
means a green deploy.

So the reasons for the settings in that file live here instead:

| Setting | Why |
|---|---|
| `/service-worker.js` — never cached | If a phone keeps an old copy of the offline helper, it keeps an old copy of the *game*, forever, and nothing we deploy can reach that player. The file is 3 kB. |
| `/index.html` — never cached | It names the current bundle. Cache it and you pin somebody to yesterday's build. |
| `/icons/*` — cached a day | Their names never change, so a long cache would make a redrawn icon take weeks to appear. A day is useful and still fixable. |

### The icons are drawn by a script

`node tools/make-icons.mjs` redraws all six sizes — a blue dot standing at a
street junction, which is what the game looks like. Change the numbers at the top
of that file and run it again. It writes the PNG bytes itself with nothing but
what Node already has, so there is no image editor to own and no picture in the
repository that nobody can edit.

---

## Teaching the game (M6)

The game does not look like what it is — it looks like a map. Nobody opening it
has any reason to guess that the blue dot is them, that walking is the only way
to move, or that they are not supposed to press anything. So there are two kinds
of teaching, answering two different questions.

**Four cards before the first run** answer *what is this?*: your street and the
blue dot; everything fires by itself; walk over what drops; and — on its own
card — **nothing here is ever timed and hurrying is never rewarded**. That last
one is in the brief as a rule for us, but the promise is worth nothing if the
player does not know it has been made: somebody who *suspects* the game might be
timing them will hurry anyway, across a road, looking at a phone.

**Four one-line hints** answer *what just happened?*, each shown once ever, at
the moment the thing first occurs. Measured on a real street:

```
  0s  they are walking to you; your weapons fire on their own
 11s  loot stays where it fell — walk over it
 21s  those dark holes are nests, and they are where the coins come from
 79s  being crowded is what hurts — walk away, and you heal once they are off you
```

A fifth fires the first time a coin is picked up.

**The nest hint originally never fired.** It waited until a nest was within 70 m
— by which point the player had already walked most of the way to one, so the
person who most needed it, the one standing still wondering what the game wants,
never saw it at all. Nests are placed 70–420 m out; standing on a Da Nang street
for a hundred seconds it did not appear once. It now fires at 200 m, while the
nest is still just a marker on the edge of the screen, which is exactly when
"what is that?" is being asked.

---

## Battery, ads and the play log (M6)

### The battery is a design constraint, not a nicety

This game asks somebody to walk for an hour with the screen awake and the GPS
running. A game that strands a person a mile from home with a dead phone has done
real harm, and no amount of good combat makes up for it.

**The biggest win was not a setting.** A phone in a pocket with the screen dark
was still drawing sixty frames a second of a map nobody was looking at. Now the
loop stops dead when the game is hidden — measured: ten seconds of frames while
hidden advanced the run by **0.000 s and cost 0.0 ms**. That happens always and
is not something anyone has to switch on.

**Low power mode** is in the shop, under SETTINGS. It draws thirty frames a
second instead of sixty, thins the swarm at 150, and rebuilds pathfinding half as
often. Measured over a minute of play offered 3,600 frames:

| | frames drawn | simulation work |
|---|---|---|
| normal | 3,600 (100%) | 4,605 ms |
| low power | 1,800 (50%) | 3,045 ms |

The map library only redraws when we ask it to, so skipping our frame skips its
work as well — and *that* is the larger half of the saving, since it draws the
whole vector map and we draw some dots on top.

On Android the game offers the mode when the battery drops below 25%. iPhones do
not report their battery to web pages at all — Safari removed it deliberately,
because a battery level turns out to be a good way of recognising the same person
across websites, which is a fair decision — so there it has to be switched on by
hand.

**None of this has been measured on a real phone on a real walk yet.** Frames and
milliseconds are what can be measured from here; actual battery percentage per
hour cannot be.

### Ads: the promise is built into the shape of the code

The brief says the reward must be paid **even if the ad fails**. That is easy to
agree with and easy to forget the day an ad network starts timing out at three in
the morning — so it is not left to whoever calls it. `watchAdFor` takes the reward
itself and pays it **exactly once on every path there is**: played, failed to
load, closed early, or our own code throwing.

Tested by forcing each path: five forced failures paid five rewards; closing the
ad the instant it appeared still paid. `TUNING.performance.fakeAdFailureRate` is
there so the failure path can be re-checked at any time rather than being tested
once and rotting — set it to 1 and every ad fails.

Two placements, both on the death screen, both behind a button the player chose
to press: **carry on this run** (once per run; the crowd standing on you is
swept away first, because handing somebody a full health bar inside a swarm is a
second death sold at the price of an advert) and **double this run's coins**.
Nothing ever interrupts a run. Interrupting somebody walking down a real street
is a genuinely bad thing to do, quite apart from the brief forbidding it.

### The play log keeps how far, never where

Every number in this project so far has come from a simulation standing still on
one street in Da Nang, and that simulation has been wrong in ways nobody could
have guessed from a desk. The log records real walks instead: runs, how long,
what level, how many kills and coins, nests cleared, ads and whether they failed,
and **how far you walked**.

**It never records a position.** Not coordinates, not the neighbourhood, not the
town. A log of where somebody walks and when is one of the most sensitive things a
phone can produce, and this game would have an unusually good one. Distance is
enough to balance a game and useless to anybody who steals it.

It never leaves the phone — there is no server and no request is made. "Copy my
play log" in SETTINGS puts it on the clipboard, and if the browser refuses the
clipboard it goes on screen to be selected by hand.

---

## Sound and vibration (M7) — a safety feature, not decoration

This game is played **while walking down a real street**, and until now the only
way to know anything at all was to look at the screen: the health bar, the
markers, the numbers. That quietly turns "go for a walk" into "stare at a phone
near traffic", which is the exact behaviour the brief spends an entire rule
trying to prevent.

So sound exists here to let somebody hold the phone at their side and still know
what is happening. Being hurt sounds like being hurt. A nest falling is
unmistakable. Below a third of your health there is a slow ugly pulse roughly
once a second that means *walk away* — the one decision this game actually wants
you to make, delivered without asking anyone to look down.

**No sound files.** Every noise is made by the browser out of arithmetic —
nothing to download, nothing to wait for on bad signal, nothing added to the
size of the game, and each sound is a row of numbers in `sound.ts` rather than a
file that needs a program to edit.

**Vibration** is the other half, and is off unless switched on: it costs battery
and irritates when overused, so it is reserved for being hurt, levelling, and a
nest falling. iOS does not support it at all and never has, so the toggle simply
does not appear there rather than promising something that will not happen.

### The most important sound never played once

Measured across a full run that ended in death: the "you are being hurt" sound
fired **exactly zero times**. The condition was "more than three points of damage
in one frame", which sounds reasonable and is completely wrong — damage arrives
as a drizzle, at most about two points a frame even with the swarm on top of you.
A crowd grinding somebody from full health to nothing made no noise whatsoever,
which defeats the entire purpose of having sound in a game played without
looking.

It now adds damage up over time and speaks every eight points. Same run,
measured again: first warning at **20 s**, then 24 times across 101 seconds —
which tracks the health slope exactly, getting more insistent as things get
worse.

### The mix, measured over one run

```
shot 135   hit 94   kill 41   hurt 24   xp 13   danger 6   levelUp 1   coin 1   death 1
```

Anything that can happen many times a second is throttled to three per tenth of a
second — forty monsters dying on the same millisecond is not forty times as loud,
it is a bang, and on some phones a distorted one. The rare and important sounds
were checked against that throttle and **all of them got through**: every
`danger`, every `hurt`, the level, the coin, the death.

---

## Weapon evolutions (M7), and two things measurement caught underneath them

Your brief says depth comes **only** from level-up cards. That promise was thin,
because the cards were mostly percentages — taking "+22% damage" three times is
not a decision, it is arithmetic. An **evolution** needs a weapon you have
invested in and a passive you have invested in, *together*: four levels of the
weapon and three takes of one specific card. Then a gold card appears and the
weapon becomes something else.

| Weapon | plus | becomes |
|---|---|---|
| Bolt | Split Shot ×3 | **Fusillade** — stops choosing, fires at five things at once |
| Scattergun | Punch Through ×3 | **Flechette Storm** — a full ring of needles, no back |
| Orbiting Shards | Far Sight ×3 | **Maelstrom** — a storm you stand inside |
| Shockwave | Thick Skin ×3 | **Bulwark** — wider, and every monster caught feeds you |
| Piercing Lance | Sharpened ×3 | **Railspike** — stops for nothing, reaches as far as you see |

### One evolution could never have happened

The Fusillade needs the bolt at level four — and **the bolt had no card**. It was
the weapon everybody starts with and the only one that could never be improved.
Found by trying to measure how long an evolution takes and discovering one that
was arithmetically impossible. There is now a "Heavier Bolt" card.

### Levels were far too slow for any of this — because two brakes hit one wheel

Levelling was deliberately slowed twice, at your request, and that still stands.
But a *second* change landed on top and nobody re-measured: loot stopped flying to
the player and had to be walked over. Measured with both in place:

| played | reached |
|---|---|
| 15 minutes of walking | **level 2** |
| 10 minutes of walking and fighting | **level 3** |

At that rate an evolution needing seven specific picks could not be reached by
anybody, ever, and the cards stopped being a source of depth at all. The **curve
is untouched** — what changed is what a body is worth (a swarmer 1→3, a brute
5→9, a stalker 3→5), which also means walking over loot now pays for the walk.
Re-measured, same ten minutes: **level 8, 458 kills, survived throughout**, with
levels 1–4 in the first minute and then the slow climb you asked for.

### The nest fights hardest at the end now — because the comment always said so

`spawnMultiplierWhileCapturing` was applied flat from the first second of a
capture, while the comment above it read "it fights hardest at the end". It does
now. This was found while measuring the problem below.

---

## A nest's age now decides how hard it is, not just what it pays

A new player could not clear their first nest — the headline mechanic and the
only way to earn money. Measured on a Da Nang street: walked 97 m, arrived on
82% health, reached 8% progress, **dead five seconds later**. An upgraded player
cleared three in five minutes and never dropped below 84%. A cliff between
impossible and trivial with no game in between.

**Half the fix was already in the game.** An old nest already spawned faster and
already paid far more essence for the same work. What was missing was the other
half: age had no say in how hard a nest was to *destroy*. Now it does, on the
same clock, so the two halves finally say the same thing.

| nest alive | hold time | fights back | pays |
|---|---|---|---|
| 0 s (just opened) | 23 s | ×1.72 | 30 |
| 60 s | 34 s | ×2.39 | 38 |
| 150 s or more | 50 s | ×3.40 | 50 |
| 5 minutes | 50 s | ×3.40 | 70 |

A fresh hole in the pavement is a quick errand worth little. One that has been
festering since you left the house is a siege that pays for itself. **That is a
decision on the map, not a difficulty setting in a menu** — which is why this
route was chosen over cheaper first nests or a shorter hold time.

Measured after, same brand-new player, twice: **first nest cleared at 70 s and
71 s**, reaching level 8, one retreat each time; the second run survived the full
five minutes. Before the change: dead at 58–91 s with nothing cleared.

**The markers say which is which.** Green NEW, yellow GROWING, red OLD, next to
the distance. Without that the choice would exist and be unmakeable. The tutorial
hint says the same in words, and now tells the truth: take a new one first.

Nests only age while they are **awake**, so distant ones stay fresh until you
come near. Walking into a neighbourhood you have not visited finds young nests;
lingering in one makes them worth more and harder to take.

---

---

## A session can now be finished

Until now the game had no ending anywhere in it. You fought, you died, you tapped
retry, and you were on the same street doing the same thing. Clearing a nest
instantly grew a replacement, so a neighbourhood could never run out and nothing
ever meant **done**.

Now the patch of world you are standing in holds a fixed quota of nests for each
six-hour slot. Clear them and it goes quiet: a bonus, a message, and **the
remaining nests actually vanish from the map** — the street empties, which is far
more of a reward than the essence is. The count is always on screen (`4/6 left`)
so it is something to aim at rather than something discovered by accident.

**Six, not twelve.** The quota is a separate number from how many nests exist at
once, so the map stays exactly as busy as it was. Measured, clearing one takes
roughly eight minutes including the walk to the next, so twelve would be an hour
and a half — too long for one outing, and the count resets with the world slot, so
a goal nobody reaches is no goal at all. Six is about forty-five minutes: one
proper walk, which is the session this game was designed around.

It refills at the next six-hour slot, which is also the first thing in this game
that gives somebody a reason to come back **this evening** rather than right now.
Nothing is timed and nothing is lost by waiting.

### The bonus was payable six times over

Written first as "pay the bonus whenever nothing is left", which paid it for the
sixth nest **and every one after it** — and twelve nests are already standing on
the map when the quota is met, so that was 140 essence apiece for six more of
them. Somebody would have found that within a day. It is paid on the crossing
now, not on being past it.

---

## Bridges exist now (M9), and a river is no longer the end of the world

The map was already the design — real buildings are walls, the swarm walks real
streets. What was missing was the map's **meaning**: the street layer was read
and every property on it thrown away on one line, so a motorway, a flight of
steps and a back alley were the same thing to the game.

That was mostly a missed opportunity. One case was a genuine fault: **a bridge
was the same thing as any other road**, and roads are never painted onto solid
ground, and water is solid. So bridges did not exist. Measured on the Han river
in Da Nang: of twenty-five points sampled across the water, **twelve were solid
and not one carried a road** — in a city built around a river with six bridges,
half the map was unreachable, by the swarm and by the player alike.

Now a bridge beats the water underneath it, in both worlds: it carves a way
through the navigation grid, and the collision world ignores water close to a
bridge line. Measured standing on a real Da Nang bridge:

```
on the bridge        player can stand      swarm: open, road painted
15 m to one side     player shoved off     swarm: blocked
15 m to the other    player shoved off     swarm: blocked
30 m to one side     player shoved off     swarm: blocked
```

The river is still a wall. The bridge is the only way across — which makes it
exactly the chokepoint a bridge should be, without a line of level design being
written by hand. Deliberately stamped **narrower** than an ordinary road for the
same reason.

### Streets are no longer all the same

Fifteen kinds of street, each with a width and a travel cost, in
`TUNING.navigation.streetKinds`. Two numbers doing two different jobs:

**Width** is what makes an alley feel like an alley. A swarm on a six-lane road
arrives as a wall; the same swarm up a service lane arrives in single file,
because there is only room for single file.

**Cost** decides which way the swarm *routes*, not merely how fast it walks.
Measured on a real street, route-cost accumulated per metre:

```
tier 0  main roads   x1.00    3.52 per metre
tier 1  residential  x1.15    3.75 per metre
tier 2  service      x1.35    4.43 per metre
```

A metre of back alley costs the router 26% more than a metre of main road, so
monsters pour down the big streets and only trickle up the small ones. Steps cost
x3.2 -- the best place in the neighbourhood to be standing when hunted.

Railways, runways and taxiways are excluded outright. Both of the last two appear
in the street layer around Da Nang, and a swarm marching down an airport runway
would be a strange thing to ship.

**The cost cap is not decoration.** The router walks a ring of 113 buckets and
the dearest possible step is 14 x 8, so multipliers are quantised into eight
tiers and capped. That exact class of bug has already happened here once, when an
off-street penalty of 49 against a 15-bucket ring silently made whole districts
unreachable. Checked after this change: **7,547 of 7,594 road squares still
reachable**, the 47 being genuinely isolated fragments.

Cost in time: painting the streets went from 3.7 ms to 6.7 ms, and that happens
only when the walls are rebuilt. **The routing rebuild, which runs several times
a second, is unchanged at 4.2 ms** -- which is the whole reason the tiers are a
lookup table rather than a multiplication in the inner loop.

### What this does NOT prove

That the difference is *felt* on any given street. At the Da Nang test point the
player stands on a service lane and the ground within 40 m is **95% one kind of
street**, so every monster that reached them walked on the same tier and no
comparison was possible. The mechanism is proven; whether a neighbourhood has
enough variety for it to matter depends on the neighbourhood.

An earlier version of that check reported "every monster on one tier" as though
it were a fault, because it guessed the grid arithmetic by hand and got the
origin wrong. `streetTierAt` exists now so the field is asked rather than
second-guessed.

Still unopened: `street_polygons` (pedestrian squares), `bridges`, `pois`,
`sites`.

---

## Monsters that behave differently (M10)

Every monster did exactly one thing: walk at you and touch you. So every fight
looked the same, and it never mattered which weapon you were holding. Three new
kinds, each breaking one assumption rather than being another stat block. **None
of them shoots** -- that decision is locked, and the point is that variety does
not require it.

| | what it does | why it changes a decision |
|---|---|---|
| 🐢 **Shell** | takes 6 off every hit, flat | few big hits barely notice; many small hits are blunted, so weapon choice finally decides something |
| 🪱 **Splitter** | dies into two swarmers | sweeping the street with an area weapon makes *more* street, so what you kill starts to matter as much as how much |
| 🐜 **Skitterer** | fastest allowed, 14 health | arrives before you have decided anything, and dies to a breeze -- a warning, not a threat |

### Armour was a brick wall on the first attempt

Measured: an armoured shell needed **91 scattergun pellets and 9 lance bolts**.
That is not "your weapon choice matters", it is "immune to half the arsenal" --
the same wall this project has already had to dismantle twice elsewhere. With a
floor on what a hit may be reduced to (`monsters.minimumShareThroughArmour`), the
same comparison is **39 against 8**: about five times harder for the wrong
weapon, where an ordinary brute is under three. A decision, not a wall.

### A trap the code had been warning about for months

A monster's picture was its **position** in the tuning list, with a comment here
saying that getting it wrong is silent, because the disabled spitter still holds
a slot and the stalker once wore the spider's face. Adding a fifth monster would
have drawn it as the experience crystal and nothing would have said so. The two
lists are joined **by name** now (`spriteIndexByName`), so they cannot drift.

### What it cost

Standing still with nothing bought: **79 s, was about 90** -- the new kinds are
heavier than a swarmer and make up roughly a third of spawns. The health slope is
unchanged in shape. The core loop still works: a brand-new player clears their
first nest at **85 s** (was 70) and reaches level 11, because the new monsters are
worth more. Peak 120 monsters, median frame 0.80 ms, 99th 5.4 ms.

---


## Towers (M11) — the first thing in this game that is BUILT

Everything else on the map is found or calculated. A tower is neither: you pay
for it, you walk to the spot, and it stays there after you go home. Built
**anywhere you like**, not only on cleared nests, because choosing the spot is
the decision.

It shoots by itself, and it throttles nests near it — both halves, so building
one changes the neighbourhood rather than only the next thirty seconds. Measured
with forty monsters standing around the player for ten seconds: **8 killed with
no tower, 44 with one**.

**Three rules it is built around, all from the brief:**

**Nothing can ever take it from you.** No decay, no attack in your absence, no
maintenance. The moment an owned thing can be lost while you are away, you hurry
to it — across roads, at night, looking at a phone — which is the one behaviour
this game refuses to cause. A tower you forget about costs you nothing.

**It adds no input to combat.** It fires like every other weapon here. Building
happens on the map, not in a fight.

**It must not replace walking.** A tower only wakes within 90 m of you, so
fortifying a corner and sitting in it achieves nothing: a sleeping tower kills
nothing and throttles nothing, so there is nothing to farm. Prices rise steeply
(260, 403, 625, …) so towers stay a decision about *where*, and no two may sit
closer than 35 m.

---

## The measurement harness had been lying, and it was my own doing

While testing towers, the same configuration measured three times gave "survived
200 s, 156 kills", "survived 200 s, 140 kills", and "died at 95 s, 59 kills".
That is not noise, that is a broken instrument — and every tower comparison built
on it was worthless, including a "bug" it led me to find and fix.

The cause was the screen-off pause added in M6: the game correctly stops dead
when `document.hidden` is true, and the browser pane these measurements run in
**is** hidden. So runs silently froze partway, and a frozen run looks exactly
like a run that survived without dying. The game was right; the harness was
measuring nothing and reporting it as a result.

**Balance numbers reported between M6 and here should be treated as unreliable**
unless they were taken with `hidden` forced false, which the harness now does
every tick. Structural results — does a thing exist, does it fire, does a cost
curve rise, does a rule hold — were unaffected, because those never depended on a
run completing.

The lesson is the one this project keeps relearning in new clothes: an instrument
that cannot fail loudly will eventually fail quietly, and a measurement nobody
can see failing is worse than no measurement at all.

---


## Owning a building (M12) — and the price nobody has to store

You can buy a **real building** by standing at it. Monsters killed near one you
own leave far more money: measured over three hundred kills each, **19.7% of them
dropped a coin on ordinary ground and 37.7% on ground you own**.

It grants **no survival whatsoever**, and that is deliberate — see below.

### The price is calculated, never stored

Every phone works out what a building is worth from its own footprint: a floor
plus the square root of its area. Same building, same answer, everywhere, with
nobody coordinating. Prices near the test point ranged from 238 for a 5 m² shed
to 2,219 for a 6,152 m² warehouse — **a footprint range of 1,200× compressed into
9× of price**, so choosing which building stays a matter of taste rather than
arithmetic.

Identity works the same way: a building is named by its own rounded corners.
Verified by buying one, reloading, rebuilding the world from a **different
origin**, and standing there again — same key, same price, still owned.

That is the whole point. When this becomes a game about buying things off each
other, a server never has to hold a catalogue of prices for every building on
Earth. It only remembers the handful somebody actually bought and what they paid.
It is the same rule the nests follow, and it is the difference between a $20
backend and a $1,000 one.

### Two wrong answers before the right one

The obvious benefit was "somewhere safe to fall back to", and it was wrong twice.

**A flat trickle of healing near it** was plain immunity: standing at your own
building, health simply never fell — 100% after two and a half minutes, where the
same spot without one ended at 49%.

**Shortening the "no healing while hurt" pause** instead turned out to be a
switch rather than a dial. At two seconds the player survived two hundred seconds
and never dropped below 76%; at three seconds they died at 80, which is
indistinguishable from owning nothing at all. There was no setting in between
that meant anything.

**A lever with no middle is the wrong lever.** So a building does not touch
survival: it makes the ground around it pay better. Money cannot make anybody
immortal, so there is nothing to exploit by standing there — the swarm kills you
on exactly the same schedule — and it turns *which* building into a real decision,
because the good corner is the one near the nests.

It is also the right shape for what comes next: when somebody can outbid you,
what they are buying is **a pitch that earns**, and that is a thing worth
squabbling over.

### What is deliberately missing

Nobody can take one from you, because there is nobody else. The half that makes
this interesting — being outbid, the price ratcheting up, a whole street quietly
competing over the same cafe — needs a server and a second player. Everything
here is shaped so that half drops in without a rewrite: an owner, a price, and a
record of what was paid.

---


## The measuring instrument, in the repository at last

Every balance number in these documents came from running the real game
headlessly. Until now that code was typed fresh into a browser console each
time, and in a single afternoon it went wrong four separate ways:

1. **The screen-off pause froze runs silently.** The game correctly stops when
   the page is hidden, and the pane these measurements run in *is* hidden. A
   frozen run looks exactly like one that survived. The same setup measured three
   times gave 156 kills, 140 kills and 40 kills.
2. **A tower test measured a bridge a kilometre outside the navigation grid**,
   where everything reads as blocked, and proved nothing.
3. **A street-kind check computed grid coordinates by hand**, got the origin
   wrong, and reported a fault that did not exist.
4. **My own first fix made it worse.** Replacing the real clock with "a nice
   round million" made "time since the routes were rebuilt" *negative*, so the
   swarm navigated a stale map for the whole run and the game looked far easier
   than it is — 109 kills and a comfortable survival where the truth is death at
   about eighty seconds.

All four have one cause: an instrument nobody could see failing. It now lives in
`src/dev/harness.ts` with every one of those traps disarmed in code and explained
in comments, behind the same dev-tools flag as everything else, so it cannot
reach a player's build.

```
await __geo.harness.run()                 // the standard set
await __geo.harness.run({ repeats: 5 })   // more repeats, less noise
```

**It prints every run, not just the summary.** That is the point. The first thing
it revealed about itself was that two runs of the same setup could differ by more
than double — which had been true all along and invisible. With the clock fixed
the same three runs read 79 s, 130 s and 77 s: two agreeing closely and one
outlier, all of it now on the page instead of hidden behind an average.

**So: single runs of this game mean very little.** Anything reported from here
should come from the median of several, with the spread shown. Numbers in these
documents from before this harness existed should be read with that in mind.

---


## Known issues and honest limitations

| | |
|---|---|
| **Anti-cheat is weak on the web** | Android has a proper built-in "this location is fake" flag, but web pages are not allowed to read it — only real installed apps can. Our checks are indirect guesswork for now. This gets much stronger if we port to native. |
| **`building-3d` layer unused** | The map style has 3D buildings we currently ignore. Might be useful for line-of-sight in M3, might just cost frames. To be decided. |
| **Bundle is 960 kB** | Almost all of it is the map library itself (250 kB once compressed, which is fine on mobile data). Not worth optimising yet. |
| **Desktop location is approximate** | On a computer there is no GPS chip, so the browser guesses from your internet connection. Use fake GPS for real testing. |
| **Map mirror costs bandwidth** | See the tile mirror section above. Fine at prototype scale, needs a proper solution if the game grows in an affected region. |
| **Fallback arena is sparse** | The generated obstacles cover only about 3% of the ground around you. Fine for cover, possibly too thin for a good fight — worth raising `fallbackObstacleCount` once there are monsters to judge it against. |
| **Building data still lags reality** | Even the good provider delivers roughly what OpenStreetMap has, and OSM itself is thinner in Da Nang (225/km²) than in Europe (1545/km²). Playable, but a European street will have noticeably more structure than a Vietnamese one. |

---

## Next steps (M2 — "things live on the map")

1. A drawing layer registered *inside* the map (not floating on top of it), so game
   objects stay locked to real geographic positions through zoom and pan.
2. Test entities drawn at real coordinates, to prove they stay locked.
3. The leashed player character + virtual joystick.
4. Automatic combat zoom in and out.

The target feeling for M2: *"it already feels like standing in a game world made of my
own street."* No enemies yet.

---

## When something breaks

Tell Claude: **"I did X, I expected Y, I saw Z."** That is genuinely all that is needed.
If the screen shows an error box, copy the text in it.
