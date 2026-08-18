/**
 * "THE MAP DID NOT LOAD" SCREEN.
 * ==============================
 * A white screen that explains nothing is the worst possible failure. It looks
 * identical whether the phone is too old, the connection died, or we wrote a bug
 * -- and those need completely different fixes.
 *
 * So when the map gives up, we say so in plain language, guess at the most
 * likely cause, and offer a button that copies the technical details so they can
 * be sent to whoever is fixing it.
 *
 * This is NOT a dev-only tool. Real players on bad connections will see it, so
 * it ships in the public build and is written to be read by a normal person.
 */

import type { MapDiagnostics } from '../map/mapView';

/**
 * Turn the technical facts into one plain sentence about what is most likely
 * wrong, and one about what to do next. Ordered by how likely each cause is.
 */
function explain(d: MapDiagnostics): { headline: string; advice: string } {
  if (!d.webgl2) {
    return {
      headline: 'This phone or browser cannot draw the map.',
      advice:
        'The map needs a graphics feature called WebGL2 that this browser does not have. Try opening the game in Chrome. If it still fails, the phone is likely too old for this game — which is useful to know now rather than later.',
    };
  }

  if (!d.online) {
    return {
      headline: 'The phone has no internet connection.',
      advice: 'Check wifi or mobile data, then tap Try again.',
    };
  }

  if (d.tilesRequested === 0) {
    return {
      headline: 'The map never even asked for map data.',
      advice:
        'That usually means the map failed to start up at all. Tap Try again. If it keeps happening, send the details — this one is probably our bug, not yours.',
    };
  }

  if (d.tilesLoaded === 0) {
    return {
      headline: 'The map data is not arriving.',
      advice:
        'We asked for map tiles and got nothing back. This is usually a slow or blocked connection — some mobile networks block map servers. Try again on wifi, or send the details.',
    };
  }

  return {
    headline: 'The map loaded but did not draw.',
    advice: 'Tap Try again. If it keeps happening, send the details.',
  };
}

/** Format everything we know as plain text, for copying into a message. */
function asPlainText(d: MapDiagnostics): string {
  return [
    'GEO-SURVIVORS MAP DIAGNOSTICS',
    `time waited:   ${d.secondsSinceStart}s`,
    `webgl2:        ${d.webgl2} (${d.webglDetail})`,
    `basemap:       ${d.basemap}`,
    `style loaded:  ${d.styleLoaded}`,
    `first render:  ${d.firstRenderDone}`,
    `tiles asked:   ${d.tilesRequested}`,
    `tiles arrived: ${d.tilesLoaded}`,
    `online:        ${d.online}`,
    `zoom:          ${d.zoom.toFixed(2)}`,
    `screen:        ${window.innerWidth}x${window.innerHeight}`,
    `browser:       ${navigator.userAgent}`,
    'errors:',
    ...(d.errors.length ? d.errors.map((e) => `  - ${e}`) : ['  (none reported)']),
  ].join('\n');
}

export function showMapTrouble(container: HTMLElement, diagnostics: MapDiagnostics): void {
  // Never stack two of these on top of each other.
  if (document.getElementById('map-trouble')) return;

  const { headline, advice } = explain(diagnostics);
  const details = asPlainText(diagnostics);

  const panel = document.createElement('div');
  panel.id = 'map-trouble';
  Object.assign(panel.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(400px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 64px)',
    overflowY: 'auto',
    padding: '20px',
    borderRadius: '14px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(13,17,23,0.97)',
    color: '#e6edf3',
    font: '14px/1.5 system-ui, -apple-system, sans-serif',
    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    zIndex: '50',
  } satisfies Partial<CSSStyleDeclaration>);

  const buttonCss = [
    'flex:1',
    'padding:12px',
    'border-radius:9px',
    'border:1px solid rgba(255,255,255,0.18)',
    'background:rgba(255,255,255,0.09)',
    'color:#e6edf3',
    'font:600 13px system-ui,sans-serif',
    'cursor:pointer',
  ].join(';');

  panel.innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:10px">${headline}</div>
    <div style="color:#9fb3c8;margin-bottom:16px">${advice}</div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button id="mt-retry" style="${buttonCss}">Try again</button>
      <button id="mt-copy" style="${buttonCss}">Copy details</button>
    </div>
    <details>
      <summary style="cursor:pointer;color:#7d8fa1;font-size:12px">Technical details</summary>
      <pre id="mt-details" style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.05);font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;color:#9fb3c8">${details}</pre>
    </details>
  `;

  container.appendChild(panel);

  panel.querySelector('#mt-retry')!.addEventListener('click', () => window.location.reload());

  const copyButton = panel.querySelector<HTMLButtonElement>('#mt-copy')!;
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(details);
      copyButton.textContent = 'Copied';
    } catch {
      // Clipboard access is refused in some mobile browsers. Fall back to
      // selecting the text so it can be copied by hand.
      const pre = panel.querySelector('#mt-details') as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      copyButton.textContent = 'Select + copy';
    }
    setTimeout(() => (copyButton.textContent = 'Copy details'), 2500);
  });

  // Always log it too, so it is in the browser console for anyone debugging.
  console.error('[map] gave up.\n' + details);
}
