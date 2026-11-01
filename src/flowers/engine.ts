import { lightnessOf, opposite, withLightness } from "../utils/color.js";
import { clamp } from "../utils/math.js";
import { DiamondHalftone, evenSizes, type DotShape, type Grid, type HalftoneColors } from "../halftone/index.js";
import { FieldEmitter } from "./events.js";
import { Field } from "./field.js";
import type { InsectKind } from "./insects/index.js";
import { paintField } from "./paint/index.js";
import { Mark, type PointerMark } from "./pointerMark.js";
import { resolveSettings, type FlowerSettings, type FlowerSettingsInput } from "./settings.js";
import { spawnScale } from "./spawn.js";

const STEP = 1 / 60;
const MAX_STEPS = 4;

/** Px/s below which the trail's head counts as stopped. */
const STILL = 2;

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
  /** Fixes the arrangement. Unset, each mount grows a different field. */
  seed?: number;
  /**
   * Prints the pointer into the field in place of the system cursor, at the trail's depth, so it
   * passes behind some flowers and in front of others. Only for a mouse or pen over the canvas itself,
   * and not with reduced motion. `true` prints a dot; a `PointerMark` can print your own cursor. Default off.
   */
  pointer?: boolean | PointerMark;
  /** Fine tuning; see `DEFAULT_SETTINGS`. Anything left out keeps its default. */
  settings?: FlowerSettingsInput;
}

/**
 * Runs a field on a canvas on a fixed-timestep loop, paused off-screen. With prefers-reduced-motion
 * it draws still frames, without insects, loose petals or the pointer trail and mark. Reports clicks and the
 * trail through `events`.
 */
export class FlowerEngine {
  private settings: FlowerSettings;
  private field: Field;
  private halftone: DiamondHalftone;
  /** Kept across option changes, so its image loads once. */
  private mark = new Mark();
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
  /** Where the pointer last was in the viewport, to place it again after a scroll. */
  private client: { x: number; y: number; type: string } | null = null;
  /** Where the pointer last was on the canvas. */
  private at = { x: NaN, y: NaN };
  /** The canvas's own `style.cursor`, while it's replaced with `none`; else null. */
  private ownCursor: string | null = null;
  /** Where the last `trail` event put the head, or null once one at speed 0 has gone out. */
  private trailAt: { x: number; y: number } | null = null;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: FlowerFieldOptions = {},
    private events = new FieldEmitter(),
  ) {
    this.seed = options.seed ?? (Math.random() * 2 ** 32) >>> 0;
    this.halftone = new DiamondHalftone(canvas, schemeColors(options.colors, options.scheme));
    this.halftone.accent = oppositeRamp(this.halftone.colors);
    this.setDots(options);
    this.settings = resolveSettings(options.settings);
    this.field = new Field(this.settings);
    this.field.wind = options.wind ?? 1;
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
    window.addEventListener("pointerout", this.onPointerOut, { passive: true });
    window.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    // On the canvas, so clicks on anything laid over it don't count.
    canvas.addEventListener("pointerdown", this.onPointerDown);

    this.setPointer(options.pointer);
    this.resize();
    this.schedule();
  }

  /**
   * Applies new options without growing in again. A new seed, cell, density, layout, species, mix
   * or tone re-lays the field; spawn settings wait for the next engine; the rest apply at once.
   */
  update(options: FlowerFieldOptions) {
    const before = this.options;
    const settings = resolveSettings(options.settings);
    const seed = options.seed ?? this.seed;
    const relayout =
      seed !== this.seed ||
      options.cell !== before.cell ||
      (options.density ?? 1) !== (before.density ?? 1) ||
      layoutKey(settings) !== layoutKey(this.settings);
    // A grid change rebuilds the halftone lattice only; the field stays.
    const regrid = (options.grid ?? "diagonal") !== (before.grid ?? "diagonal");
    this.options = options;
    this.seed = seed;
    this.settings = settings;
    this.field.configure(settings);
    this.field.wind = options.wind ?? 1;
    this.setPointer(options.pointer);
    this.halftone.colors = schemeColors(options.colors, options.scheme);
    this.halftone.accent = oppositeRamp(this.halftone.colors);
    this.setDots(options);
    this.halftone.applyInk();
    if (relayout || regrid) this.resize(relayout);
    else if (this.reducedMotion.matches) this.draw();
  }

  /** Sends a butterfly or bee in now, or one picked by the insect settings' odds. Nothing comes while motion is reduced. */
  release(kind?: InsectKind) {
    if (!this.reducedMotion.matches) this.field.insects.release(kind);
  }

  destroy() {
    this.disposed = true;
    this.stopTrail();
    this.showCursor(true);
    this.halftone.destroy();
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerout", this.onPointerOut);
    window.removeEventListener("scroll", this.onScroll, { capture: true });
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
  }

  private setPointer(pointer: FlowerFieldOptions["pointer"]) {
    if (pointer) this.mark.set(pointer === true ? {} : pointer);
    this.field.pointerInk.mark = pointer ? this.mark : null;
    this.showCursor(!pointer || this.reducedMotion.matches);
  }

  /** Puts back the canvas's own cursor, or hides it while the mark stands in for it. */
  private showCursor(show: boolean) {
    const style = this.canvas.style;
    if (show && this.ownCursor !== null) {
      style.cursor = this.ownCursor;
      this.ownCursor = null;
    } else if (!show && this.ownCursor === null) {
      this.ownCursor = style.cursor;
      style.cursor = "none";
    }
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
    const { field, halftone } = this;
    const scene = halftone.beginScene();
    paintField(scene, field);
    const growing = field.growing;
    if (growing === null) return halftone.present();
    paintField(halftone.beginReveal(), field, true);
    halftone.present(spawnScale(field.spawnPlan!, growing, field.height));
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
      this.field.layout({ width: rect.width, height: rect.height, cell, seed: this.seed, density: this.options.density ?? 1, spawn });
    }
    // Resizing clears the canvas, and with reduced motion no loop redraws it.
    if (this.reducedMotion.matches) this.draw();
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches) {
      this.stopTrail();
      return;
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.field.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    // The field only moves on a step; on screens above 60 Hz, frames without one would redraw the same picture.
    if (steps || this.stale) {
      this.stale = false;
      this.draw();
    }
    if (steps) this.emitTrail();
    this.raf = requestAnimationFrame(this.frame);
  };

  private emitTrail() {
    if (!this.events.has("trail")) return;
    const head = this.field.pointerInk.motion;
    if (!head || head.speed < STILL) return this.stopTrail();
    this.trailAt = head;
    this.events.emit({ type: "trail", ...head, width: this.field.width, height: this.field.height });
  }

  private stopTrail() {
    if (!this.trailAt) return;
    const { x, y } = this.trailAt;
    this.trailAt = null;
    this.events.emit({ type: "trail", x, y, speed: 0, width: this.field.width, height: this.field.height });
  }

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.stopTrail();
      this.field.endSpawn();
      this.field.insects.reset();
      this.field.petals.reset();
      this.field.pointerInk.reset();
      this.showCursor(true);
      this.draw();
    } else {
      this.showCursor(!this.options.pointer);
      this.schedule();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    this.client = { x: e.clientX, y: e.clientY, type: e.pointerType };
    // After a pause or a lifted touch, the pointer may come back anywhere.
    this.point(e.target, e.timeStamp - this.lastPointer > 150);
    this.lastPointer = e.timeStamp;
  };

  /** Hides the mark once the pointer leaves the window. */
  private onPointerOut = (e: PointerEvent) => {
    if (!e.relatedTarget) this.field.pointerInk.hovering = false;
  };

  /** A scroll can move the field under a still pointer, or move something else over it. */
  private onScroll = () => {
    const c = this.client;
    if (!c) return;
    const rect = this.canvas.getBoundingClientRect();
    // Unless the canvas stayed put, the pointer has jumped across it.
    const jumped = Math.abs(c.x - rect.left - this.at.x) > 0.5 || Math.abs(c.y - rect.top - this.at.y) > 0.5;
    if (jumped || this.field.pointerInk.mark) this.point(document.elementFromPoint(c.x, c.y), jumped);
  };

  /** The pointer is at `client` over `target`; `fresh` if it may have jumped there. */
  private point(target: EventTarget | null, fresh: boolean) {
    const c = this.client!;
    const rect = this.canvas.getBoundingClientRect();
    const x = c.x - rect.left;
    const y = c.y - rect.top;
    this.at = { x, y };
    if (fresh) this.field.releasePointer();
    this.field.movePointer(x, y);
    if (this.reducedMotion.matches) return;
    const ink = this.field.pointerInk;
    ink.move(x, y, fresh);
    ink.hovering = target === this.canvas && c.type !== "touch";
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0 || this.reducedMotion.matches) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tapped = this.field.tap(x, y);
    if (tapped) this.events.emit({ ...tapped, x, y, width: this.field.width, height: this.field.height });
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

/** The settings the field is laid out from, as a string to compare. */
function layoutKey({ layout, species, mix, tone }: FlowerSettings) {
  return JSON.stringify([layout, species, mix, tone]);
}
