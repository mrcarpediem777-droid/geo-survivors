/**
 * MODULE 2 OF 3: WHAT THE WORLD CONTAINS -- the foundation of it.
 * ==============================================================
 * This file does not create any nests yet (that is M4/M5). What it does is lock
 * in the rule that makes nests possible WITHOUT a server, and makes them
 * work WITH a server later without a rewrite.
 *
 * THE RULE: the world is calculated, never stored.
 * ------------------------------------------------
 * Instead of a server deciding "there is a nest at this address" and telling
 * everybody, every phone WORKS OUT the same answer from scratch, using two
 * facts that everybody agrees on:
 *
 *   1. WHICH PATCH OF WORLD you are standing in (a "geohash cell" -- see below)
 *   2. WHICH CHUNK OF TIME it currently is (a "time slot", e.g. this 6-hour block)
 *
 * Feed those two facts into a dice-roller that always rolls the same numbers for
 * the same input, and you get nests that are:
 *   - identical for two players standing next to each other, with no server,
 *   - different in a different neighbourhood,
 *   - refreshed on a schedule everyone shares,
 *   - impossible to farm by reinstalling the app.
 *
 * WHY THIS MATTERS FOR MONEY AND FOR MULTIPLAYER:
 * When we add other players, the server never has to store or send the world.
 * It only stores what people DID (this nest was cleared, this player owns that).
 * That is the difference between a $25/month backend and a $1000/month one.
 */

/* -------------------------------------------------------------------- */
/* 1. WHICH PATCH OF WORLD -- geohash                                    */
/* -------------------------------------------------------------------- */

const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Turn a latitude/longitude into a short text code naming the rectangle of
 * world it falls inside. This is a standard format called a "geohash".
 *
 * The longer the code, the smaller the rectangle:
 *   5 characters ~ 5 km across   (a town)
 *   6 characters ~ 1.2 km across (a district)   <-- our default
 *   7 characters ~ 150 m across  (a street)
 *
 * The useful property: two people standing near each other produce the SAME
 * code, so they will roll the same nests, with nobody coordinating them.
 */
export function geohash(lat: number, lng: number, precision = 6): string {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = '';
  let bits = 0;
  let bitCount = 0;
  let useLongitude = true;

  while (hash.length < precision) {
    // Repeatedly halve the world and record which half we are in.
    if (useLongitude) {
      const mid = (lngRange[0] + lngRange[1]) / 2;
      if (lng >= mid) {
        bits = (bits << 1) + 1;
        lngRange = [mid, lngRange[1]];
      } else {
        bits = bits << 1;
        lngRange = [lngRange[0], mid];
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        bits = (bits << 1) + 1;
        latRange = [mid, latRange[1]];
      } else {
        bits = bits << 1;
        latRange = [latRange[0], mid];
      }
    }

    useLongitude = !useLongitude;
    bitCount++;

    // Every 5 halvings makes one character of the code.
    if (bitCount === 5) {
      hash += GEOHASH_ALPHABET[bits];
      bits = 0;
      bitCount = 0;
    }
  }

  return hash;
}

/* -------------------------------------------------------------------- */
/* 2. WHICH CHUNK OF TIME -- the time slot                               */
/* -------------------------------------------------------------------- */

/** How long a set of nests lasts before the world rerolls them. */
export const TIME_SLOT_HOURS = 6;

/**
 * Which numbered block of time we are in right now, counting from 1970.
 * Everyone on Earth gets the same number at the same moment, regardless of
 * their timezone or clock format -- which is exactly what we need.
 */
export function currentTimeSlot(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (TIME_SLOT_HOURS * 60 * 60 * 1000));
}

/** How many minutes until the world rerolls. Useful for a HUD countdown later. */
export function minutesUntilNextSlot(nowMs: number = Date.now()): number {
  const slotMs = TIME_SLOT_HOURS * 60 * 60 * 1000;
  return Math.ceil((slotMs - (nowMs % slotMs)) / 60000);
}

/* -------------------------------------------------------------------- */
/* 3. THE PREDICTABLE DICE                                               */
/* -------------------------------------------------------------------- */

/**
 * Squash any piece of text into a single number. Same text in, same number out,
 * on every phone, forever. (This is the well-known FNV-1a hash.)
 */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // The odd-looking multiply is the standard FNV constant, written this way
    // so JavaScript does not lose precision on large numbers.
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // force it to be a positive whole number
}

/**
 * A dice-roller that always rolls the same sequence for the same starting seed.
 * Call it repeatedly to get numbers between 0 and 1, like Math.random() -- except
 * completely predictable, which is the entire point.
 *
 * (This is the "mulberry32" generator: tiny, fast, and good enough for a game.)
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------- */
/* 4. PUTTING IT TOGETHER                                                */
/* -------------------------------------------------------------------- */

export interface WorldCell {
  /** The geohash code naming this patch of world. */
  cell: string;
  /** Which numbered time block we are in. */
  timeSlot: number;
  /** The combined seed. Everything about this cell right now derives from it. */
  seed: number;
  /** Human-readable version, shown in the dev panel. */
  label: string;
}

/**
 * Work out the world cell for a position and time. From M4 onwards, nest
 * positions, types and counts are all rolled from `seed` -- and nothing else.
 *
 * TEST IT YOURSELF once dev mode is running: drag the fake GPS marker a long
 * way and the cell code changes. Drag it a short way and it stays the same.
 */
export function worldCellFor(lat: number, lng: number, nowMs: number = Date.now()): WorldCell {
  const cell = geohash(lat, lng, 6);
  const timeSlot = currentTimeSlot(nowMs);
  const seed = hashString(`${cell}:${timeSlot}`);
  return {
    cell,
    timeSlot,
    seed,
    label: `${cell} @ slot ${timeSlot}`,
  };
}
