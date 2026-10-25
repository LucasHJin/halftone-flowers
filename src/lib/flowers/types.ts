/** 0 is the main pink-purple ink, 1 the dark one, 2 white. */
export type Ink = 0 | 1 | 2;

export type Kind = "cosmos" | "daisy" | "lily" | "poppy" | "tulip" | "rose" | "bud" | "spike" | "plume" | "cluster";

export type LeafShape = "lance" | "strap" | "oval";

export interface Head {
  kind: Kind;
  /** Petal length for open flowers; floret size for spikes; spread for clusters. */
  radius: number;
  /** Petals, florets or pedicels, depending on the kind. */
  petals: number;
  /** How open the face looks: 1 faces you, near 0 is side-on. */
  face: number;
  /** Rotation of the petal ring. */
  spin: number;
  ink: Ink;
  /** Ink of the flower's centre, or the blush at a white petal's base. */
  centre: Ink;
  /** White petals that blush toward `centre` at the base. */
  blush: boolean;
  tone: number;
  /** Per-petal length variation, one per petal. */
  jitter: number[];
  /** Spikes and plumes: the share of the stem they cover. */
  reach: number;
  /** Spikes: 0 lupine, 1 foxglove, 2 lavender. Clusters: 1 forks the pedicels. */
  style: number;
}

export interface Leaf {
  shape: LeafShape;
  /** Joint along the stem it grows from. */
  at: number;
  /** -1 grows to the stem's left, 1 to its right. */
  side: number;
  /** Angle away from the stem, radians. */
  spread: number;
  length: number;
  width: number;
  phase: number;
}

export interface Stem {
  id: number;
  rootX: number;
  rootY: number;
  segment: number;
  /** Rest direction of each segment, radians clockwise from straight up. */
  rest: Float32Array;
  /** Current direction of each segment, and the joints it produces (one more than segments). */
  angle: Float32Array;
  x: Float32Array;
  y: Float32Array;
  baseWidth: number;
  tipWidth: number;
  ink: Ink;
  tone: number;
  /** Tip bend per unit of wind, radians. */
  flex: number;
  omega: number;
  damping: number;
  bend: number;
  bendVel: number;
  /** Extra wind the pointer stirred up brushing past, fading over a few seconds. */
  gust: number;
  /** How much of that gust has reached the stem so far. */
  breeze: number;
  /** Extra tilt of the flower head, lagging the stem. */
  nod: number;
  nodVel: number;
  parent: Stem | null;
  attach: number;
  head: Head | null;
  leaves: Leaf[];
}

export interface Plant {
  /** 0 is furthest back, 1 nearest. */
  depth: number;
  /** The main stem first, then its branches. */
  stems: Stem[];
  /** How it grows in when the bed first appears, or null if it was there from the start. */
  spawn: Spawn | null;
}

/** A front of growth climbing a plant from the ground up, at a steady pace. */
export interface Spawn {
  /** Seconds after the bed starts growing in that the front crosses the bottom of the screen. */
  bottom: number;
  /** Seconds the front takes to climb one px. */
  pace: number;
}
