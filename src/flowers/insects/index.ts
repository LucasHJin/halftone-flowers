/**
 * Butterflies and bees that fly in from an edge, visit a few flowers and leave.
 * `z` is depth among the plants, so each paints between them in depth order.
 * It crosses a flower's depth only once clear of its head, and settles only
 * where nearer plants don't hide it.
 */
import { clamp, lerp, TAU } from "../../utils/math.js";
import type { Field } from "../field.js";
import { inAccent, inShade } from "../paint/tone.js";
import type { Plant, Stem } from "../types.js";
import { BEE } from "./bee.js";
import { BUTTERFLY } from "./butterfly.js";
import { Cover } from "./cover.js";
import { follow, paintHeart, sendHeart, type Heart } from "./heart.js";
import { beside, clearOf, DEPTH, ease, orient, perch, randomQuirks, REACH, steer, wrap, type Flower, type Insect, type InsectGroup, type InsectKind } from "./insect.js";
import { expire, extend, paintSegment, type Trail } from "./trail.js";

export type { Insect, InsectKind } from "./insect.js";

const GROUPS: Record<InsectKind, InsectGroup> = { butterfly: BUTTERFLY, bee: BEE };

/** Depth a perched insect sits in front of its flower, so it paints just over it. */
const ON_TOP = 1e-4;

/** Depth in front of or behind a flower an insect moves to, beside its head, before crossing over it. */
const AHEAD = 0.12;

/** Max share of its perch that nearer plants may hide for an insect to settle there. */
const HIDDEN = 0.12;

/** Max hearts showing at once; further clicks send none. */
const HEARTS = 12;

/** Px across, px down, and depth. */
type Goal = readonly [number, number, number];

type Edge = "left" | "right" | "top";

/** An insect, a trail segment ending at point `i`, or a heart. */
interface Part {
  z: number;
  insect: Insect | null;
  trail: Trail | null;
  i: number;
  heart: Heart | null;
}

export class Insects {
  list: Insect[] = [];
  private trails: Trail[] = [];
  private hearts: Heart[] = [];
  /** Seconds until the next one is due. */
  private wait = 0;
  private parts: Part[] = [];
  private next = 0;
  private cover = new Cover();
  private nextId = 0;

  constructor(private field: Field) {
    this.reset();
  }

  reset() {
    this.list = [];
    this.trails = [];
    this.hearts = [];
    this.wait = this.gap() * 0.4;
  }

  /** Sends one in now, ignoring `wait` and `settings.most`; without `kind`, picks one by `settings.odds`. */
  release(kind?: InsectKind) {
    const settings = this.field.settings.insects;
    const [butterflies, bees] = settings.odds;
    if (!kind) {
      if (butterflies + bees <= 0) return;
      kind = Math.random() * (butterflies + bees) < butterflies ? "butterfly" : "bee";
    }
    const group = GROUPS[kind];
    const species = pick(group.species.map((sp) => sp.odds));
    const sp = group.species[species];
    const size = this.field.bloom * group.size * sp.size * settings.size * lerp(0.9, 1.3, Math.random());
    const quirks = randomQuirks();
    quirks.pace *= sp.pace;
    const from = this.pickEdge();
    let [x, y] = this.offEdge(from, size * 1.5);
    const b: Insect = {
      id: this.nextId++,
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
      // Start on the roomier side of its flower, far enough out to descend no steeper than `flight.dive`.
      const W = this.field.width;
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

  /** The nearest insect showing at (x, y), per `cover` as last painted, or null. */
  at(x: number, y: number, cover: Cover) {
    let hit: Insect | null = null;
    for (const b of this.list) {
      // Wider than its body: it's small and moving.
      if (Math.hypot(x - b.x, y - b.y - b.bob) > Math.max(b.size * 0.7, this.field.cell * 3)) continue;
      if (cover.hidden(x, y, 2, b.z) > 0.5 || (hit && hit.z > b.z)) continue;
      hit = b;
    }
    return hit;
  }

  /** Sends a heart up out of `b`. False if `HEARTS` are already up. */
  love(b: Insect) {
    const { bloom, settings, time } = this.field;
    if (this.hearts.length >= HEARTS) return false;
    this.hearts.push(sendHeart(b, bloom, settings.insects.heart, time));
    return true;
  }

  step(dt: number) {
    const field = this.field;
    const settings = field.settings.insects;
    if (field.growing === null && settings.enabled) {
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
    for (const t of this.trails) expire(t, field.time, settings.trail.fade);
    this.trails = this.trails.filter((t) => t.owner || t.points.length > 1);
    this.hearts = this.hearts.filter((h) => follow(h, field.time, this.list));
  }

  /** Gathers everything to paint in depth order, ready for paintNext. */
  beginPaint() {
    const parts: Part[] = [];
    for (const trail of this.trails) {
      for (let i = 1; i < trail.points.length; i++) parts.push({ z: trail.points[i].z, insect: null, trail, i, heart: null });
    }
    // Over its own trail.
    for (const b of this.list) parts.push({ z: b.z + ON_TOP / 2, insect: b, trail: null, i: 0, heart: null });
    for (const heart of this.hearts) parts.push({ z: heart.z + ON_TOP / 2, insect: null, trail: null, i: 0, heart });
    parts.sort((a, b) => a.z - b.z);
    this.parts = parts;
    this.next = 0;
  }

  /** Depth of the next part to paint; Infinity when done. */
  get nextDepth() {
    return this.next < this.parts.length ? this.parts[this.next].z : Infinity;
  }

  paintNext(ctx: CanvasRenderingContext2D) {
    const { settings, time } = this.field;
    const shade = settings.shade.depth;
    const { insect, trail, i, heart } = this.parts[this.next++];
    if (trail) paintSegment(ctx, trail, i, time, settings.insects.trail, shade);
    else if (heart) paintHeart(ctx, heart, time, settings.insects.trail, shade * (heart.z - 1));
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
    const settings = this.field.settings.insects;
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
          // Plants may have swayed over the flower since it was picked.
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
    if (b.phase !== "landed" && settings.trail.fade > 0) extend(b.trail, b.x, b.y + b.bob, b.z, this.field.time);
  }

  /** Flowers it mustn't pass through: `b.last` and the one it's after. */
  private flowers(b: Insect) {
    const list: Flower[] = b.last ? [b.last] : [];
    if (b.stem) list.push({ plant: b.plant!, stem: b.stem });
    return list;
  }

  /** Next waypoint to `goal` that avoids passing through `flowers(b)`. Returns `goal` itself if clear; callers test `to === goal`. */
  private route(b: Insect, goal: Goal) {
    let to = goal;
    for (const f of this.flowers(b)) to = this.around(b, f, to);
    return to;
  }

  /**
   * Waypoint to `goal` when that crosses `f`'s depth. While over `f`'s head it
   * keeps its depth. If `goal` is over the head too, it goes via the head's
   * edge, switching to the goal's side of `f` there.
   */
  private around(b: Insect, f: Flower, goal: Goal): Goal {
    const [gx, gy, gz] = goal;
    const front = inFront(gz, f.plant);
    if (inFront(b.z, f.plant) === front) return goal;
    const reach = b.size * REACH;
    const over = clearOf(f.stem, b.x, b.y) < reach;
    if (clearOf(f.stem, gx, gy) >= reach) return over ? [gx, gy, b.z] : goal;
    // Out from the head's middle toward `b`, biased toward the goal, since just after takeoff `b` is on the middle.
    const p = perch(f.stem);
    const [ex, ey] = beside(f.stem, b.x - p.x + 0.5 * (gx - p.x), b.y - p.y + 0.5 * (gy - p.y), reach + b.size * 0.6, b.side);
    const d = f.plant.depth;
    return [ex, ey, over ? b.z : front ? d + AHEAD : d - AHEAD];
  }

  /** While `b` is over a head in `flowers(b)`, keeps it on the side it was on at depth `z`, from before this step. */
  private holdSide(b: Insect, z: number) {
    for (const f of this.flowers(b)) {
      const front = inFront(z, f.plant);
      if (inFront(b.z, f.plant) === front || clearOf(f.stem, b.x, b.y) >= b.size * REACH) continue;
      b.z = f.plant.depth + (front ? ON_TOP : -ON_TOP);
      b.vz = 0;
    }
  }

  /** Whether plants nearer than `plant` hide more than `HIDDEN` of `b`'s perch on `stem`, per `cover` as last painted. */
  private hides(b: Insect, plant: Plant, stem: Stem) {
    const p = perch(stem);
    // About where its body is when perched.
    return this.cover.hidden(p.x, p.y - b.size * 0.25, b.size * REACH, plant.depth) > HIDDEN;
  }

  /** Whether the flower it's after is hidden, repainting `cover` first. */
  private hiddenNow(b: Insect) {
    this.cover.paint(this.field);
    return this.hides(b, b.plant!, b.stem!);
  }

  private land(b: Insect) {
    const [lo, hi] = this.field.settings.insects.stay;
    b.phase = "landed";
    b.timer = lerp(lo, hi, Math.random());
    b.vx = b.vy = b.vz = 0;
    b.ax = b.ay = b.az = 0;
    b.last = null;
    // Rests within 0.5 rad of side-on, toward whichever side it faced.
    const side = Math.cos(b.yaw) < 0 ? Math.PI : 0;
    b.rest = side + clamp(wrap(b.yaw - side), -0.5, 0.5);
  }

  private takeOff(b: Insect) {
    const lift = GROUPS[b.kind].flight.cruise * b.size * 0.4;
    b.last = { plant: b.plant!, stem: b.stem! };
    this.moveOn(b);
    b.vy = -lift;
  }

  /** Heads for its next flower, or leaves if out of visits or flowers: by the far side if it just came in by `from`. */
  private moveOn(b: Insect, from?: Edge) {
    const target = b.visits > 0 ? this.pickFlower(b) : null;
    if (!target) return this.leave(b, from && (from === "left" ? "right" : from === "right" ? "left" : b.x < this.field.width / 2 ? "right" : "left"));
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

  /** Where it hovers: above its flower at `p`, on `b.side`, a little in front. */
  private hoverSpot(b: Insect, p: { x: number; y: number }) {
    return [p.x + b.side * b.size * 0.9, p.y - b.size * 0.6, b.plant!.depth + 0.04] as const;
  }

  /** Direction to its flower at `p`, px across and toward the viewer; undefined when almost there. */
  private toward(b: Insect, p: { x: number; y: number }): [number, number] | undefined {
    const dx = p.x - b.x;
    const dz = (b.plant!.depth - b.z) * b.size * DEPTH;
    return Math.hypot(dx, dz) > b.size * 0.3 ? [dx, dz] : undefined;
  }

  private gone(b: Insect) {
    const m = b.size * 1.6;
    const { width, height } = this.field;
    return b.phase === "leaving" && (b.x < -m || b.x > width + m || b.y < -m || b.y > height + m);
  }

  /**
   * A random on-screen, unhidden flower other than its own, weighted by its kind's
   * `likes`, closeness and nearness to the front; 20x rarer if another insect is after it.
   */
  private pickFlower(b: Insect): Flower | null {
    const { width: W, height: H } = this.field;
    const likes = GROUPS[b.kind].flight.likes;
    const m = b.size;
    const options: { plant: Plant; stem: Stem; weight: number }[] = [];
    let total = 0;
    this.cover.paint(this.field);
    for (const plant of this.field.plants) {
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

  /** A random point `out` px past `edge`; on a side, 8% to 60% of the way down. */
  private offEdge(edge: Edge, out: number): [number, number] {
    const { width: W, height: H } = this.field;
    if (edge === "top") return [W * lerp(0.15, 1, Math.random()), -out];
    return [edge === "left" ? -out : W + out, H * lerp(0.08, 0.6, Math.random())];
  }

  /** Seconds to the next arrival: exponential with mean `every`, clamped to 0.3 to 2.5 times it. */
  private gap() {
    return this.field.settings.insects.every * clamp(-Math.log(1 - Math.random()), 0.3, 2.5);
  }
}

/** Whether an insect at depth `z` is painted in front of `plant`. */
function inFront(z: number, plant: Plant) {
  return z + ON_TOP / 2 >= plant.depth;
}

/** A random index into `odds`, weighted by them. */
function pick(odds: readonly number[]) {
  let r = Math.random() * odds.reduce((a, b) => a + b, 0);
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i];
    if (r <= 0) return i;
  }
  return odds.length - 1;
}
