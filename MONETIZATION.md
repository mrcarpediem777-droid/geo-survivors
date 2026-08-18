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
