/**
 * Turns a tone image into a halftone of round dots on a diamond lattice, each
 * dot one shade of a colour ramp.
 *
 * Scenes draw into a hidden canvas in screen coordinates: red is how much ink a
 * spot wants, green that times how far along the ramp, from light to dark, its
 * colour sits. The canvas's transform rotates and scales them into lattice
 * space, where every on-screen diamond is a square of SS × SS pixels. Each
 * diamond then averages its pixels into one tone, picks one of a few dot sizes
 * (an ordered dither chooses between the two nearest sizes), and takes the
 * nearest of a few shades.
 *
 * A second hidden canvas, the reveal, can be laid out the same way to scale
 * each dot, for animating dots in. What its colours mean is up to the caller.
 *
 * Ink can spread: an SVG filter on the canvas blurs the dots, then cuts their
 * edges back sharp, so dots close together run into each other like wet ink.
 */
import { ramp } from "../../utils/color";
import { clamp, TAU } from "../../utils/math";

/** Samples per diamond along each lattice axis. */
const SS = 2;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Radius of a circle with the area of a diamond of half-diagonal 1, so each size prints the same tone either way. */
const ROUND = Math.sqrt(2 / Math.PI);
const SVG = "http://www.w3.org/2000/svg";
let filters = 0;

/**
 * Size multiplier for the dot of diamond (i, j), centred at (x, y), from the
 * reveal canvas's average colour over it, each channel 0–255.
 */
export type DotScale = (r: number, g: number, b: number, x: number, y: number, i: number, j: number) => number;

export interface HalftoneColors {
  background: string;
  /** The ramp's light end. */
  light: string;
  /** The middle of the ramp. */
  ink: string;
  /** The ramp's dark end. */
  dark: string;
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
  /** How far ink spreads before it sets, as a share of a diamond's width; 0 keeps every dot round. Takes effect on `applyInk`. */
  spread = 0.1;
  /** Where spread ink is cut back, from 0 to 1: lower keeps more of it. Takes effect on `applyInk`. */
  threshold = 0.3;

  private ctx: CanvasRenderingContext2D;
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
  private palette: string[] = [];
  private paletteKey = "";
  private filter: InkFilter | null = null;

  constructor(private canvas: HTMLCanvasElement, public colors: HalftoneColors) {
    const ctx = canvas.getContext("2d");
    const sctx = this.scene.getContext("2d", { willReadFrequently: true });
    if (!ctx || !sctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.sctx = sctx;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    // Diamond (i, j) is centred on screen at ((i - j) * cell / 2, (i + j) * cell / 2).
    const w = this.cell;
    this.iu0 = -1;
    this.iv0 = Math.floor(-width / w) - 1;
    this.nu = Math.ceil((width + height) / w) + 2 - this.iu0;
    this.nv = Math.ceil(height / w) + 2 - this.iv0;
    this.scene.width = this.nu * SS;
    this.scene.height = this.nv * SS;
    this.applyInk();
  }

  /**
   * Puts `spread`, `threshold` and the background colour on the canvas element.
   * The dots are drawn on a transparent canvas, so the background is its CSS
   * background, or the filter's own while ink spreads.
   */
  applyInk() {
    const blur = this.spread * this.cell;
    const style = this.canvas.style;
    if (blur <= 0) {
      style.filter = "";
      style.background = this.colors.background;
      return;
    }
    const f = (this.filter ??= createInkFilter());
    // Steep enough that the cut edge is about one device px wide, so it stays smooth without blurring.
    const sharp = Math.max(1, 2.5 * blur * this.dpr);
    f.blur.setAttribute("stdDeviation", String(blur));
    f.cut.setAttribute("values", `1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${sharp} ${-sharp * this.threshold}`);
    f.paper.setAttribute("flood-color", this.colors.background);
    style.filter = `url(#${f.id})`;
    style.background = "";
  }

  destroy() {
    this.filter?.svg.remove();
    this.filter = null;
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
    // u = (x + y) / w and v = (y - x) / w, offset so cell iu0 starts at pixel 0.
    const k = SS / this.cell;
    c.setTransform(k, -k, k, k, (0.5 - this.iu0) * SS, (0.5 - this.iv0) * SS);
    return c;
  }

  /** Halftones whatever was drawn since beginScene onto the visible canvas, each dot scaled by `scale` if given. */
  present(scale?: DotScale) {
    const { ctx, cell, sizes, nu, nv, iu0, iv0 } = this;
    const data = this.sctx.getImageData(0, 0, this.scene.width, this.scene.height).data;
    const mask = scale && this.rctx ? this.rctx.getImageData(0, 0, this.scene.width, this.scene.height).data : null;
    const stride = this.scene.width * 4;
    const steps = sizes.length;
    const half = cell / 2;
    const full = 255 * SS * SS;
    const palette = this.shadesOfRamp();
    const paths = palette.map(() => new Path2D());
    const last = paths.length - 1;

    for (let cj = 0; cj < nv; cj++) {
      const j = iv0 + cj;
      for (let ci = 0; ci < nu; ci++) {
        let ink = 0;
        let shade = 0;
        for (let sy = 0; sy < SS; sy++) {
          let p = (cj * SS + sy) * stride + ci * SS * 4;
          for (let sx = 0; sx < SS; sx++, p += 4) {
            ink += data[p];
            shade += data[p + 1];
          }
        }
        if (ink === 0) continue;
        const i = iu0 + ci;
        const x = (i - j) * half;
        const y = (i + j) * half;
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
        const path = paths[Math.round(Math.min(1, shade / ink) * last)];
        r *= ROUND;
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, TAU);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paths.forEach((path, k) => {
      ctx.fillStyle = palette[k];
      ctx.fill(path);
    });
  }

  private shadesOfRamp() {
    const { light, ink, dark } = this.colors;
    const n = Math.max(1, Math.round(this.shades));
    const key = `${light} ${ink} ${dark} ${n}`;
    if (key !== this.paletteKey) {
      this.paletteKey = key;
      this.palette = ramp([light, ink, dark], n);
    }
    return this.palette;
  }
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
