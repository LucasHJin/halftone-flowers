/**
 * What the pointer leaves on the field in the insects' colours: a trail and,
 * round a click, a small ring of dots splashing out, each its own shade at
 * random. The trail is a few strands, each printed like a bee's or
 * butterfly's trail, that ease after the pointer along one smoothed path.
 * Close behind it they run together; further back they spread apart and weave
 * round each other in waves that keep running along them, like wisps of wind,
 * each strand fading in and out along its length. They stay a moment, then
 * thin and fade from the old end. The trail is painted in front of
 * everything; the splash is printed over the halftone.
 */
import { clamp, lerp, TAU } from "../../utils/math";
import type { DiamondHalftone, Mark } from "../halftone";
import { smoothstep } from "./insects/insect";
import { strokeSegment } from "./insects/trail";
import type { FlowerSettings } from "./settings";

/** Px the trail's head moves before it lays down another point. */
const SPACING = 2.5;

/** How far apart the strands are right behind the pointer, as a share of how far they spread. */
const TIGHT = 0.12;

/** Seconds the strands take to spread about two thirds of the way apart. */
const OPEN = 0.15;

/** Px along the trail over which each strand fades out and back in, roughly. */
const WISP = 520;

/** Seconds a splash dot takes to pop up, past its size and back. */
const POP = 0.2;

/** How far out a splash's dots start, as a share of how far they go. */
const START = 0.3;

/** Share of a splash's time its dots spend shrinking and fading at the end. */
const SPLASH_FADE = 0.45;

/** A spot the trail's head passed. */
interface PathPoint {
  x: number;
  y: number;
  /** Unit normal to the path there. */
  nx: number;
  ny: number;
  /** Px along the trail from its start. */
  s: number;
  /** Garden time it was laid down. */
  t: number;
}

/** One strand's own way of weaving round the path. */
interface Strand {
  /** Where along its wave it starts, radians. */
  phase: number;
  /** Px along the path from one crest to the next. */
  wave: number;
  /** Multiplier on how far it strays from the path. */
  reach: number;
  /** Radians a second its waves run along it. */
  flow: number;
  /** Where along its fading in and out it starts, and a second, quicker flicker's phase, radians. */
  fade: [number, number];
}

interface PointerTrail {
  points: PathPoint[];
  strands: Strand[];
}

interface Splash {
  x: number;
  y: number;
  born: number;
  /** Which way each dot goes, radians, how far as a share of the radius, and its shade. */
  dots: { angle: number; reach: number; shade: number }[];
}

export class PointerInk {
  private trails: PointerTrail[] = [];
  /** The trail being laid now, the head laying it, and where the pointer is. */
  private current: PointerTrail | null = null;
  private head = { x: 0, y: 0, vx: 0, vy: 0, nx: 0, ny: -1 };
  private target = { x: 0, y: 0 };
  private splashes: Splash[] = [];

  constructor(
    private lattice: Pick<DiamondHalftone, "cell">,
    public settings: FlowerSettings,
  ) {}

  /** The pointer moved to (x, y). `fresh` starts a new trail there, for a pointer that may have come back anywhere. */
  move(x: number, y: number, fresh: boolean) {
    this.target.x = x;
    this.target.y = y;
    if (!this.settings.trail.enabled || (!fresh && this.current)) return;
    Object.assign(this.head, { x, y, vx: 0, vy: 0 });
    this.current = { points: [], strands: this.newStrands() };
    this.trails.push(this.current);
  }

  /**
   * Moves the trail's head on `dt` seconds, to garden time `now`, laying down
   * points as it goes. It eases after the pointer like a critically damped
   * spring, so it never overshoots, and the path comes out rounded where the
   * pointer turned sharply.
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
      // The exact solution over each sub-step, so it's steady however short the lag.
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

  /** Paints the trail into the tone image, over everything already there. */
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
          // Each strand fades out and back in along its length, out of step with the others.
          const shows = smoothstep(0.2, 0.65, 0.5 + 0.32 * Math.sin((TAU * p.s) / WISP + strand.fade[0]) + 0.18 * Math.sin((TAU * p.s) / (WISP * 0.37) + strand.fade[1]));
          strokeSegment(ctx, xs[i - 1], ys[i - 1], xs[i], ys[i], fresh * shows, trail);
        }
      }
    }
  }

  /** A strand for each of the settings', weaving out of step with each other, and fading in and out out of step too. */
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

  /** A click or tap at (x, y): a ring of dots splashes out round it. */
  splash(x: number, y: number, now: number) {
    const { enabled, dots, shades } = this.settings.splash;
    if (!enabled) return;
    const n = Math.max(1, Math.round(dots));
    const turn = Math.random() * TAU;
    this.splashes.push({
      x,
      y,
      born: now,
      dots: Array.from({ length: n }, (_, k) => ({
        angle: turn + ((k + lerp(-0.2, 0.2, Math.random())) * TAU) / n,
        reach: lerp(0.8, 1.15, Math.random()),
        shade: lerp(shades[0], shades[1], Math.random()),
      })),
    });
  }

  /** The splash's dots showing at `now`, forgetting those that have gone. */
  marks(now: number) {
    const out: Mark[] = [];
    const { radius, duration, size } = this.settings.splash;
    const reach = radius * this.lattice.cell;
    this.splashes = this.splashes.filter((s) => now - s.born < duration);
    for (const s of this.splashes) {
      const age = now - s.born;
      const t = age / duration;
      const far = lerp(START, 1, 1 - (1 - t) ** 3) * reach;
      // Pops up from four fifths of its size to a little past it, then settles.
      const k = age / POP;
      let grown = k < 0.6 ? lerp(0.8, 1.1, 1 - (1 - k / 0.6) ** 2) : lerp(1.1, 1, smoothstep(0.6, 1, k));
      let opacity = Math.min(1, k / 0.5);
      const going = (t - (1 - SPLASH_FADE)) / SPLASH_FADE;
      if (going > 0) {
        grown *= 1 - smoothstep(0, 1, going);
        opacity *= 1 - going;
      }
      for (const d of s.dots) {
        out.push({
          x: s.x + Math.cos(d.angle) * far * d.reach,
          y: s.y + Math.sin(d.angle) * far * d.reach,
          size: size * grown,
          shade: d.shade,
          opacity,
        });
      }
    }
    return out;
  }

  /** Clears the trail and any splash. */
  reset() {
    this.trails = [];
    this.current = null;
    this.splashes = [];
  }
}
