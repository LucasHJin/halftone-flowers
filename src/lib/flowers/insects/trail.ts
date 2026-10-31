/**
 * The faint line an insect leaves behind it, fading from its newest end. Each
 * point keeps the depth the insect was at, so where it flew behind a plant,
 * its trail stays behind it too.
 */
import type { TrailSettings } from "../settings";
import { inAccent, inShade, tone } from "../paint/tone";
import type { Insect } from "./insect";

export interface TrailPoint {
  x: number;
  y: number;
  z: number;
  /** Garden time it was laid down, seconds. */
  t: number;
}

export interface Trail {
  /** Oldest first. */
  points: TrailPoint[];
  /** The insect laying it, or null once it has gone and the trail is only fading. */
  owner: Insect | null;
}

/** Px an insect moves before its trail gets another point. */
const SPACING = 2;

/** Adds the point (x, y) at depth z, if it's far enough from the last one. */
export function extend(trail: Trail, x: number, y: number, z: number, t: number) {
  const last = trail.points[trail.points.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) < SPACING) return;
  trail.points.push({ x, y, z, t });
}

/** Drops points older than `fade` seconds. */
export function expire(trail: Trail, now: number, fade: number) {
  const points = trail.points;
  let n = 0;
  while (n < points.length && now - points[n].t >= fade) n++;
  if (n) points.splice(0, n);
}

/** Paints the segment ending at point `i`, fading and narrowing as it ages. */
export function paintSegment(ctx: CanvasRenderingContext2D, trail: Trail, i: number, now: number, settings: TrailSettings, depthShade: number) {
  const a = trail.points[i - 1];
  const b = trail.points[i];
  strokeSegment(ctx, a.x, a.y, b.x, b.y, 1 - (now - b.t) / settings.fade, settings, depthShade * (b.z - 1));
}

/**
 * Strokes one piece of a trail from (ax, ay) to (bx, by), `fresh` from 1 new
 * to 0 gone: as strong and wide as the settings say when new, fainter and
 * narrower as it fades, and moved `shade` along the ramp. It's laid over
 * what's below, so a fading trail thins out rather than cutting into the
 * plants it crosses.
 */
export function strokeSegment(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, fresh: number, settings: TrailSettings, shade = 0) {
  if (fresh <= 0) return;
  ctx.globalAlpha = settings.strength * Math.min(1, fresh);
  ctx.lineWidth = settings.width * (0.6 + 0.4 * Math.min(1, fresh));
  ctx.lineCap = "butt";
  inAccent(() => inShade(shade, () => (ctx.strokeStyle = tone(0, 1))));
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
