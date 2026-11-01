/**
 * Insects are modelled in 3D and drawn flat. A Pose turns points in an
 * insect's own frame, in multiples of its size, into px on screen. Its frame
 * is x forward, y up and z out to its right; the screen's is x right, y down
 * and z toward the viewer, who looks on from a little above.
 */
import { TAU } from "../../utils/math.js";
import { acrossLight, lightStrength, tone } from "../paint/tone.js";
import type { Ink } from "../types.js";
import type { Insect } from "./insect.js";

export type Vec = [number, number, number];

/** Toward the light on screen, as for the flowers: the upper left, and a little toward the viewer. */
const LIGHT: Vec = [-0.53, -0.71, 0.45];
const LIGHT_2D: [number, number] = [-0.6, -0.8];

export class Pose {
  /** Where the insect's forward, up and right axes land on screen, each `s` px long. */
  private axes: [Vec, Vec, Vec];

  /**
   * Turned `yaw` radians from facing right toward facing the viewer, nose up
   * `pitch`, banked `roll` with its right side down, `s` px to its size, and
   * seen from `view` radians above.
   */
  constructor(yaw: number, pitch: number, roll: number, readonly s: number, view: number) {
    const turn = (v: Vec) => rotate(v, yaw, pitch, roll, view).map((c) => c * s) as Vec;
    this.axes = [turn([1, 0, 0]), turn([0, 1, 0]), turn([0, 0, 1])];
  }

  /** Where `p` in the insect's frame lands: px right, px down and px toward the viewer from its middle. */
  at([x, y, z]: Vec): Vec {
    const [f, u, r] = this.axes;
    return [f[0] * x + u[0] * y + r[0] * z, f[1] * x + u[1] * y + r[1] * z, f[2] * x + u[2] * y + r[2] * z];
  }

  /** Whether the side of a surface facing `n` in the insect's frame is the side the viewer sees. */
  shows(n: Vec) {
    return this.at(n)[2] >= 0;
  }

  /** Ramp shift for a flat surface facing `n`, whichever of its sides shows: lighter turned to the light, darker turned away. */
  lit(n: Vec) {
    const [x, y, z] = this.at(n);
    const k = (z < 0 ? -1 : 1) / (Math.hypot(x, y, z) || 1);
    return -2 * lightStrength() * k * (x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
  }

  /** Runs `paint` drawing in the plane through `o` spanned by `a` and `b`, so (p, q) lands where o + p·a + q·b does. */
  inPlane(ctx: CanvasRenderingContext2D, o: Vec, a: Vec, b: Vec, paint: () => void) {
    const [ox, oy] = this.at(o);
    const [ax, ay] = this.at(a);
    const [bx, by] = this.at(b);
    ctx.save();
    ctx.transform(ax, ay, bx, by, ox, oy);
    paint();
    ctx.restore();
  }
}

/** `v` in the insect's frame turned into the screen's. */
function rotate([x, y, z]: Vec, yaw: number, pitch: number, roll: number, view: number): Vec {
  const y1 = y * Math.cos(roll) - z * Math.sin(roll);
  const z1 = y * Math.sin(roll) + z * Math.cos(roll);
  const x2 = x * Math.cos(pitch) - y1 * Math.sin(pitch);
  const y2 = x * Math.sin(pitch) + y1 * Math.cos(pitch);
  const x3 = x2 * Math.cos(yaw) - z1 * Math.sin(yaw);
  const z3 = x2 * Math.sin(yaw) + z1 * Math.cos(yaw);
  return [x3, -(y2 * Math.cos(view) - z3 * Math.sin(view)), y2 * Math.sin(view) + z3 * Math.cos(view)];
}

/**
 * How `b` looks now, `s` px to its size, held its own way: turned a little
 * more toward the viewer or away, whichever way it's going, and drifting.
 */
export function posed(b: Insect, s: number) {
  const { pitch, roll, turn, view } = b.quirks;
  const toward = turn + 0.2 * Math.sin(b.age * 0.3 + b.wobble[0]);
  return new Pose(b.yaw + toward * Math.cos(b.yaw), b.pitch + pitch, b.roll + roll, s, view);
}

/** Something to paint, and how near the viewer it is; parts are painted far to near. */
export interface Part {
  z: number;
  paint(): void;
}

export function paintParts(parts: Part[]) {
  parts.sort((a, b) => a.z - b.z);
  for (const part of parts) part.paint();
}

/** One cross-section of a round body: its middle in the insect's frame, its radius, and its ink moved `by` along the ramp. */
export interface Section {
  at: Vec;
  r: number;
  ink: Ink;
  by: number;
}

/**
 * Adds a round body through `sections`, in order along it, as a stack of
 * discs across it, each the ellipse it looks from here. Painted far to near,
 * the nearest disc over any spot is the body's surface there.
 */
export function addBody(parts: Part[], ctx: CanvasRenderingContext2D, pose: Pose, sections: Section[]) {
  const centres = sections.map((sec) => pose.at(sec.at));
  sections.forEach(({ r, ink, by }, i) => {
    const prev = centres[Math.max(i - 1, 0)];
    const next = centres[Math.min(i + 1, centres.length - 1)];
    const [x, y, z] = centres[i];
    const ax = next[0] - prev[0];
    const ay = next[1] - prev[1];
    const length = Math.hypot(ax, ay, next[2] - prev[2]) || 1;
    const across = r * pose.s;
    const spacing = Math.hypot(ax, ay) / (i === 0 || i === centres.length - 1 ? 1 : 2);
    // Seen side on, a disc is edge-on; kept thick enough to meet its neighbours.
    const along = Math.max((across * Math.abs(next[2] - prev[2])) / length, spacing * 0.65);
    const angle = Math.atan2(ay, ax);
    parts.push({
      z,
      paint() {
        ctx.fillStyle = acrossLight(ctx, x, y, across, ink, 1, LIGHT_2D, by);
        ctx.beginPath();
        ctx.ellipse(x, y, along, across, angle, 0, TAU);
        ctx.fill();
      },
    });
  });
}

/** Adds a ball of radius `r` at `at`, shaded like a dome. */
export function addBall(parts: Part[], ctx: CanvasRenderingContext2D, pose: Pose, at: Vec, r: number, ink: Ink, by: number) {
  const [x, y, z] = pose.at(at);
  const radius = r * pose.s;
  const light = lightStrength();
  parts.push({
    z,
    paint() {
      const g = ctx.createRadialGradient(x + LIGHT_2D[0] * radius * 0.4, y + LIGHT_2D[1] * radius * 0.4, 0, x, y, radius);
      g.addColorStop(0, tone(ink, 1, by - light));
      g.addColorStop(1, tone(ink, 1, by + light));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    },
  });
}

/** Adds a thin limb through `points`, `width` sizes wide. */
export function addLimb(parts: Part[], ctx: CanvasRenderingContext2D, pose: Pose, points: Vec[], width: number, ink: Ink) {
  const screen = points.map((p) => pose.at(p));
  parts.push({
    z: screen[0][2],
    paint() {
      ctx.strokeStyle = tone(ink, 1);
      ctx.lineWidth = width * pose.s;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      screen.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    },
  });
}

export function add(a: Vec, b: Vec, k = 1): Vec {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}

export function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
