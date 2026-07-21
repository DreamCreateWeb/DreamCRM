'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { DomainOffer } from '@/lib/services/domain-purchase'
import type { DomainPurchaseView } from '@/lib/services/domain-purchase'
import { searchDomainsAction, purchaseDomainAction } from './buy-domain-actions'

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Buy-a-domain (2026-07-21): search → pick → one confirm → done. The whole
 * point is that a clinic never sees a DNS screen — we register the domain on
 * the platform's registrar account and attach it automatically; the connect
 * card above just flips to Active on its own.
 *
 * Money honesty: the confirm modal states the exact yearly price and that it
 * renews annually on their card. Premium/expensive domains never surface
 * (service-side cap), and a price that moved between search and buy aborts.
 */
export default function BuyDomainCard({
  purchases,
  dryRunMode,
}: {
  purchases: DomainPurchaseView[]
  /** True while NAMECOM_LIVE_PURCHASES is off — banner explains no card is charged. */
  dryRunMode: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [offers, setOffers] = useState<DomainOffer[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [confirming, setConfirming] = useState<DomainOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function search() {
    const q = query.trim()
    if (q.length < 3 || searching) return
    setSearching(true)
    setError(null)
    setOffers(null)
    void searchDomainsAction(q)
      .then((res) => {
        if (res.ok) setOffers(res.offers)
        else setError(res.error)
      })
      .catch(() => setError('Search failed. Try again.'))
      .finally(() => setSearching(false))
  }

  function buy(offer: DomainOffer) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await purchaseDomainAction(offer.domainName, offer.purchasePriceCents)
      if (res.ok) {
        setConfirming(null)
        setOffers(null)
        setQuery('')
        setSuccess(
          res.dryRun
            ? `${offer.domainName} — test purchase recorded (no card charged, no domain registered).`
            : `${offer.domainName} is yours! We're connecting it now — the card above goes Active on its own, usually within the hour.`,
        )
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="v2-panel p-5 mt-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Need a domain? Buy one here
        </h2>
        {dryRunMode && (
          <StatusPill tone="info" label="Test mode" title="No card is charged and no domain is registered while test mode is on." />
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Search, buy, done — we register it, connect it to your site, and handle every
        technical record. No other website or registrar account needed.
      </p>

      <div className="flex gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search()
          }}
          placeholder="e.g. brightsmilesdental.com or just brightsmiles"
          aria-label="Search for a domain"
          className="form-input flex-1"
        />
        <ActionButton variant="primary" size="md" onClick={search} disabled={searching || query.trim().length < 3}>
          {searching ? 'Searching…' : 'Search'}
        </ActionButton>
      </div>

      {error && (
        <p className="mb-3 rounded-[var(--r-md)] bg-rose-500/15 px-3 py-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-3 rounded-[var(--r-md)] bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </p>
      )}

      {offers !== null && (
        offers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Nothing available for that search — try another name or a different ending (.com, .dental, .care…).
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--color-hairline)] mb-3" aria-label="Available domains">
            {offers.map((o) => (
              <li key={o.domainName} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {o.domainName}
                </span>
                <span className="text-sm tabular-nums font-mono-num text-gray-600 dark:text-gray-300 shrink-0">
                  {dollars(o.purchasePriceCents)}/yr
                </span>
                <ActionButton variant="secondary" size="sm" onClick={() => setConfirming(o)} disabled={pending}>
                  Buy
                </ActionButton>
              </li>
            ))}
          </ul>
        )
      )}

      {purchases.length > 0 && (
        <div className="mt-2 pt-3 border-t border-[color:var(--color-hairline)]">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Your domain purchases
          </h3>
          <ul className="space-y-1.5">
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 font-medium text-gray-700 dark:text-gray-200 truncate">{p.domain}</span>
                {p.dryRun && <StatusPill tone="neutral" label="Test" />}
                <StatusPill
                  tone={p.status === 'active' ? 'ok' : p.status === 'failed' ? 'urgent' : 'info'}
                  label={p.status === 'active' ? 'Registered' : p.status === 'failed' ? 'Failed' : 'Working…'}
                />
                {p.renewsAt && !p.dryRun && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                    renews {p.renewsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => (pending ? undefined : setConfirming(null))}
        >
          <div
            className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">
              Buy {confirming.domainName}?
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              <strong>{dollars(confirming.purchasePriceCents)} for the first year</strong>
              {confirming.renewalPriceCents !== null &&
                `, then ${dollars(confirming.renewalPriceCents)}/yr`}
              , billed to your card on file.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              We register it and connect it to your site automatically — nothing else to
              set up. You can point it elsewhere or let it lapse anytime.
            </p>
            <div className="flex justify-end gap-2">
              <ActionButton variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" size="sm" onClick={() => buy(confirming)} disabled={pending}>
                {pending ? 'Buying…' : `Buy for ${dollars(confirming.purchasePriceCents)}`}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
