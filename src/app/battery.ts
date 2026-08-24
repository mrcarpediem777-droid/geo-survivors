/**
 * WATCHING THE BATTERY.
 * =====================
 * This game asks somebody to go for an hour's walk with their phone awake and
 * its GPS running. That makes the battery a design constraint, not a nicety: a
 * game that strands a person a mile from home with a dead phone has done real
 * harm, and no amount of good combat makes up for it.
 *
 * So when the battery gets low we say so, once, and offer to draw less. We do
 * not switch anything on behind the player's back -- somebody with 20% left and
 * five minutes of walking to do is entitled to the full game.
 *
 * ONLY ANDROID TELLS US. Safari removed this deliberately, because a battery
 * level is a surprisingly good way to recognise the same person across websites.
 * That is a fair decision and we simply live with it: on an iPhone the mode is
 * still there in the settings, it just has to be found rather than offered.
 */

import { TUNING } from '../config/tuning';

interface BatteryLike extends EventTarget {
  level: number;
  charging: boolean;
}

/**
 * Call `onLow` once if the battery is, or becomes, low while not charging.
 *
 * @returns a function that stops watching, so a caller can drop it after the
 *          offer has been made or accepted.
 */
export function watchBattery(onLow: (percent: number) => void): () => void {
  const api = (navigator as unknown as { getBattery?: () => Promise<BatteryLike> }).getBattery;
  if (typeof api !== 'function') return () => undefined;

  let stopped = false;
  let told = false;
  let battery: BatteryLike | null = null;

  const check = () => {
    if (stopped || told || !battery) return;
    if (battery.charging) return;
    if (battery.level > TUNING.performance.offerLowPowerBelowBattery) return;
    told = true;
    onLow(Math.round(battery.level * 100));
  };

  api.call(navigator).then(
    (b) => {
      if (stopped) return;
      battery = b;
      b.addEventListener('levelchange', check);
      b.addEventListener('chargingchange', check);
      check();
    },
    () => undefined // Refused or unavailable. Not worth a word to anyone.
  );

  return () => {
    stopped = true;
    battery?.removeEventListener('levelchange', check);
    battery?.removeEventListener('chargingchange', check);
  };
}

/** A one-off bar offering to turn the mode on. Dismissable, and never nags. */
export function offerLowPower(
  container: HTMLElement,
  percent: number,
  onAccept: () => void
): void {
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: 'calc(18px + env(safe-area-inset-bottom))',
    width: 'min(340px, 90vw)',
    padding: '13px 15px',
    borderRadius: '12px',
    border: '1px solid rgba(250,204,21,0.35)',
    background: 'rgba(20,17,8,0.95)',
    color: '#e6edf3',
    font: '400 13px/1.5 system-ui, sans-serif',
    zIndex: '45',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    backdropFilter: 'blur(6px)',
  } satisfies Partial<CSSStyleDeclaration>);

  const text = document.createElement('div');
  text.style.flex = '1';
  text.innerHTML =
    '<b>Battery at ' + percent + '%.</b><br>' +
    '<span style="color:#9fb3c8;font-size:12px">Draw less so it lasts the walk home?</span>';
  bar.appendChild(text);

  const yes = document.createElement('button');
  yes.textContent = 'Yes';
  yes.style.cssText =
    'padding:9px 15px;border-radius:9px;border:1px solid rgba(250,204,21,0.5);' +
    'background:rgba(250,204,21,0.16);color:#e6edf3;font:600 13px system-ui,sans-serif;cursor:pointer';
  yes.addEventListener('click', () => {
    bar.remove();
    onAccept();
  });
  bar.appendChild(yes);

  const no = document.createElement('button');
  no.textContent = '✕';
  no.style.cssText =
    'padding:9px 11px;border-radius:9px;border:1px solid rgba(255,255,255,0.14);' +
    'background:none;color:#9fb3c8;font:600 13px system-ui,sans-serif;cursor:pointer';
  no.addEventListener('click', () => bar.remove());
  bar.appendChild(no);

  container.appendChild(bar);
}
