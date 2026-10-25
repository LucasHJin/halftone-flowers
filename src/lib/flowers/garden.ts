/**
 * A mixed bed of flowers and grass: a tall bouquet rooted in the bottom-left
 * corner reaching up and to the right, and a low meadow trailing off along the
 * bottom. Each stem sways on a damped spring driven by the wind, so tall stems
 * lag and overshoot a little while short ones follow closely. The pointer stirs
 * up its own breeze through the same springs, so brushed flowers lean away and
 * drift back as unhurriedly as everything else.
 */
import { clamp, createRandom, lerp, TAU } from "../../utils/math";
import { planSpawn, SPAWN_TIME } from "./spawn";
import { SHORT, SPECIES, TALL } from "./species";
import { createStem, curvedStem, poseStem, SEGMENTS } from "./stem";
import type { Head, Ink, Kind, Leaf, LeafShape, Plant, Stem } from "./types";
import { windAt } from "./wind";

/** Wind added per px the pointer travels across a stem it's pressing on. */
const GUST = 0.055;
/** The most wind the pointer can add to one stem; a full swell is about 1. */
const GUST_MAX = 3.5;
/** Seconds for a gust to fade to about a third. */
const GUST_FADE = 2;
/** Seconds for a gust to build up around a stem, so it eases over rather than being knocked. */
const GUST_RISE = 0.5;

export interface GardenLayout {
  width: number;
  height: number;
  /** Diamond width; thin parts are kept at least about half a diamond wide so they read. */
  cell: number;
  seed: number;
  /** Multiplier on the number of stems. */
  density: number;
  /** Grow the plants in rather than have them there from the start. */
  spawn: boolean;
}

export class Garden {
  plants: Plant[] = [];
  time = 0;
  width = 0;
  height = 0;
  /** Multiplier on how far the wind bends things. */
  wind = 1;
  private nextId = 0;
  private rand: () => number = Math.random;
  private bloom = 40;
  private stemWidth = 3;
  /** Radius around the pointer that presses on stems. */
  private hand = 30;
  /** Where the pointer is, where it was at the last step, and its smoothed velocity. */
  private pointer = { x: 0, y: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, live: false };
  private spawnFrom: number | null = null;

  layout({ width: W, height: H, cell, seed, density, spawn }: GardenLayout) {
    this.width = W;
    this.height = H;
    this.rand = createRandom(seed);
    const rand = this.rand;
    this.plants = [];
    this.nextId = 0;
    this.bloom = clamp(Math.min(W, H) * 0.055, 24, 68);
    this.stemWidth = Math.max(cell * 0.55, Math.min(W, H) * 0.004);
    this.hand = this.bloom * 0.55;
    // Counts depend on width only, so a phone's URL bar resizing the height doesn't reshuffle the bed.
    const count = Math.round(clamp(W / 62, 10, 26) * density);

    // The bouquet: heads land inside a quarter-ellipse from the corner, densest near it.
    const reachX = W * 0.62;
    const reachY = H * 0.74;
    for (let i = 0; i < count; i++) {
      const depth = rand();
      const reach = 0.3 + 0.7 * Math.pow(rand(), 1.25);
      // Mostly along the diagonal, sometimes steeper or flatter.
      const theta = clamp(0.85 + (rand() + rand() + rand() - 1.5) * 0.5, 0.25, 1.45);
      const rootX = W * (-0.03 + 0.3 * Math.pow(rand(), 1.8));
      const headX = Math.max(reachX * reach * Math.cos(theta), rootX + 15);
      const headY = H - reachY * reach * Math.sin(theta);
      this.plant(this.pick(TALL), rootX, H + this.between(8, 40), headX, headY, depth, 1, reach > 0.5);
    }

    // The meadow: shorter and sparser the further right it goes.
    const low = Math.round(count * 0.8);
    for (let i = 0; i < low; i++) {
      const depth = rand();
      const along = Math.pow(rand(), 1.15);
      const rootX = W * (0.12 + 0.78 * along);
      const tall = H * lerp(0.3, 0.07, along) * this.between(0.55, 1);
      const headX = rootX + tall * this.between(0.05, 0.45);
      this.plant(this.pick(SHORT), rootX, H + this.between(5, 25), headX, H - tall, depth, lerp(0.85, 0.6, along), false);
    }

    // Grass arching out of the corner, then in tufts along the bottom.
    const blades = Math.round(count * 1.2);
    for (let i = 0; i < blades; i++) {
      const corner = i < count * 0.7;
      const depth = rand();
      const along = rand();
      const rootX = corner ? W * (-0.04 + 0.22 * Math.pow(rand(), 1.5)) : W * (0.1 + 0.8 * along);
      const tall = corner ? H * this.between(0.18, 0.5) : H * lerp(0.18, 0.05, along) * this.between(0.6, 1);
      const rootY = H + this.between(5, 30);
      const blade = this.curved(rootX, rootY, rootX + tall * this.between(0.25, 0.75), rootY - tall * this.between(0.55, 0.9), this.between(0.5, 0.9));
      blade.baseWidth = this.stemWidth * this.between(1.3, 2.2);
      blade.tipWidth = 0;
      blade.tone = 0.4 + 0.3 * depth;
      blade.flex = this.between(0.13, 0.2);
      blade.damping = 0.1;
      this.plants.push({ depth, stems: [blade], spawn: null });
    }

    this.plants.sort((a, b) => a.depth - b.depth);
    // Start from a settled bed rather than every stem springing at once.
    for (const p of this.plants) {
      for (const s of p.stems) {
        poseStem(s);
        s.bend = s.flex * this.wind * windAt(s.x[SEGMENTS], s.y[SEGMENTS], this.time);
        poseStem(s);
      }
    }
    this.spawnFrom = null;
    if (spawn) {
      planSpawn(this.plants, W, H, seed);
      this.spawnFrom = this.time;
    }
  }

  /** Seconds since the plants started growing in, or null once they're all in. */
  get growing() {
    return this.spawnFrom === null ? null : this.time - this.spawnFrom;
  }

  /** Shows every plant fully grown straight away. */
  endSpawn() {
    this.spawnFrom = null;
  }

  step(dt: number) {
    this.time += dt;
    const t = this.time;
    if (this.spawnFrom !== null && t - this.spawnFrom > SPAWN_TIME) this.spawnFrom = null;
    const p = this.pointer;
    let vx = 0;
    let vy = 0;
    if (p.live) {
      // Smoothed over a few steps, since pointer events and steps don't line up one to one.
      const k = 1 - Math.exp(-dt / 0.05);
      p.vx += ((p.x - p.lastX) / dt - p.vx) * k;
      p.vy += ((p.y - p.lastY) / dt - p.vy) * k;
      p.lastX = p.x;
      p.lastY = p.y;
      vx = p.vx;
      vy = p.vy;
    }
    const brushing = vx * vx + vy * vy > 25;
    const fade = Math.exp(-dt / GUST_FADE);
    const rise = 1 - Math.exp(-dt / GUST_RISE);
    for (const plant of this.plants) {
      for (const s of plant.stems) {
        if (brushing) this.brush(s, vx, vy, dt);
        s.gust *= fade;
        s.breeze += (s.gust - s.breeze) * rise;
        const target = s.flex * (this.wind * windAt(s.x[SEGMENTS], s.y[SEGMENTS], t) + s.breeze);
        s.bendVel += (s.omega * s.omega * (target - s.bend) - 2 * s.damping * s.omega * s.bendVel) * dt;
        s.bend += s.bendVel * dt;
        // Heads trail the stem's motion and lean a little further with the wind.
        const nodTarget = 0.3 * s.bend - 0.25 * s.bendVel;
        s.nodVel += (48 * (nodTarget - s.nod) - 4 * s.nodVel) * dt;
        s.nod += s.nodVel * dt;
        poseStem(s);
      }
    }
  }

  /** The pointer moved to (x, y). Stems it passes through lean the way it's going, then drift back. */
  movePointer(x: number, y: number) {
    const p = this.pointer;
    if (!p.live) Object.assign(p, { lastX: x, lastY: y, vx: 0, vy: 0, live: true });
    p.x = x;
    p.y = y;
  }

  /** Forgets the pointer, so when it next appears somewhere else it doesn't sweep across the bed to get there. */
  releasePointer() {
    this.pointer.live = false;
  }

  /**
   * Adds wind to a stem the pointer is passing through, the way it's moving and
   * most where it meets the head, and a little to stems further off.
   */
  private brush(s: Stem, vx: number, vy: number, dt: number) {
    const { x, y } = this.pointer;
    const hand = this.hand;
    const h = s.head;
    // Spikes and plumes carry their flowers along the top of the stem, which is that much wider to catch.
    const florets = h && (h.kind === "spike" || h.kind === "plume") ? h : null;
    const from = florets ? SEGMENTS * (1 - florets.reach) : SEGMENTS;
    let grip = 0;
    let at = SEGMENTS - 1;
    // The lower stem is stiff and mostly hidden, so only the upper two thirds catch.
    for (let k = SEGMENTS / 3; k < SEGMENTS; k++) {
      const ax = s.x[k];
      const ay = s.y[k];
      const bx = s.x[k + 1] - ax;
      const by = s.y[k + 1] - ay;
      const u = clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1), 0, 1);
      let d = Math.hypot(ax + bx * u - x, ay + by * u - y);
      if (florets && k + u >= from) d -= florets.radius;
      const g = pressure(d, hand) * ((k + u) / SEGMENTS) ** 1.5;
      if (g > grip) {
        grip = g;
        at = k;
      }
    }
    if (h && !florets) {
      const g = pressure(Math.hypot(s.x[SEGMENTS] - x, s.y[SEGMENTS] - y) - h.radius * 0.85, hand);
      if (g > grip) {
        grip = g;
        at = SEGMENTS - 1;
      }
    }
    if (grip < 1e-3) return;
    // Only movement across the stem pushes it; how far, not how fast, so a flick is no rougher than a sweep.
    // Short stems barely sway in the wind, so they catch more of it to visibly answer the pointer.
    const a = s.angle[at];
    const across = (vx * Math.cos(a) + vy * Math.sin(a)) * dt;
    const catches = Math.sqrt((this.bloom * 8) / (s.segment * SEGMENTS));
    s.gust = GUST_MAX * Math.tanh((s.gust + GUST * catches * grip * across) / GUST_MAX);
  }

  private between(a: number, b: number) {
    return lerp(a, b, this.rand());
  }

  private pick<T>(table: [T, number][]): T {
    let r = this.rand() * table.reduce((sum, [, w]) => sum + w, 0);
    for (const [value, weight] of table) {
      r -= weight;
      if (r <= 0) return value;
    }
    return table[0][0];
  }

  private curved(x0: number, y0: number, x3: number, y3: number, lean: number) {
    return curvedStem(this.nextId++, x0, y0, x3, y3, lean, this.rand);
  }

  /** One flowering plant: a main stem with its head and leaves, and sometimes a side branch. */
  private plant(kind: Kind, rootX: number, rootY: number, headX: number, headY: number, depth: number, scale: number, tall: boolean) {
    const sp = SPECIES[kind];
    const main = this.curved(rootX, rootY, headX, headY, this.between(...sp.lean));
    const length = main.segment * SEGMENTS;
    main.baseWidth = this.stemWidth * sp.stem * this.between(1.1, 1.5);
    main.tipWidth = this.stemWidth * sp.stem * 0.75;
    main.tone = 0.55 + 0.3 * depth;
    main.flex = this.between(0.08, 0.13) * sp.flex * clamp(length / 400, 0.6, 1.4);
    main.head = this.head(kind, depth, scale);
    if (kind === "bud" && this.rand() < 0.5) {
      // A nodding bud, its stem hooked over at the top like a poppy's.
      const hook = this.between(1.6, 2.4);
      for (let k = SEGMENTS - 5; k < SEGMENTS; k++) main.rest[k] += hook * Math.pow((k - SEGMENTS + 6) / 5, 1.5);
    }

    const leaves = Math.round(this.between(sp.leaves[0], sp.leaves[1] + 0.49));
    let side = this.rand() < 0.5 ? -1 : 1;
    for (let l = 0; l < leaves; l++) {
      main.leaves.push(this.leaf(sp.leaf, side, length));
      side = -side;
    }

    const stems = [main];
    if (tall && sp.branches && this.rand() < 0.5) {
      // A side branch that splits off, then curves back upward.
      const attach = Math.round(SEGMENTS * this.between(0.42, 0.68));
      const out = this.rand() < 0.7 ? 1 : -1;
      const start = main.rest[attach] + out * this.between(0.35, 0.65);
      const end = lerp(start, 0.35, 0.6);
      const branch = createStem(this.nextId++, 0, 0, (length * this.between(0.22, 0.4)) / SEGMENTS);
      for (let k = 0; k < SEGMENTS; k++) branch.rest[k] = lerp(start, end, k / (SEGMENTS - 1));
      branch.parent = main;
      branch.attach = attach;
      branch.baseWidth = main.tipWidth;
      branch.tipWidth = this.stemWidth * 0.7;
      branch.tone = main.tone;
      branch.flex = main.flex * 0.8;
      branch.omega *= 1.4;
      branch.head = this.rand() < 0.6 ? this.head(kind, depth, scale * 0.65) : this.head("bud", depth, scale);
      if (main.head && branch.head.kind === main.head.kind) {
        branch.head.ink = main.head.ink;
        branch.head.centre = main.head.centre;
      }
      stems.push(branch);
    }
    this.plants.push({ depth, stems, spawn: null });
  }

  private head(kind: Kind, depth: number, scale: number): Head {
    const sp = SPECIES[kind];
    const [wm, wd, ww] = sp.inks;
    const r = this.rand() * (wm + wd + ww);
    const ink: Ink = r < wm ? 0 : r < wm + wd ? 1 : 2;
    // Centres contrast with the petals: dark on pink, white on dark poppies, pink or dark on white.
    const centre: Ink = ink === 0 ? 1 : ink === 1 ? (kind === "poppy" ? 2 : 0) : this.rand() < 0.6 ? 0 : 1;
    let petals = 0;
    let style = 0;
    if (kind === "cosmos") petals = 7 + Math.floor(this.rand() * 3);
    else if (kind === "daisy") petals = 13 + Math.floor(this.rand() * 9);
    else if (kind === "lily") petals = 6;
    else if (kind === "poppy") petals = 4;
    else if (kind === "cluster") {
      petals = 5 + Math.floor(this.rand() * 5);
      style = this.rand() < 0.5 ? 1 : 0;
    } else if (kind === "spike") {
      style = this.pick([[0, 2], [1, 1], [2, 1]]);
      petals = style === 0 ? 18 + Math.floor(this.rand() * 9) : style === 1 ? 8 + Math.floor(this.rand() * 5) : 9 + Math.floor(this.rand() * 4);
    }
    return {
      kind,
      radius: this.bloom * this.between(...sp.size) * lerp(0.85, 1.1, depth) * scale,
      petals,
      face: clamp(this.between(...sp.face), 0.05, 1),
      spin: this.rand() * TAU,
      ink,
      centre,
      blush: ink === 2 && this.rand() < 0.5,
      // Nearer flowers print darker, so the bed has depth. Plumes stay soft.
      tone: (0.6 + 0.4 * depth) * (kind === "plume" ? 0.7 : 1),
      jitter: Array.from({ length: Math.max(petals, 1) }, () => this.between(0.88, 1.08)),
      reach: kind === "plume" ? this.between(0.22, 0.35) : this.between(0.3, 0.5),
      style,
    };
  }

  private leaf(shape: LeafShape, side: number, stemLength: number): Leaf {
    const phase = this.rand() * TAU;
    if (shape === "strap") {
      // Long, narrow and arching, from low on the stem (tulips, lilies).
      const length = clamp(stemLength * this.between(0.3, 0.5), 30, 260);
      return { shape, at: 1 + Math.floor(this.rand() * 2), side, spread: this.between(0.12, 0.35), length, width: length * this.between(0.09, 0.12), phase };
    }
    if (shape === "oval") {
      const length = clamp(stemLength * this.between(0.08, 0.13), 12, 60);
      return { shape, at: Math.round(SEGMENTS * this.between(0.25, 0.6)), side, spread: this.between(0.6, 1), length, width: length * this.between(0.4, 0.5), phase };
    }
    const length = clamp(stemLength * this.between(0.12, 0.2), 18, 110);
    return { shape, at: Math.round(SEGMENTS * this.between(0.1, 0.5)), side, spread: this.between(0.45, 0.85), length, width: length * this.between(0.18, 0.26), phase };
  }
}

/** How firmly a pointer `d` px from a stem presses on it: fully within the hand, then a faint stir of air. */
function pressure(d: number, hand: number) {
  const touch = d < hand ? (1 - Math.max(d, 0) / hand) ** 2 : 0;
  const air = d < hand * 3 ? 0.1 * (1 - Math.max(d, 0) / (hand * 3)) ** 2 : 0;
  return touch + air;
}
