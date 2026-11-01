import { useEffect, useRef, type RefObject } from "react";
import { FlowerEngine, type FieldEmitter, type FlowerFieldOptions } from "./flowers/index.js";

/**
 * Runs a FlowerEngine on the canvas while mounted, reporting through `events`, and returns a ref
 * to it. Option changes go through FlowerEngine.update; only a remount grows the field in again.
 */
export function useFlowerField(canvasRef: RefObject<HTMLCanvasElement | null>, options: FlowerFieldOptions, events: FieldEmitter) {
  const { cell, steps, sizes, shades, spread, threshold, dot, curve, grid, colors, scheme, wind, density, seed, pointer, settings } = options;
  // Compared by value, so a new array or object literal each render isn't a change.
  const sizesKey = sizes?.join(",");
  const { background, ink, dark, light } = colors ?? {};
  const settingsKey = settings ? JSON.stringify(settings) : "";
  const pointerOn = !!pointer;
  const { image, hotspot, scale } = typeof pointer === "object" ? pointer : {};
  const hotspotKey = hotspot?.join(",");
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
      pointer: pointerOn && { image, hotspot: hotspotKey ? (hotspotKey.split(",").map(Number) as [number, number]) : undefined, scale },
      settings: settingsKey ? JSON.parse(settingsKey) : undefined,
    };
    if (engineRef.current) engineRef.current.update(next);
    else engineRef.current = new FlowerEngine(canvas, next, events);
  }, [canvasRef, events, cell, steps, sizesKey, shades, spread, threshold, dot, curve, grid, background, ink, dark, light, scheme, wind, density, seed, pointerOn, image, hotspotKey, scale, settingsKey]);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [canvasRef],
  );
  return engineRef;
}
