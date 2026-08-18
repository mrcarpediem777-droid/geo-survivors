/**
 * THE VIRTUAL JOYSTICK.
 * =====================
 * Per the brief, this is the ONLY input during combat. No aiming, no dodge
 * button, no tapping enemies. Weapons fire themselves; all your decisions happen
 * at level-up. So this one control has to feel good, because it is the whole
 * physical interface to the game.
 *
 * DESIGN CHOICE: THE STICK COMES TO YOUR THUMB.
 * A joystick painted in a fixed corner forces you to look down to find it, and
 * on a big phone it may not even be reachable one-handed. Instead, wherever you
 * first touch in the lower part of the screen becomes the centre, and dragging
 * from there steers. You never have to look at it, and it works equally well
 * with either hand.
 *
 * The lower 55% of the screen belongs to the joystick; the top stays free for
 * dragging the map around while navigating.
 *
 * ON A COMPUTER: WASD acts as the joystick, so the whole game can be tested at a
 * desk. Note that the ARROW keys do something different -- in dev mode they move
 * your pretend GPS position, i.e. they are you physically walking. Two separate
 * things, two separate sets of keys, which is exactly the distinction the game
 * is built around.
 */

import type { JoystickInput } from '../game/playerCharacter';

/** How far from the centre, in pixels, counts as pushing all the way. */
const MAX_PUSH_PIXELS = 62;

/** Ignore the first few pixels so a tap does not twitch the character. */
const DEAD_ZONE_PIXELS = 6;

/** The joystick owns the bottom this-much of the screen. */
const ZONE_HEIGHT_FRACTION = 0.55;

export class Joystick {
  /** Current push direction, read by the game every frame. */
  private input: JoystickInput = { east: 0, north: 0 };

  private active = false;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;

  private zone: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;

  /** Which movement keys are held, for desk testing. */
  private keysHeld = new Set<string>();

  constructor(container: HTMLElement) {
    // The invisible area that listens for a thumb.
    this.zone = document.createElement('div');
    Object.assign(this.zone.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      height: `${ZONE_HEIGHT_FRACTION * 100}%`,
      touchAction: 'none', // stop the browser treating drags as page scrolling
      zIndex: '3',
    } satisfies Partial<CSSStyleDeclaration>);

    // The ring that appears where you put your thumb.
    this.base = document.createElement('div');
    Object.assign(this.base.style, {
      position: 'absolute',
      width: `${MAX_PUSH_PIXELS * 2}px`,
      height: `${MAX_PUSH_PIXELS * 2}px`,
      marginLeft: `${-MAX_PUSH_PIXELS}px`,
      marginTop: `${-MAX_PUSH_PIXELS}px`,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.35)',
      background: 'rgba(13,17,23,0.22)',
      display: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    // The smaller dot that follows your thumb inside the ring.
    this.knob = document.createElement('div');
    Object.assign(this.knob.style, {
      position: 'absolute',
      width: '52px',
      height: '52px',
      marginLeft: '-26px',
      marginTop: '-26px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.62)',
      boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
      display: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    this.zone.appendChild(this.base);
    container.appendChild(this.zone);
    container.appendChild(this.knob);

    this.wireUpTouch();
    this.wireUpKeyboard();
  }

  /* ------------------------------------------------------------------ */
  /* Reading it                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * The current push. Keyboard and thumb are combined, so either works and
   * neither has to know about the other.
   */
  read(): JoystickInput {
    if (this.active) return this.input;

    let east = 0;
    let north = 0;
    if (this.keysHeld.has('w')) north += 1;
    if (this.keysHeld.has('s')) north -= 1;
    if (this.keysHeld.has('a')) east -= 1;
    if (this.keysHeld.has('d')) east += 1;
    return { east, north };
  }

  /** Is the player actively steering right now? Used to decide combat zoom. */
  isEngaged(): boolean {
    const { east, north } = this.read();
    return this.active || east !== 0 || north !== 0;
  }

  /* ------------------------------------------------------------------ */
  /* Thumb                                                               */
  /* ------------------------------------------------------------------ */

  private wireUpTouch(): void {
    this.zone.addEventListener('pointerdown', (event) => {
      if (this.active) return; // one thumb at a time
      this.active = true;
      this.pointerId = event.pointerId;
      this.originX = event.clientX;
      this.originY = event.clientY;

      this.base.style.left = `${event.clientX}px`;
      this.base.style.top = `${event.clientY - this.zone.getBoundingClientRect().top}px`;
      this.base.style.display = 'block';
      this.knob.style.display = 'block';
      this.moveKnob(event.clientX, event.clientY);

      // Keep receiving moves even if the thumb slides outside the zone.
      this.zone.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    this.zone.addEventListener('pointermove', (event) => {
      if (!this.active || event.pointerId !== this.pointerId) return;

      const dx = event.clientX - this.originX;
      // Screen Y grows downward, but north is up, so flip it.
      const dy = -(event.clientY - this.originY);

      const distance = Math.hypot(dx, dy);
      if (distance < DEAD_ZONE_PIXELS) {
        this.input.east = 0;
        this.input.north = 0;
      } else {
        const usable = Math.min(distance, MAX_PUSH_PIXELS);
        const strength = usable / MAX_PUSH_PIXELS;
        this.input.east = (dx / distance) * strength;
        this.input.north = (dy / distance) * strength;
      }

      this.moveKnob(event.clientX, event.clientY);
      event.preventDefault();
    });

    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.pointerId) return;
      this.active = false;
      this.pointerId = null;
      this.input.east = 0;
      this.input.north = 0;
      this.base.style.display = 'none';
      this.knob.style.display = 'none';
    };

    this.zone.addEventListener('pointerup', release);
    this.zone.addEventListener('pointercancel', release);
  }

  /** Draw the knob, clamped inside the ring so it cannot be flung off. */
  private moveKnob(clientX: number, clientY: number): void {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    const distance = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(distance, MAX_PUSH_PIXELS);

    this.knob.style.left = `${this.originX + (dx / distance) * clamped}px`;
    this.knob.style.top = `${this.originY + (dy / distance) * clamped}px`;
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard, for testing at a desk                                     */
  /* ------------------------------------------------------------------ */

  private wireUpKeyboard(): void {
    const WASD = new Set(['w', 'a', 's', 'd']);

    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (WASD.has(key)) {
        this.keysHeld.add(key);
        event.preventDefault();
      }
    });

    window.addEventListener('keyup', (event) => {
      this.keysHeld.delete(event.key.toLowerCase());
    });

    // If the window loses focus mid-press we would otherwise walk forever.
    window.addEventListener('blur', () => this.keysHeld.clear());
  }
}
