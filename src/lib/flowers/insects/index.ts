/**
 * Butterflies and bees that come and go. Every so often one flies in from
 * the side or the top, visits a few flowers, sitting on each a while, and
 * flies off again, leaving a fading trail behind it.
 *
 * They fly in 3D: depth among the plants is a third direction to fly in, so
 * one heading into or out of the screen passes behind some plants and in
 * front of others, and it's painted between them in that order. It never
 * passes through the head of the flower it's visiting or the one it just
 * left: while over it, it keeps to its own side, and crosses over only once
 * clear. It only settles where nearer plants don't hide it. It prints in the
 * halftone's accent ramp.
 */
import { clamp, lerp, TAU } from "../../../utils/math";
import type { Garden } from "../garden";
import { inAccent, inShade } from "../paint/tone";
import type { Plant, Stem } from "../types";
import { BEE } from "./bee";
import { BUTTERFLY } from "./butterfly";
import { Cover } from "./cover";
import { beside, clearOf, DEPTH, ease, orient, perch, randomQuirks, REACH, steer, wrap, type Flower, type Insect, type InsectGroup, type InsectKind } from "./insect";
import { expire, extend, paintSegment, type Trail } from "./trail";

export type { Insect, InsectKind } from "./insect";

const GROUPS: Record<InsectKind, InsectGroup> = { butterfly: BUTTERFLY, bee: BEE };

/** How far in front of its flower a sitting insect is, in depth, so it's painted just over it. */
const ON_TOP = 1e-4;

/** How far in front of or behind a flower an insect comes round to before crossing over its head, in depth. */
const AHEAD = 0.12;

/** Most of where it would sit that nearer plants may hide for an insect to settle on a flower. */
const HIDDEN = 0.12;

/** Where to fly to: across, down, and depth. */
type Goal = readonly [number, number, number];

type Edge = "left" | "right" | "top";

/** One thing to paint: an insect, or one segment of a trail. */
interface Part {
  z: number;
  insect: Insect | null;
  trail: Trail | null;
  i: number;
}

export class Insects {
  list: Insect[] = [];
  private trails: Trail[] = [];
  /** Seconds until the next one is due. */
  private wait = 0;
  private parts: Part[] = [];
  private next = 0;
  private cover = new Cover();

  constructor(private garden: Garden) {
    this.reset();
  }

  /** Clears every insect and trail away, for a newly laid out bed. */
  reset() {
    this.list = [];
    this.trails = [];
    this.wait = this.gap() * 0.4;
  }

  /** Sends one in now, whatever the timing and limit; without a kind, picked by the settings' odds. */
  release(kind?: InsectKind) {
    const settings = this.garden.settings.insects;
    const [butterflies, bees] = settings.odds;
    if (!kind) {
      if (butterflies + bees <= 0) return;
      kind = Math.random() * (butterflies + bees) < butterflies ? "butterfly" : "bee";
    }
    const group = GROUPS[kind];
    const species = pick(group.species.map((sp) => sp.odds));
    const sp = group.species[species];
    // Some a good deal bigger than others of their species.
    const size = this.garden.bloom * group.size * sp.size * settings.size * lerp(0.9, 1.3, Math.random());
    const quirks = randomQuirks();
    quirks.pace *= sp.pace;
    const from = this.pickEdge();
    let [x, y] = this.offEdge(from, size * 1.5);
    const b: Insect = {
      kind,
      species,
      size,
      x,
      y,
      z: Math.random(),
      vx: 0,
      vy: 0,
      vz: 0,
      ax: 0,
      ay: 0,
      az: 0,
      zGoal: Math.random(),
      phase: "leaving",
      plant: null,
      stem: null,
      last: null,
      side: 1,
      hovers: false,
      lean: 0,
      timer: 0,
      visits: Math.round(lerp(settings.visits[0] - 0.49, settings.visits[1] + 0.49, Math.random())),
      exitX: 0,
      exitY: 0,
      age: 0,
      wobble: [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU, sp.weave * lerp(0.8, 1.25, Math.random())],
      quirks,
      air: 1,
      flap: Math.random() * TAU,
      wing: 0,
      bob: 0,
      yaw: 0,
      rest: 0,
      pitch: 0,
      roll: 0,
      tilt: 0,
      trail: { points: [], owner: null },
    };
    b.trail.owner = b;
    this.moveOn(b, from);
    // Already on its way in, and facing that way.
    const goal = b.stem ? { ...perch(b.stem), z: b.plant!.depth } : { x: b.exitX, y: b.exitY, z: b.zGoal };
    if (from === "top" && b.stem) {
      // Off to the roomier side of its flower, so it comes down to it no steeper than it dives.
      const W = this.garden.width;
      const out = size * 1.5;
      x = clamp(goal.x + Math.sign(W / 2 - goal.x || 1) * ((goal.y - y) / Math.tan(group.flight.dive)), -out, W + out);
      b.x = x;
      b.side = x < goal.x ? -1 : 1;
    }
    const dx = goal.x - x;
    const dy = goal.y - y;
    const dz = (goal.z - b.z) * size * DEPTH;
    const v = (group.flight.cruise * size * b.quirks.pace * 0.7) / (Math.hypot(dx, dy, dz) || 1);
    b.vx = dx * v;
    b.vy = dy * v;
    b.vz = dz * v;
    b.yaw = Math.atan2(b.vz, b.vx);
    this.list.push(b);
    this.trails.push(b.trail);
  }

  step(dt: number) {
    const garden = this.garden;
    const settings = garden.settings.insects;
    if (garden.growing === null && settings.enabled) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = this.gap();
        if (this.list.length < settings.most) this.release();
      }
    }
    for (const b of this.list) {
      if (!settings.enabled && b.phase !== "leaving") this.leave(b);
      this.fly(b, dt);
    }
    this.list = this.list.filter((b) => {
      if (!this.gone(b)) return true;
      b.trail.owner = null;
      return false;
    });
    for (const t of this.trails) expire(t, garden.time, settings.trail.fade);
    this.trails = this.trails.filter((t) => t.owner || t.points.length > 1);
  }

  /** Gathers everything to paint in depth order, ready for paintNext. */
  beginPaint() {
    const parts: Part[] = [];
    for (const trail of this.trails) {
      for (let i = 1; i < trail.points.length; i++) parts.push({ z: trail.points[i].z, insect: null, trail, i });
    }
    // Over its own trail.
    for (const b of this.list) parts.push({ z: b.z + ON_TOP / 2, insect: b, trail: null, i: 0 });
    parts.sort((a, b) => a.z - b.z);
    this.parts = parts;
    this.next = 0;
  }

  /** Depth of the next thing to paint, or Infinity once everything is painted. */
  get nextDepth() {
    return this.next < this.parts.length ? this.parts[this.next].z : Infinity;
  }

  /** Paints the next thing from beginPaint. */
  paintNext(ctx: CanvasRenderingContext2D) {
    const { settings, time } = this.garden;
    const shade = settings.shade.depth;
    const { insect, trail, i } = this.parts[this.next++];
    if (trail) paintSegment(ctx, trail, i, time, settings.insects.trail, shade);
    else if (insect) {
      // Nearer ones a little bigger and darker, as the flowers are.
      const z = clamp(insect.z, 0, 1);
      ctx.save();
      ctx.translate(insect.x, insect.y + insect.bob);
      inAccent(() => inShade(shade * (z - 1), () => GROUPS[insect.kind].paint(ctx, insect, insect.size * lerp(0.85, 1.1, z))));
      ctx.restore();
    }
  }

  private fly(b: Insect, dt: number) {
    const settings = this.garden.settings.insects;
    const group = GROUPS[b.kind];
    const style = group.flight;
    const speed = style.cruise * b.size * b.quirks.pace * settings.speed;
    const z = b.z;
    b.age += dt;
    let face: [number, number] | undefined;
    switch (b.phase) {
      case "flying": {
        const p = perch(b.stem!);
        const goal: Goal = b.hovers ? this.hoverSpot(b, p) : [p.x, p.y, b.plant!.depth + ON_TOP];
        const to = this.route(b, goal);
        if (steer(b, style, to[0], to[1], to[2], speed, dt) < b.size * 0.4 && to === goal) {
          if (b.hovers) {
            b.phase = "hovering";
            b.timer = lerp(style.hover[0], style.hover[1], Math.random());
          } else if (this.hiddenNow(b)) this.takeOff(b);
          else this.land(b);
        }
        break;
      }
      case "hovering": {
        // Drifts about by the flower, facing it, while it looks it over.
        const p = perch(b.stem!);
        const [hx, hy, hz] = this.hoverSpot(b, p);
        const [p1, p2, p3] = b.wobble;
        const t = b.age;
        const drift = style.drift * b.size;
        const [gx, gy, gz] = this.route(b, [hx + drift * Math.sin(t * 2.3 + p1), hy + drift * 0.6 * Math.sin(t * 3.1 + p2), hz + 0.03 * Math.sin(t * 1.7 + p3)]);
        steer(b, style, gx, gy, gz, speed * 0.5, dt);
        face = this.toward(b, p);
        b.timer -= dt;
        if (b.timer <= 0) {
          // The plants have swayed since it picked the flower, and may hide it now.
          if (Math.random() < style.skip || this.hiddenNow(b)) this.takeOff(b);
          else b.phase = "alighting";
        }
        break;
      }
      case "alighting": {
        const p = perch(b.stem!);
        face = this.toward(b, p);
        const goal: Goal = [p.x, p.y, b.plant!.depth + ON_TOP];
        const to = this.route(b, goal);
        if (steer(b, style, to[0], to[1], to[2], speed * 0.5, dt, 0.8) < b.size * 0.25 && to === goal) this.land(b);
        break;
      }
      case "landed": {
        // Settles in over a moment, then holds on as the flower sways.
        const p = perch(b.stem!);
        b.x = ease(b.x, p.x, 0.15, dt);
        b.y = ease(b.y, p.y, 0.15, dt);
        b.lean = p.angle;
        b.z = ease(b.z, b.plant!.depth + ON_TOP, 0.1, dt);
        b.timer -= dt;
        if (b.timer <= 0) this.takeOff(b);
        break;
      }
      case "leaving": {
        const [gx, gy, gz] = this.route(b, [b.exitX, b.exitY, b.zGoal]);
        steer(b, style, gx, gy, gz, speed, dt);
        break;
      }
    }
    this.holdSide(b, z);
    if (b.last && clearOf(b.last.stem, b.x, b.y) > b.size * 2) b.last = null;
    orient(b, style, dt, face);
    group.animate(b, dt, settings.speed);
    if (b.phase !== "landed" && settings.trail.fade > 0) extend(b.trail, b.x, b.y + b.bob, b.z, this.garden.time);
  }

  /** The flowers it mustn't pass through: the one it just left, and the one it's after. */
  private flowers(b: Insect) {
    const list: Flower[] = b.last ? [b.last] : [];
    if (b.stem) list.push({ plant: b.plant!, stem: b.stem });
    return list;
  }

  /** The way to `goal` that doesn't pass through the flower it's after or the one it just left: `goal` itself if nothing's in the way. */
  private route(b: Insect, goal: Goal) {
    let to = goal;
    for (const f of this.flowers(b)) to = this.around(b, f, to);
    return to;
  }

  /**
   * The way to `goal` past the head of `f`, if getting there means crossing
   * over to its other side in depth. Over the head, it holds its depth and
   * makes for the goal, or for the head's edge on its own side if the goal is
   * over the head too. Clear of the head, it comes round onto the goal's side
   * by the edge before going in.
   */
  private around(b: Insect, f: Flower, goal: Goal): Goal {
    const [gx, gy, gz] = goal;
    const front = inFront(gz, f.plant);
    if (inFront(b.z, f.plant) === front) return goal;
    const reach = b.size * REACH;
    const over = clearOf(f.stem, b.x, b.y) < reach;
    if (clearOf(f.stem, gx, gy) >= reach) return over ? [gx, gy, b.z] : goal;
    // Out from the middle of the head the way it's off it, leaning toward the goal: just taken off, it's right on the middle.
    const p = perch(f.stem);
    const [ex, ey] = beside(f.stem, b.x - p.x + 0.5 * (gx - p.x), b.y - p.y + 0.5 * (gy - p.y), reach + b.size * 0.6, b.side);
    const d = f.plant.depth;
    return [ex, ey, over ? b.z : front ? d + AHEAD : d - AHEAD];
  }

  /** Keeps it on the side it was on, at depth `z`, of the flower it's after and the one it just left, while it's over their heads. */
  private holdSide(b: Insect, z: number) {
    for (const f of this.flowers(b)) {
      const front = inFront(z, f.plant);
      if (inFront(b.z, f.plant) === front || clearOf(f.stem, b.x, b.y) >= b.size * REACH) continue;
      b.z = f.plant.depth + (front ? ON_TOP : -ON_TOP);
      b.vz = 0;
    }
  }

  /** Whether plants nearer than `plant` hide too much of where `b` would sit on `stem`, going by the cover map as last painted. */
  private hides(b: Insect, plant: Plant, stem: Stem) {
    const p = perch(stem);
    // About where its body is once it's standing on the flower.
    return this.cover.hidden(p.x, p.y - b.size * 0.25, b.size * REACH, plant.depth) > HIDDEN;
  }

  /** Whether the flower it's after is hidden now. */
  private hiddenNow(b: Insect) {
    this.cover.paint(this.garden);
    return this.hides(b, b.plant!, b.stem!);
  }

  private land(b: Insect) {
    const [lo, hi] = this.garden.settings.insects.stay;
    b.phase = "landed";
    b.timer = lerp(lo, hi, Math.random());
    b.vx = b.vy = b.vz = 0;
    b.ax = b.ay = b.az = 0;
    b.last = null;
    // Settles side on, give or take, whichever way it was facing.
    const side = Math.cos(b.yaw) < 0 ? Math.PI : 0;
    b.rest = side + clamp(wrap(b.yaw - side), -0.5, 0.5);
  }

  /** Off its flower and on to the next, or away. */
  private takeOff(b: Insect) {
    const lift = GROUPS[b.kind].flight.cruise * b.size * 0.4;
    b.last = { plant: b.plant!, stem: b.stem! };
    this.moveOn(b);
    b.vy = -lift;
  }

  /** Heads for another flower if it has visits left and there's one to go to, or else off screen; across to the far side if it only just came in by `from`. */
  private moveOn(b: Insect, from?: Edge) {
    const target = b.visits > 0 ? this.pickFlower(b) : null;
    if (!target) return this.leave(b, from && (from === "left" ? "right" : from === "right" ? "left" : b.x < this.garden.width / 2 ? "right" : "left"));
    b.visits--;
    b.phase = "flying";
    b.hovers = Math.random() < GROUPS[b.kind].flight.hovers;
    b.plant = target.plant;
    b.stem = target.stem;
    const p = perch(target.stem);
    b.side = b.x < p.x ? -1 : 1;
  }

  private leave(b: Insect, edge = this.pickEdge()) {
    if (b.stem) b.last = { plant: b.plant!, stem: b.stem };
    [b.exitX, b.exitY] = this.offEdge(edge, b.size * 6);
    b.phase = "leaving";
    b.plant = null;
    b.stem = null;
    b.zGoal = Math.random();
  }

  /** Where a hovering insect waits: a little above its flower, on the side it came from, and a little in front. */
  private hoverSpot(b: Insect, p: { x: number; y: number }) {
    return [p.x + b.side * b.size * 0.9, p.y - b.size * 0.6, b.plant!.depth + 0.04] as const;
  }

  /** Which way to face to look at its flower at `p`, px across and toward the viewer; none once it's almost there. */
  private toward(b: Insect, p: { x: number; y: number }): [number, number] | undefined {
    const dx = p.x - b.x;
    const dz = (b.plant!.depth - b.z) * b.size * DEPTH;
    return Math.hypot(dx, dz) > b.size * 0.3 ? [dx, dz] : undefined;
  }

  /** Whether it has left the screen for good. */
  private gone(b: Insect) {
    const m = b.size * 1.6;
    const { width, height } = this.garden;
    return b.phase === "leaving" && (b.x < -m || b.x > width + m || b.y < -m || b.y > height + m);
  }

  /**
   * A flower for `b` to visit, by its kind's taste: one on screen that nearer
   * plants don't hide, not the one it's on, rarely one another insect is
   * after, and more likely one nearby or toward the front.
   */
  private pickFlower(b: Insect): Flower | null {
    const { width: W, height: H } = this.garden;
    const likes = GROUPS[b.kind].flight.likes;
    const m = b.size;
    const options: { plant: Plant; stem: Stem; weight: number }[] = [];
    let total = 0;
    this.cover.paint(this.garden);
    for (const plant of this.garden.plants) {
      for (const stem of plant.stems) {
        const like = stem.head ? likes[stem.head.kind] ?? 0 : 0;
        if (like <= 0 || stem === b.stem) continue;
        const p = perch(stem);
        if (p.x < m || p.x > W - m || p.y < m || p.y > H - m * 0.3 || this.hides(b, plant, stem)) continue;
        let weight = like * (0.3 + plant.depth);
        if (this.list.some((o) => o !== b && o.stem === stem)) weight *= 0.05;
        weight *= Math.exp(-Math.hypot(p.x - b.x, p.y - b.y) / (Math.max(W, H) * 0.35));
        options.push({ plant, stem, weight });
        total += weight;
      }
    }
    let r = Math.random() * total;
    for (const o of options) {
      r -= o.weight;
      if (r <= 0) return o;
    }
    return options[options.length - 1] ?? null;
  }

  private pickEdge(): Edge {
    const r = Math.random();
    return r < 0.4 ? "left" : r < 0.75 ? "right" : "top";
  }

  /** A point `out` px beyond one edge of the screen, in the upper part of the sides. */
  private offEdge(edge: Edge, out: number): [number, number] {
    const { width: W, height: H } = this.garden;
    if (edge === "top") return [W * lerp(0.15, 1, Math.random()), -out];
    return [edge === "left" ? -out : W + out, H * lerp(0.08, 0.6, Math.random())];
  }

  /** Seconds until the next one is due: on average the settings' `every`, never all at once nor an age apart. */
  private gap() {
    return this.garden.settings.insects.every * clamp(-Math.log(1 - Math.random()), 0.3, 2.5);
  }
}

/** Whether an insect at depth `z` is painted in front of `plant`. */
function inFront(z: number, plant: Plant) {
  return z + ON_TOP / 2 >= plant.depth;
}

/** An index into `odds`, picked by them. */
function pick(odds: readonly number[]) {
  let r = Math.random() * odds.reduce((a, b) => a + b, 0);
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i];
    if (r <= 0) return i;
  }
  return odds.length - 1;
}
