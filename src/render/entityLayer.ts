/**
 * THE GAME DRAWING LAYER.
 * =======================
 * This is the piece the brief calls out as make-or-break for M2: game objects
 * must live in REAL geographic coordinates and stay locked to the map through
 * every zoom and pan.
 *
 * HOW IT WORKS, IN PLAIN LANGUAGE
 * MapLibre lets us register a layer that draws *inside* the map's own drawing
 * pass, using the map's own camera. That is the whole trick. We are not drawing
 * on a separate sheet of glass laid over the map and trying to keep the two in
 * step -- we are drawing into the map itself, one layer among its roads and
 * buildings. It therefore cannot drift out of alignment, because there is
 * nothing to drift relative to.
 *
 * The alternative (a second canvas floating on top) is easier to write and is
 * what most tutorials do. It also desynchronises during zoom, exactly as the
 * brief warns. We are not doing that.
 *
 * WHY THERE IS SHADER CODE BELOW
 * Drawing inside the map means talking to the graphics card directly, in its own
 * small language. The two chunks of code in quotes further down are programs
 * that run ON the graphics card, once per corner and once per pixel. They look
 * alien, but they are short, and they are why we can draw hundreds of monsters
 * for roughly the cost of drawing one.
 */

import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import type { EntityStore } from '../world/entities';

/**
 * Runs once per CORNER of each shape.
 * Its job: work out where on the screen this corner belongs.
 */
const VERTEX_SHADER = `#version 300 es
precision highp float;

// Per corner of the square: which corner is it, from (-1,-1) to (1,1).
in vec2 a_corner;

// Per entity. The graphics card reuses the four corners above for every one.
//
// NOTE THAT THIS IS AN OFFSET, NOT AN ABSOLUTE POSITION. See the long comment
// on ORIGIN_SHIFT below -- it is the difference between this working and this
// silently drawing nothing at all.
in vec2 a_offset;     // position RELATIVE to a nearby origin, in world-map units
in float a_radius;    // size, in those same world-map units
in vec4 a_colour;

// The map's own conversion from world-map position to screen position, with the
// origin shift already folded into it. This single value is what keeps
// everything welded to the map through zoom and pan.
uniform mat4 u_matrix;

out vec2 v_corner;
out vec4 v_colour;

void main() {
  vec2 localPosition = a_offset + a_corner * a_radius;
  vec4 clip = u_matrix * vec4(localPosition, 0.0, 1.0);

  // FLATTEN THE DEPTH. The map's matrix places our ground plane exactly on the
  // far clipping plane (depth comes out as precisely 1.0), which sits right on
  // the boundary of what counts as visible. Any rounding at all in the graphics
  // card tips it over and the shape is thrown away before it is ever drawn --
  // silently, with no error and a perfectly successful draw call.
  //
  // We are a flat 2D layer, so our depth carries no information anyway. Pinning
  // it to the middle of the visible range removes the problem entirely.
  gl_Position = vec4(clip.xy, 0.0, clip.w);

  v_corner = a_corner;
  v_colour = a_colour;
}`;

/**
 * Runs once per PIXEL of each shape.
 * Its job: decide the colour, and throw away pixels outside the circle.
 */
const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 v_corner;
in vec4 v_colour;
out vec4 fragColour;

void main() {
  // Distance from the middle of the square. 0 at the centre, 1 at the edge.
  float distanceFromCentre = length(v_corner);

  // Anything outside the circle is simply not drawn, which turns our square
  // into a round blob.
  if (distanceFromCentre > 1.0) discard;

  // Soften the last sliver so the edge is not jagged.
  float edgeFade = smoothstep(1.0, 0.90, distanceFromCentre);

  // Darken the outer ring. Placeholder art, but it matters more than it sounds:
  // a flat circle vanishes against a busy map, and a darker rim makes every
  // shape readable over roads, parks and water alike.
  float rim = smoothstep(0.70, 0.88, distanceFromCentre);
  vec3 shaded = mix(v_colour.rgb, v_colour.rgb * 0.45, rim);

  float alpha = v_colour.a * edgeFade;

  // The map expects colours with the transparency already multiplied in.
  fragColour = vec4(shaded * alpha, alpha);
}`;

/**
 * ORIGIN SHIFT -- why entity positions are sent as offsets.
 * =========================================================
 * This is the single subtlest thing in the renderer, and getting it wrong makes
 * every entity invisible while every other check still passes. Worth reading.
 *
 * Graphics cards work in 32-bit numbers, which carry about 7 useful digits.
 * A position on the world map is a fraction of the way across the whole Earth --
 * roughly 0.8006 for Vietnam. Spending 7 digits on that leaves almost nothing
 * for the detail we care about:
 *
 *   - the smallest difference a 32-bit number can express near 0.8
 *     works out at about 2.3 METRES on the ground, and
 *   - a 2.5-metre monster is 1.09 of those steps across.
 *
 * So `centre + corner * radius` -- the obvious way to build a square around a
 * point -- collapses to zero size, because the radius is smaller than the
 * smallest difference the number can hold. Nothing draws. No error is raised.
 * The draw call succeeds, reports the right number of shapes, and paints
 * nothing.
 *
 * THE FIX, which is what professional map and globe renderers all do:
 * do the big subtraction on the processor in 64-bit numbers, and send the
 * graphics card only the small leftovers.
 *
 *   1. pick an origin near the action (we use the middle of the screen)
 *   2. send each entity's offset FROM that origin -- a tiny number, around
 *      0.00001, where 32 bits give us nanometre precision
 *   3. fold the origin into the camera matrix, in 64-bit, before sending it
 *
 * Same result, but every number the graphics card sees is small enough to be
 * handled exactly.
 */

/** How many numbers we send per entity: offset x, offset y, radius, colour. */
const FLOATS_PER_INSTANCE = 4;

export class EntityLayer implements CustomLayerInterface {
  readonly id = 'geo-survivors-entities';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private store: EntityStore;
  private map: MapLibreMap | null = null;

  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private cornerBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private matrixLocation: WebGLUniformLocation | null = null;

  /**
   * The data we hand to the graphics card, built fresh each frame but into a
   * buffer that is allocated ONCE. This is the "never allocate in the loop" rule
   * from the brief: this array is created at startup and then only overwritten.
   */
  private instanceData: Float32Array;

  /**
   * A view of the SAME memory as `instanceData`, but seen as individual bytes.
   * Colours are four bytes, so we write them straight in here rather than trying
   * to disguise them as a number -- which would risk the browser quietly
   * rewriting certain byte patterns and corrupting the colour.
   */
  private instanceBytes: Uint8Array;

  /**
   * The camera matrix with the origin shift folded in. Computed in 64-bit for
   * accuracy, then copied down to 32-bit only at the moment we hand it over.
   */
  private matrix64 = new Float64Array(16);
  private matrix32 = new Float32Array(16);

  private lastDrawnCount = 0;

  constructor(store: EntityStore) {
    this.store = store;
    this.instanceData = new Float32Array(store.capacity * FLOATS_PER_INSTANCE);
    this.instanceBytes = new Uint8Array(this.instanceData.buffer);
  }

  /* ------------------------------------------------------------------ */
  /* Setup, once                                                         */
  /* ------------------------------------------------------------------ */

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.program = buildProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.matrixLocation = gl.getUniformLocation(this.program, 'u_matrix');

    const cornerLocation = gl.getAttribLocation(this.program, 'a_corner');
    const offsetLocation = gl.getAttribLocation(this.program, 'a_offset');
    const radiusLocation = gl.getAttribLocation(this.program, 'a_radius');
    const colourLocation = gl.getAttribLocation(this.program, 'a_colour');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // The four corners of a square, shared by every entity that will ever exist.
    this.cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(cornerLocation);
    gl.vertexAttribPointer(cornerLocation, 2, gl.FLOAT, false, 0, 0);

    // The per-entity data. Refilled every frame.
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_INSTANCE * 4; // 4 bytes per number

    gl.enableVertexAttribArray(offsetLocation);
    gl.vertexAttribPointer(offsetLocation, 2, gl.FLOAT, false, stride, 0);
    // `divisor = 1` is the instruction that means "move to the next entity after
    // each square, not after each corner". It is what turns one draw command
    // into hundreds of shapes.
    gl.vertexAttribDivisor(offsetLocation, 1);

    gl.enableVertexAttribArray(radiusLocation);
    gl.vertexAttribPointer(radiusLocation, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(radiusLocation, 1);

    gl.enableVertexAttribArray(colourLocation);
    // Read those four bytes back as four 0..1 colour channels.
    gl.vertexAttribPointer(colourLocation, 4, gl.UNSIGNED_BYTE, true, stride, 12);
    gl.vertexAttribDivisor(colourLocation, 1);

    gl.bindVertexArray(null);
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.cornerBuffer) gl.deleteBuffer(this.cornerBuffer);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
  }

  /* ------------------------------------------------------------------ */
  /* Drawing, every frame                                                */
  /* ------------------------------------------------------------------ */

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.program || !this.vao) return;

    // Put the origin in the middle of the view, so everything on screen is a
    // small offset away from it. See the ORIGIN SHIFT note above.
    const centre = this.map?.getCenter();
    const origin = centre
      ? MercatorCoordinate.fromLngLat({ lng: centre.lng, lat: centre.lat }, 0)
      : { x: 0, y: 0 };

    this.buildShiftedMatrix(options, origin.x, origin.y);

    const count = this.packInstances(origin.x, origin.y);
    this.lastDrawnCount = count;
    if (count === 0) return;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // WHICH MATRIX -- this caught me out, so it is worth spelling out.
    // MapLibre hands custom layers several matrices. `modelViewProjectionMatrix`
    // works in an internal world space, NOT the 0..1 world-map coordinates we
    // use, and feeding it ours put every entity hundreds of millions of pixels
    // off screen. `defaultProjectionData.mainMatrix` is the one documented to
    // accept plain 0..1 mercator coordinates, which is exactly what
    // MercatorCoordinate.fromLngLat gives us.
    // Hand over OUR matrix -- the map's one with the origin shift folded in --
    // not the map's raw matrix. The raw matrix expects absolute world positions;
    // we send small offsets, so the two must not be mixed.
    gl.uniformMatrix4fv(this.matrixLocation, false, this.matrix32);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    // Upload only the part we actually filled, not the whole pool.
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.instanceData.subarray(0, count * FLOATS_PER_INSTANCE)
    );

    // MapLibre has already set up transparency for us the way we want it.
    gl.enable(gl.BLEND);

    // ONE command draws every entity on screen.
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

    gl.bindVertexArray(null);
  }

  /**
   * Fold the origin shift into the camera matrix.
   *
   * In plain terms: instead of telling the graphics card "this thing is at
   * position 0.8006 across the world", we tell it "the camera is looking at
   * 0.8006, and this thing is 12 metres north-east of that". The first form
   * needs more digits than the card has; the second does not.
   *
   * Multiplying the matrix by a shift is the standard way to express that, and
   * we do it in 64-bit here so no accuracy is lost before the card sees it.
   */
  private buildShiftedMatrix(
    options: CustomRenderMethodInput,
    originX: number,
    originY: number
  ): void {
    const source = options.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>;
    const m = this.matrix64;

    for (let i = 0; i < 16; i++) m[i] = source[i];

    // The last column becomes "where the origin ends up on screen". Everything
    // else is untouched, because a shift only moves things, never rotates or
    // scales them.
    const c0 = m[0] * originX + m[4] * originY + m[12];
    const c1 = m[1] * originX + m[5] * originY + m[13];
    const c2 = m[2] * originX + m[6] * originY + m[14];
    const c3 = m[3] * originX + m[7] * originY + m[15];
    m[12] = c0;
    m[13] = c1;
    m[14] = c2;
    m[15] = c3;

    for (let i = 0; i < 16; i++) this.matrix32[i] = m[i];
  }

  /**
   * Convert every living entity from real-world coordinates into small offsets
   * from the origin, and pack them into the buffer. Allocates nothing.
   */
  private packInstances(originX: number, originY: number): number {
    const store = this.store;
    const data = this.instanceData;
    let written = 0;

    for (let id = 0; id < store.usedSlots; id++) {
      if (store.alive[id] === 0) continue;

      // Where this thing is, expressed as a fraction across the whole world map.
      const mercator = MercatorCoordinate.fromLngLat(
        { lng: store.lng[id], lat: store.lat[id] },
        0
      );

      // How big one real metre is in those same units, at this latitude.
      // This is what makes a 2-metre monster stay 2 metres across as you zoom:
      // it grows on screen exactly like the buildings around it do.
      const metreInMapUnits = mercator.meterInMercatorCoordinateUnits();

      const offset = written * FLOATS_PER_INSTANCE;

      // THE IMPORTANT SUBTRACTION. It happens here, on the processor, in 64-bit,
      // where 0.800562... minus 0.800550... keeps every digit that matters.
      // What reaches the graphics card is a number around 0.00001, which 32 bits
      // can hold far more precisely than we will ever need.
      data[offset] = mercator.x - originX;
      data[offset + 1] = mercator.y - originY;
      data[offset + 2] = store.radiusMetres[id] * metreInMapUnits;

      // Colour: four bytes written directly into the same buffer.
      const colourByteOffset = offset * 4 + 12;
      const c = id * 4;
      this.instanceBytes[colourByteOffset] = store.colour[c];
      this.instanceBytes[colourByteOffset + 1] = store.colour[c + 1];
      this.instanceBytes[colourByteOffset + 2] = store.colour[c + 2];
      this.instanceBytes[colourByteOffset + 3] = store.colour[c + 3];

      written++;
    }

    return written;
  }

  /** How many shapes went to the graphics card last frame. For the dev readout. */
  drawnLastFrame(): number {
    return this.lastDrawnCount;
  }
}

/* -------------------------------------------------------------------- */
/* Boring graphics-card plumbing                                         */
/* -------------------------------------------------------------------- */

function buildProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create a graphics program');

  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`Graphics program failed to link: ${log}`);
  }

  // The compiled pieces are baked into the program now; the originals can go.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a shader');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed to compile: ${log}`);
  }

  return shader;
}
