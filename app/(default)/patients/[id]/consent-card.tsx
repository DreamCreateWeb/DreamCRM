'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { runAction } from '@/lib/run-action'
import { formatClinicDate } from '@/lib/format-datetime'
import { CONSENT_SOURCES, type ConsentSource } from '@/lib/sms-consent'
import type { PatientConsentView } from '@/lib/types/patient-consent'
import { recordMarketingConsentAction } from '../actions'

const SOURCE_LABEL: Record<string, string> = {
  booking: 'website booking',
  intake: 'intake form',
  portal: 'patient portal',
  staff: 'told to staff',
  keyword: 'text reply',
  backfill: 'imported',
  manual: 'entered by staff',
}

const SOURCE_OPTION_LABEL: Record<ConsentSource, string> = {
  booking: 'Website booking',
  intake: 'Intake form',
  portal: 'Patient portal',
  staff: 'They told us (staff)',
  keyword: 'Text reply',
}

function sourceWords(source: string | null): string {
  if (!source) return ''
  return ` (${SOURCE_LABEL[source] ?? source.replace(/_/g, ' ')})`
}

/** The one place the chart's consent state is put into words — pure, so the
 *  test can pin the exact sentences. Texts say what is ON FILE; they never
 *  promise a send. */
export function consentLines(c: PatientConsentView, timeZone: string) {
  const day = (iso: string | null) => (iso ? formatClinicDate(new Date(iso), timeZone) : null)
  // The source column is one value, stamped by the latest opt-in; show it on
  // the row it belongs to.
  const emailAt = c.emailOnAtIso ? Date.parse(c.emailOnAtIso) : -1
  const smsAt = c.smsOnAtIso ? Date.parse(c.smsOnAtIso) : -1
  const emailSource = c.emailOn && emailAt >= smsAt ? sourceWords(c.source) : ''
  const smsSource = c.smsOn && smsAt > emailAt ? sourceWords(c.source) : ''

  let email: string
  if (c.emailOn) {
    const d = day(c.emailOnAtIso)
    email = d ? `On since ${d}${emailSource}` : 'On'
  } else {
    const d = day(c.emailOffAtIso)
    email = d ? `Off since ${d}` : 'Off'
  }

  let texts: string
  if (c.smsOn) {
    const d = day(c.smsOnAtIso)
    texts = d ? `Text consent on file since ${d}${smsSource}` : 'Text consent on file'
  } else if (c.smsOffAtIso) {
    texts = `Opted out of texts since ${day(c.smsOffAtIso)}`
  } else {
    texts = 'No text consent on file'
  }
  return { email, texts }
}

/**
 * The patient record's Consent card: what the chart says about marketing email
 * and texts, and ONE action — "Record a change" — for a staff member writing
 * down what the patient told them. Writes go through the consent spine
 * (recordMarketingConsentAction -> lib/services/sms-consent.ts).
 */
export default function ConsentCard({
  patientId,
  consent,
  timeZone,
}: {
  patientId: string
  consent: PatientConsentView
  timeZone: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [on, setOn] = useState(false)
  const [source, setSource] = useState<ConsentSource>('staff')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lines = consentLines(consent, timeZone)

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const res = await runAction(() => recordMarketingConsentAction(patientId, { channel, on, source, note }))
      if (res.ok) {
        setOpen(false)
        setNote('')
        router.refresh()
      } else {
        setError(res.error)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v2-card px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Consent</p>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-400">Email marketing</dt>
          <dd className="text-gray-800 dark:text-gray-100">{lines.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-400">Texts</dt>
          <dd className="text-gray-800 dark:text-gray-100">{lines.texts}</dd>
        </div>
      </dl>

      {!open && (
        <ActionButton variant="ghost" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Record a change
        </ActionButton>
      )}

      {open && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="block text-xs text-gray-600 dark:text-gray-300">
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'email' | 'sms')}
              className="form-select mt-1 w-full text-sm"
            >
              <option value="email">Email marketing</option>
              <option value="sms">Texts</option>
            </select>
          </label>
          <label className="block text-xs text-gray-600 dark:text-gray-300">
            They now say
            <select value={on ? 'on' : 'off'} onChange={(e) => setOn(e.target.value === 'on')} className="form-select mt-1 w-full text-sm">
              <option value="off">No, stop these</option>
              <option value="on">Yes, they agreed</option>
            </select>
          </label>
          <label className="block text-xs text-gray-600 dark:text-gray-300">
            Where it came from
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as ConsentSource)}
              className="form-select mt-1 w-full text-sm"
            >
              {CONSENT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_OPTION_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-gray-600 dark:text-gray-300">
            Note (optional)
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className="form-input mt-1 w-full text-sm"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <ActionButton type="submit" variant="primary" size="sm" pending={busy}>
              Save
            </ActionButton>
            <ActionButton type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </ActionButton>
          </div>
        </form>
      )}
    </div>
  )
}
