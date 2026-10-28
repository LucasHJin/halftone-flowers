import { lerp, TAU } from "../../../../utils/math";
import type { Head } from "../../types";
import { tone } from "../tone";

/**
 * Cup-shaped flowers seen at a tilt: a bowl whose rim is an ellipse. Poppies are
 * wide and open with a dark centre, tulips tall and closed with pointed tips,
 * roses round with a spiral of inner petals.
 */
export function paintCup(ctx: CanvasRenderingContext2D, h: Head) {
  const R = h.radius;
  const sinT = h.face;
  const cosT = Math.sqrt(1 - sinT * sinT);
  // Rim radius, widest radius, height, and how far up the widest point sits.
  const shape = h.kind === "poppy" ? [1, 0.92, 0.85, 0.75] : h.kind === "tulip" ? [0.52, 0.78, 1.55, 0.55] : [0.82, 0.95, 1.05, 0.6];
  const rim = R * shape[0];
  const widest = R * shape[1];
  const height = R * shape[2];
  const base = R * 0.14;
  const top = -height * cosT;
  const yW = top * shape[3];
  const ry = rim * sinT;
  const amount = h.tone;
  const crinkle = h.kind === "poppy" ? 0.06 : 0;
  // A head turned about its stem leans a little to one side.
  ctx.transform(1, 0, -0.3 * Math.sin(h.turn), 1, 0, 0);

  if (h.kind === "rose") {
    // Sepals curling down from under the bloom.
    ctx.fillStyle = tone(1, 0.75);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * base, -R * 0.05);
      ctx.quadraticCurveTo(side * R * 0.55, R * 0.02, side * R * 0.7, R * 0.3);
      ctx.quadraticCurveTo(side * R * 0.35, R * 0.1, 0, R * 0.05);
      ctx.fill();
    }
  }
  if (h.kind === "tulip") {
    // The two side petals' tips, peeking up behind the rim.
    ctx.fillStyle = tone(h.ink, amount * 0.85);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * rim * 0.2, top + ry * 0.2);
      ctx.quadraticCurveTo(side * rim * 1.05, top, side * rim * 0.95, top - R * 0.32 * h.jitter[(side + 1) / 2]);
      ctx.quadraticCurveTo(side * rim * 1.1, top + R * 0.2, side * widest * 0.9, yW);
      ctx.fill();
    }
  }

  // Outer bowl: right side down to the base, left side up, then the far half of the rim.
  ctx.beginPath();
  ctx.moveTo(rim, top);
  ctx.bezierCurveTo(lerp(rim, widest, 0.9) * 1.04, lerp(top, yW, 0.35), widest, lerp(top, yW, 0.75), widest, yW);
  ctx.bezierCurveTo(widest, yW * 0.45, lerp(base, widest, 0.5), 0, base, 0);
  ctx.lineTo(-base, 0);
  ctx.bezierCurveTo(-lerp(base, widest, 0.5), 0, -widest, yW * 0.45, -widest, yW);
  ctx.bezierCurveTo(-widest, lerp(top, yW, 0.75), -lerp(rim, widest, 0.9) * 1.04, lerp(top, yW, 0.35), -rim, top);
  for (let i = 1; i <= 16; i++) {
    const th = Math.PI + (i / 16) * Math.PI;
    const w = 1 + crinkle * Math.sin(th * 8 + h.spin);
    ctx.lineTo(Math.cos(th) * rim * w, top + Math.sin(th) * ry * w);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, top - ry);
  g.addColorStop(0, tone(h.blush ? h.centre : h.ink, amount));
  g.addColorStop(h.blush ? 0.35 : 0.3, tone(h.ink, amount * 0.95));
  g.addColorStop(1, tone(h.ink, amount * 0.78));
  ctx.fillStyle = g;
  ctx.fill();

  // Inside of the cup, where the rim is open enough to see in.
  if (sinT > 0.12) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const th = (i / 32) * TAU;
      const w = 0.93 * (1 + crinkle * Math.sin(th * 8 + h.spin));
      const scale = h.kind === "tulip" ? 0.55 : 1;
      const x = Math.cos(th) * rim * w * scale;
      const y = top + Math.sin(th) * ry * w * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = h.kind === "tulip" ? tone(h.centre === 2 ? 1 : h.centre, 0.8) : tone(h.ink, Math.min(1, amount * 1.08));
    ctx.fill();
    ctx.clip();
    if (h.kind === "poppy") {
      const cy = top + ry * 0.2;
      ctx.fillStyle = tone(h.centre, 1);
      ctx.beginPath();
      ctx.ellipse(0, cy, R * 0.28, R * 0.28 * sinT, 0, 0, TAU);
      ctx.fill();
      // A ring of stamens around the seed head.
      ctx.fillStyle = tone(h.centre, 0.85);
      for (let k = 0; k < 12; k++) {
        const th = (k / 12) * TAU + h.spin;
        ctx.beginPath();
        ctx.arc(Math.cos(th) * R * 0.45, cy + Math.sin(th) * R * 0.45 * sinT, R * 0.06, 0, TAU);
        ctx.fill();
      }
    } else if (h.kind === "rose") {
      // Inner petals as lighter arcs, spiralling in.
      ctx.strokeStyle = tone(h.ink, amount * 0.45);
      ctx.lineWidth = Math.max(1, R * 0.08);
      for (let i = 0; i < 3; i++) {
        const k = 0.78 - i * 0.24;
        ctx.beginPath();
        ctx.ellipse(0, top + ry * 0.06 * i, rim * k, ry * k, 0, h.spin + i * 2.1, h.spin + i * 2.1 + 4.2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  ctx.strokeStyle = tone(h.ink, amount * 0.55);
  ctx.lineWidth = Math.max(1, R * 0.06);
  if (h.kind === "tulip") {
    // The front petal: pointed, overlapping the other two, with its seams showing.
    ctx.beginPath();
    ctx.moveTo(-widest * 0.72, yW);
    ctx.quadraticCurveTo(-rim * 0.9, top + ry * 0.2, 0, top - R * 0.38 * h.jitter[2]);
    ctx.quadraticCurveTo(rim * 0.9, top + ry * 0.2, widest * 0.72, yW);
    ctx.quadraticCurveTo(0, yW * 0.4, -widest * 0.72, yW);
    ctx.fillStyle = tone(h.ink, amount * 0.92);
    ctx.fill();
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * base * 2, top * 0.1);
      ctx.quadraticCurveTo(side * widest * 0.8, yW, side * widest * 0.72, yW);
    }
    ctx.stroke();
  } else {
    // Where the outer petals overlap.
    ctx.beginPath();
    ctx.moveTo(base * 1.5, top * 0.05);
    ctx.quadraticCurveTo(widest * 0.55, yW, rim * 0.35, top + ry);
    if (h.kind === "rose") {
      ctx.moveTo(-base * 1.5, top * 0.05);
      ctx.quadraticCurveTo(-widest * 0.75, yW * 0.8, -rim * 0.6, top + ry * 0.7);
    }
    ctx.stroke();
  }
}
