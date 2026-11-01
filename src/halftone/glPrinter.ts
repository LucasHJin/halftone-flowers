/**
 * WebGL2 version of DiamondHalftone's canvas printer. Each frame uploads the
 * tone image as a texture and runs three passes:
 *
 * 1. Dots: one px per diamond picks its size (averaged ink plus ordered
 *    dither), shade and ramp, as the canvas printer does.
 * 2. Shapes: each screen px draws the dots that reach it, later shades over
 *    earlier, accent over main, antialiased.
 * 3. Ink: blur, cut sharp on alpha, lay over the background, like the canvas
 *    printer's SVG filter.
 */
import { rgbOf } from "../utils/color.js";
import { BAYER4 } from "./bayer.js";

/** Lengths in CSS px unless noted. */
export interface PrintFrame {
  /** Tone image, `samples` px a side per diamond. */
  scene: HTMLCanvasElement;
  samples: number;
  /** Size multiplier per diamond, row by row; null leaves every dot unscaled. */
  scale: Float32Array | null;
  /** Lattice index of the first diamond on each axis, and the diamond count. */
  origin: [number, number];
  count: [number, number];
  /** Diamond width; `straight` for straight rows and columns, else staggered. */
  cell: number;
  straight: boolean;
  dpr: number;
  /** Dot sizes, smallest first: each covers the area of a diamond this share of a full one wide. */
  sizes: number[];
  /** `shape` 0 round, 1 square, 2 diamond; `reach` from the centre, in half-diagonals of a same-area diamond; `curve` of a diamond's sides. */
  shape: number;
  reach: number;
  curve: number;
  /** Main and accent ramp shades, the same number of each. */
  palette: string[];
  accent: string[];
  background: string;
  /** Ink spread in device px, and the slope and offset of the cut on its alpha. */
  blur: number;
  sharp: number;
  cut: number;
}

/** Length of `uSizes` in the dots shader. */
const MAX_SIZES = 32;
/** A dot's size goes in a byte as a share of this many half-diagonals. */
const SIZE_RANGE = 2.5;
/** Furthest the blur reaches, device px each way. */
const MAX_RADIUS = 64;
/** Blur samples each way. Each sits between two px so linear filtering reads both in one fetch. */
const MAX_TAPS = MAX_RADIUS / 2 + 1;

const OPTIONS: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: "low-power",
  // Software WebGL would be slower than the canvas printer.
  failIfMajorPerformanceCaveat: true,
};

/** One triangle covering the whole target, from `gl_VertexID` alone. */
const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
`;

const DOTS = `${HEADER}
uniform sampler2D uScene;
uniform sampler2D uScale;
uniform bool uScaled;
uniform int uSamples;
uniform ivec2 uOrigin;
uniform int uSteps;
uniform float uSizes[${MAX_SIZES}];
uniform int uShades;
uniform float uLeast;
uniform int uBayer[16];

float threshold(int i, int j) {
  return (float(uBayer[(i & 3) | ((j & 3) << 2)]) + 0.5) / 16.0;
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int y = 0; y < uSamples; y++)
    for (int x = 0; x < uSamples; x++) sum += texelFetch(uScene, c * uSamples + ivec2(x, y), 0).rgb;
  sum = floor(sum * 255.0 + 0.5);
  float ink = sum.r;
  outColor = vec4(0.0);
  if (ink == 0.0) return;
  int i = uOrigin.x + c.x;
  int j = uOrigin.y + c.y;
  float level = min(1.0, ink / (255.0 * float(uSamples * uSamples))) * float(uSteps);
  int size = int(level);
  if (level - float(size) > threshold(i, j)) size++;
  if (size <= 0) return;
  float r = uSizes[clamp(size, 1, uSteps) - 1];
  if (r <= 0.0) return;
  if (uScaled) {
    r *= texelFetch(uScale, c, 0).r;
    if (r < uLeast) return;
  }
  // Bayer threshold from two diamonds over, so dots that round up in size aren't also the first to switch ramp.
  bool accented = sum.b > ink * threshold(i + 2, j + 2);
  float shade = floor(min(1.0, sum.g / ink) * float(uShades - 1) + 0.5);
  outColor = vec4(r / ${SIZE_RANGE.toFixed(1)}, shade / 255.0, accented ? 1.0 : 0.0, 1.0);
}`;

const SHAPES = `${HEADER}
uniform sampler2D uDots;
uniform sampler2D uPalette;
uniform ivec2 uOrigin;
uniform ivec2 uCount;
uniform float uCell;
uniform bool uStraight;
uniform float uDpr;
uniform float uHeight;
uniform int uShape;
uniform float uReach;
uniform float uCurve;
uniform bool uCorners;

const float SQRT2 = 1.4142135624;

/** Signed distance from a dot's edge, out from its centre by p, for a dot r half-diagonals across. */
float edge(vec2 p, float r) {
  r *= uReach;
  if (uShape == 0) return length(p) - r;
  vec2 q = abs(p);
  if (uShape == 1) {
    q -= r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }
  // Each side is a parabola from tip to tip, its axis perpendicular to the straight side.
  float w = (q.y - q.x) / SQRT2;
  if (abs(w) > r / SQRT2) return length(q - (w > 0.0 ? vec2(0.0, r) : vec2(r, 0.0)));
  float c = r * (1.0 - uCurve) * 0.5;
  float k = (r - 2.0 * c) / (SQRT2 * r * r);
  float f = (q.x + q.y) / SQRT2 - (r + 2.0 * c) / (2.0 * SQRT2) - k * w * w;
  return f / sqrt(1.0 + 4.0 * k * k * w * w);
}

void main() {
  vec2 at = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) / uDpr;
  float hw = uCell * 0.5;
  float pitch = uCell * 0.7071067812;
  vec2 uv = uStraight ? at / pitch : vec2(at.x + at.y, at.y - at.x) / uCell;
  ivec2 nearest = ivec2(floor(uv + 0.5));
  // Composites in the canvas printer's fill order: highest order so far in top, the rest in under.
  // Exact for two overlapping dots; with three, the two under top may come out swapped.
  vec4 top = vec4(0.0);
  int topOrder = -1;
  vec4 under = vec4(0.0);
  for (int dj = -1; dj <= 1; dj++) {
    for (int di = -1; di <= 1; di++) {
      if (!uCorners && di != 0 && dj != 0) continue;
      ivec2 ij = nearest + ivec2(di, dj);
      ivec2 c = ij - uOrigin;
      if (c.x < 0 || c.y < 0 || c.x >= uCount.x || c.y >= uCount.y) continue;
      vec4 cell = texelFetch(uDots, c, 0);
      if (cell.a == 0.0) continue;
      vec2 centre = uStraight ? vec2(ij) * pitch : vec2(float(ij.x - ij.y), float(ij.x + ij.y)) * hw;
      float cover = clamp(0.5 - edge(at - centre, cell.r * ${SIZE_RANGE.toFixed(1)} * hw) * uDpr, 0.0, 1.0);
      if (cover == 0.0) continue;
      int shade = int(cell.g * 255.0 + 0.5);
      int ramp = cell.b > 0.5 ? 1 : 0;
      int order = ramp * 256 + shade;
      vec4 ink = vec4(texelFetch(uPalette, ivec2(shade, ramp), 0).rgb, 1.0) * cover;
      if (order >= topOrder) {
        under = top + under * (1.0 - top.a);
        top = ink;
        topOrder = order;
      } else {
        under += ink * (1.0 - under.a);
      }
    }
  }
  outColor = top + under * (1.0 - top.a);
}`;

/** Gaussian blur along `uAxis`. Samples past the edge repeat the edge px. */
const BLUR = `${HEADER}
uniform sampler2D uInk;
uniform vec2 uAxis;
uniform int uTaps;
/** Px from the middle of each sample, and its weight, from the middle out, adding up to 1 both ways. */
uniform float uOffsets[${MAX_TAPS}];
uniform float uWeights[${MAX_TAPS}];

vec4 blurred() {
  vec2 size = vec2(textureSize(uInk, 0));
  vec2 p = gl_FragCoord.xy / size;
  vec2 along = uAxis / size;
  mediump vec4 sum = uWeights[0] * texture(uInk, p);
  for (int k = 1; k < uTaps; k++) sum += uWeights[k] * (texture(uInk, p + along * uOffsets[k]) + texture(uInk, p - along * uOffsets[k]));
  return sum;
}
`;

const SPREAD = `${BLUR}
void main() {
  outColor = blurred();
}`;

/** Second blur pass, then the cut on alpha, over the background. */
const SET = `${BLUR}
uniform float uSharp;
uniform float uCut;
uniform vec3 uBackground;

void main() {
  vec4 ink = blurred();
  float a = clamp(uSharp * ink.a + uCut, 0.0, 1.0);
  vec3 colour = ink.a > 0.0 ? ink.rgb / ink.a : vec3(0.0);
  outColor = vec4(mix(uBackground, colour, a), 1.0);
}`;

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface Resources {
  vao: WebGLVertexArrayObject;
  dots: Program;
  shapes: Program;
  spread: Program;
  set: Program;
  scene: WebGLTexture;
  scale: WebGLTexture;
  palette: WebGLTexture;
  dotTarget: Target;
  shapeTarget: Target;
  spreadTarget: Target;
}

let usable: boolean | undefined;

export class GlPrinter {
  /** Largest canvas width or height it can print, in device px. */
  readonly maxSize: number;
  private res: Resources;
  private lost = false;
  private sceneSize = "";
  private scaleSize = "";
  private paletteKey = "";
  private background: [number, number, number] = [1, 1, 1];

  /**
   * Null if hardware WebGL2 can't run these shaders; `canvas` is then still free
   * to take a 2D context. `onRestore` runs once it can print again after a context loss.
   */
  static create(canvas: HTMLCanvasElement, onRestore: () => void): GlPrinter | null {
    // Test on a spare canvas: one that has had a WebGL context can't take a 2D one.
    usable ??= tryOut();
    if (!usable) return null;
    const gl = canvas.getContext("webgl2", OPTIONS);
    return gl ? new GlPrinter(canvas, gl, onRestore) : null;
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGL2RenderingContext,
    private onRestore: () => void,
  ) {
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    this.res = this.setUp();
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  /** Frees its GPU resources but keeps the context, so a new printer can take over the canvas. */
  destroy() {
    const { gl, res } = this;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    if (this.lost) return;
    for (const p of [res.dots, res.shapes, res.spread, res.set]) gl.deleteProgram(p.program);
    for (const t of [res.dotTarget, res.shapeTarget, res.spreadTarget]) {
      gl.deleteFramebuffer(t.framebuffer);
      gl.deleteTexture(t.texture);
    }
    for (const t of [res.scene, res.scale, res.palette]) gl.deleteTexture(t);
    gl.deleteVertexArray(res.vao);
  }

  print(f: PrintFrame) {
    if (this.lost) return;
    const { gl, res } = this;
    const [nu, nv] = f.count;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    this.upload(f);
    gl.bindVertexArray(res.vao);

    // 1. Dots, one px per diamond.
    this.target(res.dotTarget, nu, nv);
    const dots = this.use(res.dots);
    this.texture(dots, "uScene", 0, res.scene);
    this.texture(dots, "uScale", 1, res.scale);
    gl.uniform1i(this.at(dots, "uScaled"), f.scale ? 1 : 0);
    gl.uniform1i(this.at(dots, "uSamples"), f.samples);
    gl.uniform2i(this.at(dots, "uOrigin"), f.origin[0], f.origin[1]);
    const steps = Math.min(f.sizes.length, MAX_SIZES);
    gl.uniform1i(this.at(dots, "uSteps"), steps);
    const sizes = new Float32Array(MAX_SIZES);
    sizes.set(f.sizes.slice(0, steps));
    gl.uniform1fv(this.at(dots, "uSizes[0]"), sizes);
    gl.uniform1i(this.at(dots, "uShades"), f.palette.length);
    gl.uniform1f(this.at(dots, "uLeast"), 0.1 / (f.cell / 2));
    gl.uniform1iv(this.at(dots, "uBayer[0]"), BAYER4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Shapes, at screen resolution.
    this.target(res.shapeTarget, width, height);
    const shapes = this.use(res.shapes);
    this.texture(shapes, "uDots", 0, res.dotTarget.texture);
    this.texture(shapes, "uPalette", 1, res.palette);
    gl.uniform2i(this.at(shapes, "uOrigin"), f.origin[0], f.origin[1]);
    gl.uniform2i(this.at(shapes, "uCount"), nu, nv);
    gl.uniform1f(this.at(shapes, "uCell"), f.cell);
    gl.uniform1i(this.at(shapes, "uStraight"), f.straight ? 1 : 0);
    gl.uniform1f(this.at(shapes, "uDpr"), f.dpr);
    gl.uniform1f(this.at(shapes, "uHeight"), height);
    gl.uniform1i(this.at(shapes, "uShape"), f.shape);
    gl.uniform1f(this.at(shapes, "uReach"), f.reach);
    gl.uniform1f(this.at(shapes, "uCurve"), f.curve);
    // A dot reaches px in its diagonal neighbours' diamonds only if it reaches over half a diamond from its centre.
    let grown = 1;
    if (f.scale) for (const v of f.scale) if (v > grown) grown = v;
    const reach = (Math.max(...f.sizes) * grown * f.reach * f.cell) / 2 + 1 / f.dpr;
    gl.uniform1i(this.at(shapes, "uCorners"), reach > f.cell / 2 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3. Ink: blur across, then down, and set on the background.
    const radius = Math.min(MAX_RADIUS, Math.ceil(f.blur * 3));
    let ink = res.shapeTarget.texture;
    if (radius > 0) {
      this.target(res.spreadTarget, width, height);
      const spread = this.use(res.spread);
      this.blur(spread, ink, [1, 0], f.blur, radius);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ink = res.spreadTarget.texture;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const set = this.use(res.set);
    this.blur(set, ink, [0, 1], f.blur, radius);
    gl.uniform1f(this.at(set, "uSharp"), f.sharp);
    gl.uniform1f(this.at(set, "uCut"), f.cut);
    gl.uniform3fv(this.at(set, "uBackground"), this.background);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private upload(f: PrintFrame) {
    const { gl, res } = this;
    const [nu, nv] = f.count;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.scene);
    const sceneSize = `${f.scene.width}x${f.scene.height}`;
    if (sceneSize !== this.sceneSize) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, f.scene);
      this.sceneSize = sceneSize;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, f.scene);
    }
    if (f.scale) {
      gl.bindTexture(gl.TEXTURE_2D, res.scale);
      const scaleSize = `${nu}x${nv}`;
      if (scaleSize !== this.scaleSize) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, nu, nv, 0, gl.RED, gl.FLOAT, f.scale);
        this.scaleSize = scaleSize;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nu, nv, gl.RED, gl.FLOAT, f.scale);
      }
    }
    const key = `${f.palette.join()} ${f.accent.join()} ${f.background}`;
    if (key !== this.paletteKey) {
      this.background = rgbOf(f.background);
      const n = f.palette.length;
      const data = new Uint8Array(n * 2 * 4);
      [...f.palette, ...f.accent].forEach((colour, k) => {
        data.set([...rgbOf(colour).map((c) => Math.round(c * 255)), 255], k * 4);
      });
      gl.bindTexture(gl.TEXTURE_2D, res.palette);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      this.paletteKey = key;
    }
  }

  /** Binds `t` for drawing, first resizing it to `width` × `height` if needed. */
  private target(t: Target, width: number, height: number) {
    const { gl } = this;
    if (t.width !== width || t.height !== height) {
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      t.width = width;
      t.height = height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
    gl.viewport(0, 0, width, height);
  }

  private blur(p: Program, ink: WebGLTexture, axis: [number, number], sigma: number, radius: number) {
    const { gl } = this;
    this.texture(p, "uInk", 0, ink);
    gl.uniform2f(this.at(p, "uAxis"), axis[0], axis[1]);
    const { offsets, weights } = gaussian(sigma, radius);
    gl.uniform1i(this.at(p, "uTaps"), offsets.length);
    gl.uniform1fv(this.at(p, "uOffsets[0]"), padded(offsets));
    gl.uniform1fv(this.at(p, "uWeights[0]"), padded(weights));
  }

  private use(p: Program) {
    this.gl.useProgram(p.program);
    return p;
  }

  private at(p: Program, name: string) {
    let at = p.uniforms.get(name);
    if (at === undefined) {
      at = this.gl.getUniformLocation(p.program, name);
      p.uniforms.set(name, at);
    }
    return at;
  }

  private texture(p: Program, name: string, unit: number, texture: WebGLTexture) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.at(p, name), unit);
  }

  private setUp(): Resources {
    const { gl } = this;
    const [dots, shapes, spread, set] = programs(gl);
    // Upload the tone image exactly as drawn: no flip, premultiply or colour conversion.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const target = (filter: number = gl.NEAREST): Target => {
      const texture = this.newTexture(filter);
      const framebuffer = gl.createFramebuffer()!;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return { texture, framebuffer, width: 1, height: 1 };
    };
    const scale = this.newTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1]));
    this.sceneSize = this.scaleSize = this.paletteKey = "";
    return {
      vao: gl.createVertexArray()!,
      dots,
      shapes,
      spread,
      set,
      scene: this.newTexture(),
      scale,
      palette: this.newTexture(),
      dotTarget: target(),
      shapeTarget: target(gl.LINEAR),
      spreadTarget: target(gl.LINEAR),
    };
  }

  private newTexture(filter: number = this.gl.NEAREST) {
    const { gl } = this;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private onLost = (e: Event) => {
    // Without this the browser never restores the context.
    e.preventDefault();
    this.lost = true;
  };

  private onRestored = () => {
    this.res = this.setUp();
    this.lost = false;
    this.onRestore();
  };
}

/**
 * Gaussian samples out to `radius` px, for both sides: one in the middle, then one between each
 * pair of px, placed so linear filtering weighs the pair as the Gaussian does.
 */
function gaussian(sigma: number, radius: number) {
  const w = Array.from({ length: radius + 2 }, (_, k) => (k === 0 ? 1 : k <= radius ? Math.exp(-(k * k) / (2 * sigma * sigma)) : 0));
  const total = w.reduce((sum, v, k) => sum + (k ? 2 * v : v), 0);
  const offsets = [0];
  const weights = [w[0] / total];
  for (let k = 1; k <= radius; k += 2) {
    const both = w[k] + w[k + 1];
    if (both <= 0) break;
    offsets.push((k * w[k] + (k + 1) * w[k + 1]) / both);
    weights.push(both / total);
  }
  return { offsets, weights };
}

function padded(values: number[]) {
  const out = new Float32Array(MAX_TAPS);
  out.set(values.slice(0, MAX_TAPS));
  return out;
}

/** Whether hardware WebGL2 compiles these shaders, tested on a spare canvas. */
function tryOut() {
  const gl = document.createElement("canvas").getContext("webgl2", OPTIONS);
  if (!gl) return false;
  try {
    programs(gl).forEach((p) => gl.deleteProgram(p.program));
    return true;
  } catch {
    return false;
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

function programs(gl: WebGL2RenderingContext): Program[] {
  return [DOTS, SHAPES, SPREAD, SET].map((source) => ({ program: link(gl, source), uniforms: new Map() }));
}

function link(gl: WebGL2RenderingContext, fragment: string) {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Halftone shader: ${gl.getShaderInfoLog(shader)}`);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Halftone shader: ${gl.getProgramInfoLog(program)}`);
  return program;
}
