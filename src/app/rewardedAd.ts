/**
 * REWARDED ADS — the placeholder.
 * ===============================
 * A fake for now: it pre-loads for a moment, shows a black rectangle saying
 * AD PLAYED, and hands over the reward. A real ad SDK drops into the same slot
 * later without anything around it changing.
 *
 * THE ONE RULE THAT IS BUILT INTO THE SHAPE OF THIS FILE.
 *
 * The brief says the reward must be paid **even if the ad fails**. That is easy
 * to agree with and easy to forget the day an ad network starts timing out at
 * three in the morning -- so it is not left to whoever calls this. `watchAdFor`
 * takes the reward itself and calls it EXACTLY ONCE, on every path there is:
 * the ad played, the ad failed to load, the network was gone, the player closed
 * it early, our own code threw. There is no way to call this function and not
 * pay out, which is the only kind of promise worth making.
 *
 * The reasoning: the player did what was asked of them. Whether a server in
 * another country managed to send a video is not their problem, and making it
 * their problem is how a free game teaches people that it is lying to them.
 *
 * WHAT IS DELIBERATELY NOT HERE: anything that interrupts. No ad ever appears
 * on its own. Every one of these is behind a button the player chose to press,
 * offered at a moment when they have already stopped playing.
 */

import { TUNING } from '../config/tuning';

/** How the fake behaves. The real SDK will have its own version of this. */
const PRELOAD_MS = 700;
const PLAY_MS = 5000;

export type AdOutcome = 'played' | 'failed-to-load' | 'closed-early';

let preloaded = false;
let preloading = false;

/**
 * Start fetching an ad well before it is needed.
 *
 * The brief requires this. An ad that starts loading when the player taps is an
 * ad that shows a spinner for four seconds, and a spinner is how you turn a
 * willing viewer into somebody who closes the app.
 */
export function preloadAd(): void {
  if (preloaded || preloading) return;
  preloading = true;
  window.setTimeout(() => {
    preloading = false;
    preloaded = true;
  }, PRELOAD_MS);
}

export function adIsReady(): boolean {
  return preloaded;
}

/**
 * Show an ad and pay the reward.
 *
 * @param reward called exactly once, whatever happens. See the note above.
 * @returns what actually happened, for the log -- NOT for deciding whether to
 *          pay, which has already been decided.
 */
export async function watchAdFor(
  container: HTMLElement,
  label: string,
  reward: () => void
): Promise<AdOutcome> {
  let paid = false;
  const payOnce = () => {
    if (paid) return;
    paid = true;
    reward();
  };

  try {
    const outcome = await playFakeAd(container, label);
    payOnce();
    return outcome;
  } catch {
    // Our own code broke. The player still did their part.
    payOnce();
    return 'failed-to-load';
  } finally {
    payOnce();
    preloaded = false;
    preloadAd();
  }
}

function playFakeAd(container: HTMLElement, label: string): Promise<AdOutcome> {
  return new Promise((resolve) => {
    const failed = !preloaded || Math.random() < TUNING.performance.fakeAdFailureRate;

    const screen = document.createElement('div');
    Object.assign(screen.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '14px',
      background: '#05070a',
      color: '#e6edf3',
      zIndex: '70',
      textAlign: 'center',
      padding: '28px',
    } satisfies Partial<CSSStyleDeclaration>);
    container.appendChild(screen);

    const finish = (outcome: AdOutcome) => {
      screen.remove();
      resolve(outcome);
    };

    if (failed) {
      // The important case. Say plainly that it did not work AND that it does
      // not matter, because a player who thinks they have been cheated does not
      // come back to find out.
      screen.innerHTML =
        '<div style="font:700 13px ui-monospace,monospace;color:#fca5a5;letter-spacing:0.14em">NO AD AVAILABLE</div>' +
        '<div style="font:400 14px/1.6 system-ui,sans-serif;color:#9fb3c8;max-width:300px">' +
        'The ad did not load — but you asked for it, so you are getting <b style="color:#e6edf3">' +
        label + '</b> anyway.</div>';
      window.setTimeout(() => finish('failed-to-load'), 1900);
      return;
    }

    const title = document.createElement('div');
    title.style.cssText =
      'font:700 13px ui-monospace,monospace;color:#5b6b7d;letter-spacing:0.18em';
    title.textContent = 'AD PLAYED';
    screen.appendChild(title);

    const box = document.createElement('div');
    box.style.cssText =
      'width:min(300px,80vw);height:180px;border-radius:12px;border:1px dashed rgba(255,255,255,0.16);' +
      'display:flex;align-items:center;justify-content:center;color:#3d4a5c;' +
      'font:600 12px ui-monospace,monospace';
    box.textContent = '[ placeholder ]';
    screen.appendChild(box);

    const note = document.createElement('div');
    note.style.cssText = 'font:400 13px system-ui,sans-serif;color:#9fb3c8';
    screen.appendChild(note);

    const skip = document.createElement('button');
    skip.style.cssText =
      'margin-top:6px;padding:10px 20px;border-radius:999px;border:1px solid rgba(255,255,255,0.18);' +
      'background:rgba(255,255,255,0.06);color:#e6edf3;font:600 13px system-ui,sans-serif;cursor:pointer';
    screen.appendChild(skip);

    let left = Math.ceil(PLAY_MS / 1000);
    const draw = () => {
      note.textContent = left > 0 ? left + '…' : '';
      // Closing early still pays. It is spelled out so nobody has to wonder.
      skip.textContent = left > 0 ? 'Close (you still get it)' : 'Collect ' + label;
    };
    draw();

    const timer = window.setInterval(() => {
      left--;
      draw();
      if (left <= 0) window.clearInterval(timer);
    }, 1000);

    skip.addEventListener('click', () => {
      window.clearInterval(timer);
      finish(left > 0 ? 'closed-early' : 'played');
    });
  });
}
