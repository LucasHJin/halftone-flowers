/**
 * Bees: a striped abdomen hanging from a fuzzy thorax, legs dangling, under
 * beating wings. They fly quicker and straighter than butterflies, nose up
 * when slow and tipped forward as they speed off, mostly hover facing a
 * flower before deciding, and sometimes move on without settling.
 *
 * Each is one of a few real species, told apart by build, banding and wings.
 */
import { clamp, lerp, TAU } from "../../../utils/math";
import { tone } from "../paint/tone";
import type { Ink } from "../types";
import { climb, ease, headway, surge, type FlightStyle, type Insect, type InsectGroup, type Species } from "./insect";
import { add, addBall, addBody, addLimb, cross, paintParts, posed, type Pose, type Part, type Section, type Vec } from "./pose";

/** Wing beats a second: a real bee's are a blur, so slowed to what the screen can show beating. */
const BUZZ = 14;
/** How far above the flower's middle the body sits on its legs, sizes. */
const STAND = 0.2;
/** Where the thorax is, in the bee's frame. */
const THORAX: Vec = [0.22, 0.05, 0];

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

interface Bee extends Species {
  /** Radii of its head and thorax, sizes, and the thorax's ink moved `by` along the ramp. */
  head: number;
  thorax: number;
  coat: [Ink, number];
  /** How long and thick its abdomen is, sizes, and how full its outline: 1 tapers like a spindle, lower is rounder. */
  length: number;
  girth: number;
  taper: number;
  /** The abdomen's ink and shift along the ramp `t` of the way from its waist to its tip. */
  band(t: number): [Ink, number];
  /** How big its wings are against its body, and their ink and shift along the ramp. */
  wings: number;
  membrane: [Ink, number];
  /** Multiple of its kind's wing beat: bigger bees beat slower. */
  buzz: number;
}

/** Honeybee (Apis mellifera): slim, a furry thorax, its abdomen pale with a dark band and a dark tip. */
const HONEYBEE: Bee = {
  name: "honeybee",
  size: 1,
  pace: 1,
  weave: 1,
  odds: 1.3,
  head: 0.14,
  thorax: 0.21,
  coat: [0, -0.08],
  length: 0.66,
  girth: 0.25,
  taper: 0.75,
  // Wide enough to print as rows of dots.
  band: (t) => (t < 0.24 || (t > 0.46 && t < 0.68) ? [2, 0.12] : [1, 0.12]),
  wings: 1,
  // A shade further along the ramp than its palest end, so they stand out from the page.
  membrane: [2, 0.12],
  buzz: 1,
};

/** White-tailed bumblebee (Bombus lucorum): big and round, black with a yellow band and a white tail, on short wings. */
const BUMBLEBEE: Bee = {
  name: "bumblebee",
  size: 1.15,
  pace: 0.8,
  weave: 0.8,
  odds: 1,
  head: 0.13,
  thorax: 0.27,
  coat: [1, -0.1],
  length: 0.52,
  girth: 0.33,
  taper: 0.45,
  band: (t) => (t < 0.22 ? [2, 0.18] : t < 0.62 ? [1, 0] : [2, 0]),
  wings: 0.82,
  membrane: [2, 0.3],
  buzz: 0.75,
};

/** Violet carpenter bee (Xylocopa violacea): large, bald and black all over, with dark wings. */
const CARPENTER: Bee = {
  name: "carpenter",
  size: 1.1,
  pace: 1.1,
  weave: 0.9,
  odds: 0.5,
  head: 0.16,
  thorax: 0.23,
  coat: [1, 0],
  length: 0.62,
  girth: 0.25,
  taper: 0.75,
  band: () => [1, 0.1],
  wings: 1.05,
  membrane: [1, -0.15],
  buzz: 0.8,
};

/** Sweat bee (Halictus): small and slender, plain mid-toned with narrow pale bands, darting quickly. */
const SWEAT: Bee = {
  name: "sweat",
  size: 0.9,
  pace: 1.2,
  weave: 1.3,
  odds: 0.8,
  head: 0.11,
  thorax: 0.16,
  coat: [0, 0],
  length: 0.7,
  girth: 0.18,
  taper: 0.9,
  band: (t) => ((t > 0.2 && t < 0.32) || (t > 0.48 && t < 0.6) ? [2, 0.1] : [0, 0.05]),
  wings: 0.95,
  membrane: [2, 0.12],
  buzz: 1.2,
};

const SPECIES: Bee[] = [HONEYBEE, BUMBLEBEE, CARPENTER, SWEAT];

const FLIGHT: FlightStyle = {
  cruise: 4.6,
  agility: 0.25,
  accel: 20,
  turn: 6,
  bank: 0.6,
  wander: 0.45,
  wanderRate: 0.45,
  dive: 0.75,
  flutter: 0,
  hovers: 0.85,
  hover: [0.5, 1.4],
  drift: 0.25,
  skip: 0.3,
  crawl: 0.5,
  likes: { spike: 3, cluster: 2.5, cosmos: 2, daisy: 2, poppy: 2, rose: 1.5, peony: 1.5, lily: 1, iris: 1, tulip: 1, daffodil: 1, turksCap: 0.7 },
};

export const BEE: InsectGroup = {
  // About half a butterfly's span, nose to tail.
  size: 0.6,
  species: SPECIES,
  flight: FLIGHT,

  animate(b, dt, rate) {
    b.air = ease(b.air, b.phase === "landed" ? 0 : 1, 0.12, dt);
    b.flap += TAU * BUZZ * SPECIES[b.species].buzz * b.quirks.pace * rate * b.air * dt;
    b.bob = b.size * 0.03 * Math.sin(b.age * TAU * 2.1 + b.wobble[2]) * b.air;
    // Nose up and abdomen hanging when slow, flatter at speed; tipped forward to speed up and back to slow down.
    const pitch = lerp(0.04, 0.5 - 0.32 * headway(b, FLIGHT) - 0.3 * surge(b, FLIGHT) + 0.2 * climb(b, FLIGHT), b.air);
    b.pitch = ease(b.pitch, pitch, 0.1, dt);
    b.tilt = ease(b.tilt, lerp(clamp(b.lean * 0.5, -0.6, 0.6), 0, b.air), 0.2, dt);
  },

  paint(ctx, b, s) {
    const sp = SPECIES[b.species];
    ctx.rotate(b.tilt);
    ctx.translate(0, -STAND * s * (1 - b.air));
    const pose = posed(b, s);
    const parts: Part[] = [];
    // The head just in front of the thorax, the antennae from its brow.
    const head = THORAX[0] + sp.thorax + sp.head * 0.5;
    addBall(parts, ctx, pose, [head, 0.02, 0], sp.head, 1, 0);
    addBall(parts, ctx, pose, THORAX, sp.thorax, ...sp.coat);
    addBody(parts, ctx, pose, abdomen(sp, 0.14 + 0.03 * Math.sin(b.age * TAU * 1.2 + b.wobble[1])));
    for (const side of [-1, 1]) {
      wings(parts, ctx, pose, b, sp, side);
      for (const leg of LEGS) {
        const points = leg.flying.map((p, i) => mirror(lerpVec(leg.standing[i], p, b.air), side));
        addLimb(parts, ctx, pose, points, 0.06, 1);
      }
      const antenna: Vec[] = [[head + 0.08, 0.1, 0.04], [head + 0.14, 0.26, 0.07], [head + 0.3, 0.3, 0.1]];
      addLimb(parts, ctx, pose, antenna.map((p) => mirror(p, side)), 0.04, 1);
    }
    paintParts(parts);
  },
};

/** `sp`'s abdomen, from just inside the back of its thorax, its tip hanging `droop` sizes. */
function abdomen(sp: Bee, droop: number): Section[] {
  const sections: Section[] = [];
  const n = 14;
  const waist = THORAX[0] - sp.thorax - 0.03;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const [ink, by] = sp.band(t);
    sections.push({
      at: [waist - sp.length * t, 0.02 - droop * t * t, 0],
      r: sp.girth * Math.sin(Math.PI * (0.1 + 0.85 * t)) ** sp.taper,
      ink,
      by,
    });
  }
  return sections;
}

/**
 * One side's fore and hind wings: folded back along the abdomen at rest, and
 * in flight beating up and down, swept back. A little see-through over the
 * body.
 */
function wings(parts: Part[], ctx: CanvasRenderingContext2D, pose: Pose, b: Insect, sp: Bee, side: number) {
  const root = mirror([THORAX[0] - 0.04, THORAX[1] + sp.thorax - 0.06, 0.06], side);
  const lift = lerp(0.1, 0.45 + 0.6 * b.quirks.stroke * Math.sin(b.flap), b.air);
  const sweep = lerp(0.12, 0.75 - 0.2 * Math.cos(b.flap), b.air);
  const [d, c] = axes(sweep, lift, side);
  const by = pose.lit(cross(d, c));
  parts.push({
    z: pose.at(add(root, d, 0.3 * sp.wings))[2],
    paint() {
      ctx.globalAlpha = 0.85;
      pose.inPlane(ctx, root, d, c, () => {
        ctx.scale(sp.wings, sp.wings);
        // The forewing, and the smaller hindwing behind it.
        ctx.fillStyle = tone(sp.membrane[0], 1, by + sp.membrane[1]);
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
