import { lightnessOf, opposite, withLightness } from "../utils/color.js";
import { clamp } from "../utils/math.js";
import { DiamondHalftone, evenSizes, type DotShape, type Grid, type HalftoneColors } from "../halftone/index.js";
import { Garden } from "./garden.js";
import type { InsectKind } from "./insects/index.js";
import { paintGarden } from "./paint/index.js";
import { PointerInk } from "./pointerInk.js";
import { resolveSettings, type FlowerSettings, type FlowerSettingsInput } from "./settings.js";
import { spawnScale } from "./spawn.js";

const STEP = 1 / 60;
const MAX_STEPS = 4;

/** A field whose shorter side is under this many CSS px counts as a phone (Android's 600dp breakpoint). */
const PHONE = 600;

/** Near-white blue page, and a ramp from pale blue through blue to navy. */
export const DEFAULT_COLORS: HalftoneColors = {
  background: "#f5f8fd",
  light: "#a9c5ef",
  ink: "#3a6fd8",
  dark: "#16295f",
};

/** `dark` turns the colours' lightness over (see schemeColors). */
export type Scheme = "light" | "dark";

/** OKLCH lightness of the background on a dark page. */
const DARK_PAGE = 0.2;
/**
 * Extra lightness on a dark page for colours near the page's own, fading with distance from it.
 * The eye separates dark colours less well than light ones, so an even turnover sinks them into the page.
 */
const DARK_LIFT = 1.2;

export interface FlowerFieldOptions {
  /** Diamond width in CSS px. Default scales with the field's width from 5 to 10, at least 6 on a phone. */
  cell?: number;
  /** Number of evenly spaced dot sizes. Default 6. */
  steps?: number;
  /** Dot sizes, smallest first: each covers the area of a diamond this share of a full one wide. Overrides `steps`. */
  sizes?: number[];
  /** Background, and the ramp from `light` through `ink` to `dark` that dots are shaded from, as on a light page. Insects, trails and loose petals use this ramp at the opposite hue. Unset keys keep `DEFAULT_COLORS`. */
  colors?: Partial<HalftoneColors>;
  /** `light` or `dark` page; `dark` turns `colors` over (see schemeColors). Default light. */
  scheme?: Scheme;
  /** Number of shades the ramp is split into. Default 15. */
  shades?: number;
  /** How far ink spreads before it sets, as a share of diamond width: dots blur and are cut back sharp, so near ones run together. 0 keeps each dot's shape. Default 0.1. */
  spread?: number;
  /** Where spread ink is cut back, from 0 to 1: lower keeps more, so dots swell and merge more. Default 0.26. */
  threshold?: number;
  /** `round`, `square` with level sides, or `diamond` with sides curved in by `curve`. Each size prints the same tone in any shape; diamonds spread half as far, squares not at all. Default round. */
  dot?: DotShape;
  /** How far a diamond dot's sides curve in, from 0 straight to 1 a four-pointed star. Default 0.75. */
  curve?: number;
  /** `diagonal`: staggered rows like a print screen. `straight`: rows and columns. Same dot density either way. Default diagonal. */
  grid?: Grid;
  /** Multiplier on how far the wind bends the stems. Default 1. */
  wind?: number;
  /** Multiplier on the number of stems. Default 1. */
  density?: number;
  /** Fixes the arrangement. Unset, each mount grows a different bed. */
  seed?: number;
  /** Fine tuning; see `DEFAULT_SETTINGS`. Anything left out keeps its default. */
  settings?: FlowerSettingsInput;
}

/**
 * Runs a garden on a canvas on a fixed-timestep loop, paused off-screen. With prefers-reduced-motion
 * it draws still frames, without insects, loose petals or the pointer trail.
 */
export class FlowerEngine {
  private settings: FlowerSettings;
  private garden: Garden;
  private halftone: DiamondHalftone;
  private pointerInk: PointerInk;
  private seed: number;
  private raf = 0;
  private last = 0;
  private acc = 0;
  /** Set by a resize, which clears the canvas, so the next frame draws even without a step. */
  private stale = true;
  private visible = true;
  private disposed = false;
  private laidOut = "";
  private lastPointer = 0;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;

  constructor(private canvas: HTMLCanvasElement, private options: FlowerFieldOptions = {}) {
    this.seed = options.seed ?? (Math.random() * 2 ** 32) >>> 0;
    this.halftone = new DiamondHalftone(canvas, schemeColors(options.colors, options.scheme));
    this.halftone.accent = oppositeRamp(this.halftone.colors);
    this.setDots(options);
    this.settings = resolveSettings(options.settings);
    this.garden = new Garden(this.settings);
    this.garden.wind = options.wind ?? 1;
    this.pointerInk = new PointerInk(this.settings);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    // On the canvas, so clicks on anything laid over it don't count.
    canvas.addEventListener("pointerdown", this.onPointerDown);

    this.resize();
    this.schedule();
  }

  /**
   * Applies new options without growing in again. A new seed, cell, density, layout, species, mix
   * or tone re-lays the bed; spawn settings wait for the next engine; the rest apply at once.
   */
  update(options: FlowerFieldOptions) {
    const before = this.options;
    const settings = resolveSettings(options.settings);
    const seed = options.seed ?? this.seed;
    const relayout =
      seed !== this.seed ||
      options.cell !== before.cell ||
      (options.density ?? 1) !== (before.density ?? 1) ||
      bedKey(settings) !== bedKey(this.settings);
    // A grid change rebuilds the halftone lattice only; the bed stays.
    const regrid = (options.grid ?? "diagonal") !== (before.grid ?? "diagonal");
    this.options = options;
    this.seed = seed;
    this.settings = settings;
    this.garden.configure(settings);
    this.garden.wind = options.wind ?? 1;
    this.pointerInk.settings = settings;
    this.halftone.colors = schemeColors(options.colors, options.scheme);
    this.halftone.accent = oppositeRamp(this.halftone.colors);
    this.setDots(options);
    this.halftone.applyInk();
    if (relayout || regrid) this.resize(relayout);
    else if (this.reducedMotion.matches) this.draw();
  }

  /** Sends a butterfly or bee in now, or one picked by the insect settings' odds. Nothing comes while motion is reduced. */
  release(kind?: InsectKind) {
    if (!this.reducedMotion.matches) this.garden.insects.release(kind);
  }

  destroy() {
    this.disposed = true;
    this.halftone.destroy();
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
  }

  /** The spread reaches the canvas only on `applyInk` or a resize. */
  private setDots({ sizes, steps, shades, spread, threshold, dot, curve, grid }: FlowerFieldOptions) {
    this.halftone.dot = dot ?? "round";
    this.halftone.curve = curve ?? 0.75;
    this.halftone.grid = grid ?? "diagonal";
    this.halftone.sizes = sizes?.length ? sizes : evenSizes(steps ?? 6);
    this.halftone.shades = shades ?? 15;
    this.halftone.spread = spread ?? 0.1;
    this.halftone.threshold = threshold ?? 0.26;
  }

  private draw() {
    const { garden, halftone } = this;
    const scene = halftone.beginScene();
    paintGarden(scene, garden);
    this.pointerInk.paintTrail(scene, garden.time);
    const growing = garden.growing;
    if (growing === null) return halftone.present();
    paintGarden(halftone.beginReveal(), garden, true);
    halftone.present(spawnScale(garden.spawnPlan!, growing, garden.height));
  }

  private resize(relayout = false) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cell = this.options.cell ?? autoCell(rect.width, rect.height);
    this.halftone.cell = cell;
    this.halftone.resize(rect.width, rect.height, dpr);
    this.stale = true;
    const key = `${rect.width}x${rect.height}`;
    if (relayout || key !== this.laidOut) {
      // Only the first layout grows in.
      const spawn = !this.laidOut && !this.reducedMotion.matches && this.settings.spawn.enabled;
      this.laidOut = key;
      this.garden.layout({ width: rect.width, height: rect.height, cell, seed: this.seed, density: this.options.density ?? 1, spawn });
    }
    // Resizing clears the canvas, and with reduced motion no loop redraws it.
    if (this.reducedMotion.matches) this.draw();
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.garden.step(STEP);
      this.pointerInk.step(STEP, this.garden.time);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    // The bed only moves on a step; on screens above 60 Hz, frames without one would redraw the same picture.
    if (steps || this.stale) {
      this.stale = false;
      this.draw();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.garden.endSpawn();
      this.garden.insects.reset();
      this.garden.petals.reset();
      this.pointerInk.reset();
      this.draw();
    } else {
      this.schedule();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // After a pause or a lifted touch, the pointer may come back anywhere.
    const fresh = e.timeStamp - this.lastPointer > 150;
    if (fresh) this.garden.releasePointer();
    this.lastPointer = e.timeStamp;
    this.garden.movePointer(x, y);
    if (!this.reducedMotion.matches) this.pointerInk.move(x, y, fresh);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0 || this.reducedMotion.matches) return;
    const rect = this.canvas.getBoundingClientRect();
    this.garden.tap(e.clientX - rect.left, e.clientY - rect.top);
  };
}

/**
 * `colors` over the defaults. For `dark`, each keeps its hue and chroma and turns over in OKLCH
 * lightness: the background goes dark and each ramp colour sits about as far above it as it sat
 * below, those nearest the page lifted more (see DARK_LIFT), so dark flowers still stand out most.
 */
export function schemeColors(colors?: Partial<HalftoneColors>, scheme: Scheme = "light"): HalftoneColors {
  const out = { ...DEFAULT_COLORS };
  for (const key of Object.keys(out) as (keyof HalftoneColors)[]) {
    const value = colors?.[key];
    if (value) out[key] = value;
  }
  if (scheme === "light") return out;
  const page = lightnessOf(out.background);
  const span = 1 - DARK_PAGE;
  const flip = (colour: string) => {
    // Distance below the page, as a share of the room above a dark one.
    const t = Math.min(1, Math.max(0, (page - lightnessOf(colour)) / span));
    return withLightness(colour, DARK_PAGE + span * (t + DARK_LIFT * t * (1 - t) ** 4));
  };
  return { background: flip(out.background), light: flip(out.light), ink: flip(out.ink), dark: flip(out.dark) };
}

/** Wider fields get bigger diamonds. Phones start a size up, as their CSS px are physically smaller. */
function autoCell(width: number, height: number) {
  const least = Math.min(width, height) < PHONE ? 6 : 5;
  return Math.round(clamp(width / 170, least, 10));
}

function oppositeRamp({ light, ink, dark }: HalftoneColors) {
  return { light: opposite(light), ink: opposite(ink), dark: opposite(dark) };
}

/** The settings the bed is laid out from, as a string to compare. */
function bedKey({ layout, species, mix, tone }: FlowerSettings) {
  return JSON.stringify([layout, species, mix, tone]);
}
