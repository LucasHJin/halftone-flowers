/**
 * The pointer's trail: a few strands, stroked like the insects' trails, along
 * one path that eases after the pointer. Close together right behind it, they spread
 * apart and weave round each other as they age, each fading in and out along
 * its length, and thin out from the old end once `hold` is up. With a `mark`,
 * it also prints the pointer. Trail and mark sit at a depth among the plants
 * that roams as the pointer travels, crossing a flower's depth only clear of its head.
 */
import { clamp, lerp, TAU } from "../utils/math.js";
import type { Field } from "./field.js";
import { clearOf, smoothstep } from "./insects/insect.js";
import { strokeSegment } from "./insects/trail.js";
import { inAccent, inShade, tone } from "./paint/tone.js";
import type { Mark } from "./pointerMark.js";

/** Px the head moves between path points. */
const SPACING = 2.5;

/** Strands' spread right behind the pointer, as a share of their full spread. */
const TIGHT = 0.12;

/** Seconds the strands take to spread about two thirds of the way apart. */
const OPEN = 0.15;

/** Wavelength, px along the trail, of each strand fading out and back in. */
const WISP = 520;

/** Least and most a strand strays, as multipliers on `trail.spread`. */
const STRAND_REACH: [number, number] = [0.6, 1.4];

/** Px of pointer travel over which the depth eases about two thirds of the way to its goal. */
const GLIDE = 160;

/** Least and most px of pointer travel before the depth picks a new goal. */
const ROAM: [number, number] = [250, 700];

/** Depth the mark sits in front of its own trail. */
const ON_TOP = 1e-4;

interface PathPoint {
  x: number;
  y: number;
  /** Unit normal to the path there. */
  nx: number;
  ny: number;
  /** Px along the trail from its start. */
  s: number;
  /** Field time it was laid down. */
  t: number;
  /** Depth among the plants. */
  z: number;
}

interface Strand {
  /** Wave phase, radians. */
  phase: number;
  /** Wavelength, px along the path. */
  wave: number;
  /** Multiplier on `trail.spread`. */
  reach: number;
  /** Radians a second its waves run along it. */
  flow: number;
  /** Phases, radians, of its slow fade in and out (`WISP`) and a quicker flicker. */
  fade: [number, number];
}

interface PointerTrail {
  points: PathPoint[];
  strands: Strand[];
}

/** A strand's segment from (ax, ay) to (bx, by) printing at `strength` from 0 to 1, or the mark if `mark`. */
interface Part {
  z: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  strength: number;
  mark: boolean;
}

export class PointerInk {
  /** Printed at the pointer while `hovering`; null prints nothing. */
  mark: Mark | null = null;
  /** Whether a mouse or pen is over the field itself, not something laid over it. */
  hovering = false;
  private trails: PointerTrail[] = [];
  /** The trail being laid, the eased point laying it (`head`), and the pointer (`target`). */
  private current: PointerTrail | null = null;
  private head = { x: 0, y: 0, vx: 0, vy: 0, nx: 0, ny: -1 };
  private target = { x: 0, y: 0 };
  /** The pointer at the last step, to measure its travel. */
  private last = { x: 0, y: 0 };
  private z = Math.random();
  private goal = Math.random();
  /** Px of travel left before `goal` is picked again. */
  private roam = lerp(...ROAM, Math.random());
  private parts: Part[] = [];
  private next = 0;

  constructor(private field: Field) {}

  /** Points the trail at (x, y), starting a new one there if `fresh` (the pointer may have come back anywhere) or none is being laid. */
  move(x: number, y: number, fresh: boolean) {
    this.target.x = x;
    this.target.y = y;
    // A jump isn't travel.
    if (fresh) Object.assign(this.last, this.target);
    if (!this.field.settings.trail.enabled || (!fresh && this.current)) return;
    Object.assign(this.head, { x, y, vx: 0, vy: 0 });
    this.current = { points: [], strands: this.newStrands() };
    this.trails.push(this.current);
  }

  /**
   * Advances the head `dt` s, laying a point every `SPACING` px. It chases the
   * pointer as a critically damped spring, so it never overshoots and sharp turns come out rounded.
   */
  step(dt: number) {
    const trail = this.field.settings.trail;
    const now = this.field.time;
    for (const t of this.trails) {
      let n = 0;
      while (n < t.points.length && now - t.points[n].t >= trail.hold + trail.fade) n++;
      if (n) t.points.splice(0, n);
    }
    this.trails = this.trails.filter((t) => t === this.current || t.points.length > 1);
    this.roamDepth();
    const path = this.current;
    if (!path || !trail.enabled) return;
    const h = this.head;
    const w = 2 / Math.max(trail.lag, 0.005);
    const steps = clamp(Math.ceil((Math.hypot(h.vx, h.vy) * dt) / SPACING), 1, 24);
    const d = dt / steps;
    const decay = Math.exp(-w * d);
    for (let k = 1; k <= steps; k++) {
      // Exact solution over each sub-step, so it stays stable however short `lag` is.
      for (const [p, v, to] of [["x", "vx", this.target.x], ["y", "vy", this.target.y]] as const) {
        const e = h[p] - to;
        const c = h[v] + w * e;
        h[p] = to + (e + c * d) * decay;
        h[v] = (h[v] - w * c * d) * decay;
      }
      const last = path.points[path.points.length - 1];
      if (last && Math.hypot(h.x - last.x, h.y - last.y) < SPACING) continue;
      const speed = Math.hypot(h.vx, h.vy);
      if (speed > 1) {
        h.nx = -h.vy / speed;
        h.ny = h.vx / speed;
      }
      const s = last ? last.s + Math.hypot(h.x - last.x, h.y - last.y) : 0;
      path.points.push({ x: h.x, y: h.y, nx: h.nx, ny: h.ny, s, t: now - dt + d * k, z: this.z });
    }
  }

  /** The head and its speed, px/s, or null while no trail is being laid. */
  get motion() {
    if (!this.current || !this.field.settings.trail.enabled) return null;
    const { x, y, vx, vy } = this.head;
    return { x, y, speed: Math.hypot(vx, vy) };
  }

  /** `beginPaint`, `nextDepth` and `paintNext` are the `Movers` protocol in paint/index.ts. */
  beginPaint() {
    const parts: Part[] = [];
    const trail = this.field.settings.trail;
    const now = this.field.time;
    for (const { points, strands } of trail.enabled ? this.trails : []) {
      for (const strand of strands) {
        let ax = 0;
        let ay = 0;
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const age = now - p.t;
          const open = 1 - (1 - TIGHT) * Math.exp(-age / OPEN);
          const off = trail.spread * strand.reach * open * Math.sin((TAU * p.s) / strand.wave + strand.phase + strand.flow * age);
          const bx = p.x + p.nx * off;
          const by = p.y + p.ny * off;
          const fresh = Math.min(1, 1 - (age - trail.hold) / trail.fade);
          // Fades out and back in along its length, out of step with the other strands.
          const shows = smoothstep(0.2, 0.65, 0.5 + 0.32 * Math.sin((TAU * p.s) / WISP + strand.fade[0]) + 0.18 * Math.sin((TAU * p.s) / (WISP * 0.37) + strand.fade[1]));
          if (i && fresh * shows > 0) parts.push({ z: p.z, ax, ay, bx, by, strength: fresh * shows, mark: false });
          ax = bx;
          ay = by;
        }
      }
    }
    if (this.mark && this.hovering) parts.push({ z: this.z + ON_TOP, ax: 0, ay: 0, bx: 0, by: 0, strength: 1, mark: true });
    parts.sort((a, b) => a.z - b.z);
    this.parts = parts;
    this.next = 0;
  }

  get nextDepth() {
    return this.next < this.parts.length ? this.parts[this.next].z : Infinity;
  }

  paintNext(ctx: CanvasRenderingContext2D) {
    const { settings, cell } = this.field;
    const p = this.parts[this.next++];
    // Lighter the further back, like insects.
    const shade = settings.shade.depth * (p.z - 1);
    if (!p.mark) return strokeSegment(ctx, p.ax, p.ay, p.bx, p.by, p.strength, settings.trail, shade);
    let colour = "";
    inAccent(() => inShade(shade, () => (colour = tone(0, 1))));
    this.mark!.paint(ctx, this.target.x, this.target.y, lerp(0.85, 1.1, clamp(p.z, 0, 1)), colour, cell);
  }

  reset() {
    this.trails = [];
    this.current = null;
    this.hovering = false;
  }

  /** Eases the depth toward `goal` by how far the pointer moved since the last step, unless that would cross a flower near its path. */
  private roamDepth() {
    const { last, target } = this;
    const moved = Math.hypot(target.x - last.x, target.y - last.y);
    if (!moved) return;
    this.roam -= moved;
    if (this.roam <= 0) {
      this.goal = Math.random();
      this.roam = lerp(...ROAM, Math.random());
    }
    const z = this.goal + (this.z - this.goal) * Math.exp(-moved / GLIDE);
    if (!this.crosses(this.z, z)) this.z = z;
    Object.assign(last, target);
  }

  /**
   * Whether going from depth `from` to `to` passes the depth of a flower whose
   * head the strands or mark reach, anywhere on the pointer's way since the last
   * step or at the head. There the switch would show as a cut through it.
   */
  private crosses(from: number, to: number) {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const { spread, width } = this.field.settings.trail;
    const reach = Math.max(spread * STRAND_REACH[1] + width, this.mark?.reach(this.field.cell) ?? 0);
    const { last, target, head } = this;
    const samples = Math.min(32, Math.ceil(Math.hypot(target.x - last.x, target.y - last.y) / reach) + 1);
    for (const plant of this.field.plants) {
      // Painted behind a plant at depth d exactly when z < d.
      if (plant.depth <= lo || plant.depth > hi) continue;
      for (const s of plant.stems) {
        if (!s.head) continue;
        if (this.current && clearOf(s, head.x, head.y) < reach) return true;
        for (let k = 0; k <= samples; k++) {
          if (clearOf(s, lerp(last.x, target.x, k / samples), lerp(last.y, target.y, k / samples)) < reach) return true;
        }
      }
    }
    return false;
  }

  /** Phases spread evenly round the circle, jittered, so strands weave and fade out of step. */
  private newStrands(): Strand[] {
    const { strands, wave, flow } = this.field.settings.trail;
    const n = Math.max(1, Math.round(strands));
    const start = Math.random() * TAU;
    return Array.from({ length: n }, (_, k) => ({
      phase: start + (TAU * (k + lerp(-0.15, 0.15, Math.random()))) / n,
      wave: wave * lerp(0.85, 1.2, Math.random()),
      reach: lerp(...STRAND_REACH, Math.random()),
      flow: flow * lerp(0.6, 1.2, Math.random()) * (Math.random() < 0.5 ? -1 : 1),
      fade: [start + (TAU * k) / n, Math.random() * TAU],
    }));
  }
}
