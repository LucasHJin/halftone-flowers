import { lerp } from "../../../utils/math.js";
import type { Head, Stem } from "../../types.js";
import { along, blob, litBy, tone } from "../tone.js";

/** How far a foxglove's bells turn out from the stem, radians, and how far the middle of one hangs from where it grows, in floret sizes. */
export const BELL_TURN = 1.2;
export const BELL_HANG = 0.9;

/**
 * Floret `i` of a spike: how far up the spike it is, from 0 at the foot to 1
 * at the tip, where that is along the stem, its size, and how much ink it
 * takes. Open florets low down, smaller, tighter and deeper-coloured buds
 * toward the tip.
 */
export function spikeFloret(h: Head, i: number) {
  const k = i / (h.petals - 1);
  return { k, along: 1 - h.reach + h.reach * k * 0.96, size: h.radius * lerp(1, 0.4, k) * h.jitter[i], amount: h.tone * lerp(0.82, 1, k) };
}

/** Which side of the stem foxglove bell `i` hangs on: 1 its right, -1 its left. Mostly the one side. */
export function bellSide(i: number) {
  return i % 3 === 2 ? -1 : 1;
}

/** Flowers all the way up the top of the stem: lupine cones, foxglove bells, lavender whorls. */
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
    // Florets on the side of the stem toward the light print lighter. `side` 1 is the stem's right.
    const lit = (side: number) => tone(h.ink, amount, litBy(side * Math.cos(p.a), side * Math.sin(p.a)));
    if (h.style === 0) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = lit(side);
        blob(ctx, side * size * 0.75, 0, size * 0.8, size * 0.6, side * 0.5);
      }
      ctx.fillStyle = tone(h.ink, amount);
      blob(ctx, 0, -size * 0.3, size * 0.6, size * 0.5, 0);
    } else if (h.style === 1) {
      // Bells hang mostly on one side, opening downward, with a darker mouth.
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
