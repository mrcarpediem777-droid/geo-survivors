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
    this.root.appendChild(this.readout);

    /* --- edge arrows pointing at nests --- */
    this.markerLayer = document.createElement('div');
    Object.assign(this.markerLayer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.markerLayer);

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
        border: card.isWeapon
          ? '1px solid rgba(90,200,255,0.55)'
          : '1px solid rgba(255,255,255,0.16)',
        background: card.isWeapon ? 'rgba(90,200,255,0.10)' : 'rgba(255,255,255,0.06)',
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

  showDeath(summary: string, onRestart: () => void): void {
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

    this.deathScreen.append(heading, detail, button);
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
    markers: { screenX: number; screenY: number; distanceMetres: number; onScreen: boolean }[]
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
      marker.textContent = data.onScreen
        ? `NEST
${data.distanceMetres.toFixed(0)} m`
        : `◆
${data.distanceMetres.toFixed(0)} m`;
      marker.style.whiteSpace = 'pre';
    }
  }

  isBlocking(): boolean {
    return this.cardScreen.style.display === 'flex' || this.deathScreen.style.display === 'flex';
  }
}
