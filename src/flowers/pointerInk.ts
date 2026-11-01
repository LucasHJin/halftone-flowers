/**
 * The pointer's trail: a few strands, stroked like the insects' trails, along
 * one path that eases after the pointer. Close together right behind it, they spread
 * apart and weave round each other as they age, each fading in and out along
 * its length, and thin out from the old end once `hold` is up.
 */
import { clamp, lerp, TAU } from "../utils/math.js";
import { smoothstep } from "./insects/insect.js";
import { strokeSegment } from "./insects/trail.js";
import type { FlowerSettings } from "./settings.js";

/** Px the head moves between path points. */
const SPACING = 2.5;

/** Strands' spread right behind the pointer, as a share of their full spread. */
const TIGHT = 0.12;

/** Seconds the strands take to spread about two thirds of the way apart. */
const OPEN = 0.15;

/** Wavelength, px along the trail, of each strand fading out and back in. */
const WISP = 520;

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

export class PointerInk {
  private trails: PointerTrail[] = [];
  /** The trail being laid, the eased point laying it (`head`), and the pointer (`target`). */
  private current: PointerTrail | null = null;
  private head = { x: 0, y: 0, vx: 0, vy: 0, nx: 0, ny: -1 };
  private target = { x: 0, y: 0 };

  constructor(public settings: FlowerSettings) {}

  /** Points the trail at (x, y), starting a new one there if `fresh` (the pointer may have come back anywhere) or none is being laid. */
  move(x: number, y: number, fresh: boolean) {
    this.target.x = x;
    this.target.y = y;
    if (!this.settings.trail.enabled || (!fresh && this.current)) return;
    Object.assign(this.head, { x, y, vx: 0, vy: 0 });
    this.current = { points: [], strands: this.newStrands() };
    this.trails.push(this.current);
  }

  /**
   * Advances the head `dt` s to field time `now`, laying a point every
   * `SPACING` px. It chases the pointer as a critically damped spring, so it
   * never overshoots and sharp turns come out rounded.
   */
  step(dt: number, now: number) {
    const trail = this.settings.trail;
    for (const t of this.trails) {
      let n = 0;
      while (n < t.points.length && now - t.points[n].t >= trail.hold + trail.fade) n++;
      if (n) t.points.splice(0, n);
    }
    this.trails = this.trails.filter((t) => t === this.current || t.points.length > 1);
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
      path.points.push({ x: h.x, y: h.y, nx: h.nx, ny: h.ny, s, t: now - dt + d * k });
    }
  }

  /** The head and its speed, px/s, or null while no trail is being laid. */
  get motion() {
    if (!this.current || !this.settings.trail.enabled) return null;
    const { x, y, vx, vy } = this.head;
    return { x, y, speed: Math.hypot(vx, vy) };
  }

  paintTrail(ctx: CanvasRenderingContext2D, now: number) {
    const trail = this.settings.trail;
    if (!trail.enabled) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const { points, strands } of this.trails) {
      for (const strand of strands) {
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const age = now - p.t;
          const open = 1 - (1 - TIGHT) * Math.exp(-age / OPEN);
          const off = trail.spread * strand.reach * open * Math.sin((TAU * p.s) / strand.wave + strand.phase + strand.flow * age);
          xs[i] = p.x + p.nx * off;
          ys[i] = p.y + p.ny * off;
        }
        for (let i = 1; i < points.length; i++) {
          const p = points[i];
          const fresh = Math.min(1, 1 - (now - p.t - trail.hold) / trail.fade);
          // Fades out and back in along its length, out of step with the other strands.
          const shows = smoothstep(0.2, 0.65, 0.5 + 0.32 * Math.sin((TAU * p.s) / WISP + strand.fade[0]) + 0.18 * Math.sin((TAU * p.s) / (WISP * 0.37) + strand.fade[1]));
          strokeSegment(ctx, xs[i - 1], ys[i - 1], xs[i], ys[i], fresh * shows, trail);
        }
      }
    }
  }

  /** Phases spread evenly round the circle, jittered, so strands weave and fade out of step. */
  private newStrands(): Strand[] {
    const { strands, wave, flow } = this.settings.trail;
    const n = Math.max(1, Math.round(strands));
    const start = Math.random() * TAU;
    return Array.from({ length: n }, (_, k) => ({
      phase: start + (TAU * (k + lerp(-0.15, 0.15, Math.random()))) / n,
      wave: wave * lerp(0.85, 1.2, Math.random()),
      reach: lerp(0.6, 1.4, Math.random()),
      flow: flow * lerp(0.6, 1.2, Math.random()) * (Math.random() < 0.5 ? -1 : 1),
      fade: [start + (TAU * k) / n, Math.random() * TAU],
    }));
  }

  reset() {
    this.trails = [];
    this.current = null;
  }
}
