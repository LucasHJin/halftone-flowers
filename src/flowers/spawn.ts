/**
 * The bed grows in when it first appears: each plant from the ground up, a few
 * at a time spreading out from the corner, each diamond growing into its dot
 * with a slight pop. Every plant is in within the spawn's duration of the
 * first starting.
 *
 * The halftone only knows dots, so the timing reaches it through a mask: each
 * plant is painted again in one flat colour, red for when its front crosses
 * the bottom of the screen, green for how fast it climbs, and blue for
 * coverage. From that and its own height, a diamond works out how far it has
 * grown.
 */
import { clamp, createRandom, lerp } from "../utils/math.js";
import type { DotScale } from "../halftone/index.js";
import type { SpawnSettings } from "./settings.js";
import { SEGMENTS } from "./stem.js";
import type { Plant } from "./types.js";

/** The timings shared by every plant, and the ranges the mask's colours span. */
export interface SpawnPlan {
  /** Seconds until the last diamond is in. */
  end: number;
  grow: number;
  scatter: number;
  /** Latest time a front crosses the bottom of the screen. */
  latest: number;
  /** Fastest and slowest climb, as logs of seconds per px. */
  pace: [number, number];
  /**
   * How far each dot has got through its pop, by lattice position. Dots only
   * move forward, so where a later plant's front passes over one already in,
   * it stays in instead of shrinking away and popping in again.
   */
  grown: Map<number, number>;
}

/** Gives each plant its start and climbing pace. Call once the plants are posed. */
export function planSpawn(plants: Plant[], width: number, height: number, seed: number, settings: SpawnSettings): SpawnPlan {
  const { duration, grow, scatter, climb, order } = settings;
  // Its own sequence, so the same seed grows the same bed whether or not it spawns.
  const rand = createRandom(seed ^ 0x5bd1e995);
  const plans = plants.map((p) => {
    const main = p.stems[0];
    let top = Infinity;
    for (const s of p.stems) {
      for (let k = 0; k <= SEGMENTS; k++) top = Math.min(top, s.y[k]);
      if (s.head) top = Math.min(top, s.y[SEGMENTS] - s.head.radius * 1.5);
    }
    // Loosely outward from the bottom-left corner.
    const far = Math.hypot(main.x[SEGMENTS] / width, (height - main.y[SEGMENTS]) / height);
    return { root: main.rootY, top, order: order * far + (1 - order) * rand() };
  });
  const first = Math.min(...plans.map((p) => p.order));
  const last = Math.max(...plans.map((p) => p.order));
  let end = duration;
  let latest = 0;
  let fastest = Infinity;
  let slowest = -Infinity;
  plants.forEach((plant, i) => {
    const { root, top, order } = plans[i];
    const time = lerp(climb[0], climb[1], rand());
    // If the timings don't fit in the duration, everything starts together and runs over.
    const start = ((order - first) / (last - first || 1)) * Math.max(duration - time - grow - scatter, 0);
    const pace = time / Math.max(root - top, 1);
    plant.spawn = { bottom: start + (root - height) * pace, pace };
    end = Math.max(end, start + time + grow + scatter);
    latest = Math.max(latest, plant.spawn.bottom);
    fastest = Math.min(fastest, Math.log(pace));
    slowest = Math.max(slowest, Math.log(pace));
  });
  return { end, grow, scatter, latest: latest || 1, pace: [fastest - 0.01, slowest + 0.01], grown: new Map() };
}

/** Where a plant's front is `elapsed` seconds in: nothing above it has started growing. */
export function spawnFront(plant: Plant, elapsed: number, height: number) {
  const s = plant.spawn;
  return s ? height - (elapsed - s.bottom) / s.pace : -Infinity;
}

/** The flat colour a plant is painted in for the spawn mask. */
export function spawnColor(plant: Plant, plan: SpawnPlan) {
  const s = plant.spawn!;
  const [lo, hi] = plan.pace;
  const r = Math.round(clamp(s.bottom / plan.latest, 0, 1) * 255);
  const g = Math.round(clamp((Math.log(s.pace) - lo) / (hi - lo), 0, 1) * 255);
  return `rgb(${r},${g},255)`;
}

/** Reads the spawn mask: how big each diamond's dot is `elapsed` seconds in. */
export function spawnScale(plan: SpawnPlan, elapsed: number, height: number): DotScale {
  const { grow, scatter, latest, pace: [lo, hi], grown } = plan;
  return (r, g, b, _x, y, i, j) => {
    if (b === 0) return 1;
    // Dividing by coverage undoes antialiasing at the edges; where plants meet, their timings blend.
    const bottom = (r / b) * latest;
    const pace = Math.exp(lerp(lo, hi, g / b));
    const reached = bottom + (height - y) * pace + scatter * hash(i, j);
    const key = i * 65536 + j;
    const t = Math.max(grown.get(key) ?? 0, clamp((elapsed - reached) / grow, 0, 1));
    grown.set(key, t);
    return pop(t);
  };
}

/** From 0 to 1, overshooting to about 1.1 on the way, so each dot pops into place. */
function pop(t: number) {
  const u = t - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
}

/** A steady pseudo-random 0–1 per diamond. */
function hash(i: number, j: number) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
