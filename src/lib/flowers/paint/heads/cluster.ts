import { TAU } from "../../../../utils/math";
import type { Head, Stem } from "../../types";
import { litBy, tone } from "../tone";

/** A spray of tiny flowers on thin stalks fanning out from the top of the stem. */
export function paintCluster(ctx: CanvasRenderingContext2D, s: Stem, h: Head, t: number) {
  const R = h.radius;
  const n = h.petals;
  const ends: number[] = [];
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) - 0.5) * 2.2 * h.jitter[i] + 0.06 * Math.sin(t * 2.1 + i + s.id);
    const len = R * h.jitter[i] * (i % 2 ? 0.75 : 1);
    const ex = Math.sin(a) * len;
    const ey = -Math.cos(a) * len;
    // Stalks leave the stem upright, then arch out.
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(ex * 0.25, ey * 0.6, ex, ey);
    ends.push(ex, ey, 1);
    if (h.style === 1 && i % 2 === 0) {
      for (const side of [-1, 1]) {
        const b = a + side * 0.35;
        const fx = ex + Math.sin(b) * len * 0.35;
        const fy = ey - Math.cos(b) * len * 0.35;
        ctx.moveTo(ex, ey);
        ctx.lineTo(fx, fy);
        ends.push(fx, fy, 0.7);
      }
    }
  }
  ctx.lineWidth = Math.max(1, s.tipWidth * 0.6);
  ctx.strokeStyle = tone(s.ink, s.tone);
  ctx.stroke();
  for (let i = 0; i < ends.length; i += 3) {
    // Florets on the side of the spray toward the light print lighter.
    ctx.fillStyle = tone(h.ink, h.tone, litBy(ends[i], ends[i + 1] + R * 0.5));
    ctx.beginPath();
    ctx.arc(ends[i], ends[i + 1], R * 0.2 * ends[i + 2], 0, TAU);
    ctx.fill();
  }
}
