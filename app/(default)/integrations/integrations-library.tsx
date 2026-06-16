'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import {
  ZERNIO_PLATFORM_LABELS,
  type SocialChannelView,
  type ZernioAccount,
  type ZernioPlatform,
} from '@/lib/types/zernio'
import { PMS_PROVIDERS, type PmsAvailability, type PmsProviderInfo } from '@/lib/types/pms'
import type { Tone } from '@/lib/ui/encodings'
import { BrandLogo, BrandLogoWell, type BrandLogoId } from '@/components/integrations/brand-logos'
import {
  syncZernioAccountsAction,
  disconnectChannelAction,
  buySocialAddonAction,
  cancelSocialAddonAction,
} from './actions'

/**
 * Integrations marketplace — a premium, brand-rich app directory (Vercel
 * Integrations / Notion connections / Linear integrations). The old flat grid of
 * generic-icon cards is gone. What's here:
 *
 *   1. OVERVIEW header ("control center") — the connected stack at a glance: the
 *      connected apps' real logos in a row, a "{n} connected" count, and a slim
 *      "{used} of {limit} social used" cap meter.
 *   2. SEARCH + category filter — a search box (filter by name) + category pills
 *      (All · Practice management · Google · Social · Coming soon). A real
 *      marketplace affordance.
 *   3. Rich, brand-tinted CARDS with hover lift — each carries the brand-accurate
 *      logo in a tinted well, name, a crisp one-liner, a StatusPill, and one
 *      clear action. Connected cards reward: the connected handle, a check, and
 *      quick links to where that integration's value shows up (GBP → /reviews +
 *      /seo; social → /social-posts).
 *
 * Deep management lives on detail routes (the marketplace stays a directory):
 *   - Open Dental card → /integrations/open-dental (the full PMS dashboard).
 *   - Google Business card → /integrations/google-business (connected listing +
 *     value links); connect/refresh/disconnect still happen on the card.
 *   - Social cards stay inline (connect/disconnect on the card).
 *
 * PRESERVED behavior: GBP/social connect via Zernio hosted OAuth in a NEW TAB +
 * re-sync on window focus + Refresh; disconnect; the social cap meter + at-cap
 * upgrade/add-on CTA; the add-on management (Active w/ Cancel · "Add more $X/mo"
 * · "Upgrade to Pro" for Basic · "coming soon" if env unset · "managed billing"
 * for comped); the route ?connected / ?atLimit / error flashes. GBP + social on
 * all plans (social capped); Open Dental Premium; owner/admin for mutations.
 * Demo connections never hit the network.
 */

export interface IntegrationsLibraryProps {
  /** Whether Zernio is enabled on this DreamCRM instance. */
  zernioConfigured: boolean
  /** Whether the clinic's plan includes the Premium PMS integration. */
  pmsEligible: boolean
  /** Open Dental connection summary for the card. */
  pms: {
    /** True when a PMS connection exists + is connected. */
    connected: boolean
    /** True when the last sync errored (drives the card pill). */
    errored: boolean
    /** Display name (Open Dental / Open Dental (Sandbox)). */
    providerLabel: string
    /** True when the connection is the demo sandbox. */
    isDemo: boolean
  }
  /** Google Business connection state. */
  gbp: {
    connected: boolean
    error: boolean
    account: ZernioAccount | null
  }
  /** Social rows (shortlist × connected status). */
  socialChannels: SocialChannelView[]
  /** Social-connection cap state from `canConnectSocialPlatform`. */
  cap: { allowed: boolean; limit: number; current: number; reason?: string }
  /** Entitlement context for the cap + add-on CTAs. */
  entitlement: {
    planName: string
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
  /** A just-connected platform slug (flash success), or null. */
  justConnected: ZernioPlatform | null
  /** A platform the connect route bounced off the cap, or null. */
  atLimit: ZernioPlatform | null
  /** A connect/sync error message surfaced by the route, or null. */
  routeError: string | null
}

type Category = 'all' | 'pms' | 'google' | 'social' | 'soon'

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pms', label: 'Practice management' },
  { id: 'google', label: 'Google' },
  { id: 'social', label: 'Social' },
  { id: 'soon', label: 'Coming soon' },
]

export default function IntegrationsLibrary({
  zernioConfigured,
  pmsEligible,
  pms,
  gbp,
  socialChannels,
  cap,
  entitlement,
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
  const [category, setCategory] = useState<Category>('all')
  const q = query.trim().toLowerCase()

  function refresh() {
    setError(null)
    start(async () => {
      const r = await syncZernioAccountsAction()
      if (!r.ok) setError(r.error ?? 'Could not refresh your channels.')
      router.refresh()
    })
  }

  function disconnect(platform: ZernioPlatform) {
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

  const roadmapPms = PMS_PROVIDERS.filter((p) => p.id !== 'open_dental')

  // ── The connected stack (for the overview header) ───────────────────────
  const connectedSummary = useMemo(() => {
    const logos: { id: BrandLogoId; label: string }[] = []
    if (pms.connected) logos.push({ id: 'open_dental', label: pms.providerLabel })
    if (gbp.connected) logos.push({ id: 'googlebusiness', label: 'Google Business Profile' })
    for (const ch of socialChannels) {
      if (ch.account) logos.push({ id: ch.platform as BrandLogoId, label: ch.label })
    }
    return logos
  }, [pms.connected, pms.providerLabel, gbp.connected, socialChannels])

  // Per-category match for the search/filter (name + a few keywords).
  const matches = (cat: Category, names: string[]) => {
    if (category !== 'all' && category !== cat) return false
    if (!q) return true
    return names.some((n) => n.toLowerCase().includes(q))
  }

  const showOpenDental = matches('pms', ['Open Dental', 'PMS', 'practice management', 'sandbox'])
  const roadmapToShow = roadmapPms.filter((p) =>
    matches('soon', [p.name, p.blurb, 'PMS', 'practice management']),
  )
  const showGoogle = matches('google', ['Google Business Profile', 'Google', 'reviews', 'maps', 'GBP'])
  const socialToShow = socialChannels.filter((ch) =>
    matches('social', [ch.label, ch.account?.username ?? '', ch.account?.displayName ?? '', 'social']),
  )

  const pmsSectionVisible = showOpenDental || roadmapToShow.length > 0
  const googleSectionVisible = showGoogle
  const socialSectionVisible = socialToShow.length > 0
  const anyVisible = pmsSectionVisible || googleSectionVisible || socialSectionVisible

  return (
    <div className="space-y-8">
      {/* ── Overview header — the control center ──────────────────────────── */}
      <ConnectedStackHeader connected={connectedSummary} cap={cap} zernioConfigured={zernioConfigured} />

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

      {/* ── Search + category filter ──────────────────────────────────────── */}
      <MarketplaceToolbar query={query} onQuery={setQuery} category={category} onCategory={setCategory} />

      {/* ── Practice management ──────────────────────────────────────────── */}
      {pmsSectionVisible && (
        <Section
          title="Practice management"
          blurb="Sync the relationship layer — patients, appointments, providers, balances — both directions, through your PMS's official API. We never touch your database directly."
        >
          <CardGrid>
            {showOpenDental && <OpenDentalCard pmsEligible={pmsEligible} pms={pms} />}
            {roadmapToShow.map((p) => (
              <ComingSoonPmsCard key={p.id} provider={p} />
            ))}
          </CardGrid>
        </Section>
      )}

      {/* ── Google ───────────────────────────────────────────────────────── */}
      {googleSectionVisible && (
        <Section
          title="Google"
          blurb="Your reviews, verified hours, photos, and local search stats — through Zernio’s secure sign-in (no Google verification paperwork on your end)."
        >
          <CardGrid>
            <GoogleBusinessCard
              configured={zernioConfigured}
              gbp={gbp}
              pending={pending}
              onConnectClick={onConnectClick}
              onRefresh={refresh}
              onDisconnect={() => disconnect('googlebusiness')}
            />
          </CardGrid>
        </Section>
      )}

      {/* ── Social ───────────────────────────────────────────────────────── */}
      {socialSectionVisible && (
        <Section
          title="Social"
          blurb="Connect the social accounts you post to. Your plan sets how many — Google Business is always free and never counts."
          right={
            <span className="text-xs text-gray-600 dark:text-gray-300 shrink-0">
              <strong className="font-mono-num font-semibold">{cap.current}</strong>
              <span className="text-gray-400"> of </span>
              <strong className="font-mono-num font-semibold">{cap.limit}</strong> social connections used
            </span>
          }
        >
          <CardGrid>
            {socialToShow.map((ch) => (
              <SocialCard
                key={ch.platform}
                channel={ch}
                configured={zernioConfigured}
                capAllowed={cap.allowed}
                entitlement={entitlement}
                pending={pending}
                onConnectClick={onConnectClick}
                onDisconnect={() => disconnect(ch.platform)}
                onBuyAddon={buyAddon}
              />
            ))}
          </CardGrid>

          {/* Add-on management — consolidated here (the canonical surface).
              Hidden while a search is narrowing the social cards. */}
          {!q && (
            <SocialAddonCard
              entitlement={entitlement}
              cap={cap}
              pending={pending}
              onBuy={buyAddon}
              onCancel={cancelAddon}
            />
          )}
        </Section>
      )}

      {/* ── No-results state ─────────────────────────────────────────────── */}
      {!anyVisible && (
        <div className="v2-well px-6 py-12 text-center">
          <div className="text-3xl mb-2" aria-hidden="true">
            🔍
          </div>
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100">No integrations match “{query}”.</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Try a different search, or{' '}
            <button
              type="button"
              className="font-medium text-teal-700 dark:text-teal-400 underline"
              onClick={() => {
                setQuery('')
                setCategory('all')
              }}
            >
              clear the filters
            </button>
            .
          </p>
        </div>
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
  connected: { id: BrandLogoId; label: string }[]
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
                {connected.slice(0, 8).map((c, i) => (
                  <span
                    key={`${c.id}-${i}`}
                    title={c.label}
                    className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] ring-2 ring-[color:var(--color-surface-1)] shadow-[var(--shadow-xs)]"
                  >
                    <BrandLogo id={c.id} size={24} />
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
}: {
  query: string
  onQuery: (v: string) => void
  category: Category
  onCategory: (c: Category) => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      {/* Search box */}
      <div className="relative sm:w-72">
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

      {/* Category pills */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter by category">
        {CATEGORIES.map((c) => {
          const active = category === c.id
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategory(c.id)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-teal-500 text-white dark:bg-teal-400 dark:text-gray-900'
                  : 'bg-[color:var(--color-surface-2)] ring-1 ring-inset ring-[color:var(--color-hairline)] text-gray-600 dark:text-gray-300 hover:ring-[color:var(--color-hairline-strong)]',
              ].join(' ')}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Section + grid wrappers ─────────────────────────────────────────────────

function Section({
  title,
  blurb,
  right,
  children,
}: {
  title: string
  blurb: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="section-enter">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
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

// ── Practice management cards ───────────────────────────────────────────────

function OpenDentalCard({
  pmsEligible,
  pms,
}: {
  pmsEligible: boolean
  pms: IntegrationsLibraryProps['pms']
}) {
  const pill = !pmsEligible ? (
    <StatusPill tone="special" label="Premium" />
  ) : pms.connected ? (
    <StatusPill tone={pms.errored ? 'urgent' : 'ok'} label={pms.errored ? 'Needs attention' : 'Connected'} />
  ) : (
    <StatusPill tone="neutral" label="Not connected" />
  )

  return (
    <AppCard
      logoId="open_dental"
      connected={pms.connected}
      accentTop="#1B75BC"
      name="Open Dental"
      description="The most open PMS API in dentistry — two-way sync in minutes with a Customer Key. Audit-clean."
      pill={pill}
    >
      {pms.connected && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Patients, appointments, providers &amp; balances — synced both directions.
        </p>
      )}
      {!pmsEligible ? (
        <ActionButton variant="primary" size="sm" href="/settings/plans?upgrade=integrations">
          Upgrade to Premium
        </ActionButton>
      ) : pms.connected ? (
        <ActionButton variant="secondary" size="sm" href="/integrations/open-dental">
          Manage
        </ActionButton>
      ) : (
        <ActionButton variant="primary" size="sm" href="/integrations/open-dental">
          Connect
        </ActionButton>
      )}
    </AppCard>
  )
}

const PMS_AVAILABILITY_PILL: Record<PmsAvailability, { label: string; tone: Tone }> = {
  live: { label: 'Available', tone: 'ok' },
  request_access: { label: 'Request access', tone: 'info' },
  roadmap: { label: 'Coming soon', tone: 'neutral' },
}

function ComingSoonPmsCard({ provider }: { provider: PmsProviderInfo }) {
  const m = PMS_AVAILABILITY_PILL[provider.availability]
  return (
    <AppCard
      logoId={provider.id as BrandLogoId}
      name={provider.name}
      description={provider.blurb}
      pill={<StatusPill tone={m.tone} label={m.label} />}
    >
      <p className="text-xs text-gray-400 dark:text-gray-500">{provider.connection}</p>
    </AppCard>
  )
}

// ── Google Business card ────────────────────────────────────────────────────

function GoogleBusinessCard({
  configured,
  gbp,
  pending,
  onConnectClick,
  onRefresh,
  onDisconnect,
}: {
  configured: boolean
  gbp: IntegrationsLibraryProps['gbp']
  pending: boolean
  onConnectClick: () => void
  onRefresh: () => void
  onDisconnect: () => void
}) {
  const pill = gbp.connected ? (
    <StatusPill tone="ok" label="Connected" />
  ) : gbp.error ? (
    <StatusPill tone="urgent" label="Needs attention" />
  ) : (
    <StatusPill tone="neutral" label="Not connected" />
  )

  return (
    <AppCard
      logoId="googlebusiness"
      connected={gbp.connected}
      accentTop="#4285F4"
      name="Google Business Profile"
      description="Reviews, hours, photos, and local search performance. Free on every plan."
      pill={pill}
    >
      {gbp.connected ? (
        <>
          <HandleWell
            title={gbp.account?.displayName || gbp.account?.username || 'Your Google Business listing'}
            handle={gbp.account?.username && gbp.account?.displayName ? gbp.account.username : null}
          />
          <QuickLinks
            links={[
              { href: '/reviews/received', label: 'Reviews' },
              { href: '/seo', label: 'Local search' },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" size="sm" href="/integrations/google-business">
              Manage
            </ActionButton>
            <ActionButton variant="ghost" size="sm" onClick={onRefresh} disabled={pending}>
              {pending ? 'Refreshing…' : 'Refresh'}
            </ActionButton>
            <ActionButton variant="danger" size="sm" onClick={onDisconnect} disabled={pending}>
              Disconnect
            </ActionButton>
          </div>
        </>
      ) : configured ? (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            variant="primary"
            size="sm"
            href="/api/integrations/zernio/connect?platform=googlebusiness"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onConnectClick}
          >
            Connect Google Business
          </ActionButton>
          <ActionButton variant="ghost" size="sm" onClick={onRefresh} disabled={pending}>
            {pending ? 'Checking…' : 'I just connected — refresh'}
          </ActionButton>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">Not enabled on this instance yet.</p>
      )}
    </AppCard>
  )
}

// ── Social card ──────────────────────────────────────────────────────────────

const SOCIAL_ACCENT: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#111111',
  youtube: '#FF0000',
  linkedin: '#0A66C2',
}

function SocialCard({
  channel,
  configured,
  capAllowed,
  entitlement,
  pending,
  onConnectClick,
  onDisconnect,
  onBuyAddon,
}: {
  channel: SocialChannelView
  configured: boolean
  capAllowed: boolean
  entitlement: IntegrationsLibraryProps['entitlement']
  pending: boolean
  onConnectClick: () => void
  onDisconnect: () => void
  onBuyAddon: () => void
}) {
  const isConnected = channel.account !== null
  const pill = isConnected ? <StatusPill tone="ok" label="Connected" /> : <StatusPill tone="neutral" label="Not connected" />
  const handle = channel.account?.username || channel.account?.displayName
  const logoId = channel.platform as BrandLogoId
  const accent = SOCIAL_ACCENT[channel.platform] ?? '#28b3ad'

  return (
    <AppCard
      logoId={logoId}
      connected={isConnected}
      accentTop={accent}
      name={channel.label}
      description="Publish and schedule posts from one place."
      pill={pill}
    >
      {isConnected ? (
        <>
          <HandleWell title={channel.account?.displayName || channel.label} handle={handle} />
          <QuickLinks links={[{ href: '/social-posts', label: 'Compose a post' }]} />
          <ActionButton variant="danger" size="sm" onClick={onDisconnect} disabled={pending}>
            Disconnect
          </ActionButton>
        </>
      ) : capAllowed && configured ? (
        <ActionButton
          variant="secondary"
          size="sm"
          href={`/api/integrations/zernio/connect?platform=${channel.platform}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onConnectClick}
        >
          Connect
        </ActionButton>
      ) : entitlement.addonAvailable ? (
        <ActionButton variant="ghost" size="sm" onClick={onBuyAddon} disabled={pending}>
          {entitlement.addonActive ? 'At limit' : 'Add a slot'}
        </ActionButton>
      ) : (
        <ActionButton variant="ghost" size="sm" href="/settings/plans">
          Upgrade
        </ActionButton>
      )}
    </AppCard>
  )
}

// ── Social add-on management (consolidated from Settings → Billing) ─────────

function SocialAddonCard({
  entitlement,
  cap,
  pending,
  onBuy,
  onCancel,
}: {
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
          Your <strong className="font-medium">{entitlement.planName}</strong> plan includes{' '}
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
