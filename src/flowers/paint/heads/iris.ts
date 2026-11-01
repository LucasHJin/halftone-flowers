import { clamp, TAU } from "../../../utils/math.js";
import type { Head } from "../../types.js";
import { blob, litBy, tone } from "../tone.js";
import { fillPetal, headFrame, paintInDepth, petal, type Part } from "./petals.js";

/**
 * Bearded irises: three petals standing up and folding in over the middle,
 * and three falling away between them in `centre` ink, each with a pale beard
 * along its top.
 */
export function paintIris(ctx: CanvasRenderingContext2D, h: Head) {
  const R = h.radius;
  const f = headFrame(h.face, h.turn);
  const beard = h.centre === 2 ? 0 : 2;
  const parts: Part[] = [];
  if (h.lost.size) {
    // The swelling at the top of the stem the petals grew from, hidden while they're all there.
    ctx.fillStyle = tone(1, 0.75, litBy(-0.5, -0.5));
    blob(ctx, 0, -R * 0.08, R * 0.14, R * 0.18, 0);
  }
  for (let k = 0; k < 3; k++) {
    const up = petal(f, h.spin + ((k + h.drift[k]) / 3) * TAU, {
      start: [R * 0.05, R * 0.15],
      length: R * 1.05 * h.jitter[k],
      width: R * 0.62,
      heading: 1.2,
      bend: 1.15,
      taper: [0.6, 0.45],
      cup: 0.4,
    });
    const down = petal(f, h.spin + ((k + 0.5 + h.drift[k + 3]) / 3) * TAU, {
      start: [R * 0.08, R * 0.12],
      length: R * 1.3 * h.jitter[k + 3],
      width: R * 0.64,
      heading: 0.8,
      bend: -2.5,
      curl: 1.2,
      taper: [0.75, 0.4],
      // Folded down the middle, so a fall seen side-on still shows its depth.
      cup: 0.7,
    });
    if (!h.lost.has(k)) parts.push({
      z: up.z,
      paint: () => {
        const near = clamp(up.z / R, -1, 1);
        ctx.fillStyle = tone(h.ink, h.tone * (0.9 + 0.1 * near), 0.06 * near + litBy(...up.normal));
        fillPetal(ctx, up);
      },
    });
    if (!h.lost.has(k + 3)) parts.push({
      z: down.z,
      paint: () => {
        const near = clamp(down.z / R, -1, 1);
        ctx.fillStyle = tone(h.centre, h.tone * (0.9 + 0.1 * near), 0.06 * near + litBy(...down.normal));
        fillPetal(ctx, down);
        // The beard is on the top of the fall, so only falls toward you show it.
        if (down.z < R * 0.1) return;
        const rib = down.rib;
        ctx.strokeStyle = tone(beard, h.tone);
        ctx.lineWidth = Math.max(1.5, R * 0.1);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(rib[2], rib[3]);
        for (let i = 4; i <= 8; i += 2) ctx.lineTo(rib[i], rib[i + 1]);
        ctx.stroke();
      },
    });
  }
  paintInDepth(parts);
}
