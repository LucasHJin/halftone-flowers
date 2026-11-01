import { clamp, TAU } from "../../../utils/math.js";
import type { Head } from "../../types.js";
import { acrossLight, lightThrough, litBy, tone } from "../tone.js";
import { fillPetal, headFrame, paintInDepth, petal, polygon, ring, tube, type Part } from "./petals.js";

/**
 * Daffodils facing out from a bent neck: a flat star of six petals with a long
 * trumpet standing out of its middle, often in a second ink.
 */
export function paintTrumpet(ctx: CanvasRenderingContext2D, h: Head) {
  const R = h.radius;
  const f = headFrame(h.face, h.turn);
  const parts: Part[] = [];
  for (let k = 0; k < 6; k++) {
    if (h.lost.has(k)) continue;
    // Three outer petals, and three inner ones a little narrower and shorter.
    const inner = k % 2;
    const phi = h.spin + ((k + h.drift[k]) / 6) * TAU;
    const p = petal(f, phi, {
      start: [R * 0.1, 0],
      length: R * (inner ? 0.9 : 1) * h.jitter[k],
      width: R * (inner ? 0.52 : 0.6),
      heading: 0.12,
      bend: -0.35,
      taper: [0.55, 0.75],
      cup: 0.2,
    });
    const near = clamp(p.z / R, -1, 1);
    const shade = 0.06 * near + litBy(...p.normal);
    parts.push({
      z: p.z,
      paint: () => {
        ctx.fillStyle = tone(h.ink, h.tone * (0.9 + 0.1 * near), shade);
        fillPetal(ctx, p);
      },
    });
  }

  const length = R * 0.85;
  const mouth = R * 0.4;
  const body = tube(f, [[0, R * 0.2], [length * 0.5, R * 0.23], [length * 0.85, R * 0.3], [length, mouth]]);
  // A trumpet the same ink as its petals prints a shade deeper.
  const by = h.centre === h.ink ? 0.15 : 0;
  // How near the trumpet's nearest wall comes, halfway out.
  const z = length * 0.5 * f.axis[2] + R * 0.23 * Math.hypot(f.u[2], f.v[2]);
  // Shaded round the tube, across its length: the light along the tube itself doesn't shade it.
  const [ax, ay] = [f.axis[0], f.axis[1]];
  const [sx, sy] = lightThrough(1, 0, 0, 1);
  const along = (sx * ax + sy * ay) / (Math.hypot(ax, ay) || 1) ** 2;
  const across: [number, number] = [sx - along * ax, sy - along * ay];
  const reach = Math.hypot(...across);
  parts.push({
    z,
    paint: () => {
      ctx.fillStyle =
        reach > 0.2
          ? acrossLight(ctx, ax * length * 0.5, ay * length * 0.5, R * 0.3, h.centre, h.tone, [across[0] / reach, across[1] / reach], by)
          : tone(h.centre, h.tone, by);
      ctx.fill(body);
      if (f.axis[2] > 0.05) {
        // Looking into it: the inside is in shadow.
        const opening = new Path2D();
        polygon(opening, ring(f, length, mouth * 0.82));
        ctx.fillStyle = tone(h.centre, Math.min(1, h.tone * 1.1), by + 0.15);
        ctx.fill(opening);
      }
    },
  });
  paintInDepth(parts);
}
