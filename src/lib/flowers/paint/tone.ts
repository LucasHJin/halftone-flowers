/** Shared drawing helpers for the tone image. */
import { clamp, lerp, TAU } from "../../../utils/math";
import { SEGMENTS } from "../stem";
import type { Ink, Stem } from "../types";

/** Each ink's place on the colour ramp, from 0 light to 1 dark. */
const RAMP: Record<Ink, number> = { 0: 0.5, 1: 1, 2: 0 };

let mask: string | null = null;
let shift = 0;

/** Fill style for `amount` of one ink: red is how much ink, green that times how far toward dark it sits. */
export function tone(ink: Ink, amount: number) {
  if (mask) return mask;
  const v = clamp(amount, 0, 1) * 255;
  return `rgb(${Math.round(v)},${Math.round(v * clamp(RAMP[ink] + shift, 0, 1))},0)`;
}

/** Runs `paint` with every ink moved `by` along the colour ramp, toward dark if positive. */
export function inShade(by: number, paint: () => void) {
  shift = by;
  try {
    paint();
  } finally {
    shift = 0;
  }
}

/** Runs `paint` with every fill and stroke in one flat colour instead of its inks, to draw a mask. */
export function inMask(colour: string, paint: () => void) {
  mask = colour;
  try {
    paint();
  } finally {
    mask = null;
  }
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
