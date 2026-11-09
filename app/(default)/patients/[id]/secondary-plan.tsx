'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { useToast } from '@/components/ui/toast'
import { runAction } from '@/lib/run-action'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { STATUS_LABEL, STATUS_TONE, checkAgeLabel, type EligibilityRequest, type InsuranceCheckView } from '@/lib/insurance-eligibility'
import { checkInsuranceAction, saveSecondaryInsuranceAction } from '../../insurance/actions'

/** The record's SECOND plan (ML-50): its own card, its own last check, its own Check button. */
export interface SecondaryPlanData {
  /** null = no second plan on the record yet (the "Add a secondary plan" door). */
  card: { provider: string | null; policyNumber: string | null; groupNumber: string | null } | null
  /** The latest check OF THIS RANK. */
  latest: InsuranceCheckView | null
  /** What a re-check of THIS plan sends (the tool's own `recheckRequest` rule). */
  onFileRequest: Partial<EligibilityRequest> | null
  cardChanged?: boolean
  /** A clearinghouse driver needs the exact payer, and a carrier NAME is not one — send them to the picker. */
  needsPayerPick?: boolean
  needsNpi?: boolean
}

export default function SecondaryPlan({ patientId, data }: { patientId: string; data: SecondaryPlanData }) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<'save' | 'remove' | 'check' | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [carrier, setCarrier] = useState(data.card?.provider ?? '')
  const [member, setMember] = useState(data.card?.policyNumber ?? '')
  const [group, setGroup] = useState(data.card?.groupNumber ?? '')
  const latest = data.latest
  const toolHref = `/insurance?patient=${patientId}&plan=secondary`

  function save(clear = false) {
    setError(null)
    setBusy(clear ? 'remove' : 'save')
    startTransition(async () => {
      const r = await runAction(() =>
        saveSecondaryInsuranceAction(patientId, clear ? { carrierName: '', memberId: '', groupNumber: null } : { carrierName: carrier, memberId: member, groupNumber: group || null }),
      )
      setBusy(null)
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (clear) {
        setCarrier('')
        setMember('')
        setGroup('')
      }
      setEditing(false)
      toast(clear ? 'Second plan removed.' : 'Second plan saved.')
      router.refresh()
    })
  }

  function checkNow() {
    if (!data.onFileRequest) return
    setError(null)
    setBusy('check')
    startTransition(async () => {
      const r = await runAction(() => checkInsuranceAction(data.onFileRequest, patientId, 'secondary'))
      setBusy(null)
      if (!r.ok) {
        setError(('errors' in r ? r.errors._form : null) ?? ('error' in r ? r.error : null) ?? 'Some details are missing — open the full form to fill them in.')
        return
      }
      toast(`Checked — ${STATUS_LABEL[r.check.status].toLowerCase()}.`)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 border-t border-[color:var(--color-hairline)] pt-3" data-testid="secondary-plan">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Secondary plan</p>
        {data.card && (latest ? <StatusPill tone={STATUS_TONE[latest.status]} label={STATUS_LABEL[latest.status]} /> : <StatusPill tone="neutral" label="Never checked" />)}
      </div>

      {data.card && !editing && (
        <div className="mt-1.5 space-y-0.5">
          <p className="text-sm text-gray-800 dark:text-gray-100">{data.card.provider ?? 'Carrier not on file'}</p>
          {data.card.policyNumber && <p className="text-xs text-gray-500 dark:text-gray-400">Policy {data.card.policyNumber}</p>}
          {data.card.groupNumber && <p className="text-xs text-gray-500 dark:text-gray-400">Group {data.card.groupNumber}</p>}
          {latest && (
            <p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
              Checked {checkAgeLabel(latest.checkedAtIso)}
              {latest.requestedByName ? ` by ${latest.requestedByName}` : ''}
            </p>
          )}
          {latest && data.cardChanged && <StatusPill tone="neutral" label="Card changed since the last check" />}
        </div>
      )}

      {!data.card && !editing && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Half of families carry two plans. Add theirs and it gets its own check.</p>
      )}

      {editing && (
        <div className="mt-2 space-y-2" data-testid="secondary-plan-form">
          <label className="block text-xs text-gray-600 dark:text-gray-300">
            Carrier
            <input className="form-input mt-0.5 w-full text-sm" value={carrier} onChange={(e) => setCarrier(e.target.value)} autoComplete="off" />
          </label>
          <label className="block text-xs text-gray-600 dark:text-gray-300">
            Member ID
            <input className="form-input mt-0.5 w-full text-sm" value={member} onChange={(e) => setMember(e.target.value)} autoComplete="off" />
          </label>
          <label className="block text-xs text-gray-600 dark:text-gray-300">
            Group number
            <input className="form-input mt-0.5 w-full text-sm" value={group} onChange={(e) => setGroup(e.target.value)} autoComplete="off" />
          </label>
        </div>
      )}

      {error && <p className={`mt-2 text-xs ${TONE_TEXT.urgent}`}>{error}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {editing ? (
          <>
            <ActionButton variant="secondary" size="sm" pending={busy === 'save'} onClick={() => save(false)}>
              Save second plan
            </ActionButton>
            <button type="button" className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : data.card ? (
          <>
            {data.needsNpi ? null : data.needsPayerPick ? (
              <ActionButton variant="secondary" size="sm" href={toolHref}>
                Pick the payer in Insurance →
              </ActionButton>
            ) : (
              <ActionButton variant="secondary" size="sm" pending={busy === 'check'} onClick={checkNow}>
                {latest ? 'Check again' : 'Check now'}
              </ActionButton>
            )}
            <button type="button" className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
            <ActionButton variant="secondary" size="sm" pending={busy === 'remove'} onClick={() => save(true)}>
              Remove
            </ActionButton>
            <Link href={toolHref} className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
              Open in Insurance →
            </Link>
          </>
        ) : (
          <ActionButton variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Add a secondary plan
          </ActionButton>
        )}
      </div>
    </div>
  )
}
