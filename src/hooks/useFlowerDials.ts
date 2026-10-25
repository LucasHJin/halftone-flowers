import { useState } from "react";
import { useDialKit, type DialConfig, type ResolvedValues, type SpringConfig, type TransitionConfig } from "dialkit";
import {
  DEFAULT_COLORS,
  DEFAULT_SETTINGS,
  type FlowerFieldOptions,
  type Kind,
  type LeafShape,
  type Mix,
  type Species,
  type SwaySettings,
  type WindWave,
} from "../lib/flowers";
import { clamp, TAU } from "../utils/math";

const { layout, species, mix, tone, wind, sway, cursor, spawn } = DEFAULT_SETTINGS;
const KINDS = Object.keys(species) as Kind[];
const LEAVES: LeafShape[] = ["lance", "strap", "oval"];

/** How fast a 320px stem swings at sway speed 1, radians a second (see createStem). */
const BASE_OMEGA = Math.PI;
/** Heavy enough that DialKit's stiffness and damping sliders step finely through slow sways. */
const SWAY_MASS = 10;
/** Any faster, or damped past 1, and the 60 Hz step can't keep the quickest stems stable. */
const MAX_SPEED = 5;

function slider(value: number, min: number, max: number, step: number): [number, number, number, number] {
  return [value, min, max, step];
}

function perKind<T>(make: (kind: Kind) => T, kinds = KINDS) {
  return Object.fromEntries(kinds.map((kind) => [kind, make(kind)])) as Record<Kind, T>;
}

/** The mix's own kinds in its order, then the rest. Picking walks the mix in order, so this keeps a seed's bed the same. */
function mixOrder(m: Mix) {
  return [...(Object.keys(m) as Kind[]), ...KINDS.filter((kind) => !(kind in m))];
}

function mixDials(m: Mix) {
  return perKind((kind) => slider(m[kind] ?? 0, 0, 5, 0.1), mixOrder(m));
}

function waveDials(w: WindWave) {
  return {
    strength: slider(w.strength, 0, 1, 0.01),
    period: slider(w.period, 0.5, 30, 0.1),
    length: slider(w.length, 100, 4000, 10),
    // 0 leaves the wave the same all the way down the screen.
    height: slider(w.height ?? 0, 0, 3000, 10),
    phase: slider(w.phase ?? 0, 0, TAU, 0.01),
  } satisfies DialConfig;
}

function speciesDials(sp: Species) {
  return {
    _collapsed: true,
    sizeMin: slider(sp.size[0], 0.1, 2, 0.05),
    sizeMax: slider(sp.size[1], 0.1, 2, 0.05),
    inkOdds: slider(sp.inks[0], 0, 10, 1),
    darkOdds: slider(sp.inks[1], 0, 10, 1),
    lightOdds: slider(sp.inks[2], 0, 10, 1),
    stem: slider(sp.stem, 0.3, 2, 0.05),
    flex: slider(sp.flex, 0, 2.5, 0.05),
    leanMin: slider(sp.lean[0], -0.5, 1, 0.01),
    leanMax: slider(sp.lean[1], -0.5, 1, 0.01),
    leavesMin: slider(sp.leaves[0], 0, 4, 1),
    leavesMax: slider(sp.leaves[1], 0, 4, 1),
    leaf: { type: "select", options: LEAVES, default: sp.leaf },
    faceMin: slider(sp.face[0], 0, 1, 0.01),
    faceMax: slider(sp.face[1], 0, 1, 0.01),
    branches: sp.branches,
  } satisfies DialConfig;
}

/** The sway as a Motion spring with the same rate and damping ratio as a 320px stem. */
function swaySpring({ speed, damping }: SwaySettings): SpringConfig {
  const stiffness = SWAY_MASS * (BASE_OMEGA * speed) ** 2;
  return { type: "spring", stiffness, damping: 2 * damping * Math.sqrt(stiffness * SWAY_MASS), mass: SWAY_MASS };
}

/** Undoes swaySpring. Time mode converts the way Motion does, though its 1s cap is faster than the default sway. */
function springSway(spring: TransitionConfig): Pick<SwaySettings, "speed" | "damping"> {
  if (spring.type !== "spring") return sway;
  let omega: number;
  let zeta: number;
  if (spring.visualDuration !== undefined) {
    omega = TAU / (1.2 * spring.visualDuration);
    zeta = 1 - (spring.bounce ?? 0);
  } else {
    const { stiffness = 100, damping = 10, mass = 1 } = spring;
    omega = Math.sqrt(stiffness / mass);
    zeta = damping / (2 * Math.sqrt(stiffness * mass));
  }
  return { speed: clamp(omega / BASE_OMEGA, 0, MAX_SPEED), damping: clamp(zeta, 0, 1) };
}

const CONFIG = {
  colors: {
    background: DEFAULT_COLORS.background,
    ink: DEFAULT_COLORS.ink,
    dark: DEFAULT_COLORS.dark,
    light: DEFAULT_COLORS.light,
  },
  halftone: {
    _collapsed: true,
    autoCell: true,
    cell: slider(8, 3, 20, 1),
    steps: slider(5, 1, 10, 1),
  },
  wind: {
    _collapsed: true,
    bend: slider(1, 0, 3, 0.05),
    lean: slider(wind.lean, -1, 1, 0.01),
    slowWave: waveDials(wind.waves[0]),
    midWave: waveDials(wind.waves[1]),
    fastWave: waveDials(wind.waves[2]),
  },
  sway: {
    _collapsed: true,
    spring: swaySpring(sway),
    grassDamping: slider(sway.grassDamping, 0, 1, 0.01),
  },
  cursor: {
    _collapsed: true,
    strength: slider(cursor.strength, 0, 0.2, 0.005),
    limit: slider(cursor.limit, 0, 8, 0.1),
    rise: slider(cursor.rise, 0.05, 3, 0.05),
    fade: slider(cursor.fade, 0.2, 8, 0.1),
    reach: slider(cursor.reach, 0, 2, 0.05),
  },
  spawn: {
    _collapsed: true,
    enabled: spawn.enabled,
    duration: slider(spawn.duration, 0.2, 6, 0.1),
    grow: slider(spawn.grow, 0.05, 2, 0.05),
    climbMin: slider(spawn.climb[0], 0.05, 2, 0.05),
    climbMax: slider(spawn.climb[1], 0.05, 2, 0.05),
    scatter: slider(spawn.scatter, 0, 1, 0.01),
    order: slider(spawn.order, 0, 1, 0.01),
  },
  layout: {
    _collapsed: true,
    density: slider(1, 0.2, 3, 0.05),
    flowerSize: {
      share: slider(layout.flowerSize.share, 0.02, 0.12, 0.005),
      min: slider(layout.flowerSize.min, 8, 80, 1),
      max: slider(layout.flowerSize.max, 20, 160, 1),
    },
    stems: {
      spacing: slider(layout.stems.spacing, 20, 160, 1),
      min: slider(layout.stems.min, 1, 40, 1),
      max: slider(layout.stems.max, 1, 60, 1),
    },
    bouquet: {
      reachAcross: slider(layout.bouquet.reach[0], 0.1, 1, 0.01),
      reachUp: slider(layout.bouquet.reach[1], 0.1, 1, 0.01),
      roots: slider(layout.bouquet.roots, 0, 1, 0.01),
    },
    meadow: {
      amount: slider(layout.meadow.amount, 0, 2, 0.05),
      spanStart: slider(layout.meadow.span[0], 0, 1, 0.01),
      spanEnd: slider(layout.meadow.span[1], 0, 1, 0.01),
      heightLeft: slider(layout.meadow.height[0], 0, 0.8, 0.01),
      heightRight: slider(layout.meadow.height[1], 0, 0.8, 0.01),
    },
    grass: {
      corner: slider(layout.grass.corner, 0, 2, 0.05),
      bottom: slider(layout.grass.bottom, 0, 2, 0.05),
    },
  },
  tone: {
    _collapsed: true,
    flowersBack: slider(tone.flowers[0], 0, 1, 0.01),
    flowersFront: slider(tone.flowers[1], 0, 1, 0.01),
    stemsBack: slider(tone.stems[0], 0, 1, 0.01),
    stemsFront: slider(tone.stems[1], 0, 1, 0.01),
    grassBack: slider(tone.grass[0], 0, 1, 0.01),
    grassFront: slider(tone.grass[1], 0, 1, 0.01),
  },
  mix: {
    _collapsed: true,
    bouquet: { _collapsed: true, ...mixDials(mix.bouquet) },
    meadow: { _collapsed: true, ...mixDials(mix.meadow) },
  },
  species: { _collapsed: true, ...perKind((kind) => speciesDials(species[kind])) },
  growAgain: { type: "action", label: "Grow again" },
  newBed: { type: "action", label: "New bed" },
} satisfies DialConfig;

type Values = ResolvedValues<typeof CONFIG>;

function toSpecies(d: ResolvedValues<ReturnType<typeof speciesDials>>): Species {
  return {
    size: [d.sizeMin, d.sizeMax],
    inks: [d.inkOdds, d.darkOdds, d.lightOdds],
    stem: d.stem,
    flex: d.flex,
    lean: [d.leanMin, d.leanMax],
    leaves: [d.leavesMin, d.leavesMax],
    leaf: d.leaf as LeafShape,
    face: [d.faceMin, d.faceMax],
    branches: d.branches,
  };
}

function toWave(d: ResolvedValues<ReturnType<typeof waveDials>>): WindWave {
  return { strength: d.strength, period: d.period, length: d.length, height: d.height, phase: d.phase };
}

function toOptions(v: Values, seed: number): FlowerFieldOptions {
  const { halftone, colors, layout, tone, wind, sway, cursor, spawn } = v;
  return {
    cell: halftone.autoCell ? undefined : halftone.cell,
    steps: halftone.steps,
    colors: { background: colors.background, ink: colors.ink, dark: colors.dark, light: colors.light },
    wind: wind.bend,
    density: layout.density,
    seed,
    settings: {
      layout: {
        flowerSize: { share: layout.flowerSize.share, min: layout.flowerSize.min, max: layout.flowerSize.max },
        stems: { spacing: layout.stems.spacing, min: layout.stems.min, max: layout.stems.max },
        bouquet: { reach: [layout.bouquet.reachAcross, layout.bouquet.reachUp], roots: layout.bouquet.roots },
        meadow: {
          amount: layout.meadow.amount,
          span: [layout.meadow.spanStart, layout.meadow.spanEnd],
          height: [layout.meadow.heightLeft, layout.meadow.heightRight],
        },
        grass: { corner: layout.grass.corner, bottom: layout.grass.bottom },
      },
      species: perKind((kind) => toSpecies(v.species[kind])),
      mix: {
        bouquet: perKind((kind) => v.mix.bouquet[kind], mixOrder(mix.bouquet)),
        meadow: perKind((kind) => v.mix.meadow[kind], mixOrder(mix.meadow)),
      },
      tone: {
        flowers: [tone.flowersBack, tone.flowersFront],
        stems: [tone.stemsBack, tone.stemsFront],
        grass: [tone.grassBack, tone.grassFront],
      },
      wind: { lean: wind.lean, waves: [toWave(wind.slowWave), toWave(wind.midWave), toWave(wind.fastWave)] },
      sway: { ...springSway(sway.spring), grassDamping: sway.grassDamping },
      cursor: { strength: cursor.strength, limit: cursor.limit, rise: cursor.rise, fade: cursor.fade, reach: cursor.reach },
      spawn: {
        enabled: spawn.enabled,
        duration: spawn.duration,
        grow: spawn.grow,
        climb: [spawn.climbMin, spawn.climbMax],
        scatter: spawn.scatter,
        order: spawn.order,
      },
    },
  };
}

const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

/**
 * A DialKit panel for every FlowerField option and setting, starting from the
 * defaults. Key the FlowerField on `generation`: "Grow again" and "New bed"
 * remount it so it grows in, and spawn settings only apply then.
 */
export function useFlowerDials() {
  const [seed, setSeed] = useState(randomSeed);
  const [generation, setGeneration] = useState(0);
  const values = useDialKit("Flowers", CONFIG, {
    id: "flowers",
    onAction: (action) => {
      if (action === "newBed") setSeed(randomSeed());
      if (action === "growAgain" || action === "newBed") setGeneration((g) => g + 1);
    },
  });
  return { options: toOptions(values, seed), generation };
}
