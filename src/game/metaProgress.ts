/**
 * PERMANENT PROGRESS.
 * ===================
 * What you keep when a run ends.
 *
 * The upgrade cards inside a run are lost every time you die -- that is what
 * makes each run a fresh set of decisions. This is the other half: essence
 * earned by clearing nests, spent on small permanent improvements that make the
 * next run start a little stronger.
 *
 * COSTS RISE WITH THE SQUARE OF WHAT YOU OWN, so the first level of something is
 * cheap and the last is a project. That is deliberate: a permanent upgrade track
 * that can be finished in an afternoon stops being progress and becomes a chore
 * with a receipt.
 *
 * WHY THE BONUSES ARE SMALL. If permanent upgrades were powerful, a new player
 * would simply be worse at the game than an old one, and the interesting part --
 * which cards you pick this run -- would stop mattering. These are meant to widen
 * the door, not to walk through it for you.
 *
 * WHERE THE ESSENCE COMES FROM: clearing a nest, which can only be done on foot.
 * So permanent progress is paid for in footsteps, exactly as the brief requires.
 */

export interface MetaUpgrade {
  id: string;
  title: string;
  description: string;
  glyph: string;
  /** How many times it can be bought. */
  maxLevel: number;
  /** Cost of the next level, given how many you already have. */
  costAt: (level: number) => number;
}

export const META_UPGRADES: MetaUpgrade[] = [
  {
    id: 'vigour',
    title: 'Vigour',
    description: '+12 starting health per level.',
    glyph: '✚',
    maxLevel: 10,
    costAt: (level) => 55 + level * level * 14,
  },
  {
    id: 'edge',
    title: 'Edge',
    description: '+6% damage from everything, per level.',
    glyph: '✦',
    maxLevel: 10,
    costAt: (level) => 70 + level * level * 18,
  },
  {
    id: 'reach',
    title: 'Reach',
    description: '+2 metres of rope per level. More room to move without walking.',
    glyph: '⌒',
    maxLevel: 6,
    costAt: (level) => 90 + level * level * 30,
  },
  {
    id: 'greed',
    title: 'Greed',
    description: '+20% pickup range per level. Fewer levels missed.',
    glyph: '⊙',
    maxLevel: 6,
    costAt: (level) => 65 + level * level * 20,
  },
  {
    id: 'haste',
    title: 'Haste',
    description: '+5% movement per level.',
    glyph: '»',
    maxLevel: 6,
    costAt: (level) => 85 + level * level * 26,
  },
  {
    id: 'resolve',
    title: 'Resolve',
    description: 'Clear nests 8% faster per level. Less time standing still outdoors.',
    glyph: '◈',
    maxLevel: 5,
    costAt: (level) => 110 + level * level * 40,
  },
];

/** How many of each upgrade the player owns. */
export type MetaLevels = Record<string, number>;

export function metaLevel(levels: MetaLevels, id: string): number {
  return levels[id] ?? 0;
}

export function costToBuy(upgrade: MetaUpgrade, levels: MetaLevels): number | null {
  const owned = metaLevel(levels, upgrade.id);
  if (owned >= upgrade.maxLevel) return null;
  return upgrade.costAt(owned);
}

/** The effects of everything owned, as plain numbers the game can apply. */
export interface MetaBonuses {
  bonusHealth: number;
  damageMultiplier: number;
  bonusLeashMetres: number;
  pickupMultiplier: number;
  moveMultiplier: number;
  captureSpeedMultiplier: number;
}

export function bonusesFrom(levels: MetaLevels): MetaBonuses {
  return {
    bonusHealth: metaLevel(levels, 'vigour') * 12,
    damageMultiplier: 1 + metaLevel(levels, 'edge') * 0.06,
    bonusLeashMetres: metaLevel(levels, 'reach') * 2,
    pickupMultiplier: 1 + metaLevel(levels, 'greed') * 0.2,
    moveMultiplier: 1 + metaLevel(levels, 'haste') * 0.05,
    captureSpeedMultiplier: 1 + metaLevel(levels, 'resolve') * 0.08,
  };
}
