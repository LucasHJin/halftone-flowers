import { clamp } from "../../utils/math";
import { DiamondHalftone, evenSizes, type HalftoneColors } from "../halftone";
import { Garden } from "./garden";
import { paintGarden } from "./paint";
import { resolveSettings, type FlowerSettings, type FlowerSettingsInput } from "./settings";
import { spawnScale } from "./spawn";

const STEP = 1 / 60;
const MAX_STEPS = 4;

/** Light pink page, pink-purple and plum inks, and white. */
export const DEFAULT_COLORS: HalftoneColors = {
  background: "#f8dbe7",
  ink: "#c13f92",
  dark: "#6d1f63",
  light: "#ffffff",
};

export interface FlowerFieldOptions {
  /** Diamond width in CSS px. Default scales with the width, from 5 to 10. */
  cell?: number;
  /** How many dot sizes to use, evenly spaced. Default 5. */
  steps?: number;
  /** Dot widths as a share of a full diamond, smallest first. Overrides `steps`. */
  sizes?: number[];
  colors?: Partial<HalftoneColors>;
  /** Multiplier on how far the wind bends the stems. Default 1. */
  wind?: number;
  /** Multiplier on the number of stems. Default 1. */
  density?: number;
  /** Fixes the arrangement. Without one, each mount grows a different bed. */
  seed?: number;
  /** Finer tuning of the layout, species, wind, sway, pointer and spawn. Anything left out keeps its default. */
  settings?: FlowerSettingsInput;
}

/**
 * Grows a garden on a canvas and keeps it swaying: fixed-timestep loop,
 * growing in on first show, re-layout on resize, pointer brushing, pausing
 * off-screen, and a still frame for prefers-reduced-motion. `update` takes
 * new options without growing in again.
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
    this.halftone = new DiamondHalftone(canvas, resolveColors(options.colors));
    this.halftone.sizes = dotSizes(options);
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
   * Colours, dots, wind, sway and the pointer change straight away. A new
   * seed, cell, density, layout, species, mix or tone lays the bed out again
   * where it stands. Spawn settings apply to the next engine.
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
    this.halftone.colors = resolveColors(options.colors);
    this.halftone.sizes = dotSizes(options);
    if (relayout) this.resize(true);
    else if (this.reducedMotion.matches) this.draw();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
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

function resolveColors(colors: Partial<HalftoneColors> | undefined) {
  const out = { ...DEFAULT_COLORS };
  for (const key of Object.keys(out) as (keyof HalftoneColors)[]) {
    const value = colors?.[key];
    if (value) out[key] = value;
  }
  return out;
}

function dotSizes({ sizes, steps }: FlowerFieldOptions) {
  return sizes?.length ? sizes : evenSizes(steps ?? 5);
}

/** The settings a garden is laid out from, as a string to compare. */
function bedKey({ layout, species, mix, tone }: FlowerSettings) {
  return JSON.stringify([layout, species, mix, tone]);
}
