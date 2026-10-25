import { lerp } from "../../../utils/math";
import { SEGMENTS } from "../stem";
import type { Leaf, Stem } from "../types";
import { tone } from "./tone";

/** A tapering ribbon along the stem's joints. */
export function paintStem(ctx: CanvasRenderingContext2D, s: Stem) {
  ctx.beginPath();
  for (let side = -1; side <= 1; side += 2) {
    for (let n = 0; n <= SEGMENTS; n++) {
      const k = side < 0 ? n : SEGMENTS - n;
      const a = k === 0 ? s.angle[0] : k === SEGMENTS ? s.angle[SEGMENTS - 1] : (s.angle[k - 1] + s.angle[k]) / 2;
      const half = lerp(s.baseWidth, s.tipWidth, k / SEGMENTS) / 2;
      // (cos a, sin a) is perpendicular to the stem's direction (sin a, -cos a).
      const x = s.x[k] + side * Math.cos(a) * half;
      const y = s.y[k] + side * Math.sin(a) * half;
      if (n === 0 && side < 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = tone(s.ink, s.tone);
  ctx.fill();
}

export function paintLeaf(ctx: CanvasRenderingContext2D, s: Stem, leaf: Leaf, t: number) {
  const dir = s.angle[leaf.at] + leaf.side * leaf.spread + 0.07 * Math.sin(t * 1.9 + leaf.phase);
  const L = leaf.length;
  const W = leaf.width;
  // Leaves droop toward the ground, whichever side they grow on; long straps arch over most.
  const droop = (leaf.shape === "strap" ? 0.45 : 0.25) * Math.sin(dir) * L;
  const fat = leaf.shape === "oval" ? 1.25 : 1;
  ctx.save();
  ctx.translate(s.x[leaf.at], s.y[leaf.at]);
  ctx.rotate(dir - Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.45, -W * fat + droop * 0.25, L, droop);
  ctx.quadraticCurveTo(L * 0.5, W * fat + droop * 0.35, 0, 0);
  const g = ctx.createLinearGradient(0, 0, L, 0);
  g.addColorStop(0, tone(s.ink, s.tone));
  g.addColorStop(1, tone(s.ink, s.tone * 0.72));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
