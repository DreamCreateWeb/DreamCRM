'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { BrandLogoWell, type BrandLogoId } from '@/components/integrations/brand-logos'
import { refreshChannelsAction } from './actions'
import { buySocialAddonAction } from '@/app/(default)/integrations/actions'

/**
 * In-place "connect your channels" surface for the Social Posts module — so a
 * clinic that lands here to post but hasn't linked anything can connect its real
 * Google Business + social accounts WITHOUT hunting through the integrations
 * marketplace. Each channel is a one-click connect card using the proven Zernio
 * hosted-OAuth pattern: open the platform's own sign-in in a NEW TAB, then
 * re-detect the connection when the clinic tabs back (focus poll + a Refresh
 * button). We never see their password — they authorize on the platform itself.
 *
 * Two shapes:
 *  - variant="hero" — the empty state (nothing connected). A full panel.
 *  - variant="add"  — a slim "＋ Connect another channel" strip shown above the
 *                     composer once at least one channel is linked.
 *
 * Gating mirrors the connect route + /integrations:
 *  - Google Business is free + uncapped on every plan.
 *  - Social platforms honor the plan's social cap; at the cap we show the add-on
 *    (Pro/Premium) or an upgrade (Basic) instead of a connect button.
 *  - Only an owner/admin can connect; a member sees a calm "ask an owner" note.
 */

/** The six channels a clinic posts to, GBP first (free), then the shortlist. */
const POSTING_CHANNELS: { id: string; logo: BrandLogoId; name: string; social: boolean }[] = [
  { id: 'googlebusiness', logo: 'googlebusiness', name: 'Google Business', social: false },
  { id: 'instagram', logo: 'instagram', name: 'Instagram', social: true },
  { id: 'facebook', logo: 'facebook', name: 'Facebook', social: true },
  { id: 'tiktok', logo: 'tiktok', name: 'TikTok', social: true },
  { id: 'youtube', logo: 'youtube', name: 'YouTube', social: true },
  { id: 'linkedin', logo: 'linkedin', name: 'LinkedIn', social: true },
]

export interface ConnectChannelsProps {
  variant: 'hero' | 'add'
  /** Platform slugs already connected. */
  connected: string[]
  /** Display handle per connected platform (for the connected card). */
  handles?: Record<string, string | null>
  /** Social-cap state from `canConnectSocialPlatform`. */
  cap: { allowed: boolean; limit: number; current: number }
  planName: string
  addonAvailable: boolean
  addonActive: boolean
  addonPriceDollars: number | null
  addonConfigured: boolean
  zernioConfigured: boolean
  /** Owner/admin — only they can connect. */
  canManage: boolean
}

export default function ConnectChannels(props: ConnectChannelsProps) {
  const { variant, connected, zernioConfigured } = props
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // After opening a connect tab, poll on focus until the accounts refresh.
  const awaiting = useRef(false)
  const [addOpen, setAddOpen] = useState(false)

  function refresh() {
    setError(null)
    start(async () => {
      const r = await refreshChannelsAction()
      if (!r.ok) setError(r.error ?? 'Could not refresh your channels.')
      router.refresh()
    })
  }

  function buyAddon() {
    setError(null)
    start(async () => {
      const r = await buySocialAddonAction()
      if (!r.ok) setError(r.error ?? 'Could not add a social slot.')
      router.refresh()
    })
  }

  function onConnectClick() {
    awaiting.current = true
  }

  useEffect(() => {
    function onFocus() {
      if (awaiting.current && !pending) {
        awaiting.current = false
        refresh()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const handlers: CardHandlers = { ...props, pending, onConnectClick, onBuyAddon: buyAddon, onRefresh: refresh }

  // ── "add" variant: a slim strip that expands the connect grid ──────────────
  if (variant === 'add') {
    const remaining = POSTING_CHANNELS.filter((c) => !connected.includes(c.id))
    if (remaining.length === 0) return null // everything's connected
    return (
      <div className="v2-card p-3.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium text-gray-800 dark:text-gray-100">{connected.length}</span>{' '}
            {connected.length === 1 ? 'channel' : 'channels'} connected.{' '}
            <span className="text-gray-500 dark:text-gray-400">Add another to reach more patients.</span>
          </p>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            aria-expanded={addOpen}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 px-3 py-1.5 text-[13px] font-medium hover:bg-teal-500/15 transition"
          >
            <span aria-hidden="true" className="text-base leading-none">＋</span>
            Connect another channel
          </button>
        </div>
        {addOpen && (
          <div className="mt-4">
            <ChannelGrid channels={remaining} handlers={handlers} />
            <CapNote {...props} className="mt-3" />
          </div>
        )}
        {error && <ErrorLine error={error} />}
      </div>
    )
  }

  // ── "hero" variant: the full empty-state connect panel ─────────────────────
  return (
    <section className="v2-panel p-6 sm:p-7 section-enter">
      <div className="max-w-prose">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
          Get set up
        </p>
        <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
          Connect your channels to start posting
        </h2>
        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">
          Link your Google Business listing and the social accounts you post to. You&apos;ll sign in on each
          platform&apos;s own page — we never see your password — and then you can write one post and send it to all of
          them at once.
        </p>
      </div>

      {!zernioConfigured ? (
        <p className="mt-5 text-sm text-gray-500 dark:text-gray-400 italic">
          Channel connections aren&apos;t enabled on this DreamCRM instance yet.
        </p>
      ) : (
        <>
          <div className="mt-5">
            <ChannelGrid channels={POSTING_CHANNELS} handlers={handlers} />
          </div>
          <CapNote {...props} className="mt-4" />
          {!props.canManage && (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Ask an owner or admin to connect your channels — then you can post from here.
            </p>
          )}
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
            Want the full picture?{' '}
            <Link href="/integrations" className="font-medium text-teal-700 dark:text-teal-400 underline">
              Manage all integrations →
            </Link>
          </p>
        </>
      )}
      {error && <ErrorLine error={error} />}
    </section>
  )
}

// ── The channel grid + card ──────────────────────────────────────────────────

interface CardHandlers extends ConnectChannelsProps {
  pending: boolean
  onConnectClick: () => void
  onBuyAddon: () => void
  onRefresh: () => void
}

function ChannelGrid({
  channels,
  handlers,
}: {
  channels: typeof POSTING_CHANNELS
  handlers: CardHandlers
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {channels.map((ch) => (
        <ChannelCard key={ch.id} channel={ch} handlers={handlers} />
      ))}
    </div>
  )
}

function ChannelCard({
  channel,
  handlers,
}: {
  channel: (typeof POSTING_CHANNELS)[number]
  handlers: CardHandlers
}) {
  const { connected, handles, cap, canManage, zernioConfigured } = handlers
  const isConnected = connected.includes(channel.id)
  const handle = handles?.[channel.id] ?? null

  return (
    <div className="v2-card-interactive p-3.5 flex flex-col items-center text-center gap-1.5">
      <BrandLogoWell id={channel.logo} connected={isConnected} wellSize={52} size={28} />
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{channel.name}</p>

      {isConnected ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckIcon />
          <span className="truncate max-w-[10rem]">{handle ? handle : 'Connected'}</span>
        </span>
      ) : !channel.social ? (
        // Google Business — free + uncapped on every plan.
        <>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Free · always</span>
          <ConnectButton channel={channel} handlers={handlers} primary />
        </>
      ) : !zernioConfigured ? (
        <span className="text-[11px] text-gray-400 italic mt-1">Not enabled yet</span>
      ) : !canManage ? (
        <span className="text-[11px] text-gray-400 mt-1">Owner/admin only</span>
      ) : !cap.allowed ? (
        <AtCapAction handlers={handlers} />
      ) : (
        <ConnectButton channel={channel} handlers={handlers} />
      )}
    </div>
  )
}

// Button-look classes (mirrors ActionButton's sm variants). We render the
// connect action as a real <a> — not ActionButton — because its onClick (which
// arms the focus-refresh so the connection auto-detects on return) and
// aria-label must actually apply, and ActionButton's Link branch drops both.
const BTN_PRIMARY = 'btn-sm bg-teal-500 hover:bg-teal-600 text-white dark:bg-teal-400 dark:hover:bg-teal-300 dark:text-gray-900'
const BTN_SECONDARY =
  'btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300'

function ConnectButton({
  channel,
  handlers,
  primary = false,
}: {
  channel: (typeof POSTING_CHANNELS)[number]
  handlers: CardHandlers
  primary?: boolean
}) {
  // Members can't connect — surface a calm note instead of a dead button.
  if (!handlers.canManage) {
    return <span className="text-[11px] text-gray-400 mt-1">Owner/admin only</span>
  }
  return (
    <a
      href={`/api/integrations/zernio/connect?platform=${channel.id}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handlers.onConnectClick}
      aria-label={`Connect ${channel.name}`}
      className={`${primary ? BTN_PRIMARY : BTN_SECONDARY} mt-1`}
    >
      Connect
    </a>
  )
}

/** At the social cap: offer the add-on (Pro/Premium) or an upgrade (Basic). */
function AtCapAction({ handlers }: { handlers: CardHandlers }) {
  const { addonAvailable, addonActive, addonConfigured, addonPriceDollars, pending, onBuyAddon } = handlers
  if (addonAvailable && !addonActive && addonConfigured && addonPriceDollars != null) {
    return (
      <ActionButton variant="ghost" size="sm" onClick={onBuyAddon} disabled={pending} className="mt-1">
        {pending ? 'Working…' : `Add a slot — $${addonPriceDollars}/mo`}
      </ActionButton>
    )
  }
  // Basic (no add-on) or add-on already maxed → point at plans.
  return (
    <ActionButton variant="ghost" size="sm" href="/settings/plans" className="mt-1">
      {addonAvailable ? 'At limit' : 'Upgrade to post'}
    </ActionButton>
  )
}

// ── Cap note + small bits ────────────────────────────────────────────────────

function CapNote({
  cap,
  planName,
  className = '',
}: Pick<ConnectChannelsProps, 'cap' | 'planName'> & { className?: string }) {
  if (cap.limit <= 0) {
    return (
      <p className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
        Your <strong className="font-medium">{planName}</strong> plan posts to Google Business (free). Social posting is
        on Pro &amp; Premium.
      </p>
    )
  }
  return (
    <p className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
      Your <strong className="font-medium">{planName}</strong> plan includes{' '}
      <strong className="font-mono-num font-medium">{cap.current}</strong>
      <span className="text-gray-400"> / </span>
      <strong className="font-mono-num font-medium">{cap.limit}</strong> social connections. Google Business is always
      free and never counts.
    </p>
  )
}

function ErrorLine({ error }: { error: string }) {
  return (
    <p className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2" role="alert">
      {error}
    </p>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}
