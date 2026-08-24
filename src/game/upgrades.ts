/**
 * UPGRADE CARDS.
 * ==============
 * Every decision the player makes in a run happens here. The joystick is the
 * only control during combat and all weapons fire themselves, so the ONLY thing
 * separating one run from another is which cards were picked.
 *
 * That means this file is where the replayability lives. The brief asks for
 * 12-15 cards producing visibly different playstyles, so the pool is built
 * around a simple rule:
 *
 *   WEAPONS change what the fight looks like.
 *   PASSIVES change how much of it you get.
 *
 * A player who takes the orbit and the pulse ends up hugging the swarm and
 * killing everything that touches them. A player who takes the lance and range
 * ends up standing at the end of an alley deleting whole queues of monsters. A
 * player who takes scatter and multishot ends up shredding anything close but
 * helpless against a spitter across the square. Those are three different games,
 * and none of them required a different button.
 */

/** A weapon fires on its own timer. Each behaves visibly differently. */
export const WeaponId = {
  BOLT: 'bolt',
  SCATTER: 'scatter',
  ORBIT: 'orbit',
  PULSE: 'pulse',
  LANCE: 'lance',

  /* --- what they become. See EVOLUTIONS below. --- */
  FUSILLADE: 'fusillade',
  FLECHETTE: 'flechette',
  MAELSTROM: 'maelstrom',
  BULWARK: 'bulwark',
  RAILSPIKE: 'railspike',
} as const;

export type WeaponIdValue = (typeof WeaponId)[keyof typeof WeaponId];

export interface WeaponState {
  id: WeaponIdValue;
  level: number;
  /** Seconds until this fires again. */
  cooldown: number;
  /** Rotation for the orbiting blades, in radians. */
  spin: number;
}

/**
 * Everything the player has accumulated this run.
 * Passives are multipliers and additions applied on top of the base numbers in
 * the tuning file, so tuning and progression stay separate.
 */
export interface Loadout {
  weapons: WeaponState[];

  /* Passive effects, all starting neutral. */
  damageMultiplier: number;
  fireRateMultiplier: number;
  rangeMultiplier: number;
  /** Extra shots added to every volley. */
  extraProjectiles: number;
  /** How many monsters a shot passes through before stopping. */
  pierce: number;
  pickupRadiusMultiplier: number;
  maxHealthBonus: number;
  /** Fraction of incoming damage ignored, 0 to 0.6. */
  armour: number;
  /** Extra health healed per second, on top of the base trickle. */
  regenBonus: number;
  /** Multiplies every scrap of experience picked up. */
  xpMultiplier: number;
}

export function freshLoadout(): Loadout {
  return {
    weapons: [{ id: WeaponId.BOLT, level: 1, cooldown: 0, spin: 0 }],
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    rangeMultiplier: 1,
    extraProjectiles: 0,
    pierce: 0,
    pickupRadiusMultiplier: 1,
    maxHealthBonus: 0,
    armour: 0,
    regenBonus: 0,
    xpMultiplier: 1,
  };
}

/**
 * EVOLUTIONS — where the depth actually comes from.
 * =================================================
 * The brief is explicit: the joystick is the only input, every weapon fires
 * itself, and **depth comes only from level-up cards**. Up to now that promise
 * was thin, because the cards were mostly percentages. Taking "+22% damage"
 * three times is not a decision, it is arithmetic.
 *
 * An evolution needs a WEAPON you have invested in and a PASSIVE you have
 * invested in, together. That turns every passive card into a question -- do I
 * take the third Split Shot because the numbers are good, or because it turns my
 * bolt into something else entirely? -- and it means two players holding the
 * same weapon can end a run holding different things.
 *
 * Each one REPLACES its parent rather than stacking beside it, so a kit stays
 * readable and the four-weapon limit still means something.
 */
export interface Evolution {
  /** The weapon that grows up. */
  from: WeaponIdValue;
  /** What it becomes. */
  to: WeaponIdValue;
  /** The passive card that has to have been taken, and how often. */
  passiveId: string;
  passiveTimes: number;
  /** How many levels of the base weapon are needed first. */
  weaponLevel: number;
  title: string;
  description: string;
  glyph: string;
}

export const EVOLUTIONS: Evolution[] = [
  {
    from: WeaponId.BOLT,
    to: WeaponId.FUSILLADE,
    passiveId: 'multishot',
    passiveTimes: 3,
    weaponLevel: 4,
    title: 'Fusillade',
    description: 'Your bolt stops picking one target and fires at five at once.',
    glyph: '⁙',
  },
  {
    from: WeaponId.SCATTER,
    to: WeaponId.FLECHETTE,
    passiveId: 'pierce',
    passiveTimes: 3,
    weaponLevel: 4,
    title: 'Flechette Storm',
    description: 'The spray becomes a full ring of needles that punch through everything.',
    glyph: '✳',
  },
  {
    from: WeaponId.ORBIT,
    to: WeaponId.MAELSTROM,
    passiveId: 'range',
    passiveTimes: 3,
    weaponLevel: 4,
    title: 'Maelstrom',
    description: 'The blades widen into a storm you stand in the middle of.',
    glyph: '❋',
  },
  {
    from: WeaponId.PULSE,
    to: WeaponId.BULWARK,
    passiveId: 'armour',
    passiveTimes: 3,
    weaponLevel: 4,
    title: 'Bulwark',
    description: 'The shockwave grows, and every monster it catches gives you back a little health.',
    glyph: '⊛',
  },
  {
    from: WeaponId.LANCE,
    to: WeaponId.RAILSPIKE,
    passiveId: 'damage',
    passiveTimes: 3,
    weaponLevel: 4,
    title: 'Railspike',
    description: 'One enormous bolt that stops for nothing and reaches as far as you can see.',
    glyph: '⇑',
  },
];

export function evolutionFor(id: WeaponIdValue): Evolution | undefined {
  return EVOLUTIONS.find((e) => e.to === id);
}

export interface UpgradeCard {
  id: string;
  /** Shown on the card. */
  title: string;
  /** One line the player reads while deciding. */
  description: string;
  /** A single character used as placeholder art. */
  glyph: string;
  /** New weapons feel different from stat bumps, so we mark them. */
  isWeapon: boolean;
  /** How many times this can be taken. */
  maxTimes: number;
  /**
   * Can it be offered right now?
   *
   * Takes the tally of what has already been taken as well as the loadout,
   * because an evolution depends on a PASSIVE having been picked several times
   * -- and a passive leaves no trace in the loadout beyond a multiplier that
   * several different cards could have produced.
   */
  available: (loadout: Loadout, taken: Map<string, number>) => boolean;
  /** Evolutions are rare and loud; they jump the queue when they are possible. */
  isEvolution?: boolean;
  apply: (loadout: Loadout) => void;
}

/** Find a weapon in the loadout, or undefined. */
function weapon(loadout: Loadout, id: WeaponIdValue): WeaponState | undefined {
  return loadout.weapons.find((w) => w.id === id);
}

/** Add a weapon, or level it up if already held. */
function addOrLevel(loadout: Loadout, id: WeaponIdValue): void {
  const existing = weapon(loadout, id);
  if (existing) existing.level++;
  else loadout.weapons.push({ id, level: 1, cooldown: 0, spin: 0 });
}

/** How many weapons a player may carry, so runs stay distinct. */
export const MAX_WEAPONS = 4;

function canTakeWeapon(loadout: Loadout, id: WeaponIdValue): boolean {
  return weapon(loadout, id) !== undefined || loadout.weapons.length < MAX_WEAPONS;
}

export const UPGRADE_CARDS: UpgradeCard[] = [
  /* ---------------------------------------------------------------- */
  /* WEAPONS -- these change what the fight looks like                  */
  /* ---------------------------------------------------------------- */
  {
    /*
     * The starting weapon had no card of its own, so it could never be improved
     * except by passives -- and the Fusillade evolution, which needs it at level
     * four, was therefore unreachable by anybody, ever. Caught by trying to
     * measure how long an evolution takes and finding one that could not happen.
     */
    id: 'bolt',
    title: 'Heavier Bolt',
    description: 'The bolt you start with hits harder and reaches further. Plain, and always useful.',
    glyph: '•',
    isWeapon: true,
    maxTimes: 5,
    available: (l) => canTakeWeapon(l, WeaponId.BOLT),
    apply: (l) => addOrLevel(l, WeaponId.BOLT),
  },
  {
    id: 'scatter',
    title: 'Scattergun',
    description: 'A short, wide spray at whatever is closest. Brutal up close, useless far away.',
    glyph: '≡',
    isWeapon: true,
    maxTimes: 5,
    available: (l) => canTakeWeapon(l, WeaponId.SCATTER),
    apply: (l) => addOrLevel(l, WeaponId.SCATTER),
  },
  {
    id: 'orbit',
    title: 'Orbiting Shards',
    description: 'Blades circle you, cutting anything that comes close. No aiming, no reload.',
    glyph: '◌',
    isWeapon: true,
    maxTimes: 5,
    available: (l) => canTakeWeapon(l, WeaponId.ORBIT),
    apply: (l) => addOrLevel(l, WeaponId.ORBIT),
  },
  {
    id: 'pulse',
    title: 'Shockwave',
    description: 'A ring of force bursts out of you every few seconds. Clears crowds off your feet.',
    glyph: '◎',
    isWeapon: true,
    maxTimes: 5,
    available: (l) => canTakeWeapon(l, WeaponId.PULSE),
    apply: (l) => addOrLevel(l, WeaponId.PULSE),
  },
  {
    id: 'lance',
    title: 'Piercing Lance',
    description: 'A long bolt that runs straight through a whole queue of monsters. Made for alleys.',
    glyph: '↑',
    isWeapon: true,
    maxTimes: 5,
    available: (l) => canTakeWeapon(l, WeaponId.LANCE),
    apply: (l) => addOrLevel(l, WeaponId.LANCE),
  },

  /* ---------------------------------------------------------------- */
  /* PASSIVES -- these change how much fight you get                    */
  /* ---------------------------------------------------------------- */
  {
    id: 'damage',
    title: 'Sharpened',
    description: 'Everything you fire hits 22% harder.',
    glyph: '✦',
    isWeapon: false,
    maxTimes: 8,
    available: () => true,
    apply: (l) => {
      l.damageMultiplier *= 1.22;
    },
  },
  {
    id: 'firerate',
    title: 'Quickened',
    description: 'Everything fires 18% more often.',
    glyph: '⚡',
    isWeapon: false,
    maxTimes: 8,
    available: () => true,
    apply: (l) => {
      l.fireRateMultiplier *= 1.18;
    },
  },
  {
    id: 'range',
    title: 'Far Sight',
    description: 'Your weapons reach 25% further. Good with the lance, wasted on the scattergun.',
    glyph: '◇',
    isWeapon: false,
    maxTimes: 6,
    available: () => true,
    apply: (l) => {
      l.rangeMultiplier *= 1.25;
    },
  },
  {
    id: 'multishot',
    title: 'Split Shot',
    description: 'One extra projectile in every volley.',
    glyph: '⋔',
    isWeapon: false,
    maxTimes: 4,
    available: () => true,
    apply: (l) => {
      l.extraProjectiles += 1;
    },
  },
  {
    id: 'pierce',
    title: 'Punch Through',
    description: 'Your shots carry on through one more monster before stopping.',
    glyph: '→',
    isWeapon: false,
    maxTimes: 4,
    available: () => true,
    apply: (l) => {
      l.pierce += 1;
    },
  },
  /*
   * These two replaced "Light Feet" and "Long Rope".
   *
   * Both of those moved the character around on the thumbstick -- and the
   * thumbstick is gone; you are simply where you really are now. They still sat
   * in the deck, still cost a level-up, and did precisely nothing. A card that
   * silently does nothing is worse than a weak card, because the player has no
   * way to find out.
   */
  {
    id: 'scholar',
    title: 'Keen Eye',
    description: 'Every scrap of experience is worth 25% more. Levels arrive sooner, all run long.',
    glyph: '✦',
    isWeapon: false,
    maxTimes: 4,
    available: () => true,
    apply: (l) => {
      l.xpMultiplier *= 1.25;
    },
  },
  {
    id: 'regen',
    title: 'Second Wind',
    description: 'Heal back a full point of health every second. Turns a bad moment into a survivable one.',
    glyph: '♡',
    isWeapon: false,
    maxTimes: 4,
    available: () => true,
    apply: (l) => {
      l.regenBonus += 1;
    },
  },
  {
    id: 'magnet',
    title: 'Magnetism',
    description: 'Experience is pulled in from 60% further away.',
    glyph: '⊙',
    isWeapon: false,
    maxTimes: 4,
    available: () => true,
    apply: (l) => {
      l.pickupRadiusMultiplier *= 1.6;
    },
  },
  {
    id: 'vitality',
    title: 'Vitality',
    description: '+30 health, and you heal back a little faster.',
    glyph: '✚',
    isWeapon: false,
    maxTimes: 6,
    available: () => true,
    apply: (l) => {
      l.maxHealthBonus += 30;
    },
  },
  {
    id: 'armour',
    title: 'Thick Skin',
    description: 'Ignore 10% more of every hit. Stacks, but never past 60%.',
    glyph: '▣',
    isWeapon: false,
    maxTimes: 6,
    available: (l) => l.armour < 0.6,
    apply: (l) => {
      l.armour = Math.min(0.6, l.armour + 0.1);
    },
  },
];

/*
 * The evolution cards, built from the table at the top of this file so the two
 * can never drift apart.
 *
 * They replace the parent weapon rather than adding to the kit, and they keep
 * whatever level it had reached -- losing that investment would make taking one
 * feel like a punishment.
 */
for (const evo of EVOLUTIONS) {
  UPGRADE_CARDS.push({
    id: 'evolve-' + evo.to,
    title: evo.title,
    description: evo.description,
    glyph: evo.glyph,
    isWeapon: true,
    isEvolution: true,
    maxTimes: 1,
    available: (loadout, taken) => {
      const held = loadout.weapons.find((w) => w.id === evo.from);
      if (!held || held.level < evo.weaponLevel) return false;
      return (taken.get(evo.passiveId) ?? 0) >= evo.passiveTimes;
    },
    apply: (loadout) => {
      const held = loadout.weapons.find((w) => w.id === evo.from);
      if (!held) return;
      held.id = evo.to;
    },
  });
}

/**
 * Choose which cards to offer at a level-up.
 *
 * Deliberately weighted so a new weapon is more likely while you have few,
 * because a run where the first three cards are all "+22% damage" is a boring
 * run. Once you have a full set the pool tilts back to sharpening what you hold.
 */
export function pickCards(
  loadout: Loadout,
  taken: Map<string, number>,
  howMany: number,
  random: () => number
): UpgradeCard[] {
  const eligible = UPGRADE_CARDS.filter(
    (card) => (taken.get(card.id) ?? 0) < card.maxTimes && card.available(loadout, taken)
  );

  const weightOf = (card: UpgradeCard): number => {
    // An evolution is the pay-off for a run's worth of decisions. Making
    // somebody wait for it to come up at random would turn the best moment in
    // the game into a lottery, so the moment it is possible it is offered.
    if (card.isEvolution) return 40;
    if (!card.isWeapon) return 1;
    // Strongly favour weapons while the player is still assembling a kit.
    const held = loadout.weapons.length;
    return held >= MAX_WEAPONS ? 0.8 : 3.2 - held * 0.5;
  };

  const chosen: UpgradeCard[] = [];
  const pool = [...eligible];

  while (chosen.length < howMany && pool.length > 0) {
    let total = 0;
    for (const card of pool) total += weightOf(card);

    let roll = random() * total;
    let index = 0;
    for (; index < pool.length; index++) {
      roll -= weightOf(pool[index]);
      if (roll <= 0) break;
    }

    chosen.push(pool[Math.min(index, pool.length - 1)]);
    pool.splice(Math.min(index, pool.length - 1), 1);
  }

  return chosen;
}

/** Experience needed to reach a given level. */
export function xpForLevel(level: number, firstLevelXp: number, growth: number): number {
  return Math.round(firstLevelXp * Math.pow(growth, level - 1));
}
