import { useEffect, type RefObject } from "react";
import { FlowerEngine, type FlowerFieldOptions } from "../lib/flowers";

/**
 * Runs a FlowerEngine on the canvas while it's mounted. Changing an option
 * starts a fresh engine, which grows a new bed unless `seed` is set.
 */
export function useFlowerField(canvasRef: RefObject<HTMLCanvasElement | null>, options: FlowerFieldOptions) {
  const { cell, steps, sizes, colors, wind, density, seed } = options;
  // Compared by value, so a new array or object literal on each render doesn't restart the engine.
  const sizesKey = sizes?.join(",");
  const { background, ink, dark, light } = colors ?? {};

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new FlowerEngine(canvas, {
      cell,
      steps,
      sizes: sizesKey ? sizesKey.split(",").map(Number) : undefined,
      colors: { background, ink, dark, light },
      wind,
      density,
      seed,
    });
    return () => engine.destroy();
  }, [canvasRef, cell, steps, sizesKey, background, ink, dark, light, wind, density, seed]);
}
