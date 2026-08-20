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
  /**
   * True once we have discovered that this phone's network will not deliver map
   * data directly and we had to route it through our own website. Remembering it
   * means the player never sits through that 12-second discovery twice.
   */
  useTileMirror: boolean;

  /* --- permanent progress, the only things that survive dying --- */
  /** Currency earned by clearing nests. Only ever earned on foot. */
  essence: number;
  /** How many of each permanent upgrade have been bought. */
  metaLevels: Record<string, number>;
  /** Lifetime totals, for the analytics export in M6 and for bragging. */
  nestsCleared: number;
  bestSurvivalSeconds: number;
  bestLevel: number;
  /** Characters bought so far. The first one is always there. */
  unlockedCharacters: string[];
  /** Which one is being played. */
  selectedCharacter: string;
  /** Every piece of equipment bought so far, by id. */
  ownedEquipment: string[];
  /** Which item is worn in each of the three slots. Empty means nothing. */
  equippedBySlot: Record<string, string>;
}

const STORAGE_KEY = 'geo-survivors.profile';
const CURRENT_VERSION = 5;

function freshProfile(): ProfileData {
  return {
    version: CURRENT_VERSION,
    lowPowerMode: false,
    tutorialComplete: false,
    createdAtMs: Date.now(),
    sessionCount: 0,
    lastKnownPosition: null,
    useTileMirror: false,
    essence: 0,
    metaLevels: {},
    nestsCleared: 0,
    bestSurvivalSeconds: 0,
    bestLevel: 1,
    unlockedCharacters: ['wanderer'],
    selectedCharacter: 'wanderer',
    ownedEquipment: [],
    equippedBySlot: {},
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
        return {
          ...freshProfile(),
          ...parsed,
          version: CURRENT_VERSION,
          // Version 2 clears this deliberately. While the real cause of a blank
          // map was being hunted, some phones got the mirror switched on because
          // the map appeared to be unreachable. The actual fault was a missing
          // file in our own build, now fixed -- so anyone carrying that flag
          // should go back to talking to the map servers directly, which is
          // faster and costs us no bandwidth. If a network genuinely does block
          // them, it will simply be switched on again within a few seconds.
          useTileMirror: false,
          // Version 3 adds permanent progress. Anyone upgrading keeps whatever
          // they had and simply starts with none of it.
          essence: parsed.essence ?? 0,
          metaLevels: parsed.metaLevels ?? {},
          nestsCleared: parsed.nestsCleared ?? 0,
          bestSurvivalSeconds: parsed.bestSurvivalSeconds ?? 0,
          bestLevel: parsed.bestLevel ?? 1,
          // Version 4 adds characters. Anyone upgrading keeps their money and
          // simply starts with the free one.
          unlockedCharacters: parsed.unlockedCharacters ?? ['wanderer'],
          selectedCharacter: parsed.selectedCharacter ?? 'wanderer',
          // Version 5 adds equipment. Nobody owns any yet, which is correct --
          // it has never been on sale before.
          ownedEquipment: parsed.ownedEquipment ?? [],
          equippedBySlot: parsed.equippedBySlot ?? {},
        };
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
