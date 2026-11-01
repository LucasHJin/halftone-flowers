/**
 * Petals shaken loose by clicking or tapping a flower, one a click as it nods,
 * from where it was clicked, until it has none left. Each comes off right
 * where it was on the flower, at the size it was there, looking like a petal
 * from that flower (see looseLook). It fades in over the petal on the flower as
 * that fades off it, is carried along with the flower as it sways and nods at
 * first, and lets go, growing a little to the size it's drawn loose and
 * starting to turn and roll, all from still, so there's no moment it's cut
 * free. It drifts away to the left or the right along a wandering curve,
 * some sailing far across the bed, others sinking toward the ground, now and
 * then looping the loop, turning and rocking as it goes. None fade: each keeps
 * going until it's off the screen. A moment after it comes off, it turns
 * over a second or so from its flower's colours to the pointer trail's,
 * keeping its shading, the new colour spreading across it from where the
 * flower was clicked, dot by dot along a soft front.
 *
 * Each keeps the depth of the flower it came from, just in front of it, so it
 * passes over plants further back and behind nearer ones, and never changes
 * places with a plant it's over.
 *
 * A click that misses the flowers puffs tiny petals out from the spot instead,
 * copies of petals off a few flowers in the bed, in the pointer trail's
 * colours from the start. Each is at its own depth among the plants,
 * like an insect, so some pass in front of flowers and some behind, the ones
 * further back a little smaller and lighter. They fly out all round, each
 * growing in as it goes and swelling a little past its size, slow as the puff
 * dies down, then drift away like the rest.
 */
import { clamp, lerp, TAU } from "../utils/math.js";
import type { Garden } from "./garden.js";
import { ease, smoothstep, wrap } from "./insects/insect.js";
import { looseLook, petalAt, petalIndices, type LoosePaint } from "./paint/loose.js";
import { aimLight, inAccent, inLight, inShade, lightStrength, plantShade } from "./paint/tone.js";
import type { Head, Plant, Stem } from "./types.js";

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

/** How much further from a click than the nearest petal one can be and still be the one that comes off, as a share of its flower's size. */
const NEAR = 0.15;

/** How far from a click the nearest petal can be for one to come off at all, as a share of its flower's size (a spike's floret's). */
const REACH = 1.5;

/** Seconds a petal takes to fade off its flower as the loose one fades in over it. */
const HANDOFF = 0.4;

/** Seconds a loose petal is carried along with its flower, letting go as it goes. */
const RELEASE = 0.6;

/** Seconds a petal off a flower takes to ease from its size there into its size loose, and to start turning and rolling. */
const SETTLE = 0.6;

/** Seconds a puff's petal takes to grow in, swelling past its size and settling back. */
const GROW = 0.45;

/** Seconds a puff's outward rush takes to die down to about a third. */
const PUFF = 0.22;

/** How many flowers in the bed a puff's petals copy. */
const SOURCES = 3;

/** How deep the soft front the trail's colours spread across a petal behind is, in diamonds, and how many steps it's painted in. */
const FRONT = 2;
const FRONT_STEPS = 4;

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
  /** Where the flower was clicked. */
  tap: [number, number];
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
  /**
   * While it's coming away, the head it's coming off, which of its petals it
   * was, and where that was and which way it lay as it came off; null once
   * it's let go, and for a puff's.
   */
  peel: { stem: Stem; k: number; x: number; y: number; a: number } | null;
  /** How far its flower has carried it from where it came off, and turned it, as it lets go. */
  carry: [number, number, number];
  /** How far past its size it swells as it grows in, as a back-ease's overshoot; 0 for none. */
  swell: number;
  /** Px a second it's still rushing out from a puff, dying down. */
  kick: [number, number];
  /** Puffed out by a click that missed the flowers, rather than shaken off one: shaded by its own depth, not its flower's. */
  puffed: boolean;
  /**
   * Its turning to the pointer trail's colours: where on it the change starts,
   * in its own frame as it came off, how far from there each even share of it
   * is (see sharesFrom), the seconds after it comes off that it starts, and the
   * seconds it takes; none for a puff's, which starts in them.
   */
  turn: { x: number; y: number; shares: number[]; wait: number; takes: number };
}

let probe: CanvasRenderingContext2D | null = null;

/** How many even shares of a petal's area its turning colour is timed by. */
const SHARES = 10;

/**
 * How far from (x, y), in its own frame, a loose petal `length` px long has
 * each even share of its area, from where it's painted: the nearest it comes,
 * then out past a tenth of it, two tenths and so on to the furthest.
 */
function sharesFrom(paint: LoosePaint, length: number, x: number, y: number): number[] {
  // It's drawn about its middle, curling a little past its length at most.
  const size = Math.ceil(length * 1.5) + 4;
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const c = probe.canvas;
  if (c.width < size || c.height < size) [c.width, c.height] = [size, size];
  probe.setTransform(1, 0, 0, 1, 0, 0);
  probe.clearRect(0, 0, size, size);
  probe.translate(size / 2, size / 2);
  paint(probe, 0);
  const data = probe.getImageData(0, 0, size, size).data;
  const all: number[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (data[(j * size + i) * 4 + 3] >= 128) all.push(Math.hypot(i + 0.5 - size / 2 - x, j + 0.5 - size / 2 - y));
    }
  }
  if (!all.length) return [0, Math.hypot(x, y) + length / 2];
  all.sort((a, b) => a - b);
  return Array.from({ length: SHARES + 1 }, (_, k) => all[Math.min(all.length - 1, Math.round((k / SHARES) * (all.length - 1)))]);
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
  /** Heads with petals still fading off them. */
  private fading = new Set<Head>();
  private order: LoosePetal[] = [];
  private next = 0;

  constructor(private garden: Garden) {}

  /** Clears them all away, for a newly laid out bed. */
  reset() {
    this.list = [];
    this.coming = [];
    this.fading.clear();
  }

  /**
   * Shakes one of the petals the head on `s` has left off it, a moment into
   * its nod from a click at (x, y): the one nearest the click, or one about as
   * near, so it comes from where the flower was clicked, even partway up a
   * long spike or plume. None does if even the nearest is too far off, as on a
   * stretch of spike already bare.
   */
  shed(plant: Plant, s: Stem, x: number, y: number) {
    const h = s.head!;
    let left = petalIndices(s, h).filter((k) => !h.lost.has(k) && !this.coming.some((c) => c.stem === s && c.k === k));
    if (!left.length || this.list.length + this.coming.length >= MOST) return;
    // A peony's outer petals go first.
    if (h.kind === "peony") left = left.slice(0, 3);
    const away = left.map((k) => {
      const at = petalAt(s, h, k, this.garden.time);
      return Math.hypot(at.x - x, at.y - y);
    });
    const nearest = Math.min(...away);
    if (nearest > h.radius * REACH) return;
    const near = left.filter((_, i) => away[i] <= nearest + h.radius * NEAR);
    const k = near[Math.floor(Math.random() * near.length)];
    this.coming.push({ plant, stem: s, k, at: this.garden.time + lerp(0.05, 0.15, Math.random()), tap: [x, y] });
  }

  /** Petal `k` comes off its head, right where it was. */
  private loosen({ plant, stem: s, k, tap }: Coming) {
    const { cell, settings, time, bloom } = this.garden;
    const { size, sink, wait, turn } = settings.petals;
    const h = s.head!;
    h.lost.add(k);
    const look = looseLook(s, h, k, cell, size);
    const at = petalAt(s, h, k, time);
    // Mostly off to the side it was on, setting out the way it pointed and lifting, from still.
    const side = Math.cos(at.out) + lerp(-0.6, 0.6, Math.random()) >= 0 ? 1 : -1;
    const from = Math.min(1, 1 / look.scale);
    // The click in its own frame, unturned and at its loose size, as it is the moment it comes off.
    const dx = tap[0] - at.x;
    const dy = tap[1] - at.y;
    const ox = (dx * Math.cos(at.a) + dy * Math.sin(at.a)) / from;
    const oy = (dy * Math.cos(at.a) - dx * Math.sin(at.a)) / from;
    const shares = sharesFrom(look.paint, look.length, ox, oy);
    this.list.push({
      ...drifting(bloom, sink),
      x: at.x,
      y: at.y,
      z: plant.depth + ON_TOP,
      plant,
      side,
      heading: Math.atan2(Math.sin(at.out) - 0.8, Math.cos(at.out)),
      // Lying as it lay on the flower, facing you.
      spin: at.a,
      flip: 0,
      paint: look.paint,
      length: look.length,
      from,
      peel: { stem: s, k, x: at.x, y: at.y, a: at.a },
      carry: [0, 0, 0],
      swell: 0,
      kick: [0, 0],
      puffed: false,
      turn: { x: ox, y: oy, shares, wait: lerp(wait[0], wait[1], Math.random()), takes: lerp(turn[0], turn[1], Math.random()) },
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
        peel: null,
        carry: [0, 0, 0],
        swell: SWELL,
        kick: [Math.cos(a) * rush, Math.sin(a) * rush],
        puffed: true,
        turn: { x: 0, y: 0, shares: [], wait: 0, takes: 0 },
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
    for (const h of this.fading) h.leaving.clear();
    this.fading.clear();
    for (const p of this.list) {
      p.age += dt;
      if (p.peel) this.peel(p, p.peel);
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
      // Turns with its path, and rolls quicker the faster it goes, tumbling as it rushes out of a puff. Coming off a flower, it starts still.
      const start = p.puffed ? 1 : smoothstep(0, SETTLE, p.age);
      p.spin += (p.spinRate + 0.7 * turn) * start * dt;
      p.flip += p.flipRate * (0.4 + (0.6 * (p.speed + Math.hypot(p.kick[0], p.kick[1]))) / p.cruise) * start * dt;
      p.kick[0] *= calming;
      p.kick[1] *= calming;
    }
    const { width: W, height: H } = garden;
    this.list = this.list.filter((p) => p.x > -p.length && p.x < W + p.length && p.y < H + p.length && p.y > -H);
  }

  /** Fades `p`'s petal off its flower as it fades in, and carries it along with the flower, letting go. */
  private peel(p: LoosePetal, { stem, k, x, y, a }: NonNullable<LoosePetal["peel"]>) {
    const h = stem.head!;
    if (p.age < HANDOFF) {
      h.leaving.set(k, 1 - smoothstep(0, HANDOFF, p.age));
      this.fading.add(h);
    }
    if (p.age >= RELEASE) {
      p.peel = null;
      p.carry = [0, 0, 0];
      return;
    }
    const at = petalAt(stem, h, k, this.garden.time);
    const hold = 1 - smoothstep(0, RELEASE, p.age);
    p.carry = [(at.x - x) * hold, (at.y - y) * hold, wrap(at.a - a) * hold];
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
    ctx.translate(p.x + p.carry[0], p.y + p.carry[1]);
    ctx.rotate(p.spin + p.carry[2]);
    // Off a flower, it eases from its size there into its loose size and shading. A puff's grows quickly at first, swelling past it, then settles.
    const t = Math.min(p.age / GROW, 1) - 1;
    const off = p.puffed ? 1 + t ** 3 : smoothstep(0, SETTLE, p.age);
    const grown = lerp(p.from, 1, off + p.swell * t * t * (1 + t));
    // Off a flower, it fades in as the petal there fades off, quickly enough that between them they don't thin out.
    const shown = p.puffed ? 1 : 1 - (1 - Math.min(p.age / HANDOFF, 1)) ** 2;
    ctx.globalAlpha = shown;
    // Rolling about its length it narrows and opens out again, but never past half its width, so its shape still shows.
    ctx.scale(grown, grown * Math.max(Math.abs(face), 0.55));
    // Its inner face prints lighter than its back. A puff's petal prints lighter the further back it is, as an insect does; the rest in their flower's shade.
    const { shade } = this.garden.settings;
    const by = p.puffed ? shade.depth * (p.z - 1) : plantShade(p.plant, shade);
    // Its sides lit as they face now.
    aimLight(p.spin);
    const paint = () => inShade(by, () => inLight(() => p.paint(ctx, -lightStrength() * face * off)));
    const { x, y, shares, wait, takes } = p.turn;
    const turned = takes > 0 ? (p.age - wait) / takes : 1;
    if (turned >= 1) inAccent(paint);
    else if (turned <= 0) paint();
    else {
      paint();
      // The trail's colours over it, inside a circle growing from where it was clicked, a step stronger each smaller one, so the front is soft.
      // It sweeps an even share of the petal each moment, so the change takes the whole time rather than racing across its broad middle.
      const depth = FRONT * this.garden.cell;
      const at = turned * SHARES;
      const k = Math.floor(at);
      const r = lerp(shares[k], shares[k + 1], at - k) + depth * turned;
      for (let m = 0; m < FRONT_STEPS && r - (depth * m) / FRONT_STEPS > 0; m++) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r - (depth * m) / FRONT_STEPS, 0, TAU);
        ctx.clip();
        // Laid over the last, this brings the trail's share there up to (m + 1) / FRONT_STEPS.
        ctx.globalAlpha = shown / (FRONT_STEPS - m);
        inAccent(paint);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
