/**
 * THE COMBAT INTERFACE.
 * =====================
 * Health, experience, level, and the card choice at level-up.
 *
 * Kept deliberately spare. The whole point of the game is that you are looking
 * at your own street with monsters on it -- every pixel of interface is a pixel
 * of street covered up. So: a thin bar for experience, a thin bar for health, a
 * small line of numbers, and nothing else until you level up.
 */

import type { UpgradeCard } from '../game/upgrades';
import { META_UPGRADES, costToBuy, metaLevel, type MetaLevels } from '../game/metaProgress';
import { CHARACTERS } from '../game/characters';
import { EQUIPMENT, SLOT_NAMES, itemById, type EquipmentSlot } from '../game/equipment';
import { SPRITES } from '../render/emojiAtlas';

export class CombatHud {
  private root: HTMLDivElement;
  private xpFill: HTMLDivElement;
  private healthFill: HTMLDivElement;
  private readout: HTMLDivElement;
  private cardScreen: HTMLDivElement;
  private deathScreen: HTMLDivElement;

  /** Little arrows at the screen edge pointing at off-screen nests. */
  private nestMarkers: HTMLDivElement[] = [];
  private markerLayer: HTMLDivElement;

  /** The bar that fills while you stand on a nest. */
  private captureBox: HTMLDivElement;
  private captureFill: HTMLDivElement;
  private captureLabel: HTMLDivElement;
  private toast: HTMLDivElement;
  private shopScreen: HTMLDivElement;

  /** Called when the player taps the status line, to open the shop. */
  onStatusTapped: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(this.root);

    /* --- experience: a hairline across the very top --- */
    const xpTrack = document.createElement('div');
    Object.assign(xpTrack.style, {
      position: 'absolute',
      top: 'env(safe-area-inset-top)',
      left: '0',
      right: '0',
      height: '4px',
      background: 'rgba(255,255,255,0.13)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.xpFill = document.createElement('div');
    Object.assign(this.xpFill.style, {
      height: '100%',
      width: '0%',
      background: '#5ac8ff',
      transition: 'width 120ms linear',
    } satisfies Partial<CSSStyleDeclaration>);
    xpTrack.appendChild(this.xpFill);
    this.root.appendChild(xpTrack);

    /* --- health: above the joystick area, where the thumb is not --- */
    const healthTrack = document.createElement('div');
    Object.assign(healthTrack.style, {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: 'calc(env(safe-area-inset-bottom) + 78px)',
      width: 'min(240px, 62vw)',
      height: '7px',
      borderRadius: '4px',
      background: 'rgba(0,0,0,0.45)',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    this.healthFill = document.createElement('div');
    Object.assign(this.healthFill.style, {
      height: '100%',
      width: '100%',
      background: '#4ade80',
      transition: 'width 90ms linear, background 200ms linear',
    } satisfies Partial<CSSStyleDeclaration>);
    healthTrack.appendChild(this.healthFill);
    this.root.appendChild(healthTrack);

    /* --- the small line of numbers --- */
    this.readout = document.createElement('div');
    Object.assign(this.readout.style, {
      position: 'absolute',
      top: 'calc(env(safe-area-inset-top) + 12px)',
      left: '50%',
      transform: 'translateX(-50%)',
      font: '600 12px/1 ui-monospace, monospace',
      color: 'rgba(255,255,255,0.82)',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      letterSpacing: '0.06em',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    // The status line is also the way into the shop. A separate button would be
    // another thing covering the street, and the street is the game.
    this.readout.style.pointerEvents = 'auto';
    this.readout.style.cursor = 'pointer';
    this.readout.title = 'Spend essence';
    this.root.appendChild(this.readout);

    /* --- edge arrows pointing at nests --- */
    this.markerLayer = document.createElement('div');
    Object.assign(this.markerLayer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.markerLayer);

    this.readout.addEventListener('click', () => this.onStatusTapped?.());

    /* --- clearing a nest --- */
    this.captureBox = document.createElement('div');
    Object.assign(this.captureBox.style, {
      position: 'absolute',
      top: 'calc(env(safe-area-inset-top) + 44px)',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(300px, 76vw)',
      padding: '9px 12px',
      borderRadius: '10px',
      background: 'rgba(13,17,23,0.86)',
      border: '1px solid rgba(192,132,252,0.5)',
      display: 'none',
      backdropFilter: 'blur(6px)',
    } satisfies Partial<CSSStyleDeclaration>);

    this.captureLabel = document.createElement('div');
    Object.assign(this.captureLabel.style, {
      font: '600 11px/1.3 system-ui, sans-serif',
      color: '#e6edf3',
      marginBottom: '6px',
      textAlign: 'center',
      letterSpacing: '0.04em',
    } satisfies Partial<CSSStyleDeclaration>);

    const captureTrack = document.createElement('div');
    Object.assign(captureTrack.style, {
      height: '6px',
      borderRadius: '3px',
      background: 'rgba(255,255,255,0.14)',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    this.captureFill = document.createElement('div');
    Object.assign(this.captureFill.style, {
      height: '100%',
      width: '0%',
      background: '#c084fc',
      transition: 'width 100ms linear',
    } satisfies Partial<CSSStyleDeclaration>);
    captureTrack.appendChild(this.captureFill);
    this.captureBox.append(this.captureLabel, captureTrack);
    this.root.appendChild(this.captureBox);

    /* --- a short-lived message for good news --- */
    this.toast = document.createElement('div');
    Object.assign(this.toast.style, {
      position: 'absolute',
      top: '38%',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '12px 20px',
      borderRadius: '12px',
      background: 'rgba(13,17,23,0.92)',
      border: '1px solid rgba(192,132,252,0.55)',
      color: '#e6edf3',
      font: '600 14px/1.5 system-ui, sans-serif',
      textAlign: 'center',
      display: 'none',
      transition: 'opacity 400ms ease',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.toast);

    /* --- the shop for permanent upgrades --- */
    this.shopScreen = document.createElement('div');
    this.styleOverlay(this.shopScreen);
    this.shopScreen.style.overflowY = 'auto';
    this.shopScreen.style.justifyContent = 'flex-start';
    this.shopScreen.style.paddingTop = 'calc(env(safe-area-inset-top) + 24px)';
    this.root.appendChild(this.shopScreen);

    /* --- level-up and death screens, hidden until needed --- */
    this.cardScreen = document.createElement('div');
    this.styleOverlay(this.cardScreen);
    this.root.appendChild(this.cardScreen);

    this.deathScreen = document.createElement('div');
    this.styleOverlay(this.deathScreen);
    this.root.appendChild(this.deathScreen);
  }

  private styleOverlay(element: HTMLDivElement): void {
    Object.assign(element.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '10px',
      padding: '18px',
      background: 'rgba(6,9,13,0.82)',
      backdropFilter: 'blur(3px)',
      pointerEvents: 'auto',
      zIndex: '20',
    } satisfies Partial<CSSStyleDeclaration>);
  }

  /* ------------------------------------------------------------------ */

  update(health: number, maxHealth: number, xp: number, xpNeeded: number, line: string): void {
    const healthFraction = Math.max(0, Math.min(1, health / maxHealth));
    this.healthFill.style.width = `${healthFraction * 100}%`;
    this.healthFill.style.background =
      healthFraction > 0.5 ? '#4ade80' : healthFraction > 0.22 ? '#fbbf24' : '#f87171';

    this.xpFill.style.width = `${Math.max(0, Math.min(1, xp / xpNeeded)) * 100}%`;
    this.readout.textContent = line;
  }

  /**
   * Offer the level-up choice. The game is paused while this is up, so the
   * decision is a decision rather than something done under fire.
   */
  showCards(level: number, cards: UpgradeCard[], onPick: (card: UpgradeCard) => void): void {
    this.cardScreen.innerHTML = '';

    const heading = document.createElement('div');
    heading.textContent = `LEVEL ${level}`;
    Object.assign(heading.style, {
      font: '700 15px/1 ui-monospace, monospace',
      color: '#5ac8ff',
      letterSpacing: '0.16em',
      marginBottom: '4px',
    } satisfies Partial<CSSStyleDeclaration>);
    this.cardScreen.appendChild(heading);

    for (const card of cards) {
      const button = document.createElement('button');
      Object.assign(button.style, {
        width: 'min(340px, 88vw)',
        padding: '13px 15px',
        borderRadius: '12px',
        // An evolution is the pay-off for a whole run of decisions, so it must
        // not look like the fifth "+22% damage" card of the session.
        border: card.isEvolution
          ? '1px solid rgba(250,204,21,0.75)'
          : card.isWeapon
            ? '1px solid rgba(90,200,255,0.55)'
            : '1px solid rgba(255,255,255,0.16)',
        background: card.isEvolution
          ? 'rgba(250,204,21,0.13)'
          : card.isWeapon
            ? 'rgba(90,200,255,0.10)'
            : 'rgba(255,255,255,0.06)',
        color: '#e6edf3',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        gap: '13px',
        alignItems: 'center',
      } satisfies Partial<CSSStyleDeclaration>);

      button.innerHTML = `
        <span style="font-size:24px;line-height:1;width:28px;text-align:center;opacity:0.9">${card.glyph}</span>
        <span style="flex:1">
          ${card.isEvolution ? '<span style="display:block;font:700 10px ui-monospace,monospace;color:#facc15;letter-spacing:0.16em;margin-bottom:3px">EVOLUTION</span>' : ''}
          <span style="display:block;font:700 14px system-ui,sans-serif;margin-bottom:3px">${card.title}</span>
          <span style="display:block;font:400 12px/1.35 system-ui,sans-serif;color:#9fb3c8">${card.description}</span>
        </span>`;

      button.addEventListener('click', () => {
        this.cardScreen.style.display = 'none';
        onPick(card);
      });
      this.cardScreen.appendChild(button);
    }

    this.cardScreen.style.display = 'flex';
  }

  /**
   * The death screen, and the only two places an ad is ever offered.
   *
   * Both sit HERE, on a screen the player has already stopped playing on, behind
   * buttons they choose to press. Nothing interrupts a run; the brief forbids
   * interstitials outright, and quite apart from that, interrupting somebody who
   * is walking down a real street is a genuinely bad thing to do.
   *
   * @param offers null when there is nothing to offer -- ads unavailable, or a
   *               Premium player who is simply given these things.
   */
  showDeath(
    summary: string,
    onRestart: () => void,
    offers: {
      canRevive: boolean;
      coinsThisRun: number;
      onRevive: () => void;
      onDoubleCoins: () => void;
    } | null = null
  ): void {
    this.deathScreen.innerHTML = '';

    const heading = document.createElement('div');
    heading.textContent = 'YOU DIED';
    Object.assign(heading.style, {
      font: '700 20px/1 ui-monospace, monospace',
      color: '#f87171',
      letterSpacing: '0.18em',
    } satisfies Partial<CSSStyleDeclaration>);

    const detail = document.createElement('div');
    detail.textContent = summary;
    Object.assign(detail.style, {
      font: '400 13px/1.6 system-ui, sans-serif',
      color: '#9fb3c8',
      textAlign: 'center',
      marginBottom: '8px',
    } satisfies Partial<CSSStyleDeclaration>);

    const button = document.createElement('button');
    button.textContent = 'Try again';
    Object.assign(button.style, {
      padding: '13px 26px',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(255,255,255,0.09)',
      color: '#e6edf3',
      font: '600 14px system-ui, sans-serif',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    button.addEventListener('click', () => {
      this.deathScreen.style.display = 'none';
      onRestart();
    });

    this.deathScreen.append(heading, detail);

    if (offers) {
      const offerStyle =
        'width:min(320px,86vw);margin-bottom:9px;padding:12px 15px;border-radius:11px;' +
        'border:1px solid rgba(250,204,21,0.32);background:rgba(250,204,21,0.09);' +
        'color:#e6edf3;text-align:left;cursor:pointer;display:flex;gap:11px;align-items:center';

      if (offers.canRevive) {
        const revive = document.createElement('button');
        revive.style.cssText = offerStyle;
        revive.innerHTML =
          '<span style="font-size:19px;width:24px;text-align:center">▶</span>' +
          '<span style="flex:1">' +
          '<span style="display:block;font:700 13px system-ui,sans-serif">Carry on this run</span>' +
          '<span style="display:block;font:400 11.5px/1.35 system-ui,sans-serif;color:#9fb3c8">' +
          'Watch a short ad. Saves walking all the way back out here.</span>' +
          '</span>' +
          '<span style="font:700 11px ui-monospace,monospace;color:#facc15">AD</span>';
        revive.addEventListener('click', () => {
          this.deathScreen.style.display = 'none';
          offers.onRevive();
        });
        this.deathScreen.appendChild(revive);
      }

      if (offers.coinsThisRun > 0) {
        const double = document.createElement('button');
        double.style.cssText = offerStyle;
        double.innerHTML =
          '<span style="font-size:19px;width:24px;text-align:center">🪙</span>' +
          '<span style="flex:1">' +
          '<span style="display:block;font:700 13px system-ui,sans-serif">Double this run’s coins</span>' +
          '<span style="display:block;font:400 11.5px/1.35 system-ui,sans-serif;color:#9fb3c8">' +
          offers.coinsThisRun + ' → ' + offers.coinsThisRun * 2 + '. Reaches the same things sooner, never anything more.</span>' +
          '</span>' +
          '<span style="font:700 11px ui-monospace,monospace;color:#facc15">AD</span>';
        double.addEventListener('click', () => {
          this.deathScreen.style.display = 'none';
          offers.onDoubleCoins();
        });
        this.deathScreen.appendChild(double);
      }
    }

    this.deathScreen.appendChild(button);
    this.deathScreen.style.display = 'flex';
  }

  /**
   * Point at the nests, wherever they are.
   *
   * Without this the game genuinely looks broken for the first minute: nests sit
   * 70-170 m away, the combat view shows 76 m, and a player has no way of
   * knowing there is anything out there at all. An arrow and a distance turn an
   * empty street into a decision about which way to face.
   */
  updateNestMarkers(
    markers: {
      screenX: number;
      screenY: number;
      distanceMetres: number;
      onScreen: boolean;
      maturity: number;
    }[]
  ): void {
    // Grow the pool of arrows if a new area has more nests.
    while (this.nestMarkers.length < markers.length) {
      const marker = document.createElement('div');
      Object.assign(marker.style, {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        font: '700 10px/1 ui-monospace, monospace',
        color: '#c084fc',
        textShadow: '0 1px 4px rgba(0,0,0,0.95)',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      } satisfies Partial<CSSStyleDeclaration>);
      this.markerLayer.appendChild(marker);
      this.nestMarkers.push(marker);
    }

    for (let i = 0; i < this.nestMarkers.length; i++) {
      const marker = this.nestMarkers[i];
      const data = markers[i];
      if (!data) {
        marker.style.display = 'none';
        continue;
      }
      marker.style.display = 'block';
      marker.style.left = `${data.screenX}px`;
      marker.style.top = `${data.screenY}px`;
      marker.style.opacity = data.onScreen ? '0.75' : '1';

      // AGE IS THE CHOICE. A young nest falls in about twenty seconds and pays
      // little; an old one is a siege worth more than twice as much. Saying so
      // on the marker is what turns "which way shall I walk" into a decision
      // instead of a coin toss -- colour for a glance, a word for certainty.
      const old = data.maturity > 0.66;
      const middling = data.maturity > 0.33;
      marker.style.color = old ? '#f87171' : middling ? '#facc15' : '#4ade80';
      const age = old ? 'OLD' : middling ? 'GROWING' : 'NEW';
      marker.textContent = data.onScreen
        ? `${age}
${data.distanceMetres.toFixed(0)} m`
        : `◆ ${age}
${data.distanceMetres.toFixed(0)} m`;
      marker.style.whiteSpace = 'pre';
    }
  }

  /** Show how far through destroying a nest we are, or hide it. */
  updateCapture(progress: number, standingOnIt: boolean, distanceMetres: number): void {
    if (progress <= 0 && !standingOnIt) {
      this.captureBox.style.display = 'none';
      return;
    }
    this.captureBox.style.display = 'block';
    this.captureFill.style.width = `Math.min(1, progress) * 100` + '%';
    this.captureFill.style.background = standingOnIt ? '#c084fc' : '#7c6f8a';
    this.captureLabel.textContent = standingOnIt
      ? 'DESTROYING NEST - hold your ground'
      : 'step back within ' + distanceMetres.toFixed(0) + ' m or progress fades';
  }

  /** A plain one-line note in the same place as the nest message. */
  showNote(text: string): void {
    this.toast.innerHTML = '<div style="font:400 13px/1.5 system-ui,sans-serif">' + text + '</div>';
    this.toast.style.display = 'block';
    this.toast.style.opacity = '1';
    setTimeout(() => (this.toast.style.opacity = '0'), 2200);
    setTimeout(() => (this.toast.style.display = 'none'), 2700);
  }

  /** A nest is gone. Say so, briefly and happily. */
  showNestCleared(reward: number, total: number, leftHere: number): void {
    this.toast.innerHTML =
      '<div style="color:#c084fc;letter-spacing:0.1em;font-size:12px">NEST DESTROYED</div>' +
      '<div style="margin-top:6px">+' + reward + ' essence</div>' +
      '<div style="color:#9fb3c8;font-size:12px;margin-top:3px">' + total + ' banked</div>' +
      // Counting DOWN rather than up, so the end of a neighbourhood is visible
      // from a long way off and finishing it is something to aim at.
      '<div style="color:#7d8fa1;font-size:11.5px;margin-top:5px">' +
      leftHere + ' left around here</div>';
    this.toast.style.display = 'block';
    this.toast.style.opacity = '1';
    setTimeout(() => (this.toast.style.opacity = '0'), 2600);
    setTimeout(() => (this.toast.style.display = 'none'), 3100);
  }

  /**
   * The one moment in this game that means "done".
   *
   * Held on screen far longer than anything else, because it is the end of a
   * session's worth of walking and the game has never had an ending before.
   */
  showNeighbourhoodClear(bonus: number): void {
    this.toast.innerHTML =
      '<div style="color:#4ade80;letter-spacing:0.14em;font-size:12px">NEIGHBOURHOOD CLEAR</div>' +
      '<div style="margin-top:7px;font-weight:700">+' + bonus + ' essence</div>' +
      '<div style="color:#9fb3c8;font-size:12px;margin-top:6px;max-width:250px;line-height:1.5">' +
      'Every nest around here is gone. It will be quiet until they come back in a few hours — ' +
      'the next lot are a walk away.</div>';
    this.toast.style.display = 'block';
    this.toast.style.opacity = '1';
    setTimeout(() => (this.toast.style.opacity = '0'), 6500);
    setTimeout(() => (this.toast.style.display = 'none'), 7000);
  }

  /**
   * The shop. Deliberately reachable at any time, including mid-run: the brief
   * forbids anything that makes a person hurry outdoors, and that includes
   * hurrying back to a menu.
   */
  showShop(
    essence: number,
    levels: MetaLevels,
    unlockedCharacters: string[],
    selectedCharacter: string,
    ownedEquipment: string[],
    equippedBySlot: Record<string, string>,
    onBuy: (id: string) => void,
    onCharacter: (id: string) => void,
    onEquipment: (id: string) => void,
    lowPower: boolean,
    onLowPower: (on: boolean) => void,
    journalSummary: string,
    onExportJournal: () => void,
    audio: {
      soundOn: boolean;
      hapticsOn: boolean;
      hapticsSupported: boolean;
      onSound: (on: boolean) => void;
      onHaptics: (on: boolean) => void;
    },
    onClose: () => void
  ): void {
    this.shopScreen.innerHTML = '';

    const heading = document.createElement('div');
    heading.innerHTML =
      '<div style="font:700 13px/1 ui-monospace,monospace;color:#c084fc;letter-spacing:0.16em">PERMANENT UPGRADES</div>' +
      '<div style="font:600 20px/1.4 system-ui,sans-serif;color:#e6edf3">' + essence + ' essence</div>' +
      '<div style="font:400 12px/1.5 system-ui,sans-serif;color:#9fb3c8;max-width:300px;text-align:center">Found on dead monsters and by clearing nests. Kept forever, unlike the cards inside a run.</div>';
    heading.style.textAlign = 'center';
    heading.style.marginBottom = '14px';
    this.shopScreen.appendChild(heading);

    // ----- characters -------------------------------------------------
    const heroHeading = document.createElement('div');
    heroHeading.innerHTML =
      '<div style="font:700 12px/1 ui-monospace,monospace;color:#c084fc;letter-spacing:0.14em;margin-bottom:2px">CHARACTERS</div>' +
      '<div style="font:400 11.5px/1.45 system-ui,sans-serif;color:#9fb3c8;max-width:300px">Each starts with a different weapon and changes which cards are worth taking. Tap one to play as it.</div>';
    heroHeading.style.textAlign = 'center';
    heroHeading.style.marginBottom = '10px';
    this.shopScreen.appendChild(heroHeading);

    for (const hero of CHARACTERS) {
      const owned = unlockedCharacters.includes(hero.id);
      const chosen = hero.id === selectedCharacter;
      const affordable = owned || essence >= hero.cost;

      const button = document.createElement('button');
      Object.assign(button.style, {
        width: 'min(340px, 88vw)',
        marginBottom: '8px',
        padding: '11px 14px',
        borderRadius: '11px',
        border: chosen ? '1px solid rgba(192,132,252,0.9)' : '1px solid rgba(255,255,255,0.14)',
        background: chosen
          ? 'rgba(192,132,252,0.2)'
          : affordable
            ? 'rgba(255,255,255,0.07)'
            : 'rgba(255,255,255,0.04)',
        color: affordable ? '#e6edf3' : '#7d8fa1',
        textAlign: 'left',
        cursor: affordable ? 'pointer' : 'default',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
      } satisfies Partial<CSSStyleDeclaration>);

      const badge = owned ? (chosen ? 'PLAYING' : 'tap to use') : String(hero.cost);
      button.innerHTML =
        '<span style="font-size:22px;width:28px;text-align:center">' + SPRITES[hero.sprite] + '</span>' +
        '<span style="flex:1">' +
        '<span style="display:block;font:700 13px system-ui,sans-serif">' + hero.name + '</span>' +
        '<span style="display:block;font:400 11.5px/1.35 system-ui,sans-serif;color:#9fb3c8">' + hero.description + '</span>' +
        '</span>' +
        '<span style="font:700 12px ui-monospace,monospace;color:' +
        (chosen ? '#c084fc' : affordable ? '#e6edf3' : '#5b6b7d') + '">' + badge + '</span>';

      if (affordable && !chosen) {
        button.addEventListener('click', () => onCharacter(hero.id));
      }
      this.shopScreen.appendChild(button);
    }

    // ----- equipment ---------------------------------------------------
    //
    // Three slots, one item each. The slot limit is the whole point: without it
    // this becomes a shopping list and every player ends up with the same
    // loadout. With it, the money buys a decision rather than a number.
    const kitHeading = document.createElement('div');
    kitHeading.innerHTML =
      '<div style="font:700 12px/1 ui-monospace,monospace;color:#c084fc;letter-spacing:0.14em;margin-bottom:2px">EQUIPMENT</div>' +
      '<div style="font:400 11.5px/1.45 system-ui,sans-serif;color:#9fb3c8;max-width:300px">One item in each of the three slots. Tap to buy, tap again to take off. Yours forever.</div>';
    kitHeading.style.textAlign = 'center';
    kitHeading.style.margin = '16px 0 10px';
    this.shopScreen.appendChild(kitHeading);

    const slots: EquipmentSlot[] = ['weapon', 'armour', 'charm'];
    for (const slot of slots) {
      const wornId = equippedBySlot[slot];
      const worn = wornId ? itemById(wornId) : undefined;

      const slotLabel = document.createElement('div');
      slotLabel.style.cssText =
        'width:min(340px,88vw);margin:10px 0 5px;font:600 11px ui-monospace,monospace;' +
        'color:#7d8fa1;letter-spacing:0.1em;display:flex;justify-content:space-between';
      slotLabel.innerHTML =
        '<span>' + SLOT_NAMES[slot].toUpperCase() + '</span>' +
        '<span style="color:' + (worn ? '#4ade80' : '#5b6b7d') + '">' +
        (worn ? worn.glyph + ' ' + worn.name : 'empty') + '</span>';
      this.shopScreen.appendChild(slotLabel);

      for (const item of EQUIPMENT.filter((i) => i.slot === slot)) {
        const owned = ownedEquipment.includes(item.id);
        const equipped = wornId === item.id;
        const affordable = owned || essence >= item.cost;

        const button = document.createElement('button');
        Object.assign(button.style, {
          width: 'min(340px, 88vw)',
          marginBottom: '6px',
          padding: '9px 13px',
          borderRadius: '10px',
          border: equipped ? '1px solid rgba(74,222,128,0.85)' : '1px solid rgba(255,255,255,0.12)',
          background: equipped
            ? 'rgba(74,222,128,0.16)'
            : affordable
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.03)',
          color: affordable ? '#e6edf3' : '#7d8fa1',
          textAlign: 'left',
          cursor: affordable ? 'pointer' : 'default',
          display: 'flex',
          gap: '11px',
          alignItems: 'center',
        } satisfies Partial<CSSStyleDeclaration>);

        const badge = equipped ? 'WORN' : owned ? 'tap to wear' : String(item.cost);
        button.innerHTML =
          '<span style="font-size:19px;width:26px;text-align:center">' + item.glyph + '</span>' +
          '<span style="flex:1">' +
          '<span style="display:block;font:700 12.5px system-ui,sans-serif">' + item.name + '</span>' +
          '<span style="display:block;font:400 11px/1.35 system-ui,sans-serif;color:#9fb3c8">' + item.description + '</span>' +
          '</span>' +
          '<span style="font:700 11.5px ui-monospace,monospace;color:' +
          (equipped ? '#4ade80' : affordable ? '#e6edf3' : '#5b6b7d') + '">' + badge + '</span>';

        if (affordable) button.addEventListener('click', () => onEquipment(item.id));
        this.shopScreen.appendChild(button);
      }
    }

    // ----- permanent upgrades -----------------------------------------
    const upgradeHeading = document.createElement('div');
    upgradeHeading.innerHTML =
      '<div style="font:700 12px/1 ui-monospace,monospace;color:#c084fc;letter-spacing:0.14em">UPGRADES</div>';
    upgradeHeading.style.textAlign = 'center';
    upgradeHeading.style.margin = '14px 0 10px';
    this.shopScreen.appendChild(upgradeHeading);

    for (const upgrade of META_UPGRADES) {
      const owned = metaLevel(levels, upgrade.id);
      const cost = costToBuy(upgrade, levels);
      const affordable = cost !== null && essence >= cost;

      const button = document.createElement('button');
      Object.assign(button.style, {
        width: 'min(340px, 88vw)',
        marginBottom: '8px',
        padding: '11px 14px',
        borderRadius: '11px',
        border: '1px solid rgba(255,255,255,0.14)',
        background: affordable ? 'rgba(192,132,252,0.13)' : 'rgba(255,255,255,0.045)',
        color: affordable ? '#e6edf3' : '#7d8fa1',
        textAlign: 'left',
        cursor: affordable ? 'pointer' : 'default',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
      } satisfies Partial<CSSStyleDeclaration>);

      button.innerHTML =
        '<span style="font-size:20px;width:26px;text-align:center">' + upgrade.glyph + '</span>' +
        '<span style="flex:1">' +
        '<span style="display:block;font:700 13px system-ui,sans-serif">' + upgrade.title +
        ' <span style="color:#9fb3c8;font-weight:400">' + owned + '/' + upgrade.maxLevel + '</span></span>' +
        '<span style="display:block;font:400 11.5px/1.35 system-ui,sans-serif;color:#9fb3c8">' + upgrade.description + '</span>' +
        '</span>' +
        '<span style="font:700 13px ui-monospace,monospace;color:' + (affordable ? '#c084fc' : '#5b6b7d') + '">' +
        (cost === null ? 'MAX' : cost) + '</span>';

      if (affordable) {
        button.addEventListener('click', () => onBuy(upgrade.id));
      }
      this.shopScreen.appendChild(button);
    }

    // ----- settings ------------------------------------------------------
    const settingsHeading = document.createElement('div');
    settingsHeading.innerHTML =
      '<div style="font:700 12px/1 ui-monospace,monospace;color:#c084fc;letter-spacing:0.14em">SETTINGS</div>';
    settingsHeading.style.textAlign = 'center';
    settingsHeading.style.margin = '18px 0 10px';
    this.shopScreen.appendChild(settingsHeading);

    const power = document.createElement('button');
    Object.assign(power.style, {
      width: 'min(340px, 88vw)',
      marginBottom: '10px',
      padding: '11px 14px',
      borderRadius: '11px',
      border: lowPower ? '1px solid rgba(74,222,128,0.8)' : '1px solid rgba(255,255,255,0.14)',
      background: lowPower ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.06)',
      color: '#e6edf3',
      textAlign: 'left',
      cursor: 'pointer',
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    power.innerHTML =
      '<span style="font-size:20px;width:26px;text-align:center">🔋</span>' +
      '<span style="flex:1">' +
      '<span style="display:block;font:700 13px system-ui,sans-serif">Low power mode</span>' +
      '<span style="display:block;font:400 11.5px/1.35 system-ui,sans-serif;color:#9fb3c8">' +
      'Draws half as often and thins the swarm a little. For long walks.</span>' +
      '</span>' +
      '<span style="font:700 12px ui-monospace,monospace;color:' +
      (lowPower ? '#4ade80' : '#5b6b7d') + '">' + (lowPower ? 'ON' : 'OFF') + '</span>';
    power.addEventListener('click', () => onLowPower(!lowPower));
    this.shopScreen.appendChild(power);

    // A plain on/off row, reused for sound and vibration.
    const toggle = (
      glyph: string,
      title: string,
      note: string,
      on: boolean,
      onChange: (next: boolean) => void
    ) => {
      const row = document.createElement('button');
      Object.assign(row.style, {
        width: 'min(340px, 88vw)',
        marginBottom: '10px',
        padding: '11px 14px',
        borderRadius: '11px',
        border: on ? '1px solid rgba(74,222,128,0.8)' : '1px solid rgba(255,255,255,0.14)',
        background: on ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.06)',
        color: '#e6edf3',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
      } satisfies Partial<CSSStyleDeclaration>);
      row.innerHTML =
        '<span style="font-size:20px;width:26px;text-align:center">' + glyph + '</span>' +
        '<span style="flex:1">' +
        '<span style="display:block;font:700 13px system-ui,sans-serif">' + title + '</span>' +
        '<span style="display:block;font:400 11.5px/1.35 system-ui,sans-serif;color:#9fb3c8">' +
        note + '</span>' +
        '</span>' +
        '<span style="font:700 12px ui-monospace,monospace;color:' +
        (on ? '#4ade80' : '#5b6b7d') + '">' + (on ? 'ON' : 'OFF') + '</span>';
      row.addEventListener('click', () => onChange(!on));
      this.shopScreen.appendChild(row);
    };

    toggle(
      '🔊',
      'Sound',
      'Lets you play with the phone at your side instead of watching the screen.',
      audio.soundOn,
      audio.onSound
    );

    if (audio.hapticsSupported) {
      toggle(
        '📳',
        'Vibration',
        'Buzzes when you are hurt, when you level, and when a nest falls.',
        audio.hapticsOn,
        audio.onHaptics
      );
    }

    const log = document.createElement('button');
    Object.assign(log.style, {
      width: 'min(340px, 88vw)',
      marginBottom: '10px',
      padding: '11px 14px',
      borderRadius: '11px',
      border: '1px solid rgba(255,255,255,0.14)',
      background: 'rgba(255,255,255,0.06)',
      color: '#e6edf3',
      textAlign: 'left',
      cursor: 'pointer',
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    log.innerHTML =
      '<span style="font-size:20px;width:26px;text-align:center">📋</span>' +
      '<span style="flex:1">' +
      '<span style="display:block;font:700 13px system-ui,sans-serif">Copy my play log</span>' +
      '<span style="display:block;font:400 11px/1.35 system-ui,sans-serif;color:#9fb3c8">' +
      journalSummary + '</span>' +
      '<span style="display:block;font:400 10.5px/1.3 system-ui,sans-serif;color:#5b6b7d;margin-top:2px">' +
      'Stays on this phone. Contains no locations.</span>' +
      '</span>';
    log.addEventListener('click', () => onExportJournal());
    this.shopScreen.appendChild(log);

    const close = document.createElement('button');
    close.textContent = 'Back to the street';
    Object.assign(close.style, {
      marginTop: '8px',
      padding: '12px 24px',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(255,255,255,0.08)',
      color: '#e6edf3',
      font: '600 13px system-ui, sans-serif',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    close.addEventListener('click', () => {
      this.shopScreen.style.display = 'none';
      onClose();
    });
    this.shopScreen.appendChild(close);

    this.shopScreen.style.display = 'flex';
  }

  shopIsOpen(): boolean {
    return this.shopScreen.style.display === 'flex';
  }

  isBlocking(): boolean {
    return (
      this.cardScreen.style.display === 'flex' ||
      this.deathScreen.style.display === 'flex' ||
      this.shopScreen.style.display === 'flex'
    );
  }
}
