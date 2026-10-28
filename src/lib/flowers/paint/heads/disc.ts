import { TAU } from "../../../../utils/math";
import type { Head, Stem } from "../../types";
import { tone } from "../tone";

/** Fill for one petal: deepest at the base, fading toward the tip, optionally blushing from another ink. */
function petalFill(ctx: CanvasRenderingContext2D, h: Head, amount: number, len: number) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
  g.addColorStop(0, tone(h.blush ? h.centre : h.ink, amount));
  g.addColorStop(h.blush ? 0.4 : 0.5, tone(h.ink, amount * 0.93));
  g.addColorStop(1, tone(h.ink, amount * 0.7));
  return g;
}

/** Flat, open flowers: cosmos, daisies and pointed lily-like blooms, as a disc tilted toward you. */
export function paintDisc(ctx: CanvasRenderingContext2D, s: Stem, h: Head, t: number) {
  const R = h.radius;
  // A tilted flower sits up off the end of the stem.
  ctx.translate(0, -R * (0.12 + 0.3 * (1 - h.face)));
  // Flattened toward the stem, and slanted when the head is turned about it (see headFrame).
  ctx.transform(Math.cos(h.turn), 0, Math.sqrt(1 - h.face * h.face) * Math.sin(h.turn), h.face, 0, 0);
  const n = h.petals;
  for (let k = 0; k < n; k++) {
    // Lilies have an outer ring of three and an inner ring of three, drawn on top and a little shorter.
    const lily = h.kind === "lily";
    const ring = lily ? Math.floor((k * 2) / n) : 0;
    const slot = lily ? (k % (n / 2)) * 2 + ring : k;
    const phi = h.spin + ((slot + h.drift[k]) / n) * TAU;
    const len = R * h.jitter[k] * (ring ? 0.82 : 1) * (1 + 0.025 * Math.sin(t * 1.6 + k * 1.9 + s.id));
    // Petals on the far side of a tilted flower print a little lighter.
    const amount = h.tone * (0.92 + 0.08 * Math.sin(phi)) * (0.94 + 0.06 * h.jitter[k]) * (ring ? 1.06 : 1);
    ctx.save();
    ctx.rotate(phi);
    ctx.beginPath();
    if (h.kind === "daisy") {
      const half = R * Math.min(0.11, 1.25 / n);
      const r0 = R * 0.22;
      ctx.moveTo(r0, -half * 0.7);
      ctx.lineTo(len - half, -half);
      ctx.quadraticCurveTo(len + half * 0.4, 0, len - half, half);
      ctx.lineTo(r0, half * 0.7);
    } else if (lily) {
      // Long, pointed petals.
      const half = R * 0.24;
      ctx.moveTo(R * 0.04, 0);
      ctx.quadraticCurveTo(len * 0.42, -half * 1.9, len, 0);
      ctx.quadraticCurveTo(len * 0.42, half * 1.9, R * 0.04, 0);
    } else {
      // Cosmos: broad wedges with a notch at the tip.
      const half = R * (n > 8 ? 0.24 : 0.28);
      const r0 = R * 0.12;
      const span = len - r0;
      ctx.moveTo(r0, 0);
      ctx.bezierCurveTo(r0 + span * 0.3, -half * 0.9, len - span * 0.2, -half * 1.05, len, -half * 0.4);
      ctx.lineTo(len - R * 0.06, 0);
      ctx.lineTo(len, half * 0.4);
      ctx.bezierCurveTo(len - span * 0.2, half * 1.05, r0 + span * 0.3, half * 0.9, r0, 0);
    }
    ctx.closePath();
    ctx.fillStyle = petalFill(ctx, h, amount, len);
    ctx.fill();
    ctx.restore();
  }

  if (h.kind === "lily") {
    // Stamens instead of a disc.
    ctx.strokeStyle = tone(h.centre === 2 ? 1 : h.centre, 0.85);
    ctx.lineWidth = Math.max(1, R * 0.04);
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const phi = h.spin + 0.5 + (k / 6) * TAU;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(phi) * R * 0.5, Math.sin(phi) * R * 0.5);
    }
    ctx.stroke();
    ctx.fillStyle = tone(h.centre === 2 ? 1 : h.centre, 1);
    for (let k = 0; k < 6; k++) {
      const phi = h.spin + 0.5 + (k / 6) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(phi) * R * 0.5, Math.sin(phi) * R * 0.5, R * 0.07, 0, TAU);
      ctx.fill();
    }
    return;
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * (h.kind === "daisy" ? 0.26 : n > 8 ? 0.17 : 0.2), 0, TAU);
  ctx.fillStyle = tone(h.centre, 0.95);
  ctx.fill();
}
