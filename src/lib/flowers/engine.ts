import { lightnessOf, opposite, withLightness } from "../../utils/color";
import { clamp } from "../../utils/math";
import { DiamondHalftone, evenSizes, type HalftoneColors } from "../halftone";
import { Garden } from "./garden";
import type { InsectKind } from "./insects";
import { paintGarden } from "./paint";
import { resolveSettings, type FlowerSettings, type FlowerSettingsInput } from "./settings";
import { spawnScale } from "./spawn";

const STEP = 1 / 60;
const MAX_STEPS = 4;

/** Near-white blue page, and a ramp from pale blue through blue to navy. */
export const DEFAULT_COLORS: HalftoneColors = {
  background: "#f5f8fd",
  light: "#a9c5ef",
  ink: "#3a6fd8",
  dark: "#16295f",
};

/** A light page, or a dark one with the colours' lightness turned over (see schemeColors). */
export type Scheme = "light" | "dark";

/** OKLCH lightness of the background on a dark page. */
const DARK_PAGE = 0.2;
/**
 * Extra lift on a dark page for colours that sat close to the light one. The
 * eye tells dark colours apart less well than light ones, so an even turnover
 * sinks them into the page. The lift fades out further from the page.
 */
const DARK_LIFT = 1.2;

export interface FlowerFieldOptions {
  /** Diamond width in CSS px. Default scales with the width, from 5 to 10. */
  cell?: number;
  /** How many dot sizes to use, evenly spaced. Default 6. */
  steps?: number;
  /** Dot sizes as a share of a full diamond, by area, smallest first. Overrides `steps`. */
  sizes?: number[];
  /** Background, and the colour ramp from `light` through `ink` to `dark` that every dot takes a shade of, for a light page. Insects print in the same ramp turned to the opposite hue. */
  colors?: Partial<HalftoneColors>;
  /** Light or dark page. Dark turns `colors` over (see schemeColors). Default light. */
  scheme?: Scheme;
  /** How many shades the colour ramp is split into. Default 15. */
  shades?: number;
  /** How far ink spreads before it sets, as a share of a diamond's width: dots blur and are cut back sharp, so near ones run together. Default 0.1; 0 keeps every dot round. */
  spread?: number;
  /** Where spread ink is cut back, from 0 to 1: lower keeps more of it, so dots swell and merge more. Default 0.26. */
  threshold?: number;
  /** Multiplier on how far the wind bends the stems. Default 1. */
  wind?: number;
  /** Multiplier on the number of stems. Default 1. */
  density?: number;
  /** Fixes the arrangement. Without one, each mount grows a different bed. */
  seed?: number;
  /** Finer tuning of the layout, species, shade, wind, sway, pointer, spawn and insects. Anything left out keeps its default. */
  settings?: FlowerSettingsInput;
}

/**
 * Grows a garden on a canvas and keeps it swaying: fixed-timestep loop,
 * growing in on first show, re-layout on resize, pointer brushing, insects
 * visiting, pausing off-screen, and a still frame without insects for
 * prefers-reduced-motion. `update` takes new options without growing in again.
 */
export class FlowerEngine {
  private settings: FlowerSettings;
  private garden: Garden;
  private halftone: DiamondHalftone;
  private seed: number;
  private raf = 0;
  private last = 0;
  private acc = 0;
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

    this.resize();
    this.schedule();
  }

  /**
   * Colours, dots, ink, shade, wind, sway and the pointer change straight
   * away. A new seed, cell, density, layout, species, mix or tone lays the bed
   * out again where it stands. Spawn settings apply to the next engine.
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
    this.options = options;
    this.seed = seed;
    this.settings = settings;
    this.garden.configure(settings);
    this.garden.wind = options.wind ?? 1;
    this.halftone.colors = schemeColors(options.colors, options.scheme);
    this.halftone.accent = oppositeRamp(this.halftone.colors);
    this.setDots(options);
    this.halftone.applyInk();
    if (relayout) this.resize(true);
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
  }

  /** Dot sizes, shades and ink spread from the options. `applyInk` or a resize puts the spread on the canvas. */
  private setDots({ sizes, steps, shades, spread, threshold }: FlowerFieldOptions) {
    this.halftone.sizes = sizes?.length ? sizes : evenSizes(steps ?? 6);
    this.halftone.shades = shades ?? 15;
    this.halftone.spread = spread ?? 0.1;
    this.halftone.threshold = threshold ?? 0.26;
  }

  private draw() {
    const { garden, halftone } = this;
    paintGarden(halftone.beginScene(), garden);
    const growing = garden.growing;
    if (growing === null) return halftone.present();
    paintGarden(halftone.beginReveal(), garden, true);
    halftone.present(spawnScale(garden.spawnPlan!, growing, garden.height));
  }

  private resize(relayout = false) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cell = this.options.cell ?? Math.round(clamp(rect.width / 170, 5, 10));
    this.halftone.cell = cell;
    this.halftone.resize(rect.width, rect.height, dpr);
    const key = `${rect.width}x${rect.height}`;
    if (relayout || key !== this.laidOut) {
      // Only the first layout grows in; after a resize the bed is just there.
      const spawn = !this.laidOut && !this.reducedMotion.matches && this.settings.spawn.enabled;
      this.laidOut = key;
      this.garden.layout({ width: rect.width, height: rect.height, cell, seed: this.seed, density: this.options.density ?? 1, spawn });
    }
    // Resizing clears the canvas; without the animation loop, nothing else would redraw it.
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
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.garden.endSpawn();
      this.garden.insects.reset();
      this.draw();
    } else {
      this.schedule();
    }
  };

  /** Moving the pointer through the stems pushes them aside. */
  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    // After a pause, or a touch lifting, the pointer may come back anywhere.
    if (e.timeStamp - this.lastPointer > 150) this.garden.releasePointer();
    this.lastPointer = e.timeStamp;
    this.garden.movePointer(e.clientX - rect.left, e.clientY - rect.top);
  };
}

/**
 * The colours a field prints in: `colors` over the defaults, as they are for a
 * light page. For a dark one, each keeps its hue and vividness and is turned
 * over in OKLCH lightness: the background goes dark, and each ramp colour sits
 * about as far from it as before, now on the light side, with those nearest
 * the page lifted a little more (see DARK_LIFT). So pale flowers still sit
 * close to the page and dark ones still stand out most.
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
    // How far from the page it is, as a share of the room above a dark one.
    const t = Math.min(1, Math.max(0, (page - lightnessOf(colour)) / span));
    return withLightness(colour, DARK_PAGE + span * (t + DARK_LIFT * t * (1 - t) ** 4));
  };
  return { background: flip(out.background), light: flip(out.light), ink: flip(out.ink), dark: flip(out.dark) };
}

function oppositeRamp({ light, ink, dark }: HalftoneColors) {
  return { light: opposite(light), ink: opposite(ink), dark: opposite(dark) };
}

/** The settings a garden is laid out from, as a string to compare. */
function bedKey({ layout, species, mix, tone }: FlowerSettings) {
  return JSON.stringify([layout, species, mix, tone]);
}
