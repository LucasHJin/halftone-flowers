/**
 * The bed: a tall bouquet rooted in the bottom-left corner reaching up and
 * right, a low meadow along the bottom, and grass. Each stem sways on a damped
 * spring driven by the wind plus the pointer's breeze.
 */
import { clamp, createRandom, lerp, TAU } from "../utils/math.js";
import type { FlowerSettings, Mix } from "./settings.js";
import { Insects } from "./insects/index.js";
import { Cover } from "./insects/cover.js";
import { clearOf } from "./insects/insect.js";
import { Petals } from "./petals.js";
import { planSpawn, type SpawnPlan } from "./spawn.js";
import { createStem, curvedStem, poseStem, SEGMENTS } from "./stem.js";
import type { Head, Ink, Kind, Leaf, LeafShape, Plant, Stem } from "./types.js";
import { createWind, type Wind } from "./wind.js";

/** Share of the way along the meadow where `meadow.thicken`'s extra stems start. */
const THICKER_FROM = 0.3;

/** A click or tap nudges a flower as hard as brushing this many px across it. */
const TAP = 12;

export interface GardenLayout {
  width: number;
  height: number;
  /** Diamond width, px; thin parts are kept at least about half of it wide so they print. */
  cell: number;
  seed: number;
  /** Multiplier on the number of stems. */
  density: number;
  /** Grow the plants in; false has them there from the start. */
  spawn: boolean;
}

export class Garden {
  plants: Plant[] = [];
  time = 0;
  width = 0;
  height = 0;
  /** Multiplier on how far the wind bends things. */
  wind = 1;
  /** Grow-in timings while the bed grows in, else null. */
  spawnPlan: SpawnPlan | null = null;
  insects: Insects;
  /** Loose petals blowing away. */
  petals: Petals;
  /** Base flower size, px. */
  bloom = 40;
  /** Diamond width, px. */
  cell = 8;
  private windAt: Wind;
  private nextId = 0;
  private rand: () => number = Math.random;
  private stemWidth = 3;
  /** Radius around the pointer that presses on stems, px. */
  private hand = 30;
  /** `lastX`/`lastY` are where it was at the last step; `vx`/`vy` are smoothed, px/s. */
  private pointer = { x: 0, y: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, live: false };
  private spawnFrom: number | null = null;
  /** Which plant shows where, for telling which flower a click is on. */
  private cover = new Cover();

  constructor(public settings: FlowerSettings) {
    this.windAt = createWind(settings.wind);
    this.insects = new Insects(this);
    this.petals = new Petals(this);
  }

  /** `layout`, `species`, `mix`, `tone` and `spawn` wait for the next `layout()`; the rest applies straight away. */
  configure(settings: FlowerSettings) {
    this.settings = settings;
    this.windAt = createWind(settings.wind);
    this.hand = this.bloom * settings.cursor.reach;
  }

  layout({ width: W, height: H, cell, seed, density, spawn }: GardenLayout) {
    this.width = W;
    this.height = H;
    this.cell = cell;
    this.rand = createRandom(seed);
    const rand = this.rand;
    const { flowerSize, stems, bouquet, meadow, grass, curveUp } = this.settings.layout;
    const { mix, tone } = this.settings;
    this.plants = [];
    this.nextId = 0;
    this.bloom = clamp(Math.min(W, H) * flowerSize.share, flowerSize.min, flowerSize.max);
    this.stemWidth = Math.max(cell * 0.55, Math.min(W, H) * 0.004);
    this.hand = this.bloom * this.settings.cursor.reach;
    // Counts depend on width only, so a phone's URL bar resizing the height doesn't reshuffle the bed.
    const count = Math.round(clamp(W / stems.spacing, stems.min, stems.max) * density);

    // Bouquet: heads land in a quarter-ellipse from the corner, densest near it.
    const reachX = W * bouquet.reach[0];
    const reachY = H * bouquet.reach[1];
    const tallKinds = odds(mix.bouquet);
    for (let i = 0; tallKinds.length && i < count; i++) {
      const depth = rand();
      const reach = bouquet.inner + (1 - bouquet.inner) * Math.pow(rand(), 1.25);
      // Mostly along the diagonal, sometimes steeper or flatter.
      const theta = clamp(0.85 + (rand() + rand() + rand() - 1.5) * 0.5, 0.25, 1.45);
      const rootX = W * (-0.03 + bouquet.roots * Math.pow(rand(), 1.8));
      const headX = Math.max(reachX * reach * Math.cos(theta), rootX + 15);
      const headY = H - reachY * reach * Math.sin(theta);
      this.plant(this.pick(tallKinds), rootX, H + this.between(8, 40), headX, headY, depth, 1, reach > 0.5);
    }

    // Meadow: each stem near its own share of the span, shorter further right.
    const low = Math.round(count * meadow.amount);
    const shortKinds = odds(mix.meadow);
    for (let i = 0; shortKinds.length && i < low; i++) {
      const depth = rand();
      const along = clamp((i + 0.5 + (rand() - 0.5) * meadow.scatter) / low, 0, 1);
      const rootX = W * lerp(meadow.span[0], meadow.span[1], along);
      const tall = H * lerp(meadow.height[0], meadow.height[1], along) * this.between(0.55, 1);
      const headX = rootX + tall * this.between(...meadow.slant);
      this.plant(this.pick(shortKinds), rootX, H + this.between(5, 25), headX, H - tall, depth, lerp(0.85, 0.6, along), false);
    }

    // Grass: blades arching out of the corner, then tufts of three spread along the bottom like the meadow.
    const corner = Math.round(count * grass.corner);
    const bottom = Math.round(count * grass.bottom);
    const tufts = Math.ceil(bottom / 3);
    let along = 0;
    for (let i = 0; i < corner + bottom; i++) {
      const inCorner = i < corner;
      const depth = rand();
      const tuft = (i - corner) / 3;
      if (Number.isInteger(tuft)) along = clamp((tuft + 0.5 + (rand() - 0.5) * meadow.scatter) / tufts, 0, 1);
      const rootX = inCorner ? W * (-0.04 + 0.22 * Math.pow(rand(), 1.5)) : W * (0.1 + 0.8 * along) + this.between(-1, 1) * this.stemWidth * 2;
      const tall = inCorner ? H * this.between(0.18, 0.5) : H * lerp(0.2, 0.09, along) * this.between(0.6, 1);
      const rootY = H + this.between(5, 30);
      const out = inCorner ? this.between(0.25, 0.75) : this.between(-0.35, 0.75);
      const lean = this.rand() < curveUp ? -this.between(0.25, 0.6) : this.between(0.5, 0.9);
      const blade = this.curved(rootX, rootY, rootX + tall * out, rootY - tall * this.between(0.55, 0.9), lean);
      blade.baseWidth = this.stemWidth * this.between(1.3, 2.2);
      blade.tipWidth = 0;
      blade.tone = lerp(tone.grass[0], tone.grass[1], depth);
      blade.flex = this.between(0.13, 0.2);
      this.plants.push({ depth, stems: [blade], spawn: null });
    }

    // Extra meadow stems toward its short right end, so it doesn't thin out into an even row. Drawn last from the seed,
    // so changing `thicken` doesn't reshuffle the rest of the bed.
    const extra = shortKinds.length ? Math.round(low * meadow.thicken * (1 - THICKER_FROM) / 2) : 0;
    for (let i = 0; i < extra; i++) {
      const depth = rand();
      // Each near its own share of the stretch; `Math.sqrt` narrows the shares so density rises linearly toward the end.
      const along = lerp(THICKER_FROM, 1, Math.sqrt(clamp((i + 0.5 + (rand() - 0.5) * meadow.scatter) / extra, 0, 1)));
      const rootX = W * lerp(meadow.span[0], meadow.span[1], along);
      // Mostly a little under the meadow's height where it stands, now and then well over it.
      const tall = H * lerp(meadow.height[0], meadow.height[1], along) * (0.5 + 0.9 * rand() ** 1.6);
      const headX = rootX + tall * this.between(...meadow.slant);
      this.plant(this.pick(shortKinds), rootX, H + this.between(5, 25), headX, H - tall, depth, lerp(0.85, 0.6, along) * this.between(0.85, 1.15), false);
    }

    this.plants.sort((a, b) => a.depth - b.depth);
    // Start each stem bent to the wind at its tip, so they don't all spring at once.
    for (const p of this.plants) {
      for (const s of p.stems) {
        poseStem(s);
        s.bend = s.flex * this.wind * this.windAt(s.x[SEGMENTS], s.y[SEGMENTS], this.time);
        poseStem(s);
      }
    }
    this.spawnFrom = null;
    this.spawnPlan = spawn ? planSpawn(this.plants, W, H, seed, this.settings.spawn) : null;
    if (spawn) this.spawnFrom = this.time;
    // Insects and loose petals belong to the old bed.
    this.insects.reset();
    this.petals.reset();
  }

  /** Seconds since the plants started growing in, or null once they're all in. */
  get growing() {
    return this.spawnFrom === null ? null : this.time - this.spawnFrom;
  }

  /** Shows every plant fully grown now. */
  endSpawn() {
    this.spawnFrom = null;
    this.spawnPlan = null;
  }

  step(dt: number) {
    this.time += dt;
    const t = this.time;
    if (this.spawnFrom !== null && t - this.spawnFrom > this.spawnPlan!.end) this.endSpawn();
    const p = this.pointer;
    let vx = 0;
    let vy = 0;
    if (p.live) {
      // Smoothed over ~50 ms, since pointer events and steps don't line up one to one.
      const k = 1 - Math.exp(-dt / 0.05);
      p.vx += ((p.x - p.lastX) / dt - p.vx) * k;
      p.vy += ((p.y - p.lastY) / dt - p.vy) * k;
      p.lastX = p.x;
      p.lastY = p.y;
      vx = p.vx;
      vy = p.vy;
    }
    const brushing = vx * vx + vy * vy > 25;
    const { fade: fadeTime, rise: riseTime } = this.settings.cursor;
    const fade = Math.exp(-dt / fadeTime);
    const rise = 1 - Math.exp(-dt / riseTime);
    const { speed, damping, grassDamping } = this.settings.sway;
    for (const plant of this.plants) {
      for (const s of plant.stems) {
        if (brushing) this.brush(s, vx, vy, dt);
        s.gust *= fade;
        s.breeze += (s.gust - s.breeze) * rise;
        const target = s.flex * (this.wind * this.windAt(s.x[SEGMENTS], s.y[SEGMENTS], t) + s.breeze);
        const omega = s.omega * speed;
        // Grass blades are the only stems without a head.
        const zeta = s.head ? damping : grassDamping;
        s.bendVel += (omega * omega * (target - s.bend) - 2 * zeta * omega * s.bendVel) * dt;
        s.bend += s.bendVel * dt;
        // Heads trail the stem's motion and lean a little further with the wind.
        const nodTarget = 0.3 * s.bend - 0.25 * s.bendVel;
        s.nodVel += (48 * (nodTarget - s.nod) - 4 * s.nodVel) * dt;
        s.nod += s.nodVel * dt;
        poseStem(s);
      }
    }
    this.insects.step(dt);
    this.petals.step(dt);
  }

  /** Wind at (x, y) now, in `WindSettings` units, times `wind`. */
  windNow(x: number, y: number) {
    return this.wind * this.windAt(x, y, this.time);
  }

  /**
   * A click or tap at (x, y). An insect there that no nearer plant hides sends
   * up a heart. Otherwise the head showing there, else the one it's furthest
   * inside or nearest within `hand / 2`, nods and sheds a petal. Anywhere else,
   * tiny petals puff out.
   */
  tap(x: number, y: number) {
    if (this.growing !== null) return;
    this.cover.paint(this);
    const insect = this.settings.insects.heart.enabled ? this.insects.at(x, y, this.cover) : null;
    if (insect) return this.insects.love(insect);
    let hit: [Plant, Stem] | null = null;
    let best = this.hand * 0.5;
    for (const plant of this.plants) {
      for (const s of plant.stems) {
        if (!s.head) continue;
        const clear = clearOf(s, x, y);
        const score = clear <= 0 && this.cover.shows(x, y, plant.depth) ? clear - 1e6 : clear;
        if (score < best) {
          best = score;
          hit = [plant, s];
        }
      }
    }
    if (!hit) {
      if (this.settings.splash.enabled) this.petals.puff(x, y);
      return;
    }
    if (!this.settings.petals.enabled) return;
    const [plant, s] = hit;
    const { strength, limit } = this.settings.cursor;
    s.gust = limit * Math.tanh((s.gust + strength * this.catches(s) * TAP) / limit);
    this.petals.shed(plant, s, x, y);
  }

  /** The pointer moved to (x, y). Stems it passes through lean its way, then drift back. */
  movePointer(x: number, y: number) {
    const p = this.pointer;
    if (!p.live) Object.assign(p, { lastX: x, lastY: y, vx: 0, vy: 0, live: true });
    p.x = x;
    p.y = y;
  }

  /** Forgets the pointer, so its next position isn't read as a sweep across the bed. */
  releasePointer() {
    this.pointer.live = false;
  }

  /** Adds wind to a stem the pointer passes through, its way and most near the head, and a little to stems further off. */
  private brush(s: Stem, vx: number, vy: number, dt: number) {
    const { x, y } = this.pointer;
    const hand = this.hand;
    const h = s.head;
    // Spikes and plumes carry florets along the top of the stem, so that stretch is wider to catch.
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
    // Only movement across the stem pushes it, by distance (`* dt`), so a flick is no rougher than a sweep.
    const a = s.angle[at];
    const across = (vx * Math.cos(a) + vy * Math.sin(a)) * dt;
    const { strength, limit } = this.settings.cursor;
    s.gust = limit * Math.tanh((s.gust + strength * this.catches(s) * grip * across) / limit);
  }

  /** Short stems barely sway in the wind, so they catch more of the pointer's to visibly respond. */
  private catches(s: Stem) {
    return Math.sqrt((this.bloom * 8) / (s.segment * SEGMENTS));
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
    const { species, tone } = this.settings;
    const sp = species[kind];
    const lean = this.rand() < this.settings.layout.curveUp ? -this.between(0.15, 0.5) : this.between(...sp.lean);
    const main = this.curved(rootX, rootY, headX, headY, lean);
    const length = main.segment * SEGMENTS;
    main.baseWidth = this.stemWidth * sp.stem * this.between(1.1, 1.5);
    main.tipWidth = this.stemWidth * sp.stem * 0.75;
    main.tone = lerp(tone.stems[0], tone.stems[1], depth);
    main.flex = this.between(0.08, 0.13) * sp.flex * clamp(length / 400, 0.6, 1.4);
    main.head = this.head(kind, depth, scale);
    this.droop(main);

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
      this.droop(branch);
      stems.push(branch);
    }
    this.plants.push({ depth, stems, spawn: null });
  }

  private head(kind: Kind, depth: number, scale: number): Head {
    const sp = this.settings.species[kind];
    const tone = this.settings.tone.flowers;
    const [wm, wd, ww] = sp.inks;
    const r = this.rand() * (wm + wd + ww);
    const ink: Ink = r < wm ? 0 : r < wm + wd ? 1 : 2;
    // Centres contrast with the petals: dark on main, main on dark (white on dark poppies), main or dark on white.
    let centre: Ink = ink === 0 ? 1 : ink === 1 ? (kind === "poppy" ? 2 : 0) : this.rand() < 0.6 ? 0 : 1;
    // Many daffodils have a trumpet the same colour as their petals.
    if (kind === "daffodil" && this.rand() < 0.35) centre = ink;
    let petals = 0;
    let style = 0;
    if (kind === "cosmos") petals = 7 + Math.floor(this.rand() * 3);
    else if (kind === "daisy") petals = 13 + Math.floor(this.rand() * 9);
    else if (kind === "lily" || kind === "turksCap" || kind === "daffodil" || kind === "iris") petals = 6;
    else if (kind === "poppy") petals = 4;
    else if (kind === "tulip") petals = 3;
    // Must match the petal count of paintGlobe's rings.
    else if (kind === "peony") petals = 28;
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
      turn: this.between(-1, 1) * sp.turn,
      ink,
      centre,
      blush: ink === 2 && this.rand() < 0.5,
      // Plumes print softer.
      tone: lerp(tone[0], tone[1], depth) * (kind === "plume" ? 0.7 : 1),
      jitter: Array.from({ length: Math.max(petals, 1) }, () => this.between(1 - sp.ragged, 1 + sp.ragged * 0.7)),
      drift: Array.from({ length: Math.max(petals, 1) }, () => this.between(-1, 1) * sp.drift),
      reach: kind === "plume" ? this.between(0.22, 0.35) : this.between(0.3, 0.5),
      style,
      lost: new Set(),
      leaving: new Map(),
    };
  }

  /** Hooks the top of a stem over for heads that nod or hang, so they face out or down. */
  private droop(s: Stem) {
    const kind = s.head?.kind;
    let hook = 0;
    if (kind === "turksCap") hook = this.between(2.3, 2.9);
    else if (kind === "daffodil") hook = this.between(1, 1.5);
    else if (kind === "peony") hook = this.between(0.15, 0.5);
    // Half of buds nod, hooked over like a poppy's.
    else if (kind === "bud" && this.rand() < 0.5) hook = this.between(1.6, 2.4);
    if (!hook) return;
    // 30% hook back against the wind.
    if (this.rand() < 0.3) hook = -hook;
    for (let k = SEGMENTS - 5; k < SEGMENTS; k++) s.rest[k] += hook * Math.pow((k - SEGMENTS + 6) / 5, 1.5);
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

/** How firmly a pointer `d` px from a stem presses on it: strongly within `hand`, plus a faint stir of air out to `3 * hand`. */
function pressure(d: number, hand: number) {
  const touch = d < hand ? (1 - Math.max(d, 0) / hand) ** 2 : 0;
  const air = d < hand * 3 ? 0.1 * (1 - Math.max(d, 0) / (hand * 3)) ** 2 : 0;
  return touch + air;
}

/** A mix as [kind, odds] pairs, leaving out the kinds it never grows. */
function odds(mix: Mix) {
  return (Object.entries(mix) as [Kind, number | undefined][]).filter((e): e is [Kind, number] => (e[1] ?? 0) > 0);
}
