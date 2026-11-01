/**
 * Petals shaken loose by clicking or tapping a flower, one a click as it nods,
 * until it has none left. Each comes off right where it was on the
 * flower, at the size it was there, and grows a little as it lifts off to the
 * size it's drawn loose (see looseLook), looking like a petal from that
 * flower. It drifts away to the left or the right along a wandering curve,
 * some sailing far across the bed, others sinking toward the ground, now and
 * then looping the loop, turning and rocking as it goes. None fade: each keeps
 * going until it's off the screen.
 *
 * Each keeps the depth of the flower it came from, just in front of it, so it
 * passes over plants further back and behind nearer ones, and never changes
 * places with a plant it's over.
 *
 * A click that misses the flowers puffs tiny petals out from the spot instead,
 * copies of petals off a few flowers in the bed, in the colours the insects
 * and the pointer's trail print in. Each is at its own depth among the plants,
 * like an insect, so some pass in front of flowers and some behind, the ones
 * further back a little smaller and lighter. They fly out all round, each
 * growing in as it goes and swelling a little past its size, slow as the puff
 * dies down, then drift away like the rest.
 */
import { clamp, lerp, TAU } from "../../utils/math";
import type { Garden } from "./garden";
import { ease, wrap } from "./insects/insect";
import { looseLook, petalAt, petalIndices, type LoosePaint } from "./paint/loose";
import { inAccent, inLight, inShade, lightStrength, plantShade } from "./paint/tone";
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

/** Seconds a petal takes to grow from its size on the flower to its size loose. */
const GROW = 0.45;

/** Seconds a puff's outward rush takes to die down to about a third. */
const PUFF = 0.22;

/** How many flowers in the bed a puff's petals copy. */
const SOURCES = 3;

/** How far past its size a puff's petal swells as it grows in, as a back-ease's overshoot: about an eighth. */
const SWELL = 2;

/** Its size as a puff's petal sets out, as a share of its size loose. */
const SEED = 0.2;

/** A petal about to come off: the flower it's on, which of its petals it is, and when, in garden seconds. */
interface Coming {
  plant: Plant;
  stem: Stem;
  k: number;
  at: number;
}

interface LoosePetal {
  x: number;
  y: number;
  /** Depth among the plants: its flower's, just in front of it, or a puff's petal's own. */
  z: number;
  /** The plant it came from, whose shade it prints in unless it's a puff's. */
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
  /** Its size as it came off, as a share of its size loose. */
  from: number;
  /** How far past its size it swells as it grows in, as a back-ease's overshoot; 0 for none. */
  swell: number;
  /** Px a second it's still rushing out from a puff, dying down. */
  kick: [number, number];
  /** Prints in the accent ramp, the pointer trail's colours, as a puff's petals do. */
  accent: boolean;
}

/** How a petal drifts once loose, its own pace, wandering, loops and tumbling, from still. */
function drifting(bloom: number, sink: number) {
  return {
    speed: 0,
    cruise: bloom * lerp(1.8, 3, Math.random()),
    aim: Math.random() < sink ? lerp(0.7, 1.1, Math.random()) : lerp(0.02, 0.3, Math.random()),
    age: 0,
    wander: [Math.random() * TAU, Math.random() * TAU, TAU * lerp(0.15, 0.35, Math.random())] as [number, number, number],
    loop: null,
    calm: lerp(0.8, 2, Math.random()),
    spinRate: (Math.random() < 0.5 ? -1 : 1) * lerp(0.4, 1.6, Math.random()),
    flipRate: (Math.random() < 0.5 ? -1 : 1) * lerp(1, 2.5, Math.random()),
  };
}

export class Petals {
  list: LoosePetal[] = [];
  private coming: Coming[] = [];
  private order: LoosePetal[] = [];
  private next = 0;

  constructor(private garden: Garden) {}

  /** Clears them all away, for a newly laid out bed. */
  reset() {
    this.list = [];
    this.coming = [];
  }

  /** Shakes one of the petals the head on `s` has left off it, a moment into its nod. */
  shed(plant: Plant, s: Stem) {
    const h = s.head!;
    const left = petalIndices(s, h).filter((k) => !h.lost.has(k) && !this.coming.some((c) => c.stem === s && c.k === k));
    if (!left.length || this.list.length + this.coming.length >= MOST) return;
    // A peony's outer petals go first.
    const k = left[Math.floor(Math.random() * (h.kind === "peony" ? Math.min(3, left.length) : left.length))];
    this.coming.push({ plant, stem: s, k, at: this.garden.time + lerp(0.05, 0.15, Math.random()) });
  }

  /** Petal `k` comes off its head, right where it was. */
  private loosen({ plant, stem: s, k }: Coming) {
    const { cell, settings, time, bloom } = this.garden;
    const { size, sink } = settings.petals;
    const h = s.head!;
    h.lost.add(k);
    const look = looseLook(s, h, k, cell, size);
    const at = petalAt(s, h, k, time);
    // Mostly off to the side it was on, setting out the way it pointed and lifting, from still.
    const side = Math.cos(at.a) + lerp(-0.6, 0.6, Math.random()) >= 0 ? 1 : -1;
    this.list.push({
      ...drifting(bloom, sink),
      x: at.x,
      y: at.y,
      z: plant.depth + ON_TOP,
      plant,
      side,
      heading: Math.atan2(Math.sin(at.a) - 0.8, Math.cos(at.a)),
      // Lying as it lay on the flower, facing you.
      spin: at.a,
      flip: 0,
      paint: look.paint,
      length: look.length,
      from: Math.min(1, 1 / look.scale),
      swell: 0,
      kick: [0, 0],
      accent: false,
    });
  }

  /** Tiny petals puff out all round (x, y), copies of petals off a few flowers in the bed. */
  puff(x: number, y: number) {
    const { cell, settings, bloom, plants } = this.garden;
    const { count, size, reach } = settings.splash;
    const { sink } = settings.petals;
    const heads = plants.flatMap((plant) => plant.stems.filter((s) => s.head && petalIndices(s, s.head).length).map((stem) => ({ plant, stem })));
    if (!heads.length) return;
    const from = Array.from({ length: SOURCES }, () => heads[Math.floor(Math.random() * heads.length)]);
    const n = Math.min(Math.round(lerp(count[0] - 0.49, count[1] + 0.49, Math.random())), MOST - this.list.length - this.coming.length);
    const start = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const { plant, stem: s } = from[Math.floor(Math.random() * from.length)];
      const h = s.head!;
      const all = petalIndices(s, h);
      const k = all[Math.floor(Math.random() * all.length)];
      // The same few dots long off a lily as off a daisy, a little smaller further back: a loose petal's length goes with the size it's asked for.
      const z = Math.random();
      const look = looseLook(s, h, k, cell, (lerp(size[0], size[1], Math.random()) * lerp(0.85, 1.1, z) * bloom) / looseLook(s, h, k, cell, 1).length);
      // Evenly round, each nudged off its share, flying its own way out.
      const a = start + (TAU * (i + lerp(-0.35, 0.35, Math.random()))) / n;
      const rush = (lerp(reach[0], reach[1], Math.random()) * bloom) / PUFF;
      this.list.push({
        ...drifting(bloom, sink),
        x,
        y,
        z,
        plant,
        side: Math.cos(a) + lerp(-0.6, 0.6, Math.random()) >= 0 ? 1 : -1,
        heading: a,
        spin: Math.random() * TAU,
        flip: Math.random() * TAU,
        paint: look.paint,
        length: look.length,
        from: SEED,
        swell: SWELL,
        kick: [Math.cos(a) * rush, Math.sin(a) * rush],
        accent: true,
      });
    }
  }

  step(dt: number) {
    const garden = this.garden;
    const { speed, loops } = garden.settings.petals;
    const calming = Math.exp(-dt / PUFF);
    this.coming = this.coming.filter((c) => {
      if (c.at > garden.time) return true;
      this.loosen(c);
      return false;
    });
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
      p.x += (Math.cos(p.heading) * p.speed + p.kick[0]) * dt;
      p.y += (Math.sin(p.heading) * p.speed + p.kick[1]) * dt;
      // Turns with its path, and rolls quicker the faster it goes, tumbling as it rushes out of a puff.
      p.spin += (p.spinRate + 0.7 * turn) * dt;
      p.flip += p.flipRate * (0.4 + (0.6 * (p.speed + Math.hypot(p.kick[0], p.kick[1]))) / p.cruise) * dt;
      p.kick[0] *= calming;
      p.kick[1] *= calming;
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
    // Coming off, it grows quickly at first, then settles into its loose size and shading, a puff's swelling past it on the way.
    const t = Math.min(p.age / GROW, 1) - 1;
    const off = 1 + t ** 3;
    const grown = lerp(p.from, 1, off + p.swell * t * t * (1 + t));
    // Rolling about its length it narrows and opens out again, but never past half its width, so its shape still shows.
    ctx.scale(grown, grown * Math.max(Math.abs(face), 0.55));
    // Its inner face prints lighter than its back. A puff's petal prints lighter the further back it is, as an insect does; the rest in their flower's shade.
    const { shade } = this.garden.settings;
    const by = p.accent ? shade.depth * (p.z - 1) : plantShade(p.plant, shade);
    const paint = () => inShade(by, () => inLight(() => p.paint(ctx, -lightStrength() * face * off)));
    if (p.accent) inAccent(paint);
    else paint();
    ctx.restore();
  }
}
