/**
 * DRAWING EMOJI ON THE GRAPHICS CARD.
 * ===================================
 * Coloured circles told you where things were but nothing about what they were.
 * Emoji do, cost nothing to make, and are placeholder art in the truest sense --
 * every phone already has them, and they can be swapped for real artwork later
 * without touching a line of the renderer.
 *
 * HOW IT WORKS, IN PLAIN LANGUAGE
 * A graphics card cannot draw text. What it can do, extremely fast, is stamp
 * pieces of one big picture onto the screen. So at startup we draw every emoji
 * we need once, into a single large image, remembering where each one landed.
 * That image goes to the card, and from then on drawing a spider is a matter of
 * saying "stamp the patch at row 0, column 3".
 *
 * This is called a texture atlas, and it is why a game can draw a thousand
 * different sprites without a thousand separate images.
 */

/** Each emoji is drawn into a square this many pixels across. */
const CELL_PIXELS = 96;

/** Cells per row in the atlas. */
const COLUMNS = 8;

/**
 * Which picture each thing uses, in the order they are packed.
 *
 * To change how a monster looks, change the emoji here. Nothing else needs to
 * know. To use real artwork later, replace this file's drawing step with an
 * image load and leave the rest of the renderer alone.
 */
/*
 * THE PICTURES, and how a monster finds the right one.
 *
 * This list used to be joined to the monster list BY POSITION -- a monster's
 * slot in the tuning file was its picture number -- with a warning here saying
 * that getting it wrong is silent, because the disabled spitter still holds a
 * slot and the stalker once wore the spider's face.
 *
 * That was a trap waiting for the next person to add a monster: a fifth type
 * would have been drawn as the experience crystal, and nothing would have said
 * so. The two lists are joined by NAME now, so they cannot drift apart.
 */
export const SPRITE_NAMES = [
  'swarmer',
  'brute',
  'spitter',
  'stalker',
  'shell',
  'splitter',
  'skitterer',
  'xp',
  'coin',
  'nest',
  'you',
  'shot',
  'tower',
  'bladedancer',
  'sniper',
  'bruiser',
  'collector',
] as const;

export const SPRITES = [
  '🕷️', // swarmer   -- the common crowd
  '🐗', // brute     -- slow and heavy
  '🐍', // spitter   -- currently switched off
  '🦂', // stalker   -- quick and nasty
  '🐢', // shell     -- armoured, shrugs off small hits
  '🪱', // splitter  -- dies into two
  '🐜', // skitterer -- fast, fragile, arrives first
  '💠', // xp
  '🪙', // coin
  '🕳️', // nest
  '🔵', // you
  '✦', // shot
  '🗼', // tower -- a gun you built and left behind
  '🌀', // bladedancer
  '🎯', // sniper
  '🛡️', // bruiser
  '🧲', // collector
] as const;

/** Look a picture up by name. Returns 0 rather than throwing at draw time. */
export function spriteIndexByName(name: string): number {
  const index = SPRITE_NAMES.indexOf(name as (typeof SPRITE_NAMES)[number]);
  return index < 0 ? 0 : index;
}

/*
 * Names for the things that are not monsters, worked out from the list above so
 * that inserting a monster can never shift them by one again.
 */
export const SpriteIndex = {
  XP: spriteIndexByName('xp'),
  COIN: spriteIndexByName('coin'),
  NEST: spriteIndexByName('nest'),
  PLAYER: spriteIndexByName('you'),
  PROJECTILE: spriteIndexByName('shot'),
  TOWER: spriteIndexByName('tower'),
} as const;

export interface AtlasInfo {
  canvas: HTMLCanvasElement;
  columns: number;
  rows: number;
  /** Width and height of one cell as a fraction of the whole image. */
  cellU: number;
  cellV: number;
}

/**
 * Draw every emoji into one image.
 *
 * Done once, at startup, on an ordinary 2D canvas -- the same machinery a
 * browser uses to draw text anywhere else.
 */
export function buildEmojiAtlas(): AtlasInfo {
  const rows = Math.ceil(SPRITES.length / COLUMNS);
  const canvas = document.createElement('canvas');
  canvas.width = COLUMNS * CELL_PIXELS;
  canvas.height = rows * CELL_PIXELS;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the sprite sheet');

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // Slightly smaller than the cell so nothing is clipped at the edges.
  context.font = `${Math.round(CELL_PIXELS * 0.78)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

  for (let i = 0; i < SPRITES.length; i++) {
    const column = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x = column * CELL_PIXELS + CELL_PIXELS / 2;
    const y = row * CELL_PIXELS + CELL_PIXELS / 2;

    // A dark outline behind each one, so a monster stays readable against a
    // pale road or a dark park alike. The map underneath is not ours to choose.
    context.save();
    context.shadowColor = 'rgba(0,0,0,0.85)';
    context.shadowBlur = CELL_PIXELS * 0.09;
    context.fillText(SPRITES[i], x, y);
    context.shadowBlur = CELL_PIXELS * 0.05;
    context.fillText(SPRITES[i], x, y);
    context.restore();
  }

  return {
    canvas,
    columns: COLUMNS,
    rows,
    cellU: 1 / COLUMNS,
    cellV: 1 / rows,
  };
}
