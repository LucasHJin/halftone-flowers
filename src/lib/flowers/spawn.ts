/**
 * The bed grows in when it first appears: each plant from the ground up, a few
 * at a time spreading out from the corner, each diamond growing into its dot
 * with a slight pop. Every plant is in within SPAWN_TIME of the first starting.
 *
 * The halftone only knows dots, so the timing reaches it through a mask: each
 * plant is painted again in one flat colour, red for when its front crosses
 * the bottom of the screen, green for how fast it climbs, and blue for
 * coverage. From that and its own height, a diamond works out how far it has
 * grown.
 */
import { clamp, createRandom, lerp } from "../../utils/math";
import type { DotScale } from "../halftone";
import { SEGMENTS } from "./stem";
import type { Plant } from "./types";

/** Seconds from the first plant starting to the last one being fully in. */
export const SPAWN_TIME = 1.5;
/** Seconds for one diamond to grow into its dot. */
const GROW = 0.5;
/** Most a diamond lags behind the front, so the front doesn't fill in row by row. */
const SCATTER = 0.1;
/** Seconds for the front to climb a whole plant. */
const CLIMB: [number, number] = [0.25, 0.45];
/** Paces the mask can carry, as logs of seconds per px. */
const PACE: [number, number] = [Math.log(1e-4), Math.log(0.03)];

/** Gives each plant its start and climbing pace. Call once the plants are posed. */
export function planSpawn(plants: Plant[], width: number, height: number, seed: number) {
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
    return { root: main.rootY, top, order: 0.6 * far + 0.4 * rand() };
  });
  const first = Math.min(...plans.map((p) => p.order));
  const last = Math.max(...plans.map((p) => p.order));
  plants.forEach((plant, i) => {
    const { root, top, order } = plans[i];
    const climb = lerp(CLIMB[0], CLIMB[1], rand());
    const start = ((order - first) / (last - first || 1)) * (SPAWN_TIME - climb - GROW - SCATTER);
    const pace = climb / Math.max(root - top, 1);
    plant.spawn = { bottom: start + (root - height) * pace, pace };
  });
}

/** Where a plant's front is `elapsed` seconds in: nothing above it has started growing. */
export function spawnFront(plant: Plant, elapsed: number, height: number) {
  const s = plant.spawn;
  return s ? height - (elapsed - s.bottom) / s.pace : -Infinity;
}

/** The flat colour a plant is painted in for the spawn mask. */
export function spawnColor(plant: Plant) {
  const s = plant.spawn!;
  const r = Math.round(clamp(s.bottom / SPAWN_TIME, 0, 1) * 255);
  const g = Math.round(clamp((Math.log(s.pace) - PACE[0]) / (PACE[1] - PACE[0]), 0, 1) * 255);
  return `rgb(${r},${g},255)`;
}

/** Reads the spawn mask: how big each diamond's dot is `elapsed` seconds in. */
export function spawnScale(elapsed: number, height: number): DotScale {
  return (r, g, b, _x, y, i, j) => {
    if (b === 0) return 1;
    // Dividing by coverage undoes antialiasing at the edges; where plants meet, their timings blend.
    const bottom = (r / b) * SPAWN_TIME;
    const pace = Math.exp(lerp(PACE[0], PACE[1], g / b));
    const reached = bottom + (height - y) * pace + SCATTER * scatter(i, j);
    return pop(clamp((elapsed - reached) / GROW, 0, 1));
  };
}

/** From 0 to 1, overshooting to about 1.1 on the way, so each dot pops into place. */
function pop(t: number) {
  const u = t - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
}

/** A steady pseudo-random 0–1 per diamond. */
function scatter(i: number, j: number) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
