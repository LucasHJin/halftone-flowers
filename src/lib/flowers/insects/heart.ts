/**
 * The heart an insect sends up when it's clicked or tapped. A line like its
 * trail comes out of the top of it, weaves up and runs into the heart's point,
 * then on round the heart, one lobe and then the other, back to the point.
 * The line in thins and fades from the insect's end, as a trail does, so the
 * heart is left on its own; then it swells a little, and thins and fades away.
 * Like the insect's trail, it stays at the depth the insect was at.
 */
import { clamp, lerp } from "../../../utils/math";
import type { HeartSettings, TrailSettings } from "../settings";
import type { Insect } from "./insect";
import { strokeSegment } from "./trail";

type Point = [number, number];

/** Px between the points it's stroked through. */
const SPACING = 2.5;

/** Seconds each part of the line in stays at full strength once drawn, then takes to thin and fade. */
const HOLD = 0.1;
const FADE = 0.35;

/** How far above an insect's middle the line comes out, as a share of its size. */
const TOP = 0.42;

/** Points along a path, how far along it each is as a share of its length, and its length. */
interface Path {
  points: Point[];
  at: number[];
  length: number;
}

function pathOf(points: Point[]): Path {
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = at[at.length - 1] || 1;
  return { points, at: at.map((s) => s / length), length };
}

/** The point `v` of the way along `p`. */
function pointOn(p: Path, v: number): Point {
  let lo = 0;
  let hi = p.at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.at[mid] <= v) lo = mid;
    else hi = mid;
  }
  const f = clamp((v - p.at[lo]) / (p.at[hi] - p.at[lo] || 1), 0, 1);
  return [lerp(p.points[lo][0], p.points[hi][0], f), lerp(p.points[lo][1], p.points[hi][1], f)];
}

/** Points along the cubic Bézier from `a` to `d`. */
function bezier(a: Point, b: Point, c: Point, d: Point, steps = 32): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    const [wa, wb, wc, wd] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [wa * a[0] + wb * b[0] + wc * c[0] + wd * d[0], wa * a[1] + wb * b[1] + wc * c[1] + wd * d[1]] as Point;
  });
}

/**
 * A heart 2 across, y down, its point at (0, 1) and its lobes reaching up to
 * -0.85: from the point up its left side, over the left lobe into the dip,
 * over the right lobe and back down to the point.
 */
const HEART = pathOf(
  (
    [
      [[0, 1], [-0.5, 0.5], [-1, 0.2], [-1, -0.25]],
      [[-1, -0.25], [-1, -0.62], [-0.75, -0.85], [-0.5, -0.85]],
      [[-0.5, -0.85], [-0.2, -0.85], [0, -0.65], [0, -0.45]],
      [[0, -0.45], [0, -0.65], [0.2, -0.85], [0.5, -0.85]],
      [[0.5, -0.85], [0.75, -0.85], [1, -0.62], [1, -0.25]],
      [[1, -0.25], [1, 0.2], [0.5, 0.5], [0, 1]],
    ] as [Point, Point, Point, Point][]
  ).flatMap((curve, i) => bezier(...curve).slice(i ? 1 : 0)),
);

export interface Heart {
  /** The insect the line comes out of, followed until the line reaches the heart; then null. */
  from: Insect | null;
  /** Where the line comes out: the top of the insect. */
  x: number;
  y: number;
  /** Depth among the plants: the insect's when it was clicked. */
  z: number;
  /** How the line in leaves the insect, px from where it comes out, and how it comes into the heart's point, as its curve's control points. */
  out: Point;
  into: Point;
  /** The heart's point and middle, px half across, and radians turned clockwise. */
  tip: Point;
  mid: Point;
  r: number;
  tilt: number;
  /** 1 to draw its left lobe first, -1 its right. */
  hand: number;
  /** Garden time it was sent up; seconds to draw it, the share of them spent on the line in, then seconds to swell and fade, and how much it swells, as a share of its size. */
  born: number;
  draw: number;
  lead: number;
  fade: number;
  swell: number;
}

/** Where the line comes out of `b`: just above it. */
export function topOf(b: Insect): Point {
  return [b.x, b.y + b.bob - TOP * b.size * lerp(0.85, 1.1, clamp(b.z, 0, 1))];
}

/** A heart rising out of `b` at garden time `now`, `bloom` px to a base flower size, picked from `settings`. */
export function sendHeart(b: Insect, bloom: number, settings: HeartSettings, now: number): Heart {
  const pick = ([lo, hi]: [number, number]) => lerp(lo, hi, Math.random());
  const [x, y] = topOf(b);
  const r = (pick(settings.size) * bloom) / 2;
  const hand = Math.random() < 0.5 ? 1 : -1;
  const tilt = lerp(-0.3, 0.3, Math.random());
  // Its point a little above the insect and off to the side the line will come in from, which the lobe it draws first leans away from.
  const rise = r * lerp(0.9, 1.5, Math.random());
  const tip: Point = [x - hand * r * lerp(0, 0.6, Math.random()), y - rise];
  const [sin, cos] = [Math.sin(tilt), Math.cos(tilt)];
  const mid: Point = [tip[0] + r * sin, tip[1] - r * cos];
  // Out of the insect upward, swinging out the other way first, then into the point along the first side, so it runs on round the heart unbroken.
  const k = rise * 0.5;
  const out: Point = [hand * k * lerp(0.2, 1.1, Math.random()), -k];
  const [dx, dy] = [-hand / Math.SQRT2, -1 / Math.SQRT2];
  const into: Point = [tip[0] - (dx * cos - dy * sin) * k, tip[1] - (dx * sin + dy * cos) * k];
  const lineIn = pathOf(bezier([x, y], [x + out[0], y + out[1]], into, tip)).length;
  return {
    from: b,
    x,
    y,
    z: b.z,
    out,
    into,
    tip,
    mid,
    r,
    tilt,
    hand,
    born: now,
    draw: pick(settings.draw),
    lead: clamp(lineIn / (lineIn + HEART.length * r), 0.15, 0.35),
    fade: pick(settings.fade),
    swell: pick(settings.swell),
  };
}

/** Keeps the line coming out of its insect until it reaches the heart. Returns whether it's still showing at garden time `now`. */
export function follow(h: Heart, now: number, insects: readonly Insect[]) {
  const age = now - h.born;
  if (h.from && age < h.draw * h.lead && insects.includes(h.from)) [h.x, h.y] = topOf(h.from);
  else h.from = null;
  return age < h.draw + h.fade;
}

/** Paints it as it is at garden time `now`, in the insects' trail's width and strength, moved `shade` along the ramp. */
export function paintHeart(ctx: CanvasRenderingContext2D, h: Heart, now: number, settings: TrailSettings, shade: number) {
  const age = now - h.born;
  const drawn = age / h.draw;
  const lineIn = pathOf(bezier([h.x, h.y], [h.x + h.out[0], h.y + h.out[1]], h.into, h.tip));
  stroke(ctx, lineIn, ([x, y]) => [x, y], Math.min(1, drawn / h.lead), (v) => 1 - (age - h.draw * h.lead * v - HOLD) / FADE, settings, shade);
  if (drawn <= h.lead) return;
  // Once round, it swells, quickly at first, and fades as it slows.
  const after = clamp((age - h.draw) / h.fade, 0, 1);
  const size = h.r * (1 + h.swell * (1 - (1 - after) ** 3));
  const fresh = Math.min(1, (1 - after) / 0.65);
  const [sin, cos] = [Math.sin(h.tilt), Math.cos(h.tilt)];
  const [mx, my] = h.mid;
  const place = ([x, y]: Point): Point => {
    x *= h.hand * size;
    y *= size;
    return [mx + x * cos - y * sin, my + x * sin + y * cos];
  };
  stroke(ctx, HEART, place, Math.min(1, (drawn - h.lead) / (1 - h.lead)), () => fresh, settings, shade, size);
}

/** Strokes `p` from its start to `upTo` of the way along, each piece as fresh as `fresh` says where it ends. `scale` is how many px one of its units is. */
function stroke(
  ctx: CanvasRenderingContext2D,
  p: Path,
  place: (pt: Point) => Point,
  upTo: number,
  fresh: (v: number) => number,
  settings: TrailSettings,
  shade: number,
  scale = 1,
) {
  const n = Math.max(1, Math.ceil((p.length * scale) / SPACING));
  let [ax, ay] = place(pointOn(p, 0));
  for (let k = 1; k <= n; k++) {
    const v = Math.min(k / n, upTo);
    const [bx, by] = place(pointOn(p, v));
    strokeSegment(ctx, ax, ay, bx, by, fresh(v), settings, shade);
    if (v >= upTo) return;
    [ax, ay] = [bx, by];
  }
}
