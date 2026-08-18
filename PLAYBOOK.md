# Geo-Survivors — Playbook

**This file is written for you, not for a programmer.** Every session, start by asking
Claude: *"Read PLAYBOOK.md and tell me where we left off."*

---

## Where we are right now

| | |
|---|---|
| **Milestone reached** | **M3 — real buildings are solid walls** ✅ |
| **Next milestone** | M4 — the swarm: nests, monsters, auto-firing weapons, level-ups |
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

## Two versions of the game, and why

| | |
|---|---|
| **The real game** | https://geo-survivors.vercel.app — what players get. **No dev panel exists in it at all.** |
| **The testing version** | a separate link off the `devtools` branch, with the panel switched on. Only you have it. |

This is deliberate and worth understanding: the dev panel can fake your GPS, which in a
location game is simply a cheat. It is not hidden from players in the real game — it is
physically absent from the file they download. The testing version is a different build
that only exists on its own link.

**Walls work in both.** They load automatically as soon as your location is known. The
panel only lets you *highlight* them.

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

**Walls are real now.** Try to walk your character into the building next to you — it
will not go. Press **show/hide walls** in the dev panel to highlight in red exactly what
the game treats as solid; those shapes should sit precisely on the buildings the map has
drawn.

**The orange dots** are test markers at fixed real-world positions, in rings 10 m, 25 m
and 50 m out. They exist so you can check the most important thing in M2: zoom and pan
however you like, and they must stay glued to the same patches of pavement. If they ever
slide, something is badly wrong.

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
