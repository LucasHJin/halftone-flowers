/**
 * Butterflies. Each beat claps the wings together over the back and sweeps
 * them down past level; the body rises and pitches up as they come down and
 * sinks as they go back up. They glide now and then, often flutter about by a
 * flower before settling on it or moving on, and on a flower hold their wings
 * shut upright, opening them slowly now and then to bask.
 */
import { clamp, lerp, TAU } from "../../../utils/math";
import { tone } from "../paint/tone";
import { climb, ease, smoothstep, surge, type FlightStyle, type Insect, type InsectSpecies } from "./insect";
import { add, addBody, addLimb, cross, paintParts, posed, type Part, type Section, type Vec } from "./pose";

/** Wing beats a second in flight, and openings a second while basking. */
const BEAT = 4.5;
const BASKING = 0.12;
/** Wing angle above level at the top and bottom of the stroke, radians, and the share of each beat spent sweeping down. */
const TOP = 1.45;
const BOTTOM = -0.55;
const DOWN = 0.42;
/** Wing angle shut and opened wide on a flower, and held for a glide. */
const SHUT = 1.5;
const OPEN = 0.15;
const GLIDE = 0.22;
/** How far above the flower's middle the body sits, sizes. */
const STAND = 0.12;
/** The undersides of the wings print paler. */
const UNDERSIDE = -0.18;

/** Where the wings join the top of the thorax, in the butterfly's frame. */
const HINGE: Vec = [0.04, 0.08, 0];

/** Head, thorax and abdomen, head first. */
const BODY: Section[] = (
  [
    [0.47, 0.02, 0.04],
    [0.42, 0.02, 0.075],
    [0.36, 0.02, 0.08],
    [0.3, 0.02, 0.07],
    [0.24, 0.02, 0.09],
    [0.16, 0.02, 0.105],
    [0.08, 0.02, 0.105],
    [0, 0.01, 0.09],
    [-0.08, 0, 0.085],
    [-0.18, -0.01, 0.08],
    [-0.28, -0.02, 0.07],
    [-0.38, -0.035, 0.055],
    [-0.46, -0.05, 0.035],
  ] as const
).map(([x, y, r]) => ({ at: [x, y, 0], r, ink: 1, by: 0 }));

const FLIGHT: FlightStyle = {
  cruise: 2.2,
  agility: 0.45,
  accel: 6,
  turn: 3.5,
  bank: 0.5,
  wander: 0.8,
  wanderRate: 0.22,
  flutter: 0.25,
  hovers: 0.6,
  hover: [0.8, 2.2],
  drift: 0.45,
  skip: 0.25,
  crawl: 0.08,
  likes: { cosmos: 3, cluster: 3, daisy: 2, lily: 1.5, poppy: 1.5, rose: 1, peony: 1, iris: 1, spike: 1, tulip: 0.5, turksCap: 0.3, daffodil: 0.3 },
};

export const BUTTERFLY: InsectSpecies = {
  size: 0.85,
  patterns: 3,
  flight: FLIGHT,

  animate(b, dt, rate) {
    b.air = ease(b.air, b.phase === "landed" ? 0 : 1, 0.2, dt);
    // Now and then it holds its wings out and glides.
    const glide = b.air * smoothstep(0.6, 0.9, Math.sin(b.age * 0.6 + b.wobble[2]));
    b.flap += TAU * lerp(BASKING, BEAT * b.quirks.pace * rate, b.air) * (1 - glide) * dt;
    const flying = lerp(BOTTOM * b.quirks.stroke, TOP, stroke(b.flap));
    const basking = lerp(SHUT, OPEN, smoothstep(0.55, 1, 0.5 - 0.5 * Math.cos(b.flap)));
    b.wing = lerp(lerp(basking, flying, b.air), GLIDE, glide);
    // The body follows the wings a little behind: lifted by each downstroke and pitched up by it, sinking on the upstroke.
    const after = (stroke(b.flap - 0.9) - 0.5) * b.air * (1 - glide);
    b.bob = b.size * 0.16 * after;
    const pitch = lerp(0.12, 0.2 - 0.35 * after + 0.3 * climb(b, FLIGHT) - 0.2 * surge(b, FLIGHT), b.air);
    b.pitch = ease(b.pitch, pitch, 0.08, dt);
    b.tilt = ease(b.tilt, lerp(clamp(b.lean * 0.6, -0.7, 0.7), 0, b.air), 0.25, dt);
  },

  paint(ctx, b, s) {
    ctx.rotate(b.tilt);
    ctx.translate(0, -STAND * s * (1 - b.air));
    const pose = posed(b, s);
    const parts: Part[] = [];
    const c = Math.cos(b.wing);
    const sn = Math.sin(b.wing);
    for (const side of [-1, 1]) {
      const span: Vec = [0, sn, side * c];
      // Each wing's root runs a little outward toward the back, so seen head on the wings aren't edge-on.
      const back: Vec = [-0.95, 0, side * 0.3 * c];
      const top = cross(span, back).map((v) => v * -side) as Vec;
      const shows = pose.shows(top);
      const by = pose.lit(top) + (shows ? 0 : UNDERSIDE);
      parts.push({
        z: pose.at(add(add(HINGE, span, 0.45), back, 0.1))[2],
        paint: () =>
          pose.inPlane(ctx, HINGE, span, back, () => {
            // Seen from above, each forewing lies over its hindwing.
            for (const shape of shows ? [hindwing, forewing] : [forewing, hindwing]) wing(ctx, b, shape, by);
          }),
      });
    }
    addBody(parts, ctx, pose, BODY);
    for (const side of [-1, 1]) {
      addLimb(parts, ctx, pose, [[0.44, 0.06, side * 0.025], [0.6, 0.2, side * 0.07], [0.74, 0.32, side * 0.11]], 0.035, 1);
    }
    paintParts(parts);
  },
};

/** How far up the wings are, from 0 at the bottom of the stroke to 1 clapped overhead, `flap` radians into the beat: swept down quickly, raised slower. */
function stroke(flap: number) {
  const f = (((flap / TAU) % 1) + 1) % 1;
  const down = f < DOWN;
  const u = down ? f / DOWN : (f - DOWN) / (1 - DOWN);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
  return down ? 1 - e : e;
}

/** The right forewing laid flat, x out from the body and y back along it, in units of the butterfly's size. */
function forewing(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0.04, -0.1);
  ctx.bezierCurveTo(0.32, -0.26, 0.66, -0.38, 0.96, -0.4);
  ctx.bezierCurveTo(1.0, -0.26, 0.86, -0.04, 0.66, 0.04);
  ctx.bezierCurveTo(0.45, 0.06, 0.2, 0.06, 0.05, 0.04);
  ctx.closePath();
}

/** The right hindwing, rounder and further back. */
function hindwing(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(0.05, 0);
  ctx.bezierCurveTo(0.35, -0.04, 0.64, 0.02, 0.7, 0.2);
  ctx.bezierCurveTo(0.74, 0.44, 0.52, 0.66, 0.3, 0.64);
  ctx.bezierCurveTo(0.12, 0.6, 0.04, 0.4, 0.04, 0.18);
  ctx.closePath();
}

/**
 * One wing in the butterfly's markings, moved `by` along the ramp: 0
 * mid-coloured with a dark border and pale spots near the tip, 1 pale with
 * dark tips, 2 dark with a pale band.
 */
function wing(ctx: CanvasRenderingContext2D, b: Insect, shape: (ctx: CanvasRenderingContext2D) => void, by: number) {
  const fore = shape === forewing;
  shape(ctx);
  ctx.fillStyle = tone(b.pattern === 1 ? 2 : 1, 1, by);
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (b.pattern === 0) {
    // The same wing shrunk toward its root leaves a dark border.
    ctx.save();
    ctx.translate(0.04, 0);
    ctx.scale(0.76, 0.76);
    shape(ctx);
    ctx.fillStyle = tone(0, 1, by);
    ctx.fill();
    ctx.restore();
    if (fore) spot(ctx, 0.82, -0.32, 0.09, tone(2, 1, by));
  } else if (b.pattern === 1) {
    if (fore) {
      spot(ctx, 0.96, -0.4, 0.3, tone(1, 1, by));
      spot(ctx, 0.5, -0.2, 0.08, tone(1, 1, by));
    } else spot(ctx, 0.45, 0.3, 0.07, tone(1, 0.9, by));
  } else if (fore) {
    ctx.fillStyle = tone(2, 1, by);
    ctx.beginPath();
    ctx.ellipse(0.6, -0.2, 0.34, 0.11, -0.35, 0, TAU);
    ctx.fill();
  } else spot(ctx, 0.4, 0.32, 0.16, tone(0, 1, by));
  ctx.restore();
}

function spot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
