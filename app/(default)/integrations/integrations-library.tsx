'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import {
  ZERNIO_PLATFORM_LABELS,
  ZERNIO_PLATFORM_ICONS,
  type SocialChannelView,
  type ZernioAccount,
  type ZernioPlatform,
} from '@/lib/types/zernio'
import { PMS_PROVIDERS, type PmsAvailability, type PmsProviderInfo } from '@/lib/types/pms'
import type { Tone } from '@/lib/ui/encodings'
import {
  syncZernioAccountsAction,
  disconnectChannelAction,
  buySocialAddonAction,
  cancelSocialAddonAction,
} from './actions'

/**
 * Integrations app-library — the redesigned /integrations directory (replaces
 * the dense PMS-connector dashboard framing + folds in the former /channels
 * surface). A calm, inviting GRID of integration cards grouped into sections,
 * like an app marketplace (Slack app directory / Vercel Integrations):
 *
 *   1. Practice management — Open Dental (Connect / Manage / Premium) + the
 *      roadmap PMSs as "Coming soon" tiles. Open Dental is Premium-gated; a
 *      below-Premium clinic sees the card with a calm Premium pill + upgrade
 *      affordance (no redirect). The deep PMS management lives BELOW the grid,
 *      server-rendered (see page.tsx) — "Manage" anchors to it.
 *   2. Google — Google Business (free on every plan; connect / manage / refresh
 *      / disconnect). Connect opens Zernio hosted OAuth in a NEW TAB + re-syncs
 *      on window focus + a Refresh button (the GBP-card pattern).
 *   3. Social — Instagram / Facebook / TikTok / YouTube / LinkedIn (cap-gated),
 *      a "{current} of {limit} social connections used" meter, and the social
 *      add-on management consolidated here (Active w/ Cancel · Available "Add
 *      more $X/mo" w/ Buy · "Upgrade to Pro" for Basic · "coming soon" if the
 *      Stripe price env is unset · "managed billing" for comped). At the cap,
 *      social Connect becomes the upgrade/add-on CTA.
 *
 * DESIGN-SYSTEM v2 throughout (.v2-panel / .v2-card etched surfaces, teal
 * primary, StatusPill, font-mono-num). Demo connections never hit the network
 * (the service short-circuits) — cards just show the seeded connected state.
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

  return (
    <div className="space-y-10">
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

      {/* ── Practice management ──────────────────────────────────────────── */}
      <Section
        title="Practice management"
        blurb="Sync the relationship layer — patients, appointments, providers, balances — both directions, through your PMS's official API. We never touch your database directly."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <OpenDentalCard pmsEligible={pmsEligible} pms={pms} />
          {roadmapPms.map((p) => (
            <ComingSoonPmsCard key={p.id} provider={p} />
          ))}
        </div>
      </Section>

      {/* ── Google ───────────────────────────────────────────────────────── */}
      <Section
        title="Google"
        blurb="Your reviews, verified hours, photos, and local search stats — through Zernio’s secure sign-in (no Google verification paperwork on your end)."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <GoogleBusinessTile
            configured={zernioConfigured}
            gbp={gbp}
            pending={pending}
            onConnectClick={onConnectClick}
            onRefresh={refresh}
            onDisconnect={() => disconnect('googlebusiness')}
          />
        </div>
      </Section>

      {/* ── Social ───────────────────────────────────────────────────────── */}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {socialChannels.map((ch) => (
            <SocialTile
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
        </div>

        {/* Add-on management — consolidated here (the canonical surface). */}
        <SocialAddonCard
          entitlement={entitlement}
          cap={cap}
          pending={pending}
          onBuy={buyAddon}
          onCancel={cancelAddon}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton variant="ghost" size="sm" onClick={refresh} disabled={pending}>
            {pending ? 'Checking…' : 'I just connected — refresh'}
          </ActionButton>
        </div>
      </Section>

      {!zernioConfigured && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          Google &amp; social channels aren’t enabled on this DreamCRM instance yet.
        </p>
      )}

      {error && (
        <p className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────

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
    <section>
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

// ── A reusable app-library card frame ──────────────────────────────────────

function AppCard({
  icon,
  iconClass,
  name,
  description,
  pill,
  children,
}: {
  icon: React.ReactNode
  iconClass: string
  name: string
  description: string
  pill: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="v2-card p-4 flex flex-col h-full">
      <div className="flex items-start gap-3 mb-2">
        <div
          className={`w-10 h-10 rounded-[var(--r-md)] shrink-0 flex items-center justify-center text-lg ${iconClass}`}
          aria-hidden="true"
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{name}</h3>
            {pill}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      {/* Footer pinned to the bottom so a grid of cards has aligned actions. */}
      {children && <div className="mt-auto pt-2">{children}</div>}
    </div>
  )
}

// ── Practice management cards ──────────────────────────────────────────────

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
      icon={<PlugIcon />}
      iconClass="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      name="Open Dental"
      description="The most open PMS API in dentistry — connect in minutes with a Customer Key. Sanctioned + audit-clean."
      pill={pill}
    >
      {!pmsEligible ? (
        <ActionButton variant="primary" size="sm" href="/settings/plans?upgrade=integrations">
          Upgrade to Premium
        </ActionButton>
      ) : pms.connected ? (
        <ActionButton variant="secondary" size="sm" href="#open-dental-detail">
          Manage
        </ActionButton>
      ) : (
        <ActionButton variant="primary" size="sm" href="#connect-open-dental">
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
      icon={<PlugIcon />}
      iconClass="bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400"
      name={provider.name}
      description={provider.blurb}
      pill={<StatusPill tone={m.tone} label={m.label} />}
    >
      <p className="text-xs text-gray-400 dark:text-gray-500">{provider.connection}</p>
    </AppCard>
  )
}

// ── Google Business tile ───────────────────────────────────────────────────

function GoogleBusinessTile({
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
      icon={ZERNIO_PLATFORM_ICONS.googlebusiness}
      iconClass="bg-[color:var(--color-brand-soft,theme(colors.teal.500/15))] text-teal-700 dark:text-teal-300"
      name="Google Business Profile"
      description="Reviews, hours, photos, and local search performance. Free on every plan."
      pill={pill}
    >
      {gbp.connected ? (
        <>
          <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-3 py-2 mb-2">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
              {gbp.account?.displayName || gbp.account?.username || 'Your Google Business listing'}
            </p>
            {gbp.account?.username && gbp.account?.displayName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num truncate">{gbp.account.username}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" size="sm" onClick={onRefresh} disabled={pending}>
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

// ── Social tile ────────────────────────────────────────────────────────────

function SocialTile({
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

  return (
    <AppCard
      icon={channel.icon}
      iconClass="bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] text-gray-700 dark:text-gray-200"
      name={channel.label}
      description={isConnected && handle ? handle : 'Publish and schedule posts from one place.'}
      pill={pill}
    >
      {isConnected ? (
        <ActionButton variant="danger" size="sm" onClick={onDisconnect} disabled={pending}>
          Disconnect
        </ActionButton>
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
    <div className="v2-well p-4 mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

function PlugIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V3m6 4V3M7 11h10M9 11v4a3 3 0 003 3v3m0-3a3 3 0 003-3v-4" />
    </svg>
  )
}
