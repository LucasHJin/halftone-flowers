import { TAU } from "../../../utils/math.js";
import type { Head, Stem } from "../../types.js";
import { litBy, tone } from "../tone.js";

/** A cluster floret in the head's frame: `size` is a share of a full floret, `fromX`, `fromY` where its stalk starts. */
export interface Floret {
  x: number;
  y: number;
  size: number;
  fromX: number;
  fromY: number;
}

/** A cluster's florets at time `t`, indexed as `h.lost` keys: each stalk's, then the forks off it. */
export function florets(s: Stem, h: Head, t: number) {
  const R = h.radius;
  const n = h.petals;
  const out: Floret[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) - 0.5) * 2.2 * h.jitter[i] + 0.06 * Math.sin(t * 2.1 + i + s.id);
    const len = R * h.jitter[i] * (i % 2 ? 0.75 : 1);
    const ex = Math.sin(a) * len;
    const ey = -Math.cos(a) * len;
    out.push({ x: ex, y: ey, size: 1, fromX: 0, fromY: 0 });
    if (h.style === 1 && i % 2 === 0) {
      for (const side of [-1, 1]) {
        const b = a + side * 0.35;
        out.push({ x: ex + Math.sin(b) * len * 0.35, y: ey - Math.cos(b) * len * 0.35, size: 0.7, fromX: ex, fromY: ey });
      }
    }
  }
  return out;
}

/** A spray of tiny florets on thin stalks. Stalks stay after their florets are shaken off. */
export function paintCluster(ctx: CanvasRenderingContext2D, s: Stem, h: Head, t: number) {
  const R = h.radius;
  const all = florets(s, h, t);
  ctx.beginPath();
  for (const f of all) {
    ctx.moveTo(f.fromX, f.fromY);
    // Stalks leave the stem upright, then arch out; forks go straight.
    if (f.size === 1) ctx.quadraticCurveTo(f.x * 0.25, f.y * 0.6, f.x, f.y);
    else ctx.lineTo(f.x, f.y);
  }
  ctx.lineWidth = Math.max(1, s.tipWidth * 0.6);
  ctx.strokeStyle = tone(s.ink, s.tone);
  ctx.stroke();
  all.forEach((f, i) => {
    if (h.lost.has(i)) return;
    // Lit by direction from the spray's middle, R / 2 out from the stem tip.
    ctx.fillStyle = tone(h.ink, h.tone, litBy(f.x, f.y + R * 0.5));
    ctx.beginPath();
    ctx.arc(f.x, f.y, R * 0.2 * f.size, 0, TAU);
    ctx.fill();
  });
}
