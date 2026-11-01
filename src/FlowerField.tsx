import { forwardRef, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { FieldEmitter, type FieldEventType, type FieldListener, type FlowerFieldOptions, type InsectKind } from "./flowers/index.js";
import { useFlowerField } from "./useFlowerField.js";

export interface FlowerFieldHandle {
  /** Sends in a butterfly or bee now; without `kind`, picks one by the insect settings' odds. Does nothing under reduced motion. */
  release(kind?: InsectKind): void;
  /** Calls `listener` on each `type` event (see `FieldEvents`) until the returned function is called. `useFieldEvents` wraps this for React. */
  on<T extends FieldEventType>(type: T, listener: FieldListener<T>): () => void;
}

export interface FlowerFieldProps extends FlowerFieldOptions {
  className?: string;
  /** Merged over the canvas's own style, which fills its parent. */
  style?: CSSProperties;
}

const FILL: CSSProperties = { display: "block", width: "100%", height: "100%" };

/** Procedurally grown flowers swaying in the wind, visited by butterflies and bees, drawn as a halftone. The pointer leaves a trail; clicking an insect sends up a heart, clicking a flower knocks off one petal, and clicking elsewhere puffs out tiny petals that drift off on the wind. Fills its parent. */
export const FlowerField = forwardRef<FlowerFieldHandle, FlowerFieldProps>(function FlowerField({ className, style, ...options }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [events] = useState(() => new FieldEmitter());
  const engineRef = useFlowerField(canvasRef, options, events);
  useImperativeHandle(ref, () => ({ release: (kind) => engineRef.current?.release(kind), on: (type, listener) => events.on(type, listener) }), [engineRef, events]);
  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={style ? { ...FILL, ...style } : FILL} />;
});
