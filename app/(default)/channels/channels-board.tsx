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
import { refreshChannelsAction, disconnectChannelAction } from './actions'

/**
 * Channels surface — the canonical place a clinic connects its Google + social
 * presence through the Zernio hosted-OAuth flow. DESIGN-SYSTEM v2 throughout
 * (.v2-panel etched surfaces, teal primary, StatusPill).
 *
 * Layout:
 *  - A Google Business row (free on every plan; connect / disconnect / refresh).
 *  - A Social channels section listing the 5 shortlisted platforms, each with a
 *    connect button OR connected handle + Disconnect, plus a "{current} of
 *    {limit} social connections used" meter. At the cap (or Basic = 0), the
 *    Connect buttons become an upgrade / add-on CTA → Settings → Billing.
 *
 * Connect opens Zernio's hosted OAuth in a NEW TAB + re-syncs on window focus +
 * a Refresh button (same pattern the GBP card uses) — Zernio's default return is
 * its own dashboard, so the focus-poll guarantees detection. Demo connections
 * never hit the network (the service short-circuits) — rows just show the seeded
 * connected state.
 */

export interface ChannelsBoardProps {
  configured: boolean
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
  /** Entitlement context for the cap CTA copy. */
  entitlement: {
    planName: string
    /** Whether the add-on can be purchased on this plan (false on Basic). */
    addonAvailable: boolean
    /** Whether the add-on is currently active. */
    addonActive: boolean
    /** What the add-on would raise the social limit to. */
    addonRaisesTo: number
  }
  /** A just-connected platform slug (flash success), or null. */
  justConnected: ZernioPlatform | null
  /** A platform the connect route bounced off the cap, or null. */
  atLimit: ZernioPlatform | null
  /** A connect/sync error message surfaced by the route, or null. */
  routeError: string | null
}

export default function ChannelsBoard({
  configured,
  gbp,
  socialChannels,
  cap,
  entitlement,
  justConnected,
  atLimit,
  routeError,
}: ChannelsBoardProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(routeError)
  // After opening any connect tab, poll on focus until accounts refresh.
  const awaitingConnect = useRef(false)

  function refresh() {
    setError(null)
    start(async () => {
      const r = await refreshChannelsAction()
      if (!r.ok) setError(r.error ?? 'Could not refresh channels.')
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

  return (
    <div>
      {/* Flash: just connected */}
      {justConnected && (
        <p className="mb-4 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/15 rounded-[var(--r-md)] px-3 py-2">
          {ZERNIO_PLATFORM_LABELS[justConnected]} connected. It can take a moment to appear — hit Refresh if you don’t see
          it yet.
        </p>
      )}

      {/* Flash: bounced off the cap */}
      {atLimit && (
        <p className="mb-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-500/15 rounded-[var(--r-md)] px-3 py-2">
          You’ve used all your social connections, so {ZERNIO_PLATFORM_LABELS[atLimit]} wasn’t connected.{' '}
          {entitlement.addonAvailable ? (
            <Link href="/settings/billing" className="font-medium underline">
              Add more in Billing →
            </Link>
          ) : (
            <Link href="/settings/plans" className="font-medium underline">
              Upgrade to Pro →
            </Link>
          )}
        </p>
      )}

      {!configured && (
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 italic">
          Channels aren’t enabled on this DreamCRM instance yet.
        </p>
      )}

      {/* ── Google Business ─────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Google Business</h2>
          <StatusPill tone="special" label="Free on every plan" />
        </div>

        <div className="v2-panel p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-[color:var(--color-brand-soft,theme(colors.teal.500/15))] text-teal-700 dark:text-teal-300 text-lg">
              {ZERNIO_PLATFORM_ICONS.googlebusiness}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Google Business Profile</h3>
                {gbp.connected ? (
                  <StatusPill tone="ok" label="Connected" />
                ) : gbp.error ? (
                  <StatusPill tone="urgent" label="Needs attention" />
                ) : (
                  <StatusPill tone="neutral" label="Not connected" />
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your reviews, hours, photos, and local search stats — through Zernio’s secure sign-in (no Google
                verification paperwork on your end).
              </p>
            </div>
          </div>

          {gbp.connected ? (
            <>
              <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-3 py-2.5 mb-3">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {gbp.account?.displayName || gbp.account?.username || 'Your Google Business listing'}
                </p>
                {gbp.account?.username && gbp.account?.displayName && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num">{gbp.account.username}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="secondary" size="sm" onClick={refresh} disabled={pending}>
                  {pending ? 'Refreshing…' : 'Refresh'}
                </ActionButton>
                <ActionButton
                  variant="danger"
                  size="sm"
                  onClick={() => disconnect('googlebusiness')}
                  disabled={pending}
                >
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
              <ActionButton variant="ghost" size="sm" onClick={refresh} disabled={pending}>
                {pending ? 'Checking…' : 'I just connected — refresh'}
              </ActionButton>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Social channels ─────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Social channels</h2>
          <span className="text-xs text-gray-600 dark:text-gray-300">
            <strong className="font-mono-num font-semibold">{cap.current}</strong>
            <span className="text-gray-400"> of </span>
            <strong className="font-mono-num font-semibold">{cap.limit}</strong> social connections used
          </span>
        </div>

        {/* Cap CTA — shown when at the limit (incl. Basic = 0). */}
        {!cap.allowed && (
          <div className="v2-well p-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              {cap.reason ?? 'You’ve reached your social-connection limit.'}
            </p>
            {entitlement.addonAvailable ? (
              <ActionButton variant="primary" size="sm" href="/settings/billing">
                {entitlement.addonActive ? 'Manage in Billing' : `Add more (up to ${entitlement.addonRaisesTo})`}
              </ActionButton>
            ) : (
              <ActionButton variant="primary" size="sm" href="/settings/plans">
                Upgrade to Pro
              </ActionButton>
            )}
          </div>
        )}

        <div className="v2-panel divide-y divide-[color:var(--color-hairline)]">
          {socialChannels.map((ch) => {
            const isConnected = ch.account !== null
            return (
              <div key={ch.platform} className="flex items-center gap-3 p-4">
                <div
                  className="w-9 h-9 rounded-[var(--r-md)] shrink-0 flex items-center justify-center bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] text-base"
                  aria-hidden="true"
                >
                  {ch.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{ch.label}</p>
                    {isConnected && <StatusPill tone="ok" label="Connected" />}
                  </div>
                  {isConnected && (ch.account?.username || ch.account?.displayName) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num truncate">
                      {ch.account?.username || ch.account?.displayName}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {isConnected ? (
                    <ActionButton
                      variant="danger"
                      size="sm"
                      onClick={() => disconnect(ch.platform)}
                      disabled={pending}
                    >
                      Disconnect
                    </ActionButton>
                  ) : cap.allowed && configured ? (
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      href={`/api/integrations/zernio/connect?platform=${ch.platform}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onConnectClick}
                    >
                      Connect
                    </ActionButton>
                  ) : entitlement.addonAvailable ? (
                    <ActionButton variant="ghost" size="sm" href="/settings/billing">
                      {entitlement.addonActive ? 'At limit' : 'Add a slot'}
                    </ActionButton>
                  ) : (
                    <ActionButton variant="ghost" size="sm" href="/settings/plans">
                      Upgrade
                    </ActionButton>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton variant="ghost" size="sm" onClick={refresh} disabled={pending}>
            {pending ? 'Checking…' : 'I just connected — refresh'}
          </ActionButton>
          <Link
            href="/settings/billing"
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline self-center"
          >
            Manage your plan &amp; add-on →
          </Link>
        </div>
      </section>

      {error && (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
