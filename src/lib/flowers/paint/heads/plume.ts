import { lerp } from "../../../../utils/math";
import type { Head, Stem } from "../../types";
import { along, tone } from "../tone";

/** Steps up a plume between its pairs of hairs, so it has one more pair than this. */
export const HAIR_STEPS = 24;

/** How far a plume's hairs are swept back from straight up the stem, radians. */
export const SWEEP = 0.25;

/**
 * Pair `i` of a plume's hairs: where it grows along the stem, how long its
 * hairs are, how far they splay either way from the middle, radians, how wide
 * they are, and how much ink they take. Every other pair is paler.
 */
export function hairPair(h: Head, i: number) {
  const k = i / HAIR_STEPS;
  return {
    along: 1 - h.reach + h.reach * k,
    length: h.radius * lerp(1, 0.35, k) * h.jitter[0] * (0.8 + (0.4 * ((i * 7) % 5)) / 4),
    spread: lerp(0.5, 0.2, k),
    width: Math.max(1.2, h.radius * 0.09),
    amount: h.tone * (i % 2 ? 0.85 : 0.6),
  };
}

/** Feathery grass plumes: fine hairs swept up and back along the top of the stem. */
export function paintPlume(ctx: CanvasRenderingContext2D, s: Stem, h: Head, t: number) {
  ctx.lineCap = "round";
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = pass; i <= HAIR_STEPS; i += 2) {
      if (h.lost.has(i)) continue;
      const pair = hairPair(h, i);
      const p = along(s, pair.along);
      for (const side of [-1, 1]) {
        const a = p.a + side * pair.spread + SWEEP + 0.08 * Math.sin(t * 2.2 + i + s.id);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.sin(a) * pair.length, p.y - Math.cos(a) * pair.length);
      }
    }
    const { width, amount } = hairPair(h, pass);
    ctx.lineWidth = width;
    ctx.strokeStyle = tone(h.ink, amount);
    ctx.stroke();
  }
}
