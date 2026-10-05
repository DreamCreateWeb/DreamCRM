'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldError } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  INSURANCE_DRIVER_LABEL,
  INSURANCE_INTRO,
  NPI_READINESS_COPY,
  usageLine,
  INSURANCE_RELATIONSHIPS,
  SANDBOX_STEERING,
  STATUS_LABEL,
  STATUS_TONE,
  type EligibilityStatus,
  checkAgeLabel,
  deductibleAsAmount,
  describeBenefitAmount,
  hasAnyAmount,
  isPracticeDriver,
  isStaleCheck,
  niceDate,
  validateEligibilityRequest,
  type BenefitAmount,
  type EligibilityRequest,
  type InsuranceCheckView,
  type InsuranceDriverId,
  type InsuranceUsage,
  type InsuranceRelationship,
} from '@/lib/insurance-eligibility'
import { checkInsuranceAction, createPatientFromCheckAction, disableInsuranceAction, saveInsuranceToPatientAction, searchPayersAction } from './actions'
import { FactChip, HeroAmount, TierTile } from './benefit-visuals'
import { CopySummaryButton, PrintBenefitsButton, PrintableBenefits } from './benefits-sheet'
import { CardScanner } from './card-scanner'
import { FilterChip } from '@/components/ui/filter-chip'
import type { StediPayerMatch } from '@/lib/stedi-eligibility'

/**
 * The Insurance tool — the card typed in on the left, the BENEFITS CARD on
 * the right (a scoreboard, not a spreadsheet: one big number you can read
 * from across the desk, a ring that says how much of the year is gone, the
 * four tiers as tiles, the frequencies as a real table that says in colour
 * whether the next exam is covered now), the org's recent checks below.
 *
 * Every result carries the driver's honesty pill (`INSURANCE_DRIVER_LABEL`):
 * a sandbox answer is a PRACTICE answer, and the page says so on the header
 * too, not only when a result is showing. Every dollar figure is worded by
 * `describeBenefitAmount` — the card never does its own arithmetic.
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
  payerId: string
  payerName: string
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
  payerId: '',
  payerName: '',
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
    payerId: r.payerId ?? '',
    payerName: r.payerName ?? '',
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
    payerId: f.payerId || null,
    payerName: f.payerName || null,
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
  /** Live driver, no practice NPI: the form is parked behind the readiness notice. */
  needsNpi?: boolean
  /** The month's included allowance under a billed driver; null when checks are free. */
  usage?: InsuranceUsage | null
  /** Owners and admins can turn the tool off again (the intro card returns). */
  canManage?: boolean
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
  needsNpi = false,
  usage = null,
  canManage = false,
}: InsuranceToolProps) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState<FormState>(() => formFromRequest(prefill?.request))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState<InsuranceCheckView | null>(initialCheck)
  const [recent, setRecent] = useState<InsuranceCheckView[]>(initialRecent)
  const [pending, startTransition] = useTransition()
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState<'check' | 'save' | 'add' | 'anyway' | null>(null)
  const [statusFilter, setStatusFilter] = useState<EligibilityStatus | null>(null)
  const [query, setQuery] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const practice = isPracticeDriver(driver)
  const label = INSURANCE_DRIVER_LABEL[driver]

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /** The empty states' one CTA: put the cursor in the first empty box. */
  const focusFirstEmpty = useCallback(() => {
    const root = formRef.current
    if (!root) return
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input:not([type=radio])'))
    const target = inputs.find((i) => !i.value) ?? inputs[0]
    target?.focus()
  }, [])

  // A fresh page with nothing to look at starts with the cursor in the
  // first box — the tool's whole job is typing a card in.
  useEffect(() => {
    if (!prefill && !initialCheck) focusFirstEmpty()
  }, [prefill, initialCheck, focusFirstEmpty])

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
      setRecent((list) => [r.check, ...list.filter((c) => c.id !== r.check.id)].slice(0, 50))
      // The answer is the next thing to read: move focus to its heading so a
      // keyboard user lands on the verdict, not back at the top of the form.
      requestAnimationFrame(() => resultRef.current?.querySelector<HTMLElement>('[data-testid="benefits-heading"]')?.focus())
    })
  }

  function saveToPatient() {
    if (!prefill) return
    setBusy('save')
    startTransition(async () => {
      // The flat columns AND the remembered card: the exact payer, the plan
      // the last answer named, and whose name the policy is in.
      const r = await saveInsuranceToPatientAction(prefill.patientId, {
        carrierName: form.carrierName,
        memberId: form.memberId,
        groupNumber: form.groupNumber || null,
        payerId: form.payerId || null,
        payerName: form.payerName || null,
        planName: current?.input.memberId === form.memberId ? current.result?.planName ?? null : null,
        relationship: form.relationship,
        subscriber:
          form.relationship === 'self'
            ? null
            : { firstName: form.subFirstName, lastName: form.subLastName, dateOfBirth: form.subDateOfBirth },
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
      const r = await createPatientFromCheckAction({ checkId: current.id, request: current.input, planName: current.result?.planName ?? null, forceNew })
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
  const q = query.trim().toLowerCase()
  const visibleRecent = recent.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false
    if (!q) return true
    const hay = [c.patientName, c.input.patient.firstName, c.input.patient.lastName, c.input.carrierName, c.result?.payerName, c.result?.planName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Insurance"
        subtitle="Look up a patient’s benefits before they sit down. We always confirm with the carrier before quoting."
        actions={
          practice || usage ? (
            <div className="flex flex-wrap items-center gap-2">
              {usage && !usage.unreadable && (
                <span
                  className={`text-xs font-mono-num tabular-nums ${usage.used >= usage.included ? TONE_TEXT.warn : 'text-gray-500 dark:text-gray-400'}`}
                  title="Live payer checks are billed per check; this many are included every month."
                  data-testid="insurance-usage"
                >
                  {usageLine(usage)}
                </span>
              )}
              {practice && <StatusPill tone="neutral" label={label.pill} title={label.title} />}
            </div>
          ) : undefined
        }
      />

      {needsNpi && (
        <div className="v2-card px-4 sm:px-5 py-4 mb-6 flex flex-wrap items-center justify-between gap-3" role="status" data-testid="insurance-readiness">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${TONE_TEXT.warn}`}>{NPI_READINESS_COPY.title}</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{NPI_READINESS_COPY.body}</p>
          </div>
          <ActionButton variant="primary" size="sm" href={NPI_READINESS_COPY.href}>
            {NPI_READINESS_COPY.cta}
          </ActionButton>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── The card, typed in ──────────────────────────────────────── */}
        <section className="lg:col-span-5">
          <form
            ref={formRef}
            className="v2-card px-4 sm:px-5 py-5 space-y-6"
            onSubmit={(e) => {
              e.preventDefault()
              runCheck()
            }}
            noValidate
          >
            {/* Step 1 — who */}
            <div className="space-y-3">
              <div>
                <label htmlFor="ins-patient-pick" className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                  Who
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pick someone on the books, or type a new name.</p>
                <select
                  id="ins-patient-pick"
                  className="form-select w-full mt-1.5 text-sm"
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
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
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
                <input id="ins-dob" type="date" className="form-input w-full text-sm font-mono-num" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
              </Field>
            </div>

            {/* Step 2 — their card */}
            <div className="space-y-3 border-t border-[color:var(--color-hairline)] pt-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Their card</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Exactly as printed — the payer, the member ID, the group.</p>
              </div>
              {/* A photographed card fills what it can; the carrier it reads
                  is a search for the payer picker, never a payer, and nothing
                  runs a check until someone presses the button. */}
              <CardScanner
                patientId={prefill?.patientId ?? null}
                onFields={(f) =>
                  setForm((prev) => ({
                    ...prev,
                    carrierName: f.provider ?? prev.carrierName,
                    payerId: f.provider ? '' : prev.payerId,
                    payerName: f.provider ? '' : prev.payerName,
                    memberId: f.memberId ?? prev.memberId,
                    groupNumber: f.groupNumber ?? prev.groupNumber,
                  }))
                }
              />
              {driver === 'sandbox' ? (
                <Field id="ins-carrier" label="Carrier" error={errors.carrierName}>
                  <input id="ins-carrier" list="ins-carrier-list" className="form-input w-full text-sm" value={form.carrierName} onChange={(e) => set('carrierName', e.target.value)} placeholder="Delta Dental" autoComplete="off" />
                  <datalist id="ins-carrier-list">
                    {carriers.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
              ) : (
                <PayerPicker
                  value={form.payerId ? { payerId: form.payerId, name: form.payerName || form.carrierName } : null}
                  query={form.carrierName}
                  error={errors.carrierName}
                  onQuery={(q) => setForm((f) => ({ ...f, carrierName: q, payerId: '', payerName: '' }))}
                  onPick={(p) => setForm((f) => ({ ...f, carrierName: p.displayName, payerId: p.primaryPayerId, payerName: p.displayName }))}
                  onClear={() => setForm((f) => ({ ...f, payerId: '', payerName: '' }))}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field id="ins-member" label="Member ID" error={errors.memberId}>
                  <input id="ins-member" className="form-input w-full text-sm font-mono-num" value={form.memberId} onChange={(e) => set('memberId', e.target.value)} autoComplete="off" />
                </Field>
                <Field id="ins-group" label="Group # (optional)">
                  <input id="ins-group" className="form-input w-full text-sm font-mono-num" value={form.groupNumber} onChange={(e) => set('groupNumber', e.target.value)} autoComplete="off" />
                </Field>
              </div>
            </div>

            {/* Step 3 — whose name the policy is in */}
            <fieldset className="space-y-3 border-t border-[color:var(--color-hairline)] pt-5">
              <legend className="float-left w-full">
                <span className="block text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Whose name is the policy in?</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">A child or a spouse rides the policyholder’s plan.</span>
              </legend>
              <div className="clear-both flex flex-wrap gap-x-4 gap-y-1.5">
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
              {subscriberNeeded && (
                <div className="v2-well px-3 py-3 space-y-3">
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
                    <input id="ins-sub-dob" type="date" className="form-input w-full text-sm font-mono-num" value={form.subDateOfBirth} onChange={(e) => set('subDateOfBirth', e.target.value)} />
                  </Field>
                </div>
              )}
            </fieldset>

            <FieldError id="ins-form-error" message={errors._form} />

            <div className="flex flex-wrap items-center gap-2">
              <ActionButton type="submit" variant="primary" pending={pending && busy === 'check'} disabled={needsNpi} breath={!needsNpi}>
                Check benefits
              </ActionButton>
              {prefill && (
                <ActionButton type="button" variant="secondary" pending={pending && busy === 'save'} onClick={saveToPatient}>
                  Save to their record
                </ActionButton>
              )}
            </div>

            {driver === 'sandbox' && (
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
        <section className="lg:col-span-7" ref={resultRef}>
          {current ? (
            <ResultCard check={current} timeZone={timeZone}>
              {duplicate ? (
                <div className="v2-well px-3 py-3 text-sm w-full">
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
                <>
                  {!current.patientId && current.status !== 'error' && (
                    <ActionButton variant="primary" size="sm" pending={pending && busy === 'add'} onClick={() => addAsPatient(false)}>
                      Add {current.input.patient.firstName} as a patient
                    </ActionButton>
                  )}
                  {/* Every card can be re-asked — a verdict is a snapshot, and
                      the form already holds this check's own card details. */}
                  <ActionButton variant="secondary" size="sm" pending={pending && busy === 'check'} onClick={runCheck}>
                    {current.status === 'error' ? 'Try again' : 'Check again'}
                  </ActionButton>
                  {current.status !== 'error' && (
                    <>
                      <PrintBenefitsButton />
                      <CopySummaryButton check={current} clinicName={orgName} timeZone={timeZone} />
                    </>
                  )}
                </>
              )}
            </ResultCard>
          ) : (
            <EmptyState
              icon="🛡️"
              title="Nothing checked yet"
              body="Type what’s on the card and we’ll pull up their benefits: what’s covered, what’s left this year, what’s still waiting."
              action={
                <ActionButton variant="secondary" size="sm" onClick={focusFirstEmpty}>
                  Start with a name
                </ActionButton>
              }
              className="h-full"
            />
          )}
          {current && current.status !== 'error' && <PrintableBenefits check={current} clinicName={orgName} timeZone={timeZone} />}
        </section>
      </div>

      {/* ── Recent checks ────────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
            Recent checks{recent.length > 0 && <span className="font-mono-num tabular-nums"> · last {recent.length}</span>}
          </h2>
          {recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              <FilterChip active={statusFilter === null} onClick={() => setStatusFilter(null)}>
                All
              </FilterChip>
              {(['active', 'inactive', 'not_found', 'needs_review', 'error'] as EligibilityStatus[]).map((st) => {
                const n = recent.filter((c) => c.status === st).length
                if (n === 0) return null
                return (
                  <FilterChip key={st} active={statusFilter === st} onClick={() => setStatusFilter(statusFilter === st ? null : st)} count={n}>
                    {STATUS_LABEL[st]}
                  </FilterChip>
                )
              })}
              <label className="sr-only" htmlFor="ins-recent-search">
                Search recent checks
              </label>
              <input
                id="ins-recent-search"
                type="search"
                className="form-input text-sm w-44"
                placeholder="Patient or payer…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="No checks yet"
            body="The first one lands here, with its verdict and who ran it."
            action={
              <ActionButton variant="secondary" size="sm" onClick={focusFirstEmpty}>
                Start with a name
              </ActionButton>
            }
          />
        ) : (
          <div className="v2-card overflow-hidden">
            {/* Header row on surface-sunk — a table's head without a table,
                since each row is one button that loads the check. */}
            <div
              className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] gap-x-4 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]"
              aria-hidden="true"
            >
              <span>Patient</span>
              <span>Payer</span>
              <span className="text-right">Result</span>
              <span className="text-right w-28">When</span>
            </div>
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              {visibleRecent.length === 0 && (
                <li className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">Nothing matches that filter.</li>
              )}
              {visibleRecent.map((c) => {
                const selected = current?.id === c.id
                const d = INSURANCE_DRIVER_LABEL[c.driver]
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => loadRecent(c)}
                      className={`w-full text-left px-4 py-2.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] gap-x-4 gap-y-1 items-center hover:bg-teal-500/5 transition-colors ${
                        selected ? 'bg-teal-500/5 ring-1 ring-inset ring-teal-500/40' : ''
                      }`}
                      aria-current={selected ? 'true' : undefined}
                      data-selected={selected ? 'true' : undefined}
                    >
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100 min-w-0 truncate">
                        {c.patientName ?? `${c.input.patient.firstName} ${c.input.patient.lastName}`}
                        {!c.patientId && <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">(not a patient yet)</span>}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 min-w-0 truncate">
                        {c.result?.payerName ?? c.input.carrierName}
                        {c.result?.planName ? ` · ${c.result.planName}` : ''}
                      </span>
                      <span className="flex items-center gap-1.5 sm:justify-end">
                        <StatusPill tone={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status]} />
                        <StatusPill tone="neutral" label={d.short} title={d.title} />
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono-num tabular-nums sm:text-right sm:w-28" suppressHydrationWarning>
                        {formatClinicDayTime(new Date(c.checkedAtIso), timeZone)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>
      {canManage && (
        <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
          <button
            type="button"
            className="hover:underline"
            onClick={() => {
              startTransition(async () => {
                if (
                  !(await confirm({
                    title: 'Turn off insurance checks?',
                    message: 'Nothing is deleted — the history stays, and an owner or admin can turn it back on from this page.',
                    confirmLabel: 'Turn off',
                  }))
                )
                  return
                const r = await disableInsuranceAction()
                if (!r.ok) {
                  toast(r.error)
                  return
                }
                router.refresh()
              })
            }}
          >
            {INSURANCE_INTRO.turnOff}
          </button>
        </p>
      )}
    </div>
  )
}

/**
 * The payer typeahead for the Stedi drivers. A carrier NAME is not enough for
 * a clearinghouse — "Delta Dental" is forty state plans — so staff pick the
 * exact payer; the pick pins `payerId` and the driver never has to guess.
 */
function PayerPicker({
  value,
  query,
  error,
  onQuery,
  onPick,
  onClear,
}: {
  value: { payerId: string; name: string } | null
  query: string
  error?: string
  onQuery: (q: string) => void
  onPick: (p: StediPayerMatch) => void
  onClear: () => void
}) {
  const [results, setResults] = useState<StediPayerMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setResults([])
      return
    }
    const mine = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      const r = await searchPayersAction(query)
      if (mine !== seq.current) return
      setSearching(false)
      setResults(r.ok ? r.payers : [])
      setOpen(true)
    }, 300)
    return () => clearTimeout(t)
  }, [query, value])

  if (value) {
    return (
      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Payer</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusPill tone="info" label={value.name} title={`Payer id ${value.payerId}`} />
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono-num">{value.payerId}</span>
          <button type="button" onClick={onClear} className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
            Change
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="relative">
      <Field id="ins-payer" label="Payer" error={error}>
        <input
          id="ins-payer"
          className="form-input w-full text-sm"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Start typing — Delta Dental of California, Cigna, MetLife…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="ins-payer-list"
          aria-expanded={open && results.length > 0}
        />
      </Field>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {searching ? 'Searching payers…' : 'Pick the exact payer from the list — the one printed on the card.'}
      </p>
      {open && results.length > 0 && (
        // The popover recipe (DESIGN-SYSTEM Part 5): surface-1, shadow-pop, --r-lg.
        <ul
          id="ins-payer-list"
          role="listbox"
          aria-label="Matching payers"
          className="pop-in absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] p-1 shadow-[var(--shadow-pop)] text-sm"
        >
          {[...results].sort(dentalFirst).map((p) => (
            <li key={p.stediId} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 rounded-[var(--r-sm)] hover:bg-teal-500/5 flex items-baseline justify-between gap-3"
              >
                <span className="text-gray-800 dark:text-gray-100">{p.displayName}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {/* A dental platform picking a medical-only payer is the
                      wrong door every time — say so in the list, not after. */}
                  <StatusPill tone={hasDental(p) ? 'ok' : 'warn'} label={hasDental(p) ? 'Dental' : 'No dental listed'} />
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono-num">
                    {p.primaryPayerId}
                    {p.operatingStates.length > 0 && ` · ${p.operatingStates.slice(0, 3).join(', ')}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function hasDental(p: StediPayerMatch): boolean {
  return p.coverageTypes.some((c) => /dental/i.test(c))
}
function dentalFirst(a: StediPayerMatch, b: StediPayerMatch): number {
  return Number(hasDental(b)) - Number(hasDental(a))
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

/** "Ortho lifetime maximum: $1,500 left (of $1,500 · $0 used)" — a plan-rules fact in one line. */
function amountFact(amount: BenefitAmount | null | undefined, noun: string): string | null {
  const copy = describeBenefitAmount(amount, 'max')
  if (!copy) return null
  return `${noun}: ${copy.headline}${copy.sub ? ` (${copy.sub})` : ''}`
}

const WAITING_LABEL: Record<'basic' | 'major' | 'ortho', string> = {
  basic: 'Basic (fillings, extractions)',
  major: 'Major (crowns, bridges)',
  ortho: 'Orthodontics',
}

const TIER_HINT = {
  preventive: 'Exams, cleanings, X-rays',
  basic: 'Fillings, extractions',
  major: 'Crowns, bridges, dentures',
  ortho: 'Braces, aligners',
} as const

/** Today as an ISO calendar date, for "covered now" vs "not until". */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * The frequencies table's Next cell: the payer's next-eligible date decides
 * the tone — ok when it has arrived, warn when it is still ahead, neutral
 * when the payer only said when the last one was (or nothing at all).
 */
function NextCell({ nextOn, lastOn }: { nextOn?: string | null; lastOn: string | null }) {
  if (nextOn) {
    const now = nextOn <= todayIso()
    return (
      <span className={`font-semibold ${now ? TONE_TEXT.ok : TONE_TEXT.warn}`} suppressHydrationWarning>
        {now ? 'Covered now' : `Not until ${niceDate(nextOn)}`}
      </span>
    )
  }
  if (lastOn) return <span className={TONE_TEXT.neutral}>Last {niceDate(lastOn)}</span>
  return <span className={TONE_TEXT.neutral}>None on record</span>
}

/**
 * One check, rendered as THE BENEFITS CARD. Exported so the patient-detail
 * panel can reuse it. `children` are the footer actions (re-check, save,
 * add as a patient, and Phase 4's print / copy).
 */
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
  // A verdict ages: past VERIFICATION_FRESH_DAYS it is a lead, not an answer.
  // (A failed check has no verdict to go stale.)
  const stale = check.status !== 'error' && isStaleCheck(check.checkedAtIso)
  const maxLabel = hasAnyAmount(r?.annualMax) && r?.annualMax?.remainingCents == null ? 'Yearly maximum' : 'Left this year'
  const dedAmount = deductibleAsAmount(r?.deductible)
  const dedLabel = hasAnyAmount(dedAmount) && dedAmount.remainingCents == null ? 'Deductible' : 'Deductible left'
  const facts = r
    ? [
        amountFact(r.orthoLifetimeMax, 'Ortho lifetime maximum'),
        amountFact(r.familyMax, 'Family maximum'),
        amountFact(deductibleAsAmount(r.familyDeductible), 'Family deductible'),
      ].filter((x): x is string => !!x)
    : []
  const hasRules = !!r && (r.missingToothClause === true || facts.length > 0)
  const coverageLine = r?.coverage.effective
    ? r.coverage.termination
      ? `${niceDate(r.coverage.effective)} → ${niceDate(r.coverage.termination)}`
      : `since ${niceDate(r.coverage.effective)}`
    : null

  return (
    <div className="v2-card overflow-hidden" data-testid="benefits-card">
      {/* ── The crown: who, which plan, the verdict ───────────────── */}
      <div className="px-4 sm:px-5 py-4 bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 leading-tight truncate" tabIndex={-1} data-testid="benefits-heading">
              {who}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num tabular-nums">
              DOB {niceDate(check.input.patient.dateOfBirth)} · Member {check.input.memberId}
              {check.input.groupNumber ? ` · Group ${check.input.groupNumber}` : ''}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
              {r?.payerName ?? check.input.carrierName}
              {r?.planName && (
                <>
                  <span className="font-normal text-gray-500 dark:text-gray-400" aria-hidden="true">
                    {' · '}
                  </span>
                  <span className="font-normal text-gray-600 dark:text-gray-300">{r.planName}</span>
                </>
              )}
            </p>
            {coverageLine && <p className="text-xs text-gray-500 dark:text-gray-400 font-mono-num tabular-nums">Coverage {coverageLine}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusPill tone={STATUS_TONE[check.status]} label={STATUS_LABEL[check.status]} />
            {/* Every answer names what answered it; a live payer answer's title
                carries the "estimate" caveat, the practice ones their warning. */}
            <StatusPill tone="neutral" label={label.pill} title={label.title} />
            {stale && (
              <StatusPill
                tone="warn"
                label="Worth a re-check"
                title="Benefits move with every claim and plans can end any month — this answer is over a month old."
              />
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
          Checked {checkAgeLabel(check.checkedAtIso)}
          {check.requestedByName ? ` by ${check.requestedByName}` : ''}
          <span className="sr-only">, {formatClinicDayTime(new Date(check.checkedAtIso), timeZone)}</span>
        </p>
        {practice && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{label.title}</p>}
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-5">
        {check.status === 'error' && (
          <div className="v2-well px-4 py-3">
            <p className={`text-xs font-bold uppercase tracking-wider ${TONE_TEXT.warn}`}>What happened</p>
            <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">
              {/* The stored message already says what kind of failure it was —
                  a retry-worthy one says so itself; a setup problem (an NPI the
                  payer doesn't know) must not be dressed up as "try again". */}
              {check.error ?? 'We couldn’t reach the payer. Nothing about their coverage changed; try again in a moment.'}
            </p>
          </div>
        )}

        {r && r.status === 'active' && (
          <>
            {/* ── The hero band: the one number, then the deductible and preventive beside it ── */}
            {(hasAnyAmount(r.annualMax) || hasAnyAmount(dedAmount) || r.coveragePct?.preventive != null) && (
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] gap-5 items-start">
                <div className="min-h-[4rem]">
                  {hasAnyAmount(r.annualMax) ? (
                    <HeroAmount eyebrow={maxLabel} amount={r.annualMax} kind="max" ringSize={64} />
                  ) : (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Yearly maximum</p>
                      <p className={`mt-1 text-sm ${TONE_TEXT.neutral}`}>The payer didn’t state one.</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                  {hasAnyAmount(dedAmount) && (
                    <div className="v2-well px-3 py-2.5">
                      <HeroAmount eyebrow={dedLabel} amount={dedAmount} kind="deductible" ringSize={40} size="tile" />
                    </div>
                  )}
                  {r.coveragePct?.preventive != null && (
                    <div className="v2-well px-3 py-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Preventive</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">{r.coveragePct.preventive}%</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{TIER_HINT.preventive}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Coverage tiers ───────────────────────────────────────── */}
            {r.coveragePct && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Plan pays</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="tier-tiles">
                  <TierTile label="Preventive" hint={TIER_HINT.preventive} pct={r.coveragePct.preventive} />
                  <TierTile label="Basic" hint={TIER_HINT.basic} pct={r.coveragePct.basic} />
                  <TierTile label="Major" hint={TIER_HINT.major} pct={r.coveragePct.major} />
                  <TierTile label="Ortho" hint={TIER_HINT.ortho} pct={r.coveragePct.ortho} />
                </div>
              </div>
            )}

            {/* ── Waiting periods ──────────────────────────────────────── */}
            {r.waitingPeriods.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Still waiting</p>
                <div className="flex flex-wrap gap-2">
                  {r.waitingPeriods.map((w) => (
                    <StatusPill
                      key={w.category}
                      tone="warn"
                      label={`${WAITING_LABEL[w.category]} — covered from ${niceDate(w.endsOn)}`}
                      title="New coverage waits out this period before the plan pays for it."
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Plan rules ───────────────────────────────────────────── */}
            {hasRules && (
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Plan rules</p>
                <div className="flex flex-wrap gap-2">
                  {r.missingToothClause === true && (
                    <StatusPill
                      tone="warn"
                      label="Missing-tooth clause applies"
                      title="Teeth lost before coverage began aren’t covered for replacement."
                    />
                  )}
                  {facts.map((f) => (
                    <FactChip key={f}>{f}</FactChip>
                  ))}
                </div>
              </div>
            )}

            {/* ── Frequencies ──────────────────────────────────────────── */}
            {r.frequencies.length > 0 && (
              <div className="rounded-[var(--r-md)] border border-[color:var(--color-hairline)] overflow-hidden">
                <table className="w-full text-sm">
                  <caption className="sr-only">How often each service is covered, and when the next one is</caption>
                  <thead className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Service</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Allowed</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Next</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-hairline)]">
                    {r.frequencies.map((f) => (
                      <tr key={`${f.code}:${f.label}`} className="hover:bg-teal-500/5 transition-colors">
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-100 font-medium">{f.label}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-200 font-mono-num tabular-nums">{f.limit}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono-num tabular-nums">
                          <NextCell nextOn={f.nextOn} lastOn={f.lastOn} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {r && r.notes.length > 0 && (
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            {r.notes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-gray-500 dark:text-gray-400">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        )}

        {children && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-hairline)] pt-4" data-testid="benefits-actions">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
