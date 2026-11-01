import { lerp } from "../../../utils/math.js";
import type { Head, Stem } from "../../types.js";
import { along, blob, litBy, tone } from "../tone.js";

/** How far a foxglove's bells turn out from the stem, radians. */
export const BELL_TURN = 1.2;
/** How far a bell's middle hangs from where it grows, in floret sizes. */
export const BELL_HANG = 0.9;

/** Floret `i` of a spike: `k` 0 at the foot to 1 at the tip, `along` a stem fraction. Smaller and more ink toward the tip. */
export function spikeFloret(h: Head, i: number) {
  const k = i / (h.petals - 1);
  return { k, along: 1 - h.reach + h.reach * k * 0.96, size: h.radius * lerp(1, 0.4, k) * h.jitter[i], amount: h.tone * lerp(0.82, 1, k) };
}

/** Side of the stem foxglove bell `i` hangs on: 1 right, -1 left. Mostly right. */
export function bellSide(i: number) {
  return i % 3 === 2 ? -1 : 1;
}

/** Florets up the top of the stem, by `h.style`: 0 lupine cones, 1 foxglove bells, 2 lavender whorls. */
export function paintSpike(ctx: CanvasRenderingContext2D, s: Stem, h: Head) {
  const n = h.petals;
  for (let i = 0; i < n; i++) {
    // Lavender leaves gaps between its whorls.
    if ((h.style === 2 && i % 2 === 1 && i < n - 3) || h.lost.has(i)) continue;
    const f = spikeFloret(h, i);
    const { size, amount } = f;
    const p = along(s, f.along);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    // Florets crowd a little to one side or the other.
    ctx.translate(h.drift[i] * size, 0);
    // Lighter on the stem's side toward the light. `side` 1 is the stem's right.
    const lit = (side: number) => tone(h.ink, amount, litBy(side * Math.cos(p.a), side * Math.sin(p.a)));
    if (h.style === 0) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = lit(side);
        blob(ctx, side * size * 0.75, 0, size * 0.8, size * 0.6, side * 0.5);
      }
      ctx.fillStyle = tone(h.ink, amount);
      blob(ctx, 0, -size * 0.3, size * 0.6, size * 0.5, 0);
    } else if (h.style === 1) {
      // Bells open downward, with a darker mouth.
      const side = bellSide(i);
      ctx.fillStyle = lit(side);
      ctx.rotate(side * BELL_TURN);
      blob(ctx, 0, size * BELL_HANG, size * 0.55, size * 1.05, 0);
      ctx.fillStyle = tone(h.ink === 1 ? 0 : 1, 0.7);
      blob(ctx, 0, size * (BELL_HANG + 0.65), size * 0.3, size * 0.2, 0);
    } else {
      for (const side of [-1, 1]) {
        ctx.fillStyle = lit(side);
        blob(ctx, side * size * 0.5, 0, size * 0.55, size * 0.45, side * 0.6);
      }
    }
    ctx.restore();
  }
}
