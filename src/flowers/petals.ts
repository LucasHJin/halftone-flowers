/**
 * `shed` takes one petal off a clicked flower: it cross-fades with the petal
 * there, rides with the flower briefly, then drifts, turning to the trail's
 * colours outward from the click. `puff` throws tiny copies of a few flowers'
 * petals out from a click on empty space, already in the trail's colours and
 * each at its own depth. None fade out; each drifts until it is off screen.
 */
import { clamp, lerp, TAU } from "../utils/math.js";
import type { Field } from "./field.js";
import { ease, smoothstep, wrap } from "./insects/insect.js";
import { looseLook, petalAt, petalIndices, type LoosePaint } from "./paint/loose.js";
import { aimLight, inAccent, inLight, inShade, lightStrength, plantShade } from "./paint/tone.js";
import type { Head, Plant, Stem } from "./types.js";

/** Max loose plus queued petals; past it a click still nods its flower but nothing comes off. */
const MOST = 150;

/** Depth just in front of its flower, so a shed petal paints over it. */
const ON_TOP = 5e-5;

/** Time constant, s, of turning back to its aimed heading. */
const STEER = 1.4;

/** Peak turn rate of its wander, rad/s. */
const WANDER = 0.8;

/** Seconds after a loop ends before another can start. */
const CALM = 3;

/** A petal this much further from the click than the nearest may come off instead, × `h.radius`. */
const NEAR = 0.15;

/** Nothing comes off if the nearest petal is further than this from the click, × `h.radius`. */
const REACH = 1.5;

/** Seconds of cross-fade from the petal on the flower to the loose one. */
const HANDOFF = 0.4;

/** Seconds a shed petal rides along with its flower, easing off. */
const RELEASE = 0.6;

/** Seconds a shed petal takes to grow into its loose size and shading, and to start spinning and rolling. */
const SETTLE = 0.6;

/** Seconds a puffed petal takes to grow in. */
const GROW = 0.45;

/** Time constant, s, of a puff's outward rush; its speed is set so it covers `splash.reach`. */
const PUFF = 0.22;

/** Random flowers (repeats allowed) a puff's petals copy. */
const SOURCES = 3;

/** Width of the soft colour front in cells, and the steps it's painted in. */
const FRONT = 2;
const FRONT_STEPS = 4;

/** Back-ease overshoot of a puffed petal's grow-in; peaks about 10% past full size. */
const SWELL = 2;

/** A puffed petal's starting size, as a share of its loose size. */
const SEED = 0.2;

/** A petal queued to come off: petal `k` of `stem`'s head, at field time `at`. */
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
  /** Depth, 0 back to 1 front: just in front of its flower's, or random for a puffed one. */
  z: number;
  /** Source plant, whose shade it prints in unless `puffed`. */
  plant: Plant;
  /** Which way it drifts: -1 left, 1 right. */
  side: number;
  /** Direction of travel, radians clockwise from rightward. */
  heading: number;
  /** Px a second now, and its own pace in a moderate wind. */
  speed: number;
  cruise: number;
  /** Radians below level it heads between loops: small sails far, large sinks. */
  aim: number;
  /** Seconds since it came loose. */
  age: number;
  /** Two phases, radians, and a rate, rad/s, of its wander. */
  wander: [number, number, number];
  /** Current loop: seconds in, its length in s, and `way` 1 clockwise on screen, -1 anticlockwise. */
  loop: { at: number; length: number; way: number } | null;
  /** Seconds until it can next loop. */
  calm: number;
  /** In-screen rotation, radians clockwise, and its own turn rate, rad/s. */
  spin: number;
  spinRate: number;
  /** Roll about its length, radians, and roll rate, rad/s. */
  flip: number;
  flipRate: number;
  paint: LoosePaint;
  /** Px across its longest way. */
  length: number;
  /** Starting size, as a share of its loose size. */
  from: number;
  /** While coming off: its stem, petal index, and position and angle as it came off; null after, and for puffed ones. */
  peel: { stem: Stem; k: number; x: number; y: number; a: number } | null;
  /** Offset px and turn radians its flower has carried it by since it came off, easing to 0 by `RELEASE`. */
  carry: [number, number, number];
  /** Back-ease overshoot as it grows in; 0 for none. */
  swell: number;
  /** Velocity, px/s, of a puff's outward rush, decaying over `PUFF`. */
  kick: [number, number];
  /** From `puff`: shaded by its own `z`, not its plant's. */
  puffed: boolean;
  /**
   * Turning to the trail's colours: start point in its own frame as it came off,
   * radii holding each even share of its area (see `sharesFrom`), and delay and
   * duration in s. `takes` is 0 for puffed ones, which start turned.
   */
  turn: { x: number; y: number; shares: number[]; wait: number; takes: number };
}

let probe: CanvasRenderingContext2D | null = null;

/** Equal-area steps the colour front is timed by. */
const SHARES = 10;

/**
 * Radii about (x, y), in the petal's own frame, holding 0, 1/`SHARES`, ... and
 * all of its painted area, measured off a rasterised copy at its loose size.
 */
function sharesFrom(paint: LoosePaint, length: number, x: number, y: number): number[] {
  // Drawn about its middle; a curled petal can overrun `length` a little.
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
  if (!all.length) {
    // Nothing painted at this size: equal-area steps of a disc reaching the far end.
    const reach = Math.hypot(x, y) + length / 2;
    return Array.from({ length: SHARES + 1 }, (_, k) => reach * Math.sqrt(k / SHARES));
  }
  all.sort((a, b) => a - b);
  return Array.from({ length: SHARES + 1 }, (_, k) => all[Math.min(all.length - 1, Math.round((k / SHARES) * (all.length - 1)))]);
}

/** Random drift for a new loose petal, at rest. `sink` is the chance it sinks instead of sailing far. */
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
  /** Heads with petals fading off; their `leaving` is cleared and refilled every `step`. */
  private fading = new Set<Head>();
  private order: LoosePetal[] = [];
  private next = 0;

  constructor(private field: Field) {}

  reset() {
    this.list = [];
    this.coming = [];
    this.fading.clear();
  }

  /**
   * Queues the petal left on `s`'s head nearest the click at (x, y), or one
   * about as near, to come off a moment into the nod. None if even the nearest
   * is past `REACH`, as on a bare stretch of spike. Returns how many it has
   * left after that one, or null if none comes off.
   */
  shed(plant: Plant, s: Stem, x: number, y: number) {
    const h = s.head!;
    let left = petalIndices(s, h).filter((k) => !h.lost.has(k) && !this.coming.some((c) => c.stem === s && c.k === k));
    if (!left.length || this.list.length + this.coming.length >= MOST) return null;
    const remaining = left.length - 1;
    // A peony's outer petals go first.
    if (h.kind === "peony") left = left.slice(0, 3);
    const away = left.map((k) => {
      const at = petalAt(s, h, k, this.field.time);
      return Math.hypot(at.x - x, at.y - y);
    });
    const nearest = Math.min(...away);
    if (nearest > h.radius * REACH) return null;
    const near = left.filter((_, i) => away[i] <= nearest + h.radius * NEAR);
    const k = near[Math.floor(Math.random() * near.length)];
    this.coming.push({ plant, stem: s, k, at: this.field.time + lerp(0.05, 0.15, Math.random()), tap: [x, y] });
    return remaining;
  }

  /** Takes petal `k` off its head, starting loose where it was, at its angle and size there. */
  private loosen({ plant, stem: s, k, tap }: Coming) {
    const { cell, settings, time, bloom } = this.field;
    const { size, sink, wait, turn } = settings.petals;
    const h = s.head!;
    h.lost.add(k);
    const look = looseLook(s, h, k, cell, size);
    const at = petalAt(s, h, k, time);
    // Mostly toward the side it pointed, setting out that way but tilted up.
    const side = Math.cos(at.out) + lerp(-0.6, 0.6, Math.random()) >= 0 ? 1 : -1;
    const from = Math.min(1, 1 / look.scale);
    // The click in its own frame: unrotated by `at.a` and scaled from `from` up to its loose size.
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
      // As it lay on the flower, face on.
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

  /** Tiny copies of petals off up to `SOURCES` random flowers burst out all round (x, y). Returns how many. */
  puff(x: number, y: number) {
    const { cell, settings, bloom, plants } = this.field;
    const { count, size, reach } = settings.splash;
    const { sink } = settings.petals;
    const heads = plants.flatMap((plant) => plant.stems.filter((s) => s.head && petalIndices(s, s.head).length).map((stem) => ({ plant, stem })));
    if (!heads.length) return 0;
    const from = Array.from({ length: SOURCES }, () => heads[Math.floor(Math.random() * heads.length)]);
    const n = Math.min(Math.round(lerp(count[0] - 0.49, count[1] + 0.49, Math.random())), MOST - this.list.length - this.coming.length);
    const start = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const { plant, stem: s } = from[Math.floor(Math.random() * from.length)];
      const h = s.head!;
      const all = petalIndices(s, h);
      const k = all[Math.floor(Math.random() * all.length)];
      // Scaled so every kind comes out the same length in px, a little smaller further back (low `z`).
      const z = Math.random();
      const look = looseLook(s, h, k, cell, (lerp(size[0], size[1], Math.random()) * lerp(0.85, 1.1, z) * bloom) / looseLook(s, h, k, cell, 1).length);
      // Evenly round, each jittered within its share.
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
    return Math.max(0, n);
  }

  step(dt: number) {
    const field = this.field;
    const { speed, loops } = field.settings.petals;
    const calming = Math.exp(-dt / PUFF);
    this.coming = this.coming.filter((c) => {
      if (c.at > field.time) return true;
      this.loosen(c);
      return false;
    });
    for (const h of this.fading) h.leaving.clear();
    this.fading.clear();
    for (const p of this.list) {
      p.age += dt;
      if (p.peel) this.peel(p, p.peel);
      // Faster and flatter in a gust either way, and faster heading down than up, as if it had some weight.
      const push = clamp(Math.abs(field.windNow(p.x, p.y)), 0, 1.5);
      p.speed = ease(p.speed, p.cruise * speed * (0.6 + 0.5 * push) * (1 + 0.3 * Math.sin(p.heading)), 0.6, dt);
      const below = p.aim * (1 - 0.3 * Math.min(push, 1));
      const aim = p.side > 0 ? below : Math.PI - below;
      const [p1, p2, rate] = p.wander;
      const t = p.age * rate;
      const drift = wrap(aim - p.heading) / STEER + (WANDER * (Math.sin(t + p1) + 0.6 * Math.sin(2.3 * t + p2))) / 1.6;
      let turn = drift;
      if (p.loop) {
        // `2 f²` averages 1, so the loop adds one full turn, tightest halfway, and it comes out heading as it went in.
        const f = Math.sin((Math.PI * p.loop.at) / p.loop.length);
        turn = p.loop.way * (TAU / p.loop.length) * 2 * f * f + (1 - f) * drift;
        p.loop.at += dt;
        if (p.loop.at >= p.loop.length) {
          p.loop = null;
          p.calm = CALM;
        }
      } else if ((p.calm -= dt) <= 0 && Math.abs(wrap(aim - p.heading)) < 0.5 && Math.random() < (loops / 60) * (0.4 + push) * dt) {
        // 75% go up and over (anticlockwise going right, clockwise going left); the rest dip under.
        const over = Math.random() < 0.75;
        p.loop = { at: 0, length: lerp(1.8, 2.8, Math.random()), way: over ? -p.side : p.side };
      }
      p.heading = wrap(p.heading + turn * dt);
      p.x += (Math.cos(p.heading) * p.speed + p.kick[0]) * dt;
      p.y += (Math.sin(p.heading) * p.speed + p.kick[1]) * dt;
      // Spins with its path and rolls faster the faster it moves, puff rush included. Shed ones ease in from still over `SETTLE`.
      const start = p.puffed ? 1 : smoothstep(0, SETTLE, p.age);
      p.spin += (p.spinRate + 0.7 * turn) * start * dt;
      p.flip += p.flipRate * (0.4 + (0.6 * (p.speed + Math.hypot(p.kick[0], p.kick[1]))) / p.cruise) * start * dt;
      p.kick[0] *= calming;
      p.kick[1] *= calming;
    }
    const { width: W, height: H } = field;
    this.list = this.list.filter((p) => p.x > -p.length && p.x < W + p.length && p.y < H + p.length && p.y > -H);
  }

  /** Fades the petal on the flower out over `HANDOFF`, and carries `p` with the flower, easing off over `RELEASE`. */
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
    const at = petalAt(stem, h, k, this.field.time);
    const hold = 1 - smoothstep(0, RELEASE, p.age);
    p.carry = [(at.x - x) * hold, (at.y - y) * hold, wrap(at.a - a) * hold];
  }

  /** `beginPaint`, `nextDepth` and `paintNext` are the `Movers` protocol in paint/index.ts. */
  beginPaint() {
    this.order = this.list.slice().sort((a, b) => a.z - b.z);
    this.next = 0;
  }

  get nextDepth() {
    return this.next < this.order.length ? this.order[this.next].z : Infinity;
  }

  paintNext(ctx: CanvasRenderingContext2D) {
    const p = this.order[this.next++];
    const face = Math.cos(p.flip);
    ctx.save();
    ctx.translate(p.x + p.carry[0], p.y + p.carry[1]);
    ctx.rotate(p.spin + p.carry[2]);
    // Shed: from its size on the flower into its loose size and shading over `SETTLE`. Puffed: ease-out over `GROW`, overshooting by `swell`.
    const t = Math.min(p.age / GROW, 1) - 1;
    const off = p.puffed ? 1 + t ** 3 : smoothstep(0, SETTLE, p.age);
    const grown = lerp(p.from, 1, off + p.swell * t * t * (1 + t));
    // Fades in faster than the flower's petal fades out, so the pair never thins.
    const shown = p.puffed ? 1 : 1 - (1 - Math.min(p.age / HANDOFF, 1)) ** 2;
    ctx.globalAlpha = shown;
    // Rolling narrows it, but never below 0.55 of its width, so its shape still shows.
    ctx.scale(grown, grown * Math.max(Math.abs(face), 0.55));
    // Puffed ones print lighter the further back, like insects; shed ones in their plant's shade.
    const { shade } = this.field.settings;
    const by = p.puffed ? shade.depth * (p.z - 1) : plantShade(p.plant, shade);
    // Its sides lit as they face now; its inner face (`face` > 0) prints lighter than its back.
    aimLight(p.spin);
    const paint = () => inShade(by, () => inLight(() => p.paint(ctx, -lightStrength() * face * off)));
    const { x, y, shares, wait, takes } = p.turn;
    const turned = takes > 0 ? (p.age - wait) / takes : 1;
    if (turned >= 1) inAccent(paint);
    else if (turned <= 0) paint();
    else {
      paint();
      // Accent layered inside `FRONT_STEPS` shrinking circles about the click, stronger inward, so the front is soft.
      // The radius follows `shares`, so area turns at an even rate instead of racing across the broad middle.
      const depth = FRONT * this.field.cell;
      const at = turned * SHARES;
      const k = Math.floor(at);
      const r = lerp(shares[k], shares[k + 1], at - k) + depth * turned;
      for (let m = 0; m < FRONT_STEPS && r - (depth * m) / FRONT_STEPS > 0; m++) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r - (depth * m) / FRONT_STEPS, 0, TAU);
        ctx.clip();
        // Over the layers before, this brings the accent's share up to (m + 1) / `FRONT_STEPS`.
        ctx.globalAlpha = shown / (FRONT_STEPS - m);
        inAccent(paint);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
