import type { Head, Stem } from "../../types";
import { tone } from "../tone";

export function paintBud(ctx: CanvasRenderingContext2D, s: Stem, h: Head) {
  const L = h.radius * 1.1;
  const w = h.radius * 0.55;
  // Its tip leans the way the head is turned.
  ctx.transform(1, 0, -0.4 * Math.sin(h.turn), 1, 0, 0);
  ctx.beginPath();
  ctx.moveTo(0, 0.05 * L);
  ctx.bezierCurveTo(-w, -0.1 * L, -w * 0.7, -0.75 * L, 0, -L);
  ctx.bezierCurveTo(w * 0.7, -0.75 * L, w, -0.1 * L, 0, 0.05 * L);
  ctx.fillStyle = tone(1, s.tone + 0.15);
  ctx.fill();
  // Petal colour showing through at the tip.
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -0.55 * L);
  ctx.bezierCurveTo(-w * 0.35, -0.8 * L, -w * 0.15, -0.95 * L, 0, -L);
  ctx.bezierCurveTo(w * 0.15, -0.95 * L, w * 0.35, -0.8 * L, w * 0.42, -0.55 * L);
  ctx.quadraticCurveTo(0, -0.62 * L, -w * 0.42, -0.55 * L);
  ctx.fillStyle = tone(h.ink, h.tone);
  ctx.fill();
}
