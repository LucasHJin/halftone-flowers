/**
 * Draws the garden as a tone image rather than in colour: the red channel is
 * how much ink a spot wants, green that times how far along the colour ramp,
 * from light to dark, it sits. The halftone pass turns those into dot sizes and
 * shades. Later shapes cover earlier ones, so a petal in front of a stem
 * replaces it rather than adding to it. Each plant is moved along the ramp by
 * its own amount, so plants that overlap print in different shades.
 *
 * Flower heads are drawn in a local frame at the stem's tip, rotated so that
 * local -y runs out along the stem.
 *
 * While the bed grows in, each plant is cut off above its growing front, so
 * whatever is behind shows through until it gets there.
 */
import type { Garden } from "../garden";
import { spawnColor, spawnFront } from "../spawn";
import { createRandom } from "../../../utils/math";
import type { ShadeSettings } from "../settings";
import { SEGMENTS } from "../stem";
import type { Plant, Stem } from "../types";
import { paintLeaf, paintStem } from "./foliage";
import { paintBud } from "./heads/bud";
import { paintCluster } from "./heads/cluster";
import { paintCup } from "./heads/cup";
import { paintDisc } from "./heads/disc";
import { paintGlobe } from "./heads/globe";
import { paintIris } from "./heads/iris";
import { paintPlume } from "./heads/plume";
import { paintReflexed } from "./heads/reflexed";
import { paintSpike } from "./heads/spike";
import { paintTrumpet } from "./heads/trumpet";
import { inMask, inShade } from "./tone";

/** Paints the garden's tone image, or with `mask`, the spawn mask in the same shapes. */
export function paintGarden(ctx: CanvasRenderingContext2D, garden: Garden, mask = false) {
  const growing = garden.growing;
  const plan = garden.spawnPlan;
  const { shade } = garden.settings;
  for (const plant of garden.plants) {
    if (growing === null || !plan || !plant.spawn) {
      paintPlant(ctx, plant, garden.time, shade);
      continue;
    }
    const front = spawnFront(plant, growing, garden.height);
    if (front >= plant.stems[0].rootY) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-garden.width, front, garden.width * 3, garden.height * 2);
    ctx.clip();
    if (mask) inMask(spawnColor(plant, plan), () => paintPlant(ctx, plant, garden.time, shade));
    else paintPlant(ctx, plant, garden.time, shade);
    ctx.restore();
  }
}

function paintPlant(ctx: CanvasRenderingContext2D, plant: Plant, t: number, shade: ShadeSettings) {
  // Lighter toward the back, plus a nudge of the plant's own that holds steady from frame to frame.
  const by = shade.depth * (plant.depth - 1) + shade.jitter * (2 * createRandom(plant.stems[0].id)() - 1);
  inShade(by, () => {
    for (const s of plant.stems) paintStem(ctx, s);
    for (const s of plant.stems) for (const leaf of s.leaves) paintLeaf(ctx, s, leaf, t);
    // Branch heads first, so the main flower sits on top.
    for (let i = plant.stems.length - 1; i >= 0; i--) paintHead(ctx, plant.stems[i], t);
  });
}

function paintHead(ctx: CanvasRenderingContext2D, s: Stem, t: number) {
  const h = s.head;
  if (!h) return;
  switch (h.kind) {
    case "spike":
      return paintSpike(ctx, s, h);
    case "plume":
      return paintPlume(ctx, s, h, t);
  }
  ctx.save();
  ctx.translate(s.x[SEGMENTS], s.y[SEGMENTS]);
  ctx.rotate(s.angle[SEGMENTS - 1] + s.nod);
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
