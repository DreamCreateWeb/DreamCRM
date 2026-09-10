/**
 * A faithful stand-in for `next/cache`, because the real one cannot run here
 * and the thing it does differently is the thing that breaks.
 *
 * `unstable_cache` refuses to run outside a Next request ("Invariant:
 * incrementalCache missing"), so the suite needs a double. The tempting double
 * is a pass-through — call the function, return the value — and it would hide
 * the entire class of bug this slice exists to prevent. The real cache
 * persists through JSON, so:
 *
 *   - a MISS returns the in-memory value, with real `Date` objects;
 *   - a HIT returns the JSON round-trip, where every Date is now a STRING,
 *     `undefined` has vanished, and `NaN` has flattened to null.
 *
 * A pass-through double makes every test exercise the miss path forever, so a
 * cached payload that crashes on its second read passes the suite. This double
 * reproduces both paths exactly, which is what lets
 * `tests/clinic-site/published-cache.test.ts` assert that they agree.
 */

interface Entry {
  tags: string[]
  json: string
}

/**
 * Anchored to `globalThis`, NOT to module scope.
 *
 * Most callers of this double sit behind `vi.resetModules()` (the suite's
 * stand-in for "a new request"), which rebuilds the module graph — and with a
 * module-scoped Map that silently means a fresh, empty cache per reset, while
 * `afterEach` clears a different instance than the test actually used. The
 * observable symptom is a test seeing the PREVIOUS test's fixture through a
 * cache hit, which is exactly as confusing as it sounds. One store, one reset
 * point, no dependence on registry lifetime.
 */
const store: Map<string, Entry> = ((globalThis as Record<string, unknown>).__dcNextCache ??=
  new Map<string, Entry>()) as Map<string, Entry>

/** Cleared between tests by `tests/setup.ts`. */
export function __resetNextCache(): void {
  store.clear()
}

/** Visible for tests that want to assert on hit/miss directly. */
export function __nextCacheSize(): number {
  return store.size
}

export function unstable_cache<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  keyParts: string[] = [],
  opts: { tags?: string[]; revalidate?: number | false } = {},
): T {
  return (async (...args: Parameters<T>) => {
    const key = JSON.stringify([keyParts, args])
    const hit = store.get(key)
    // A hit comes back through the serializer, exactly as production does.
    if (hit) return JSON.parse(hit.json)

    const result = await fn(...(args as never[]))
    store.set(key, { tags: opts.tags ?? [], json: JSON.stringify(result) })
    // A miss returns the live in-memory value — Dates still Dates. This
    // asymmetry is real, and it is why the loaders normalize outside the
    // boundary rather than trusting what the wrapper hands back.
    return result
  }) as unknown as T
}

/** Drops every entry carrying the tag, like an on-demand revalidation. */
export function updateTag(tag: string): void {
  for (const [key, entry] of Array.from(store.entries())) {
    if (entry.tags.includes(tag)) store.delete(key)
  }
}

export function revalidateTag(tag: string): void {
  updateTag(tag)
}

export function revalidatePath(): void {}
export function refresh(): void {}
