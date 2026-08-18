/**
 * MODULE 3 OF 3: WHAT THE PLAYER OWNS.
 * ====================================
 * Everything that belongs to YOU and survives closing the app: settings, and
 * later your permanent upgrades, currency and statistics.
 *
 * Deliberately kept separate from "what the world contains", because these two
 * things have different futures. The world will eventually move to a server.
 * This will eventually move to a real account. Neither should drag the other
 * along with it.
 *
 * For the prototype everything is saved in "localStorage", which is a small
 * box of text the browser keeps for our website on your phone. It survives
 * closing the tab and restarting the phone. It does NOT survive clearing your
 * browser data, and it does not follow you to another device -- both fine for
 * a prototype, both fixed later by real accounts.
 */

/** The shape of everything we save. Version it so old saves can be upgraded. */
export interface ProfileData {
  /** Bumped whenever the shape below changes, so we can migrate old saves. */
  version: number;
  /** Reduces entity counts and map redraws to save battery. Wired up in M6. */
  lowPowerMode: boolean;
  /** Whether the player has finished the tutorial. Used in M6. */
  tutorialComplete: boolean;
  /** When this profile was first created. */
  createdAtMs: number;
  /** Total number of times the game has been opened. */
  sessionCount: number;
  /**
   * The last place we knew the player was. Purely a convenience: it lets the map
   * open on their neighbourhood immediately instead of showing a blank grey
   * rectangle for the two seconds the GPS takes to wake up.
   */
  lastKnownPosition: { lat: number; lng: number } | null;
}

const STORAGE_KEY = 'geo-survivors.profile';
const CURRENT_VERSION = 1;

function freshProfile(): ProfileData {
  return {
    version: CURRENT_VERSION,
    lowPowerMode: false,
    tutorialComplete: false,
    createdAtMs: Date.now(),
    sessionCount: 0,
    lastKnownPosition: null,
  };
}

export class Profile {
  private data: ProfileData;

  constructor() {
    this.data = this.load();
    this.data.sessionCount += 1;
    this.save();
  }

  private load(): ProfileData {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return freshProfile();

      const parsed = JSON.parse(stored) as Partial<ProfileData>;

      // A save from an older version of the game: start from a fresh profile and
      // copy across whatever still makes sense. This is what stops an update
      // from crashing on somebody's old data.
      if (parsed.version !== CURRENT_VERSION) {
        console.info('[profile] save file is from an older version, upgrading it');
        return { ...freshProfile(), ...parsed, version: CURRENT_VERSION };
      }

      return { ...freshProfile(), ...parsed };
    } catch (error) {
      // Corrupted or unreadable save. Never let this stop the game from opening.
      console.warn('[profile] could not read the save file, starting fresh', error);
      return freshProfile();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      // Private browsing mode, or the storage is full. Not fatal -- the game
      // still works, it just will not remember anything.
      console.warn('[profile] could not write the save file', error);
    }
  }

  get(): Readonly<ProfileData> {
    return this.data;
  }

  /** Change one or more saved settings and write them to disk immediately. */
  update(patch: Partial<ProfileData>): void {
    this.data = { ...this.data, ...patch, version: CURRENT_VERSION };
    this.save();
  }

  /** Wipe everything. The dev panel uses this; players get it in M6 settings. */
  reset(): void {
    this.data = freshProfile();
    this.save();
  }
}
