/**
 * Journey-trail model — the pure, framework-free core of the labeled
 * history-of-stops back-navigation system (see `app/trail-context.tsx` for the
 * React binding and `components/ui/trail-back.tsx` for the only visible UI).
 *
 * The dashboard's information architecture is FLAT (1–2 levels), so a
 * hierarchical parent>child breadcrumb would be wrong. Instead we record the
 * *sequence of module visits* a user actually makes — like a browser back
 * button, but labeled, filter-preserving, and multi-step — so going back is
 * effortless without ever auto-navigating.
 *
 * Everything here is a pure function with no DOM/Next dependency so the record
 * rules and label resolution can be unit-tested directly.
 */

/** A single stop on the trail = one dashboard page the user visited. */
export interface TrailStop {
  /**
   * The module identity, keyed by pathname (no search). Two visits to the same
   * pathname with different filters are the SAME stop — a filter change never
   * creates a new entry.
   */
  pathname: string
  /**
   * The latest FULL url (pathname + search) for this stop, so returning to it
   * restores the filter/search state the user left it in.
   */
  url: string
  /** Human label shown in the back chip / jump menu (e.g. "Patients"). */
  label: string
}

/** Max stops kept in the trail; the oldest is dropped past this. */
export const TRAIL_CAP = 10

/** sessionStorage key PREFIX the trail persists under (per-tab; resets on new tab). */
export const TRAIL_STORAGE_KEY = 'dc.trail'

/**
 * The per-(user+org) sessionStorage key. Trail LABELS can be PHI — a patient's
 * name on a detail page rides the stop — so the trail MUST NOT cross a tenant or
 * user boundary, even within one browser tab (e.g. a platform admin who viewed a
 * demo clinic's patients then signs into a real clinic; two staff sharing a
 * machine). Namespacing the key by user + org isolates each scope's trail;
 * `app/trail-context.tsx` also sweeps any other-scope (or legacy un-scoped)
 * entries from the tab on mount so stale PHI can never resurface.
 */
export function trailStorageKey(scope: string): string {
  return `${TRAIL_STORAGE_KEY}:${scope}`
}

/** True for a sessionStorage key that belongs to the trail system (any scope,
 *  incl. the legacy un-scoped key). Used to sweep foreign-scope trails. */
export function isTrailStorageKey(key: string): boolean {
  return key === TRAIL_STORAGE_KEY || key.startsWith(`${TRAIL_STORAGE_KEY}:`)
}

/**
 * Minimal shape of a module needed for label resolution — the shell passes
 * `{ path, label }` pairs derived from the tenant's visible `ModuleDef[]`.
 */
export interface TrailModule {
  path: string
  label: string
}

/**
 * Refinement map: exact pathname → a better label than the owning module's.
 * The longest-prefix module fallback already covers module roots and most
 * detail routes (`/patients/123` → "Patients"); this map only handles
 * sub-pages whose owning module's label would read wrong (e.g. `/shop/orders`
 * should say "Orders", not "Shop"). Settings sub-pages collapse to one label
 * so the trail never fills with "Account"/"Billing"/"Plan" noise.
 */
export const SUBROUTE_LABELS: Record<string, string> = {
  '/shop/orders': 'Orders',
  '/shop/memberships': 'Memberships',
  '/shop/coupons': 'Coupons',
  '/shop/payments': 'Payments',
  '/shop/products': 'Products',
  '/growth/reviews': 'Reviews',
  '/growth/reviews/received': 'Reviews',
  '/growth/outreach': 'Recall & Outreach',
  '/growth/outreach/queue': 'Outreach',
  '/growth/campaigns': 'Campaigns',
  '/growth/audiences': 'Audiences',
  '/growth/social': 'Social Posts',
  '/growth/analytics': 'Analytics',
  '/inbox': 'Mailbox',
}

/**
 * Resolve a stop label for a pathname (the `url`'s pathname). Precedence:
 *   1. `override` (a detail page set it via `useTrailLabel`, e.g. a patient name)
 *   2. exact `SUBROUTE_LABELS[pathname]`
 *   3. the Settings family → "Settings" (any `/settings` or `/settings/*`)
 *   4. the longest module `path` that prefixes the pathname → its label
 *      (covers module roots AND detail routes like `/patients/[id]`)
 *   5. a prettified last path segment
 */
export function resolveTrailLabel(
  url: string,
  modules: TrailModule[],
  subrouteMap: Record<string, string> = SUBROUTE_LABELS,
  override?: string,
): string {
  if (override && override.trim()) return override.trim()

  const pathname = pathnameOf(url)

  // Exact subroute refinement.
  const exact = subrouteMap[pathname]
  if (exact) return exact

  // Settings family collapses to one label.
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'Settings'

  // Longest module prefix wins (so `/shop/products/abc` resolves to the
  // /shop/products subroute above, but `/patients/abc` resolves to Patients).
  let best: TrailModule | null = null
  for (const m of modules) {
    if (!m.path) continue
    const isPrefix =
      m.path === '/'
        ? pathname === '/'
        : pathname === m.path || pathname.startsWith(`${m.path}/`)
    if (isPrefix && (!best || m.path.length > best.path.length)) best = m
  }
  if (best) return best.label

  // Fallback: prettify the last meaningful path segment.
  return prettifySegment(pathname)
}

/** Extract the pathname (drop ?search and #hash) from a full url. */
export function pathnameOf(url: string): string {
  const noHash = url.split('#')[0] ?? url
  const noSearch = noHash.split('?')[0] ?? noHash
  return noSearch || '/'
}

/** "/shop/order-history" → "Order history"; "/" → "Home". */
export function prettifySegment(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean)
  const last = segs[segs.length - 1]
  if (!last) return 'Home'
  const words = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim()
  if (!words) return 'Home'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Record a stop into the trail (pure reducer — the heart of the system).
 *
 * Rules, in order:
 *   1. Same pathname as the current top → REPLACE the top's `url` (a filter
 *      change is the same stop, not a new entry). Keep the existing label
 *      unless the freshly-computed auto-label differs meaningfully.
 *   2. Pathname exists earlier in the trail → TRUNCATE to that index
 *      (inclusive) and set its `url` to the new url. This collapses loops:
 *      A→B→A yields [A]; A→B→C then revisiting B yields [A, B].
 *   3. Otherwise → PUSH.
 * Always capped to the last {@link TRAIL_CAP} stops (oldest dropped). Dedup is
 * implicit in the rules — the trail never holds the same pathname twice.
 *
 * The returned array is always a new reference when anything changed; callers
 * may rely on identity to skip redundant state/storage writes.
 */
export function recordStop(trail: TrailStop[], stop: TrailStop): TrailStop[] {
  const top = trail[trail.length - 1]

  // Rule 1 — same pathname as the top: update url (+ maybe label) in place.
  if (top && top.pathname === stop.pathname) {
    // A meaningful auto-label change (e.g. an override arrived) wins; otherwise
    // keep the label already on the stop so a bare filter change doesn't churn.
    const nextLabel = stop.label && stop.label !== top.label ? stop.label : top.label
    if (top.url === stop.url && top.label === nextLabel) return trail // no-op
    const next = trail.slice()
    next[next.length - 1] = { pathname: top.pathname, url: stop.url, label: nextLabel }
    return next
  }

  // Rule 2 — pathname seen earlier: truncate back to it (loop collapse).
  const priorIndex = trail.findIndex((s) => s.pathname === stop.pathname)
  if (priorIndex !== -1) {
    const next = trail.slice(0, priorIndex + 1)
    const prior = next[priorIndex]
    next[priorIndex] = {
      pathname: prior.pathname,
      url: stop.url,
      // Returning keeps the prior label unless a new label is supplied.
      label: stop.label && stop.label !== prior.label ? stop.label : prior.label,
    }
    return next
  }

  // Rule 3 — new stop: push, then cap to the last TRAIL_CAP entries.
  const next = [...trail, stop]
  return next.length > TRAIL_CAP ? next.slice(next.length - TRAIL_CAP) : next
}

/** Parse a persisted trail from sessionStorage JSON; returns [] on anything off. */
export function parseTrail(raw: string | null): TrailStop[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const cleaned = data.filter(
      (s): s is TrailStop =>
        !!s &&
        typeof s.pathname === 'string' &&
        typeof s.url === 'string' &&
        typeof s.label === 'string',
    )
    // Defensive: enforce the cap even if storage was tampered with.
    return cleaned.length > TRAIL_CAP ? cleaned.slice(cleaned.length - TRAIL_CAP) : cleaned
  } catch {
    return []
  }
}
