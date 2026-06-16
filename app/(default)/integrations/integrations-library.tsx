'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { ZERNIO_PLATFORM_LABELS, type ZernioPlatform } from '@/lib/types/zernio'
import type { Tone } from '@/lib/ui/encodings'
import { BrandLogo, BrandLogoWell, BRAND_ACCENTS, type BrandLogoId } from '@/components/integrations/brand-logos'
import {
  CATEGORY_META,
  searchableText,
  type IntegrationCategory,
  type IntegrationDef,
} from '@/lib/integrations/catalog'
import { connectedCount, type ResolvedIntegration } from '@/lib/integrations/resolve'
import {
  syncZernioAccountsAction,
  disconnectChannelAction,
  buySocialAddonAction,
  cancelSocialAddonAction,
} from './actions'

/**
 * Integrations MARKETPLACE — a catalog-driven, browse-at-scale app directory.
 *
 * The cards/sections are NO LONGER hardcoded in JSX. The whole grid renders from
 * `INTEGRATIONS_CATALOG` (lib/integrations/catalog.ts) resolved against the
 * org's live connection state (lib/integrations/resolve.ts). Adding the 500th
 * integration is appending one `IntegrationDef` — no JSX edit here. See the
 * contract at the top of catalog.ts.
 *
 * Built to stay clean at HUNDREDS — eventually thousands — of entries:
 *   1. CONNECTED-FIRST — a prominent "Your integrations" section at the top (the
 *      ones this clinic actually connected), separate from browsing.
 *   2. SEARCH as a primary affordance — fast client filter over name + keywords
 *      + category label.
 *   3. CATEGORY NAV that scales — a horizontally-scrollable pill row with
 *      per-category counts ("All" + each category), staying clean past ~20
 *      categories.
 *   4. CATEGORIZED GRID — section headers per category (or a flat filtered grid
 *      when a search/category is active), a live total count, and a no-results
 *      state. O(n) filtering, no per-card heavy work.
 *
 * The approved card aesthetic is preserved + extended to render from a def +
 * runtime status: real brand logo in a tinted well, name, tagline, StatusPill,
 * one action, hover-lift, connected-card handle chip + value quick links.
 *
 * PRESERVED behavior: GBP/social connect via Zernio hosted OAuth in a NEW TAB +
 * re-sync on window focus + Refresh; disconnect; the social cap meter + at-cap
 * upgrade/add-on CTA; the add-on management; the route ?connected / ?atLimit /
 * error flashes; the Open Dental + GBP detail-page links; the Gmail + Stripe
 * Connect link-outs to their existing flows. Demo connections never network.
 */

export interface IntegrationsLibraryProps {
  /** The whole catalog, resolved against this clinic's live state (server). */
  resolved: ResolvedIntegration[]
  /** Whether Zernio is enabled on this DreamCRM instance. */
  zernioConfigured: boolean
  /** The clinic's plan name (for the add-on copy). */
  planName: string
  /** Social-connection cap state from `canConnectSocialPlatform`. */
  cap: { allowed: boolean; limit: number; current: number; reason?: string }
  /** Entitlement context for the cap + add-on CTAs. */
  entitlement: {
    /** Whether the add-on can be purchased on this plan (false on Basic). */
    addonAvailable: boolean
    /** Whether the add-on is currently active. */
    addonActive: boolean
    /** What the add-on would raise the social limit to. */
    addonRaisesTo: number
    /** Add-on monthly price in dollars (null when unavailable). */
    addonPriceDollars: number | null
    /** Whether the Stripe add-on prices are configured (env present). */
    addonConfigured: boolean
    /** True when the clinic has no Stripe subscription (comped/managed). */
    managedBilling: boolean
  }
  /** Connect URLs for first-party OAuth integrations (Gmail / Stripe Connect),
   *  keyed by def id — so the card links to the existing flow, not a rebuild. */
  oauthConnectHrefs?: Record<string, string>
  /** A just-connected platform slug (flash success), or null. */
  justConnected: ZernioPlatform | null
  /** A platform the connect route bounced off the cap, or null. */
  atLimit: ZernioPlatform | null
  /** A connect/sync error message surfaced by the route, or null. */
  routeError: string | null
}

/** A category filter value: 'all' or a real category id. */
type CategoryFilter = 'all' | IntegrationCategory

export default function IntegrationsLibrary({
  resolved,
  zernioConfigured,
  planName,
  cap,
  entitlement,
  oauthConnectHrefs = {},
  justConnected,
  atLimit,
  routeError,
}: IntegrationsLibraryProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(routeError)
  // After opening any connect tab, poll on focus until accounts refresh.
  const awaitingConnect = useRef(false)

  // ── Marketplace search + category filter ────────────────────────────────
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const q = query.trim().toLowerCase()

  function refresh() {
    setError(null)
    start(async () => {
      const r = await syncZernioAccountsAction()
      if (!r.ok) setError(r.error ?? 'Could not refresh your channels.')
      router.refresh()
    })
  }

  function disconnect(platform: string) {
    setError(null)
    start(async () => {
      const r = await disconnectChannelAction(platform)
      if (!r.ok) setError(r.error ?? 'Could not disconnect.')
      router.refresh()
    })
  }

  function buyAddon() {
    setError(null)
    start(async () => {
      const r = await buySocialAddonAction()
      if (!r.ok) setError(r.error ?? 'Could not add the social add-on.')
      router.refresh()
    })
  }

  function cancelAddon() {
    setError(null)
    start(async () => {
      const r = await cancelSocialAddonAction()
      if (!r.ok) setError(r.error ?? 'Could not cancel the social add-on.')
      router.refresh()
    })
  }

  function onConnectClick() {
    awaitingConnect.current = true
  }

  // Re-sync when the tab regains focus after a connect attempt. Cheap + best-effort.
  useEffect(() => {
    function onFocus() {
      if (awaitingConnect.current && !pending) {
        awaitingConnect.current = false
        refresh()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const handlers: CardHandlers = {
    pending,
    onConnectClick,
    onRefresh: refresh,
    onDisconnect: disconnect,
    onBuyAddon: buyAddon,
    oauthConnectHrefs,
    capAllowed: cap.allowed,
    addonAvailable: entitlement.addonAvailable,
    addonActive: entitlement.addonActive,
  }

  // ── Connected-first: the clinic's actually-connected integrations ─────────
  // Connected integrations live ONLY in the "Your integrations" section — they're
  // lifted OUT of the browse grid so browsing is "what can I still add?" (the
  // connected-first / separate-from-browsing model that stays clean at scale).
  const connected = useMemo(() => resolved.filter((r) => r.runtime.connected), [resolved])
  const totalConnected = connectedCount(resolved)
  const browseable = useMemo(() => resolved.filter((r) => !r.runtime.connected), [resolved])

  // ── Search + category filter (applied to the BROWSE catalog) ──────────────
  const filtered = useMemo(() => {
    return browseable.filter((r) => {
      if (category !== 'all' && r.def.category !== category) return false
      if (!q) return true
      return searchableText(r.def).includes(q)
    })
  }, [browseable, category, q])

  // Per-category counts for the category nav (over the BROWSEable catalog,
  // ignoring the active search so a clinic can see what each category still
  // holds to add).
  const categoryCounts = useMemo(() => {
    const counts = new Map<IntegrationCategory, number>()
    for (const r of browseable) counts.set(r.def.category, (counts.get(r.def.category) ?? 0) + 1)
    return counts
  }, [browseable])

  // Categories present in the catalog, in display order — for the nav + sections.
  const presentCategories = useMemo(() => {
    return (Object.values(CATEGORY_META) as { id: IntegrationCategory; order: number }[])
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id)
      .filter((c) => (categoryCounts.get(c) ?? 0) > 0)
  }, [categoryCounts])

  // Group the FILTERED defs by category (only categories with matches render).
  const grouped = useMemo(() => {
    const byCat = new Map<IntegrationCategory, ResolvedIntegration[]>()
    for (const r of filtered) {
      const arr = byCat.get(r.def.category)
      if (arr) arr.push(r)
      else byCat.set(r.def.category, [r])
    }
    return presentCategories
      .filter((c) => byCat.has(c))
      .map((c) => ({ category: c, items: byCat.get(c)! }))
  }, [filtered, presentCategories])

  const filtering = q.length > 0 || category !== 'all'

  return (
    <div className="space-y-8">
      {/* ── Overview header — the control center ──────────────────────────── */}
      <ConnectedStackHeader connected={connected} count={totalConnected} cap={cap} zernioConfigured={zernioConfigured} />

      {/* ── Flashes ─────────────────────────────────────────────────────── */}
      {justConnected && (
        <p className="text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/15 rounded-[var(--r-md)] px-3 py-2">
          {ZERNIO_PLATFORM_LABELS[justConnected]} connected. It can take a moment to appear — hit Refresh if you don’t see
          it yet.
        </p>
      )}
      {atLimit && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-500/15 rounded-[var(--r-md)] px-3 py-2">
          You’ve used all your social connections, so {ZERNIO_PLATFORM_LABELS[atLimit]} wasn’t connected.{' '}
          {entitlement.addonAvailable ? (
            <button type="button" onClick={buyAddon} className="font-medium underline" disabled={pending}>
              Add more below ↓
            </button>
          ) : (
            <Link href="/settings/plans" className="font-medium underline">
              Upgrade to Pro →
            </Link>
          )}
        </p>
      )}

      {/* ── Connected-first: "Your integrations" ─────────────────────────── */}
      {connected.length > 0 && (
        <ConnectedSection>
          <CardGrid>
            {connected.map((r) => (
              <IntegrationCard key={r.def.id} resolved={r} handlers={handlers} />
            ))}
          </CardGrid>
        </ConnectedSection>
      )}

      {/* ── Browse: search + category nav ────────────────────────────────── */}
      <div>
        <h2 className="sr-only">Browse integrations</h2>
        <MarketplaceToolbar
          query={query}
          onQuery={setQuery}
          category={category}
          onCategory={setCategory}
          categories={presentCategories}
          counts={categoryCounts}
          total={browseable.length}
        />

        {/* Total count line. */}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <strong className="font-mono-num font-semibold text-gray-700 dark:text-gray-300">{filtered.length}</strong>{' '}
          {filtered.length === 1 ? 'integration' : 'integrations'}
          {filtering ? ' match' : ' available'}
          {filtered.length === 1 && filtering ? 'es' : ''}
          {!filtering && (
            <>
              {' '}
              <span className="text-gray-400">· more added all the time</span>
            </>
          )}
        </p>

        {/* ── The catalog grid ──────────────────────────────────────────── */}
        {grouped.length > 0 ? (
          <div className="mt-5 space-y-8">
            {grouped.map(({ category: cat, items }) => (
              <Section
                key={cat}
                title={CATEGORY_META[cat].label}
                blurb={CATEGORY_META[cat].blurb}
                count={items.length}
                right={
                  cat === 'social' && cap.limit > 0 ? (
                    <span className="text-xs text-gray-600 dark:text-gray-300 shrink-0">
                      <strong className="font-mono-num font-semibold">{cap.current}</strong>
                      <span className="text-gray-400"> of </span>
                      <strong className="font-mono-num font-semibold">{cap.limit}</strong> social connections used
                    </span>
                  ) : undefined
                }
              >
                <CardGrid>
                  {items.map((r) => (
                    <IntegrationCard key={r.def.id} resolved={r} handlers={handlers} />
                  ))}
                </CardGrid>

                {/* Add-on management — consolidated under Social (the canonical
                    surface). Hidden while a search narrows the cards. */}
                {cat === 'social' && !q && (
                  <SocialAddonCard
                    planName={planName}
                    entitlement={entitlement}
                    cap={cap}
                    pending={pending}
                    onBuy={buyAddon}
                    onCancel={cancelAddon}
                  />
                )}
              </Section>
            ))}
          </div>
        ) : (
          <NoResults query={query} onClear={() => { setQuery(''); setCategory('all') }} />
        )}
      </div>

      {!zernioConfigured && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          Google &amp; social channels aren’t enabled on this DreamCRM instance yet.
        </p>
      )}

      {error && (
        <p className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">{error}</p>
      )}
    </div>
  )
}

// ── Overview header — connected stack + counts + cap meter ──────────────────

function ConnectedStackHeader({
  connected,
  count,
  cap,
  zernioConfigured,
}: {
  connected: ResolvedIntegration[]
  count: number
  cap: { allowed: boolean; limit: number; current: number }
  zernioConfigured: boolean
}) {
  const capPct = cap.limit > 0 ? Math.min(100, Math.round((cap.current / cap.limit) * 100)) : 0

  return (
    <section className="relative overflow-hidden v2-panel aura-chrome grain p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        {/* Left — title + connected logos */}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Your connected tools
          </p>
          {count > 0 ? (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <div className="flex items-center -space-x-2.5">
                {connected.slice(0, 8).map((r, i) => (
                  <span
                    key={`${r.def.id}-${i}`}
                    title={r.def.name}
                    className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] ring-2 ring-[color:var(--color-surface-1)] shadow-[var(--shadow-xs)]"
                  >
                    <BrandLogo id={r.def.logo} size={24} />
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <strong className="font-mono-num font-semibold text-gray-900 dark:text-gray-100">{count}</strong>{' '}
                {count === 1 ? 'tool' : 'tools'} connected
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-md">
              Nothing connected yet. Plug in your practice-management system, Google Business, and the social channels you
              post to — pick one below to get started.
            </p>
          )}
        </div>

        {/* Right — social cap meter (only meaningful when Zernio is on) */}
        {zernioConfigured && cap.limit > 0 && (
          <div className="shrink-0 w-full lg:w-64">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Social connections</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">
                <strong className="font-mono-num font-semibold">{cap.current}</strong>
                <span className="text-gray-400"> / </span>
                <strong className="font-mono-num font-semibold">{cap.limit}</strong>
              </span>
            </div>
            <div className="h-2 rounded-full bg-[color:var(--color-surface-sunk)] overflow-hidden ring-1 ring-inset ring-[color:var(--color-hairline)]">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  cap.allowed ? 'bg-teal-500 dark:bg-teal-400' : 'bg-amber-500'
                }`}
                style={{ width: `${capPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Google Business is always free and never counts toward this.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Search + category filter toolbar ────────────────────────────────────────

function MarketplaceToolbar({
  query,
  onQuery,
  category,
  onCategory,
  categories,
  counts,
  total,
}: {
  query: string
  onQuery: (v: string) => void
  category: CategoryFilter
  onCategory: (c: CategoryFilter) => void
  categories: IntegrationCategory[]
  counts: Map<IntegrationCategory, number>
  total: number
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Search box */}
      <div className="relative sm:w-80">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400" aria-hidden="true">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search integrations…"
          aria-label="Search integrations"
          className="form-input w-full text-sm pl-9"
        />
      </div>

      {/* Category pills — horizontally scrollable so they stay clean at 20+ */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1 scrollbar-thin"
        role="tablist"
        aria-label="Filter by category"
      >
        <CategoryPill active={category === 'all'} onClick={() => onCategory('all')} label="All" count={total} />
        {categories.map((c) => (
          <CategoryPill
            key={c}
            active={category === c}
            onClick={() => onCategory(c)}
            label={CATEGORY_META[c].label}
            count={counts.get(c) ?? 0}
          />
        ))}
      </div>
    </div>
  )
}

function CategoryPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-teal-500 text-white dark:bg-teal-400 dark:text-gray-900'
          : 'bg-[color:var(--color-surface-2)] ring-1 ring-inset ring-[color:var(--color-hairline)] text-gray-600 dark:text-gray-300 hover:ring-[color:var(--color-hairline-strong)]',
      ].join(' ')}
    >
      {label}
      <span
        className={`font-mono-num text-[0.65rem] tabular-nums ${
          active ? 'text-white/80 dark:text-gray-900/70' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

// ── Section + grid wrappers ─────────────────────────────────────────────────

function ConnectedSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="section-enter">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Your integrations</h2>
      </div>
      {children}
    </section>
  )
}

function Section({
  title,
  blurb,
  count,
  right,
  children,
}: {
  title: string
  blurb: string
  count?: number
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="section-enter">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
            {typeof count === 'number' && (
              <span className="font-mono-num text-xs text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-prose">{blurb}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="v2-well px-6 py-12 text-center mt-5">
      <div className="text-3xl mb-2" aria-hidden="true">
        🔍
      </div>
      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
        No integrations match{query ? ` “${query}”` : ' that filter'}.
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Try a different search, or{' '}
        <button type="button" className="font-medium text-teal-700 dark:text-teal-400 underline" onClick={onClear}>
          clear the filters
        </button>
        .
      </p>
    </div>
  )
}

// ── Rich app card frame — brand-tinted, hover-lift ──────────────────────────

function AppCard({
  logoId,
  connected = false,
  accentTop,
  name,
  description,
  pill,
  children,
}: {
  logoId: BrandLogoId
  /** Brightens the logo well + shows the brand top-accent. */
  connected?: boolean
  /** Brand hex for the hairline top-accent on connected cards. */
  accentTop?: string
  name: string
  description: React.ReactNode
  pill: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="group relative v2-card-interactive p-4 flex flex-col h-full overflow-hidden">
      {/* Brand hairline top-accent — only on connected cards (a subtle "lit" cue). */}
      {connected && accentTop && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, ${accentTop}, color-mix(in srgb, ${accentTop} 35%, transparent))` }}
        />
      )}
      <div className="flex items-start gap-3 mb-3">
        <BrandLogoWell id={logoId} connected={connected} wellSize={48} size={26} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{name}</h3>
            {pill}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      {/* Footer pinned to the bottom so a grid of cards has aligned actions. */}
      {children && <div className="mt-auto pt-1">{children}</div>}
    </div>
  )
}

/** A connected-card "value links" row — where this integration shows up. */
function QuickLinks({ links }: { links: { href: string; label: string }[] }) {
  if (links.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
        >
          {l.label}
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </Link>
      ))}
    </div>
  )
}

/** A small connected-handle chip (display name + handle + check). */
function HandleWell({ title, handle }: { title: string; handle?: string | null }) {
  return (
    <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-3 py-2 mb-2">
      <div className="flex items-center gap-1.5">
        <CheckIcon />
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{title}</p>
      </div>
      {handle && <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num truncate pl-5">{handle}</p>}
    </div>
  )
}

// ── THE catalog-driven card — renders any def from its runtime status ────────

interface CardHandlers {
  pending: boolean
  onConnectClick: () => void
  onRefresh: () => void
  onDisconnect: (platform: string) => void
  onBuyAddon: () => void
  /** First-party OAuth connect URLs (Gmail / Stripe Connect) keyed by def id. */
  oauthConnectHrefs: Record<string, string>
  capAllowed: boolean
  addonAvailable: boolean
  addonActive: boolean
}

const STATUS_PILL: Record<string, { tone: Tone; label: string }> = {
  connected: { tone: 'ok', label: 'Connected' },
  needs_attention: { tone: 'urgent', label: 'Needs attention' },
  available: { tone: 'neutral', label: 'Not connected' },
  at_cap: { tone: 'neutral', label: 'Not connected' },
  premium_locked: { tone: 'special', label: 'Premium' },
  request_access: { tone: 'info', label: 'Request access' },
  coming_soon: { tone: 'neutral', label: 'Coming soon' },
  unavailable: { tone: 'neutral', label: 'Not connected' },
}

/**
 * Renders ONE integration from `{ def, runtime }`. The same component for every
 * card; the connect affordance branches on `connectKind` + `runtime.status`.
 * This is what makes the catalog scale — no per-integration card component.
 */
function IntegrationCard({ resolved, handlers }: { resolved: ResolvedIntegration; handlers: CardHandlers }) {
  const { def, runtime } = resolved
  const accent = BRAND_ACCENTS[def.logo]
  const pillMeta = STATUS_PILL[runtime.status] ?? STATUS_PILL.available

  return (
    <AppCard
      logoId={def.logo}
      connected={runtime.connected}
      accentTop={accent}
      name={def.name}
      description={def.tagline}
      pill={<StatusPill tone={pillMeta.tone} label={pillMeta.label} />}
    >
      {/* CONNECTED — handle + value links + manage/refresh/disconnect. */}
      {runtime.connected ? (
        <>
          {(runtime.title || runtime.handle) && (
            <HandleWell title={runtime.title || def.name} handle={runtime.handle} />
          )}
          <QuickLinks links={def.valueLinks ?? []} />
          <ConnectedActions def={def} runtime={runtime} handlers={handlers} />
        </>
      ) : (
        <DisconnectedActions def={def} runtime={runtime} handlers={handlers} />
      )}
    </AppCard>
  )
}

/** The action row for a CONNECTED card — manage (detail) + refresh + disconnect,
 *  varying by connectKind. */
function ConnectedActions({
  def,
  runtime,
  handlers,
}: {
  def: IntegrationDef
  runtime: ResolvedIntegration['runtime']
  handlers: CardHandlers
}) {
  if (def.connectKind === 'pms') {
    // Open Dental — connected management lives on the detail page.
    return def.detailHref ? (
      <ActionButton variant="secondary" size="sm" href={def.detailHref}>
        Manage
      </ActionButton>
    ) : null
  }

  if (def.connectKind === 'zernio') {
    return (
      <div className="flex flex-wrap gap-2">
        {def.detailHref && (
          <ActionButton variant="secondary" size="sm" href={def.detailHref}>
            Manage
          </ActionButton>
        )}
        <ActionButton variant="ghost" size="sm" onClick={handlers.onRefresh} disabled={handlers.pending}>
          {handlers.pending ? 'Refreshing…' : 'Refresh'}
        </ActionButton>
        <ActionButton variant="danger" size="sm" onClick={() => handlers.onDisconnect(def.id)} disabled={handlers.pending}>
          Disconnect
        </ActionButton>
      </div>
    )
  }

  // oauth (Gmail / Stripe Connect) — link to the existing flow to manage there.
  const manageHref = def.valueLinks?.[0]?.href ?? handlers.oauthConnectHrefs[def.id]
  return manageHref ? (
    <ActionButton variant="secondary" size="sm" href={manageHref}>
      Manage
    </ActionButton>
  ) : null
}

/** The action row for a NOT-connected card — varying by status + connectKind. */
function DisconnectedActions({
  def,
  runtime,
  handlers,
}: {
  def: IntegrationDef
  runtime: ResolvedIntegration['runtime']
  handlers: CardHandlers
}) {
  // Roadmap / partner tiles — an honest note, no connect.
  if (runtime.status === 'coming_soon' || runtime.status === 'request_access') {
    return def.note ? <p className="text-xs text-gray-400 dark:text-gray-500">{def.note}</p> : null
  }

  // Premium-locked — upgrade CTA.
  if (runtime.status === 'premium_locked') {
    return (
      <ActionButton variant="primary" size="sm" href="/settings/plans?upgrade=integrations">
        Upgrade to Premium
      </ActionButton>
    )
  }

  // PMS (available) — the detail page hosts the connect form.
  if (def.connectKind === 'pms') {
    return def.detailHref ? (
      <ActionButton variant="primary" size="sm" href={def.detailHref}>
        Connect
      </ActionButton>
    ) : null
  }

  // Zernio (GBP + social).
  if (def.connectKind === 'zernio') {
    // Instance not configured — calm note.
    if (runtime.status === 'unavailable') {
      return <p className="text-xs text-gray-500 dark:text-gray-400 italic">Not enabled on this instance yet.</p>
    }
    // Social cap full — show the add-on / upgrade affordance instead of connect.
    if (runtime.status === 'at_cap') {
      if (handlers.addonAvailable) {
        return (
          <ActionButton variant="ghost" size="sm" onClick={handlers.onBuyAddon} disabled={handlers.pending}>
            {handlers.addonActive ? 'At limit' : 'Add a slot'}
          </ActionButton>
        )
      }
      return (
        <ActionButton variant="ghost" size="sm" href="/settings/plans">
          Upgrade
        </ActionButton>
      )
    }
    // Available — connect via hosted OAuth in a new tab. GBP gets the louder
    // primary; social channels get a secondary (cap-bounded).
    const isGbp = def.id === 'googlebusiness'
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          variant={isGbp ? 'primary' : 'secondary'}
          size="sm"
          href={`/api/integrations/zernio/connect?platform=${def.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handlers.onConnectClick}
        >
          {isGbp ? 'Connect Google Business' : 'Connect'}
        </ActionButton>
        {isGbp && (
          <ActionButton variant="ghost" size="sm" onClick={handlers.onRefresh} disabled={handlers.pending}>
            {handlers.pending ? 'Checking…' : 'I just connected — refresh'}
          </ActionButton>
        )}
      </div>
    )
  }

  // oauth (Gmail / Stripe Connect) — link to the existing first-party flow.
  const href = handlers.oauthConnectHrefs[def.id]
  return href ? (
    <ActionButton variant="primary" size="sm" href={href}>
      Connect
    </ActionButton>
  ) : (
    <p className="text-xs text-gray-500 dark:text-gray-400 italic">Connect from its setup page.</p>
  )
}

// ── Social add-on management (consolidated from Settings → Billing) ─────────

function SocialAddonCard({
  planName,
  entitlement,
  cap,
  pending,
  onBuy,
  onCancel,
}: {
  planName: string
  entitlement: IntegrationsLibraryProps['entitlement']
  cap: { allowed: boolean; limit: number; current: number; reason?: string }
  pending: boolean
  onBuy: () => void
  onCancel: () => void
}) {
  return (
    <div className="v2-well p-4 mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Social connections</p>
          {entitlement.addonActive && <StatusPill tone="ok" label="Add-on active" />}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
          Your <strong className="font-medium">{planName}</strong> plan includes{' '}
          <strong className="font-medium font-mono-num">{cap.limit}</strong>{' '}
          {cap.limit === 1 ? 'social connection' : 'social connections'}{' '}
          <span className="text-gray-500 dark:text-gray-400">({cap.limit + 1} total including Google Business)</span>.
        </p>
      </div>

      <div className="shrink-0">
        {entitlement.addonActive ? (
          <ActionButton variant="danger" size="sm" onClick={onCancel} disabled={pending}>
            {pending ? 'Working…' : 'Cancel add-on'}
          </ActionButton>
        ) : !entitlement.addonAvailable ? (
          <ActionButton variant="primary" size="sm" href="/settings/plans">
            Upgrade to Pro
          </ActionButton>
        ) : entitlement.managedBilling ? (
          <span className="text-sm text-gray-600 dark:text-gray-300">Managed billing — contact us.</span>
        ) : !entitlement.addonConfigured ? (
          <ActionButton variant="secondary" size="sm" disabled>
            Add-on coming soon
          </ActionButton>
        ) : (
          <ActionButton variant="primary" size="sm" onClick={onBuy} disabled={pending}>
            {pending ? 'Working…' : `Add more — $${entitlement.addonPriceDollars}/mo`}
          </ActionButton>
        )}
      </div>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}
