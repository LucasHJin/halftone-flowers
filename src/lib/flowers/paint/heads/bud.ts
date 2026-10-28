import type { Head, Stem } from "../../types";
import { acrossLight, lightThrough } from "../tone";

export function paintBud(ctx: CanvasRenderingContext2D, s: Stem, h: Head) {
  const L = h.radius * 1.1;
  const w = h.radius * 0.55;
  // Its tip leans the way the head is turned.
  const skew = -0.4 * Math.sin(h.turn);
  ctx.transform(1, 0, skew, 1, 0, 0);
  const sun = lightThrough(1, 0, skew, 1);
  ctx.beginPath();
  ctx.moveTo(0, 0.05 * L);
  ctx.bezierCurveTo(-w, -0.1 * L, -w * 0.7, -0.75 * L, 0, -L);
  ctx.bezierCurveTo(w * 0.7, -0.75 * L, w, -0.1 * L, 0, 0.05 * L);
  ctx.fillStyle = acrossLight(ctx, 0, -0.45 * L, w, 1, s.tone + 0.15, sun);
  ctx.fill();
  // Petal colour showing through at the tip.
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -0.55 * L);
  ctx.bezierCurveTo(-w * 0.35, -0.8 * L, -w * 0.15, -0.95 * L, 0, -L);
  ctx.bezierCurveTo(w * 0.15, -0.95 * L, w * 0.35, -0.8 * L, w * 0.42, -0.55 * L);
  ctx.quadraticCurveTo(0, -0.62 * L, -w * 0.42, -0.55 * L);
  ctx.fillStyle = acrossLight(ctx, 0, -0.8 * L, w * 0.42, h.ink, h.tone, sun);
  ctx.fill();
}
