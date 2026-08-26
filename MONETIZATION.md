# Monetisation

**The rule this whole document exists to enforce:**

> Every paid or ad-supported thing in Geo-Survivors grants **convenience**, never **power**.
> A player who never spends a cent and never watches an ad can reach everything in the
> game. They just take longer getting there.

Status: **nothing here is built yet.** M6 adds a fake placeholder so the loop can be
tested; no real ad network is integrated during the prototype.

---

## The two revenue sources

| | |
|---|---|
| **Rewarded video ads** | Free to the player, always opt-in, always in exchange for something. |
| **Premium unlock** | One-time purchase, around $6.99. Removes ad prompts, adds quality-of-life. |

There is **no subscription**, **no loot box**, **no energy timer**, and **no currency the
player can buy**.

---

## Every monetisable hook, and what it grants

| # | Hook | What the player gets | Power or convenience? | Status |
|---|---|---|---|---|
| 1 | **Revive after death** | Continue the current run instead of losing it | **Convenience** — the run's rewards were already earned; this saves repeating the walk | ⏳ M6 |
| 2 | **Double run rewards** | 2× the currency from a finished run | **Convenience** — reaches the same permanent upgrades sooner, never higher | ⏳ M6 |
| 3 | **Extra nest attempt** | Retry a failed nest without waiting for it to respawn | **Convenience** — removes waiting, not difficulty | ⏳ M6 |
| 4 | **Premium: no ad prompts** | The offers above stop being offered and are simply granted | **Convenience** | ⏳ M6 |
| 5 | **Premium: cosmetics** | Character colours, trails, map themes | **Cosmetic** | ⏳ later |
| 6 | **Premium: extra loadout slots** | Save several favourite starting setups | **Convenience** — same setups, fewer taps | ⏳ later |

**Nothing in this table increases damage, health, speed, drop rate, or upgrade card
quality.** If a future idea would, it does not go in this table — it goes in the bin.

---

## Hard rules for ads

These come straight from the brief and are not negotiable.

1. **Rewarded only.** The player always chooses to watch, always in exchange for something
   specific and stated up front.
2. **Never an interstitial. Never auto-play.** No ad ever appears because a timer expired
   or a screen changed.
3. **Never during combat.** Not before a level-up card choice, not mid-fight, not while
   walking to a nest. Only at natural stopping points: after death, after clearing a nest.
4. **Assume terrible mobile signal.** Every ad pre-loads well in advance.
5. **A failed ad still pays out.** If the ad does not load, the player gets the reward
   anyway. **A broken ad must never block progress.** This is a hard requirement, not a
   nicety — outdoor mobile signal in Vietnam will fail regularly, and a player who loses a
   nest clear because an advert would not load will delete the game, correctly.
6. **A cap on offers per session**, so the game never feels like it is nagging.

---

## Premium: what it must never do

Premium is a **one-time** purchase. It must never:

- grant combat power of any kind
- grant currency, or a permanent currency multiplier
- unlock upgrade cards, weapons, or content unavailable to free players
- become a subscription
- gate anything that already worked for free

If Premium ever needs to be more tempting, the answer is **more convenience and more
cosmetics** — never a nudge across the power line.

---

## The prototype placeholder

For the prototype (M6) the "ad" is a fake: a 5-second wait, then the words **"AD PLAYED"**,
then the reward. That is enough to test whether the loop feels good and whether the offers
are placed at the right moments. A real ad SDK drops into the same slot later.

**Test the failure path too, deliberately** — make the fake ad fail sometimes and confirm
the reward still arrives.

### Built, and how the promise is kept

The rule is not left to whoever calls the ad code. `watchAdFor` takes the reward itself
and pays it **exactly once on every path there is**: the ad played, it failed to load, the
player closed it early, or our own code threw. There is no way to call that function and
not pay out, which is the only kind of promise worth making.

Verified by forcing each path — five forced failures paid five rewards, and closing the ad
the instant it appeared still paid. `TUNING.performance.fakeAdFailureRate` keeps the
failure path testable forever: set it to 1 and every ad fails.

Placements live so far, both on the death screen, both behind a button the player chose to
press: **carry on this run** (once per run) and **double this run's coins**. Nothing
interrupts a run, ever.

---

## What a server and multiplayer would actually cost

Asked directly, so here it is with the arithmetic shown. **Prices are
approximate and move around** -- treat the shape of the answer as the useful
part, not the exact figures.

### The thing that makes this cheap was designed in from the start

The world is **calculated, never stored**. Two phones standing together roll the
same nests from the same geohash and time slot, with nobody coordinating them.
So a server never has to hold or send the world -- only **what people did to
it**: who owns which building, what it cost, who outbid whom, and each player's
own coins and towers.

That is a handful of small writes per session and one read on opening the app.
It is close to the cheapest possible shape of backend, and it is the difference
between a $25/month bill and a $1,000/month one.

Multiplayer here also needs **no live sync**: outbidding is asynchronous, and
nobody's position is ever shared -- which is a privacy decision as much as a cost
one.

### Measured: what one session pulls

A cold start on a Da Nang street: **15 tile requests, 711 kB, about 47 kB a
tile**. A real forty-five minute walk crosses new ground, so call it **50-70
tiles and 2-4 MB a session** -- estimated from that anchor, not measured on foot.

### The bill, by size

| | backend + hosting | **map tiles, paid per request** | **map tiles, self-hosted** |
|---|---|---|---|
| 1,000 daily players | free - $25/mo | ~$450/mo | ~$20/mo |
| 10,000 daily players | $25 - $50/mo | ~$4,500/mo | ~$40/mo |
| 100,000 daily players | $100 - $300/mo | ~$45,000/mo | ~$100/mo |

**The database is not the problem. The map is.** At roughly $0.25 per thousand
tile requests -- a typical commercial rate -- tiles at 10,000 players cost about
$4,500 a month, which is almost exactly the ad revenue those same players
generate. The business closes to zero on map hosting alone.

Self-hosted, the same traffic is 840 GB a month, which sits inside the included
bandwidth of a single ordinary rented server. **Roughly a hundredfold
difference**, and it is the single most important number in this document.

### We are already most of the way there

The tile mirror built while chasing the blank-map bug is exactly this
infrastructure: `vercel.json` rewrites `/maptiles/*` to a provider, and the game
asks through that path. Pointing it at our own tile server is a **configuration
change, not a rewrite**. What it would need is a planet extract (about 100 GB,
free from OpenStreetMap) and a machine to serve it.

Until then the game uses free public providers, which are donation-funded and
carry no guarantee. That is fine for one player and **not fine at any real
scale**: leaning on a charity's bandwidth for a commercial game is both fragile
and rude.

### What is not in these numbers

Accounts and moderation once people can take things from each other -- that is
support work, not server cost, and it grows with players rather than with
traffic. Also nothing here covers app-store fees (30%, or 15% under the small
business rates), which come off the Premium price before any of this.

---

## The honest maths, kept here so it is not forgotten

Rewarded video earns roughly **$5–20 per 1,000 completed views**, varying enormously by
country. Vietnam and most of Southeast Asia sit at the bottom of that range; the US, UK,
Japan and Australia at the top. **Where players live will matter more than how many there
are.**

At $10 per 1,000 views, $2,000/month needs about **200,000 rewarded views** — roughly
5,000 daily players each watching 1.5 ads. A $6.99 Premium unlock nets about $5.94 after
the 15% small-business store cut; at a 2% conversion rate, 5,000 daily players adds maybe
$600/month.

**Neither number is the problem. Getting 5,000 daily players is the problem.** No amount of
good code substitutes for having a plan for that.
