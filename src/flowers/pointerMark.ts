/**
 * What `FlowerFieldOptions.pointer` prints at the pointer in place of the system
 * cursor: a dot, or a cursor image's alpha, inked in the trail's colours.
 */
import { TAU } from "../utils/math.js";

export interface PointerMark {
  /**
   * Cursor image to print, as a URL (SVG data URLs work) or a loaded image. Only its alpha counts:
   * it prints in the trail's colours. Must be same-origin or served with CORS. Default a dot.
   */
  image?: string | HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  /** Image px that sit on the pointer, like the hotspot in CSS `cursor`. Default the image's middle. */
  hotspot?: [number, number];
  /** Multiplier on the mark's size. A fine image prints as only a few dots at 1. Default 1. */
  scale?: number;
}

/** The dot's radius, as a share of the diamond width. */
const DOT = 0.75;

type Source = NonNullable<PointerMark["image"]>;
type Loaded = Exclude<Source, string>;

export class Mark {
  private source: Source | undefined;
  /** `source` once loaded and checked, or null to print the dot. */
  private image: Loaded | null = null;
  private size: [number, number] = [0, 0];
  private hotspot: [number, number] | undefined;
  private scale = 1;
  /** `image` at `scale`, filled with `colour` where it shows. */
  private sprite: HTMLCanvasElement | null = null;
  private colour = "";

  set({ image, hotspot, scale = 1 }: PointerMark) {
    this.hotspot = hotspot;
    if (scale !== this.scale) this.colour = "";
    this.scale = scale;
    if (image === this.source) return;
    this.source = image;
    this.image = null;
    if (!image) return;
    load(image).then(
      (loaded) => {
        if (this.source !== image) return;
        this.size = sizeOf(loaded);
        this.colour = "";
        this.image = this.size[0] && this.size[1] ? loaded : null;
        // The scene must stay readable: a tainted sprite would taint it and stop the halftone printing.
        if (this.image && !this.inked("#000")) this.image = null;
        if (!this.image) console.warn("halftone-flowers: the pointer image has no size or is cross-origin without CORS, so a dot prints instead.");
      },
      () => {
        if (this.source === image) console.warn("halftone-flowers: the pointer image failed to load, so a dot prints instead.");
      },
    );
  }

  /** Px from the pointer to the mark's furthest edge, for diamonds `cell` px wide. */
  reach(cell: number) {
    if (!this.image) return DOT * cell * this.scale;
    const [w, h] = this.size;
    const [x, y] = this.hotspot ?? [w / 2, h / 2];
    return Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) * this.scale;
  }

  /** Paints it at (x, y) in `colour`, `grow` times its size. */
  paint(ctx: CanvasRenderingContext2D, x: number, y: number, grow: number, colour: string, cell: number) {
    const sprite = this.image && this.inked(colour);
    const s = this.scale * grow;
    if (!sprite) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, DOT * cell * s, 0, TAU);
      ctx.fill();
      return;
    }
    const [w, h] = this.size;
    const [hx, hy] = this.hotspot ?? [w / 2, h / 2];
    ctx.drawImage(sprite, x - hx * s, y - hy * s, w * s, h * s);
  }

  /** The sprite in `colour`, redrawn only when that or the scale changes; null if reading it back throws. */
  private inked(colour: string) {
    if (colour === this.colour && this.sprite) return this.sprite;
    const [w, h] = this.size;
    const sprite = Object.assign(document.createElement("canvas"), { width: Math.ceil(w * this.scale), height: Math.ceil(h * this.scale) });
    const ctx = sprite.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(this.image!, 0, 0, sprite.width, sprite.height);
    try {
      ctx.getImageData(0, 0, 1, 1);
    } catch {
      return null;
    }
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, sprite.width, sprite.height);
    this.sprite = sprite;
    this.colour = colour;
    return sprite;
  }
}

function load(source: Source): Promise<Loaded> {
  if (typeof source !== "string" && !(source instanceof HTMLImageElement && !source.complete)) return Promise.resolve(source);
  const img = typeof source === "string" ? new Image() : source;
  return new Promise((resolve, reject) => {
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", reject, { once: true });
    if (typeof source === "string") {
      img.crossOrigin = "anonymous";
      img.src = source;
    }
  });
}

function sizeOf(image: Loaded): [number, number] {
  return image instanceof HTMLImageElement ? [image.naturalWidth, image.naturalHeight] : [image.width, image.height];
}
