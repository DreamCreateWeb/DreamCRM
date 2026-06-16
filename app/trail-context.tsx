'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  parseTrail,
  pathnameOf,
  recordStop,
  resolveTrailLabel,
  trailStorageKey,
  isTrailStorageKey,
  type TrailModule,
  type TrailStop,
} from '@/lib/trail'

/**
 * Journey-trail React binding (pure logic lives in `lib/trail.ts`). Mirrors the
 * existing client-context conventions (app-provider / flyout-context): a single
 * `'use client'` provider exposing a small hook.
 *
 * On every pathname/search change it computes the current stop (auto-labeled
 * from the module registry) and folds it into the trail via `recordStop`,
 * persisting to sessionStorage (`dc.trail`) — per-tab, survives client nav +
 * reload, resets on a new tab. It NEVER navigates on its own; `back()`/`goTo()`
 * are user-initiated and just `router.push` the stored url (the record effect
 * then reconciles the trail via the truncate rule, so the browser back button
 * keeps working normally).
 */
interface TrailContextValue {
  /** Oldest → newest. The last entry is always the current page. */
  trail: TrailStop[]
  /** The stop one below the current top (where "← Back" goes), or null. */
  previous: TrailStop | null
  /** Navigate to the previous stop (no-op when there isn't one). */
  back: () => void
  /** Navigate to the stop at `index` in the trail (ignored when out of range). */
  goTo: (index: number) => void
  /** Override the CURRENT top stop's label (detail pages use this). */
  setLabel: (label: string) => void
}

const TrailContext = createContext<TrailContextValue | undefined>(undefined)

export function TrailProvider({
  modules,
  scope,
  children,
}: {
  /** `{ path, label }` for the tenant's visible modules — drives auto-labels. */
  modules: TrailModule[]
  /**
   * The tenant+user scope (e.g. `${userId}:${organizationId}`) that namespaces
   * the persisted trail. Trail labels can be PHI (a patient name), so the trail
   * MUST be isolated per user + org — otherwise a tab that spanned two clinics
   * (a platform admin in a demo clinic, then a real clinic) leaks one clinic's
   * patient names into the other.
   */
  scope: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const storageKey = trailStorageKey(scope)

  // Hydrate from sessionStorage once on mount (per-tab persistence). SSR has no
  // storage, so the first client render starts empty and reconciles here — the
  // back chip renders nothing until trail.length > 1 anyway, so no flash.
  const [trail, setTrail] = useState<TrailStop[]>([])
  const hydrated = useRef(false)
  useEffect(() => {
    try {
      // PHI hygiene: sweep any trail from a DIFFERENT user/org (or the legacy
      // un-scoped key) lingering in this tab — it must never resurface here.
      for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
        const k = window.sessionStorage.key(i)
        if (k && isTrailStorageKey(k) && k !== storageKey) window.sessionStorage.removeItem(k)
      }
      setTrail(parseTrail(window.sessionStorage.getItem(storageKey)))
    } catch {
      /* storage unavailable — trail just stays in-memory for this session */
    }
    hydrated.current = true
  }, [storageKey])

  // The full current url (pathname + search). `useSearchParams` returns a
  // stable-enough snapshot per navigation; we serialize so the effect below
  // re-runs on filter changes too (same pathname, new search).
  const search = searchParams?.toString() ?? ''
  const url = search ? `${pathname}?${search}` : pathname

  // Record the current stop whenever the url changes (after hydration, so we
  // fold onto the restored trail rather than clobbering it). Auto-labels from
  // the registry; a later setLabel() override refines the top in place.
  useEffect(() => {
    if (!hydrated.current) return
    setTrail((prev) => {
      const stop: TrailStop = {
        pathname,
        url,
        label: resolveTrailLabel(url, modules),
      }
      const next = recordStop(prev, stop)
      if (next !== prev) persist(storageKey, next)
      return next
    })
    // `modules` is stable per render group; depend on the url + pathname only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, url])

  const setLabel = useCallback(
    (label: string) => {
      const clean = label.trim()
      if (!clean) return
      setTrail((prev) => {
        const top = prev[prev.length - 1]
        // Only override the CURRENT page's stop, and only when it changes.
        if (!top || top.pathname !== pathname || top.label === clean) return prev
        const next = prev.slice()
        next[next.length - 1] = { ...top, label: clean }
        persist(storageKey, next)
        return next
      })
    },
    [pathname, storageKey],
  )

  const goTo = useCallback(
    (index: number) => {
      const target = trail[index]
      if (!target) return
      // User-initiated only. Push the stored url; the record effect reconciles
      // the trail (truncate rule) once the new pathname lands.
      router.push(target.url)
    },
    [trail, router],
  )

  const previous = trail.length >= 2 ? trail[trail.length - 2] : null
  const back = useCallback(() => {
    if (trail.length < 2) return
    router.push(trail[trail.length - 2].url)
  }, [trail, router])

  const value = useMemo<TrailContextValue>(
    () => ({ trail, previous, back, goTo, setLabel }),
    [trail, previous, back, goTo, setLabel],
  )

  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>
}

function persist(key: string, trail: TrailStop[]) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(trail))
  } catch {
    /* ignore — persistence is a nicety, the in-memory trail still works */
  }
}

/**
 * Read the trail + actions. Safe outside a provider (returns an inert trail) so
 * components like `<TrailBack>` can mount in any shell without throwing — they
 * simply render nothing when the trail is empty.
 */
export function useTrail(): TrailContextValue {
  const ctx = useContext(TrailContext)
  if (ctx) return ctx
  return INERT
}

const INERT: TrailContextValue = {
  trail: [],
  previous: null,
  back: () => {},
  goTo: () => {},
  setLabel: () => {},
}

/**
 * Detail-page hook: override the current top stop's label so the trail reads
 * "← Olivia Lopez" instead of "← Patients". No-op if unchanged or if the page
 * has navigated away (setLabel guards on the current pathname). The label just
 * rides the stop — no cleanup needed.
 *
 * Other detail routes (`/shop/products/[id]`, `/careers/[id]`, `/posts/[id]`)
 * can call this with their entity's name; the registry longest-prefix fallback
 * already gives them a sensible default, so it's optional.
 */
export function useTrailLabel(label: string | null | undefined) {
  const { setLabel, trail } = useTrail()
  // Key the effect on the current top stop too, not just `label`. On first
  // mount, child effects fire before the provider's record effect, so the trail
  // is briefly empty and a setLabel would no-op; re-running once the top stop
  // lands (its url is in the deps) lets the override stick. `setLabel` itself
  // ignores no-op/wrong-page calls, so the extra runs are cheap.
  const topPath = trail[trail.length - 1]?.pathname
  const topUrl = trail[trail.length - 1]?.url
  useEffect(() => {
    if (label && label.trim()) setLabel(label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, setLabel, topPath, topUrl])
}
