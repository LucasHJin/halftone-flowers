/**
 * What butterflies and bees share: their state, how they fly toward a goal
 * along a wandering path in 3D, how their bodies turn and bank as they go,
 * and where on a flower they settle.
 */
import { clamp, lerp, TAU } from "../../../utils/math";
import { along } from "../paint/tone";
import { SEGMENTS } from "../stem";
import type { Kind, Plant, Stem } from "../types";
import type { Trail } from "./trail";

export type InsectKind = "butterfly" | "bee";

/** Flying to a flower, hovering by it, coming down onto it, sitting on it, or heading off screen. */
export type Phase = "flying" | "hovering" | "alighting" | "landed" | "leaving";

/** How many of an insect's sizes it flies to cross the bed from back to front. */
export const DEPTH = 5;

export interface Insect {
  kind: InsectKind;
  /** Which of its kind's species it is, an index into its kind's `species`. */
  species: number;
  /** Px: about its body length. */
  size: number;
  x: number;
  y: number;
  /** Depth among the plants, from 0 at the back to 1 at the front. It's painted over plants further back. */
  z: number;
  /** Px a second across and down the screen, and toward the viewer. */
  vx: number;
  vy: number;
  vz: number;
  /** How hard it's speeding up, px a second squared, the same ways. */
  ax: number;
  ay: number;
  az: number;
  /** Depth it drifts toward while leaving. */
  zGoal: number;
  phase: Phase;
  /** The flower it's flying to or sitting on. */
  plant: Plant | null;
  stem: Stem | null;
  /** Which side of the flower it hovers: -1 left, 1 right. */
  side: number;
  /** Whether it hovers by the flower it's flying to before deciding to settle, or settles straight away. */
  hovers: boolean;
  /** The angle of the flower head it sits on, radians clockwise from up. */
  lean: number;
  /** Seconds left hovering or sitting. */
  timer: number;
  /** Flowers left to visit after the one it's on its way to. */
  visits: number;
  /** Where it heads once it's done, well off screen. */
  exitX: number;
  exitY: number;
  /** Seconds since it arrived. */
  age: number;
  /** Phases of its wandering, and how fast it wanders, so no two fly alike. */
  wobble: [number, number, number, number];
  quirks: Quirks;
  /** 1 in flight, 0 sitting, easing between. */
  air: number;
  /** Wing beat, radians. */
  flap: number;
  /** Wing angle above level, radians. */
  wing: number;
  /** Drawn offset from `y`, bobbing with the wing beat. */
  bob: number;
  /** Which way it faces, radians from facing right toward facing the viewer. */
  yaw: number;
  /** The way it faces once settled on a flower. */
  rest: number;
  /** Nose up, radians. */
  pitch: number;
  /** Banked right side down, radians. */
  roll: number;
  /** Turned in the screen, radians clockwise: the lean of the flower it sits on. */
  tilt: number;
  trail: Trail;
}

/** How one insect differs from others of its kind, so no two look or fly alike. */
export interface Quirks {
  /** Multiple of its kind's flying speed, quickness and wing beat, its species' and its own. */
  pace: number;
  /** Radians more nose up, and more banked right side down, than its flight alone holds it. */
  pitch: number;
  roll: number;
  /** Radians more turned toward the viewer than the way it's going, or away if negative. */
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

/** How a kind flies. Distances are in multiples of its size. */
export interface FlightStyle {
  /** Cruising speed, sizes a second. */
  cruise: number;
  /** Seconds to take up a new velocity, when it can speed up hard enough. */
  agility: number;
  /** Hardest it can speed up, slow down or swing round, sizes a second squared. */
  accel: number;
  /** Fastest its body turns, radians a second. */
  turn: number;
  /** How far it banks into its tightest turns, radians. */
  bank: number;
  /** How far its heading strays either way from straight at its goal, radians. */
  wander: number;
  /** How often its heading strays, cycles a second. */
  wanderRate: number;
  /** Steepest it flies down while well off its goal, radians below level. */
  dive: number;
  /** Quick flicker on top of the wandering, radians. */
  flutter: number;
  /** Of the flowers it visits, the share it hovers by before deciding; it settles straight onto the rest. */
  hovers: number;
  /** Seconds it hovers by a flower, picked from this range. */
  hover: [number, number];
  /** How far it drifts about while hovering, sizes. */
  drift: number;
  /** Of the flowers it hovers by, the share it moves on from without settling. */
  skip: number;
  /** How far it turns about while sitting on a flower, radians. */
  crawl: number;
  /** Odds of visiting each kind of flower; kinds left out are never visited. */
  likes: Partial<Record<Kind, number>>;
}

/** One species of a kind, against the others of its kind. */
export interface Species {
  name: string;
  /** Multiple of its kind's size. */
  size: number;
  /** Multiple of its kind's flying speed and quickness. */
  pace: number;
  /** Multiple of how often its heading strays: higher jinks about more. */
  weave: number;
  /** Odds of one coming, against the others of its kind. */
  odds: number;
}

/** What every insect of one kind shares, whatever its species. */
export interface InsectGroup {
  /** Multiple of the base flower size. */
  size: number;
  species: readonly Species[];
  flight: FlightStyle;
  /** Moves its wings, bob and pitch on by `dt` seconds; `rate` multiplies the wing beat. */
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

/** Where an insect sits on a flower as it is posed now, and the head's angle, radians clockwise from up. */
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

/**
 * Flies toward (gx, gy) at depth gz at up to `speed` px a second, slowing
 * within `slow` sizes of it. Far off, its heading strays to either side, so
 * into and out of the screen, and up and down, and a goal far below it comes
 * down to in a sweeping curve, no steeper than its style's dive. It speeds up,
 * slows and turns no harder than its style allows, so it swings round in
 * curves. Returns the distance to the goal before moving, px.
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
  // Too steeply below, it heads round the goal as well as toward it, the more the steeper, coming down at the steepest it may; it can drop onto it only from within half its size.
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
  // Not far beyond the bed's back or front.
  if (b.z < -0.15 || b.z > 1.2) {
    b.z = clamp(b.z, -0.15, 1.2);
    b.vz = 0;
  }
  return dist;
}

/**
 * Turns its body toward the way it's flying, or toward `face` (px across the
 * screen and toward the viewer) if given, or about its resting way on a
 * flower; never faster than its style allows, so it swings round through
 * facing the viewer or away. Banks into turns.
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
