import type { InsectKind } from "./insects/index.js";
import type { Kind } from "./types.js";

/** Where it happened, px from the field's top left, and the field's size, so `x / width` runs 0 to 1 across it. */
export interface FieldPoint {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Events from a `FlowerField`, by type. Click events fire inside the pointerdown, so a listener can start audio. */
export interface FieldEvents {
  /** A click knocked a petal off a flower. */
  shed: FieldPoint & {
    type: "shed";
    kind: Kind;
    /** Petals still on it. */
    left: number;
  };
  /** A click nodded a flower but took nothing off: it's bare, or no petal is near the click. */
  nod: FieldPoint & { type: "nod"; kind: Kind };
  /** A click on empty space puffed out `count` tiny petals. */
  puff: FieldPoint & { type: "puff"; count: number };
  /** A click on a butterfly or bee sent up a heart. */
  heart: FieldPoint & { type: "heart"; insect: InsectKind };
  /** Each frame the pointer trail's head moves, at that head, which eases after the pointer. Ends with one at speed 0. */
  trail: FieldPoint & {
    type: "trail";
    /** Px a second. */
    speed: number;
  };
}

export type FieldEventType = keyof FieldEvents;
export type FieldEvent = FieldEvents[FieldEventType];
export type FieldListener<T extends FieldEventType> = (event: FieldEvents[T]) => void;

type ClickType = Exclude<FieldEventType, "trail">;
/** What a click did, before `FlowerEngine` adds where. */
export type Tapped = { [T in ClickType]: Omit<FieldEvents[T], keyof FieldPoint> }[ClickType];

export class FieldEmitter {
  private listeners = new Map<FieldEventType, Set<(event: never) => void>>();

  /** Returns a function that removes `listener`. */
  on<T extends FieldEventType>(type: T, listener: FieldListener<T>) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  has(type: FieldEventType) {
    return !!this.listeners.get(type)?.size;
  }

  emit(event: FieldEvent) {
    for (const listener of this.listeners.get(event.type) ?? []) {
      // Listeners run inside the frame loop and pointer handler; a throw there would stop the field.
      try {
        (listener as (event: FieldEvent) => void)(event);
      } catch (error) {
        reportError(error);
      }
    }
  }
}
