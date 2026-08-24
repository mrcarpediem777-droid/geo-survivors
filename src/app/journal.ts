/**
 * THE JOURNAL — a local record of what actually happened.
 * =======================================================
 * Everything measured so far has come from a simulation standing still on one
 * street in Da Nang. That has been useful and it has also been repeatedly,
 * embarrassingly wrong: it never noticed that the game was empty indoors, that
 * monsters were faster than a walking human, or that a hint about nests could
 * not fire. This is the beginning of the fix — a record of real walks, so that
 * balance stops being an argument about what a run "feels like".
 *
 * WHAT IT DELIBERATELY DOES NOT KEEP.
 *
 * **No positions. Ever.** Not coordinates, not the neighbourhood, not the town.
 * A log of where somebody walks and when is one of the most sensitive things a
 * phone can produce, and this game would have an unusually good one — it knows
 * where you go on foot, at what times, on which days. So it keeps how FAR you
 * walked and never where. That is enough to balance a game, and useless to
 * anybody who steals it.
 *
 * It never leaves the phone. There is no server here and no request is made.
 * Exporting is a button the player presses, which hands them the text, and then
 * it is theirs to do as they like with.
 */

const STORAGE_KEY = 'geo-survivors.journal';

/**
 * How many entries are kept. Roughly a fortnight of steady play, and small
 * enough that it can never crowd out the save file in the browser's storage
 * box, which they share.
 */
const MAX_ENTRIES = 400;

export interface JournalEntry {
  /** Milliseconds since 1970. Recorded so runs can be told apart by day. */
  at: number;
  kind: string;
  /** Whatever is worth knowing about this kind of event. Never a position. */
  detail: Record<string, number | string | boolean>;
}

export class Journal {
  private entries: JournalEntry[];

  constructor() {
    this.entries = this.load();
  }

  private load(): JournalEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as JournalEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // A corrupted log is worth nothing and must never stop the game opening.
      return [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // Storage full or private browsing. The game does not depend on this.
    }
  }

  record(kind: string, detail: Record<string, number | string | boolean> = {}): void {
    this.entries.push({ at: Date.now(), kind, detail });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.save();
  }

  count(): number {
    return this.entries.length;
  }

  /** A short human summary, for the settings screen. */
  summary(): string {
    if (this.entries.length === 0) return 'nothing recorded yet';

    let runs = 0;
    let seconds = 0;
    let metres = 0;
    let nests = 0;
    let ads = 0;
    let adFailures = 0;

    for (const e of this.entries) {
      if (e.kind === 'run-ended') {
        runs++;
        seconds += Number(e.detail.seconds ?? 0);
        metres += Number(e.detail.metresWalked ?? 0);
      }
      if (e.kind === 'nest-cleared') nests++;
      if (e.kind === 'ad') {
        ads++;
        if (e.detail.outcome === 'failed-to-load') adFailures++;
      }
    }

    const km = (metres / 1000).toFixed(2);
    const minutes = Math.round(seconds / 60);
    return (
      `${runs} runs · ${minutes} min played · ${km} km walked · ` +
      `${nests} nests cleared · ${ads} ads (${adFailures} failed)`
    );
  }

  /** The whole thing as text, for the player to keep. */
  export(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        note: 'Geo-Survivors local play log. Contains no locations.',
        entries: this.entries,
      },
      null,
      2
    );
  }

  clear(): void {
    this.entries = [];
    this.save();
  }
}
