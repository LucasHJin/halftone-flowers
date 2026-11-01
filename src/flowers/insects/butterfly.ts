/**
 * Butterflies. In flight each beat claps the wings over the back and sweeps them
 * down past level; perched, the wings stay shut upright and open now and then to bask.
 */
import { clamp, lerp, TAU } from "../../utils/math.js";
import { tone } from "../paint/tone.js";
import type { Ink } from "../types.js";
import { climb, ease, headway, smoothstep, surge, type FlightStyle, type InsectGroup, type Species } from "./insect.js";
import { add, addBody, addLimb, cross, paintParts, posed, type Part, type Section, type Vec } from "./pose.js";

/** Wing beats a second in flight, and openings a second while basking. */
const BEAT = 4.5;
const BASKING = 0.12;
/** Wing angle above level at the top and bottom of the stroke, radians, and the share of each beat spent sweeping down. */
const TOP = 1.45;
const BOTTOM = -0.55;
const DOWN = 0.42;
/** Wing angle shut and fully open while perched, radians. */
const SHUT = 1.5;
const OPEN = 0.15;
/** How far above the flower's middle the body sits, sizes. */
const STAND = 0.12;
/** Ramp shift for wing undersides, so they print paler. */
const UNDERSIDE = -0.18;

/** Where the wings join the top of the thorax, in the butterfly's frame. */
const HINGE: Vec = [0.04, 0.08, 0];

/** Head, thorax and abdomen sections, head first, radii scaled by `girth`. */
function body(girth: number): Section[] {
  return (
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
  ).map(([x, y, r]) => ({ at: [x, y, 0], r: r * girth, ink: 1, by: 0 }));
}

/** Traces a right wing laid flat: x out from the body, y back along it, in butterfly sizes. */
type Shape = (ctx: CanvasRenderingContext2D) => void;

interface Butterfly extends Species {
  /** Wing scale against the body. */
  wings: number;
  /** Multiple of its kind's wing beat: bigger wings beat slower. */
  beat: number;
  body: Section[];
  forewing: Shape;
  hindwing: Shape;
  /** Paints markings on one wing, already clipped to `shape`, moved `by` along the ramp. */
  mark(ctx: CanvasRenderingContext2D, shape: Shape, fore: boolean, by: number): void;
}

/** Long, reaching a rounded tip. */
const LONG: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.04, -0.1);
  ctx.bezierCurveTo(0.32, -0.26, 0.66, -0.38, 0.96, -0.4);
  ctx.bezierCurveTo(1.0, -0.26, 0.86, -0.04, 0.66, 0.04);
  ctx.bezierCurveTo(0.45, 0.06, 0.2, 0.06, 0.05, 0.04);
  ctx.closePath();
};

/** Shorter, with a blunt round tip. */
const BLUNT: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.04, -0.1);
  ctx.bezierCurveTo(0.3, -0.28, 0.62, -0.42, 0.84, -0.37);
  ctx.bezierCurveTo(0.98, -0.3, 0.88, -0.02, 0.63, 0.07);
  ctx.bezierCurveTo(0.42, 0.1, 0.2, 0.06, 0.05, 0.04);
  ctx.closePath();
};

/** A long triangle to a sharp tip, its outer edge straight. */
const POINTED: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.04, -0.1);
  ctx.bezierCurveTo(0.36, -0.3, 0.74, -0.44, 1.04, -0.48);
  ctx.bezierCurveTo(0.96, -0.3, 0.8, -0.08, 0.62, 0.08);
  ctx.bezierCurveTo(0.42, 0.1, 0.2, 0.07, 0.05, 0.04);
  ctx.closePath();
};

/** Long, its outer edge dipping in under the tip. */
const NOTCHED: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.04, -0.1);
  ctx.bezierCurveTo(0.34, -0.3, 0.72, -0.44, 0.98, -0.44);
  ctx.bezierCurveTo(0.98, -0.36, 0.86, -0.26, 0.84, -0.14);
  ctx.bezierCurveTo(0.82, -0.02, 0.74, 0.06, 0.62, 0.08);
  ctx.bezierCurveTo(0.42, 0.1, 0.2, 0.06, 0.05, 0.04);
  ctx.closePath();
};

/** Arched along its leading edge to a hooked point, like a leaf. */
const HOOKED: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.04, -0.1);
  ctx.bezierCurveTo(0.34, -0.34, 0.66, -0.46, 0.94, -0.48);
  ctx.bezierCurveTo(0.88, -0.34, 0.84, -0.08, 0.64, 0.06);
  ctx.bezierCurveTo(0.42, 0.1, 0.2, 0.06, 0.05, 0.04);
  ctx.closePath();
};

/** A round hindwing. */
const ROUND: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.05, 0);
  ctx.bezierCurveTo(0.35, -0.04, 0.64, 0.02, 0.7, 0.2);
  ctx.bezierCurveTo(0.74, 0.44, 0.52, 0.66, 0.3, 0.64);
  ctx.bezierCurveTo(0.12, 0.6, 0.04, 0.4, 0.04, 0.18);
  ctx.closePath();
};

/** A hindwing with a short tail out from the back of its outer edge. */
const TAILED: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.05, 0);
  ctx.bezierCurveTo(0.34, -0.04, 0.62, 0.04, 0.68, 0.22);
  ctx.bezierCurveTo(0.7, 0.34, 0.64, 0.44, 0.58, 0.5);
  ctx.lineTo(0.66, 0.7);
  ctx.quadraticCurveTo(0.62, 0.78, 0.56, 0.72);
  ctx.lineTo(0.48, 0.57);
  ctx.bezierCurveTo(0.3, 0.66, 0.1, 0.56, 0.05, 0.38);
  ctx.bezierCurveTo(0.03, 0.26, 0.03, 0.12, 0.05, 0);
  ctx.closePath();
};

/** A hindwing with a small point on its outer edge, like a leaf's. */
const LEAF: Shape = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0.05, 0);
  ctx.bezierCurveTo(0.34, -0.04, 0.6, 0.04, 0.66, 0.22);
  ctx.lineTo(0.74, 0.36);
  ctx.bezierCurveTo(0.62, 0.54, 0.44, 0.66, 0.28, 0.62);
  ctx.bezierCurveTo(0.12, 0.58, 0.04, 0.4, 0.04, 0.18);
  ctx.closePath();
};

/** Monarch (Danaus plexippus): big long wings, orange inside a black border, white spots by the tips. */
const MONARCH: Butterfly = {
  name: "monarch",
  size: 1.05,
  pace: 1,
  weave: 0.9,
  odds: 1,
  wings: 1.05,
  beat: 0.9,
  body: body(1),
  forewing: LONG,
  hindwing: ROUND,
  mark(ctx, shape, fore, by) {
    cover(ctx, 1, by);
    inset(ctx, shape, 0.66, 0, by - 0.18);
    if (fore) {
      spot(ctx, 0.86, -0.34, 0.095, tone(2, 1, by));
      spot(ctx, 0.88, -0.19, 0.075, tone(2, 1, by));
    }
  },
};

/** Tiger swallowtail (Papilio glaucus): the biggest, pale with black stripes from the leading edge, black borders and tails. */
const SWALLOWTAIL: Butterfly = {
  name: "swallowtail",
  size: 1.1,
  pace: 1.1,
  weave: 0.8,
  odds: 0.7,
  wings: 1.15,
  beat: 0.8,
  body: body(0.95),
  forewing: POINTED,
  hindwing: TAILED,
  mark(ctx, shape, fore, by) {
    cover(ctx, 1, by);
    inset(ctx, shape, 0.72, 2, by);
    if (fore) {
      stripe(ctx, 0.2, -0.24, 0.16, 0.06, 0.14, tone(1, 1, by));
      stripe(ctx, 0.48, -0.36, 0.42, 0.06, 0.14, tone(1, 1, by));
    } else spot(ctx, 0.3, 0.5, 0.1, tone(0, 1, by - 0.1));
  },
};

/** Small white (Pieris rapae): blunt pale wings, grey-black tips and a spot, fluttering about. */
const WHITE: Butterfly = {
  name: "white",
  size: 0.9,
  pace: 0.95,
  weave: 1.4,
  odds: 1.3,
  wings: 0.92,
  beat: 1.1,
  body: body(0.85),
  forewing: BLUNT,
  hindwing: ROUND,
  mark(ctx, _shape, fore, by) {
    cover(ctx, 2, by);
    if (fore) {
      spot(ctx, 0.92, -0.44, 0.32, tone(1, 1, by - 0.05));
      spot(ctx, 0.5, -0.13, 0.1, tone(1, 1, by - 0.05));
    }
  },
};

/** Common blue (Polyommatus icarus): small round wings on a stout body, blue edged in black, jinking low and quick. */
const BLUE: Butterfly = {
  name: "blue",
  size: 0.85,
  pace: 0.9,
  weave: 1.5,
  odds: 1,
  wings: 0.8,
  beat: 1.3,
  body: body(1),
  forewing: BLUNT,
  hindwing: ROUND,
  mark(ctx, shape, _fore, by) {
    cover(ctx, 1, by);
    inset(ctx, shape, 0.76, 0, by - 0.3);
  },
};

/** Red admiral (Vanessa atalanta): dark wings notched under the tips, a red band across them and white spots beyond it. */
const ADMIRAL: Butterfly = {
  name: "admiral",
  size: 1,
  pace: 1.15,
  weave: 1,
  odds: 0.9,
  wings: 1,
  beat: 1,
  body: body(1.1),
  forewing: NOTCHED,
  hindwing: ROUND,
  mark(ctx, shape, fore, by) {
    // Red prints near the pale end so it stands out from the black.
    if (!fore) {
      // Red along the hindwing's edge.
      cover(ctx, 2, by + 0.15);
      inset(ctx, shape, 0.68, 1, by + 0.1);
      return;
    }
    cover(ctx, 1, by + 0.1);
    ctx.fillStyle = tone(2, 1, by + 0.15);
    ctx.beginPath();
    ctx.ellipse(0.52, -0.15, 0.32, 0.13, 0.8, 0, TAU);
    ctx.fill();
    spot(ctx, 0.8, -0.36, 0.085, tone(2, 1, by));
    spot(ctx, 0.84, -0.25, 0.055, tone(2, 1, by));
    spot(ctx, 0.66, -0.37, 0.06, tone(2, 1, by));
  },
};

/** Brimstone (Gonepteryx rhamni): plain pale yellow wings shaped like leaves, each with one small spot. */
const BRIMSTONE: Butterfly = {
  name: "brimstone",
  size: 1,
  pace: 1,
  weave: 0.9,
  odds: 0.8,
  wings: 1,
  beat: 1,
  body: body(0.9),
  forewing: HOOKED,
  hindwing: LEAF,
  mark(ctx, _shape, fore, by) {
    cover(ctx, 2, by + 0.12);
    spot(ctx, fore ? 0.46 : 0.36, fore ? -0.16 : 0.28, 0.095, tone(0, 1, by + 0.25));
  },
};

const SPECIES: Butterfly[] = [MONARCH, SWALLOWTAIL, WHITE, BLUE, ADMIRAL, BRIMSTONE];

const FLIGHT: FlightStyle = {
  cruise: 2.2,
  agility: 0.45,
  accel: 6,
  turn: 3.5,
  bank: 0.5,
  wander: 0.8,
  wanderRate: 0.22,
  dive: 0.85,
  flutter: 0.25,
  hovers: 0.6,
  hover: [0.8, 2.2],
  drift: 0.45,
  skip: 0.25,
  crawl: 0.08,
  likes: { cosmos: 3, cluster: 3, daisy: 2, lily: 1.5, poppy: 1.5, rose: 1, peony: 1, iris: 1, spike: 1, tulip: 0.5, turksCap: 0.3, daffodil: 0.3 },
};

export const BUTTERFLY: InsectGroup = {
  size: 0.85,
  species: SPECIES,
  flight: FLIGHT,

  animate(b, dt, rate) {
    b.air = ease(b.air, b.phase === "landed" ? 0 : 1, 0.2, dt);
    // Climbing or hovering takes more work than cruising: deeper, slightly quicker strokes.
    const work = clamp(0.3 + 0.6 * climb(b, FLIGHT) + 0.3 * (1 - headway(b, FLIGHT)), 0, 1);
    const beat = BEAT * SPECIES[b.species].beat * b.quirks.pace * rate * lerp(0.9, 1.25, work);
    b.flap += TAU * lerp(BASKING, beat, b.air) * dt;
    const flying = lerp(BOTTOM * b.quirks.stroke * lerp(0.8, 1.3, work), TOP, stroke(b.flap));
    const basking = lerp(SHUT, OPEN, smoothstep(0.55, 1, 0.5 - 0.5 * Math.cos(b.flap)));
    b.wing = lerp(basking, flying, b.air);
    // Body lags the wings by 0.9 rad: lifts and pitches up on the downstroke, sinks on the upstroke.
    const after = (stroke(b.flap - 0.9) - 0.5) * b.air;
    b.bob = b.size * 0.16 * after;
    const pitch = lerp(0.12, 0.2 - 0.35 * after + 0.3 * climb(b, FLIGHT) - 0.2 * surge(b, FLIGHT), b.air);
    b.pitch = ease(b.pitch, pitch, 0.08, dt);
    b.tilt = ease(b.tilt, lerp(clamp(b.lean * 0.6, -0.7, 0.7), 0, b.air), 0.25, dt);
  },

  paint(ctx, b, s) {
    const sp = SPECIES[b.species];
    ctx.rotate(b.tilt);
    ctx.translate(0, -STAND * s * (1 - b.air));
    const pose = posed(b, s);
    const parts: Part[] = [];
    const c = Math.cos(b.wing);
    const sn = Math.sin(b.wing);
    for (const side of [-1, 1]) {
      const span: Vec = [0, sn, side * c];
      // Root angled outward toward the back, so head-on the wings aren't edge-on.
      const back: Vec = [-0.95, 0, side * 0.3 * c];
      const top = cross(span, back).map((v) => v * -side) as Vec;
      const shows = pose.shows(top);
      // Half a flower's shading, so markings keep their contrast as the wings turn.
      const by = 0.5 * pose.lit(top) + (shows ? 0 : UNDERSIDE);
      parts.push({
        z: pose.at(add(add(HINGE, span, 0.45 * sp.wings), back, 0.1))[2],
        paint: () =>
          pose.inPlane(ctx, HINGE, span, back, () => {
            ctx.scale(sp.wings, sp.wings);
            // Seen from above, each forewing lies over its hindwing.
            if (shows) {
              wing(ctx, sp, false, by);
              wing(ctx, sp, true, by);
            } else {
              wing(ctx, sp, true, by);
              wing(ctx, sp, false, by);
            }
          }),
      });
    }
    addBody(parts, ctx, pose, sp.body);
    for (const side of [-1, 1]) {
      addLimb(parts, ctx, pose, [[0.44, 0.06, side * 0.025], [0.6, 0.2, side * 0.07], [0.74, 0.32, side * 0.11]], 0.035, 1);
    }
    paintParts(parts);
  },
};

/** Wing height `flap` radians into the beat, 0 at the bottom to 1 clapped overhead; the downstroke takes `DOWN` of the beat. */
function stroke(flap: number) {
  const f = (((flap / TAU) % 1) + 1) % 1;
  const down = f < DOWN;
  const u = down ? f / DOWN : (f - DOWN) / (1 - DOWN);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
  return down ? 1 - e : e;
}

function wing(ctx: CanvasRenderingContext2D, sp: Butterfly, fore: boolean, by: number) {
  const shape = fore ? sp.forewing : sp.hindwing;
  shape(ctx);
  ctx.save();
  ctx.clip();
  sp.mark(ctx, shape, fore, by);
  ctx.restore();
}

/** Fills the whole clipped wing. */
function cover(ctx: CanvasRenderingContext2D, ink: Ink, by: number) {
  ctx.fillStyle = tone(ink, 1, by);
  ctx.fillRect(-0.5, -1, 2, 2.5);
}

/** Fills the wing shrunk `k` times toward its root, leaving a border. */
function inset(ctx: CanvasRenderingContext2D, shape: Shape, k: number, ink: Ink, by: number) {
  ctx.save();
  ctx.translate(0.04, 0);
  ctx.scale(k, k);
  shape(ctx);
  ctx.fillStyle = tone(ink, 1, by);
  ctx.fill();
  ctx.restore();
}

function spot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function stripe(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, fill: string) {
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
