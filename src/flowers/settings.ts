/**
 * Settings for the flower field and their defaults. `FlowerField` takes any part
 * of `FlowerSettings` as `settings` and fills in the rest from `DEFAULT_SETTINGS`.
 */
import { mergeDeep, type DeepPartial } from "../utils/merge.js";
import { BOUQUET_MIX, MEADOW_MIX, SPECIES, type Species } from "./species.js";
import type { Kind } from "./types.js";

export interface LayoutSettings {
  /** Base flower size: `share` of the shorter side, kept within `min` and `max` px. Head sizes are multiples of it. */
  flowerSize: { share: number; min: number; max: number };
  /** Tall stems: one per `spacing` px of width, kept within `min` and `max`, times `density`. */
  stems: { spacing: number; min: number; max: number };
  bouquet: {
    /** Furthest heads reach from the bottom-left corner, as shares of the width and height. */
    reach: [number, number];
    /** Closest a head lands to the corner, as a share of `reach`. */
    inner: number;
    /** How far right of the corner roots spread, as a share of the width. */
    roots: number;
  };
  meadow: {
    /** Short stems per tall stem. */
    amount: number;
    /** Extra stems, more varied in height, toward its short right end: none 30% of the way along, rising to this many times its own density at the end. 0 adds none. */
    thicken: number;
    /** Where it starts and ends across the width, as shares of it. */
    span: [number, number];
    /** How tall it grows at its left and right ends, as shares of the height. */
    height: [number, number];
    /** How far right of its root each head sits, as a share of its height, picked from this range. Negative leans back against the wind. */
    slant: [number, number];
    /** How far each stem, and each grass tuft along the bottom, strays from even spacing: 0 none, 1 anywhere in its own share of the span, 2 into its neighbours'. */
    scatter: number;
  };
  grass: {
    /** Blades arching out of the corner, per tall stem. */
    corner: number;
    /** Blades in tufts along the bottom, per tall stem. */
    bottom: number;
  };
  /** Share of stems and blades that set off leaning out and curve up toward the tip; the rest rise and arch over. */
  curveUp: number;
}

/** Relative odds of each kind; leave a kind out or set it to 0 to never grow it. */
export type Mix = Partial<Record<Kind, number>>;

/** How strongly each part prints at the back and the front of the field, so nearer things read darker. */
export interface ToneSettings {
  flowers: [number, number];
  stems: [number, number];
  grass: [number, number];
}

/** How each plant's colours shift along the light-to-dark ramp, so overlapping plants print in different shades. */
export interface ShadeSettings {
  /** How much lighter the back of the field prints than the front, as a share of the ramp. */
  depth: number;
  /** Most each plant strays from that at random, either way, as a share of the ramp. */
  jitter: number;
  /** How much lighter a flower head's side facing the light (upper left) prints than the side facing away, as a share of the ramp. */
  light: number;
}

/** One wave of wind rolling across the field from the left. */
export interface WindWave {
  /** How hard it blows at its crest, in the same units as `lean`. */
  strength: number;
  /** Seconds between crests passing any one spot. */
  period: number;
  /** Px between crests across the screen. */
  length: number;
  /** Px between crests down the screen. Omitted, the wave is the same at every height. */
  height?: number;
  /** Where in its cycle it starts, radians; default 0. */
  phase?: number;
}

export interface WindSettings {
  /** Steady push to the right (negative: left), so the field leans with the wind; 0 sways evenly both ways. */
  lean: number;
  /** Summed on top of `lean`. */
  waves: WindWave[];
}

export interface SwaySettings {
  /** Multiplier on how fast stems swing; long stems always swing slower than short ones. */
  speed: number;
  /** Damping ratio of flower stems: lower wobbles more past where the wind holds them, 1 doesn't overshoot. */
  damping: number;
  /** `damping` for grass. */
  grassDamping: number;
}

export interface CursorSettings {
  /** Wind added per px the pointer moves across a stem it's touching. 0: the pointer doesn't push stems. */
  strength: number;
  /** Most wind the pointer can add to one stem; the default wind peaks at about 1. */
  limit: number;
  /** Seconds for a push to build to about two thirds on a stem. */
  rise: number;
  /** Seconds for a push to fade to about a third. */
  fade: number;
  /** How far from a stem or head the pointer touches it, as a share of the base flower size. */
  reach: number;
}

export interface SpawnSettings {
  /** Grow the field in when it first appears; false shows it all at once. */
  enabled: boolean;
  /** Seconds from the first plant starting to the last one fully in. */
  duration: number;
  /** Seconds for one diamond to grow into its dot. */
  grow: number;
  /** Seconds for the growing front to climb a whole plant, picked per plant from this range. */
  climb: [number, number];
  /** Most seconds a diamond lags behind the front, so the front doesn't fill in row by row. */
  scatter: number;
  /** How closely the order follows a wave out from the corner, 0 to 1; the rest is random. */
  order: number;
}

export interface TrailSettings {
  /** Seconds a trail takes to fade away; 0 leaves none. */
  fade: number;
  /** Line width, px. Printed as a chain of dots, bigger and closer the wider and stronger it is. */
  width: number;
  /** How strongly its newest part prints, 0 to 1. */
  strength: number;
}

/**
 * The heart a clicked or tapped butterfly or bee sends up: a line in its trail's
 * width and strength that rises out of it, draws a heart, then swells and fades.
 */
export interface HeartSettings {
  enabled: boolean;
  /** Smallest and biggest across, in base flower sizes. */
  size: [number, number];
  /** Shortest and longest seconds for the line to rise out of the insect and draw the heart. */
  draw: [number, number];
  /** Least and most it then swells, as a share of its size. */
  swell: [number, number];
  /** Shortest and longest seconds to swell and fade away. */
  fade: [number, number];
}

/** Butterflies and bees that now and then fly in, visit a few flowers and leave. */
export interface InsectSettings {
  enabled: boolean;
  /** Average seconds between one arriving and the next. */
  every: number;
  /** Most in the field at once. */
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
  heart: HeartSettings;
}

/** Petals that come loose, one per click or tap on a flower, and drift away left or right. */
export interface PetalSettings {
  enabled: boolean;
  /** Multiplier on their size, which follows their flower's. */
  size: number;
  /** Multiplier on how fast the wind carries them. */
  speed: number;
  /** Share that sink toward the ground; the rest sail off far to one side. */
  sink: number;
  /** Times a minute each loops the loop, on average; more often in a gust. */
  loops: number;
  /** Shortest and longest seconds each keeps its flower's colours once loose, before turning the pointer trail's. */
  wait: [number, number];
  /** Shortest and longest seconds each then takes to turn the pointer trail's colours, spreading from where it was clicked. */
  turn: [number, number];
}

/**
 * The pointer's trail: a few strands, each printed like the insects' trails,
 * weaving round a smoothed path behind it. `fade` starts once `hold` is up, and
 * 0 cuts each part off there. `width` and `strength` are per strand.
 */
export interface PointerTrailSettings extends TrailSettings {
  enabled: boolean;
  /** Seconds each part stays at full strength before it starts to fade. */
  hold: number;
  /** Number of strands, rounded, at least 1. */
  strands: number;
  /** Px each strand strays either side of the path, once they've spread apart. */
  spread: number;
  /** Px along the path between a strand's crests, give or take. */
  wave: number;
  /** Radians a second the waves run along the strands, give or take, some each way. */
  flow: number;
  /** Seconds the trail's head lags behind the pointer; longer rounds its turns off more. */
  lag: number;
}

/**
 * Tiny petals that puff out from a click or tap that misses the flowers: copies
 * of petals from a few flowers in the field, in the pointer trail's colours. They
 * then drift away like shed petals, with `petals`' `speed`, `sink` and `loops`.
 */
export interface SplashSettings {
  enabled: boolean;
  /** Fewest and most petals a click puffs out. */
  count: [number, number];
  /** Shortest and longest, in base flower sizes, whatever flower they copy. */
  size: [number, number];
  /** Least and most each flies out before the wind takes it, in base flower sizes. */
  reach: [number, number];
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
  trail: PointerTrailSettings;
  splash: SplashSettings;
}

/** Any part of `FlowerSettings`. Arrays, ranges included, replace the default whole. */
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
    heart: { enabled: true, size: [1, 1.5], draw: [0.65, 0.9], swell: [0.2, 0.35], fade: [0.6, 0.8] },
  },
  petals: { enabled: true, size: 1, speed: 1, sink: 0.4, loops: 8, wait: [0.1, 0.2], turn: [1, 1.4] },
  trail: { enabled: true, hold: 0.4, fade: 0.4, width: 3.5, strength: 0.9, strands: 3, spread: 14, wave: 150, flow: 3, lag: 0.02 },
  splash: { enabled: true, count: [8, 14], size: [0.55, 0.9], reach: [0.8, 2] },
};

export function resolveSettings(input?: FlowerSettingsInput): FlowerSettings {
  return mergeDeep(DEFAULT_SETTINGS, input);
}
