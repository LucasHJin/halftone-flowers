import { TAU } from "../../utils/math";
import type { WindSettings } from "./settings";

/** Wind strength at a point and time: positive pushes right. Waves roll across the bed from the left. */
export type Wind = (x: number, y: number, t: number) => number;

export function createWind({ lean, waves }: WindSettings): Wind {
  const parts = waves.map((w) => ({
    strength: w.strength,
    speed: TAU / w.period,
    across: TAU / w.length,
    down: w.height ? TAU / w.height : 0,
    phase: w.phase ?? 0,
  }));
  return (x, y, t) => {
    let wind = lean;
    for (const w of parts) wind += w.strength * Math.sin(t * w.speed - x * w.across + y * w.down + w.phase);
    return wind;
  };
}
