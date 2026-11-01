/**
 * Single petals as they look once they've come loose, each drawn like the ones
 * still on its kind of head and taken from that flower's own: its inks and
 * blush, how long that petal was, how many it had, and whatever marks it
 * carries (a poppy's blotch, the beard on an iris fall, a foxglove's dark
 * mouth). Spikes, clusters
 * and plumes shed whole florets or pairs of hairs instead.
 *
 * Each is drawn about its middle, its base toward -x and its tip toward +x.
 * Seen alone and small, a loose petal is drawn a little bigger than on its
 * flower, and never so small that its shape is lost among the dots. A spike's
 * florets and a plume's hairs are fine parts of a long, thin flower, so they
 * come off as they were on it, only a little bigger, their sides lit as they
 * were there.
 *
 * Petals are told apart by the index each is drawn at on its head, which is
 * what a head's `lost` holds once they're shaken off.
 */
import { lerp, TAU } from "../../../utils/math";
import { SEGMENTS } from "../stem";
import type { Head, Ink, Stem } from "../types";
import { florets } from "./heads/cluster";
import { cupSectors, cupShape } from "./heads/cup";
import { RINGS } from "./heads/globe";
import { headFrame, point } from "./heads/petals";
import { hairPair, HAIR_STEPS, SWEEP } from "./heads/plume";
import { BELL_HANG, BELL_TURN, bellSide, spikeFloret } from "./heads/spike";
import { along, blob, lightStrength, litBy, tone } from "./tone";

/** Paints a loose petal moved `by` along the ramp, for which side of it faces you. */
export type LoosePaint = (ctx: CanvasRenderingContext2D, by: number) => void;

export interface LooseLook {
  paint: LoosePaint;
  /** Px across its longest way. */
  length: number;
  /** How many times bigger it's drawn than it was on its flower. */
  scale: number;
}

/** Turns a petal `length` by `width` px on its flower into the size it's drawn loose, at least `least` dots long and `wide` across; 0 for just a little bigger. */
type Fit = (length: number, width: number, least?: number, wide?: number) => [number, number];

/** How much bigger than on its flower a loose petal is drawn, at least; small ones are drawn bigger still to reach their fewest dots long. */
const EXAGGERATE = 1.15;

/** Most times bigger than on its flower a loose petal is drawn, so one off a small flower isn't out of all proportion to it. */
const MOST_GROWN = 1.8;

/** Fewest dots across a loose petal, so its outline still shows, unless that would make it as wide as it's long. */
const MIN_WIDE = 1.8;

/** How many of a plume's hairs lie over each other along it. */
const OVERLAP = 3;

/** Petal `k` of the head on `s` as it looks loose, `size` times as big as it would otherwise be. */
export function looseLook(s: Stem, h: Head, k: number, cell: number, size: number): LooseLook {
  let scale = 1;
  // Bigger than on the flower, and if it can be without growing out of proportion, at least `least` dots long and `wide` across.
  const fit: Fit = (length, width, least = 4.5, wide = MIN_WIDE) => {
    scale = size * Math.min(MOST_GROWN, Math.max(EXAGGERATE, (cell * least) / length));
    const L = length * scale;
    return [L, Math.max(width * scale, Math.min(cell * wide * size, L * 0.45))];
  };
  return { ...shapeOf(s, h, k, cell, fit), scale };
}

function shapeOf(s: Stem, h: Head, k: number, cell: number, fit: Fit): Omit<LooseLook, "scale"> {
  const R = h.radius;
  const rand = Math.random;
  const jitter = h.jitter[k % h.jitter.length];
  // White petals blush toward the centre's ink at the base.
  const base: Ink = h.blush ? h.centre : h.ink;
  const amount = h.tone;
  // Which way it curls.
  const side = rand() < 0.5 ? -1 : 1;

  switch (h.kind) {
    case "daisy": {
      // A long, narrow ray, blunt at the tip; the more rays the daisy has, the narrower each.
      const [L, W] = fit(R * 0.95 * jitter, 2 * R * Math.min(0.11, 1.25 / h.petals), 6, 1.1);
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
      const [L, W] = fit(R * (Math.floor((k * 2) / h.petals) ? 0.82 : 1) * jitter, R * 0.46, 6);
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
      if (k < 3) {
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
      // Big, cupped and ruffled into lobes, deep at the base and pale at the edge, as long and broad as its ring's.
      const ring = ringOf(k);
      const [L] = fit(R * ring.length * jitter, R * ring.width);
      const ruffle = rand() * TAU;
      const path = fan(L, 1.15, (t) => rounded(t, 0.5) * (1 + 0.1 * Math.sin(3 * Math.PI * t + ruffle)));
      return { length: L, paint: (ctx, by) => fill(ctx, path, fanFill(ctx, L, h.ink, amount, by, h.ink, 0.1)) };
    }
    case "bud": {
      // The tip of its furled petals, the only part of them that showed: narrow and pointed.
      const [L, W] = fit(R * 0.55, R * 0.3);
      const b = blade(L, W, side * lerp(0, 0.3, rand()), [0.5, 0.6]);
      return { length: L, paint: (ctx, by) => fill(ctx, b.path, ribFill(ctx, b.rib, h.ink, amount, by)) };
    }
    case "cluster": {
      // A whole floret: five round petals about a deeper eye, smaller off a fork.
      const size = florets(s, h, 0)[k].size;
      const [L] = fit(R * 0.4 * size, R * 0.4 * size, 4);
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
      // Drawn as paintSpike draws it, x along the stem's right and -y up it, each side lit as the side of the stem it was on.
      const floret = spikeFloret(h, k);
      if (h.style === 1) {
        // A foxglove bell, along x from where it hung to its dark mouth, lit as the side of the stem it hung on.
        const [L] = fit(floret.size * 2.1, floret.size * 1.1, 0);
        const u = L / 2.1;
        const side = bellSide(k);
        const out: [number, number] = [-Math.sin(BELL_TURN), -side * Math.cos(BELL_TURN)];
        return {
          length: L,
          paint: (ctx, by) => {
            ctx.fillStyle = tone(h.ink, floret.amount, by + litBy(...out));
            blob(ctx, 0, 0, 1.05 * u, 0.55 * u, 0);
            ctx.fillStyle = tone(h.ink === 1 ? 0 : 1, 0.7, by);
            blob(ctx, 0.65 * u, 0, 0.2 * u, 0.3 * u, 0);
          },
        };
      }
      if (h.style === 2) {
        // A whorl of lavender: a floret either side of the stem.
        const [L] = fit(floret.size * 2.1, floret.size * 0.9, 0);
        const u = L / 2.1;
        return {
          length: L,
          paint: (ctx, by) => {
            for (const side of [-1, 1]) {
              ctx.fillStyle = tone(h.ink, floret.amount, by + litBy(side, 0));
              blob(ctx, side * 0.5 * u, 0, 0.55 * u, 0.45 * u, side * 0.6);
            }
          },
        };
      }
      // A lupine's pea flower: two wings, and the banner standing over them. On the spike they spread wide, stacking into its cone; alone, they close up round the banner, or the floret reads as a bar.
      const [L] = fit(floret.size * 2.1, floret.size * 1.5, 0);
      const u = L / 2.1;
      return {
        length: L,
        paint: (ctx, by) => {
          for (const side of [-1, 1]) {
            ctx.fillStyle = tone(h.ink, floret.amount, by + litBy(side, 0));
            blob(ctx, side * 0.45 * u, 0.15 * u, 0.6 * u, 0.55 * u, side * 0.5);
          }
          ctx.fillStyle = tone(h.ink, floret.amount, by);
          blob(ctx, 0, -0.3 * u, 0.55 * u, 0.5 * u, 0);
        },
      };
    }
    case "plume": {
      // A pair of its hairs, splayed from where they grew as they were on the plume and as pale. On the plume, hairs overlap a few deep, which is what prints; alone, they're drawn that much thicker, so they carry as much ink, and stay that fine however long.
      const pair = hairPair(h, k);
      const [L] = fit(pair.length, pair.length * Math.sin(pair.spread) * 2, 0);
      const hairs = new Path2D();
      for (const side of [-1, 1]) {
        hairs.moveTo(-L / 2, 0);
        hairs.lineTo(-L / 2 + Math.cos(pair.spread) * L, side * Math.sin(pair.spread) * L);
      }
      return { length: L, paint: (ctx, by) => stroke(ctx, hairs, tone(h.ink, pair.amount, by), OVERLAP * pair.width) };
    }
  }
}

/** The indices a head draws its petals at (or its florets, or its pairs of plume hairs), whether or not they've been shaken off. */
export function petalIndices(s: Stem, h: Head): number[] {
  const all = (n: number) => Array.from({ length: n }, (_, i) => i);
  switch (h.kind) {
    case "poppy":
    case "tulip":
    case "rose":
      return all(cupSectors(h).length);
    case "bud":
      return [0];
    case "cluster":
      return all(florets(s, h, 0).length);
    case "spike":
      // Lavender leaves gaps between its whorls (see paintSpike).
      return all(h.petals).filter((i) => !(h.style === 2 && i % 2 === 1 && i < h.petals - 3));
    case "plume":
      return all(HAIR_STEPS + 1);
    default:
      return all(h.petals);
  }
}

/**
 * Where the middle of petal `k` of the head on `s` is on screen as it's posed
 * at time `t`, which way its own x runs as looseLook draws it (`a`), and which
 * way it points out from the head (`out`), radians clockwise from rightward.
 * Near enough to where its head draws it for one to take over from the other.
 */
export function petalAt(s: Stem, h: Head, k: number, t: number) {
  const R = h.radius;
  if (h.kind === "spike") {
    // Where paintSpike draws it: nudged off the stem toward the stem's right, (cos p.a, sin p.a), by its drift, a bell hanging out from there.
    const floret = spikeFloret(h, k);
    const p = along(s, floret.along);
    const x = p.x + Math.cos(p.a) * h.drift[k] * floret.size;
    const y = p.y + Math.sin(p.a) * h.drift[k] * floret.size;
    if (h.style !== 1) return { x, y, a: p.a, out: p.a + (h.drift[k] >= 0 ? 0 : Math.PI) };
    const side = bellSide(k);
    const b = p.a + side * BELL_TURN;
    const hang = BELL_HANG * floret.size;
    return { x: x - Math.sin(b) * hang, y: y + Math.cos(b) * hang, a: b + Math.PI / 2, out: p.a + (side > 0 ? 0 : Math.PI) };
  }
  if (h.kind === "plume") {
    // Halfway along the pair of hairs, which reach up the stem, swept back. Every other pair is on the stem's left.
    const pair = hairPair(h, k);
    const p = along(s, pair.along);
    const up = p.a + SWEEP - Math.PI / 2;
    return { x: p.x + (Math.cos(up) * pair.length) / 2, y: p.y + (Math.sin(up) * pair.length) / 2, a: up, out: p.a + (k % 2 ? 0 : Math.PI) };
  }
  // Where it is in the head's own frame at the top of the stem, and the middle it points out from.
  let x = 0;
  let y = 0;
  let cx = 0;
  let cy = 0;
  switch (h.kind) {
    case "daisy":
    case "cosmos":
    case "lily": {
      // Halfway out along it, on the disc tilted as paintDisc tilts it.
      const n = h.petals;
      const ring = h.kind === "lily" ? Math.floor((k * 2) / n) : 0;
      const slot = h.kind === "lily" ? (k % (n / 2)) * 2 + ring : k;
      const phi = h.spin + ((slot + h.drift[k]) / n) * TAU;
      const u = Math.cos(phi) * R * h.jitter[k] * 0.55;
      const v = Math.sin(phi) * R * h.jitter[k] * 0.55;
      cy = -R * (0.12 + 0.3 * (1 - h.face));
      x = Math.cos(h.turn) * u + Math.sqrt(1 - h.face * h.face) * Math.sin(h.turn) * v;
      y = cy + h.face * v;
      break;
    }
    case "turksCap":
    case "daffodil": {
      const phi = h.spin + ((k + h.drift[k]) / 6) * TAU;
      [x, y] = point(headFrame(h.face, h.turn), phi, R * 0.5, h.kind === "turksCap" ? R * 0.25 : 0);
      break;
    }
    case "iris": {
      // Standards stand up over the middle, falls reach out and down between them.
      const up = k < 3;
      const phi = h.spin + (((k % 3) + (up ? 0 : 0.5) + h.drift[k]) / 3) * TAU;
      [x, y] = point(headFrame(h.face, h.turn), phi, R * (up ? 0.3 : 0.7), R * (up ? 0.6 : 0.1));
      break;
    }
    case "peony": {
      const ring = ringOf(k);
      const phi = h.spin + ((ring.at + 0.5 * ring.index + h.drift[k]) / ring.n) * TAU;
      const half = R * ring.length * 0.5;
      [x, y] = point(headFrame(h.face, h.turn), phi, R * ring.start[0] + half * Math.cos(ring.heading), R * ring.start[1] + half * Math.sin(ring.heading));
      break;
    }
    case "poppy":
    case "tulip":
    case "rose": {
      // On the side of the bowl, in the middle of its sector, skewed as the cup is.
      const cup = cupShape(h);
      const [from, to] = cupSectors(h)[k];
      const a = (from + to) / 2;
      y = -cup.height * 0.7 * cup.cosT + cup.widest * Math.sin(a) * cup.sinT;
      x = cup.widest * Math.cos(a) + cup.skew * y;
      cy = cup.top * 0.5;
      cx = cup.skew * cy;
      break;
    }
    case "cluster": {
      const f = florets(s, h, t)[k];
      x = f.x;
      y = f.y;
      break;
    }
    case "bud": {
      // Its tip, leaning the way the head is turned (see paintBud).
      const lean = -0.4 * Math.sin(h.turn);
      y = -0.85 * R * 1.1;
      x = lean * y;
      cy = -0.45 * R * 1.1;
      cx = lean * cy;
      break;
    }
  }
  const turn = s.angle[SEGMENTS - 1] + s.nod;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const a = turn + Math.atan2(y - cy, x - cx);
  return { x: s.x[SEGMENTS] + x * cos - y * sin, y: s.y[SEGMENTS] + x * sin + y * cos, a, out: a };
}

/** The ring of a peony's petal `k` is in (see paintGlobe), with which ring it is and where in it the petal comes. */
function ringOf(k: number) {
  let at = k;
  let index = 0;
  while (index < RINGS.length - 1 && at >= RINGS[index].n) at -= RINGS[index++].n;
  return { ...RINGS[index], index, at };
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
