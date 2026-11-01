import { useEffect, useRef, type RefObject } from "react";
import { FlowerEngine, type FlowerFieldOptions } from "./flowers/index.js";

/**
 * Runs a FlowerEngine on the canvas while it's mounted, and returns a ref to
 * it. Changing an option updates the running bed in place (see
 * FlowerEngine.update); only a remount grows it in again.
 */
export function useFlowerField(canvasRef: RefObject<HTMLCanvasElement | null>, options: FlowerFieldOptions) {
  const { cell, steps, sizes, shades, spread, threshold, dot, curve, grid, colors, scheme, wind, density, seed, settings } = options;
  // Compared by value, so a new array or object literal on each render doesn't count as a change.
  const sizesKey = sizes?.join(",");
  const { background, ink, dark, light } = colors ?? {};
  const settingsKey = settings ? JSON.stringify(settings) : "";
  const engineRef = useRef<FlowerEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const next: FlowerFieldOptions = {
      cell,
      steps,
      sizes: sizesKey ? sizesKey.split(",").map(Number) : undefined,
      shades,
      spread,
      threshold,
      dot,
      curve,
      grid,
      colors: { background, ink, dark, light },
      scheme,
      wind,
      density,
      seed,
      settings: settingsKey ? JSON.parse(settingsKey) : undefined,
    };
    if (engineRef.current) engineRef.current.update(next);
    else engineRef.current = new FlowerEngine(canvas, next);
  }, [canvasRef, cell, steps, sizesKey, shades, spread, threshold, dot, curve, grid, background, ink, dark, light, scheme, wind, density, seed, settingsKey]);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [canvasRef],
  );
  return engineRef;
}
