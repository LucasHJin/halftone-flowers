/** Shared drawing helpers for the tone image. */
import { clamp, lerp, TAU } from "../../../utils/math";
import { SEGMENTS } from "../stem";
import type { Ink, Stem } from "../types";

/** Fill style for `amount` of one ink: red is main, green dark, blue white. */
export function tone(ink: Ink, amount: number) {
  const v = Math.round(clamp(amount, 0, 1) * 255);
  return ink === 0 ? `rgb(${v},0,0)` : ink === 1 ? `rgb(0,${v},0)` : `rgb(0,0,${v})`;
}

const at = { x: 0, y: 0, a: 0 };

/** Position and direction at `f` (0 root, 1 tip) along a stem. Reuses one object. */
export function along(s: Stem, f: number) {
  const pos = clamp(f, 0, 1) * SEGMENTS;
  const k = Math.min(Math.floor(pos), SEGMENTS - 1);
  const r = pos - k;
  at.x = lerp(s.x[k], s.x[k + 1], r);
  at.y = lerp(s.y[k], s.y[k + 1], r);
  at.a = s.angle[k];
  return at;
}

/** Fills one ellipse in the current fill style. */
export function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
  ctx.fill();
}
