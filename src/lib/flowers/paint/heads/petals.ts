/**
 * Petals modelled in 3D and flattened onto the canvas, for heads whose petals
 * curl too far out of one plane to draw as a tilted disc. Points are in the
 * head's local frame: x right, y toward the stem, z toward the viewer.
 */

export type Vec = [number, number, number];

/** A head's own axes: `axis` points out of the flower's face, `u` and `v` span the plane across it. */
export interface Frame {
  u: Vec;
  v: Vec;
  axis: Vec;
}

/**
 * The frame of a head that faces `face` of the way toward the viewer (1 faces
 * you, 0 points along the stem), turned `turn` radians about the stem. At turn
 * 0 its petal plane flattens the same way as paintDisc's.
 */
export function headFrame(face: number, turn: number): Frame {
  const s = face;
  const c = Math.sqrt(1 - s * s);
  const sin = Math.sin(turn);
  const cos = Math.cos(turn);
  return { u: [cos, 0, -sin], v: [c * sin, s, c * cos], axis: [s * sin, -c, s * cos] };
}

/** The point `r` px out from the axis at angle `phi` around it, and `a` px along it toward the face. */
export function point(f: Frame, phi: number, r: number, a: number): Vec {
  const x = Math.cos(phi) * r;
  const y = Math.sin(phi) * r;
  return [
    x * f.u[0] + y * f.v[0] + a * f.axis[0],
    x * f.u[1] + y * f.v[1] + a * f.axis[1],
    x * f.u[2] + y * f.v[2] + a * f.axis[2],
  ];
}

export interface PetalShape {
  /** Where the petal starts: px out from the axis, and px along it toward the face. */
  start: [number, number];
  length: number;
  /** Widest across, px. */
  width: number;
  /** Direction at the base, in the plane through the axis: 0 straight out, π/2 along the axis toward the face. */
  heading: number;
  /** How far the petal turns by its tip, radians: positive curls in over the face, negative curls back. */
  bend: number;
  /** Above 1 saves the turning for near the tip. */
  curl?: number;
  /** How quickly it widens from the base and narrows to the tip: low is blunt, 1 is pointed. */
  taper: [number, number];
  /** How far its edges lift toward its inner face, as a share of the half-width, so it has body seen edge-on. */
  cup: number;
}

export interface Petal {
  /** The petal either side of its midrib. Fill them separately: seen edge-on they overlap, and one path would cancel out there. */
  halves: [Path2D, Path2D];
  /** Mean depth, for drawing back to front. */
  z: number;
  /** The midrib from base to tip, as x, y pairs. */
  rib: number[];
}

const STEPS = 10;

/** One petal at angle `phi` around the axis, its midrib running out in the plane through the axis. */
export function petal(f: Frame, phi: number, shape: PetalShape): Petal {
  const { start, length, width, heading, bend, curl = 1, taper, cup } = shape;
  const [p, q] = taper;
  const peak = (p / (p + q)) ** p * (q / (p + q)) ** q;
  const across = point(f, phi + Math.PI / 2, 1, 0);
  const rib: number[] = [];
  const edges: [number[], number[]] = [[], []];
  let [r, a] = start;
  let z = 0;
  let prev = 0;
  for (let i = 0; i <= STEPS; i++) {
    // Samples bunch up toward the tip, where the outline turns fastest.
    const k = Math.sin(((i / STEPS) * Math.PI) / 2);
    const b = heading + bend * k ** curl;
    r += Math.cos(b) * length * (k - prev);
    a += Math.sin(b) * length * (k - prev);
    prev = k;
    const half = ((width / 2) * (k ** p * (1 - k) ** q)) / peak;
    const c = point(f, phi, r, a);
    const lift = point(f, phi, -Math.sin(b), Math.cos(b));
    rib.push(c[0], c[1]);
    z += c[2];
    for (const [side, edge] of [[1, edges[0]], [-1, edges[1]]] as const) {
      edge.push(c[0] + side * half * across[0] + cup * half * lift[0], c[1] + side * half * across[1] + cup * half * lift[1]);
    }
  }
  const halves = edges.map((edge) => {
    const path = new Path2D();
    path.moveTo(rib[0], rib[1]);
    for (let i = 2; i < edge.length; i += 2) path.lineTo(edge[i], edge[i + 1]);
    for (let i = rib.length - 4; i >= 0; i -= 2) path.lineTo(rib[i], rib[i + 1]);
    path.closePath();
    return path;
  }) as [Path2D, Path2D];
  return { halves, z: z / (STEPS + 1), rib };
}

export function fillPetal(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.fill(p.halves[0]);
  ctx.fill(p.halves[1]);
}

/** The circle `r` px around the axis, `a` px along it, as x, y pairs. */
export function ring(f: Frame, a: number, r: number, n = 20) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = point(f, (i / n) * Math.PI * 2, r, a);
    out.push(c[0], c[1]);
  }
  return out;
}

/** A solid of revolution around the axis, such as a trumpet: `profile` lists [px along the axis, radius] from one end to the other. */
export function tube(f: Frame, profile: [number, number][]) {
  const path = new Path2D();
  let prev = ring(f, ...profile[0]);
  for (let i = 1; i < profile.length; i++) {
    const next = ring(f, ...profile[i]);
    polygon(path, hull(prev.concat(next)));
    prev = next;
  }
  return path;
}

/** Adds the closed outline through x, y pairs to `path`. */
export function polygon(path: Path2D, pts: number[]) {
  path.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
  path.closePath();
}

/** Convex hull of x, y pairs (Andrew's monotone chain), always wound the same way so hulls in one path add up. */
function hull(flat: number[]) {
  const pts: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1)).flat();
}

export interface Part {
  z: number;
  paint: () => void;
}

/** Paints parts from the furthest back to the nearest. */
export function paintInDepth(parts: Part[]) {
  parts.sort((a, b) => a.z - b.z);
  for (const part of parts) part.paint();
}
