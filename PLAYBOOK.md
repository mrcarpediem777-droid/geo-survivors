# Geo-Survivors — Playbook

**This file is written for you, not for a programmer.** Every session, start by asking
Claude: *"Read PLAYBOOK.md and tell me where we left off."*

---

## Where we are right now

| | |
|---|---|
| **Milestone reached** | **M1 — Hello map** ✅ |
| **Next milestone** | M2 — things live on the map (canvas layer, joystick, combat zoom) |
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
├── map/
│   └── mapView.ts       the real map on screen, and the dots drawn on it
│
├── ui/
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
| **OSM building coverage varies** | Building shapes come from OpenStreetMap, and coverage is excellent in some places and thin in others. **This is the single biggest open question for M3** and we should check your actual neighbourhood early. |

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
