/**
 * EQUIPMENT.
 * ==========
 * The main thing coins are for.
 *
 * Characters give you one decision before a run. Equipment gives you three at
 * once, and they combine: a whetstone on a Sniper is a different game from a
 * whetstone on a Bladedancer, and swapping one charm changes which upgrade
 * cards you want. That combinatorial quality is why this is a better coin sink
 * than simply adding more characters.
 *
 * THREE SLOTS, ONE ITEM EACH. A slot limit is what forces a choice; without it
 * the shop becomes a shopping list and everyone ends up with the same loadout.
 *
 * Everything here is bought once and kept forever. Nothing is consumable --
 * running out of something mid-walk, far from home, would be exactly the kind of
 * pressure this game refuses to create.
 */

export type EquipmentSlot = 'weapon' | 'armour' | 'charm';

export interface EquipmentItem {
  id: string;
  slot: EquipmentSlot;
  name: string;
  description: string;
  glyph: string;
  cost: number;

  /* Every effect is optional; an item only fills in what it changes. */
  damageMultiplier?: number;
  fireRateMultiplier?: number;
  rangeMultiplier?: number;
  extraProjectiles?: number;
  pierce?: number;
  healthBonus?: number;
  armour?: number;
  regenBonus?: number;
  pickupMultiplier?: number;
  coinBonus?: number;
  captureSpeedMultiplier?: number;
  xpMultiplier?: number;
}

export const SLOT_NAMES: Record<EquipmentSlot, string> = {
  weapon: 'Weapon',
  armour: 'Armour',
  charm: 'Charm',
};

export const EQUIPMENT: EquipmentItem[] = [
  /* ---------------------------------------------------------------- */
  /* WEAPON -- what your guns do                                       */
  /* ---------------------------------------------------------------- */
  {
    id: 'whetstone',
    slot: 'weapon',
    name: 'Whetstone',
    description: 'Everything you fire hits 15% harder.',
    glyph: '🪒',
    cost: 120,
    damageMultiplier: 1.15,
  },
  {
    id: 'hairtrigger',
    slot: 'weapon',
    name: 'Hair Trigger',
    description: 'Everything fires 18% more often.',
    glyph: '⚙️',
    cost: 150,
    fireRateMultiplier: 1.18,
  },
  {
    id: 'longbarrel',
    slot: 'weapon',
    name: 'Long Barrel',
    description: '+20% reach, up to the limit of what you can see.',
    glyph: '🔭',
    cost: 140,
    rangeMultiplier: 1.2,
  },
  /*
   * This slot used to end with a "Splitter" giving +1 projectile and +1 pierce.
   * Measured, it turned a run that died at 97 seconds into one that was still at
   * full health after 240 -- and either half did it alone, because the plain
   * bolt fires ONE shot, so "+1" is simply double damage, and monsters queue up
   * in a street so a piercing shot hits the whole queue.
   *
   * A permanent purchase that makes the game unlosable is not an upgrade, it is
   * an off switch. Extra shots and piercing stay where they belong: level-up
   * cards, earned inside a run and lost when it ends.
   */
  {
    id: 'rig',
    slot: 'weapon',
    name: 'Balanced Rig',
    description: 'A little of everything: 8% more damage, 8% faster, 8% further.',
    glyph: '🔧',
    cost: 260,
    damageMultiplier: 1.08,
    fireRateMultiplier: 1.08,
    rangeMultiplier: 1.08,
  },

  /* ---------------------------------------------------------------- */
  /* ARMOUR -- how long you last                                       */
  /* ---------------------------------------------------------------- */
  {
    id: 'padded',
    slot: 'armour',
    name: 'Padded Jacket',
    description: '+60 health. Plain and reliable.',
    glyph: '🧥',
    cost: 110,
    healthBonus: 60,
  },
  {
    id: 'plates',
    slot: 'armour',
    name: 'Steel Plates',
    description: 'Ignore 15% more of every hit.',
    glyph: '🛡️',
    cost: 190,
    armour: 0.15,
  },
  {
    id: 'fieldkit',
    slot: 'armour',
    name: 'Field Kit',
    description: 'Heal back three points of health every second.',
    glyph: '🩹',
    cost: 210,
    regenBonus: 3,
  },

  /* ---------------------------------------------------------------- */
  /* CHARM -- everything else                                          */
  /* ---------------------------------------------------------------- */
  {
    id: 'magnet',
    slot: 'charm',
    name: 'Lodestone',
    description: 'Sweep up loot from 55% further as you walk.',
    glyph: '🧲',
    cost: 130,
    pickupMultiplier: 1.55,
  },
  {
    id: 'purse',
    slot: 'charm',
    name: 'Cut Purse',
    description: 'Far more monsters carry money.',
    glyph: '💰',
    cost: 200,
    coinBonus: 0.14,
  },
  {
    id: 'lens',
    slot: 'charm',
    name: 'Scholar Lens',
    description: '+30% experience from everything you pick up.',
    glyph: '🔬',
    cost: 240,
    xpMultiplier: 1.3,
  },
  {
    id: 'compass',
    slot: 'charm',
    name: 'Surveyor Compass',
    description: 'Clear nests 25% faster. Less time standing still outdoors.',
    glyph: '🧭',
    cost: 230,
    captureSpeedMultiplier: 1.25,
  },
];

export function itemById(id: string): EquipmentItem | undefined {
  return EQUIPMENT.find((item) => item.id === id);
}

/** Everything currently worn, combined into one set of numbers. */
export interface EquipmentBonuses {
  damageMultiplier: number;
  fireRateMultiplier: number;
  rangeMultiplier: number;
  extraProjectiles: number;
  pierce: number;
  healthBonus: number;
  armour: number;
  regenBonus: number;
  pickupMultiplier: number;
  coinBonus: number;
  captureSpeedMultiplier: number;
  xpMultiplier: number;
}

export function bonusesFromEquipment(equipped: Partial<Record<EquipmentSlot, string>>): EquipmentBonuses {
  const total: EquipmentBonuses = {
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    rangeMultiplier: 1,
    extraProjectiles: 0,
    pierce: 0,
    healthBonus: 0,
    armour: 0,
    regenBonus: 0,
    pickupMultiplier: 1,
    coinBonus: 0,
    captureSpeedMultiplier: 1,
    xpMultiplier: 1,
  };

  for (const id of Object.values(equipped)) {
    if (!id) continue;
    const item = itemById(id);
    if (!item) continue;

    total.damageMultiplier *= item.damageMultiplier ?? 1;
    total.fireRateMultiplier *= item.fireRateMultiplier ?? 1;
    total.rangeMultiplier *= item.rangeMultiplier ?? 1;
    total.extraProjectiles += item.extraProjectiles ?? 0;
    total.pierce += item.pierce ?? 0;
    total.healthBonus += item.healthBonus ?? 0;
    total.armour += item.armour ?? 0;
    total.regenBonus += item.regenBonus ?? 0;
    total.pickupMultiplier *= item.pickupMultiplier ?? 1;
    total.coinBonus += item.coinBonus ?? 0;
    total.captureSpeedMultiplier *= item.captureSpeedMultiplier ?? 1;
    total.xpMultiplier *= item.xpMultiplier ?? 1;
  }

  return total;
}
