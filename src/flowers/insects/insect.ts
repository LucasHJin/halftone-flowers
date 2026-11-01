import { clamp, lerp, TAU } from "../../utils/math.js";
import { along } from "../paint/tone.js";
import { SEGMENTS } from "../stem.js";
import type { Kind, Plant, Stem } from "../types.js";
import type { Trail } from "./trail.js";

export type InsectKind = "butterfly" | "bee";

/** Flying to a flower, hovering by it, coming down onto it, sitting on it, or heading off screen. */
export type Phase = "flying" | "hovering" | "alighting" | "landed" | "leaving";

/** How many of an insect's sizes it flies to cross the bed from back to front. */
export const DEPTH = 5;

/** An insect's radius as a share of its size; within this of a flower's head, it's over it. */
export const REACH = 0.5;

export interface Flower {
  plant: Plant;
  stem: Stem;
}

export interface Insect {
  kind: InsectKind;
  /** Index into its group's `species`. */
  species: number;
  /** Px: about its body length. */
  size: number;
  x: number;
  y: number;
  /** Depth among the plants, from 0 at the back to 1 at the front. */
  z: number;
  /** Px a second right, down, and toward the viewer. */
  vx: number;
  vy: number;
  vz: number;
  /** Acceleration, px a second squared, the same ways. */
  ax: number;
  ay: number;
  az: number;
  /** Depth it drifts toward while leaving. */
  zGoal: number;
  phase: Phase;
  /** The flower it's flying to or sitting on. */
  plant: Plant | null;
  stem: Stem | null;
  /** The flower it last left, until it's 2 sizes clear of its head. */
  last: Flower | null;
  /** Which side of the flower it hovers: -1 left, 1 right. */
  side: number;
  /** Whether it hovers by its next flower before deciding to settle. */
  hovers: boolean;
  /** Angle of the head it sits on, radians clockwise from up. */
  lean: number;
  /** Seconds left hovering or sitting. */
  timer: number;
  /** Flowers left to visit after the one it's on its way to. */
  visits: number;
  /** Off-screen point it leaves toward. */
  exitX: number;
  exitY: number;
  /** Seconds since it arrived. */
  age: number;
  /** Three random phases, radians, and a multiplier on its wander rate. */
  wobble: [number, number, number, number];
  quirks: Quirks;
  /** 1 in flight, 0 sitting, easing between. */
  air: number;
  /** Wing-beat phase, radians. */
  flap: number;
  /** Wing angle above level, radians. */
  wing: number;
  /** Drawn offset from `y`, px, as it bobs in flight. */
  bob: number;
  /** Which way it faces, radians from facing right toward facing the viewer. */
  yaw: number;
  /** `yaw` it settles to on a flower. */
  rest: number;
  /** Nose up, radians. */
  pitch: number;
  /** Banked right side down, radians. */
  roll: number;
  /** Screen rotation, radians clockwise; follows part of its flower's lean while perched. */
  tilt: number;
  trail: Trail;
}

/** Per-insect variation on its kind. */
export interface Quirks {
  /** Multiple of its kind's speed, acceleration, turn rate and wing beat; its species' times its own. */
  pace: number;
  /** Radians added to its flight's pitch (nose up) and roll (right side down). */
  pitch: number;
  roll: number;
  /** Radians turned toward the viewer from its heading; negative turns away. */
  turn: number;
  /** How far the viewer looks down on it, radians. */
  view: number;
  /** Multiple of its kind's wing stroke. */
  stroke: number;
}

export function randomQuirks(): Quirks {
  const pick = (lo: number, hi: number) => lerp(lo, hi, Math.random());
  return { pace: pick(0.7, 1.4), pitch: pick(-0.2, 0.2), roll: pick(-0.15, 0.15), turn: pick(-0.7, 0.7), view: pick(0.1, 0.55), stroke: pick(0.8, 1.15) };
}

/** Distances are in multiples of the insect's size. */
export interface FlightStyle {
  /** Cruising speed, sizes a second. */
  cruise: number;
  /** Seconds to reach a new velocity, if `accel` allows. */
  agility: number;
  /** Max acceleration in any direction, sizes a second squared. */
  accel: number;
  /** Fastest its body turns, radians a second. */
  turn: number;
  /** Max bank into turns, radians. */
  bank: number;
  /** Max heading stray either side of its goal, radians. */
  wander: number;
  /** Wander frequency, cycles a second. */
  wanderRate: number;
  /** Steepest it flies down while well off its goal, radians below level. */
  dive: number;
  /** Quick flicker on top of the wandering, radians. */
  flutter: number;
  /** Share of visits where it hovers before deciding; otherwise it lands directly. */
  hovers: number;
  /** Range of seconds it hovers by a flower. */
  hover: [number, number];
  /** How far it drifts about while hovering, sizes. */
  drift: number;
  /** Share of hovers it leaves without settling. */
  skip: number;
  /** Radians it turns back and forth while perched. */
  crawl: number;
  /** Odds of visiting each kind of flower; kinds left out are never visited. */
  likes: Partial<Record<Kind, number>>;
}

export interface Species {
  name: string;
  /** Multiple of its kind's size. */
  size: number;
  /** Multiplied into each insect's `quirks.pace`. */
  pace: number;
  /** Multiple of its kind's `wanderRate`. */
  weave: number;
  /** Relative odds against the other species of its kind. */
  odds: number;
}

export interface InsectGroup {
  /** Multiple of the base flower size. */
  size: number;
  species: readonly Species[];
  flight: FlightStyle;
  /** Advances `air`, wings, bob, pitch and tilt by `dt` seconds; `rate` scales the wing beat. */
  animate(b: Insect, dt: number, rate: number): void;
  /** Paints it in the tone image, centred on the origin, `s` px to its size. */
  paint(ctx: CanvasRenderingContext2D, b: Insect, s: number): void;
}

/** How far out from the top of the stem a flower's middle is, as a share of its radius. */
const MIDDLE: Partial<Record<Kind, number>> = {
  poppy: 0.45,
  tulip: 1,
  rose: 0.65,
  peony: 0.6,
  iris: 0.6,
  daffodil: 0.45,
  turksCap: 0.25,
  cluster: 0.55,
  bud: 0.6,
};

/** Perch point on the head of `s` as currently posed, and the head's angle, radians clockwise from up. */
export function perch(s: Stem) {
  const h = s.head!;
  if (h.kind === "spike" || h.kind === "plume") {
    const p = along(s, 1 - h.reach * 0.45);
    return { x: p.x, y: p.y, angle: p.a };
  }
  const angle = s.angle[SEGMENTS - 1] + s.nod;
  // A disc sits further out the more it's tilted (see paintDisc).
  const out = h.radius * (MIDDLE[h.kind] ?? 0.12 + 0.3 * (1 - h.face));
  return { x: s.x[SEGMENTS] + Math.sin(angle) * out, y: s.y[SEGMENTS] - Math.cos(angle) * out, angle };
}

/** Px from (x, y) to the edge of the head on `s` as currently posed; negative inside it. */
export function clearOf(s: Stem, x: number, y: number) {
  const h = s.head!;
  if (h.kind === "spike" || h.kind === "plume") {
    // Florets or hairs line the stem's top `reach`; the lowest spike florets reach out furthest.
    let d = Infinity;
    for (let k = Math.floor(SEGMENTS * (1 - h.reach)); k < SEGMENTS; k++) {
      const ax = s.x[k];
      const ay = s.y[k];
      const bx = s.x[k + 1] - ax;
      const by = s.y[k + 1] - ay;
      const u = clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1), 0, 1);
      d = Math.min(d, Math.hypot(ax + bx * u - x, ay + by * u - y));
    }
    return d - h.radius * (h.kind === "spike" ? 1.5 : 1);
  }
  const p = perch(s);
  return Math.hypot(x - p.x, y - p.y) - h.radius * 1.1;
}

/** First point `margin` px clear of the head on `s`, out from its middle along (dx, dy), or along x toward `side` if that's under 1 px. */
export function beside(s: Stem, dx: number, dy: number, margin: number, side: number): [number, number] {
  const p = perch(s);
  const d = Math.hypot(dx, dy);
  const [ux, uy] = d > 1 ? [dx / d, dy / d] : [side, 0];
  const step = Math.max(2, margin / 4);
  let t = 0;
  while (t < 2000 && clearOf(s, p.x + ux * t, p.y + uy * t) < margin) t += step;
  return [p.x + ux * t, p.y + uy * t];
}

/**
 * Flies toward (gx, gy) at depth gz at up to `speed` px a second, slowing within
 * `slow` sizes, accelerating at most `style.accel`. Far off, its heading wanders;
 * a goal steeply below is reached in a curve. Returns px to the goal before moving.
 */
export function steer(b: Insect, style: FlightStyle, gx: number, gy: number, gz: number, speed: number, dt: number, slow = 2.5) {
  const depth = b.size * DEPTH;
  let dx = gx - b.x;
  let dy = gy - b.y;
  let dz = (gz - b.z) * depth;
  const dist = Math.hypot(dx, dy, dz);
  const [p1, p2, p3, rate] = b.wobble;
  const t = b.age * style.wanderRate * rate * TAU;
  const far = clamp(dist / (b.size * 4) - 0.25, 0, 1);
  // Goal below steeper than `limit`: descend at `limit`, heading partly round the goal, more the steeper.
  // `limit` is vertical within 0.5 sizes of the goal and `style.dive` beyond 1.5.
  const flat = Math.hypot(dx, dz);
  const steep = Math.atan2(dy, flat);
  const limit = lerp(Math.PI / 2, style.dive, clamp(dist / b.size - 0.5, 0, 1));
  if (steep > limit) {
    let [tx, tz] = [Math.cos(b.yaw), Math.sin(b.yaw)];
    let [ix, iz] = [tz, -tx];
    if (flat > b.size * 0.25) {
      [ix, iz] = [dx / flat, dz / flat];
      // Round whichever way it's already going.
      const turn = Math.sign(b.vz * ix - b.vx * iz) || 1;
      [tx, tz] = [-iz * turn, ix * turn];
    }
    const round = ((steep - limit) / (Math.PI / 2 - limit)) * (Math.PI / 2);
    const across = dist * Math.cos(limit);
    dx = across * (ix * Math.cos(round) + tx * Math.sin(round));
    dz = across * (iz * Math.cos(round) + tz * Math.sin(round));
    dy = dist * Math.sin(limit);
  }
  const turn = far * ((style.wander * (Math.sin(t + p1) + 0.6 * Math.sin(2.3 * t + p2))) / 1.6 + style.flutter * Math.sin(7.3 * t + p3));
  const rise = far * 0.4 * style.wander * Math.sin(1.7 * t + p3);
  const n = dist || 1;
  const ux = (dx * Math.cos(turn) - dz * Math.sin(turn)) / n;
  const uy = dy / n - rise;
  const uz = (dx * Math.sin(turn) + dz * Math.cos(turn)) / n;
  const want = (speed * clamp(dist / (b.size * slow), 0, 1)) / (Math.hypot(ux, uy, uz) || 1);
  let ax = (ux * want - b.vx) / style.agility;
  let ay = (uy * want - b.vy) / style.agility;
  let az = (uz * want - b.vz) / style.agility;
  const hard = Math.hypot(ax, ay, az) / (style.accel * b.size * b.quirks.pace);
  if (hard > 1) {
    ax /= hard;
    ay /= hard;
    az /= hard;
  }
  b.ax = ax;
  b.ay = ay;
  b.az = az;
  b.vx += ax * dt;
  b.vy += ay * dt;
  b.vz += az * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += (b.vz / depth) * dt;
  if (b.z < -0.15 || b.z > 1.2) {
    b.z = clamp(b.z, -0.15, 1.2);
    b.vz = 0;
  }
  return dist;
}

/**
 * Turns `yaw` toward `rest` when landed, else `face` (px across and toward the
 * viewer), else its heading, at most `style.turn` radians a second, so it swings
 * through facing the viewer or away. Banks with sideways acceleration.
 */
export function orient(b: Insect, style: FlightStyle, dt: number, face?: [number, number]) {
  let want = b.yaw;
  if (b.phase === "landed") want = b.rest + style.crawl * Math.sin(b.age * 0.5 + b.wobble[1]);
  else if (face) want = Math.atan2(face[1], face[0]);
  else if (Math.hypot(b.vx, b.vz) > b.size * 0.3) want = Math.atan2(b.vz, b.vx);
  const diff = wrap(want - b.yaw);
  const turn = style.turn * b.quirks.pace * dt;
  b.yaw = wrap(b.yaw + clamp(diff * (1 - Math.exp(-dt / 0.12)), -turn, turn));
  const lateral = b.az * Math.cos(b.yaw) - b.ax * Math.sin(b.yaw);
  b.roll = ease(b.roll, clamp(lateral / (style.accel * b.size * b.quirks.pace), -1, 1) * style.bank * b.air, 0.1, dt);
}

/** How hard it's speeding up the way it faces, as a share of the hardest it can. */
export function surge(b: Insect, style: FlightStyle) {
  return clamp((b.ax * Math.cos(b.yaw) + b.az * Math.sin(b.yaw)) / (style.accel * b.size * b.quirks.pace), -1, 1);
}

/** How fast it's flying the way it faces, as a share of its cruising speed. */
export function headway(b: Insect, style: FlightStyle) {
  return clamp((b.vx * Math.cos(b.yaw) + b.vz * Math.sin(b.yaw)) / (style.cruise * b.size * b.quirks.pace), 0, 1);
}

/** How fast it's climbing, as a share of its cruising speed. */
export function climb(b: Insect, style: FlightStyle) {
  return clamp(-b.vy / (style.cruise * b.size * b.quirks.pace), -1, 1);
}

/** `a` radians, brought within half a turn of 0. */
export function wrap(a: number) {
  return a - TAU * Math.round(a / TAU);
}

/** Eases `from` toward `to`, about two thirds of the way in `time` seconds. */
export function ease(from: number, to: number, time: number, dt: number) {
  return from + (to - from) * (1 - Math.exp(-dt / time));
}

export function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
