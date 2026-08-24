/**
 * TEACHING THE GAME.
 * ==================
 * Two halves, because they answer two different questions.
 *
 * FOUR CARDS AT THE START answer "what is this?". They appear once, before the
 * first run, and they exist because this game does not look like what it is: it
 * looks like a map. Somebody opening it has no reason to guess that the blue dot
 * is them, that walking is the only way to move, or that they are not supposed to
 * press anything.
 *
 * A HANDFUL OF ONE-LINE HINTS answer "what just happened?". Each fires once,
 * ever, at the moment the thing it describes first occurs -- the first kill, the
 * first coin, the first time health drops. A rule explained while you are
 * watching it happen is remembered; the same rule in a wall of text at the start
 * is not.
 *
 * WHY THE LAST CARD IS ABOUT NOT HURRYING. The brief forbids anything that makes
 * a person move fast in the real world, and that promise is worth nothing if the
 * player does not know it has been made. Somebody who suspects the game might be
 * timing them will hurry anyway, across a road, looking at a phone. So it is said
 * plainly, on its own card, before they take a single step.
 */

export interface TutorialWorld {
  monstersAlive: number;
  monstersKilled: number;
  coinsCollected: number;
  healthFraction: number;
  /** Metres to the closest nest, or null when there is none. */
  nearestNestMetres: number | null;
}

interface Hint {
  id: string;
  when: (w: TutorialWorld) => boolean;
  text: string;
}

const HINTS: Hint[] = [
  {
    id: 'incoming',
    when: (w) => w.monstersAlive >= 3,
    text: 'They are walking to you. Your weapons fire on their own — you do not have to do anything.',
  },
  {
    id: 'loot',
    when: (w) => w.monstersKilled >= 1,
    text: 'Loot stays where it fell. <b>Walk over it</b> to pick it up.',
  },
  {
    id: 'coins',
    when: (w) => w.coinsCollected >= 1,
    text: 'Coins are for keeps. Tap the bar at the top to spend them on equipment.',
  },
  {
    /*
     * Fires early and from far away on purpose. At 70 m it only appeared once a
     * player had ALREADY walked most of the way to a nest -- which means it never
     * fired at all for the player who most needed it, the one standing still
     * wondering what the game wants. Measured: standing on a Da Nang street for a
     * hundred seconds, this hint never showed once, because nests are placed
     * 70-420 m out. It now fires while the nest is still just a marker on the
     * edge of the screen, which is exactly when "what is that?" is being asked.
     */
    id: 'nest',
    when: (w) => w.nearestNestMetres !== null && w.nearestNestMetres < 200,
    text: 'Those dark holes are <b>nests</b> — where the coins come from. Walk to one and stand near it. Take a <b style="color:#4ade80">NEW</b> one first: they fall quickly. <b style="color:#f87171">OLD</b> ones pay far more and fight back hard.',
  },
  {
    id: 'hurt',
    when: (w) => w.healthFraction < 0.6,
    text: 'Being crowded is what hurts. <b>Walk away</b> — it always works, and you heal once they are off you.',
  },
];

const CARDS: Array<{ title: string; body: string; glyph: string }> = [
  {
    glyph: '🔵',
    title: 'This is your street',
    body:
      'The map is the real one around you, and the blue dot is where you really are. ' +
      'There is no joystick: <b>you move by walking</b>. Buildings are solid — the fight ' +
      'happens along the roads you actually use.',
  },
  {
    glyph: '✦',
    title: 'Everything fires by itself',
    body:
      'There is nothing to aim and nothing to press. Your only decision is <b>which card ' +
      'you take</b> when you gain a level, and those decisions are what make one run ' +
      'different from another.',
  },
  {
    glyph: '💠',
    title: 'Walk over what drops',
    body:
      'Diamonds are experience and give you levels. Coins are kept forever and buy ' +
      'characters and equipment. Neither comes to you — <b>go and get them</b>.',
  },
  {
    glyph: '🚶',
    title: 'Nothing here is in a hurry',
    body:
      '<b>Nothing in this game is ever timed, and hurrying is never rewarded.</b> ' +
      'Monsters are slower than you are, so you can always walk away from a crowd. ' +
      'Take the long way. Look at the road, not at the phone.',
  },
];

export class Tutorial {
  private root: HTMLDivElement;
  private hintBox: HTMLDivElement;
  private seen: Set<string>;
  private onFinished: (hintsSeen: string[], tutorialComplete: boolean) => void;
  private hintTimer = 0;
  /** Seconds before another hint may appear, so two never stack. */
  private cooldown = 0;

  constructor(
    container: HTMLElement,
    hintsSeen: string[],
    onFinished: (hintsSeen: string[], tutorialComplete: boolean) => void
  ) {
    this.seen = new Set(hintsSeen);
    this.onFinished = onFinished;

    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '18px',
      padding: '28px',
      background: 'rgba(6,9,13,0.94)',
      backdropFilter: 'blur(3px)',
      zIndex: '60',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(this.root);

    this.hintBox = document.createElement('div');
    Object.assign(this.hintBox.style, {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      top: 'calc(76px + env(safe-area-inset-top))',
      width: 'min(340px, 88vw)',
      padding: '11px 15px',
      borderRadius: '11px',
      border: '1px solid rgba(125,180,255,0.28)',
      background: 'rgba(13,20,32,0.94)',
      color: '#e6edf3',
      font: '400 13px/1.5 system-ui, sans-serif',
      textAlign: 'center',
      opacity: '0',
      display: 'none',
      transition: 'opacity 320ms ease',
      zIndex: '35',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(this.hintBox);
  }

  /** Show the four opening cards. Returns once the player has finished them. */
  showIntro(): void {
    let index = 0;
    this.root.style.display = 'flex';

    const draw = () => {
      const card = CARDS[index];
      this.root.innerHTML = '';

      const glyph = document.createElement('div');
      glyph.textContent = card.glyph;
      glyph.style.cssText = 'font-size:42px;line-height:1';
      this.root.appendChild(glyph);

      const title = document.createElement('div');
      title.textContent = card.title;
      title.style.cssText = 'font:700 21px/1.3 system-ui,sans-serif;color:#e6edf3';
      this.root.appendChild(title);

      const body = document.createElement('div');
      body.innerHTML = card.body;
      body.style.cssText =
        'font:400 14.5px/1.65 system-ui,sans-serif;color:#9fb3c8;max-width:330px';
      this.root.appendChild(body);

      const dots = document.createElement('div');
      dots.style.cssText = 'display:flex;gap:7px;margin-top:4px';
      for (let i = 0; i < CARDS.length; i++) {
        const dot = document.createElement('span');
        dot.style.cssText =
          'width:7px;height:7px;border-radius:99px;background:' +
          (i === index ? '#4da3ff' : 'rgba(255,255,255,0.2)');
        dots.appendChild(dot);
      }
      this.root.appendChild(dots);

      const next = document.createElement('button');
      next.textContent = index === CARDS.length - 1 ? 'Start' : 'Next';
      next.style.cssText =
        'margin-top:10px;padding:13px 34px;border-radius:999px;border:1px solid ' +
        'rgba(125,180,255,0.4);background:rgba(77,163,255,0.16);color:#e6edf3;' +
        'font:600 14px system-ui,sans-serif;cursor:pointer';
      next.addEventListener('click', () => {
        index++;
        if (index >= CARDS.length) this.finishIntro();
        else draw();
      });
      this.root.appendChild(next);

      // Always leave a way out. Somebody re-reading this on their fourth run
      // wants to get back to the game, not to be lectured.
      const skip = document.createElement('button');
      skip.textContent = 'Skip';
      skip.style.cssText =
        'margin-top:2px;padding:8px 16px;border:0;background:none;color:#5b6b7d;' +
        'font:400 12.5px system-ui,sans-serif;cursor:pointer';
      skip.addEventListener('click', () => this.finishIntro());
      this.root.appendChild(skip);
    };

    draw();
  }

  private finishIntro(): void {
    this.root.style.display = 'none';
    this.root.innerHTML = '';
    this.onFinished([...this.seen], true);
  }

  /** True while the opening cards are on screen, so the game can hold still. */
  isBlocking(): boolean {
    return this.root.style.display !== 'none';
  }

  /**
   * Called every frame. Fires at most one hint, and never two close together.
   */
  update(deltaSeconds: number, world: TutorialWorld): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= deltaSeconds;
      if (this.hintTimer <= 0) {
        this.hintBox.style.opacity = '0';
        window.setTimeout(() => (this.hintBox.style.display = 'none'), 340);
      }
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown -= deltaSeconds;
      return;
    }

    for (const hint of HINTS) {
      if (this.seen.has(hint.id)) continue;
      if (!hint.when(world)) continue;

      this.seen.add(hint.id);
      this.onFinished([...this.seen], true);
      this.hintBox.innerHTML = hint.text;
      this.hintBox.style.display = 'block';
      // Two frames' grace so the browser animates the fade instead of jumping.
      window.setTimeout(() => (this.hintBox.style.opacity = '1'), 20);
      this.hintTimer = 6.5;
      this.cooldown = 4;
      return;
    }
  }
}
