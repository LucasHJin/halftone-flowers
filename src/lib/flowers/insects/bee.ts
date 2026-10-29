/**
 * Bees: a striped abdomen hanging from a fuzzy thorax, legs dangling, under
 * beating wings. They fly quicker and straighter than butterflies, nose up
 * when slow and tipped forward as they speed off, mostly hover facing a
 * flower before deciding, and sometimes move on without settling.
 */
import { clamp, lerp, TAU } from "../../../utils/math";
import { tone } from "../paint/tone";
import type { Ink } from "../types";
import { climb, ease, headway, surge, type FlightStyle, type Insect, type InsectSpecies } from "./insect";
import { add, addBall, addBody, addLimb, cross, paintParts, posed, type Pose, type Part, type Section, type Vec } from "./pose";

/** Wing beats a second: a real bee's are a blur, so slowed to what the screen can show beating. */
const BUZZ = 14;
/** How far above the flower's middle the body sits on its legs, sizes. */
const STAND = 0.2;
/** Where the wings join the thorax, on its right side. */
const ROOT: Vec = [0.18, 0.2, 0.06];

/** Each leg on the right side, from the thorax out: dangling in flight, and standing. */
const LEGS: { flying: Vec[]; standing: Vec[] }[] = [
  {
    flying: [[0.3, -0.1, 0.06], [0.36, -0.24, 0.1], [0.32, -0.36, 0.1]],
    standing: [[0.3, -0.1, 0.06], [0.38, -0.12, 0.12], [0.42, -0.2, 0.14]],
  },
  {
    flying: [[0.2, -0.13, 0.07], [0.17, -0.3, 0.13], [0.09, -0.44, 0.13]],
    standing: [[0.2, -0.13, 0.07], [0.2, -0.12, 0.16], [0.18, -0.2, 0.2]],
  },
  {
    flying: [[0.1, -0.12, 0.07], [-0.06, -0.3, 0.13], [-0.2, -0.48, 0.12]],
    standing: [[0.1, -0.12, 0.07], [0.02, -0.12, 0.16], [-0.06, -0.2, 0.2]],
  },
];

const FLIGHT: FlightStyle = {
  cruise: 3.4,
  agility: 0.25,
  accel: 14,
  turn: 6,
  bank: 0.6,
  wander: 0.45,
  wanderRate: 0.45,
  flutter: 0,
  hovers: 0.85,
  hover: [0.5, 1.4],
  drift: 0.25,
  skip: 0.3,
  crawl: 0.5,
  likes: { spike: 3, cluster: 2.5, cosmos: 2, daisy: 2, poppy: 2, rose: 1.5, peony: 1.5, lily: 1, iris: 1, tulip: 1, daffodil: 1, turksCap: 0.7 },
};

export const BEE: InsectSpecies = {
  size: 0.85,
  patterns: 1,
  flight: FLIGHT,

  animate(b, dt, rate) {
    b.air = ease(b.air, b.phase === "landed" ? 0 : 1, 0.12, dt);
    b.flap += TAU * BUZZ * b.quirks.pace * rate * b.air * dt;
    b.bob = b.size * 0.03 * Math.sin(b.age * TAU * 2.1 + b.wobble[2]) * b.air;
    // Nose up and abdomen hanging when slow, flatter at speed; tipped forward to speed up and back to slow down.
    const pitch = lerp(0.04, 0.5 - 0.32 * headway(b, FLIGHT) - 0.3 * surge(b, FLIGHT) + 0.2 * climb(b, FLIGHT), b.air);
    b.pitch = ease(b.pitch, pitch, 0.1, dt);
    b.tilt = ease(b.tilt, lerp(clamp(b.lean * 0.5, -0.6, 0.6), 0, b.air), 0.2, dt);
  },

  paint(ctx, b, s) {
    ctx.rotate(b.tilt);
    ctx.translate(0, -STAND * s * (1 - b.air));
    const pose = posed(b, s);
    const parts: Part[] = [];
    addBall(parts, ctx, pose, [0.5, 0.02, 0], 0.14, 1, 0);
    // Fuzzy, so a little paler than the middle of the ramp.
    addBall(parts, ctx, pose, [0.22, 0.05, 0], 0.21, 0, -0.08);
    addBody(parts, ctx, pose, abdomen(0.14 + 0.03 * Math.sin(b.age * TAU * 1.2 + b.wobble[1])));
    for (const side of [-1, 1]) {
      wings(parts, ctx, pose, b, side);
      for (const leg of LEGS) {
        const points = leg.flying.map((p, i) => mirror(lerpVec(leg.standing[i], p, b.air), side));
        addLimb(parts, ctx, pose, points, 0.06, 1);
      }
      addLimb(parts, ctx, pose, [mirror([0.58, 0.1, 0.04], side), mirror([0.64, 0.26, 0.07], side), mirror([0.8, 0.3, 0.1], side)], 0.04, 1);
    }
    paintParts(parts);
  },
};

/** The abdomen behind the waist, its tip hanging `droop` sizes: pale, a dark band, pale again and a dark tip. */
function abdomen(droop: number): Section[] {
  const sections: Section[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Wide enough to print as rows of dots.
    const band = t < 0.24 || (t > 0.46 && t < 0.68);
    const ink: Ink = band ? 2 : 1;
    sections.push({
      at: [-0.02 - 0.66 * t, 0.02 - droop * t * t, 0],
      r: 0.25 * Math.sin(Math.PI * (0.1 + 0.85 * t)) ** 0.75,
      ink,
      by: 0.12,
    });
  }
  return sections;
}

/**
 * One side's fore and hind wings: folded back along the abdomen at rest, and
 * in flight beating up and down, swept back. Light, and a little see-through
 * over the body.
 */
function wings(parts: Part[], ctx: CanvasRenderingContext2D, pose: Pose, b: Insect, side: number) {
  const root = mirror(ROOT, side);
  const lift = lerp(0.1, 0.45 + 0.6 * b.quirks.stroke * Math.sin(b.flap), b.air);
  const sweep = lerp(0.12, 0.75 - 0.2 * Math.cos(b.flap), b.air);
  const [d, c] = axes(sweep, lift, side);
  const by = pose.lit(cross(d, c));
  parts.push({
    z: pose.at(add(root, d, 0.3))[2],
    paint() {
      ctx.globalAlpha = 0.85;
      pose.inPlane(ctx, root, d, c, () => {
        // The forewing, and the smaller hindwing behind it.
        // A shade darker than the palest ink, so they stand out against the background.
        ctx.fillStyle = tone(2, 1, by + 0.12);
        ctx.beginPath();
        ctx.ellipse(0.33, 0, 0.33, 0.14, 0, 0, TAU);
        ctx.moveTo(0.2 + 0.22 * Math.cos(-0.3), -0.1 + 0.22 * Math.sin(-0.3));
        ctx.ellipse(0.2, -0.1, 0.22, 0.09, -0.3, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    },
  });
}

/** A wing's long axis, swept `sweep` radians from straight back toward straight out and raised `lift` above level, and its width across, held level. */
function axes(sweep: number, lift: number, side: number): [Vec, Vec] {
  return [
    [-Math.cos(sweep) * Math.cos(lift), Math.sin(lift), side * Math.sin(sweep) * Math.cos(lift)],
    [Math.sin(sweep), 0, side * Math.cos(sweep)],
  ];
}

function mirror([x, y, z]: Vec, side: number): Vec {
  return [x, y, z * side];
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
