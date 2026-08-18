/**
 * THE DEV PANEL -- your testing cockpit.
 * ======================================
 * This is the hidden panel that lets you test the whole game sitting at your
 * desk instead of walking around Hoi An in 34 degrees.
 *
 * HOW TO OPEN IT: press and hold the BOTTOM-LEFT corner of the screen for one
 * second. On a computer you can also just press the ` key (top-left, above Tab).
 *
 * HOW IT CAN NEVER REACH REAL PLAYERS:
 * Nothing in this file is even downloaded unless dev tools are switched on.
 * See `DEV_TOOLS_ENABLED` in main.ts -- when that is false, the build tool
 * deletes this entire file from the finished game. It is not hidden from
 * players; it is physically absent.
 */

import { Marker } from 'maplibre-gl';

import type { MapView } from '../map/mapView';
import type { PlayerLocation } from '../location/playerLocation';
import type { Profile } from '../profile/profile';
import type { Game } from '../game/game';
import type { LatLng } from '../location/geo';
import { offsetByMetres, metresAcrossScreen } from '../location/geo';
import { worldCellFor, minutesUntilNextSlot } from '../world/determinism';
import { TUNING } from '../config/tuning';

/** How fast the fake player walks when you hold an arrow key, in metres/second. */
const FAKE_WALK_SPEED_MPS = 1.4; // a real human walking pace
const FAKE_RUN_SPEED_MPS = 6.0; // hold Shift -- cycling pace, for covering ground

/** Real GPS reports roughly once a second, so our fake one should too. */
const FAKE_GPS_REPORT_INTERVAL_MS = 1000;

export function installDevTools(
  uiContainer: HTMLElement,
  mapView: MapView,
  location: PlayerLocation,
  profile: Profile,
  game: Game
): void {
  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  let panelOpen = false;
  let fakeEnabled = false;
  let fakePosition: LatLng | null = null;
  let fakeMarker: Marker | null = null;
  let simulateJitter = false;

  /** Which movement keys are currently held down. */
  const keysHeld = new Set<string>();

  /* ------------------------------------------------------------------ */
  /* The panel itself                                                    */
  /* ------------------------------------------------------------------ */

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'absolute',
    left: 'calc(env(safe-area-inset-left) + 10px)',
    bottom: 'calc(env(safe-area-inset-bottom) + 10px)',
    width: 'min(330px, calc(100vw - 20px))',
    maxHeight: '70vh',
    overflowY: 'auto',
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(9,12,16,0.93)',
    color: '#e6edf3',
    font: '12px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    backdropFilter: 'blur(10px)',
    display: 'none',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  } satisfies Partial<CSSStyleDeclaration>);
  uiContainer.appendChild(panel);

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <strong style="font-size:13px;letter-spacing:0.04em">DEV MODE</strong>
      <button id="dev-close" style="${buttonStyle()}">close</button>
    </div>

    <div id="dev-readout" style="white-space:pre;line-height:1.6;margin-bottom:10px;color:#9fb3c8"></div>

    <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
      <input type="checkbox" id="dev-fake-toggle" />
      <span>Fake GPS (test without going outside)</span>
    </label>

    <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer;opacity:0.55" id="dev-jitter-row">
      <input type="checkbox" id="dev-jitter-toggle" disabled />
      <span>Add realistic GPS wobble</span>
    </label>

    <div id="dev-fake-help" style="display:none;margin-bottom:10px;color:#7d8fa1">
      Drag the orange marker to teleport.<br />
      <b>Arrow keys = your feet</b> (moves your real position).<br />
      <b>WASD = your thumb</b> (steers the character on its leash).<br />
      Hold Shift to walk faster.
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <button id="dev-here" style="${buttonStyle()}">fake GPS here</button>
      <button id="dev-combat-zoom" style="${buttonStyle()}">combat zoom</button>
      <button id="dev-nav-zoom" style="${buttonStyle()}">nav zoom</button>
      <button id="dev-walls" style="${buttonStyle()}">load walls here</button>
      <button id="dev-show-walls" style="${buttonStyle()}">show/hide walls</button>
      <button id="dev-markers" style="${buttonStyle()}">test markers here</button>
      <button id="dev-stress" style="${buttonStyle()}">stress test</button>
      <button id="dev-reset-save" style="${buttonStyle()}">wipe save</button>
    </div>

    <div style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px">
      <div style="color:#7d8fa1;margin-bottom:4px">anti-cheat flags</div>
      <div id="dev-flags" style="color:#f0a868;white-space:pre-wrap">none yet</div>
    </div>
  `;

  const readoutEl = panel.querySelector<HTMLDivElement>('#dev-readout')!;
  const flagsEl = panel.querySelector<HTMLDivElement>('#dev-flags')!;
  const fakeToggle = panel.querySelector<HTMLInputElement>('#dev-fake-toggle')!;
  const jitterToggle = panel.querySelector<HTMLInputElement>('#dev-jitter-toggle')!;
  const jitterRow = panel.querySelector<HTMLLabelElement>('#dev-jitter-row')!;
  const fakeHelp = panel.querySelector<HTMLDivElement>('#dev-fake-help')!;

  /* ------------------------------------------------------------------ */
  /* Opening and closing                                                 */
  /* ------------------------------------------------------------------ */

  function setPanelOpen(open: boolean): void {
    panelOpen = open;
    panel.style.display = open ? 'block' : 'none';
    // Fill the numbers in straight away, otherwise the panel sits blank for up
    // to half a second every time you open it, which looks broken.
    if (open) renderReadout();
  }

  panel.querySelector('#dev-close')!.addEventListener('click', () => setPanelOpen(false));

  // Long-press the bottom-left corner. Invisible, so it cannot be hit by accident.
  const hotCorner = document.createElement('div');
  Object.assign(hotCorner.style, {
    position: 'absolute',
    left: '0',
    bottom: '0',
    width: '72px',
    height: '72px',
    zIndex: '5',
  } satisfies Partial<CSSStyleDeclaration>);
  uiContainer.appendChild(hotCorner);

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const beginHold = () => {
    holdTimer = setTimeout(() => setPanelOpen(!panelOpen), 1000);
  };
  const cancelHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  hotCorner.addEventListener('pointerdown', beginHold);
  hotCorner.addEventListener('pointerup', cancelHold);
  hotCorner.addEventListener('pointerleave', cancelHold);
  hotCorner.addEventListener('pointercancel', cancelHold);

  /* ------------------------------------------------------------------ */
  /* Fake GPS                                                            */
  /* ------------------------------------------------------------------ */

  function startFakeGps(at: LatLng): void {
    fakeEnabled = true;
    fakePosition = { ...at };

    fakeMarker = new Marker({ color: '#f97316', draggable: true })
      .setLngLat([at.lng, at.lat])
      .addTo(mapView.map);

    // Dragging the marker teleports the pretend player.
    fakeMarker.on('dragend', () => {
      const position = fakeMarker!.getLngLat();
      fakePosition = { lat: position.lat, lng: position.lng };
      pushFakeReading();
    });

    fakeToggle.checked = true;
    jitterToggle.disabled = false;
    jitterRow.style.opacity = '1';
    fakeHelp.style.display = 'block';
    pushFakeReading();
  }

  function stopFakeGps(): void {
    fakeEnabled = false;
    fakePosition = null;
    fakeMarker?.remove();
    fakeMarker = null;

    fakeToggle.checked = false;
    jitterToggle.disabled = true;
    jitterToggle.checked = false;
    simulateJitter = false;
    jitterRow.style.opacity = '0.55';
    fakeHelp.style.display = 'none';

    location.clearFakePosition();
  }

  /**
   * Hand the current pretend position to the location module, optionally with
   * fake GPS wobble added so we can watch the smoothing actually do its job.
   */
  function pushFakeReading(): void {
    if (!fakePosition) return;

    let reported = fakePosition;
    if (simulateJitter) {
      // Random nudge of up to ~8 m in any direction, like real phone GPS.
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 8;
      reported = offsetByMetres(
        fakePosition,
        Math.cos(angle) * distance,
        Math.sin(angle) * distance
      );
    }

    location.setFakePosition(reported);
  }

  fakeToggle.addEventListener('change', () => {
    if (fakeToggle.checked) {
      const centre = mapView.map.getCenter();
      startFakeGps({ lat: centre.lat, lng: centre.lng });
    } else {
      stopFakeGps();
    }
  });

  jitterToggle.addEventListener('change', () => {
    simulateJitter = jitterToggle.checked;
  });

  panel.querySelector('#dev-here')!.addEventListener('click', () => {
    const centre = mapView.map.getCenter();
    if (fakeEnabled) {
      fakePosition = { lat: centre.lat, lng: centre.lng };
      fakeMarker?.setLngLat(centre);
      pushFakeReading();
    } else {
      startFakeGps({ lat: centre.lat, lng: centre.lng });
    }
  });

  panel.querySelector('#dev-combat-zoom')!.addEventListener('click', () => {
    mapView.map.easeTo({
      zoom: TUNING.camera.combatZoom,
      duration: TUNING.camera.zoomTransitionMs,
    });
  });

  panel.querySelector('#dev-nav-zoom')!.addEventListener('click', () => {
    mapView.map.easeTo({
      zoom: TUNING.camera.navigationZoom,
      duration: TUNING.camera.zoomTransitionMs,
    });
  });

  panel.querySelector('#dev-walls')!.addEventListener('click', () => {
    const c = mapView.map.getCenter();
    void game.rebuildWalls({ lat: c.lat, lng: c.lng }).then(() => refreshWallOverlay(true));
  });

  panel.querySelector('#dev-show-walls')!.addEventListener('click', () => {
    refreshWallOverlay(!mapView.hasWallOverlay());
  });

  /** Convert the collision walls back to map coordinates and draw them. */
  function refreshWallOverlay(show: boolean): void {
    if (!show) {
      mapView.hideWallOverlay();
      return;
    }
    const col = game.collision;
    const rings = col.wallOutlines().map((points) => {
      const ring: number[][] = [];
      for (let i = 0; i < points.length; i += 2) {
        ring.push([col.toLng(points[i]), col.toLat(points[i + 1])]);
      }
      // GeoJSON wants the loop closed.
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push([ring[0][0], ring[0][1]]);
      }
      return ring;
    });
    mapView.showWallOverlay(rings);
  }

  panel.querySelector('#dev-markers')!.addEventListener('click', () => {
    const centre = mapView.map.getCenter();
    game.spawnTestMarkers({ lat: centre.lat, lng: centre.lng });
  });

  // Spawn a swarm of dots to find out what this phone can actually draw.
  // This is the honest answer to "will it hit 60fps with 400 monsters?".
  panel.querySelector('#dev-stress')!.addEventListener('click', () => {
    const centre = mapView.map.getCenter();
    for (let i = 0; i < 400; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 70;
      const at = offsetByMetres(
        { lat: centre.lat, lng: centre.lng },
        Math.cos(angle) * distance,
        Math.sin(angle) * distance
      );
      game.entities.spawn(1 /* MONSTER */, at.lng, at.lat, 2);
    }
  });

  panel.querySelector('#dev-reset-save')!.addEventListener('click', () => {
    profile.reset();
    readoutEl.textContent = 'save wiped -- reload the page';
  });

  /* ------------------------------------------------------------------ */
  /* Keyboard walking                                                    */
  /* ------------------------------------------------------------------ */

  // ONLY the arrow keys move the pretend GPS. WASD belongs to the joystick,
  // which steers the character. Keeping them apart is what lets you test the
  // leash at a desk: arrows are your feet, WASD is your thumb.
  const MOVEMENT_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    // Backtick opens the panel on a computer.
    if (key === '`') {
      setPanelOpen(!panelOpen);
      return;
    }

    if (fakeEnabled && MOVEMENT_KEYS.has(key)) {
      keysHeld.add(key);
      event.preventDefault(); // stop the arrow keys scrolling the page
    }
  });

  window.addEventListener('keyup', (event) => {
    keysHeld.delete(event.key.toLowerCase());
  });

  // Safety: if the window loses focus mid-press we would otherwise walk forever.
  window.addEventListener('blur', () => keysHeld.clear());

  /* ------------------------------------------------------------------ */
  /* The loop: move the fake player, measure FPS, refresh the readout     */
  /* ------------------------------------------------------------------ */

  let lastFrameMs = performance.now();
  let framesThisSecond = 0;
  let fpsAccumulatorMs = 0;
  let measuredFps = 0;
  let lastReportMs = 0;
  let lastReadoutMs = 0;

  function tick(nowMs: number): void {
    const deltaSeconds = Math.min((nowMs - lastFrameMs) / 1000, 0.1);
    lastFrameMs = nowMs;

    // --- FPS, averaged over one second so the number is readable ---
    framesThisSecond++;
    fpsAccumulatorMs += deltaSeconds * 1000;
    if (fpsAccumulatorMs >= 1000) {
      measuredFps = framesThisSecond;
      framesThisSecond = 0;
      fpsAccumulatorMs = 0;
    }

    // --- Walk the fake player if keys are held ---
    if (fakeEnabled && fakePosition && keysHeld.size > 0) {
      const running = keysHeld.has('shift');
      const speed = running ? FAKE_RUN_SPEED_MPS : FAKE_WALK_SPEED_MPS;

      let east = 0;
      let north = 0;
      if (keysHeld.has('arrowup')) north += 1;
      if (keysHeld.has('arrowdown')) north -= 1;
      if (keysHeld.has('arrowleft')) east -= 1;
      if (keysHeld.has('arrowright')) east += 1;

      if (east !== 0 || north !== 0) {
        // Normalise so moving diagonally is not faster than moving straight.
        const magnitude = Math.hypot(east, north);
        const step = speed * deltaSeconds;
        fakePosition = offsetByMetres(
          fakePosition,
          (east / magnitude) * step,
          (north / magnitude) * step
        );
        fakeMarker?.setLngLat([fakePosition.lng, fakePosition.lat]);
      }
    }

    // --- Report the fake position at roughly real-GPS speed, not every frame ---
    if (fakeEnabled && nowMs - lastReportMs >= FAKE_GPS_REPORT_INTERVAL_MS) {
      lastReportMs = nowMs;
      pushFakeReading();
    }

    // --- Refresh the text readout a couple of times a second ---
    if (panelOpen && nowMs - lastReadoutMs >= TUNING.performance.devReadoutIntervalMs) {
      lastReadoutMs = nowMs;
      renderReadout();
    }

    requestAnimationFrame(tick);
  }

  function renderReadout(): void {
    const state = location.current();
    const zoom = mapView.map.getZoom();
    const centre = mapView.map.getCenter();
    const across = metresAcrossScreen(zoom, centre.lat, window.innerWidth);

    const g = game.stats();

    const lines: string[] = [
      `fps        ${g.fps || measuredFps}`,
      `zoom       ${zoom.toFixed(2)}`,
      `screen     ${across.toFixed(0)} m across`,
      `camera     ${g.inCombat ? 'COMBAT' : 'navigation'}`,
      `entities   ${g.entitiesAlive} alive / ${g.entitiesDrawn} drawn`,
      `walls      ${g.walls.loading ? 'loading...' : g.walls.wallCount + ' (' + g.walls.realBuildings + ' real, ' + g.walls.generated + ' generated)'}`,
      `arena      ${g.walls.usingFallbackArena ? 'FALLBACK -- too few real buildings here' : 'real buildings'}`,
      `tiles read ${g.walls.tilesFetched}`,
      `leash      ${g.distanceFromAnchor.toFixed(1)} m (${(g.leashTension * 100).toFixed(0)}% stretched)`,
      `source     ${state.source}`,
      `accuracy   ${Number.isFinite(state.accuracyMetres) ? state.accuracyMetres.toFixed(1) + ' m' : '--'}`,
      `smoothing  +/-${location.smoothingUncertaintyMetres().toFixed(1)} m`,
    ];

    if (state.anchor) {
      lines.push(`anchor     ${state.anchor.lat.toFixed(6)}, ${state.anchor.lng.toFixed(6)}`);
      const cell = worldCellFor(state.anchor.lat, state.anchor.lng);
      lines.push(`world cell ${cell.cell}`);
      lines.push(`seed       ${cell.seed}`);
      lines.push(`rerolls in ${minutesUntilNextSlot()} min`);
    } else {
      lines.push('anchor     waiting for a fix');
    }

    readoutEl.textContent = lines.join('\n');

    // Anti-cheat flags, newest first, capped so the panel stays usable.
    const flags = location.antiCheat.flags;
    flagsEl.textContent = flags.length
      ? flags
          .slice(-6)
          .reverse()
          .map((flag) => `${flag.kind}: ${flag.detail}`)
          .join('\n')
      : 'none yet';
  }

  requestAnimationFrame(tick);

  console.info('[dev] dev tools active -- long-press the bottom-left corner, or press `');
}

/** Shared inline styling for the small panel buttons. */
function buttonStyle(): string {
  return [
    'padding:6px 10px',
    'border-radius:7px',
    'border:1px solid rgba(255,255,255,0.16)',
    'background:rgba(255,255,255,0.07)',
    'color:#e6edf3',
    'font:600 11px ui-monospace,monospace',
    'cursor:pointer',
  ].join(';');
}
