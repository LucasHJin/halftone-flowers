import type { Kind, LeafShape } from "./types.js";

/** How one kind of flower looks. Each flower picks its own value from each range. */
export interface Species {
  /** Head size, as a multiple of the base flower size. */
  size: [number, number];
  /** Relative odds of main, dark and white petals. */
  inks: [number, number, number];
  /** Stem width multiplier. */
  stem: number;
  /** How far the wind bends it, as a multiplier. */
  flex: number;
  /** How far right of the root-to-head line the top of the stem leans, radians. */
  lean: [number, number];
  /** Fewest and most leaves on the main stem. */
  leaves: [number, number];
  leaf: LeafShape;
  /** How squarely the head faces you, from 0 side-on to 1 facing. */
  face: [number, number];
  /** How far a head can turn about its stem to one side or the other, radians. */
  turn: number;
  /** How far petals can stray from even spacing, as a share of the gap between them. */
  drift: number;
  /** How much petal lengths vary, as a share of the length. */
  ragged: number;
  /** Whether it can grow a side branch with a smaller head or a bud. */
  branches: boolean;
}

/** Default look of each kind. */
export const SPECIES: Record<Kind, Species> = {
  cosmos: { size: [0.8, 1.2], inks: [5, 2, 3], stem: 1, flex: 1, lean: [0.1, 0.45], leaves: [0, 2], leaf: "lance", face: [0.25, 1], turn: 0.35, drift: 0.12, ragged: 0.18, branches: true },
  daisy: { size: [0.5, 0.8], inks: [2, 0, 8], stem: 0.8, flex: 1.1, lean: [0.05, 0.35], leaves: [0, 1], leaf: "lance", face: [0.35, 1], turn: 0.35, drift: 0.2, ragged: 0.22, branches: true },
  lily: { size: [0.9, 1.2], inks: [4, 0, 6], stem: 1.2, flex: 0.8, lean: [0, 0.3], leaves: [1, 2], leaf: "strap", face: [0.2, 0.8], turn: 0.3, drift: 0.07, ragged: 0.14, branches: false },
  poppy: { size: [0.85, 1.15], inks: [7, 3, 0], stem: 0.85, flex: 1.1, lean: [0.1, 0.5], leaves: [0, 1], leaf: "lance", face: [0.3, 0.9], turn: 0.3, drift: 0, ragged: 0.12, branches: true },
  tulip: { size: [0.65, 0.9], inks: [5, 3, 2], stem: 1.4, flex: 0.7, lean: [-0.05, 0.2], leaves: [1, 2], leaf: "strap", face: [0.08, 0.45], turn: 0.25, drift: 0, ragged: 0.25, branches: false },
  rose: { size: [0.7, 0.95], inks: [5, 3, 2], stem: 1.2, flex: 0.8, lean: [0, 0.35], leaves: [1, 3], leaf: "oval", face: [0.3, 0.75], turn: 0.3, drift: 0, ragged: 0.12, branches: true },
  bud: { size: [0.5, 0.7], inks: [6, 2, 2], stem: 0.9, flex: 1, lean: [0.1, 0.4], leaves: [0, 1], leaf: "lance", face: [1, 1], turn: 0.4, drift: 0, ragged: 0.12, branches: false },
  spike: { size: [0.2, 0.3], inks: [5, 3, 2], stem: 1.2, flex: 0.8, lean: [-0.05, 0.25], leaves: [1, 2], leaf: "lance", face: [1, 1], turn: 0, drift: 0.3, ragged: 0.15, branches: false },
  plume: { size: [0.3, 0.45], inks: [1, 0, 0], stem: 0.7, flex: 1.6, lean: [0.25, 0.6], leaves: [0, 0], leaf: "lance", face: [1, 1], turn: 0, drift: 0, ragged: 0.12, branches: false },
  cluster: { size: [0.7, 1], inks: [6, 0, 4], stem: 0.7, flex: 1.2, lean: [0.05, 0.35], leaves: [0, 1], leaf: "lance", face: [1, 1], turn: 0, drift: 0, ragged: 0.12, branches: true },
  turksCap: { size: [0.9, 1.2], inks: [6, 3, 1], stem: 1.1, flex: 0.9, lean: [0.1, 0.4], leaves: [2, 3], leaf: "lance", face: [0.1, 0.5], turn: 0.4, drift: 0.1, ragged: 0.12, branches: true },
  daffodil: { size: [0.85, 1.1], inks: [4, 0, 6], stem: 1.1, flex: 0.9, lean: [0, 0.3], leaves: [1, 2], leaf: "strap", face: [0.15, 0.7], turn: 0.35, drift: 0.06, ragged: 0.1, branches: false },
  peony: { size: [0.95, 1.25], inks: [5, 2, 3], stem: 1.3, flex: 0.7, lean: [0.05, 0.4], leaves: [1, 3], leaf: "oval", face: [0.3, 0.8], turn: 0.3, drift: 0.3, ragged: 0.15, branches: true },
  iris: { size: [0.8, 1.05], inks: [4, 3, 3], stem: 1.2, flex: 0.75, lean: [-0.05, 0.2], leaves: [1, 2], leaf: "strap", face: [0.1, 0.45], turn: 0.35, drift: 0.06, ragged: 0.1, branches: true },
};

/** Default odds of each kind in the tall bouquet. */
export const BOUQUET_MIX: Partial<Record<Kind, number>> = {
  cosmos: 3, spike: 2.2, poppy: 1.6, plume: 1.5, tulip: 1.3,
  daisy: 1.3, cluster: 1.3, rose: 1, lily: 0.8, bud: 0.8,
  iris: 1.2, daffodil: 1.1, peony: 1, turksCap: 1,
};

/** Default odds of each kind in the low meadow. */
export const MEADOW_MIX: Partial<Record<Kind, number>> = {
  daisy: 3, cluster: 2.4, cosmos: 1.4, bud: 1.2, poppy: 1,
  tulip: 1, spike: 0.8, rose: 0.5, daffodil: 1,
};
