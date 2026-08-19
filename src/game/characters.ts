/**
 * CHARACTERS.
 * ===========
 * What coins are actually for.
 *
 * The permanent stat upgrades make every run slightly stronger. Characters do
 * something more interesting: they make a run START somewhere else. Each one
 * begins with a different weapon and a different shape of strengths, so the
 * cards that look good change with the character you picked.
 *
 * WHY THEY ARE NOT STRICTLY BETTER THAN EACH OTHER. Every character gives up
 * something for what it gains -- the sniper is fragile, the bruiser is slow, the
 * collector fights badly. A shop that sold "the good one" would end the choice
 * the moment it was affordable, and the choice is the product.
 *
 * The first character is free, so a new player has a game before they have any
 * money at all.
 */

import { WeaponId, type WeaponIdValue } from './upgrades';

export interface Character {
  id: string;
  name: string;
  /** One line the player reads while deciding. */
  description: string;
  /** The emoji drawn on the map for this character. */
  sprite: number;
  /** Coins to unlock. Zero means it is there from the start. */
  cost: number;
  /** What they begin the run holding, instead of the plain bolt. */
  startingWeapon: WeaponIdValue;
  /* Multipliers and bonuses applied on top of everything else. */
  healthBonus: number;
  damageMultiplier: number;
  rangeMultiplier: number;
  fireRateMultiplier: number;
  pickupMultiplier: number;
  /** Extra chance of a coin dropping, added to the base chance. */
  coinBonus: number;
  armour: number;
}

/**
 * Sprite numbers come from the emoji sheet. Keep these in step with SPRITES in
 * `emojiAtlas.ts` -- the same trap that once gave the scorpion a spider's face.
 */
export const CHARACTERS: Character[] = [
  {
    id: 'wanderer',
    name: 'Wanderer',
    description: 'Balanced, unremarkable, and the only one you start with. A fair fight.',
    sprite: 7,
    cost: 0,
    startingWeapon: WeaponId.BOLT,
    /**
     * Deliberately given a little more than nothing.
     *
     * Measured with everyone standing still for three minutes: the paid
     * characters managed around 190 kills each and the free one seventeen,
     * dying at 110 s. A starter ten times weaker than what you can buy is a
     * miserable first impression, and it edges toward selling power -- which
     * the brief rules out. It should be the plainest choice, not the worst one.
     */
    healthBonus: 20,
    damageMultiplier: 1.2,
    rangeMultiplier: 1.1,
    fireRateMultiplier: 1.15,
    pickupMultiplier: 1,
    coinBonus: 0,
    armour: 0,
  },
  {
    id: 'bladedancer',
    name: 'Bladedancer',
    description: 'Begins with orbiting shards. Tough and close-quarters — you want the swarm on top of you.',
    sprite: 9,
    cost: 220,
    startingWeapon: WeaponId.ORBIT,
    healthBonus: 60,
    damageMultiplier: 1.15,
    rangeMultiplier: 0.9,
    fireRateMultiplier: 1,
    pickupMultiplier: 1,
    coinBonus: 0,
    armour: 0.1,
  },
  {
    id: 'sniper',
    name: 'Sniper',
    description: 'Begins with the piercing lance, and reaches further than anyone. Fragile — do not let them close.',
    sprite: 10,
    cost: 320,
    startingWeapon: WeaponId.LANCE,
    healthBonus: -50,
    damageMultiplier: 1.25,
    rangeMultiplier: 1.35,
    fireRateMultiplier: 0.85,
    pickupMultiplier: 1,
    coinBonus: 0,
    armour: 0,
  },
  {
    id: 'bruiser',
    name: 'Bruiser',
    description: 'Begins with the scattergun. Shrugs off damage, but slow to fire and short of reach.',
    sprite: 11,
    cost: 400,
    startingWeapon: WeaponId.SCATTER,
    healthBonus: 110,
    damageMultiplier: 0.9,
    rangeMultiplier: 0.9,
    fireRateMultiplier: 0.9,
    pickupMultiplier: 1,
    coinBonus: 0,
    armour: 0.25,
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Sweeps up loot from twice as far and finds far more money. A poor fighter — survival is the trade.',
    sprite: 12,
    cost: 520,
    startingWeapon: WeaponId.BOLT,
    healthBonus: 20,
    damageMultiplier: 0.8,
    rangeMultiplier: 1,
    fireRateMultiplier: 1,
    pickupMultiplier: 2,
    coinBonus: 0.22,
    armour: 0,
  },
];

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
