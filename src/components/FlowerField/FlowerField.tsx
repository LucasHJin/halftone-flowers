import { useRef } from "react";
import { useFlowerField } from "../../hooks/useFlowerField";
import type { FlowerFieldOptions } from "../../lib/flowers";
import styles from "./FlowerField.module.css";

export interface FlowerFieldProps extends FlowerFieldOptions {
  className?: string;
}

/** Procedurally grown flowers swaying in the wind, drawn as a halftone of round dots. Fills its parent. */
export function FlowerField({ className, ...options }: FlowerFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useFlowerField(canvasRef, options);
  return <canvas ref={canvasRef} aria-hidden="true" className={className ? `${styles.canvas} ${className}` : styles.canvas} />;
}
