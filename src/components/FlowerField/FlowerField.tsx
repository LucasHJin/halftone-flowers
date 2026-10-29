import { useImperativeHandle, useRef, type Ref } from "react";
import { useFlowerField } from "../../hooks/useFlowerField";
import type { FlowerFieldOptions, InsectKind } from "../../lib/flowers";
import styles from "./FlowerField.module.css";

export interface FlowerFieldHandle {
  /** Sends a butterfly or bee in now, or one picked by the insect settings' odds. */
  release(kind?: InsectKind): void;
}

export interface FlowerFieldProps extends FlowerFieldOptions {
  className?: string;
  ref?: Ref<FlowerFieldHandle>;
}

/** Procedurally grown flowers swaying in the wind, with butterflies and bees visiting, drawn as a halftone of round dots. Fills its parent. */
export function FlowerField({ className, ref, ...options }: FlowerFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useFlowerField(canvasRef, options);
  useImperativeHandle(ref, () => ({ release: (kind) => engineRef.current?.release(kind) }), [engineRef]);
  return <canvas ref={canvasRef} aria-hidden="true" className={className ? `${styles.canvas} ${className}` : styles.canvas} />;
}
