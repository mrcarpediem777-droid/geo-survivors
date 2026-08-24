/**
 * SOUND — and why it is a safety feature here, not decoration.
 * ============================================================
 * This game is played WHILE WALKING DOWN A REAL STREET. Until now the only way
 * to know anything at all was to look at the screen: the health bar, the
 * markers, the numbers. That quietly turns a game about going for a walk into a
 * game about staring at a phone while crossing roads, which is the exact
 * behaviour the brief spends a whole rule trying to prevent.
 *
 * So the point of all this is to let somebody hold the phone at their side and
 * still know what is happening. Being hurt sounds like being hurt. A nest
 * finishing sounds like a nest finishing. Levelling up is unmistakable. The
 * screen becomes something you glance at, not something you watch.
 *
 * NO SOUND FILES. Every sound here is made from scratch by the browser out of
 * arithmetic. Nothing to download, nothing to wait for on bad signal, nothing
 * added to the size of the game, and the pitch and length of each one is a
 * number that can be changed rather than an audio file somebody has to own a
 * program to edit.
 *
 * BROWSERS WILL NOT MAKE A NOISE until the player has touched the screen at
 * least once -- a rule that exists because of autoplaying video adverts, and a
 * good one. So the sound engine stays asleep until the first tap and starts
 * itself then.
 */

/** Everything the game can say out loud. */
export type SoundName =
  | 'shot'
  | 'hit'
  | 'kill'
  | 'xp'
  | 'coin'
  | 'levelUp'
  | 'hurt'
  | 'danger'
  | 'nestProgress'
  | 'nestCleared'
  | 'death';

interface Recipe {
  /** Starting pitch in hertz. 220 is roughly the A below middle C. */
  from: number;
  /** Pitch it slides to. Same as `from` means a flat tone. */
  to: number;
  /** How long it lasts, in seconds. Everything here is very short. */
  seconds: number;
  /** How loud, 0 to 1, before the master volume. */
  gain: number;
  type: OscillatorType;
  /** A second voice a fixed interval above, for the important ones. */
  harmony?: number;
}

/*
 * The whole soundtrack, as numbers.
 *
 * Two rules govern these. Firstly, anything that happens many times a second --
 * shots, hits -- must be quiet and short, or a swarm turns the game into a
 * machine gun in somebody's pocket. Secondly, the things you must not miss --
 * being hurt, a nest finishing, a level -- get a shape nothing else has, so they
 * can be told apart without looking.
 */
const RECIPES: Record<SoundName, Recipe> = {
  shot: { from: 880, to: 620, seconds: 0.05, gain: 0.055, type: 'square' },
  hit: { from: 320, to: 240, seconds: 0.035, gain: 0.05, type: 'triangle' },
  kill: { from: 180, to: 90, seconds: 0.11, gain: 0.1, type: 'triangle' },
  xp: { from: 660, to: 990, seconds: 0.07, gain: 0.075, type: 'sine' },
  coin: { from: 990, to: 1480, seconds: 0.11, gain: 0.11, type: 'sine', harmony: 1.5 },
  levelUp: { from: 520, to: 1050, seconds: 0.34, gain: 0.14, type: 'sine', harmony: 1.5 },
  // Deliberately the ugliest thing in the game. You should not have to wonder.
  hurt: { from: 190, to: 70, seconds: 0.17, gain: 0.17, type: 'sawtooth' },
  danger: { from: 130, to: 110, seconds: 0.5, gain: 0.13, type: 'sawtooth' },
  nestProgress: { from: 300, to: 340, seconds: 0.13, gain: 0.06, type: 'sine' },
  nestCleared: { from: 400, to: 800, seconds: 0.6, gain: 0.16, type: 'sine', harmony: 1.25 },
  death: { from: 300, to: 60, seconds: 0.9, gain: 0.18, type: 'sawtooth' },
};

/**
 * How many of the same sound may start in one tenth of a second.
 *
 * Forty monsters dying at once is forty kill sounds landing on the same
 * millisecond, which is not forty times as loud -- it is a bang, and on some
 * phones it is a distorted bang. Past a handful, more of the same sound adds
 * nothing a listener can hear anyway.
 */
const MAX_PER_SOUND_PER_TENTH = 3;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled: boolean;
  private recent = new Map<SoundName, { tenth: number; count: number }>();

  constructor(enabled: boolean) {
    this.enabled = enabled;
    this.wakeOnFirstTouch();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.wake();
    if (this.master) this.master.gain.value = on ? 1 : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Browsers refuse to make a noise until the player has interacted with the
   * page. Rather than fighting that, wait for the first touch anywhere.
   */
  private wakeOnFirstTouch(): void {
    const start = () => {
      this.wake();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('touchstart', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start, { once: false });
    window.addEventListener('touchstart', start, { once: false });
    window.addEventListener('keydown', start, { once: false });
  }

  private wake(): void {
    if (this.ctx) {
      // A phone that has been in a pocket suspends the audio engine.
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.ctx.destination);
    } catch {
      // No audio on this device or it is blocked. The game is unaffected.
      this.ctx = null;
    }
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.tooManyOf(name)) return;

    const recipe = RECIPES[name];
    const now = this.ctx.currentTime;

    this.voice(recipe, now, 1);
    if (recipe.harmony) this.voice(recipe, now + 0.05, recipe.harmony);
  }

  private voice(recipe: Recipe, at: number, pitchMultiplier: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = recipe.type;
    osc.frequency.setValueAtTime(recipe.from * pitchMultiplier, at);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, recipe.to * pitchMultiplier),
      at + recipe.seconds
    );

    // A quick fade in and a smooth fade out. Without the fades every sound
    // begins and ends with a click, which is the difference between a game that
    // sounds made and one that sounds broken.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(recipe.gain, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + recipe.seconds);

    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(at);
    osc.stop(at + recipe.seconds + 0.02);
  }

  private tooManyOf(name: SoundName): boolean {
    const tenth = Math.floor((this.ctx?.currentTime ?? 0) * 10);
    const seen = this.recent.get(name);
    if (!seen || seen.tenth !== tenth) {
      this.recent.set(name, { tenth, count: 1 });
      return false;
    }
    seen.count++;
    return seen.count > MAX_PER_SOUND_PER_TENTH;
  }
}

/**
 * VIBRATION.
 * ==========
 * The other half of not having to look. A phone in a hand at your side can
 * still tell you that you are being hurt.
 *
 * Kept to a very short list on purpose. Vibration is expensive in battery and
 * genuinely irritating when overused, so it is reserved for the three things a
 * player must not miss, and it is off unless they turn it on.
 *
 * iOS Safari does not support this at all and never has. It simply does nothing
 * there, which is the correct outcome -- no error, no message, no promise made.
 */
export class Haptics {
  private enabled: boolean;
  private lastAtMs = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isSupported(): boolean {
    return typeof navigator.vibrate === 'function';
  }

  /** @param pattern milliseconds on, off, on... exactly as the browser wants. */
  buzz(pattern: number | number[], minimumGapMs = 400): void {
    if (!this.enabled || !this.isSupported()) return;
    const now = Date.now();
    // A swarm would otherwise buzz continuously, which drains the battery and
    // stops meaning anything.
    if (now - this.lastAtMs < minimumGapMs) return;
    this.lastAtMs = now;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw if the page is not visible. Nothing to do.
    }
  }
}
