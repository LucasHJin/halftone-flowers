import { lerp } from "../../../../utils/math";
import type { Head, Stem } from "../../types";
import { along, tone } from "../tone";

/** Steps up a plume between its pairs of hairs, so it has one more pair than this. */
export const HAIR_STEPS = 24;

/** Feathery grass plumes: fine hairs swept up and back along the top of the stem. */
export function paintPlume(ctx: CanvasRenderingContext2D, s: Stem, h: Head, t: number) {
  const n = HAIR_STEPS;
  const start = 1 - h.reach;
  ctx.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = pass; i <= n; i += 2) {
      if (h.lost.has(i)) continue;
      const k = i / n;
      const p = along(s, start + (1 - start) * k);
      const len = h.radius * lerp(1, 0.35, k) * h.jitter[0] * (0.8 + 0.4 * ((i * 7) % 5) / 4);
      for (const side of [-1, 1]) {
        const a = p.a + side * lerp(0.5, 0.2, k) + 0.25 + 0.08 * Math.sin(t * 2.2 + i + s.id);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.sin(a) * len, p.y - Math.cos(a) * len);
      }
    }
    ctx.lineWidth = Math.max(1.2, h.radius * 0.09);
    ctx.strokeStyle = tone(h.ink, h.tone * (pass ? 0.85 : 0.6));
    ctx.stroke();
  }
}
