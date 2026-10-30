/**
 * Single petals as they look once they've come loose, each drawn like the ones
 * still on its kind of head and taken from that flower's own: its inks and
 * blush, how long that petal was, how many it had, and whatever marks it
 * carries (a poppy's blotch, the beard on an iris fall, a foxglove's dark
 * mouth). Spikes, clusters and plumes shed whole florets or wisps instead.
 *
 * Each is drawn about its middle, its base toward -x and its tip toward +x.
 * Seen alone and small, a loose petal is drawn a little bigger than on its
 * flower, and never so small that its shape is lost among the dots.
 */
import { lerp, TAU } from "../../../utils/math";
import type { Head, Ink, Stem } from "../types";
import { blob, lightStrength, tone } from "./tone";

/** Paints a loose petal moved `by` along the ramp, for which side of it faces you. */
export type LoosePaint = (ctx: CanvasRenderingContext2D, by: number) => void;

export interface LooseLook {
  paint: LoosePaint;
  /** Px across its longest way. */
  length: number;
}

/** How much bigger than on its flower a loose petal is drawn, at least; small ones are drawn bigger still to reach their fewest dots long. */
const EXAGGERATE = 1.15;

/** Fewest dots across a loose petal, so its outline still shows. */
const MIN_WIDE = 1.8;

/** One petal, floret or wisp from the head on `s`, `size` times as big as it would otherwise be. */
export function looseLook(s: Stem, h: Head, cell: number, size: number): LooseLook {
  const R = h.radius;
  const rand = Math.random;
  // Which of its petals came off, for how long that one was.
  const k = Math.floor(rand() * h.jitter.length);
  const jitter = h.jitter[k];
  // White petals blush toward the centre's ink at the base.
  const base: Ink = h.blush ? h.centre : h.ink;
  const amount = h.tone;
  // Which way it curls.
  const side = rand() < 0.5 ? -1 : 1;
  /** `length` by `width` px as drawn loose: bigger than on the flower, at least `least` dots long and MIN_WIDE across. */
  const fit = (length: number, width: number, least = 4.5): [number, number] => {
    const scale = size * Math.max(EXAGGERATE, (cell * least) / length);
    return [length * scale, Math.max(width * scale, cell * MIN_WIDE * size)];
  };

  switch (h.kind) {
    case "daisy": {
      // A long, narrow ray, blunt at the tip; the more rays the daisy has, the narrower each.
      const [L, W] = fit(R * 0.95 * jitter, 2 * R * Math.min(0.11, 1.25 / h.petals), 6);
      const b = blade(L, W, side * lerp(0, 0.35, rand()), [0.12, 0.2]);
      return { length: L, paint: (ctx, by) => fill(ctx, b.path, ribFill(ctx, b.rib, h.ink, amount, by, base)) };
    }
    case "cosmos": {
      // A broad wedge, its tip cut into three teeth; broader on a cosmos with fewer petals.
      const [L, W] = fit(R * 0.9 * jitter, R * (h.petals > 8 ? 0.48 : 0.56));
      const path = toothed(L, W / 2);
      return { length: L, paint: (ctx, by) => fill(ctx, path, ribFill(ctx, [-L / 2, 0, L / 2, 0], h.ink, amount, by, base)) };
    }
    case "lily": {
      // Long and pointed, curving back at the tip, with a stripe down the middle in its stamens' ink. The inner three are shorter.
      const [L, W] = fit(R * (rand() < 0.5 ? 0.82 : 1) * jitter, R * 0.46, 6);
      const b = blade(L, W, side * lerp(0.3, 0.7, rand()), [0.5, 0.9]);
      const stripe: Ink = h.centre === 2 ? 1 : h.centre;
      return {
        length: L,
        paint: (ctx, by) => {
          fill(ctx, b.path, ribFill(ctx, b.rib, h.ink, amount, by, base));
          stroke(ctx, ribPath(b.rib, 0.08, 0.72), tone(stripe, 0.85, by), Math.max(cell * 0.5, W * 0.16));
        },
      };
    }
    case "turksCap": {
      // Narrow, and curled right back on itself.
      const [L, W] = fit(R * 1.3 * jitter, R * 0.5, 6);
      const b = blade(L, W, side * lerp(2.2, 2.8, rand()), [0.7, 0.8]);
      return { length: L, paint: (ctx, by) => fill(ctx, b.path, ribFill(ctx, b.rib, h.ink, amount, by)) };
    }
    case "daffodil": {
      // Broad, drawn out to a sharp point, with a paler crease down the middle; the inner three a little narrower and shorter.
      const inner = k % 2 === 1;
      const [L, W] = fit(R * (inner ? 0.9 : 1) * jitter, R * (inner ? 0.52 : 0.6));
      const b = blade(L, W, side * lerp(0.1, 0.4, rand()), [0.4, 1.3]);
      return {
        length: L,
        paint: (ctx, by) => {
          fill(ctx, b.path, ribFill(ctx, b.rib, h.ink, amount, by));
          stroke(ctx, ribPath(b.rib, 0.1, 0.8), tone(h.ink, amount * 0.75, by - 2 * lightStrength()), Math.max(cell * 0.45, W * 0.12));
        },
      };
    }
    case "iris": {
      if (rand() < 0.5) {
        // A standard: broad, cupped and ruffled.
        const [L, W] = fit(R * 1.05 * jitter, R * 0.62, 5);
        const b = blade(L, W, side * lerp(0.7, 1.1, rand()), [0.6, 0.45], 0.25);
        return { length: L, paint: (ctx, by) => fill(ctx, b.path, ribFill(ctx, b.rib, h.ink, amount, by)) };
      }
      // A fall, in the centre's ink, arching over, with the beard along the top of it in a contrasting ink.
      const [L, W] = fit(R * 1.3 * jitter, R * 0.64, 6);
      const b = blade(L, W, side * lerp(1.2, 1.7, rand()), [0.75, 0.4], 0.08);
      const beard: Ink = h.centre === 2 ? 0 : 2;
      return {
        length: L,
        paint: (ctx, by) => {
          fill(ctx, b.path, ribFill(ctx, b.rib, h.centre, amount, by));
          stroke(ctx, ribPath(b.rib, 0.06, 0.5), tone(beard, amount, by), Math.max(cell * 0.6, W * 0.24));
        },
      };
    }
    case "poppy": {
      // Broad, round and crinkled at the edge, with a blotch at the base in the centre's ink.
      const [L] = fit(R * 0.9 * jitter, R * 1.1);
      const crinkle = rand() * TAU;
      const path = fan(L, 1.3, (t) => rounded(t, 0.45) * (1 + 0.05 * Math.sin(11 * t + crinkle)));
      const blotch = fan(L, 1.3, (t) => 0.38 * rounded(t, 0.6));
      return {
        length: L,
        paint: (ctx, by) => {
          fill(ctx, path, fanFill(ctx, L, h.ink, amount, by));
          fill(ctx, blotch, tone(h.centre, 1, by));
        },
      };
    }
    case "tulip": {
      // Tall and cupped, coming to a point, shaded across as a bowl is, with a patch at the base in the ink of the cup's inside.
      const [L, W] = fit(R * 1.35 * jitter, R * 0.8);
      const b = blade(L, W, side * lerp(0, 0.3, rand()), [0.45, 0.55]);
      const patch: Ink = h.centre === 2 ? 1 : h.centre;
      return {
        length: L,
        paint: (ctx, by) => {
          const light = lightStrength();
          const g = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
          g.addColorStop(0, tone(h.ink, amount, by - light));
          g.addColorStop(1, tone(h.ink, amount * 0.85, by + light));
          fill(ctx, b.path, g);
          ctx.save();
          ctx.clip(b.path);
          ctx.fillStyle = tone(patch, 0.85, by);
          blob(ctx, b.rib[0], b.rib[1], L * 0.32, W * 0.6, 0);
          ctx.restore();
        },
      };
    }
    case "rose": {
      // Round and notched at the tip like a heart, its edge rolled back and paler.
      const [L] = fit(R * 0.75 * jitter, R * 0.85);
      const edge = (t: number) => rounded(t, 0.35) * (1 - 0.3 * Math.exp(-((t / 0.25) ** 2)));
      const path = fan(L, 1.05, edge);
      const lip = fanEdge(L, 1.05, edge, 0.8);
      return {
        length: L,
        paint: (ctx, by) => {
          fill(ctx, path, fanFill(ctx, L, h.ink, amount, by, base));
          stroke(ctx, lip, tone(h.ink, amount * 0.7, by - lightStrength()), Math.max(cell * 0.5, L * 0.1));
        },
      };
    }
    case "peony": {
      // Big, cupped and ruffled into lobes, deep at the base and pale at the edge. Mostly the broad outer ones fall.
      const [length, width] = rand() < 0.6 ? [1, 0.75] : rand() < 0.6 ? [0.85, 0.6] : [0.7, 0.52];
      const [L] = fit(R * length * jitter, R * width);
      const ruffle = rand() * TAU;
      const path = fan(L, 1.15, (t) => rounded(t, 0.5) * (1 + 0.1 * Math.sin(3 * Math.PI * t + ruffle)));
      return { length: L, paint: (ctx, by) => fill(ctx, path, fanFill(ctx, L, h.ink, amount, by, h.ink, 0.1)) };
    }
    case "bud": {
      // Its petals still furled in their sepals, showing their colour only at the tip.
      const [L, W] = fit(R * 1.1, R * 0.78);
      const w = W / 1.4;
      const body = new Path2D();
      body.moveTo(-0.55 * L, 0);
      body.bezierCurveTo(-0.4 * L, -w, 0.25 * L, -0.7 * w, 0.5 * L, 0);
      body.bezierCurveTo(0.25 * L, 0.7 * w, -0.4 * L, w, -0.55 * L, 0);
      const tip = new Path2D();
      tip.moveTo(0.05 * L, -0.42 * w);
      tip.bezierCurveTo(0.3 * L, -0.35 * w, 0.45 * L, -0.15 * w, 0.5 * L, 0);
      tip.bezierCurveTo(0.45 * L, 0.15 * w, 0.3 * L, 0.35 * w, 0.05 * L, 0.42 * w);
      tip.quadraticCurveTo(0.12 * L, 0, 0.05 * L, -0.42 * w);
      return {
        length: L,
        paint: (ctx, by) => {
          fill(ctx, body, tone(1, s.tone + 0.15, by));
          fill(ctx, tip, tone(h.ink, amount, by));
        },
      };
    }
    case "cluster": {
      // A whole floret: five round petals about a deeper eye.
      const [L] = fit(R * 0.4 * jitter, R * 0.4, 4);
      const turn = rand() * TAU;
      return {
        length: L,
        paint: (ctx, by) => {
          ctx.fillStyle = tone(h.ink, amount, by);
          for (let i = 0; i < 5; i++) {
            const a = turn + (i / 5) * TAU;
            blob(ctx, Math.cos(a) * L * 0.27, Math.sin(a) * L * 0.27, L * 0.23, L * 0.23, 0);
          }
          ctx.fillStyle = tone(h.ink, amount, by + 0.25);
          blob(ctx, 0, 0, L * 0.17, L * 0.17, 0);
        },
      };
    }
    case "spike": {
      // Smaller toward the top of the spike.
      const floret = R * lerp(0.5, 1, rand()) * jitter;
      if (h.style === 1) {
        // A foxglove bell, flared at the end, with its dark mouth.
        const [L] = fit(floret * 2.4, floret * 1.4, 5);
        const u = L / 2.4;
        return {
          length: L,
          paint: (ctx, by) => {
            ctx.fillStyle = tone(h.ink, amount, by);
            blob(ctx, -0.15 * u, 0, 1.05 * u, 0.62 * u, 0);
            ctx.fillStyle = tone(h.ink, amount * 0.9, by - 0.05);
            blob(ctx, 0.8 * u, 0, 0.32 * u, 0.75 * u, 0);
            ctx.fillStyle = tone(h.ink === 1 ? 0 : 1, 0.85, by);
            blob(ctx, 0.88 * u, 0, 0.2 * u, 0.5 * u, 0);
          },
        };
      }
      if (h.style === 2) {
        // A pair of lavender florets off one whorl.
        const [L] = fit(floret * 2, floret, 4);
        const u = L / 2;
        return {
          length: L,
          paint: (ctx, by) => {
            for (const flank of [-1, 1]) {
              ctx.fillStyle = tone(h.ink, amount, by + flank * 0.06);
              blob(ctx, flank * 0.45 * u, 0, 0.55 * u, 0.45 * u, flank * -0.6);
            }
          },
        };
      }
      // A lupine's pea flower: two wings, and the banner standing over them.
      const [L] = fit(floret * 2.3, floret * 1.5, 4.5);
      const u = L / 2.3;
      return {
        length: L,
        paint: (ctx, by) => {
          for (const flank of [-1, 1]) {
            ctx.fillStyle = tone(h.ink, amount, by + flank * 0.08);
            blob(ctx, flank * 0.75 * u, 0.25 * u, 0.8 * u, 0.6 * u, flank * 0.5);
          }
          ctx.fillStyle = tone(h.ink, amount, by);
          blob(ctx, 0, -0.35 * u, 0.6 * u, 0.5 * u, 0);
        },
      };
    }
    case "plume": {
      // A wisp of the plume's hairs fanning out from the seed they grew from, thick enough to print as more than a scatter of dots.
      const [L] = fit(R * 0.9 * jitter, R * 0.6, 5);
      const hairs = new Path2D();
      for (let i = 0; i < 5; i++) {
        const a = lerp(-0.6, 0.6, i / 4) + (rand() - 0.5) * 0.15;
        const length = L * lerp(0.7, 1, rand());
        hairs.moveTo(-L / 2, 0);
        hairs.quadraticCurveTo(-L / 2 + Math.cos(a * 0.5) * length * 0.5, Math.sin(a * 0.5) * length * 0.5, -L / 2 + Math.cos(a) * length, Math.sin(a) * length);
      }
      const width = Math.max(cell * 0.8, R * 0.09);
      return {
        length: L,
        paint: (ctx, by) => {
          stroke(ctx, hairs, tone(h.ink, amount, by), width);
          ctx.fillStyle = tone(h.ink, Math.min(1, amount * 1.3), by + 0.2);
          blob(ctx, -L / 2, 0, cell * 0.7, cell * 0.5, 0);
        },
      };
    }
  }
}

function fill(ctx: CanvasRenderingContext2D, path: Path2D, style: string | CanvasGradient) {
  ctx.fillStyle = style;
  ctx.fill(path);
}

function stroke(ctx: CanvasRenderingContext2D, path: Path2D, style: string, width: number) {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(path);
}

/**
 * Fill moved `by` along the ramp, deepest at the base and paler toward the
 * tip like the petals on the flower, from the first point of `rib` to its
 * last, blushing from `base` ink at the base.
 */
function ribFill(ctx: CanvasRenderingContext2D, rib: number[], ink: Ink, amount: number, by: number, base: Ink = ink) {
  const light = lightStrength();
  const n = rib.length;
  const g = ctx.createLinearGradient(rib[0], rib[1], rib[n - 2], rib[n - 1]);
  g.addColorStop(0, tone(base, amount, by + light));
  g.addColorStop(0.5, tone(ink, amount * 0.93, by));
  g.addColorStop(1, tone(ink, amount * 0.75, by));
  return g;
}

/** The same for a petal fanning out from a base `L` / 2 px back from its middle, `deep` deepening the base and paling the edge further. */
function fanFill(ctx: CanvasRenderingContext2D, L: number, ink: Ink, amount: number, by: number, base: Ink = ink, deep = 0) {
  const light = lightStrength();
  const g = ctx.createRadialGradient(-L / 2, 0, 0, -L / 2, 0, L);
  g.addColorStop(0, tone(base, amount, by + light + deep));
  g.addColorStop(0.45, tone(ink, amount * 0.93, by));
  g.addColorStop(1, tone(ink, amount * 0.75, by - deep));
  return g;
}

/**
 * A petal along a midrib `L` px long that turns `bend` radians from base to
 * tip, up to `W` px across. It widens from its base and narrows to its tip as
 * `taper` says (low is blunt, 1 pointed), and its edges ripple by `ruffle` of
 * the width toward the tip. Returns its outline, and its midrib as x, y pairs
 * from base to tip, both about the middle of the line from base to tip.
 */
function blade(L: number, W: number, bend: number, [p, q]: [number, number], ruffle = 0) {
  const n = 20;
  const peak = (p / (p + q)) ** p * (q / (p + q)) ** q;
  const rib: number[] = [];
  const edges: [number[], number[]] = [[], []];
  let x = 0;
  let y = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = bend * (t - 0.5);
    if (i > 0) {
      x += Math.cos(a - bend / n / 2) * (L / n);
      y += Math.sin(a - bend / n / 2) * (L / n);
    }
    rib.push(x, y);
    const half = (((W / 2) * t ** p * (1 - t) ** q) / peak) * (1 + ruffle * t * Math.sin(t * 17));
    edges[0].push(x - Math.sin(a) * half, y + Math.cos(a) * half);
    edges[1].push(x + Math.sin(a) * half, y - Math.cos(a) * half);
  }
  const cx = (rib[0] + rib[2 * n]) / 2;
  const cy = (rib[1] + rib[2 * n + 1]) / 2;
  for (const pts of [rib, ...edges]) {
    for (let i = 0; i < pts.length; i += 2) {
      pts[i] -= cx;
      pts[i + 1] -= cy;
    }
  }
  const path = new Path2D();
  for (let i = 0; i < edges[0].length; i += 2) path.lineTo(edges[0][i], edges[0][i + 1]);
  for (let i = edges[1].length - 2; i >= 0; i -= 2) path.lineTo(edges[1][i], edges[1][i + 1]);
  path.closePath();
  return { path, rib };
}

/** The stretch of a midrib from `from` to `to` of the way along it. */
function ribPath(rib: number[], from: number, to: number) {
  const n = rib.length / 2 - 1;
  const path = new Path2D();
  for (let i = Math.round(from * n); i <= Math.round(to * n); i++) path.lineTo(rib[2 * i], rib[2 * i + 1]);
  return path;
}

/**
 * A petal fanning out from a narrow base `L` / 2 px back from its middle: its
 * edge is `L` × `r(t)` px out from the base at `t` × `spread` radians off
 * straight out, for `t` from -1 to 1.
 */
function fan(L: number, spread: number, r: (t: number) => number) {
  const path = new Path2D();
  path.moveTo(-L / 2, 0);
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * 2 - 1;
    path.lineTo(-L / 2 + Math.cos(t * spread) * L * r(t), Math.sin(t * spread) * L * r(t));
  }
  path.closePath();
  return path;
}

/** The outer edge of a fan, out to `upto` of the way to either side. */
function fanEdge(L: number, spread: number, r: (t: number) => number, upto: number) {
  const path = new Path2D();
  for (let i = 0; i <= 30; i++) {
    const t = ((i / 30) * 2 - 1) * upto;
    path.lineTo(-L / 2 + Math.cos(t * spread) * L * r(t), Math.sin(t * spread) * L * r(t));
  }
  return path;
}

/** A fan's reach at `t`: all the way straight out, rounding down to under a third at the sides, sooner the higher `e`. */
function rounded(t: number, e: number) {
  return 0.28 + 0.72 * Math.cos((t * Math.PI) / 2) ** e;
}

/** A cosmos petal: a wedge from a narrow base, its broad tip cut into three teeth. */
function toothed(L: number, w: number) {
  const b = -L / 2;
  const path = new Path2D();
  path.moveTo(b, 0);
  path.bezierCurveTo(b + L * 0.3, -w * 0.9, b + L * 0.8, -w * 1.1, b + L, -w * 0.6);
  path.lineTo(b + L * 0.78, -w * 0.3);
  path.lineTo(b + L, 0);
  path.lineTo(b + L * 0.78, w * 0.3);
  path.lineTo(b + L, w * 0.6);
  path.bezierCurveTo(b + L * 0.8, w * 1.1, b + L * 0.3, w * 0.9, b, 0);
  path.closePath();
  return path;
}
