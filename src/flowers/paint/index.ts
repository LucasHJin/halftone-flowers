/**
 * Paints the garden as a tone image: red is how much ink a spot wants, green is
 * red times its place on the colour ramp (0 light, 1 dark). The halftone pass
 * turns these into dot sizes and shades. Later shapes replace earlier ones, so
 * a petal over a stem hides it. Heads are drawn in a frame at the stem's tip,
 * rotated so local -y runs out along the stem.
 */
import type { Garden } from "../garden.js";
import { spawnColor, spawnFront } from "../spawn.js";
import type { ShadeSettings } from "../settings.js";
import { SEGMENTS } from "../stem.js";
import type { Plant, Stem } from "../types.js";
import { paintLeaf, paintStem } from "./foliage.js";
import { paintBud } from "./heads/bud.js";
import { paintCluster } from "./heads/cluster.js";
import { paintCup } from "./heads/cup.js";
import { paintDisc } from "./heads/disc.js";
import { paintGlobe } from "./heads/globe.js";
import { paintIris } from "./heads/iris.js";
import { paintPlume } from "./heads/plume.js";
import { paintReflexed } from "./heads/reflexed.js";
import { paintSpike } from "./heads/spike.js";
import { paintTrumpet } from "./heads/trumpet.js";
import { aimLight, inLight, inMask, inShade, plantShade, setLight } from "./tone.js";

/** Things that move among the plants (insects, loose petals), painted between them by depth. */
interface Movers {
  /** Sorts them by depth for this frame. */
  beginPaint(): void;
  /** Depth of the next one to paint, or Infinity once they're all painted. */
  readonly nextDepth: number;
  paintNext(ctx: CanvasRenderingContext2D): void;
}

/** Paints the garden's tone image, or with `mask`, the spawn mask in the same shapes, without insects or petals. */
export function paintGarden(ctx: CanvasRenderingContext2D, garden: Garden, mask = false) {
  const growing = garden.growing;
  const plan = garden.spawnPlan;
  const { shade } = garden.settings;
  const movers: Movers[] = mask ? [] : [garden.insects, garden.petals];
  setLight(shade.light);
  for (const m of movers) m.beginPaint();
  for (const plant of garden.plants) {
    paintMovers(ctx, movers, plant.depth);
    if (growing === null || !plan || !plant.spawn) {
      paintPlant(ctx, plant, garden.time, shade, !mask);
      continue;
    }
    const front = spawnFront(plant, growing, garden.height);
    if (front >= plant.stems[0].rootY) continue;
    ctx.save();
    ctx.beginPath();
    // Cut off above the growing front. The bottom edge stays below the roots however far up `front` climbs.
    ctx.rect(-garden.width, front, garden.width * 3, garden.height * 2 - front);
    ctx.clip();
    if (mask) inMask(spawnColor(plant, plan), () => paintPlant(ctx, plant, garden.time, shade, false));
    else paintPlant(ctx, plant, garden.time, shade);
    ctx.restore();
  }
  paintMovers(ctx, movers, Infinity);
}

/** Paints the unpainted movers further back than `depth`, furthest first, across all kinds. */
function paintMovers(ctx: CanvasRenderingContext2D, movers: Movers[], depth: number) {
  for (;;) {
    let first: Movers | null = null;
    for (const m of movers) if (m.nextDepth < depth && (!first || m.nextDepth < first.nextDepth)) first = m;
    if (!first) return;
    first.paintNext(ctx);
  }
}

/** Paints each plant flat in `colour(plant)`, nearer over further, fully grown, without insects or leaving petals. */
export function paintSilhouettes(ctx: CanvasRenderingContext2D, garden: Garden, colour: (plant: Plant) => string) {
  for (const plant of garden.plants) inMask(colour(plant), () => paintPlant(ctx, plant, garden.time, garden.settings.shade, false));
}

function paintPlant(ctx: CanvasRenderingContext2D, plant: Plant, t: number, shade: ShadeSettings, fading = true) {
  inShade(plantShade(plant, shade), () => {
    for (const s of plant.stems) paintStem(ctx, s);
    for (const s of plant.stems) for (const leaf of s.leaves) paintLeaf(ctx, s, leaf, t);
    // Branch heads first, so the main flower sits on top.
    inLight(() => {
      for (let i = plant.stems.length - 1; i >= 0; i--) {
        const s = plant.stems[i];
        if (fading && s.head?.leaving.size) paintLeaving(ctx, s, t);
        else paintHead(ctx, s, t);
      }
    });
  });
}

/** Scene-sized scratch canvases for `paintLeaving`: the head as it is and as it was. */
let layers: [CanvasRenderingContext2D, CanvasRenderingContext2D] | null = null;

/**
 * Paints the head on `s` with its leaving petals part-faded: the whole head with
 * and without them, mixed by how much they still show. Mixing whole heads lets
 * what a petal hid fade in, and leaves areas where both match as if painted once.
 */
function paintLeaving(ctx: CanvasRenderingContext2D, s: Stem, t: number) {
  const h = s.head!;
  const { width, height } = ctx.canvas;
  if (!layers || layers[0].canvas.width !== width || layers[0].canvas.height !== height) {
    // Same CPU or GPU backing as the scene, so drawing them onto it doesn't copy across.
    const read = ctx.getContextAttributes?.().willReadFrequently ?? false;
    const make = () => Object.assign(document.createElement("canvas"), { width, height }).getContext("2d", { willReadFrequently: read });
    const [a, b] = [make(), make()];
    if (!a || !b) return paintHead(ctx, s, t);
    layers = [a, b];
  }
  const [now, was] = layers;
  const leaving = [...h.leaving.keys()];
  const paintOn = (layer: CanvasRenderingContext2D, back: boolean) => {
    layer.setTransform(1, 0, 0, 1, 0, 0);
    layer.clearRect(0, 0, width, height);
    layer.setTransform(ctx.getTransform());
    if (back) for (const k of leaving) h.lost.delete(k);
    try {
      paintHead(layer, s, t);
    } finally {
      for (const k of leaving) h.lost.add(k);
    }
    layer.setTransform(1, 0, 0, 1, 0, 0);
  };
  paintOn(now, false);
  paintOn(was, true);
  // One mix for all leaving petals: two rarely come off one head at once.
  const on = Math.max(...h.leaving.values());
  // `now` × (1 - on) + `was` × on.
  now.globalCompositeOperation = "destination-in";
  now.globalAlpha = 1 - on;
  now.fillStyle = "#000";
  now.fillRect(0, 0, width, height);
  now.globalCompositeOperation = "lighter";
  now.globalAlpha = on;
  now.drawImage(was.canvas, 0, 0);
  now.globalCompositeOperation = "source-over";
  now.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(now.canvas, 0, 0);
  ctx.restore();
}

function paintHead(ctx: CanvasRenderingContext2D, s: Stem, t: number) {
  const h = s.head;
  if (!h) return;
  // Spikes and plumes draw straight onto the screen.
  aimLight(0);
  switch (h.kind) {
    case "spike":
      return paintSpike(ctx, s, h);
    case "plume":
      return paintPlume(ctx, s, h, t);
  }
  ctx.save();
  ctx.translate(s.x[SEGMENTS], s.y[SEGMENTS]);
  const rotation = s.angle[SEGMENTS - 1] + s.nod;
  ctx.rotate(rotation);
  aimLight(rotation);
  switch (h.kind) {
    case "bud":
      paintBud(ctx, s, h);
      break;
    case "cluster":
      paintCluster(ctx, s, h, t);
      break;
    case "poppy":
    case "tulip":
    case "rose":
      paintCup(ctx, h);
      break;
    case "turksCap":
      paintReflexed(ctx, h);
      break;
    case "daffodil":
      paintTrumpet(ctx, h);
      break;
    case "peony":
      paintGlobe(ctx, h);
      break;
    case "iris":
      paintIris(ctx, h);
      break;
    default:
      paintDisc(ctx, s, h, t);
  }
  ctx.restore();
}
