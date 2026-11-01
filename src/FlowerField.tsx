import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from "react";
import type { FlowerFieldOptions, InsectKind } from "./flowers/index.js";
import { useFlowerField } from "./useFlowerField.js";

export interface FlowerFieldHandle {
  /** Sends a butterfly or bee in now, or one picked by the insect settings' odds. */
  release(kind?: InsectKind): void;
}

export interface FlowerFieldProps extends FlowerFieldOptions {
  className?: string;
  /** Laid over the canvas's own style, which fills its parent. */
  style?: CSSProperties;
}

const FILL: CSSProperties = { display: "block", width: "100%", height: "100%" };

/** Procedurally grown flowers swaying in the wind, with butterflies and bees visiting, drawn as a halftone of round dots. The pointer leaves a trail like the insects', clicking an insect sends up a heart, clicking a flower shakes its petals off, until it has none left, and a click elsewhere puffs out tiny petals that drift off on the wind. Fills its parent. */
export const FlowerField = forwardRef<FlowerFieldHandle, FlowerFieldProps>(function FlowerField({ className, style, ...options }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useFlowerField(canvasRef, options);
  useImperativeHandle(ref, () => ({ release: (kind) => engineRef.current?.release(kind) }), [engineRef]);
  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={style ? { ...FILL, ...style } : FILL} />;
});
