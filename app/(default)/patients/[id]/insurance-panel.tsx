'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { useToast } from '@/components/ui/toast'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  INSURANCE_DRIVER_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  checkAgeLabel,
  describeBenefitAmount,
  isPracticeDriver,
  isStaleCheck,
  type EligibilityRequest,
  type InsuranceCheckView,
} from '@/lib/insurance-eligibility'
import { checkInsuranceAction } from '../../insurance/actions'

export interface InsurancePanelData {
  /** The most recent stored check for this patient, or null if never checked. */
  latest: InsuranceCheckView | null
  /** Whether the on-file columns hold a carrier (the check needs one). */
  hasOnFile: boolean
  /** A self-subscriber request built from the on-file columns. */
  onFileRequest: Partial<EligibilityRequest>
}

/**
 * The patient record's insurance-check rail card: the latest verdict with its
 * honesty pill, a one-tap re-check, and the door to the full tool. Reads the
 * `latest` row only — the on-file card details stay in the IdentityCard above.
 */
export default function InsurancePanel({
  patientId,
  data,
  timeZone,
}: {
  patientId: string
  data: InsurancePanelData
  timeZone: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const latest = data.latest
  const label = latest ? INSURANCE_DRIVER_LABEL[latest.driver] : null
  const practice = latest ? isPracticeDriver(latest.driver) : false
  const stale = !!latest && latest.status !== 'error' && isStaleCheck(latest.checkedAtIso)
  // The one copy helper words the amount — the rail never does its own arithmetic.
  const maxCopy = latest?.result?.status === 'active' ? describeBenefitAmount(latest.result.annualMax, 'max') : null
  const toolHref = `/insurance?patient=${patientId}`

  function checkNow() {
    setError(null)
    startTransition(async () => {
      // A stored check knows the subscriber; the on-file columns only know the card.
      const r = await checkInsuranceAction(latest?.input ?? data.onFileRequest, patientId)
      if (!r.ok) {
        setError(r.errors._form ?? 'Some details are missing — open the full form to fill them in.')
        return
      }
      toast(`Checked — ${STATUS_LABEL[r.check.status].toLowerCase()}.`)
      router.refresh()
    })
  }

  return (
    <div className="v2-card px-4 py-4" data-testid="insurance-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Insurance check</p>
        {latest ? (
          <StatusPill tone={STATUS_TONE[latest.status]} label={STATUS_LABEL[latest.status]} />
        ) : (
          <StatusPill tone="neutral" label="Never checked" />
        )}
      </div>

      {latest && (
        <div className="mt-2 space-y-1">
          {practice && label && <StatusPill tone="neutral" label={label.pill} title={label.title} />}
          <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums" suppressHydrationWarning>
            Checked {checkAgeLabel(latest.checkedAtIso)}
            {latest.requestedByName ? ` by ${latest.requestedByName}` : ''}
            <span className="sr-only">, {formatClinicDayTime(new Date(latest.checkedAtIso), timeZone)}</span>
          </p>
          {stale && (
            <p className={`text-xs ${TONE_TEXT.warn}`}>Over a month old — worth a re-check before their visit.</p>
          )}
          {latest.result?.planName && (
            <p className="text-sm text-gray-700 dark:text-gray-200">{latest.result.planName}</p>
          )}
          {maxCopy && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-mono-num tabular-nums">{maxCopy.headline}</span>
              {maxCopy.caveat ? '' : ' this year'}
              <span className={`block ${maxCopy.caveat ? TONE_TEXT.warn : 'text-gray-500 dark:text-gray-400'}`}>{maxCopy.sub}</span>
            </p>
          )}
          {latest.status === 'error' && (
            <p className="text-xs text-gray-600 dark:text-gray-300">The last check couldn’t reach the payer.</p>
          )}
        </div>
      )}

      {!latest && !data.hasOnFile && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Add their carrier and member ID first, or check them from the full form.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {(latest || data.hasOnFile) && (
          <ActionButton variant="secondary" size="sm" pending={pending} onClick={checkNow}>
            {latest ? 'Check again' : 'Check now'}
          </ActionButton>
        )}
        <Link href={toolHref} className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
          Open in Insurance →
        </Link>
      </div>
    </div>
  )
}
