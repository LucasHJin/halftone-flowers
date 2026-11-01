/**
 * How much of a spot plants nearer than some depth hide, read off a small map
 * of the bed with each plant painted flat in a red that deepens with its
 * depth, so wherever plants overlap, the nearest one shows.
 */
import { clamp } from "../../utils/math.js";
import type { Garden } from "../garden.js";
import { paintSilhouettes } from "../paint/index.js";

/** Map px to a screen px. */
const SCALE = 1 / 3;

/** The red a plant `depth` back is painted on the map: 1 at the back to 255 at the front, leaving 0 for bare ground. */
function level(depth: number) {
  return 1 + Math.round(clamp(depth, 0, 1) * 254);
}

export class Cover {
  private ctx: CanvasRenderingContext2D | null = null;
  private data = new Uint8ClampedArray(0);
  private width = 0;
  private height = 0;

  /** Paints the map from the bed as it's posed now. */
  paint(garden: Garden) {
    if (!this.ctx) {
      this.ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!this.ctx) throw new Error("2D canvas unavailable");
    }
    const ctx = this.ctx;
    const w = Math.max(1, Math.ceil(garden.width * SCALE));
    const h = Math.max(1, Math.ceil(garden.height * SCALE));
    if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
      ctx.canvas.width = w;
      ctx.canvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    paintSilhouettes(ctx, garden, (plant) => `rgb(${level(plant.depth)},0,0)`);
    this.data = ctx.getImageData(0, 0, w, h).data;
    this.width = w;
    this.height = h;
  }

  /** Whether a plant `depth` back is the nearest at (x, y) as last painted, so it's what shows there. */
  shows(x: number, y: number, depth: number) {
    const i = Math.floor(x * SCALE);
    const j = Math.floor(y * SCALE);
    return i >= 0 && j >= 0 && i < this.width && j < this.height && this.data[(j * this.width + i) * 4] === level(depth);
  }

  /** The share of the disc of radius `r` px about (x, y) that plants nearer than `depth` hide, as last painted. Off the map counts as clear. */
  hidden(x: number, y: number, r: number, depth: number) {
    const near = level(depth);
    const cx = x * SCALE;
    const cy = y * SCALE;
    const cr = Math.max(1, r * SCALE);
    let all = 0;
    let hid = 0;
    for (let j = Math.floor(cy - cr); j <= cy + cr; j++) {
      for (let i = Math.floor(cx - cr); i <= cx + cr; i++) {
        if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 > cr * cr) continue;
        all++;
        if (i >= 0 && j >= 0 && i < this.width && j < this.height && this.data[(j * this.width + i) * 4] > near) hid++;
      }
    }
    return all ? hid / all : 0;
  }
}
