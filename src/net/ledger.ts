/**
 * THE LEDGER — what people did, and nothing else.
 * ===============================================
 * The world is calculated: nests, prices, street layout, every building on
 * Earth. None of it is ever sent anywhere. What a server has to remember is a
 * short list of things people DID: who owns which building and what they paid.
 *
 * That is the whole reason this game can be cheap to run. See MONETIZATION.md.
 *
 * WHY THIS FILE EXISTS BEFORE THERE IS A SERVER.
 *
 * Everything here is written against an interface with a local implementation,
 * so the game already behaves exactly as it will with a backend -- claims are
 * made, refused, and reconciled -- while running entirely on the phone. When a
 * backend appears it is a different implementation of the same three methods,
 * not a rewrite of the game.
 *
 * The same approach worked for the map mirror: the plumbing was built long
 * before it was pointed anywhere real.
 *
 * TWO RULES THAT ARE NOT NEGOTIABLE ONCE OTHER PEOPLE ARE INVOLVED.
 *
 * 1. THE CLIENT IS NOT BELIEVED ABOUT MONEY. A phone saying "I have ten
 *    thousand coins, sell me the cafe" is a claim, not a fact. Today, with one
 *    player and nobody to take anything from, it costs nothing to trust. The
 *    moment a purchase can take something from somebody else, the balance has to
 *    live where the player cannot edit it. `LocalLedger` is therefore explicitly
 *    NOT a security model, and says so, so that nobody later mistakes it for one.
 *
 * 2. OWNERSHIP IS PUBLIC; WHERE SOMEBODY WALKS IS NEVER. Owning a building is
 *    meant to be seen -- that is the entire point of being outbid. But a
 *    building somebody bought is usually near where they live, and a public
 *    history of who owns what and when they bought it is a tool for finding
 *    people. So the ledger holds an owner's chosen NAME and nothing else: no
 *    identifier that follows them elsewhere, no times of day, no positions, no
 *    history of where they have been. The journal that records how far somebody
 *    walked stays on their own phone and never comes here.
 */

/** One building somebody owns. Everything else about it is calculated. */
export interface LedgerEntry {
  /** The building's own name, from its corners. See `property.ts`. */
  key: string;
  /** Where to draw it. The building's position, not a person's. */
  lat: number;
  lng: number;
  /** Whatever the owner chose to be called. Never an account identifier. */
  ownerName: string;
  /** True when this is the player asking. */
  mine: boolean;
  /** What was last paid. The next buyer has to beat it. */
  paid: number;
}

export interface ClaimResult {
  ok: boolean;
  /** Set when refused, in words a player can read. */
  reason?: string;
  entry?: LedgerEntry;
}

/**
 * Everything the game needs from a backend, and nothing more.
 *
 * Three methods. Anything that cannot be done with these three is a feature we
 * have not agreed to, which is the point of writing it down this early.
 */
export interface Ledger {
  /** What is owned around here? Called when the world is built. */
  around(lat: number, lng: number, radiusMetres: number): Promise<LedgerEntry[]>;
  /** Try to buy. May be refused -- somebody else may have got there first. */
  claim(key: string, lat: number, lng: number, offer: number): Promise<ClaimResult>;
  /** Am I connected to anything, or is this just my own phone? */
  isShared(): boolean;
}

/**
 * The one that runs on the phone, with no server at all.
 *
 * THIS IS NOT A SECURITY MODEL. It believes everything it is told, because
 * there is nobody to lie to: the only person affected by a claim is the person
 * making it. It exists so the game plays exactly as it will later, and so that
 * the day a real backend arrives, the game does not have to change.
 */
export class LocalLedger implements Ledger {
  private read: () => LedgerEntry[];
  private write: (entries: LedgerEntry[]) => void;

  constructor(read: () => LedgerEntry[], write: (entries: LedgerEntry[]) => void) {
    this.read = read;
    this.write = write;
  }

  isShared(): boolean {
    return false;
  }

  async around(lat: number, lng: number, radiusMetres: number): Promise<LedgerEntry[]> {
    return this.read().filter((entry) => {
      const dy = (entry.lat - lat) * 111320;
      const dx = (entry.lng - lng) * 111320 * Math.cos((lat * Math.PI) / 180);
      return Math.hypot(dx, dy) <= radiusMetres;
    });
  }

  async claim(key: string, lat: number, lng: number, offer: number): Promise<ClaimResult> {
    const entries = this.read();
    const existing = entries.find((e) => e.key === key);

    // The rule that will matter later, enforced now so the shape is right: you
    // may only take something off somebody by paying more than they did.
    if (existing && !existing.mine && offer <= existing.paid) {
      return { ok: false, reason: `Already owned. You would have to beat ${existing.paid}.` };
    }
    if (existing?.mine) {
      return { ok: false, reason: 'You already own this one.' };
    }

    const entry: LedgerEntry = { key, lat, lng, ownerName: 'you', mine: true, paid: offer };
    this.write([...entries.filter((e) => e.key !== key), entry]);
    return { ok: true, entry };
  }
}

/**
 * The one that talks to our own server.
 *
 * Falls back to silence rather than to failure: if the server is not
 * configured, or unreachable, `around` returns nothing and `claim` refuses
 * politely. A player halfway through a walk with no signal must not be told the
 * game is broken -- they simply cannot buy anything until they are back in
 * range, which is the truth.
 */
export class RemoteLedger implements Ledger {
  private deviceId: string;
  private playerName: () => string;
  private configured = true;

  constructor(deviceId: string, playerName: () => string) {
    this.deviceId = deviceId;
    this.playerName = playerName;
  }

  isShared(): boolean {
    return this.configured;
  }

  async around(lat: number, lng: number, radiusMetres: number): Promise<LedgerEntry[]> {
    try {
      const response = await fetch(
        `/api/ledger?lat=${lat}&lng=${lng}&radius=${Math.round(radiusMetres)}` +
          `&deviceId=${encodeURIComponent(this.deviceId)}`
      );
      if (!response.ok) return [];
      const body = (await response.json()) as { configured?: boolean; entries?: LedgerEntry[] };
      this.configured = body.configured !== false;
      return body.entries ?? [];
    } catch {
      // No signal. Not an error worth showing anybody.
      return [];
    }
  }

  async claim(key: string, lat: number, lng: number, offer: number): Promise<ClaimResult> {
    try {
      const response = await fetch('/api/ledger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          playerName: this.playerName(),
          key,
          lat,
          lng,
          offer,
        }),
      });
      const body = (await response.json()) as ClaimResult & { configured?: boolean };
      if (body.configured === false) {
        this.configured = false;
        return { ok: false, reason: 'Not connected to anything yet.' };
      }
      return body;
    } catch {
      return { ok: false, reason: 'No signal — try again when you are back in range.' };
    }
  }
}
