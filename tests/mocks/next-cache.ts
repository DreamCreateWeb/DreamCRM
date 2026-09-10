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

/**
 * WHAT IS MODELLED HERE, AND ON WHAT AUTHORITY.
 *
 * The serialization above is a FACT: a hit really does come back through JSON.
 * The invalidation below is a MODEL — "drops every entry carrying the tag" is
 * our reading of Next, not something this file can prove, and a test that
 * calls it is confirming the model rather than Next. Review caught that
 * distinction when the two halves of this file were presented as equally
 * solid; they are not, and saying so here is the point.
 *
 * The model is grounded rather than assumed. Read against Next 16.2.10's own
 * source, `revalidateTag`/`updateTag` both reach
 * `incrementalCache.revalidateTag(tags, durations)`, which is the same
 * incremental cache `unstable_cache` writes its tagged entries to — so
 * dropping tagged entries is the right shape. `tests/clinic-site/
 * next-cache-contract.test.ts` pins the observable parts of that chain
 * against the REAL module, and fails on a Next upgrade that moves them.
 *
 * What is still NOT modelled, deliberately: eviction timing, the `expire`
 * duration, stale-while-revalidate, and the distinction between "expired" and
 * "gone". Immediate removal is the strictest reading, so a test that passes
 * here would also pass against a slower real cache; nothing in this suite
 * should be read as proving latency.
 */
export function revalidateTag(tag: string, _profile?: string | { expire?: number }): void {
  for (const [key, entry] of Array.from(store.entries())) {
    if (entry.tags.includes(tag)) store.delete(key)
  }
}

/**
 * Real `updateTag` THROWS unless called from a Server Action — which is why
 * production moved off it. Kept here only so an accidental reintroduction
 * fails the way Next would, rather than quietly working in tests.
 */
export function updateTag(_tag: string): void {
  throw Object.assign(
    new Error(
      'updateTag can only be called from within a Server Action. ' +
        'To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.',
    ),
    { __NEXT_ERROR_CODE: 'E872' },
  )
}

export function revalidatePath(): void {}
export function refresh(): void {}
