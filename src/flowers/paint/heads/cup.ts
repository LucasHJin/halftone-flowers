import { lerp, TAU } from "../../../utils/math.js";
import type { Head } from "../../types.js";
import { acrossLight, blob, dome, lightStrength, lightThrough, litBy, tone } from "../tone.js";
import { polygon } from "./petals.js";

/** Petals round a rose's cup. */
const ROSE = 5;

/** A cup's measurements as drawn, in the head's frame before it's skewed. */
export function cupShape(h: Head) {
  const R = h.radius;
  const sinT = h.face;
  const cosT = Math.sqrt(1 - sinT * sinT);
  // Rim radius, widest radius and height as shares of R; widest point's height as a share of height.
  const shape = h.kind === "poppy" ? [1, 0.92, 0.85, 0.75] : h.kind === "tulip" ? [0.52, 0.78, 1.55, 0.55] : [0.82, 0.95, 1.05, 0.6];
  const height = R * shape[2];
  const top = -height * cosT;
  const rim = R * shape[0];
  return {
    R,
    sinT,
    cosT,
    rim,
    widest: R * shape[1],
    height,
    /** How far up the widest point sits, as a share of the height. */
    bulge: shape[3],
    base: R * 0.14,
    top,
    yW: top * shape[3],
    ry: rim * sinT,
    // A head turned about its stem leans a little to one side.
    skew: -0.3 * Math.sin(h.turn),
  };
}

type CupShape = ReturnType<typeof cupShape>;

/**
 * Each petal's sector round the cup's axis, [from, to] in radians from its right,
 * π/2 toward you. A tulip has two side petals and a front one overlapping them;
 * poppies and roses split evenly from `h.spin`.
 */
export function cupSectors(h: Head): [number, number][] {
  if (h.kind === "tulip") return [[-Math.PI / 2, Math.PI / 6], [(5 * Math.PI) / 6, (3 * Math.PI) / 2], [Math.PI / 6, (5 * Math.PI) / 6]];
  const n = h.kind === "poppy" ? h.petals : ROSE;
  return Array.from({ length: n }, (_, k) => [h.spin + (k / n) * TAU, h.spin + ((k + 1) / n) * TAU]);
}

/**
 * Poppies, tulips and roses as a tilted bowl with an elliptical rim. Once petals
 * are shaken off, the bowl is clipped to those left and the core shows.
 */
export function paintCup(ctx: CanvasRenderingContext2D, h: Head) {
  const cup = cupShape(h);
  const { R, sinT, rim, widest, base, top, yW, ry, skew } = cup;
  const amount = h.tone;
  const crinkle = h.kind === "poppy" ? 0.06 : 0;
  ctx.transform(1, 0, skew, 1, 0, 0);
  const sun = lightThrough(1, 0, skew, 1);

  if (h.kind === "rose") {
    // Sepals curling down from under the bloom.
    for (const side of [-1, 1]) {
      ctx.fillStyle = tone(1, 0.75, litBy(side, 0.5));
      ctx.beginPath();
      ctx.moveTo(side * base, -R * 0.05);
      ctx.quadraticCurveTo(side * R * 0.55, R * 0.02, side * R * 0.7, R * 0.3);
      ctx.quadraticCurveTo(side * R * 0.35, R * 0.1, 0, R * 0.05);
      ctx.fill();
    }
  }
  const sectors = cupSectors(h);
  const bare = h.lost.size > 0;
  // With the petal facing you (its sector holds π/2) gone, the core paints over the petals behind.
  const open = bare && sectors.some(([from, to], k) => h.lost.has(k) && ((((Math.PI / 2 - from) % TAU) + TAU) % TAU) <= to - from);
  if (bare && !open) paintCore(ctx, h, cup, sun);
  if (bare) {
    ctx.save();
    ctx.clip(petalsLeft(h, cup, sectors));
  }

  if (h.kind === "tulip") {
    // The two side petals' tips, peeking up behind the rim.
    for (const side of [-1, 1]) {
      if (h.lost.has(side > 0 ? 0 : 1)) continue;
      ctx.fillStyle = tone(h.ink, amount * 0.85, litBy(side, 0));
      ctx.beginPath();
      ctx.moveTo(side * rim * 0.2, top + ry * 0.2);
      ctx.quadraticCurveTo(side * rim * 1.05, top, side * rim * 0.95, top - R * 0.32 * h.jitter[(side + 1) / 2]);
      ctx.quadraticCurveTo(side * rim * 1.1, top + R * 0.2, side * widest * 0.9, yW);
      ctx.fill();
    }
  }

  // Outer bowl: right side down, left side up, then the far half of the rim.
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
  // Darkest at the base, palest at the rim, slanted to be lighter toward the light.
  const g = ctx.createLinearGradient(-sun[0] * widest * 0.6, 0, sun[0] * widest * 0.6, top - ry);
  // How much light comes from the side, not down the stem.
  const side = lightStrength() * Math.abs(sun[0]);
  g.addColorStop(0, tone(h.blush ? h.centre : h.ink, amount, side));
  g.addColorStop(h.blush ? 0.35 : 0.3, tone(h.ink, amount * 0.95, side * 0.5));
  g.addColorStop(1, tone(h.ink, amount * 0.78, -side));
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
    // Lit on its far side, where the light reaches over the rim.
    const back: [number, number] = [-sun[0], -sun[1]];
    ctx.fillStyle =
      h.kind === "tulip"
        ? acrossLight(ctx, 0, top, rim * 0.55, h.centre === 2 ? 1 : h.centre, 0.8, back)
        : acrossLight(ctx, 0, top, rim, h.ink, Math.min(1, amount * 1.08), back);
    ctx.fill();
    ctx.clip();
    if (h.kind === "poppy") {
      const cy = top + ry * 0.2;
      ctx.fillStyle = dome(ctx, 0, cy, R * 0.28, h.centre, 1, sun);
      ctx.beginPath();
      ctx.ellipse(0, cy, R * 0.28, R * 0.28 * sinT, 0, 0, TAU);
      ctx.fill();
      // Stamens round the seed head.
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
    // Front petal, pointed and overlapping the side two, with its seams.
    if (!h.lost.has(2)) {
      ctx.beginPath();
      ctx.moveTo(-widest * 0.72, yW);
      ctx.quadraticCurveTo(-rim * 0.9, top + ry * 0.2, 0, top - R * 0.38 * h.jitter[2]);
      ctx.quadraticCurveTo(rim * 0.9, top + ry * 0.2, widest * 0.72, yW);
      ctx.quadraticCurveTo(0, yW * 0.4, -widest * 0.72, yW);
      ctx.fillStyle = acrossLight(ctx, 0, yW, widest * 0.72, h.ink, amount * 0.92, sun);
      ctx.fill();
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(side * base * 2, top * 0.1);
        ctx.quadraticCurveTo(side * widest * 0.8, yW, side * widest * 0.72, yW);
      }
      ctx.stroke();
    }
  } else {
    // Seams where the outer petals overlap.
    ctx.beginPath();
    ctx.moveTo(base * 1.5, top * 0.05);
    ctx.quadraticCurveTo(widest * 0.55, yW, rim * 0.35, top + ry);
    if (h.kind === "rose") {
      ctx.moveTo(-base * 1.5, top * 0.05);
      ctx.quadraticCurveTo(-widest * 0.75, yW * 0.8, -rim * 0.6, top + ry * 0.7);
    }
    ctx.stroke();
  }
  if (bare) {
    ctx.restore();
    if (open) paintCore(ctx, h, cup, sun);
  }
}

/**
 * Clip path over the petals still on a cup, each a sector of the bowl from the
 * base to past the rim, oversized so the bowl's own outline survives the clip.
 */
function petalsLeft(h: Head, cup: CupShape, sectors: [number, number][]) {
  const { R, cosT, sinT, rim, widest, height, bulge, base } = cup;
  // [px up the axis, radius there], from the base to past the rim.
  const profile: [number, number][] = [
    [-R * 0.1, base * 1.5],
    [height * bulge * 0.5, lerp(base, widest, 0.75) * 1.12],
    [height * bulge, widest * 1.12],
    [height * lerp(bulge, 1, 0.5), lerp(widest, rim, 0.5) * 1.12],
    [height, rim * 1.12],
    [height + R * 0.5, rim * 1.15],
  ];
  const path = new Path2D();
  sectors.forEach(([from, to], k) => {
    if (h.lost.has(k)) return;
    const pts: number[] = [];
    const at = (up: number, r: number, a: number) => pts.push(r * Math.cos(a), -up * cosT + r * Math.sin(a) * sinT);
    for (const [up, r] of profile) at(up, r, from);
    const [rimUp, rimR] = profile[profile.length - 1];
    for (let j = 1; j < 12; j++) at(rimUp, rimR, lerp(from, to, j / 12));
    for (let i = profile.length - 1; i >= 0; i--) at(profile[i][0], profile[i][1], to);
    // Wind every sector the same way, so overlaps add up under the nonzero rule instead of cancelling.
    let area = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      area += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    if (area < 0) {
      for (let i = 0, j = pts.length - 2; i < j; i += 2, j -= 2) {
        [pts[i], pts[j]] = [pts[j], pts[i]];
        [pts[i + 1], pts[j + 1]] = [pts[j + 1], pts[i + 1]];
      }
    }
    polygon(path, pts);
  });
  return path;
}

/** A cup's core, hidden while every petal is on: a poppy's seed pod, a tulip's pistil, a rose's hip. */
function paintCore(ctx: CanvasRenderingContext2D, h: Head, cup: CupShape, sun: [number, number]) {
  const { R, sinT, top, ry } = cup;
  if (h.kind === "poppy") {
    // An urn, topped with the same seed-head disc drawn inside the cup.
    const crown = top + ry * 0.2;
    ctx.fillStyle = acrossLight(ctx, 0, crown * 0.5, R * 0.2, 1, 0.75, sun);
    blob(ctx, 0, crown * 0.5, R * 0.2, Math.max(-crown * 0.55, R * 0.12), 0);
    ctx.fillStyle = dome(ctx, 0, crown, R * 0.28, h.centre, 1, sun);
    blob(ctx, 0, crown, R * 0.28, R * 0.28 * Math.max(sinT, 0.35), 0);
  } else if (h.kind === "tulip") {
    // Pistil column, with stigma lobes on top in the cup's inside ink.
    ctx.fillStyle = acrossLight(ctx, 0, top * 0.45, R * 0.12, 1, 0.7, sun);
    blob(ctx, 0, top * 0.45, R * 0.12, Math.max(-top * 0.45, R * 0.1), 0);
    ctx.fillStyle = tone(h.centre === 2 ? 1 : h.centre, 0.9);
    blob(ctx, 0, top * 0.9, R * 0.18, R * 0.1, 0);
  } else {
    ctx.fillStyle = acrossLight(ctx, 0, -R * 0.15, R * 0.22, 1, 0.75, sun);
    blob(ctx, 0, -R * 0.15, R * 0.22, R * 0.2, 0);
  }
}
