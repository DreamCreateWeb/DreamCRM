'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { ZERNIO_PLATFORM_LABELS, type ZernioPlatform } from '@/lib/types/zernio'
import type { Tone } from '@/lib/ui/encodings'
import { BrandLogo, BrandLogoWell, BRAND_ACCENTS, type BrandLogoId } from '@/components/integrations/brand-logos'
import { searchableText, type IntegrationDef } from '@/lib/integrations/catalog'
import type { ResolvedIntegration } from '@/lib/integrations/resolve'
import PmsRequestButton from './pms-request-button'
import {
  bundleLogos,
  bundlePlanLabel,
  type BundleDef,
  type BundleStatus,
  type BundleView,
} from '@/lib/integrations/bundles'
import {
  syncZernioAccountsAction,
  disconnectChannelAction,
  buySocialAddonAction,
  cancelSocialAddonAction,
  simulateDemoConnectAction,
} from './actions'

/**
 * Integrations — a menu of FEATURE BUNDLES (DESIGN-SYSTEM v2).
 *
 * The clinic builds its feature set by activating bundles — Practice Management,
 * Google Business, Social Media, Patient Communications, Ecommerce & Payments.
 * Each bundle groups its individual accounts (the catalog integrations) under one
 * capability with a clear pricing frame (included / plan / paid add-on), and —
 * the point of the reframe — when a bundle is ACTIVE its features surface in the
 * sidebar as if built-in (auto-derived; see lib/integrations/bundles +
 * lib/services/integration-bundles).
 *
 * Connecting an individual account (Instagram, a Gmail mailbox, Stripe) happens
 * INSIDE its bundle's section here — not as a top-level catalog tile. The bundle
 * grid renders from `resolveBundles(...)` over the pure catalog resolved against
 * the org's live state; adding an integration is still a catalog data change.
 *
 * PRESERVED connect plumbing: GBP/social connect via Zernio hosted OAuth in a
 * NEW TAB + re-sync on window focus + Refresh; disconnect; the social cap meter +
 * at-cap upgrade/add-on CTA; the add-on management; the ?connected / ?atLimit /
 * error flashes; the Open Dental + GBP detail-page links; the Gmail + Stripe
 * Connect link-outs to their existing flows. Demo connections never network.
 */

export interface IntegrationsLibraryProps {
  /** Every feature bundle, resolved against this clinic's live state (server). */
  bundles: BundleView[]
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
    /** The platform bills this clinic outside self-serve Stripe (managed/comped). */
    managedBilling: boolean
    /** Self-serve clinic with no subscription yet (no-card trial) — the add-on
     *  needs a live subscription to attach to; route to billing, not "contact us". */
    needsSubscription: boolean
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
  /** Viewing the demo clinic — connect is SIMULATED (no real OAuth / new tab). */
  isDemo: boolean
  /** Owner/admin — connect/disconnect/add-on actions render only when true
   *  (the server actions reject members; don't show buttons that can only fail). */
  canManage: boolean
  /** Roadmap PMS provider ids this clinic has already requested early access
   *  to — so the tile shows "you're on the list" instead of the button. */
  requestedPms?: string[]
}

export default function IntegrationsLibrary({
  bundles,
  zernioConfigured,
  planName,
  cap,
  entitlement,
  oauthConnectHrefs = {},
  justConnected,
  atLimit,
  routeError,
  isDemo,
  canManage,
  requestedPms = [],
}: IntegrationsLibraryProps) {
  const router = useRouter()
  const requestedPmsSet = new Set(requestedPms)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(routeError)
  // After opening any connect tab, poll on focus until accounts refresh.
  const awaitingConnect = useRef(false)

  // ── Cross-bundle search ───────────────────────────────────────────────────
  const [query, setQuery] = useState('')
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

  // Demo: "connect" simulates the connection in place (no real OAuth / new tab)
  // by seeding the synthetic connected account, then refreshes to show it.
  function simulateConnect(platform: string) {
    setError(null)
    start(async () => {
      const r = await simulateDemoConnectAction(platform)
      if (!r.ok) setError(r.error ?? 'Could not connect.')
      router.refresh()
    })
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
    onSimulateConnect: simulateConnect,
    isDemo,
    canManage,
    oauthConnectHrefs,
    capAllowed: cap.allowed,
    addonAvailable: entitlement.addonAvailable,
    addonActive: entitlement.addonActive,
    requestedPms: requestedPmsSet,
  }

  // The connected accounts across every bundle (for the overview logo stack).
  const allConnected = useMemo(() => bundles.flatMap((b) => b.connectedMembers), [bundles])

  // ── Search filters MEMBER cards across bundles ────────────────────────────
  const visibleBundles = useMemo(() => {
    if (!q) return bundles
    return bundles
      .map((b) => ({ ...b, members: b.members.filter((m) => searchableText(m.def).includes(q)) }))
      .filter((b) => b.members.length > 0)
  }, [bundles, q])

  const searching = q.length > 0

  return (
    <div className="space-y-8">
      {/* ── Overview header — connected stack + cap meter ─────────────────── */}
      <ConnectedStackHeader connected={allConnected} cap={cap} zernioConfigured={zernioConfigured} />

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
          {entitlement.addonAvailable && canManage ? (
            <button type="button" onClick={buyAddon} className="font-medium underline" disabled={pending}>
              Add more below ↓
            </button>
          ) : (
            <Link href="/settings/billing" className="font-medium underline">
              Upgrade to Pro →
            </Link>
          )}
        </p>
      )}

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <SearchBox query={query} onQuery={setQuery} />

      {/* ── Bundle sections ──────────────────────────────────────────────── */}
      {visibleBundles.length > 0 ? (
        <div className="space-y-8">
          {visibleBundles.map((view) => (
            <BundleSection
              key={view.def.id}
              view={view}
              handlers={handlers}
              searching={searching}
              cap={cap}
              planName={planName}
              entitlement={entitlement}
              onBuyAddon={buyAddon}
              onCancelAddon={cancelAddon}
              pending={pending}
            />
          ))}
        </div>
      ) : (
        <NoResults query={query} onClear={() => setQuery('')} />
      )}

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
  cap,
  zernioConfigured,
}: {
  connected: ResolvedIntegration[]
  cap: { allowed: boolean; limit: number; current: number }
  zernioConfigured: boolean
}) {
  const count = connected.length
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
              Nothing connected yet. Activate the bundles your practice needs — plug in your practice-management system,
              Google Business, social, email, and payments below.
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

// ── Search box ──────────────────────────────────────────────────────────────

function SearchBox({ query, onQuery }: { query: string; onQuery: (v: string) => void }) {
  return (
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
  )
}

// ── Bundle section — header (capability framing) + member connect cards ──────

const BUNDLE_STATUS_PILL: Record<BundleStatus, { tone: Tone; label: string }> = {
  active: { tone: 'ok', label: 'Active' },
  available: { tone: 'neutral', label: 'Available' },
  plan_locked: { tone: 'special', label: 'Plan upgrade' },
  request_access: { tone: 'info', label: 'Request access' },
  coming_soon: { tone: 'neutral', label: 'On the roadmap' },
  unavailable: { tone: 'neutral', label: 'Not enabled' },
}

/** The pricing chip — Included (free) / Pro & up / Premium, plus an add-on tag. */
function PricingBadge({ def }: { def: BundleDef }) {
  const label = bundlePlanLabel(def)
  const cls =
    def.minPlan === 'premium'
      ? 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300'
      : def.minPlan === 'pro'
        ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
      {def.hasPaidAddon && (
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
          Add-on
        </span>
      )}
    </span>
  )
}

interface BundleSectionProps {
  view: BundleView
  handlers: CardHandlers
  searching: boolean
  cap: { allowed: boolean; limit: number; current: number; reason?: string }
  planName: string
  entitlement: IntegrationsLibraryProps['entitlement']
  onBuyAddon: () => void
  onCancelAddon: () => void
  pending: boolean
}

function BundleSection({
  view,
  handlers,
  searching,
  cap,
  planName,
  entitlement,
  onBuyAddon,
  onCancelAddon,
  pending,
}: BundleSectionProps) {
  const { def, members, status, connectedMembers, needsAttention } = view
  const logos = bundleLogos(def, 5)
  const pill = needsAttention ? { tone: 'urgent' as Tone, label: 'Needs attention' } : BUNDLE_STATUS_PILL[status]
  const isActive = status === 'active'

  return (
    <section className="section-enter v2-panel p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Member logo cluster — the "what's inside" at a glance. */}
          <div className="flex items-center -space-x-1.5 shrink-0 pt-0.5">
            {logos.map((id) => (
              <span
                key={id}
                className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)] ring-1 ring-inset ring-[color:var(--color-hairline)]"
              >
                <BrandLogo id={id} size={18} />
              </span>
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{def.name}</h2>
              <PricingBadge def={def} />
              <StatusPill tone={pill.tone} label={pill.label} />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-prose mt-0.5">{def.tagline}</p>
            {/* When active — "feels built-in": where its features live. */}
            {isActive && def.valueLinks && def.valueLinks.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-gray-400 dark:text-gray-500">In your dashboard:</span>
                {def.valueLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
                  >
                    {l.label}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {status === 'plan_locked' ? (
        /* One clean upgrade prompt — the bundle needs a higher plan, so we don't
           clutter with per-account connect cards that can't be used yet. */
        <div className="v2-well px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {def.name} comes with the <strong className="font-medium">{bundlePlanLabel(def)}</strong> plan.
          </p>
          <ActionButton variant="primary" size="sm" href="/settings/billing?upgrade=integrations">
            Upgrade to {def.minPlan === 'premium' ? 'Premium' : 'Pro'}
          </ActionButton>
        </div>
      ) : (
        <>
          {/* Member connect cards — the individual accounts inside the bundle. */}
          {members.length > 0 ? (
            <CardGrid>
              {members.map((r) => (
                <IntegrationCard key={r.def.id} resolved={r} handlers={handlers} />
              ))}
            </CardGrid>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No matching tools in this bundle.</p>
          )}

          {/* Social bundle — the cap meter + add-on management (owner/admin:
              the buy/cancel actions are billing-level). */}
          {def.id === 'social' && !searching && handlers.canManage && (
            <SocialAddonCard
              planName={planName}
              entitlement={entitlement}
              cap={cap}
              pending={pending}
              onBuy={onBuyAddon}
              onCancel={onCancelAddon}
            />
          )}
        </>
      )}
    </section>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="v2-well px-6 py-12 text-center">
      <div className="text-3xl mb-2" aria-hidden="true">
        🔍
      </div>
      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
        No integrations match{query ? ` “${query}”` : ' that filter'}.
      </p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Try a different search, or{' '}
        <button type="button" className="font-medium text-teal-700 dark:text-teal-400 underline" onClick={onClear}>
          clear it
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

/** A light connected-handle line (check + display name + muted handle) — an
 *  elegant inline cue, not a heavy sunken box. */
function HandleWell({ title, handle }: { title: string; handle?: string | null }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5 min-w-0">
      <CheckIcon />
      <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{title}</span>
      {handle && (
        <>
          <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono-num truncate">{handle}</span>
        </>
      )}
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
  /** Demo-only: simulate connecting the platform (no real OAuth). */
  onSimulateConnect: (platform: string) => void
  /** Viewing the demo clinic. */
  isDemo: boolean
  /** Owner/admin — mutating affordances hide for members. */
  canManage: boolean
  /** First-party OAuth connect URLs (Gmail / Stripe Connect) keyed by def id. */
  oauthConnectHrefs: Record<string, string>
  capAllowed: boolean
  addonAvailable: boolean
  addonActive: boolean
  /** Roadmap PMS ids this clinic already requested early access to. */
  requestedPms: Set<string>
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
      {/* CONNECTED — handle + manage/refresh/disconnect. (Where the bundle's
          features live is shown once, in the bundle header — not per card.) */}
      {runtime.connected ? (
        <>
          {(runtime.title || runtime.handle) && (
            <HandleWell title={runtime.title || def.name} handle={runtime.handle} />
          )}
          <ConnectedActions def={def} runtime={runtime} handlers={handlers} />
        </>
      ) : (
        <DisconnectedActions def={def} runtime={runtime} handlers={handlers} />
      )}
    </AppCard>
  )
}

/** A quiet, low-emphasis text action (Refresh / Disconnect) — keeps a CONNECTED
 *  card calm. `danger` turns it red on hover only, so a destructive action is
 *  reachable without a loud red-filled button on every card. */
function QuietAction({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-[var(--r-sm)] px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
        danger
          ? 'text-gray-400 hover:text-rose-600 hover:bg-rose-500/10 dark:text-gray-500 dark:hover:text-rose-400'
          : 'text-gray-500 hover:text-gray-800 hover:bg-[color:var(--color-surface-2)] dark:text-gray-400 dark:hover:text-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** The action row for a CONNECTED card — manage (detail) + refresh + disconnect,
 *  varying by connectKind. The card face stays calm: Manage is the only solid
 *  button; Refresh + Disconnect are quiet text actions (Disconnect red-on-hover
 *  only — no "wall of red"). */
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
    // Members see the connected state (and can view the detail page) but not
    // refresh/disconnect — those server actions are owner/admin-only.
    if (!handlers.canManage) {
      return def.detailHref ? (
        <ActionButton variant="secondary" size="sm" href={def.detailHref}>
          View
        </ActionButton>
      ) : null
    }
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {def.detailHref && (
            <ActionButton variant="secondary" size="sm" href={def.detailHref}>
              Manage
            </ActionButton>
          )}
          <QuietAction onClick={handlers.onRefresh} disabled={handlers.pending}>
            {handlers.pending ? 'Refreshing…' : 'Refresh'}
          </QuietAction>
        </div>
        <QuietAction onClick={() => handlers.onDisconnect(def.id)} disabled={handlers.pending} danger>
          Disconnect
        </QuietAction>
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
  // Roadmap / partner tiles — an honest note + (for the roadmap PMSs) a
  // "notify me when it's ready" demand-capture button. No fake connect.
  if (runtime.status === 'coming_soon' || runtime.status === 'request_access') {
    return (
      <div className="space-y-2">
        {def.note && <p className="text-xs text-gray-400 dark:text-gray-500">{def.note}</p>}
        {def.category === 'pms' && (
          <PmsRequestButton
            provider={def.id}
            alreadyRequested={handlers.requestedPms.has(def.id)}
            canManage={handlers.canManage}
          />
        )}
      </div>
    )
  }

  // Members can't connect anything (the server actions reject them) — say so
  // instead of rendering a Connect button that can only fail.
  if (!handlers.canManage) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
        Ask an owner or admin to connect this.
      </p>
    )
  }

  // Premium-locked — upgrade CTA.
  if (runtime.status === 'premium_locked') {
    return (
      <ActionButton variant="primary" size="sm" href="/settings/billing?upgrade=integrations">
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
        <ActionButton variant="ghost" size="sm" href="/settings/billing">
          Upgrade
        </ActionButton>
      )
    }
    // Available — connect via hosted OAuth in a new tab. GBP gets the louder
    // primary; social channels get a secondary (cap-bounded).
    const isGbp = def.id === 'googlebusiness'
    // Demo: connect is SIMULATED in place (no new tab / OAuth) — clicking it just
    // seeds the synthetic connected account so the demo flips to connected.
    if (handlers.isDemo) {
      return (
        <ActionButton
          variant={isGbp ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handlers.onSimulateConnect(def.id)}
          disabled={handlers.pending}
        >
          {handlers.pending ? 'Connecting…' : isGbp ? 'Connect Google Business' : 'Connect'}
        </ActionButton>
      )
    }
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
          <ActionButton variant="primary" size="sm" href="/settings/billing">
            Upgrade to Pro
          </ActionButton>
        ) : entitlement.managedBilling ? (
          <span className="text-sm text-gray-600 dark:text-gray-300">Managed billing — contact us.</span>
        ) : entitlement.needsSubscription ? (
          <ActionButton variant="primary" size="sm" href="/settings/billing">
            Start your plan to add more
          </ActionButton>
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
