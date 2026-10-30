/** Shared drawing helpers for the tone image. */
import { clamp, createRandom, lerp, TAU } from "../../../utils/math";
import type { ShadeSettings } from "../settings";
import { SEGMENTS } from "../stem";
import type { Ink, Plant, Stem } from "../types";

/** Each ink's place on the colour ramp, from 0 light to 1 dark. */
const RAMP: Record<Ink, number> = { 0: 0.5, 1: 1, 2: 0 };

let mask: string | null = null;
let shift = 0;
let lit = false;
let accent = false;

/**
 * Fill style for `amount` of one ink, moved `by` along the ramp toward dark:
 * red is how much ink, green that times how far toward dark it sits, and blue
 * as much as red where it prints in the accent ramp.
 */
export function tone(ink: Ink, amount: number, by = 0) {
  if (mask) return mask;
  const v = clamp(amount, 0, 1) * 255;
  let at = clamp(RAMP[ink] + shift, 0, 1);
  if (lit) at = clamp(at, light, 1 - light);
  return `rgb(${Math.round(v)},${Math.round(v * clamp(at + by, 0, 1))},${accent ? Math.round(v) : 0})`;
}

/** Runs `paint` with every ink printing in the halftone's accent ramp. */
export function inAccent(paint: () => void) {
  accent = true;
  try {
    paint();
  } finally {
    accent = false;
  }
}

/** How far along the ramp a plant prints from the rest: lighter toward the back, plus a nudge of its own that holds steady from frame to frame. */
export function plantShade(plant: Plant, shade: ShadeSettings) {
  return shade.depth * (plant.depth - 1) + shade.jitter * (2 * createRandom(plant.stems[0].id)() - 1);
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

/** Toward the light on screen: the upper left. */
const SUN = { x: -0.6, y: -0.8 };
/** Toward the light in the frame heads are being drawn in. */
const sun = { ...SUN };
/** Half the ramp distance between a head's lit and shaded sides. */
let light = 0;

/**
 * Runs `paint` with inks kept at least half the light's range in from either
 * end of the ramp, so a head in the darkest or palest ink still shades both
 * lighter and darker.
 */
export function inLight(paint: () => void) {
  lit = true;
  try {
    paint();
  } finally {
    lit = false;
  }
}

/** Sets how far along the ramp the side of a head facing the light prints from the side facing away. */
export function setLight(strength: number) {
  light = strength / 2;
}

/** Points the light into a frame rotated `angle` radians from the screen, for the head about to be drawn in it. */
export function aimLight(angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  sun.x = c * SUN.x + s * SUN.y;
  sun.y = -s * SUN.x + c * SUN.y;
}

/**
 * The light's direction in a frame further transformed by
 * `ctx.transform(a, b, c, d, …)`, so a gradient drawn along it still runs
 * toward the light on screen.
 */
export function lightThrough(a: number, b: number, c: number, d: number): [number, number] {
  const det = a * d - b * c || 1;
  const x = (d * sun.x - c * sun.y) / det;
  const y = (a * sun.y - b * sun.x) / det;
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

/**
 * `by` for a surface whose outward normal is (x, y, z) in the head's frame:
 * lighter facing the light, darker facing away, unchanged facing the viewer.
 */
export function litBy(x: number, y: number, z = 0) {
  return (-light * (x * sun.x + y * sun.y)) / (Math.hypot(x, y, z) || 1);
}

/** Half the ramp distance between lit and shaded sides, for shadows deep in a flower. */
export function lightStrength() {
  return light;
}

/** Fill for a round boss of radius `r` at (x, y), shaded like a dome: brightest a little toward the light, darkest round the far edge. */
export function dome(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: Ink, amount: number, [lx, ly] = [sun.x, sun.y]) {
  const g = ctx.createRadialGradient(x + lx * r * 0.45, y + ly * r * 0.45, 0, x, y, r);
  g.addColorStop(0, tone(ink, amount, -light));
  g.addColorStop(1, tone(ink, amount, light));
  return g;
}

/**
 * Fill moved `by` along the ramp and shaded straight across a shape reaching
 * `r` px from (x, y): lighter toward the light. A hollow is lit on its far
 * side, so pass the light reversed.
 */
export function acrossLight(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: Ink, amount: number, [lx, ly] = [sun.x, sun.y], by = 0) {
  const g = ctx.createLinearGradient(x + lx * r, y + ly * r, x - lx * r, y - ly * r);
  g.addColorStop(0, tone(ink, amount, by - light));
  g.addColorStop(1, tone(ink, amount, by + light));
  return g;
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
