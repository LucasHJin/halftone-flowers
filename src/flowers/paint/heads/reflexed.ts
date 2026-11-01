import { clamp, TAU } from "../../../utils/math.js";
import type { Head } from "../../types.js";
import { litBy, tone } from "../tone.js";
import { fillPetal, headFrame, paintInDepth, petal, point, type Part } from "./petals.js";

/** Turk's cap lilies: six narrow petals curled back toward the stem, stamens dangling out of the face. */
export function paintReflexed(ctx: CanvasRenderingContext2D, h: Head) {
  const R = h.radius;
  const f = headFrame(h.face, h.turn);
  const parts: Part[] = [];
  for (let k = 0; k < 6; k++) {
    if (h.lost.has(k)) continue;
    const phi = h.spin + ((k + h.drift[k]) / 6) * TAU;
    const p = petal(f, phi, {
      start: [R * 0.08, R * 0.12],
      length: R * 1.3 * h.jitter[k],
      width: R * 0.5,
      heading: 0.75,
      bend: -3.9,
      curl: 1.3,
      taper: [0.7, 0.8],
      cup: 0.4,
    });
    // Nearer petals take more ink and print darker, so neighbours part.
    const near = clamp(p.z / R, -1, 1);
    const by = 0.08 * near + litBy(...p.normal);
    parts.push({
      z: p.z,
      paint: () => {
        ctx.fillStyle = tone(h.ink, h.tone * (0.9 + 0.1 * near), by);
        fillPetal(ctx, p);
      },
    });
  }

  const anther = h.centre === 2 ? 1 : h.centre;
  parts.push({
    z: point(f, 0, 0, R * 0.5)[2],
    paint: () => {
      ctx.strokeStyle = tone(h.ink, h.tone * 0.85);
      ctx.lineWidth = Math.max(1, R * 0.07);
      ctx.lineCap = "round";
      ctx.beginPath();
      const ends: number[] = [];
      for (let k = 0; k < 6; k++) {
        const phi = h.spin + ((k + 0.5) / 6) * TAU;
        const from = point(f, phi, R * 0.04, R * 0.1);
        const mid = point(f, phi, R * 0.12, R * 0.6);
        const to = point(f, phi, R * 0.3, R * (1 + 0.08 * (k % 3)));
        ctx.moveTo(from[0], from[1]);
        ctx.quadraticCurveTo(mid[0], mid[1], to[0], to[1]);
        ends.push(to[0], to[1], Math.atan2(to[1] - mid[1], to[0] - mid[0]));
      }
      ctx.stroke();
      ctx.fillStyle = tone(anther, 1);
      for (let i = 0; i < ends.length; i += 3) {
        ctx.beginPath();
        // Anthers sit crosswise on the ends of their filaments.
        ctx.ellipse(ends[i], ends[i + 1], R * 0.12, R * 0.055, ends[i + 2] + Math.PI / 2, 0, TAU);
        ctx.fill();
      }
    },
  });
  paintInDepth(parts);
}
