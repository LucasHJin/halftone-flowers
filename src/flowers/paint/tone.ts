import { clamp, createRandom, lerp, TAU } from "../../utils/math.js";
import type { ShadeSettings } from "../settings.js";
import { SEGMENTS } from "../stem.js";
import type { Ink, Plant, Stem } from "../types.js";

/** Each ink's place on the colour ramp, from 0 light to 1 dark. */
const RAMP: Record<Ink, number> = { 0: 0.5, 1: 1, 2: 0 };

let mask: string | null = null;
let shift = 0;
let lit = false;
let accent = false;

/**
 * Fill for `amount` of `ink`, moved `by` along the ramp toward dark. Red: ink
 * amount. Green: red × ramp place. Blue: red in the accent ramp, else 0.
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

/** Ramp shift for `plant`, so overlapping plants differ: lighter toward the back, plus a nudge seeded by its id. */
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

/** Runs `paint` with `tone` returning flat `colour`, to draw a mask. */
export function inMask(colour: string, paint: () => void) {
  mask = colour;
  try {
    paint();
  } finally {
    mask = null;
  }
}

/** Unit vector toward the light on screen. */
const SUN = { x: -0.6, y: -0.8 };
/** `SUN` in the current head's frame, set by `aimLight`. */
const sun = { ...SUN };
/** Half the ramp distance between a head's lit and shaded sides. */
let light = 0;

/** Runs `paint` with inks kept `light` in from both ramp ends, so the darkest and palest heads still shade both ways. */
export function inLight(paint: () => void) {
  lit = true;
  try {
    paint();
  } finally {
    lit = false;
  }
}

/** Sets the ramp distance between a head's lit and shaded sides. */
export function setLight(strength: number) {
  light = strength / 2;
}

/** Rotates `sun` into a frame rotated `angle` radians from the screen, for the next head. */
export function aimLight(angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  sun.x = c * SUN.x + s * SUN.y;
  sun.y = -s * SUN.x + c * SUN.y;
}

/** `sun` in a frame further transformed by `ctx.transform(a, b, c, d, …)`, so a gradient along it still runs toward the light on screen. */
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

/** Half the ramp distance between lit and shaded sides. */
export function lightStrength() {
  return light;
}

/** Dome-shaded fill for a round boss of radius `r` at (x, y): brightest a little toward the light, darkest all round the rim. */
export function dome(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: Ink, amount: number, [lx, ly] = [sun.x, sun.y]) {
  const g = ctx.createRadialGradient(x + lx * r * 0.45, y + ly * r * 0.45, 0, x, y, r);
  g.addColorStop(0, tone(ink, amount, -light));
  g.addColorStop(1, tone(ink, amount, light));
  return g;
}

/**
 * Linear fill across a shape reaching `r` px from (x, y), lighter toward the light,
 * moved `by` along the ramp. A hollow is lit on its far side: pass the light reversed.
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

export function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
  ctx.fill();
}
