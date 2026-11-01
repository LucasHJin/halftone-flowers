/**
 * Turns a tone image into a halftone of dots, each dot one shade of a colour
 * ramp. Dots sit on a diamond lattice, in staggered rows, or on a straight
 * grid of rows and columns. They're round, square, or diamonds with their
 * sides curved in.
 *
 * Scenes draw into a hidden canvas in screen coordinates: red is how much ink a
 * spot wants, green that times how far along the ramp, from light to dark, its
 * colour sits. The canvas's transform turns and scales them into lattice
 * space, where every cell of the lattice is a square of SS × SS pixels. Each
 * cell then averages its pixels into one tone, picks one of a few dot sizes
 * (an ordered dither chooses between the two nearest sizes), and takes the
 * nearest of a few shades. Where blue marks a diamond's ink, it takes a shade
 * of a second ramp, `accent`, instead; where it marks only part of it, the
 * ordered dither picks which, so a part-marked stretch prints a mix of the two
 * ramps' dots in proportion.
 *
 * A second hidden canvas, the reveal, can be laid out the same way to scale
 * each dot, for animating dots in. What its colours mean is up to the caller.
 *
 * Ink can spread: the dots are blurred, then their edges cut back sharp, so
 * dots close together run into each other like wet ink.
 *
 * Where WebGL2 runs on the GPU, the dots are printed there (see GlPrinter),
 * and the tone image goes straight up to it. Elsewhere they're worked out on
 * the CPU and filled on a 2D canvas, with an SVG filter for the spread.
 */
import { ramp } from "../utils/color.js";
import { clamp, TAU } from "../utils/math.js";
import { BAYER4 } from "./bayer.js";
import { GlPrinter } from "./glPrinter.js";

/** Samples per diamond along each lattice axis. */
const SS = 2;
/** Radius of a circle with the area of a diamond of half-diagonal 1, so each size prints the same tone whatever the shape. */
const ROUND = Math.sqrt(2 / Math.PI);
/** Half the side of a square with the area of a diamond of half-diagonal 1. */
const SQUARE = Math.SQRT1_2;
/** How far each dot shape's ink spreads, as a share of `spread`: diamonds half as far, so their points survive, and squares not at all, as any spread rounds their corners. */
const SPREAD: Record<DotShape, number> = { round: 1, diamond: 0.5, square: 0 };
const SVG = "http://www.w3.org/2000/svg";
let filters = 0;

/** Staggered rows, each half a step along from the next, on a lattice of diamonds turned 45° like a print screen; or straight rows and columns. */
export type Grid = "diagonal" | "straight";

/** Round, a square with level sides, or a diamond pointing up, down and to the sides with its sides curved in. */
export type DotShape = "round" | "square" | "diamond";

/**
 * Size multiplier for the dot of diamond (i, j), centred at (x, y), from the
 * reveal canvas's average colour over it, each channel 0–255.
 */
export type DotScale = (r: number, g: number, b: number, x: number, y: number, i: number, j: number) => number;

export interface HalftoneRamp {
  /** The ramp's light end. */
  light: string;
  /** The middle of the ramp. */
  ink: string;
  /** The ramp's dark end. */
  dark: string;
}

export interface HalftoneColors extends HalftoneRamp {
  background: string;
}

/** `steps` dot sizes, evenly spaced from small to just overlapping their neighbours. */
export function evenSizes(steps: number) {
  const n = Math.max(1, Math.round(steps));
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0.96 : 0.2 + (0.76 * i) / (n - 1)));
}

export class DiamondHalftone {
  /** Diamond width in CSS px. Takes effect on the next resize. */
  cell = 8;
  /** Dot sizes, smallest first: each dot covers as much as a diamond this share of a full one wide. */
  sizes = evenSizes(5);
  /** How many shades the ramp from `light` through `ink` to `dark` is split into. Odd keeps `ink` itself as one. */
  shades = 9;
  /**
   * How far ink spreads before it sets, as a share of a diamond's width; 0
   * keeps every dot its own shape. Diamond dots spread half as far, so their
   * points and curved sides survive, and square dots not at all, so they keep
   * their corners. Takes effect on `applyInk`.
   */
  spread = 0.1;
  /** Where spread ink is cut back, from 0 to 1: lower keeps more of it. Takes effect on `applyInk`. */
  threshold = 0.3;
  /** The ramp for ink the scene marks in blue. Without one, it prints in the main ramp. */
  accent: HalftoneRamp | null = null;
  /** Takes effect on `present`, and on `applyInk` for how far it spreads. */
  dot: DotShape = "round";
  /** How far a diamond dot's sides curve in, from 0 straight to 1 a four-pointed star. */
  curve = 0.75;
  /** Where the dots sit, with as many to an area either way. Takes effect on the next resize. */
  grid: Grid = "diagonal";

  /** The GPU printer, or else the visible canvas's 2D context, for printing on the CPU. */
  private printer: GlPrinter | null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scene = document.createElement("canvas");
  private sctx: CanvasRenderingContext2D;
  private reveal: HTMLCanvasElement | null = null;
  private rctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private iu0 = 0;
  private iv0 = 0;
  private nu = 0;
  private nv = 0;
  private palettes = new Map<string, string[]>();
  private filter: InkFilter | null = null;
  private scales: Float32Array | null = null;

  constructor(private canvas: HTMLCanvasElement, public colors: HalftoneColors) {
    // Once it can print again after losing the GPU, the scene from the last frame is still there to print.
    this.printer = GlPrinter.create(canvas, () => this.present());
    if (!this.printer) {
      this.ctx = canvas.getContext("2d");
      if (!this.ctx) throw new Error("2D canvas unavailable");
    }
    // Read back on the CPU only for the CPU printer; for the GPU one it stays on the GPU.
    const sctx = this.scene.getContext("2d", { willReadFrequently: !this.printer });
    if (!sctx) throw new Error("2D canvas unavailable");
    this.sctx = sctx;
  }

  resize(width: number, height: number, dpr: number) {
    if (this.printer) dpr = Math.min(dpr, this.printer.maxSize / width, this.printer.maxSize / height);
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    if (this.grid === "straight") {
      // Cell (i, j) is centred on screen at (i, j) times the pitch.
      const p = this.pitch;
      this.iu0 = -1;
      this.iv0 = -1;
      this.nu = Math.ceil(width / p) + 3;
      this.nv = Math.ceil(height / p) + 3;
    } else {
      // Diamond (i, j) is centred on screen at ((i - j) * cell / 2, (i + j) * cell / 2).
      const w = this.cell;
      this.iu0 = -1;
      this.iv0 = Math.floor(-width / w) - 1;
      this.nu = Math.ceil((width + height) / w) + 2 - this.iu0;
      this.nv = Math.ceil(height / w) + 2 - this.iv0;
    }
    this.scene.width = this.nu * SS;
    this.scene.height = this.nv * SS;
    this.applyInk();
  }

  /**
   * Puts `spread`, `threshold` and the background colour on the canvas element.
   * The dots are drawn on a transparent canvas, and the filter lays them over
   * the background. With no spread it passes them through uncut.
   */
  applyInk() {
    // The GPU printer spreads the ink itself, as it prints.
    if (this.printer) return;
    const { blur, sharp, cut } = this.ink();
    const f = (this.filter ??= createInkFilter());
    f.blur.setAttribute("stdDeviation", String(blur));
    f.cut.setAttribute("values", `1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${sharp} ${cut}`);
    f.paper.setAttribute("flood-color", this.colors.background);
    // Kept on with no spread, and the canvas never gets a CSS background: in Chrome, once the canvas has had an opaque background, the filter no longer cuts and the dots print blurred.
    this.canvas.style.filter = `url(#${f.id})`;
  }

  destroy() {
    this.printer?.destroy();
    this.filter?.svg.remove();
    this.filter = null;
  }

  /** How far the ink spreads, in CSS px, and the slope and offset of the cut on its alpha. */
  private ink() {
    const blur = Math.max(0, this.spread * this.cell * SPREAD[this.dot]);
    // Steep enough that the cut edge is about one device px wide, so it stays smooth without blurring.
    const sharp = blur > 0 ? Math.max(1, 2.5 * blur * this.dpr) : 1;
    const cut = blur > 0 ? -sharp * this.threshold : 0;
    return { blur, sharp, cut };
  }

  /** Clears the hidden canvas and returns it, set up so you draw in CSS px. */
  beginScene() {
    return this.begin(this.sctx);
  }

  /** Clears the reveal canvas and returns it, laid out like the scene. Only read when `present` is given a scale. */
  beginReveal() {
    if (!this.reveal) {
      this.reveal = document.createElement("canvas");
      this.rctx = this.reveal.getContext("2d", { willReadFrequently: true });
      if (!this.rctx) throw new Error("2D canvas unavailable");
    }
    if (this.reveal.width !== this.scene.width || this.reveal.height !== this.scene.height) {
      this.reveal.width = this.scene.width;
      this.reveal.height = this.scene.height;
    }
    return this.begin(this.rctx!);
  }

  private begin(c: CanvasRenderingContext2D) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#000";
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    if (this.grid === "straight") {
      // u = x / p and v = y / p, offset so cell iu0 starts at pixel 0.
      const k = SS / this.pitch;
      c.setTransform(k, 0, 0, k, (0.5 - this.iu0) * SS, (0.5 - this.iv0) * SS);
    } else {
      // u = (x + y) / w and v = (y - x) / w, offset so cell iu0 starts at pixel 0.
      const k = SS / this.cell;
      c.setTransform(k, -k, k, k, (0.5 - this.iu0) * SS, (0.5 - this.iv0) * SS);
    }
    return c;
  }

  /** Spacing of the straight grid's rows and columns: each cell has a diamond's area. */
  private get pitch() {
    return this.cell * Math.SQRT1_2;
  }

  /** Halftones whatever was drawn since beginScene onto the visible canvas, each dot scaled by `scale` if given. */
  present(scale?: DotScale) {
    if (this.printer) this.printOnGpu(this.printer, scale);
    else this.printOnCanvas(this.ctx!, scale);
  }

  private printOnGpu(printer: GlPrinter, scale?: DotScale) {
    const { blur, sharp, cut } = this.ink();
    printer.print({
      scene: this.scene,
      samples: SS,
      scale: scale && this.rctx ? this.scaleEach(scale) : null,
      origin: [this.iu0, this.iv0],
      count: [this.nu, this.nv],
      cell: this.cell,
      straight: this.grid === "straight",
      dpr: this.dpr,
      sizes: this.sizes,
      shape: SHAPES.indexOf(this.dot),
      reach: reach(this.dot, clamp(this.curve, 0, 1)),
      curve: clamp(this.curve, 0, 1),
      palette: this.shadesOf(this.colors),
      accent: this.shadesOf(this.accent ?? this.colors),
      background: this.colors.background,
      blur: blur * this.dpr,
      sharp,
      cut,
    });
  }

  /** `scale` for every diamond, row by row, from the reveal canvas's average colour over it. */
  private scaleEach(scale: DotScale) {
    const { nu, nv, iu0, iv0 } = this;
    const mask = this.rctx!.getImageData(0, 0, this.scene.width, this.scene.height).data;
    if (this.scales?.length !== nu * nv) this.scales = new Float32Array(nu * nv);
    const out = this.scales;
    const stride = this.scene.width * 4;
    const n = SS * SS;
    for (let cj = 0; cj < nv; cj++) {
      const j = iv0 + cj;
      for (let ci = 0; ci < nu; ci++) {
        let mr = 0;
        let mg = 0;
        let mb = 0;
        for (let sy = 0; sy < SS; sy++) {
          let p = (cj * SS + sy) * stride + ci * SS * 4;
          for (let sx = 0; sx < SS; sx++, p += 4) {
            mr += mask[p];
            mg += mask[p + 1];
            mb += mask[p + 2];
          }
        }
        const [x, y] = this.centre(iu0 + ci, j);
        out[cj * nu + ci] = scale(mr / n, mg / n, mb / n, x, y, iu0 + ci, j);
      }
    }
    return out;
  }

  /** Where diamond (i, j)'s dot is centred on screen. */
  private centre(i: number, j: number): [number, number] {
    if (this.grid === "straight") return [i * this.pitch, j * this.pitch];
    return [((i - j) * this.cell) / 2, ((i + j) * this.cell) / 2];
  }

  private printOnCanvas(ctx: CanvasRenderingContext2D, scale?: DotScale) {
    const { cell, sizes, nu, nv, iu0, iv0 } = this;
    const data = this.sctx.getImageData(0, 0, this.scene.width, this.scene.height).data;
    const mask = scale && this.rctx ? this.rctx.getImageData(0, 0, this.scene.width, this.scene.height).data : null;
    const stride = this.scene.width * 4;
    const steps = sizes.length;
    const half = cell / 2;
    const full = 255 * SS * SS;
    const palette = this.shadesOf(this.colors);
    const accent = this.shadesOf(this.accent ?? this.colors);
    const paths = palette.map(() => new Path2D());
    const accentPaths = accent.map(() => new Path2D());
    const last = paths.length - 1;
    const dot = this.dot;
    const curve = clamp(this.curve, 0, 1);
    const k = reach(dot, curve);

    for (let cj = 0; cj < nv; cj++) {
      const j = iv0 + cj;
      for (let ci = 0; ci < nu; ci++) {
        let ink = 0;
        let shade = 0;
        let marked = 0;
        for (let sy = 0; sy < SS; sy++) {
          let p = (cj * SS + sy) * stride + ci * SS * 4;
          for (let sx = 0; sx < SS; sx++, p += 4) {
            ink += data[p];
            shade += data[p + 1];
            marked += data[p + 2];
          }
        }
        if (ink === 0) continue;
        const i = iu0 + ci;
        const [x, y] = this.centre(i, j);
        if (x < -cell || y < -cell || x > this.width + cell || y > this.height + cell) continue;

        // Where shapes meet, the cell is as covered as all of them together, in their average shade.
        const level = Math.min(1, ink / full) * steps;
        let step = Math.floor(level);
        if (level - step > (BAYER4[(i & 3) | ((j & 3) << 2)] + 0.5) / 16) step++;
        if (step <= 0) continue;
        let r = half * sizes[clamp(step, 1, steps) - 1];
        if (mask) {
          let mr = 0;
          let mg = 0;
          let mb = 0;
          for (let sy = 0; sy < SS; sy++) {
            let p = (cj * SS + sy) * stride + ci * SS * 4;
            for (let sx = 0; sx < SS; sx++, p += 4) {
              mr += mask[p];
              mg += mask[p + 1];
              mb += mask[p + 2];
            }
          }
          const n = SS * SS;
          r *= scale!(mr / n, mg / n, mb / n, x, y, i, j);
          if (r < 0.1) continue;
        }
        // Thresholds two cells over from the size's, so the dots that round up in size aren't the first to change ramp.
        const accented = marked > (ink * (BAYER4[((i + 2) & 3) | (((j + 2) & 3) << 2)] + 0.5)) / 16;
        const path = (accented ? accentPaths : paths)[Math.round(Math.min(1, shade / ink) * last)];
        r *= k;
        if (dot === "round") {
          path.moveTo(x + r, y);
          path.arc(x, y, r, 0, TAU);
        } else if (dot === "square") {
          path.rect(x - r, y - r, r * 2, r * 2);
        } else {
          const c = (r * (1 - curve)) / 2;
          path.moveTo(x + r, y);
          path.quadraticCurveTo(x + c, y + c, x, y + r);
          path.quadraticCurveTo(x - c, y + c, x - r, y);
          path.quadraticCurveTo(x - c, y - c, x, y - r);
          path.quadraticCurveTo(x + c, y - c, x + r, y);
        }
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paths.forEach((path, k) => {
      ctx.fillStyle = palette[k];
      ctx.fill(path);
    });
    accentPaths.forEach((path, k) => {
      ctx.fillStyle = accent[k];
      ctx.fill(path);
    });
  }

  private shadesOf({ light, ink, dark }: HalftoneRamp) {
    const n = Math.max(1, Math.round(this.shades));
    const key = `${light} ${ink} ${dark} ${n}`;
    let shades = this.palettes.get(key);
    if (!shades) {
      // Only the main ramp and the accent are in use at once, so drop what's left from earlier colours.
      if (this.palettes.size > 4) this.palettes.clear();
      shades = ramp([light, ink, dark], n);
      this.palettes.set(key, shades);
    }
    return shades;
  }
}

const SHAPES: DotShape[] = ["round", "square", "diamond"];

/** How far a dot of shape `dot` reaches from its centre, as a share of the half-diagonal of a diamond with the same area. */
function reach(dot: DotShape, curve: number) {
  if (dot === "round") return ROUND;
  if (dot === "square") return SQUARE;
  // Each curved side cuts 2/3 of the triangle under its control point from a plain diamond; the tips reach further to make up for it.
  return 1 / Math.sqrt(1 - (2 * curve) / 3);
}

interface InkFilter {
  id: string;
  svg: SVGSVGElement;
  blur: Element;
  cut: Element;
  paper: Element;
}

/** Blur, then a steep cut on alpha, laid over the background. The region is the element's own box, so the background stays inside it. */
function createInkFilter(): InkFilter {
  const id = `halftone-ink-${++filters}`;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceGraphic" />
    <feColorMatrix type="matrix" result="ink" />
    <feFlood result="paper" />
    <feMerge><feMergeNode in="paper" /><feMergeNode in="ink" /></feMerge>
  </filter>`;
  document.body.append(svg);
  return {
    id,
    svg,
    blur: svg.querySelector("feGaussianBlur")!,
    cut: svg.querySelector("feColorMatrix")!,
    paper: svg.querySelector("feFlood")!,
  };
}
