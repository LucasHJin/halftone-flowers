import { clamp, TAU } from "../../../../utils/math";
import type { Head } from "../../types";
import { dome, litBy, tone } from "../tone";
import { fillPetal, headFrame, paintInDepth, petal, point, type Part } from "./petals";

/**
 * Rings of cupped petals from the outside in, each starting higher and
 * standing up straighter, so together they make a ball. Sizes are shares of
 * the head's radius; `by` moves the ring along the colour ramp, so rings that
 * overlap print in different shades. 28 petals in all, one `jitter` and
 * `drift` each.
 */
export const RINGS = [
  { n: 6, start: [0.12, 0], length: 1, width: 0.75, heading: 0.15, bend: 1.3, by: 0.12 },
  { n: 8, start: [0.1, 0.15], length: 0.85, width: 0.6, heading: 0.6, bend: 1.3, by: -0.06 },
  { n: 8, start: [0.07, 0.3], length: 0.7, width: 0.52, heading: 0.95, bend: 1.3, by: 0.08 },
  { n: 6, start: [0.04, 0.45], length: 0.5, width: 0.45, heading: 1.25, bend: 1.2, by: -0.1 },
];

/** Peonies: a ball of ruffled petals sitting in a cup of broad outer ones. */
export function paintGlobe(ctx: CanvasRenderingContext2D, h: Head) {
  const R = h.radius;
  const f = headFrame(h.face, h.turn);
  const parts: Part[] = [];
  if (h.lost.size) {
    // The seed heads in the middle, hidden while the petals are all there.
    const [x, y] = point(f, 0, 0, R * 0.3);
    ctx.fillStyle = dome(ctx, x, y, R * 0.22, h.centre, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.22, 0, TAU);
    ctx.fill();
  }
  let i = 0;
  RINGS.forEach((ring, r) => {
    for (let k = 0; k < ring.n; k++, i++) {
      if (h.lost.has(i)) continue;
      const phi = h.spin + ((k + 0.5 * r + h.drift[i]) / ring.n) * TAU;
      const p = petal(f, phi, {
        start: [R * ring.start[0], R * ring.start[1]],
        length: R * ring.length * h.jitter[i],
        width: R * ring.width,
        heading: ring.heading,
        bend: ring.bend,
        taper: [0.6, 0.25],
        cup: 0.45,
      });
      const near = clamp(p.z / R, -1, 1);
      // Neighbours in a ring alternate shades too.
      const by = ring.by + (k % 2 ? 0.06 : -0.06) + 0.05 * near + litBy(...p.normal);
      const amount = h.tone * (0.9 + 0.1 * near);
      parts.push({
        z: p.z,
        paint: () => {
          // Shadowed deep in the flower, paler at the edge, so each edge stands off the petal behind it.
          const rib = p.rib;
          const g = ctx.createLinearGradient(rib[0], rib[1], rib[rib.length - 2], rib[rib.length - 1]);
          g.addColorStop(0, tone(h.ink, amount, by + 0.08));
          g.addColorStop(1, tone(h.ink, amount * 0.75, by - 0.08));
          ctx.fillStyle = g;
          fillPetal(ctx, p);
        },
      });
    }
  });
  paintInDepth(parts);
}
