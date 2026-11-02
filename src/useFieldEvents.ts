import { useEffect, useRef, type RefObject } from "react";
import type { FlowerFieldHandle } from "./FlowerField.js";
import type { FieldEventType, FieldListener } from "./flowers/index.js";

export type FieldEventHandlers = { [T in FieldEventType]?: FieldListener<T> };

const TYPES = Object.keys({ shed: 0, nod: 0, puff: 0, heart: 0, trail: 0, insect: 0, touch: 0 } satisfies Record<FieldEventType, 0>) as FieldEventType[];

/**
 * Calls `handlers` on events from the `FlowerField` that `field` is the ref of. Handlers may be
 * new functions every render. Follows the field across remounts (such as a new `key`) that
 * re-render the component calling this.
 */
export function useFieldEvents(field: RefObject<FlowerFieldHandle | null>, handlers: FieldEventHandlers) {
  const latest = useRef(handlers);
  const bound = useRef<{ handle: FlowerFieldHandle; off: () => void } | null>(null);

  // No deps: a remount swaps `field.current` without changing `field`, so it's checked after every render.
  useEffect(() => {
    latest.current = handlers;
    const handle = field.current;
    if (bound.current?.handle === handle) return;
    bound.current?.off();
    bound.current = null;
    if (!handle) return;
    const offs = TYPES.map((type) => handle.on(type, (event) => (latest.current[type] as FieldListener<typeof type> | undefined)?.(event)));
    bound.current = { handle, off: () => offs.forEach((off) => off()) };
  });

  useEffect(
    () => () => {
      bound.current?.off();
      bound.current = null;
    },
    [],
  );
}
