# halftone-flowers

Fully customizeable halftone flower field with semi-random generation, bees, butterflies, and little easter eggs 🌷

![Flower field](https://raw.githubusercontent.com/LucasHJin/halftone-flowers/main/assets/demo.png)

## Install

```sh
npm install halftone-flowers
```

## Requirements

- React 18 or newer (peer dependency)
- ESM only. The package is marked `"use client"` for React Server Components.

## Usage

```tsx
import { FlowerField } from "halftone-flowers";

export function Hero() {
  return (
    <div style={{ height: "100vh" }}>
      <FlowerField />
    </div>
  );
}
```

## API

### `<FlowerField>`

Fills its parent, so the parent needs a height. All props are optional.

| Prop | Type | Default | Description |
|---|---|---|---|
| `colors` | `Partial<HalftoneColors>` | `DEFAULT_COLORS` | `background`, plus the `light`, `ink` and `dark` ramp dots are shaded from. Insects, trails and loose petals use the ramp at the opposite hue. |
| `scheme` | `"light" \| "dark"` | `"light"` | `dark` turns the colours' lightness over for a dark page. |
| `dot` | `"round" \| "square" \| "diamond"` | `"round"` | Dot shape. |
| `curve` | `number` | `0.75` | How far diamond sides curve in, from 0 (straight) to 1 (four-pointed star). |
| `grid` | `"diagonal" \| "straight"` | `"diagonal"` | Staggered rows, or rows and columns. |
| `cell` | `number` | auto | Dot spacing in CSS px. Auto: width / 170, kept within 5 to 10, at least 6 on phones. |
| `steps` | `number` | `6` | Number of evenly spaced dot sizes. |
| `sizes` | `number[]` | | Dot sizes as shares of a full dot's width, smallest first. Overrides `steps`. |
| `shades` | `number` | `15` | Number of shades the colour ramp is split into. |
| `spread` | `number` | `0.1` | Ink bleed as a share of the cell. 0 keeps every dot crisp. |
| `threshold` | `number` | `0.26` | Where bled ink is cut back, 0 to 1. Lower merges dots more. |
| `wind` | `number` | `1` | Multiplier on how far the wind bends stems. |
| `density` | `number` | `1` | Multiplier on the number of stems. |
| `seed` | `number` | random | The same seed grows the same field. |
| `pointer` | `boolean \| PointerMark` | `false` | Prints the pointer into the field in place of the system cursor, at the trail's depth, so it passes behind some flowers and in front of others. `true` prints a dot; see [pointer mark](#pointer-mark). Mouse and pen only, over the canvas itself. |
| `print` | `PrintScene` | | Draws your own marks behind the flowers, so they print as dots in the field's colours and grow in with it; see [printing](#printing). |
| `settings` | `FlowerSettingsInput` | | Fine tuning; any part of the [defaults](#defaults). Arrays replace the default whole. |
| `className` | `string` | | |
| `style` | `CSSProperties` | | Merged over `display: block; width: 100%; height: 100%`. |
| `ref` | `Ref<FlowerFieldHandle>` | | See [ref handle](#ref-handle). |

- Prop changes apply live. `settings.spawn` applies only when the field first appears; change its `key` to grow it in again.
- With `prefers-reduced-motion`, the field is a still image: no insects, petals, trail, pointer mark or click effects, and no events. The system cursor shows.

### Pointer mark

```ts
interface PointerMark {
  /** Cursor image as a URL (SVG data URLs work) or a loaded image. Same-origin or served with CORS. Default a dot. */
  image?: string | HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  /** Image px that sit on the pointer, like the hotspot in CSS `cursor`. Default the image's middle. */
  hotspot?: [number, number];
  /** Multiplier on the mark's size. Default 1. */
  scale?: number;
}
```

Only the image's alpha counts: it prints in the trail's colours, as dots like everything else, so fine lines need scaling up. An 11px crosshair with 1px lines prints as a single dot at `scale: 1` and a plus of dots at `scale: 3`:

```tsx
<FlowerField pointer={{ image: crosshairSvgUrl, hotspot: [5, 5], scale: 3 }} />
```

### Printing

`print` draws on the hidden canvas the field prints from, behind the flowers, in CSS px from the field's top left.

```tsx
const sign: PrintScene = (ctx, { width, tone }) => {
  ctx.font = "700 96px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = tone();
  ctx.fillText("Hello", width - 48, 120);
};

<FlowerField print={sign} />
```

Fill and stroke with `tone(amount, place)`; other colours come out as stray ink. `amount` is dot size, from 0 to 1, default 1. `place` is the spot on the colour ramp: 0 `light`, 0.5 `ink` (default), 1 `dark`. Lines thinner than a dot break up, so keep text large and bold.

It runs each frame, twice while the field grows in. Define it outside the component or in `useCallback`, since a new function each render reapplies every option.

### Ref handle

```ts
interface FlowerFieldHandle {
  /** Sends in a butterfly or bee now; without `kind`, picks one by `settings.insects.odds`. */
  release(kind?: "butterfly" | "bee"): void;
  /** Calls `listener` on each `type` event until the returned function is called. */
  on<T extends FieldEventType>(type: T, listener: (event: FieldEvents[T]) => void): () => void;
}
```

### `useFieldEvents(ref, handlers)`

Subscribes to a field's events from React. Handlers may change every render, and it follows the field across remounts that re-render the component calling it.

```tsx
const field = useRef<FlowerFieldHandle>(null);

useFieldEvents(field, {
  shed: (e) => console.log(`petal off a ${e.kind}, ${e.left} left`),
  trail: (e) => console.log(`trail moving at ${e.speed} px/s`),
});

return <FlowerField ref={field} />;
```

Every event has `type`, `x` and `y` (px from the field's top left), and the field's `width` and `height`.

| Event | When | Fields |
|---|---|---|
| `shed` | A click knocks a petal off a flower. | `kind: Kind`, `left: number` (petals still on it) |
| `nod` | A click nods a flower but takes nothing off. | `kind: Kind` |
| `puff` | A click on empty space puffs out tiny petals. | `count: number` |
| `heart` | A click on an insect sends up a heart. | `insect: "butterfly" \| "bee"` |
| `trail` | Each frame the pointer trail moves, then once at speed 0 when it stops. | `speed: number` (px/s) |

Click events fire inside the `pointerdown`, so a listener can start audio.

### Other exports

- `DEFAULT_SETTINGS`, `DEFAULT_COLORS`: the [defaults](#defaults).
- `schemeColors(colors?, scheme?)`: the colours the field uses for those props, such as its dark-mode background.
- Types: `FlowerFieldProps`, `FlowerFieldOptions`, `FlowerFieldHandle`, `FieldEvents`, `FieldEvent`, `FieldEventType`, `FieldListener`, `FieldPoint`, `FieldEventHandlers`, `PointerMark`, `PrintScene`, `PrintFrame`, `FlowerSettings`, `FlowerSettingsInput`, one type per settings section (`LayoutSettings`, `WindSettings`, ...), `Species`, `Mix`, `Kind`, `InsectKind`, `LeafShape`, `DotShape`, `Grid`, `Scheme`, `HalftoneColors`.

## Defaults

```ts
DEFAULT_COLORS = { background: "#f5f8fd", light: "#a9c5ef", ink: "#3a6fd8", dark: "#16295f" };
```

`DEFAULT_SETTINGS`. A range `[a, b]` means each one picks a value between the two. Sizes are in base flower sizes unless marked px.

```ts
{
  layout: {
    flowerSize: { share: 0.055, min: 24, max: 68 }, // base flower size: share of the shorter side, kept within min..max px
    stems: { spacing: 62, min: 10, max: 26 },        // tall stems: one per `spacing` px of width, kept within min..max
    bouquet: { reach: [0.62, 0.74], inner: 0.42, roots: 0.3 },
    meadow: { amount: 0.8, thicken: 1, span: [0.14, 0.92], height: [0.27, 0.08], slant: [-0.25, 0.95], scatter: 0.8 },
    grass: { corner: 0.7, bottom: 0.9 },             // blades per tall stem
    curveUp: 0.35,                                   // share of stems that curve up instead of arching over
  },
  species: { cosmos: { ... }, ... },                 // how each kind looks; see DEFAULT_SETTINGS.species
  mix: {                                             // relative odds of each kind; 0 or left out never grows it
    bouquet: { cosmos: 3, spike: 2.2, poppy: 1.6, plume: 1.5, tulip: 1.3, daisy: 1.3, cluster: 1.3, rose: 1, lily: 0.8, bud: 0.8, iris: 1.2, daffodil: 1.1, peony: 1, turksCap: 1 },
    meadow: { daisy: 3, cluster: 2.4, cosmos: 1.4, bud: 1.2, poppy: 1, tulip: 1, spike: 0.8, rose: 0.5, daffodil: 1 },
  },
  tone: { flowers: [0.6, 1], stems: [0.55, 0.85], grass: [0.4, 0.7] }, // print strength, back to front
  shade: { depth: 0.19, jitter: 0.09, light: 0.3 },
  wind: {
    lean: 0.3,                                       // steady push right; negative pushes left
    waves: [                                         // strength, seconds between crests, px between crests
      { strength: 0.42, period: 12.57, length: 1963 },
      { strength: 0.2, period: 5.56, length: 1030, phase: 1.7 },
      { strength: 0.08, period: 2.42, length: 524, height: 1257 },
    ],
  },
  sway: { speed: 1, damping: 0.17, grassDamping: 0.1 },
  cursor: { strength: 0.055, limit: 3.5, rise: 0.5, fade: 2, reach: 0.55 }, // strength 0: the pointer doesn't push stems
  spawn: { enabled: true, duration: 1.5, grow: 0.5, climb: [0.25, 0.45], scatter: 0.1, order: 0.6 },
  insects: {
    enabled: true,
    every: 18,                                       // average seconds between arrivals
    most: 3,                                         // most at once
    odds: [1, 1],                                    // butterfly, bee
    size: 1,
    speed: 1,
    visits: [0, 3],                                  // flowers visited before leaving
    stay: [1.5, 5],                                  // seconds on each flower
    trail: { fade: 2.5, width: 3.5, strength: 0.9 },
    heart: { enabled: true, size: [1, 1.5], draw: [0.65, 0.9], swell: [0.2, 0.35], fade: [0.6, 0.8] },
  },
  petals: { enabled: true, size: 1, speed: 1, sink: 0.4, loops: 8, wait: [0.1, 0.2], turn: [1, 1.4] },
  trail: { enabled: true, hold: 0.4, fade: 0.4, width: 3.5, strength: 0.9, strands: 3, spread: 14, wave: 150, flow: 3, lag: 0.02 },
  splash: { enabled: true, count: [8, 14], size: [0.55, 0.9], reach: [0.8, 2] },
}
```

Every setting's full description is in its type, shown on hover in your editor.
