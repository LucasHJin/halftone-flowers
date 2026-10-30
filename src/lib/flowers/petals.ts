/**
 * Petals shaken loose by clicking or tapping a flower. Each lifts off the
 * flower and drifts away to the left or the right along a wandering curve,
 * some sailing far across the bed, others sinking toward the ground, now and
 * then looping the loop, turning and rocking as they go. They don't fade:
 * each keeps going until it's off the screen. Each looks like a petal from
 * the flower it came off (see looseLook).
 *
 * Each keeps the depth of the flower it came from, just in front of it, so it
 * passes over plants further back and behind nearer ones, and never changes
 * places with a plant it's over.
 */
import { clamp, lerp, TAU } from "../../utils/math";
import type { Garden } from "./garden";
import { ease, perch, wrap } from "./insects/insect";
import { looseLook, type LoosePaint } from "./paint/loose";
import { along, inLight, inShade, lightStrength, plantShade } from "./paint/tone";
import type { Plant, Stem } from "./types";

/** The most loose at once; past this, a click still nods the flower but shakes no more off. */
const MOST = 150;

/** How far in front of its flower a petal is, in depth, so it's painted over it. */
const ON_TOP = 5e-5;

/** Seconds a petal takes to come round to its heading after straying. */
const STEER = 1.4;

/** Fastest a petal strays from its heading either way, radians a second. */
const WANDER = 0.8;

/** Seconds after one loop before another can start. */
const CALM = 3;

interface LoosePetal {
  x: number;
  y: number;
  /** Depth among the plants: its flower's, just in front of it. */
  z: number;
  /** The plant it came from, whose shade it prints in. */
  plant: Plant;
  /** Which way it drifts: -1 left, 1 right. */
  side: number;
  /** Which way it's going, radians clockwise from rightward. */
  heading: number;
  /** Px a second now, and its own pace in a moderate wind. */
  speed: number;
  cruise: number;
  /** How far below level it settles into heading between loops, radians: a little to sail off far, well below to sink. */
  aim: number;
  /** Seconds since it came loose. */
  age: number;
  /** Phases and rate of its wandering, so no two drift alike. */
  wander: [number, number, number];
  /** The loop it's going round: seconds in, seconds it takes, and which way round, 1 clockwise on screen or -1 anticlockwise. */
  loop: { at: number; length: number; way: number } | null;
  /** Seconds until it can next loop. */
  calm: number;
  /** Turned in the screen, radians clockwise, and how fast it turns of its own accord. */
  spin: number;
  spinRate: number;
  /** How far it's rolled about its length, radians, and how fast it rolls. */
  flip: number;
  flipRate: number;
  paint: LoosePaint;
  /** Px across its longest way. */
  length: number;
}

export class Petals {
  list: LoosePetal[] = [];
  private order: LoosePetal[] = [];
  private next = 0;

  constructor(private garden: Garden) {}

  /** Clears them all away, for a newly laid out bed. */
  reset() {
    this.list = [];
  }

  /** Shakes a few petals, as many as the settings say, loose from the head on `s`. */
  shed(plant: Plant, s: Stem) {
    const { cell, settings } = this.garden;
    const { count, size, sink } = settings.petals;
    const h = s.head!;
    const n = Math.round(lerp(count[0] - 0.49, count[1] + 0.49, Math.random()));
    for (let i = 0; i < n && this.list.length < MOST; i++) {
      const look = looseLook(s, h, cell, size);
      let x: number;
      let y: number;
      // Pointing out from the middle of the flower, where it was growing.
      let out: number;
      if (h.kind === "spike" || h.kind === "plume") {
        const p = along(s, 1 - h.reach * Math.random());
        out = p.a + (Math.random() < 0.5 ? 0 : Math.PI);
        x = p.x + Math.cos(out) * h.radius * 0.6;
        y = p.y + Math.sin(out) * h.radius * 0.6;
      } else {
        const p = perch(s);
        out = Math.random() * TAU;
        const r = h.radius * lerp(0.25, 0.6, Math.random());
        x = p.x + Math.cos(out) * r;
        y = p.y + Math.sin(out) * r;
      }
      const side = Math.random() < 0.5 ? -1 : 1;
      // Lifting off upward or out to its side before it settles into drifting, starting from still.
      const lift = lerp(-1.7, 0.1, Math.random());
      this.list.push({
        x,
        y,
        z: plant.depth + ON_TOP,
        plant,
        side,
        heading: side > 0 ? lift : Math.PI - lift,
        speed: 0,
        cruise: this.garden.bloom * lerp(1.8, 3, Math.random()),
        aim: Math.random() < sink ? lerp(0.7, 1.1, Math.random()) : lerp(0.02, 0.3, Math.random()),
        age: 0,
        wander: [Math.random() * TAU, Math.random() * TAU, TAU * lerp(0.15, 0.35, Math.random())],
        loop: null,
        calm: lerp(0.8, 2, Math.random()),
        spin: out,
        spinRate: (Math.random() < 0.5 ? -1 : 1) * lerp(0.4, 1.6, Math.random()),
        flip: Math.random() * TAU,
        flipRate: (Math.random() < 0.5 ? -1 : 1) * lerp(1, 2.5, Math.random()),
        paint: look.paint,
        length: look.length,
      });
    }
  }

  step(dt: number) {
    const garden = this.garden;
    const { speed, loops } = garden.settings.petals;
    for (const p of this.list) {
      p.age += dt;
      // Livelier and flatter in a gust, whichever way it's going, and faster going down than up, as if it had a little weight.
      const push = clamp(Math.abs(garden.windNow(p.x, p.y)), 0, 1.5);
      p.speed = ease(p.speed, p.cruise * speed * (0.6 + 0.5 * push) * (1 + 0.3 * Math.sin(p.heading)), 0.6, dt);
      const below = p.aim * (1 - 0.3 * Math.min(push, 1));
      const aim = p.side > 0 ? below : Math.PI - below;
      const [p1, p2, rate] = p.wander;
      const t = p.age * rate;
      const drift = wrap(aim - p.heading) / STEER + (WANDER * (Math.sin(t + p1) + 0.6 * Math.sin(2.3 * t + p2))) / 1.6;
      let turn = drift;
      if (p.loop) {
        // A whole turn round, tightest halfway, easing into and out of it, so it comes out going the way it went in.
        const f = Math.sin((Math.PI * p.loop.at) / p.loop.length);
        turn = p.loop.way * (TAU / p.loop.length) * 2 * f * f + (1 - f) * drift;
        p.loop.at += dt;
        if (p.loop.at >= p.loop.length) {
          p.loop = null;
          p.calm = CALM;
        }
      } else if ((p.calm -= dt) <= 0 && Math.abs(wrap(aim - p.heading)) < 0.5 && Math.random() < (loops / 60) * (0.4 + push) * dt) {
        // Mostly lifted up and over, now and then dipping under. Up and over is anticlockwise going right, clockwise going left.
        const over = Math.random() < 0.75;
        p.loop = { at: 0, length: lerp(1.8, 2.8, Math.random()), way: over ? -p.side : p.side };
      }
      p.heading = wrap(p.heading + turn * dt);
      p.x += Math.cos(p.heading) * p.speed * dt;
      p.y += Math.sin(p.heading) * p.speed * dt;
      // Turns with its path, and rolls quicker the faster it goes.
      p.spin += (p.spinRate + 0.7 * turn) * dt;
      p.flip += p.flipRate * (0.4 + (0.6 * p.speed) / p.cruise) * dt;
    }
    const { width: W, height: H } = garden;
    this.list = this.list.filter((p) => p.x > -p.length && p.x < W + p.length && p.y < H + p.length && p.y > -H);
  }

  /** Puts them in depth order, ready for paintNext. */
  beginPaint() {
    this.order = this.list.slice().sort((a, b) => a.z - b.z);
    this.next = 0;
  }

  /** Depth of the next one to paint, or Infinity once they're all painted. */
  get nextDepth() {
    return this.next < this.order.length ? this.order[this.next].z : Infinity;
  }

  /** Paints the next one in depth order, in its plant's shade. */
  paintNext(ctx: CanvasRenderingContext2D) {
    const p = this.order[this.next++];
    const face = Math.cos(p.flip);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    // Rolling about its length it narrows and opens out again, but never past half its width, so its shape still shows.
    ctx.scale(1, Math.max(Math.abs(face), 0.55));
    // Its inner face prints lighter than its back.
    inShade(plantShade(p.plant, this.garden.settings.shade), () => inLight(() => p.paint(ctx, -lightStrength() * face)));
    ctx.restore();
  }
}
