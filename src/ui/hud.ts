/**
 * THE HUD -- the small bits of interface drawn over the map.
 * =========================================================
 * For M1 this is deliberately tiny: a status line telling you what the GPS is
 * doing, and a button to re-centre the map on yourself if you have dragged it
 * away. The joystick, health bar and level-up cards arrive in M2 and M4.
 */

import type { AnchorState } from '../location/playerLocation';

export class Hud {
  private statusBar: HTMLDivElement;
  private recentreButton: HTMLButtonElement;

  constructor(container: HTMLElement, onRecentre: () => void) {
    this.statusBar = document.createElement('div');
    Object.assign(this.statusBar.style, {
      position: 'absolute',
      top: 'calc(env(safe-area-inset-top) + 10px)',
      left: '50%',
      transform: 'translateX(-50%)',
      maxWidth: 'calc(100% - 24px)',
      padding: '8px 14px',
      borderRadius: '999px',
      background: 'rgba(13,17,23,0.82)',
      color: '#e6edf3',
      font: '500 13px/1.35 system-ui, sans-serif',
      textAlign: 'center',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
      transition: 'opacity 250ms ease',
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(this.statusBar);

    this.recentreButton = document.createElement('button');
    this.recentreButton.textContent = 'Centre on me';
    Object.assign(this.recentreButton.style, {
      position: 'absolute',
      right: 'calc(env(safe-area-inset-right) + 14px)',
      bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
      padding: '11px 16px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'rgba(13,17,23,0.86)',
      color: '#e6edf3',
      font: '600 13px system-ui, sans-serif',
      cursor: 'pointer',
      display: 'none',
      backdropFilter: 'blur(8px)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.recentreButton.addEventListener('click', onRecentre);
    container.appendChild(this.recentreButton);
  }

  /** Update the status line from the current location state. */
  render(state: AnchorState): void {
    // A short, friendly sentence per situation. Never show error codes.
    switch (state.status) {
      case 'live': {
        const accuracy = Number.isFinite(state.accuracyMetres)
          ? `+/-${state.accuracyMetres.toFixed(0)} m`
          : '';
        const prefix = state.source === 'fake-gps-dev' ? 'DEV fake GPS' : 'Location live';
        this.statusBar.textContent = `${prefix} ${accuracy}`.trim();
        // Fade the bar down once things are working -- it is no longer news.
        this.statusBar.style.opacity = '0.55';
        break;
      }
      case 'waiting-for-fix':
        this.statusBar.textContent = 'Looking for your location...';
        this.statusBar.style.opacity = '1';
        break;
      default:
        this.statusBar.textContent = state.message;
        this.statusBar.style.opacity = '1';
        break;
    }
  }

  /** Show or hide the re-centre button depending on whether the map is following. */
  setRecentreVisible(visible: boolean): void {
    this.recentreButton.style.display = visible ? 'block' : 'none';
  }
}
