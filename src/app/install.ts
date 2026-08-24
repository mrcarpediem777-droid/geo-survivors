/**
 * INSTALLING THE GAME ON A PHONE.
 * ===============================
 * Two separate jobs that both belong to "this is an app, not a web page":
 *
 *   1. Registering the offline helper, so a dead spot on the street does not
 *      turn the game into a browser error page.
 *   2. Offering an "add to home screen" button at a moment when it is welcome.
 *
 * WHY THE BUTTON IS NOT SHOWN IMMEDIATELY. A prompt that appears the instant a
 * stranger opens something is asking for a commitment before they know what the
 * thing is, and it is refused almost every time -- and a refusal is remembered
 * by the browser, so the offer is spent. It waits until the player has actually
 * been playing.
 *
 * iOS DOES NOT SUPPORT ANY OF THIS. Safari has no install prompt at all; a
 * player has to use Share -> Add to Home Screen themselves. So the button
 * simply never appears there, and the tutorial mentions it instead. Pretending
 * otherwise would mean a button that does nothing.
 */

/** The event Chrome fires when it is willing to offer an install. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Seconds of play before the offer is worth making. */
const OFFER_AFTER_SECONDS = 90;

let pending: InstallPromptEvent | null = null;

export function registerOfflineSupport(): void {
  if (!('serviceWorker' in navigator)) return;

  // Waiting for load keeps the worker's own download from competing with the
  // map and the game code for the first few seconds of a cold start.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      // Not fatal in any way -- the game works perfectly without it, just
      // without the safety net. Never let this reach the player.
      console.info('[offline] the offline helper could not be registered', error);
    });
  });
}

/**
 * Watch for the browser offering an install, and put a small button on screen
 * once the player has been at it long enough to want one.
 *
 * @param uiContainer where the button belongs
 * @param alreadyInstalled true if we are already running as an installed app
 */
export function offerInstall(uiContainer: HTMLElement, onInstalled: () => void): void {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own, non-standard way of saying the same thing.
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Stop the browser putting up its own bar. We want to choose the moment.
    event.preventDefault();
    pending = event as InstallPromptEvent;
  });

  window.setTimeout(() => {
    if (!pending) return;
    showButton(uiContainer, onInstalled);
  }, OFFER_AFTER_SECONDS * 1000);

  window.addEventListener('appinstalled', () => {
    pending = null;
    onInstalled();
  });
}

function showButton(uiContainer: HTMLElement, onInstalled: () => void): void {
  const button = document.createElement('button');
  button.textContent = '⤓  Put on home screen';
  Object.assign(button.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: 'calc(18px + env(safe-area-inset-bottom))',
    padding: '11px 18px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(13,17,23,0.92)',
    color: '#e6edf3',
    font: '600 13px system-ui, sans-serif',
    zIndex: '40',
    cursor: 'pointer',
    backdropFilter: 'blur(6px)',
  } satisfies Partial<CSSStyleDeclaration>);

  // A way out that does not cost the offer permanently is important: someone who
  // taps the X is saying "not now", and the browser will hand us the event again
  // on a later visit.
  const dismiss = document.createElement('button');
  dismiss.textContent = '✕';
  Object.assign(dismiss.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(calc(50% + 96px))',
    bottom: 'calc(18px + env(safe-area-inset-bottom))',
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(13,17,23,0.92)',
    color: '#9fb3c8',
    font: '600 13px system-ui, sans-serif',
    zIndex: '40',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);

  const remove = () => {
    button.remove();
    dismiss.remove();
  };

  button.addEventListener('click', async () => {
    if (!pending) return remove();
    remove();
    await pending.prompt();
    const choice = await pending.userChoice;
    pending = null;
    if (choice.outcome === 'accepted') onInstalled();
  });

  dismiss.addEventListener('click', remove);

  uiContainer.appendChild(button);
  uiContainer.appendChild(dismiss);
}
