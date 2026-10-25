/**
 * Turns a three-ink tone image into a diamond halftone.
 *
 * Scenes draw into a hidden canvas in screen coordinates. Its transform rotates
 * and scales them into lattice space, where every on-screen diamond is a square
 * of SS × SS pixels. Each diamond then averages its pixels into one tone, picks
 * one of a few dot sizes (an ordered dither chooses between the two nearest
 * sizes), and takes the colour of whichever ink covers more of it.
 */
import { clamp } from "../../utils/math";

/** Samples per diamond along each lattice axis. */
const SS = 2;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface HalftoneColors {
  background: string;
  /** Drawn where the scene's red channel wins. */
  ink: string;
  /** Drawn where the green channel wins. */
  dark: string;
  /** Drawn where the blue channel wins. */
  light: string;
}

/** `steps` dot widths, evenly spaced from small to nearly touching. */
export function evenSizes(steps: number) {
  const n = Math.max(1, Math.round(steps));
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0.96 : 0.2 + (0.76 * i) / (n - 1)));
}

export class DiamondHalftone {
  /** Diamond width in CSS px. Takes effect on the next resize. */
  cell = 8;
  /** Dot widths as a share of a full diamond, smallest first. */
  sizes = evenSizes(5);

  private ctx: CanvasRenderingContext2D;
  private scene = document.createElement("canvas");
  private sctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private iu0 = 0;
  private iv0 = 0;
  private nu = 0;
  private nv = 0;

  constructor(private canvas: HTMLCanvasElement, public colors: HalftoneColors) {
    const ctx = canvas.getContext("2d", { alpha: false });
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
  }

  /** Clears the hidden canvas and returns it, set up so you draw in CSS px. */
  beginScene() {
    const { sctx, cell: w } = this;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, this.scene.width, this.scene.height);
    // u = (x + y) / w and v = (y - x) / w, offset so cell iu0 starts at pixel 0.
    const k = SS / w;
    sctx.setTransform(k, -k, k, k, (0.5 - this.iu0) * SS, (0.5 - this.iv0) * SS);
    return sctx;
  }

  /** Halftones whatever was drawn since beginScene onto the visible canvas. */
  present() {
    const { ctx, cell, sizes, nu, nv, iu0, iv0 } = this;
    const data = this.sctx.getImageData(0, 0, this.scene.width, this.scene.height).data;
    const stride = this.scene.width * 4;
    const steps = sizes.length;
    const half = cell / 2;
    const full = 255 * SS * SS;
    const inkPath = new Path2D();
    const darkPath = new Path2D();
    const lightPath = new Path2D();

    for (let cj = 0; cj < nv; cj++) {
      const j = iv0 + cj;
      for (let ci = 0; ci < nu; ci++) {
        let m = 0;
        let d = 0;
        let w = 0;
        for (let sy = 0; sy < SS; sy++) {
          let p = (cj * SS + sy) * stride + ci * SS * 4;
          for (let sx = 0; sx < SS; sx++, p += 4) {
            m += data[p];
            d += data[p + 1];
            w += data[p + 2];
          }
        }
        if (m + d + w === 0) continue;
        const i = iu0 + ci;
        const x = (i - j) * half;
        const y = (i + j) * half;
        if (x < -cell || y < -cell || x > this.width + cell || y > this.height + cell) continue;

        // Where inks meet, the cell is as covered as all of them together, in the colour of the largest.
        const level = Math.min(1, (m + d + w) / full) * steps;
        let step = Math.floor(level);
        if (level - step > (BAYER4[(i & 3) | ((j & 3) << 2)] + 0.5) / 16) step++;
        if (step <= 0) continue;
        const r = half * sizes[clamp(step, 1, steps) - 1];
        const path = m >= d && m >= w ? inkPath : d >= w ? darkPath : lightPath;
        path.moveTo(x, y - r);
        path.lineTo(x + r, y);
        path.lineTo(x, y + r);
        path.lineTo(x - r, y);
        path.closePath();
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.colors.ink;
    ctx.fill(inkPath);
    ctx.fillStyle = this.colors.dark;
    ctx.fill(darkPath);
    ctx.fillStyle = this.colors.light;
    ctx.fill(lightPath);
  }
}
