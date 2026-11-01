import { useState, type RefObject } from "react";
import { useDialKitController, type DialConfig, type ResolvedValues, type SpringConfig, type TransitionConfig } from "dialkit";
import {
  DEFAULT_COLORS,
  DEFAULT_SETTINGS,
  type FlowerFieldHandle,
  type FlowerFieldOptions,
  type Kind,
  type LeafShape,
  type Mix,
  type Species,
  type SwaySettings,
  type WindWave,
} from "halftone-flowers";
import { hueOf, withHue } from "../src/utils/color";
import { clamp, TAU } from "../src/utils/math";

const { layout, species, mix, tone, shade, wind, sway, cursor, spawn, insects, petals, trail, splash } = DEFAULT_SETTINGS;
const KINDS = Object.keys(species) as Kind[];
const LEAVES: LeafShape[] = ["lance", "strap", "oval"];

/** Angular speed of a 320px stem at sway speed 1, radians a second (see createStem). */
const BASE_OMEGA = Math.PI;
/** Heavy enough that DialKit's stiffness and damping sliders step finely through slow sways. */
const SWAY_MASS = 10;
/** Any faster, or damping past 1, and the 60 Hz step can't keep the quickest stems stable. */
const MAX_SPEED = 5;

function slider(value: number, min: number, max: number, step: number): [number, number, number, number] {
  return [value, min, max, step];
}

function perKind<T>(make: (kind: Kind) => T, kinds = KINDS) {
  return Object.fromEntries(kinds.map((kind) => [kind, make(kind)])) as Record<Kind, T>;
}

/** The mix's kinds in its own order, then the rest. Picking walks the mix in order, so this keeps a seed's bed unchanged. */
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
    turn: slider(sp.turn, 0, 1, 0.01),
    drift: slider(sp.drift, 0, 0.5, 0.01),
    ragged: slider(sp.ragged, 0, 0.5, 0.01),
    branches: sp.branches,
  } satisfies DialConfig;
}

/** The sway as a Motion spring with the same rate and damping ratio as a 320px stem. */
function swaySpring({ speed, damping }: SwaySettings): SpringConfig {
  const stiffness = SWAY_MASS * (BASE_OMEGA * speed) ** 2;
  return { type: "spring", stiffness, damping: 2 * damping * Math.sqrt(stiffness * SWAY_MASS), mass: SWAY_MASS };
}

/** Inverse of swaySpring. Time mode converts as Motion does, though its 1s cap is faster than the default sway. */
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
    // The colours below are for a light page; dark turns them over.
    mode: { type: "select", options: ["light", "dark"], default: "light" },
    background: DEFAULT_COLORS.background,
    light: DEFAULT_COLORS.light,
    ink: DEFAULT_COLORS.ink,
    dark: DEFAULT_COLORS.dark,
    randomize: { type: "action", label: "Random colours" },
  },
  sound: {
    enabled: true,
    volume: slider(0.6, 0, 1, 0.01),
  },
  shade: {
    _collapsed: true,
    shades: slider(15, 1, 25, 2),
    depth: slider(shade.depth, 0, 1, 0.01),
    jitter: slider(shade.jitter, 0, 0.5, 0.01),
    light: slider(shade.light, 0, 0.5, 0.01),
  },
  halftone: {
    _collapsed: true,
    autoCell: true,
    cell: slider(8, 3, 20, 1),
    steps: slider(6, 1, 10, 1),
    dot: { type: "select", options: ["round", "square", "diamond"], default: "round" },
    curve: slider(0.75, 0, 1, 0.01),
    grid: { type: "select", options: ["diagonal", "straight"], default: "diagonal" },
    spread: slider(0.1, 0, 0.5, 0.01),
    threshold: slider(0.26, 0.05, 0.95, 0.01),
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
  insects: {
    _collapsed: true,
    enabled: insects.enabled,
    every: slider(insects.every, 1, 60, 0.5),
    most: slider(insects.most, 0, 10, 1),
    butterflies: slider(insects.odds[0], 0, 5, 0.1),
    bees: slider(insects.odds[1], 0, 5, 0.1),
    size: slider(insects.size, 0.3, 2.5, 0.05),
    speed: slider(insects.speed, 0.2, 3, 0.05),
    visitsMin: slider(insects.visits[0], 0, 10, 1),
    visitsMax: slider(insects.visits[1], 0, 10, 1),
    stayMin: slider(insects.stay[0], 0, 20, 0.5),
    stayMax: slider(insects.stay[1], 0, 20, 0.5),
    trail: {
      fade: slider(insects.trail.fade, 0, 10, 0.1),
      width: slider(insects.trail.width, 0.5, 6, 0.1),
      strength: slider(insects.trail.strength, 0, 1, 0.01),
    },
    heart: {
      enabled: insects.heart.enabled,
      sizeMin: slider(insects.heart.size[0], 0.3, 4, 0.05),
      sizeMax: slider(insects.heart.size[1], 0.3, 4, 0.05),
      drawMin: slider(insects.heart.draw[0], 0.2, 3, 0.05),
      drawMax: slider(insects.heart.draw[1], 0.2, 3, 0.05),
      swellMin: slider(insects.heart.swell[0], 0, 1, 0.01),
      swellMax: slider(insects.heart.swell[1], 0, 1, 0.01),
      fadeMin: slider(insects.heart.fade[0], 0.1, 3, 0.05),
      fadeMax: slider(insects.heart.fade[1], 0.1, 3, 0.05),
    },
    butterfly: { type: "action", label: "Send a butterfly" },
    bee: { type: "action", label: "Send a bee" },
  },
  petals: {
    _collapsed: true,
    enabled: petals.enabled,
    size: slider(petals.size, 0.3, 3, 0.05),
    speed: slider(petals.speed, 0.2, 3, 0.05),
    sink: slider(petals.sink, 0, 1, 0.01),
    loops: slider(petals.loops, 0, 30, 0.5),
    waitMin: slider(petals.wait[0], 0, 2, 0.01),
    waitMax: slider(petals.wait[1], 0, 2, 0.01),
    turnMin: slider(petals.turn[0], 0.1, 4, 0.05),
    turnMax: slider(petals.turn[1], 0.1, 4, 0.05),
  },
  trail: {
    _collapsed: true,
    enabled: trail.enabled,
    hold: slider(trail.hold, 0, 3, 0.05),
    fade: slider(trail.fade, 0.05, 3, 0.05),
    width: slider(trail.width, 0.5, 6, 0.1),
    strength: slider(trail.strength, 0, 1, 0.01),
    strands: slider(trail.strands, 1, 6, 1),
    spread: slider(trail.spread, 0, 30, 0.5),
    wave: slider(trail.wave, 20, 400, 5),
    flow: slider(trail.flow, 0, 12, 0.1),
    lag: slider(trail.lag, 0, 0.3, 0.005),
  },
  splash: {
    _collapsed: true,
    enabled: splash.enabled,
    countMin: slider(splash.count[0], 0, 40, 1),
    countMax: slider(splash.count[1], 0, 40, 1),
    sizeMin: slider(splash.size[0], 0.1, 2, 0.05),
    sizeMax: slider(splash.size[1], 0.1, 2, 0.05),
    reachMin: slider(splash.reach[0], 0, 5, 0.1),
    reachMax: slider(splash.reach[1], 0, 5, 0.1),
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
      inner: slider(layout.bouquet.inner, 0, 0.9, 0.01),
      roots: slider(layout.bouquet.roots, 0, 1, 0.01),
    },
    meadow: {
      amount: slider(layout.meadow.amount, 0, 2, 0.05),
      thicken: slider(layout.meadow.thicken, 0, 4, 0.1),
      spanStart: slider(layout.meadow.span[0], 0, 1, 0.01),
      spanEnd: slider(layout.meadow.span[1], 0, 1, 0.01),
      heightLeft: slider(layout.meadow.height[0], 0, 0.8, 0.01),
      heightRight: slider(layout.meadow.height[1], 0, 0.8, 0.01),
      slantMin: slider(layout.meadow.slant[0], -1.5, 2, 0.05),
      slantMax: slider(layout.meadow.slant[1], -1.5, 2, 0.05),
      scatter: slider(layout.meadow.scatter, 0, 2, 0.05),
    },
    grass: {
      corner: slider(layout.grass.corner, 0, 2, 0.05),
      bottom: slider(layout.grass.bottom, 0, 2, 0.05),
    },
    curveUp: slider(layout.curveUp, 0, 1, 0.01),
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
    turn: d.turn,
    drift: d.drift,
    ragged: d.ragged,
    branches: d.branches,
  };
}

function toWave(d: ResolvedValues<ReturnType<typeof waveDials>>): WindWave {
  return { strength: d.strength, period: d.period, length: d.length, height: d.height, phase: d.phase };
}

function toOptions(v: Values, seed: number): FlowerFieldOptions {
  const { halftone, colors, shade, layout, tone, wind, sway, cursor, spawn, insects, petals, trail, splash } = v;
  return {
    cell: halftone.autoCell ? undefined : halftone.cell,
    steps: halftone.steps,
    shades: shade.shades,
    spread: halftone.spread,
    threshold: halftone.threshold,
    dot: halftone.dot === "square" || halftone.dot === "diamond" ? halftone.dot : "round",
    curve: halftone.curve,
    grid: halftone.grid === "straight" ? "straight" : "diagonal",
    colors: { background: colors.background, light: colors.light, ink: colors.ink, dark: colors.dark },
    scheme: colors.mode === "dark" ? "dark" : "light",
    wind: wind.bend,
    density: layout.density,
    seed,
    settings: {
      layout: {
        flowerSize: { share: layout.flowerSize.share, min: layout.flowerSize.min, max: layout.flowerSize.max },
        stems: { spacing: layout.stems.spacing, min: layout.stems.min, max: layout.stems.max },
        bouquet: { reach: [layout.bouquet.reachAcross, layout.bouquet.reachUp], inner: layout.bouquet.inner, roots: layout.bouquet.roots },
        meadow: {
          amount: layout.meadow.amount,
          thicken: layout.meadow.thicken,
          span: [layout.meadow.spanStart, layout.meadow.spanEnd],
          height: [layout.meadow.heightLeft, layout.meadow.heightRight],
          slant: [layout.meadow.slantMin, layout.meadow.slantMax],
          scatter: layout.meadow.scatter,
        },
        grass: { corner: layout.grass.corner, bottom: layout.grass.bottom },
        curveUp: layout.curveUp,
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
      shade: { depth: shade.depth, jitter: shade.jitter, light: shade.light },
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
      insects: {
        enabled: insects.enabled,
        every: insects.every,
        most: insects.most,
        odds: [insects.butterflies, insects.bees],
        size: insects.size,
        speed: insects.speed,
        visits: [insects.visitsMin, insects.visitsMax],
        stay: [insects.stayMin, insects.stayMax],
        trail: { fade: insects.trail.fade, width: insects.trail.width, strength: insects.trail.strength },
        heart: {
          enabled: insects.heart.enabled,
          size: [insects.heart.sizeMin, insects.heart.sizeMax],
          draw: [insects.heart.drawMin, insects.heart.drawMax],
          swell: [insects.heart.swellMin, insects.heart.swellMax],
          fade: [insects.heart.fadeMin, insects.heart.fadeMax],
        },
      },
      petals: {
        enabled: petals.enabled,
        size: petals.size,
        speed: petals.speed,
        sink: petals.sink,
        loops: petals.loops,
        wait: [petals.waitMin, petals.waitMax],
        turn: [petals.turnMin, petals.turnMax],
      },
      trail: {
        enabled: trail.enabled,
        hold: trail.hold,
        fade: trail.fade,
        width: trail.width,
        strength: trail.strength,
        strands: trail.strands,
        spread: trail.spread,
        wave: trail.wave,
        flow: trail.flow,
        lag: trail.lag,
      },
      splash: {
        enabled: splash.enabled,
        count: [splash.countMin, splash.countMax],
        size: [splash.sizeMin, splash.sizeMax],
        reach: [splash.reachMin, splash.reachMax],
      },
    },
  };
}

const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

/**
 * The default colours at one random hue at least 60° from `from`, and a random vividness from grey
 * to the defaults' own. Lightness stays (see withHue), so the shades step the same for any hue.
 */
function randomColors(from: number) {
  const hue = from + 60 + Math.random() * 240;
  // Leans vivid: three times in four above half.
  const vividness = Math.sqrt(Math.random());
  return {
    background: withHue(DEFAULT_COLORS.background, hue, vividness),
    light: withHue(DEFAULT_COLORS.light, hue, vividness),
    ink: withHue(DEFAULT_COLORS.ink, hue, vividness),
    dark: withHue(DEFAULT_COLORS.dark, hue, vividness),
  };
}

/**
 * A DialKit panel for every FlowerField option and setting. Key the FlowerField on `generation`:
 * "Grow again" and "New bed" remount it to grow in again, which is when spawn settings apply.
 */
export function useFlowerDials(field: RefObject<FlowerFieldHandle | null>) {
  const [seed, setSeed] = useState(randomSeed);
  const [generation, setGeneration] = useState(0);
  const dials = useDialKitController("Flowers", CONFIG, {
    id: "flowers",
    onAction: (action) => {
      if (action === "colors.randomize") dials.setValues({ colors: randomColors(hueOf(dials.getValues().colors.ink)) });
      if (action === "insects.butterfly") field.current?.release("butterfly");
      if (action === "insects.bee") field.current?.release("bee");
      if (action === "newBed") setSeed(randomSeed());
      if (action === "growAgain" || action === "newBed") setGeneration((g) => g + 1);
    },
  });
  return { options: toOptions(dials.values, seed), generation, sound: dials.values.sound };
}
