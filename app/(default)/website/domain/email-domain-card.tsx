'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'
import type { EmailDomainState } from '@/lib/services/email-domain'
import { OWN_DOMAIN_LOCAL_PART } from '@/lib/email-identity'
import { isBackedOff } from '@/lib/email-domain-backoff'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { runAction } from '@/lib/run-action'
import { requestEmailDomainAction, checkEmailDomainAction } from './email-domain-actions'

interface Props {
  /** The Resend domain state (null = not requested yet). */
  initialState: EmailDomainState | null
  /** The site's own domain once ACTIVE (null = the card does not render). */
  siteDomain: string | null
  timeZone: string
}

const META: Record<EmailDomainState['status'], { tone: Tone; label: string }> = {
  pending: { tone: 'warn', label: 'Waiting on DNS' },
  verified: { tone: 'ok', label: 'Sending from your domain' },
  failed: { tone: 'urgent', label: 'Needs attention' },
}

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
      <span className="shrink-0 text-xs uppercase tracking-wide">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

const TH = 'px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400'

export default function EmailDomainCard({ initialState, siteDomain, timeZone }: Props) {
  const [state, setState] = useState<EmailDomainState | null>(initialState)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<'request' | 'check' | null>(null)

  if (!siteDomain) return null
  const meta = state ? META[state.status] : null
  const missing = state ? state.records.filter((r) => r.status !== 'verified') : []
  const backedOff = state ? state.status !== 'verified' && isBackedOff(state.failedChecks) : false

  function request() {
    setError(null)
    setNote(null)
    setActive('request')
    startTransition(async () => {
      try {
        const res = await runAction(() => requestEmailDomainAction())
        if (res.ok) setState(res.state)
        else setError(res.error)
      } finally {
        setActive(null)
      }
    })
  }

  function check() {
    setError(null)
    setNote(null)
    setActive('check')
    startTransition(async () => {
      try {
        const res = await runAction(() => checkEmailDomainAction())
        if (res.ok) {
          setState(res.state)
          setNote(
            res.state.status === 'verified'
              ? 'Verified — patient email now comes from your domain.'
              : 'Not verified yet — DNS changes can take up to an hour to show up.',
          )
        } else {
          setError(res.error)
        }
      } finally {
        setActive(null)
      }
    })
  }

  return (
    <section className="px-5 py-6 sm:px-8 sm:py-8 border-t border-[color:var(--color-hairline)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Send email from your domain</h2>
        {meta && <StatusPill tone={meta.tone} label={meta.label} />}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-2xl">
        Right now patient email comes from a Dream Create address with your practice’s name on it. Add the records
        below and it will come from{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {OWN_DOMAIN_LOCAL_PART}@{siteDomain}
        </span>{' '}
        instead. Replies still land in your Messages inbox, and nothing about your existing email changes.
      </p>

      {!state ? (
        <ActionButton variant="primary" onClick={request} pending={pending && active === 'request'} disabled={pending}>
          Send email from {siteDomain}
        </ActionButton>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {state.status === 'verified' ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Every record checks out. Patient email now comes from{' '}
              <span className="font-medium">
                {OWN_DOMAIN_LOCAL_PART}@{state.domain}
              </span>
              .
            </p>
          ) : state.status === 'failed' ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {missing.length > 0
                ? `Our email provider could not verify ${state.domain}. ${missing.length === 1 ? 'This record is' : `These ${missing.length} records are`} still missing or wrong — fix ${missing.length === 1 ? 'it' : 'them'} where you manage the DNS, then try again.`
                : `Our email provider could not verify ${state.domain}. Check the records at your DNS host, then try again.`}{' '}
              Email keeps coming from the Dream Create address meanwhile.
            </p>
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {missing.length > 0
                ? `Add ${missing.length === 1 ? 'this record' : `these ${missing.length} records`} where you manage ${state.domain}’s DNS. Until they are verified, email keeps coming from the Dream Create address.`
                : 'The records are in — we’re waiting on the email provider to confirm them. Email keeps coming from the Dream Create address until it does.'}
            </p>
          )}

          {state.records.length > 0 && (
            <div className="overflow-x-auto rounded-[var(--r-md)] shadow-[inset_0_0_0_1px_var(--color-hairline)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[color:var(--color-surface-sunk)] text-left">
                    <th className={TH}>Record</th>
                    <th className={TH}>Type</th>
                    <th className={TH}>Name / Host</th>
                    <th className={TH}>Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-hairline)]">
                  {state.records.map((r, i) => (
                    <tr key={`${r.name}-${r.type}-${i}`} className="align-top">
                      <td className="px-3 py-2">
                        <StatusPill tone={r.status === 'verified' ? 'ok' : r.status === 'failed' ? 'urgent' : 'warn'} label={`${r.purpose} · ${r.status === 'verified' ? 'verified' : r.status === 'failed' ? 'wrong' : 'missing'}`} />
                      </td>
                      <td className="px-3 py-2 font-mono-num text-xs text-gray-700 dark:text-gray-300">{r.type}</td>
                      <td className="px-3 py-2 font-mono-num text-xs text-gray-700 dark:text-gray-300 break-all">
                        <CopyValue value={r.host} />
                        <p className="mt-0.5 font-sans text-xs leading-snug text-gray-500 dark:text-gray-400 whitespace-normal">
                          full: {r.name}
                        </p>
                      </td>
                      <td className="px-3 py-2 font-mono-num text-xs text-gray-700 dark:text-gray-300 break-all">
                        <CopyValue value={r.value} />
                        {r.found && r.status !== 'verified' && (
                          <p className="mt-0.5 font-sans text-xs leading-snug text-rose-600 dark:text-rose-400 whitespace-normal">
                            We found: {r.found}
                          </p>
                        )}
                        {typeof r.priority === 'number' && (
                          <p className="mt-0.5 font-sans text-xs text-gray-500 dark:text-gray-400">Priority {r.priority}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {state.status !== 'verified' && (
              <ActionButton variant="secondary" onClick={state.status === 'failed' ? request : check} pending={pending && (active === 'check' || active === 'request')} disabled={pending}>
                {state.status === 'failed' ? 'Try again' : 'Check now'}
              </ActionButton>
            )}
            {state.status !== 'verified' && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {backedOff
                  ? 'This has failed a few times, so we now check once a day — press Try again after you fix the records.'
                  : 'Checking every 15 minutes — you can leave this page.'}
              </span>
            )}
            {state.checkedAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                Checked {formatClinicDayTime(new Date(state.checkedAt), timeZone)}
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
