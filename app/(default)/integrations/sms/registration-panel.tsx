'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startSmsRegistrationAction } from '../actions'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { SMS_ENTITY_TYPES, type SmsRegistrationState } from '@/lib/sms-registration'
import type { Tone } from '@/lib/ui/encodings'

/**
 * The SMS registration surface: ONE form when nothing has started, a STATUS
 * REPORT everywhere else. The report is not a console — there is nothing to
 * operate. The only two moments the clinic acts are the two the carriers
 * themselves impose (the email click; corrected details), and both arrive
 * as a plain notice on this panel.
 */

interface Details {
  ein: string | null
  entityType: string | null
  brandContactName: string | null
  brandContactEmail: string | null
}

interface Props {
  canManage: boolean
  state: SmsRegistrationState
  statusText: string
  audience: 'clinic' | 'platform' | null
  notice: string | null
  phoneNumber: string | null
  details: Details
  clinicName: string
  /** Rolling-window segment usage vs the plan's included budget (approved
   *  clinics only; null hides the line). */
  usage?: { used: number; included: number } | null
}

/** Tone contract: working = info, their move = warn, live = ok, ours = neutral
 *  (a suspended clinic is told "we're on it" — alarm with no lever is the
 *  thing the Guardian's audience law exists to prevent). */
const STATE_TONE: Record<SmsRegistrationState, Tone> = {
  none: 'neutral',
  collecting: 'info',
  brand_pending: 'info',
  brand_action_needed: 'warn',
  campaign_pending: 'info',
  number_pending: 'info',
  approved: 'ok',
  rejected: 'warn',
  suspended: 'neutral',
}

const STATE_LABEL: Record<SmsRegistrationState, string> = {
  none: 'Not set up',
  collecting: 'Saving details',
  brand_pending: 'Verifying your business',
  brand_action_needed: 'One thing needed from you',
  campaign_pending: 'Carriers reviewing',
  number_pending: 'Connecting your number',
  approved: 'Live',
  rejected: 'Needs corrected details',
  suspended: 'Paused on our side',
}

export default function RegistrationPanel(props: Props) {
  const showForm = props.state === 'none' || props.state === 'collecting' || props.state === 'rejected'
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-6">
        <div className="flex items-center justify-between gap-3">
          <StatusPill tone={STATE_TONE[props.state]} label={STATE_LABEL[props.state]} />
          {props.phoneNumber && (
            <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-100">
              {props.phoneNumber}
            </span>
          )}
        </div>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{props.statusText}</p>
        {props.usage && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 tabular-nums">
            {props.usage.used.toLocaleString()} of {props.usage.included.toLocaleString()} included
            text segments used this month
            {props.usage.used >= props.usage.included
              ? ' — marketing texts pause until the window rolls over; reminders keep going.'
              : props.usage.used >= props.usage.included * 0.8
                ? ' — getting close; marketing texts pause at the cap, reminders always go.'
                : '.'}
          </p>
        )}
        {props.notice && props.audience === 'clinic' && (
          <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            {props.notice}
          </div>
        )}
      </div>

      {showForm && (props.canManage ? <RegistrationForm {...props} /> : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Ask an owner or admin to set this up — it needs the practice’s tax details.
        </p>
      ))}
    </div>
  )
}

function RegistrationForm({ details, clinicName, state }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<Record<string, string>>({})

  const submit = (formData: FormData) => {
    setError(null)
    setIssues({})
    startTransition(async () => {
      const r = await startSmsRegistrationAction(formData)
      if (r.ok) {
        router.refresh()
        return
      }
      if (r.issues?.length) {
        setIssues(Object.fromEntries(r.issues.map((i) => [i.field, i.message])))
      }
      if (r.error) setError(r.error)
    })
  }

  const field = 'w-full px-3 py-2.5 rounded-xl text-sm border border-[color:var(--color-hairline)] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500'
  const label = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1'
  const issue = (k: string) =>
    issues[k] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{issues[k]}</p> : null

  return (
    <form action={submit} className="rounded-2xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-6 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {state === 'rejected' ? 'Fix the details and re-apply' : 'One form, once'}
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          The carriers verify every business that sends texts. Fill this in once and we handle the
          rest — registration, review, and your practice’s own number. The reviews are theirs, not
          ours, and can take a few weeks; you’ll see honest progress here.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="sms-ein">EIN (tax ID)</label>
        <input id="sms-ein" name="ein" defaultValue={details.ein ?? ''} placeholder="12-3456789" className={field} inputMode="numeric" autoComplete="off" />
        {issue('ein')}
      </div>

      <div>
        <label className={label} htmlFor="sms-entity">Business type</label>
        <select id="sms-entity" name="entityType" defaultValue={details.entityType ?? ''} className={field}>
          <option value="" disabled>Pick one…</option>
          {SMS_ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {issue('entityType')}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="sms-contact-name">Contact person</label>
          <input id="sms-contact-name" name="brandContactName" defaultValue={details.brandContactName ?? ''} placeholder="Dr. Ada Reyes" className={field} autoComplete="name" />
          {issue('brandContactName')}
        </div>
        <div>
          <label className={label} htmlFor="sms-contact-email">Their email at {clinicName}</label>
          <input id="sms-contact-email" name="brandContactEmail" type="email" defaultValue={details.brandContactEmail ?? ''} placeholder="you@yourpractice.com" className={field} autoComplete="email" />
          {issue('brandContactEmail')}
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        The carriers email this person a verification link, so it needs to be an address at your
        practice — not ours. A personal gmail works, though the carriers sometimes push back on it.
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ActionButton type="submit" disabled={pending}>
        {pending ? 'Submitting…' : state === 'rejected' ? 'Re-apply' : 'Set up texting'}
      </ActionButton>
    </form>
  )
}
