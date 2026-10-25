import { lerp } from "../../../../utils/math";
import type { Head, Stem } from "../../types";
import { along, blob, tone } from "../tone";

/** Flowers all the way up the top of the stem: lupine cones, foxglove bells, lavender whorls. */
export function paintSpike(ctx: CanvasRenderingContext2D, s: Stem, h: Head) {
  const n = h.petals;
  const start = 1 - h.reach;
  for (let i = 0; i < n; i++) {
    // Lavender leaves gaps between its whorls.
    if (h.style === 2 && i % 2 === 1 && i < n - 3) continue;
    const k = i / (n - 1);
    const p = along(s, start + (1 - start) * k * 0.96);
    const size = h.radius * lerp(1, 0.4, k);
    // Open florets low down, tighter and deeper-coloured buds toward the tip.
    const amount = h.tone * lerp(0.82, 1, k);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = tone(h.ink, amount);
    if (h.style === 0) {
      for (const side of [-1, 1]) blob(ctx, side * size * 0.75, 0, size * 0.8, size * 0.6, side * 0.5);
      blob(ctx, 0, -size * 0.3, size * 0.6, size * 0.5, 0);
    } else if (h.style === 1) {
      // Bells hang mostly on one side, opening downward, with a darker mouth.
      const side = i % 3 === 2 ? -1 : 1;
      ctx.rotate(side * 1.2);
      blob(ctx, 0, size * 0.9, size * 0.55, size * 1.05, 0);
      ctx.fillStyle = tone(h.ink === 1 ? 0 : 1, 0.7);
      blob(ctx, 0, size * 1.55, size * 0.3, size * 0.2, 0);
    } else {
      for (const side of [-1, 1]) blob(ctx, side * size * 0.5, 0, size * 0.55, size * 0.45, side * 0.6);
    }
    ctx.restore();
  }
}
