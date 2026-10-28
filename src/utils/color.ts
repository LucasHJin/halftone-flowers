type Lab = [number, number, number];

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour as sRGB channels from 0 to 1, read back through a canvas so names and rgb() work too. */
function parse(colour: string): [number, number, number] {
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return [0, 0, 0];
  probe.fillStyle = "#000";
  probe.fillStyle = colour;
  // Canvases normalise opaque colours to #rrggbb and the rest to rgba().
  const value = probe.fillStyle;
  if (value.startsWith("#")) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [number, number, number];
  const [r, g, b] = value.match(/[\d.]+/g)!.map(Number);
  return [r / 255, g / 255, b / 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** OKLab, from https://bottosson.github.io/posts/oklab/ */
function toLab(colour: string): Lab {
  const [r, g, b] = parse(colour).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear sRGB channels, outside 0 to 1 where the screen can't show the colour. */
function toLinearRgb([L, A, B]: Lab) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function fromLab(lab: Lab) {
  return `#${toLinearRgb(lab).map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const inGamut = (lab: Lab) => toLinearRgb(lab).every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** OKLCH hue of a colour, in degrees. */
export function hueOf(colour: string) {
  const [, A, B] = toLab(colour);
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}

/**
 * `colour` turned to OKLCH `hue` in degrees, with its chroma times `vividness`
 * (0 grey). It keeps its OKLCH lightness, so it looks just as light whatever
 * the hue or vividness. Where a screen can't show that much chroma at this
 * lightness and hue, it takes the most the screen can.
 */
export function withHue(colour: string, hue: number, vividness = 1) {
  const [L, A, B] = toLab(colour);
  const h = (hue * Math.PI) / 180;
  const at = (c: number): Lab => [L, c * Math.cos(h), c * Math.sin(h)];
  let c = Math.hypot(A, B) * vividness;
  if (!inGamut(at(c))) {
    let lo = 0;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + c) / 2;
      if (inGamut(at(mid))) lo = mid;
      else c = mid;
    }
    c = lo;
  }
  return fromLab(at(c));
}

/** `n` colours evenly spaced along a ramp through `stops`, mixed in OKLab so the steps look even. */
export function ramp(stops: string[], n: number): string[] {
  const labs = stops.map(toLab);
  return Array.from({ length: n }, (_, i) => {
    const at = (n === 1 ? 0.5 : i / (n - 1)) * (labs.length - 1);
    const k = Math.min(Math.floor(at), labs.length - 2);
    const t = at - k;
    const [a, b] = [labs[k], labs[k + 1]];
    return fromLab([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  });
}
