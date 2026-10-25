/** Any part of T, at any depth. Arrays are replaced whole, not merged. */
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** `base` with whatever `patch` sets laid over it, at any depth. Neither is changed. */
export function mergeDeep<T>(base: T, patch: DeepPartial<NoInfer<T>> | undefined): T {
  if (patch === undefined) return base;
  if (Array.isArray(patch) || typeof patch !== "object" || patch === null || typeof base !== "object" || base === null) return patch as T;
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = mergeDeep(out[key], value);
  }
  return out as T;
}
