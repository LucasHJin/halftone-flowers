/**
 * Everything about how the bed is laid out, sways, answers the pointer, grows
 * in, is visited by insects and sheds petals, with the values it ships with. FlowerField takes any part of this
 * as `settings` and fills in the rest from DEFAULT_SETTINGS.
 */
import { mergeDeep, type DeepPartial } from "../../utils/merge";
import { BOUQUET_MIX, MEADOW_MIX, SPECIES, type Species } from "./species";
import type { Kind } from "./types";

export interface LayoutSettings {
  /** Base flower size: `share` of the shorter side, kept within `min` and `max` px. Head sizes are multiples of it. */
  flowerSize: { share: number; min: number; max: number };
  /** Tall stems: one per `spacing` px of width, kept within `min` and `max`, then times `density`. */
  stems: { spacing: number; min: number; max: number };
  bouquet: {
    /** How far heads reach from the bottom-left corner, as shares of the width and height. */
    reach: [number, number];
    /** How close to the corner heads can land, as a share of `reach`. */
    inner: number;
    /** How far right of the corner roots spread, as a share of the width. */
    roots: number;
  };
  meadow: {
    /** Short stems per tall stem. */
    amount: number;
    /** How many more stems, more varied in height, grow toward its right end, where it's shorter and smaller: none extra 30% of the way along, rising to this many times as many again at the end. */
    thicken: number;
    /** Where it starts and ends across the width, as shares of it. */
    span: [number, number];
    /** How tall it grows at its left and right ends, as shares of the height. */
    height: [number, number];
    /** How far right of its root each head sits, as a share of its height, picked from this range. Negative leans back against the wind. */
    slant: [number, number];
    /** How far each stem, and each tuft of grass along the bottom, strays from evenly spaced: 0 none, 1 anywhere in its own share of the span, 2 into its neighbours'. */
    scatter: number;
  };
  grass: {
    /** Blades arching out of the corner, per tall stem. */
    corner: number;
    /** Blades in tufts along the bottom, per tall stem. */
    bottom: number;
  };
  /** Share of stems and blades that set off leaning out and curve up toward the tip, instead of rising and arching over. */
  curveUp: number;
}

/** Odds of each kind; leave a kind out or give it 0 to never grow it. */
export type Mix = Partial<Record<Kind, number>>;

/** How strongly each part prints, from the back of the bed to the front, so nearer things read darker. */
export interface ToneSettings {
  flowers: [number, number];
  stems: [number, number];
  grass: [number, number];
}

/** How each plant's colours move along the ramp from light to dark, so plants that overlap print in different shades. */
export interface ShadeSettings {
  /** How much lighter the back of the bed prints than the front, as a share of the ramp. */
  depth: number;
  /** How far each plant strays from that at random, either way, as a share of the ramp. */
  jitter: number;
  /** How much lighter the side of each flower head facing the light, from the upper left, prints than the side facing away, as a share of the ramp. */
  light: number;
}

/** One wave of wind rolling across the bed from the left. */
export interface WindWave {
  /** How hard it blows at its crest, in the same units as `lean`. */
  strength: number;
  /** Seconds between crests passing any one spot. */
  period: number;
  /** Px between crests across the screen. */
  length: number;
  /** Px between crests down the screen, for a wave that also varies with height. */
  height?: number;
  /** Where in its cycle it starts, radians. */
  phase?: number;
}

export interface WindSettings {
  /** Steady push to the right, so the bed leans with the wind; 0 sways evenly both ways. */
  lean: number;
  /** Added together on top of `lean`. */
  waves: WindWave[];
}

export interface SwaySettings {
  /** Multiplier on how quickly stems swing; long stems always swing slower than short ones. */
  speed: number;
  /** How soon a flower stem stops swinging past where the wind holds it: lower wobbles more, 1 doesn't overshoot. */
  damping: number;
  /** The same for grass. */
  grassDamping: number;
}

export interface CursorSettings {
  /** Wind added per px the pointer moves across a stem it's touching. 0 turns the pointer off. */
  strength: number;
  /** The most wind the pointer can add to one stem; the default wind peaks at about 1. */
  limit: number;
  /** Seconds for a push to build up around a stem. */
  rise: number;
  /** Seconds for a push to fade to about a third. */
  fade: number;
  /** How far from a stem or head the pointer touches it, as a share of the base flower size. */
  reach: number;
}

export interface SpawnSettings {
  /** Grow the bed in when it first appears, instead of showing it all at once. */
  enabled: boolean;
  /** Seconds from the first plant starting to the last one fully in. */
  duration: number;
  /** Seconds for one diamond to grow into its dot. */
  grow: number;
  /** Seconds for the growing front to climb a whole plant, picked per plant from this range. */
  climb: [number, number];
  /** The most a diamond lags behind the front, so the front doesn't fill in row by row. */
  scatter: number;
  /** How closely the order follows a wave out from the corner, 0 to 1; the rest is random. */
  order: number;
}

export interface TrailSettings {
  /** Seconds a trail takes to fade away; 0 leaves none. */
  fade: number;
  /** Line width in px. The halftone prints it as a chain of dots, bigger and closer the wider and stronger it is. */
  width: number;
  /** How strongly its newest part prints, from 0 to 1. */
  strength: number;
}

/** Butterflies and bees that now and then fly in, visit a few flowers and leave. */
export interface InsectSettings {
  enabled: boolean;
  /** Average seconds between one arriving and the next. */
  every: number;
  /** The most in the bed at once. */
  most: number;
  /** Relative odds of a butterfly and a bee each time one comes. */
  odds: [number, number];
  /** Multiplier on their size, which follows the base flower size. */
  size: number;
  /** Multiplier on how fast they fly and beat their wings. */
  speed: number;
  /** Fewest and most flowers one visits before leaving; 0 passes straight through. */
  visits: [number, number];
  /** Shortest and longest stay on each flower, seconds. */
  stay: [number, number];
  trail: TrailSettings;
}

/** Petals that come loose when a flower is clicked or tapped, and drift away to the left or right. */
export interface PetalSettings {
  enabled: boolean;
  /** Fewest and most that come loose with each click. */
  count: [number, number];
  /** Multiplier on their size, which follows their flower's. */
  size: number;
  /** Multiplier on how fast the wind carries them. */
  speed: number;
  /** Share that sink toward the ground rather than sail off far to one side. */
  sink: number;
  /** How many times a minute each loops the loop, on average; more often in a gust. */
  loops: number;
}

export interface FlowerSettings {
  layout: LayoutSettings;
  species: Record<Kind, Species>;
  mix: { bouquet: Mix; meadow: Mix };
  tone: ToneSettings;
  shade: ShadeSettings;
  wind: WindSettings;
  sway: SwaySettings;
  cursor: CursorSettings;
  spawn: SpawnSettings;
  insects: InsectSettings;
  petals: PetalSettings;
}

/** Any part of FlowerSettings. Arrays and ranges replace the default whole. */
export type FlowerSettingsInput = DeepPartial<FlowerSettings>;

export const DEFAULT_SETTINGS: FlowerSettings = {
  layout: {
    flowerSize: { share: 0.055, min: 24, max: 68 },
    stems: { spacing: 62, min: 10, max: 26 },
    bouquet: { reach: [0.62, 0.74], inner: 0.42, roots: 0.3 },
    meadow: { amount: 0.8, thicken: 1, span: [0.14, 0.92], height: [0.27, 0.08], slant: [-0.25, 0.95], scatter: 0.8 },
    grass: { corner: 0.7, bottom: 0.9 },
    curveUp: 0.35,
  },
  species: SPECIES,
  mix: { bouquet: BOUQUET_MIX, meadow: MEADOW_MIX },
  tone: { flowers: [0.6, 1], stems: [0.55, 0.85], grass: [0.4, 0.7] },
  shade: { depth: 0.19, jitter: 0.09, light: 0.3 },
  wind: {
    lean: 0.3,
    waves: [
      { strength: 0.42, period: 12.57, length: 1963 },
      { strength: 0.2, period: 5.56, length: 1030, phase: 1.7 },
      { strength: 0.08, period: 2.42, length: 524, height: 1257 },
    ],
  },
  sway: { speed: 1, damping: 0.17, grassDamping: 0.1 },
  cursor: { strength: 0.055, limit: 3.5, rise: 0.5, fade: 2, reach: 0.55 },
  spawn: { enabled: true, duration: 1.5, grow: 0.5, climb: [0.25, 0.45], scatter: 0.1, order: 0.6 },
  insects: {
    enabled: true,
    every: 18,
    most: 3,
    odds: [1, 1],
    size: 1,
    speed: 1,
    visits: [0, 3],
    stay: [1.5, 5],
    trail: { fade: 2.5, width: 3.5, strength: 0.9 },
  },
  petals: { enabled: true, count: [1, 3], size: 1, speed: 1, sink: 0.4, loops: 8 },
};

export function resolveSettings(input?: FlowerSettingsInput): FlowerSettings {
  return mergeDeep(DEFAULT_SETTINGS, input);
}
