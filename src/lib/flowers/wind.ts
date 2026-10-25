/** Wind strength at a point and time: positive pushes right. Swells roll across the bed from the left. */
export function windAt(x: number, y: number, t: number) {
  const swell = 0.42 * Math.sin(t * 0.5 - x * 0.0032) + 0.2 * Math.sin(t * 1.13 - x * 0.0061 + 1.7);
  const flutter = 0.08 * Math.sin(t * 2.6 - x * 0.012 + y * 0.005);
  return 0.3 + swell + flutter;
}
