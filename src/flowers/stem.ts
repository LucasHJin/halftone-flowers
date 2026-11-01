/**
 * Stem geometry: a chain of `SEGMENTS` equal segments with a rest curve. Posing
 * adds the current bend, growing toward the tip, and walks out the joints.
 */
import { clamp, lerp, TAU } from "../utils/math.js";
import type { Stem } from "./types.js";

export const SEGMENTS = 18;

export function createStem(id: number, rootX: number, rootY: number, segment: number): Stem {
  const length = segment * SEGMENTS;
  return {
    id,
    rootX,
    rootY,
    segment,
    rest: new Float32Array(SEGMENTS),
    angle: new Float32Array(SEGMENTS),
    x: new Float32Array(SEGMENTS + 1),
    y: new Float32Array(SEGMENTS + 1),
    baseWidth: 3,
    tipWidth: 2,
    ink: 1,
    tone: 0.7,
    flex: 0.2,
    omega: TAU * clamp(0.5 * Math.sqrt(320 / Math.max(length, 1)), 0.28, 0.9),
    bend: 0,
    bendVel: 0,
    gust: 0,
    breeze: 0,
    nod: 0,
    nodVel: 0,
    parent: null,
    attach: 0,
    head: null,
    leaves: [],
  };
}

/**
 * A stem from root (x0, y0) to head (x3, y3), its top leaning `lean` radians
 * right of the line between them. Positive rises first and arcs over; negative
 * sets off leaning out and curves up.
 */
export function curvedStem(id: number, x0: number, y0: number, x3: number, y3: number, lean: number, rand: () => number) {
  const dx = x3 - x0;
  const dy = y3 - y0;
  const dist = Math.hypot(dx, dy);
  const chord = Math.atan2(dx, -dy);
  let x1: number;
  let y1: number;
  if (lean >= 0) {
    x1 = x0 + dx * lerp(-0.05, 0.2, rand());
    y1 = Math.max(y0 - dist * lerp(0.35, 0.55, rand()), y3 - dist * 0.15);
  } else {
    // Sets off as far outside the line as the top ends up inside it.
    const out = clamp(chord - lean, -1.4, 1.4);
    const reach = dist * lerp(0.3, 0.45, rand());
    x1 = x0 + Math.sin(out) * reach;
    y1 = y0 - Math.cos(out) * reach;
  }
  const tipAngle = clamp(chord + lean, -0.3, 1.7);
  const x2 = x3 - Math.sin(tipAngle) * dist * 0.3;
  const y2 = y3 + Math.cos(tipAngle) * dist * 0.3;

  // Sample the Bézier, then respace it into equal segments so bending is even along it.
  const n = 48;
  const px: number[] = [];
  const py: number[] = [];
  const along: number[] = [0];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    px.push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3);
    py.push(u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
    if (i > 0) along.push(along[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]));
  }
  const length = along[n];
  const s = createStem(id, x0, y0, length / SEGMENTS);
  let j = 0;
  let prevX = x0;
  let prevY = y0;
  for (let k = 1; k <= SEGMENTS; k++) {
    const target = (length * k) / SEGMENTS;
    while (j < n - 1 && along[j + 1] < target) j++;
    const f = (target - along[j]) / (along[j + 1] - along[j] || 1);
    const x = lerp(px[j], px[j + 1], f);
    const y = lerp(py[j], py[j + 1], f);
    s.rest[k - 1] = Math.atan2(x - prevX, prevY - y);
    prevX = x;
    prevY = y;
  }
  return s;
}

/** Recomputes the joints from the rest curve plus the current bend. Branches start at their parent's joint and turn with it. */
export function poseStem(s: Stem) {
  let x = s.rootX;
  let y = s.rootY;
  let offset = 0;
  if (s.parent) {
    const p = s.parent;
    x = p.x[s.attach];
    y = p.y[s.attach];
    const k = Math.min(s.attach, SEGMENTS - 1);
    offset = p.angle[k] - p.rest[k];
  }
  s.x[0] = x;
  s.y[0] = y;
  for (let k = 0; k < SEGMENTS; k++) {
    // Bend grows toward the tip, where the stem is thinnest and the head catches the wind.
    const a = s.rest[k] + offset + s.bend * Math.pow((k + 0.5) / SEGMENTS, 1.5);
    s.angle[k] = a;
    x += s.segment * Math.sin(a);
    y -= s.segment * Math.cos(a);
    s.x[k + 1] = x;
    s.y[k + 1] = y;
  }
}
