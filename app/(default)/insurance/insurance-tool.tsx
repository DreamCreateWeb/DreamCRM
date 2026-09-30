'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldError } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { formatClinicDayTime } from '@/lib/format-datetime'
import {
  INSURANCE_DRIVER_LABEL,
  INSURANCE_RELATIONSHIPS,
  SANDBOX_STEERING,
  STATUS_LABEL,
  STATUS_TONE,
  benefitDollars,
  isPracticeDriver,
  validateEligibilityRequest,
  type EligibilityRequest,
  type InsuranceCheckView,
  type InsuranceDriverId,
  type InsuranceRelationship,
} from '@/lib/insurance-eligibility'
import { checkInsuranceAction, createPatientFromCheckAction, saveInsuranceToPatientAction } from './actions'

/**
 * The Insurance tool — form on the left, the answer on the right, the org's
 * recent checks below. Every result carries the driver's honesty pill
 * (`INSURANCE_DRIVER_LABEL`): a sandbox answer is a PRACTICE answer, and the
 * page says so on the header too, not only when a result is showing.
 */

interface FormState {
  firstName: string
  lastName: string
  dateOfBirth: string
  carrierName: string
  memberId: string
  groupNumber: string
  relationship: InsuranceRelationship
  subFirstName: string
  subLastName: string
  subDateOfBirth: string
}

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  carrierName: '',
  memberId: '',
  groupNumber: '',
  relationship: 'self',
  subFirstName: '',
  subLastName: '',
  subDateOfBirth: '',
}

function formFromRequest(r: Partial<EligibilityRequest> | null | undefined): FormState {
  if (!r) return EMPTY_FORM
  return {
    firstName: r.patient?.firstName ?? '',
    lastName: r.patient?.lastName ?? '',
    dateOfBirth: r.patient?.dateOfBirth ?? '',
    carrierName: r.carrierName ?? '',
    memberId: r.memberId ?? '',
    groupNumber: r.groupNumber ?? '',
    relationship: r.relationship ?? 'self',
    subFirstName: r.subscriber?.firstName ?? '',
    subLastName: r.subscriber?.lastName ?? '',
    subDateOfBirth: r.subscriber?.dateOfBirth ?? '',
  }
}

function requestFromForm(f: FormState): unknown {
  return {
    patient: { firstName: f.firstName, lastName: f.lastName, dateOfBirth: f.dateOfBirth },
    carrierName: f.carrierName,
    memberId: f.memberId,
    groupNumber: f.groupNumber || null,
    relationship: f.relationship,
    subscriber:
      f.relationship === 'self'
        ? null
        : { firstName: f.subFirstName, lastName: f.subLastName, dateOfBirth: f.subDateOfBirth },
  }
}

export interface InsuranceToolProps {
  orgName: string
  recent: InsuranceCheckView[]
  carriers: string[]
  patientOptions: Array<{ id: string; name: string }>
  timeZone: string
  prefill: { patientId: string; patientName: string; request: Partial<EligibilityRequest> } | null
  initialCheck: InsuranceCheckView | null
  driver: InsuranceDriverId
}

export default function InsuranceTool({
  orgName,
  recent: initialRecent,
  carriers,
  patientOptions,
  timeZone,
  prefill,
  initialCheck,
  driver,
}: InsuranceToolProps) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => formFromRequest(prefill?.request))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState<InsuranceCheckView | null>(initialCheck)
  const [recent, setRecent] = useState<InsuranceCheckView[]>(initialRecent)
  const [pending, startTransition] = useTransition()
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState<'check' | 'save' | 'add' | 'anyway' | null>(null)
  const practice = isPracticeDriver(driver)
  const label = INSURANCE_DRIVER_LABEL[driver]

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function runCheck() {
    const raw = requestFromForm(form)
    const v = validateEligibilityRequest(raw)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }
    setErrors({})
    setDuplicate(null)
    setBusy('check')
    startTransition(async () => {
      const r = await checkInsuranceAction(raw, prefill?.patientId ?? null)
      setBusy(null)
      if (!r.ok) {
        setErrors(r.errors)
        return
      }
      setCurrent(r.check)
      setRecent((list) => [r.check, ...list.filter((c) => c.id !== r.check.id)].slice(0, 20))
    })
  }

  function saveToPatient() {
    if (!prefill) return
    setBusy('save')
    startTransition(async () => {
      const r = await saveInsuranceToPatientAction(prefill.patientId, {
        carrierName: form.carrierName,
        memberId: form.memberId,
        groupNumber: form.groupNumber || null,
      })
      setBusy(null)
      if (r.ok) toast(`Saved to ${prefill.patientName}’s record.`)
      else toast(r.error, { tone: 'urgent' })
    })
  }

  function addAsPatient(forceNew: boolean) {
    if (!current) return
    setBusy(forceNew ? 'anyway' : 'add')
    startTransition(async () => {
      const r = await createPatientFromCheckAction({ checkId: current.id, request: current.input, forceNew })
      setBusy(null)
      if ('duplicateOf' in r && r.duplicateOf) {
        setDuplicate(r.duplicateOf)
        return
      }
      if (!r.ok) {
        toast('error' in r ? r.error : 'Could not add the patient.', { tone: 'urgent' })
        return
      }
      setDuplicate(null)
      toast('Added to Patients.')
      router.push(`/patients/${r.id}`)
    })
  }

  function loadRecent(c: InsuranceCheckView) {
    setCurrent(c)
    setForm(formFromRequest(c.input))
    setErrors({})
    setDuplicate(null)
  }

  const subscriberNeeded = form.relationship !== 'self'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Insurance"
        subtitle="Look up a patient’s benefits before they sit down. We always confirm with the carrier before quoting."
        actions={practice ? <StatusPill tone="neutral" label={label.pill} title={label.title} /> : undefined}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── The card, typed in ──────────────────────────────────────── */}
        <section className="lg:col-span-5">
          <form
            className="v2-card px-4 py-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              runCheck()
            }}
            noValidate
          >
            <div>
              <label htmlFor="ins-patient-pick" className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                Who
              </label>
              <select
                id="ins-patient-pick"
                className="form-select w-full mt-1 text-sm"
                value={prefill?.patientId ?? ''}
                onChange={(e) => router.push(e.target.value ? `/insurance?patient=${e.target.value}` : '/insurance')}
              >
                <option value="">Someone new — type their details</option>
                {patientOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {prefill && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Checking for{' '}
                  <Link href={`/patients/${prefill.patientId}`} className="font-medium text-teal-700 dark:text-teal-400 hover:underline">
                    {prefill.patientName}
                  </Link>
                  . Edits here don’t change their record until you save them.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field id="ins-first" label="First name" error={errors['patient.firstName']}>
                <input id="ins-first" className="form-input w-full text-sm" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="off" />
              </Field>
              <Field id="ins-last" label="Last name" error={errors['patient.lastName']}>
                <input id="ins-last" className="form-input w-full text-sm" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="off" />
              </Field>
            </div>
            <Field id="ins-dob" label="Date of birth" error={errors['patient.dateOfBirth']}>
              <input id="ins-dob" type="date" className="form-input w-full text-sm" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
            </Field>

            <Field id="ins-carrier" label="Carrier" error={errors.carrierName}>
              <input id="ins-carrier" list="ins-carrier-list" className="form-input w-full text-sm" value={form.carrierName} onChange={(e) => set('carrierName', e.target.value)} placeholder="Delta Dental" autoComplete="off" />
              <datalist id="ins-carrier-list">
                {carriers.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="ins-member" label="Member ID" error={errors.memberId}>
                <input id="ins-member" className="form-input w-full text-sm font-mono-num" value={form.memberId} onChange={(e) => set('memberId', e.target.value)} autoComplete="off" />
              </Field>
              <Field id="ins-group" label="Group # (optional)">
                <input id="ins-group" className="form-input w-full text-sm font-mono-num" value={form.groupNumber} onChange={(e) => set('groupNumber', e.target.value)} autoComplete="off" />
              </Field>
            </div>

            <fieldset>
              <legend className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                Whose name is the policy in?
              </legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {INSURANCE_RELATIONSHIPS.map((r) => (
                  <label key={r.id} className="inline-flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="radio"
                      name="relationship"
                      className="form-radio"
                      checked={form.relationship === r.id}
                      onChange={() => set('relationship', r.id)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {subscriberNeeded && (
              <div className="rounded-[var(--r-md)] border border-[color:var(--color-hairline)] px-3 py-3 space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">The policyholder</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="ins-sub-first" label="First name" error={errors['subscriber.firstName']}>
                    <input id="ins-sub-first" className="form-input w-full text-sm" value={form.subFirstName} onChange={(e) => set('subFirstName', e.target.value)} autoComplete="off" />
                  </Field>
                  <Field id="ins-sub-last" label="Last name" error={errors['subscriber.lastName']}>
                    <input id="ins-sub-last" className="form-input w-full text-sm" value={form.subLastName} onChange={(e) => set('subLastName', e.target.value)} autoComplete="off" />
                  </Field>
                </div>
                <Field id="ins-sub-dob" label="Date of birth" error={errors['subscriber.dateOfBirth']}>
                  <input id="ins-sub-dob" type="date" className="form-input w-full text-sm" value={form.subDateOfBirth} onChange={(e) => set('subDateOfBirth', e.target.value)} />
                </Field>
              </div>
            )}

            <FieldError id="ins-form-error" message={errors._form} />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <ActionButton type="submit" variant="primary" pending={pending && busy === 'check'} breath>
                Check benefits
              </ActionButton>
              {prefill && (
                <ActionButton type="button" variant="secondary" pending={pending && busy === 'save'} onClick={saveToPatient}>
                  Save to their record
                </ActionButton>
              )}
            </div>

            {practice && (
              <details className="text-xs text-gray-600 dark:text-gray-300">
                <summary className="cursor-pointer font-medium">Practice-mode tips</summary>
                <p className="mt-1">
                  Answers come from the built-in sandbox. End a member ID with one of these to see each state:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {SANDBOX_STEERING.map((s) => (
                    <li key={s.suffix}>
                      <span className="font-mono-num">…{s.suffix}</span> — {s.outcome}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </form>
        </section>

        {/* ── The answer ─────────────────────────────────────────────── */}
        <section className="lg:col-span-7">
          {current ? (
            <ResultCard check={current} timeZone={timeZone}>
              {!current.patientId && current.status !== 'error' && (
                <div className="mt-4 border-t border-[color:var(--color-hairline)] pt-3 space-y-2">
                  {duplicate ? (
                    <div className="v2-well px-3 py-3 text-sm">
                      <p className="text-gray-800 dark:text-gray-100">
                        Looks like <strong>{duplicate.name}</strong> is already here.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ActionButton variant="secondary" size="sm" href={`/patients/${duplicate.id}`}>
                          Open their record
                        </ActionButton>
                        <ActionButton variant="ghost" size="sm" pending={pending && busy === 'anyway'} onClick={() => addAsPatient(true)}>
                          Add anyway
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    <ActionButton variant="secondary" size="sm" pending={pending && busy === 'add'} onClick={() => addAsPatient(false)}>
                      Add {current.input.patient.firstName} as a patient
                    </ActionButton>
                  )}
                </div>
              )}
              {current.status === 'error' && (
                <div className="mt-4">
                  <ActionButton variant="secondary" size="sm" pending={pending && busy === 'check'} onClick={runCheck}>
                    Try again
                  </ActionButton>
                </div>
              )}
            </ResultCard>
          ) : (
            <EmptyState
              icon="🛡️"
              title="Nothing checked yet"
              body="Type what’s on the card and we’ll pull up their benefits: what’s covered, what’s left this year, what’s still waiting."
            />
          )}
        </section>
      </div>

      {/* ── Recent checks ────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Recent checks</h2>
        <div className="v2-card">
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
              No checks yet. The first one lands here.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              {recent.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => loadRecent(c)}
                    className={`w-full text-left px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-gray-50 dark:hover:bg-gray-900/30 ${
                      current?.id === c.id ? 'bg-teal-50/60 dark:bg-teal-900/10' : ''
                    }`}
                    aria-current={current?.id === c.id ? 'true' : undefined}
                  >
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 min-w-0 truncate">
                      {c.patientName ?? `${c.input.patient.firstName} ${c.input.patient.lastName}`}
                      {!c.patientId && <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">(not a patient yet)</span>}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 min-w-0 truncate">{c.input.carrierName}</span>
                    <span className="ml-auto flex items-center gap-2">
                      <StatusPill tone={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status]} />
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums" suppressHydrationWarning>
                        {formatClinicDayTime(new Date(c.checkedAtIso), timeZone)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="v2-well px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">{label}</p>
      <p className="text-xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  )
}

const WAITING_LABEL: Record<'basic' | 'major' | 'ortho', string> = {
  basic: 'Basic (fillings, extractions)',
  major: 'Major (crowns, bridges)',
  ortho: 'Orthodontics',
}

/** One check, rendered. Exported so the patient-detail panel can reuse it. */
export function ResultCard({
  check,
  timeZone,
  children,
}: {
  check: InsuranceCheckView
  timeZone: string
  children?: ReactNode
}) {
  const r = check.result
  // The stored row's driver wins — it says what answered THIS check, even if
  // the env has since moved on; `driver` only matters for the page chrome.
  const practice = isPracticeDriver(check.driver)
  const label = INSURANCE_DRIVER_LABEL[check.driver]
  const who = `${check.input.patient.firstName} ${check.input.patient.lastName}`.trim()
  return (
    <div className="v2-card px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[check.status]} label={STATUS_LABEL[check.status]} />
        {practice && <StatusPill tone="neutral" label={label.pill} title={label.title} />}
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto tabular-nums" suppressHydrationWarning>
          Checked {formatClinicDayTime(new Date(check.checkedAtIso), timeZone)}
        </span>
      </div>
      <h2 className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">
        {who}
        <span className="font-normal text-gray-500 dark:text-gray-400"> · {r?.payerName ?? check.input.carrierName}</span>
      </h2>
      {r?.planName && <p className="text-sm text-gray-700 dark:text-gray-200">{r.planName}</p>}
      {r?.coverage.effective && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Coverage {r.coverage.termination ? `${r.coverage.effective} → ${r.coverage.termination}` : `since ${r.coverage.effective}`}
        </p>
      )}
      {practice && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{label.title}</p>
      )}

      {check.status === 'error' && (
        <p className="mt-3 text-sm text-gray-800 dark:text-gray-100">
          We couldn’t reach the payer{check.error ? ` — ${check.error}` : ''}. Nothing about their coverage changed; try again in a moment.
        </p>
      )}

      {r && r.status === 'active' && (
        <>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {r.annualMax && (
              <Stat
                label="Left this year"
                value={benefitDollars(r.annualMax.remainingCents)}
                sub={`of ${benefitDollars(r.annualMax.totalCents)} · ${benefitDollars(r.annualMax.usedCents)} used`}
              />
            )}
            {r.deductible && (
              <Stat
                label="Deductible left"
                value={benefitDollars(r.deductible.remainingCents)}
                sub={r.deductible.remainingCents === 0 ? 'Met for the year' : `of ${benefitDollars(r.deductible.individualCents)}`}
              />
            )}
            {r.coveragePct && <Stat label="Preventive" value={`${r.coveragePct.preventive}%`} sub="Exams, cleanings, X-rays" />}
          </div>

          {r.coveragePct && (
            <table className="mt-4 w-full text-sm">
              <caption className="sr-only">Coverage by category</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th scope="col" className="py-1 font-semibold">Category</th>
                  <th scope="col" className="py-1 font-semibold text-right">Plan pays</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-hairline)]">
                <tr><td className="py-1.5 text-gray-700 dark:text-gray-200">Preventive</td><td className="py-1.5 text-right tabular-nums">{r.coveragePct.preventive}%</td></tr>
                <tr><td className="py-1.5 text-gray-700 dark:text-gray-200">Basic — fillings, extractions</td><td className="py-1.5 text-right tabular-nums">{r.coveragePct.basic}%</td></tr>
                <tr><td className="py-1.5 text-gray-700 dark:text-gray-200">Major — crowns, bridges</td><td className="py-1.5 text-right tabular-nums">{r.coveragePct.major}%</td></tr>
                <tr>
                  <td className="py-1.5 text-gray-700 dark:text-gray-200">Orthodontics</td>
                  <td className="py-1.5 text-right tabular-nums">{r.coveragePct.ortho == null ? <span className="text-gray-500">Not covered</span> : `${r.coveragePct.ortho}%`}</td>
                </tr>
              </tbody>
            </table>
          )}

          {r.waitingPeriods.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Still waiting</p>
              <ul className="mt-1 space-y-0.5 text-sm text-gray-700 dark:text-gray-200">
                {r.waitingPeriods.map((w) => (
                  <li key={w.category}>
                    {WAITING_LABEL[w.category]} — covered from {w.endsOn}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.frequencies.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Frequencies</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {r.frequencies.map((f) => (
                  <li key={f.code} className="flex justify-between gap-3 text-gray-700 dark:text-gray-200">
                    <span>{f.label} · {f.limit}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{f.lastOn ? `last ${f.lastOn}` : 'none on record'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {r && r.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-gray-700 dark:text-gray-200">
          {r.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      {children}
    </div>
  )
}
