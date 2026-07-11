'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'
import type { CustomDomainStatus, CustomDomainState } from '@/lib/services/custom-domain'
import type { DnsProviderInfo } from '@/lib/services/dns-provider'
import {
  requestCustomDomainAction,
  checkCustomDomainStatusAction,
  removeCustomDomainAction,
  detectDnsProviderAction,
} from './custom-domain-actions'

interface Props {
  /** Current saved status (null = no custom domain configured). */
  initialStatus: CustomDomainStatus | null
  /** The clinic's subdomain fallback, shown as the current address. */
  subdomainUrl: string
}

const STATE_META: Record<CustomDomainState, { tone: Tone; label: string; title: string }> = {
  pending_dns: {
    tone: 'warn',
    label: 'Pending DNS',
    title: 'Waiting for the DNS records below to be added + verified.',
  },
  active: {
    tone: 'ok',
    label: 'Active',
    title: 'Your domain is live and serving your website.',
  },
  failed: {
    tone: 'urgent',
    label: 'Needs attention',
    title: 'Setup didn’t finish — check the records, or remove and try again.',
  },
}

/** A monospace value with a click-to-copy affordance — handy for pasting a DNS
 *  record straight into a registrar (or handing it to the client). */
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => {},
        )
      }}
      title="Copy"
      className="group inline-flex items-start gap-1.5 text-left hover:text-teal-600 dark:hover:text-teal-400"
    >
      <span className="break-all">{value}</span>
      <span className="shrink-0 text-xs uppercase tracking-wide opacity-0 group-hover:opacity-70">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}

export default function CustomDomainCard({ initialStatus, subdomainUrl }: Props) {
  const [status, setStatus] = useState<CustomDomainStatus | null>(initialStatus)
  const [domain, setDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [provider, setProvider] = useState<DnsProviderInfo | null>(null)
  const [autoChecking, setAutoChecking] = useState(false)
  const [pending, startTransition] = useTransition()

  const isPending = status?.state === 'pending_dns'
  const detectDomain = status?.domain ?? null

  // Detect the clinic's DNS provider once we have a pending domain, so we can
  // show provider-specific "where to add these" instructions + a deep link.
  useEffect(() => {
    if (!detectDomain || !isPending) {
      setProvider(null)
      return
    }
    let cancelled = false
    detectDnsProviderAction(detectDomain).then((res) => {
      if (!cancelled && res.ok) setProvider(res.detection.provider)
    })
    return () => {
      cancelled = true
    }
  }, [detectDomain, isPending])

  // Auto-poll App Runner while pending so the card flips to Active on its own —
  // no more hunting for "Check status". Polls every 45s, quietly.
  const polledActive = useRef(false)
  useEffect(() => {
    if (!isPending) return
    const id = setInterval(async () => {
      setAutoChecking(true)
      const res = await checkCustomDomainStatusAction()
      setAutoChecking(false)
      if (res.ok) {
        setStatus(res.status)
        if (res.status.state === 'active' && !polledActive.current) {
          polledActive.current = true
          setNote('Your domain is live. 🎉')
        }
      }
    }, 45000)
    return () => clearInterval(id)
  }, [isPending])

  function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setNote(null)
    startTransition(async () => {
      const res = await requestCustomDomainAction(domain)
      if (res.ok) {
        setStatus(res.status)
        setDomain('')
      } else {
        setError(res.error)
      }
    })
  }

  function check() {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const res = await checkCustomDomainStatusAction()
      if (res.ok) {
        setStatus(res.status)
        setNote(
          res.status.state === 'active'
            ? 'Your domain is live.'
            : 'Still pending — DNS changes can take up to an hour to propagate.',
        )
      } else {
        setError(res.error)
      }
    })
  }

  function remove() {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const res = await removeCustomDomainAction()
      if (res.ok) {
        setStatus(null)
        setNote('Custom domain removed. Your site is back on its free address.')
      } else {
        setError(res.error)
      }
    })
  }

  const meta = status ? STATE_META[status.state] : null

  return (
    <section className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Custom domain
        </h2>
        {meta && <StatusPill tone={meta.tone} label={meta.label} title={meta.title} />}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-2xl">
        Use your own web address for your site — enter it with or without the{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">www.</span> (like{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">yourpractice.com</span>) and
        we’ll set up both. Your site is always reachable at{' '}
        <a
          href={subdomainUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          {subdomainUrl.replace(/^https?:\/\//, '')}
        </a>{' '}
        even without one.
      </p>

      {!status ? (
        <form onSubmit={connect} className="flex flex-col sm:flex-row gap-3 sm:items-end max-w-2xl">
          <div className="flex-1">
            <label
              htmlFor="custom-domain-input"
              className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5"
            >
              Your domain
            </label>
            <input
              id="custom-domain-input"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="www.yourpractice.com"
              className="form-input w-full"
              disabled={pending}
            />
          </div>
          <ActionButton type="submit" variant="primary" disabled={pending || !domain.trim()}>
            {pending ? 'Connecting…' : 'Connect'}
          </ActionButton>
        </form>
      ) : (
        <div className="space-y-5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Domain:</span>
            <span className="font-medium text-gray-800 dark:text-gray-100">{status.domain}</span>
          </div>

          {/* DNS records the clinic must add. */}
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              Add these records where you manage{' '}
              <span className="font-medium">{status.domain.replace(/^www\./, '')}</span>’s DNS. The
              routing records point your domain at us; the certificate records prove you own it.
              It’s usually live within an hour.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 max-w-2xl">
              The <span className="font-medium">Host</span> is relative to your domain — enter it
              exactly as shown (<span className="font-mono-num">@</span> means the bare domain
              itself). A few providers want the full name instead; that’s the smaller grey line
              under each host.
            </p>

            {provider && (
              <div className="mb-4 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    Looks like your DNS is at {provider.name}
                  </p>
                  <a
                    href={provider.dnsPanelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
                  >
                    Open {provider.name} DNS →
                  </a>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  {provider.addRecordHelp}
                </p>
                {!provider.supportsApexAlias && (
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                    Heads up: {provider.name} can’t point a bare domain at us directly. The{' '}
                    <span className="font-mono-num">www</span> record works normally — for the bare
                    domain, use {provider.name}’s forwarding to send it to your www address.
                  </p>
                )}
              </div>
            )}

            <div className="overflow-x-auto rounded-[var(--r-md)] shadow-[inset_0_0_0_1px_var(--color-hairline)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[color:var(--color-surface-sunk)] text-left">
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Purpose</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Type</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name / Host</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-hairline)]">
                  {status.dnsRecords.map((r, i) => (
                    <tr key={`${r.name}-${i}`} className="align-top">
                      <td className="px-3 py-2">
                        <StatusPill
                          tone={r.purpose === 'routing' ? 'info' : 'special'}
                          label={r.purpose === 'routing' ? 'Routing' : 'Certificate'}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono-num text-xs text-gray-700 dark:text-gray-300">
                        {r.type}
                      </td>
                      <td className="px-3 py-2 font-mono-num text-xs text-gray-700 dark:text-gray-300 break-all">
                        <CopyValue value={r.host} />
                        <p className="mt-0.5 font-sans text-xs leading-snug text-gray-400 dark:text-gray-500 whitespace-normal">
                          full: {r.name}
                        </p>
                      </td>
                      <td className="px-3 py-2 font-mono-num text-xs text-gray-700 dark:text-gray-300 break-all">
                        <CopyValue value={r.value} />
                        {r.note && (
                          <p className="mt-1.5 font-sans text-xs leading-snug text-gray-500 dark:text-gray-400 whitespace-normal">
                            {r.note}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {status.error === 'manual' && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                We’ll finish setting this up shortly — the certificate value above is a placeholder
                until then. Add the routing record now; we’ll email you if anything else is needed.
              </p>
            )}
          </div>

          {isPending && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {autoChecking
                ? 'Checking…'
                : 'We’re checking automatically every minute — you can leave this page; it’ll go live on its own once your records are in and the certificate is issued (usually within the hour).'}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <ActionButton variant="secondary" onClick={check} disabled={pending}>
              {pending ? 'Checking…' : 'Check now'}
            </ActionButton>
            <ActionButton variant="danger" onClick={remove} disabled={pending}>
              Remove
            </ActionButton>
            {status.lastCheckedAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                Last checked {new Date(status.lastCheckedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {note && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{note}</p>}
    </section>
  )
}
