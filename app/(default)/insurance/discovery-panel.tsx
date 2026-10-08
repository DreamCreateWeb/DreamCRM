'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FieldError } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { isBilledDriver, type InsuranceDriverId, type InsuranceUsage } from '@/lib/insurance-eligibility'
import {
  DISCOVERY_COPY,
  validateDiscoveryInput,
  type DiscoveryCandidate,
  type DiscoveryInput,
  type InsuranceDiscoveryView,
} from '@/lib/insurance-discovery'
import { discoverCoverageAction, resumeDiscoveryAction } from './actions'

/**
 * INSURANCE DISCOVERY (2026-10-08) — the no-card panel inside the check
 * form's "Their card" step. Name + date of birth (shared with the form),
 * state + ZIP (from the record when it has them), an optional Social
 * Security number that is sent for the search and never kept, one
 * confirm that says what it costs BEFORE the transition (the dialog
 * law), and then the candidate CARDS the payers answered with. Picking
 * one fills the check form; nothing here reads benefits.
 */

export interface DiscoverySeed {
  firstName: string
  lastName: string
  dateOfBirth: string
  state: string | null
  postalCode: string | null
}

interface PanelForm {
  firstName: string
  lastName: string
  dateOfBirth: string
  state: string
  postalCode: string
  ssn: string
}

function formFromSeed(seed: DiscoverySeed): PanelForm {
  return {
    firstName: seed.firstName,
    lastName: seed.lastName,
    dateOfBirth: seed.dateOfBirth,
    state: seed.state ?? '',
    postalCode: seed.postalCode ?? '',
    ssn: '',
  }
}

function dateWords(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10))
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_TONE: Record<DiscoveryCandidate['status'], 'ok' | 'warn' | 'neutral'> = {
  active: 'ok',
  inactive: 'warn',
  unknown: 'neutral',
}

export function DiscoveryPanel({
  driver,
  usage,
  patientId,
  seed,
  initial,
  disabled = false,
  onUse,
  onClose,
}: {
  driver: InsuranceDriverId
  /** This feature's OWN allowance under the live driver; null when searches are free. */
  usage: InsuranceUsage | null
  patientId: string | null
  seed: DiscoverySeed
  /** The latest stored search for this patient — a pending one resumes from here. */
  initial: InsuranceDiscoveryView | null
  /** The live driver with no practice NPI: a search would only be refused. */
  disabled?: boolean
  onUse: (candidate: DiscoveryCandidate, input: DiscoveryInput) => void
  onClose: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState<PanelForm>(() => formFromSeed(seed))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<InsuranceDiscoveryView | null>(initial)
  const [, startTransition] = useTransition()
  // Which control is busy: Find coverage and Check for results can both be
  // on screen (a pending search above a fresh ask), so one flag won't do.
  const [busy, setBusy] = useState<'find' | 'resume' | null>(null)
  const billed = isBilledDriver(driver)
  const liveOnly = driver === 'stedi_test'

  // The form's name + date of birth lead; what the desk types there is who
  // the search is about, so the panel follows edits made after it opened.
  useEffect(() => {
    setForm((f) => ({ ...f, firstName: seed.firstName, lastName: seed.lastName, dateOfBirth: seed.dateOfBirth }))
  }, [seed.firstName, seed.lastName, seed.dateOfBirth])

  function set<K extends keyof PanelForm>(key: K, value: PanelForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function find() {
    const v = validateDiscoveryInput(form)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }
    setErrors({})
    if (
      !(await confirm({
        title: DISCOVERY_COPY.confirmTitle,
        message: DISCOVERY_COPY.confirmBody(usage, billed),
        confirmLabel: DISCOVERY_COPY.confirmLabel,
      }))
    )
      return
    setBusy('find')
    startTransition(async () => {
      const r = await discoverCoverageAction(form, patientId)
      setBusy(null)
      // The SSN lived for one request: clear the box whatever came back.
      setForm((f) => ({ ...f, ssn: '' }))
      if (!r.ok) {
        setErrors(r.errors)
        toast(r.errors._form ?? 'The search failed.', { tone: 'urgent' })
        return
      }
      setResult(r.discovery)
    })
  }

  function resume() {
    if (!result) return
    setBusy('resume')
    startTransition(async () => {
      const r = await resumeDiscoveryAction(result.id)
      setBusy(null)
      if (!r.ok) {
        toast(r.errors._form ?? 'Could not check on the search.', { tone: 'urgent' })
        return
      }
      setResult(r.discovery)
      if (r.discovery.status === 'pending') toast('Still searching — the payers haven’t all answered yet.')
    })
  }

  return (
    <div className="v2-well px-4 py-4 space-y-4" data-testid="discovery-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{DISCOVERY_COPY.title}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{DISCOVERY_COPY.lede}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 shrink-0">
          {DISCOVERY_COPY.close}
        </button>
      </div>

      {liveOnly ? (
        <p className={`text-xs ${TONE_TEXT.warn}`} data-testid="discovery-live-only">
          {DISCOVERY_COPY.liveOnly}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <PanelField id="disc-state" label={DISCOVERY_COPY.stateLabel} error={errors.state}>
              <input id="disc-state" className="form-input w-full text-sm uppercase" value={form.state} maxLength={2} onChange={(e) => set('state', e.target.value.toUpperCase())} placeholder="AR" autoComplete="off" />
            </PanelField>
            <PanelField id="disc-zip" label={DISCOVERY_COPY.zipLabel} error={errors.postalCode}>
              <input id="disc-zip" className="form-input w-full text-sm font-mono-num" value={form.postalCode} inputMode="numeric" onChange={(e) => set('postalCode', e.target.value)} placeholder="72554" autoComplete="off" />
            </PanelField>
          </div>
          <PanelField id="disc-ssn" label={DISCOVERY_COPY.ssnLabel} error={errors.ssn} hint={DISCOVERY_COPY.ssnHint}>
            <input id="disc-ssn" className="form-input w-full text-sm font-mono-num" value={form.ssn} inputMode="numeric" onChange={(e) => set('ssn', e.target.value)} autoComplete="off" placeholder="123-45-6789" />
          </PanelField>
          {errors._form && <p className={`text-xs ${TONE_TEXT.urgent}`}>{errors._form}</p>}
          {(errors.firstName || errors.lastName || errors.dateOfBirth) && (
            <p className={`text-xs ${TONE_TEXT.urgent}`}>Fill in their name and date of birth above first.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton type="button" variant="primary" size="sm" pending={busy === 'find'} disabled={disabled} onClick={find}>
              {DISCOVERY_COPY.find}
            </ActionButton>
            {usage && !usage.unreadable && (
              <span className={`text-xs font-mono-num tabular-nums ${usage.used >= usage.included ? TONE_TEXT.warn : 'text-gray-500 dark:text-gray-400'}`} data-testid="discovery-usage">
                {DISCOVERY_COPY.usageLine(usage)}
              </span>
            )}
            {!billed && <StatusPill tone="neutral" label="Practice answer" title={DISCOVERY_COPY.practice} />}
          </div>
        </>
      )}

      {result && !liveOnly && (
        <div className="space-y-3 border-t border-[color:var(--color-hairline)] pt-4" data-testid="discovery-result" aria-live="polite">
          {result.status === 'pending' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">{DISCOVERY_COPY.pending}</p>
              <ActionButton type="button" variant="secondary" size="sm" pending={busy === 'resume'} onClick={resume}>
                {DISCOVERY_COPY.checkAgain}
              </ActionButton>
            </div>
          )}
          {result.status === 'error' && <p className={`text-sm ${TONE_TEXT.urgent}`}>{result.error ?? 'The payers could not be searched.'}</p>}
          {result.status === 'none' && <p className="text-sm text-gray-700 dark:text-gray-200">{DISCOVERY_COPY.none}</p>}
          {result.status === 'found' && (
            <>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {result.coveragesFound} possible {result.coveragesFound === 1 ? 'plan' : 'plans'}
                {result.driver === 'sandbox' ? <span className="font-normal text-gray-500 dark:text-gray-400"> · practice answer</span> : null}
              </p>
              <p className={`text-xs ${TONE_TEXT.warn}`}>{DISCOVERY_COPY.honesty}</p>
              <ul className="space-y-2" data-testid="discovery-candidates">
                {result.candidates.map((c, i) => (
                  <li key={`${c.payerId}-${c.memberId}-${i}`} className="v2-card px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{c.payerName}</p>
                        {c.planName && <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{c.planName}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusPill tone={STATUS_TONE[c.status]} label={DISCOVERY_COPY.statusWord(c.status)} />
                        <StatusPill tone={c.dental ? 'ok' : 'neutral'} label={c.dental ? 'Dental' : 'No dental seen'} />
                      </div>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">Member ID</dt>
                        <dd className="font-mono-num tabular-nums text-gray-800 dark:text-gray-100">{c.memberId}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">Group</dt>
                        <dd className="font-mono-num tabular-nums text-gray-800 dark:text-gray-100">{c.groupNumber ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">Matched</dt>
                        <dd className="text-gray-800 dark:text-gray-100">
                          {c.matchedName || '—'}
                          {c.matchedDateOfBirth && <span className="font-mono-num tabular-nums"> · {dateWords(c.matchedDateOfBirth)}</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 dark:text-gray-400">Dates</dt>
                        <dd className="font-mono-num tabular-nums text-gray-800 dark:text-gray-100">
                          {c.planBegin || c.planEnd ? `${dateWords(c.planBegin) ?? '…'} – ${dateWords(c.planEnd) ?? 'open'}` : '—'}
                        </dd>
                      </div>
                    </dl>
                    {c.relationship === 'dependent' && c.subscriber && (
                      <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
                        Policy in {c.subscriber.firstName} {c.subscriber.lastName}’s name
                        {c.subscriber.dateOfBirth ? <span className="font-mono-num tabular-nums"> · {dateWords(c.subscriber.dateOfBirth)}</span> : null}
                      </p>
                    )}
                    <div className="mt-2.5">
                      <ActionButton type="button" variant="secondary" size="sm" onClick={() => onUse(c, result.input)}>
                        {DISCOVERY_COPY.use}
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.requestedByName && result.status !== 'pending' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Searched by {result.requestedByName}</p>
          )}
        </div>
      )}
    </div>
  )
}

function PanelField({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}
