import { formatClinicDayTime } from '@/lib/format-datetime'
import {
  INSURANCE_DRIVER_LABEL,
  STATUS_LABEL,
  checkAgeLabel,
  deductibleAsAmount,
  describeBenefitAmount,
  niceDate,
  type BenefitAmount,
  type InsuranceCheckView,
} from '@/lib/insurance-eligibility'

/**
 * The benefits sheet as TEXT — what "Copy summary" puts on the clipboard and
 * what the printable sheet reads from. Pure and client-safe so the button,
 * the sheet and the tests share one rendering.
 *
 * THE HONESTY LAW travels with the copy: every summary ENDS with the driver's
 * own caveat (`INSURANCE_DRIVER_LABEL[driver].title`), so a practice answer
 * pasted into a PMS note still says it is one, and a payer answer still says
 * it is an estimate. Every dollar line is worded by `describeBenefitAmount`,
 * never by arithmetic here.
 */
export interface SummaryOptions {
  clinicName: string
  timeZone: string
  now?: Date
}

const WAITING_LABEL: Record<'basic' | 'major' | 'ortho', string> = {
  basic: 'Basic (fillings, extractions)',
  major: 'Major (crowns, bridges)',
  ortho: 'Orthodontics',
}

function amountLine(label: string, amount: BenefitAmount | null | undefined, kind: 'max' | 'deductible'): string | null {
  const copy = describeBenefitAmount(amount, kind)
  if (!copy) return null
  return `${label}: ${copy.headline}${copy.sub ? ` (${copy.sub})` : ''}`
}

function pctWord(v: number | null): string {
  if (v == null) return 'not stated'
  if (v === 0) return 'not covered'
  return `${v}%`
}

export function benefitsSummaryText(view: InsuranceCheckView, opts: SummaryOptions): string {
  const now = opts.now ?? new Date()
  const r = view.result
  const who = `${view.input.patient.firstName} ${view.input.patient.lastName}`.trim()
  const lines: string[] = []

  lines.push(`Insurance benefits — ${who}`)
  lines.push(`DOB ${niceDate(view.input.patient.dateOfBirth)} · Member ID ${view.input.memberId}${view.input.groupNumber ? ` · Group ${view.input.groupNumber}` : ''}`)
  if (view.input.relationship !== 'self' && view.input.subscriber) {
    const s = view.input.subscriber
    lines.push(`Policyholder: ${s.firstName} ${s.lastName} (DOB ${niceDate(s.dateOfBirth)})`)
  }
  lines.push(`Payer: ${r?.payerName ?? view.input.payerName ?? view.input.carrierName}${r?.planName ? ` · ${r.planName}` : ''}`)
  lines.push(`Status: ${STATUS_LABEL[view.status]}`)
  if (r?.coverage.effective) {
    lines.push(`Coverage: ${r.coverage.termination ? `${niceDate(r.coverage.effective)} to ${niceDate(r.coverage.termination)}` : `since ${niceDate(r.coverage.effective)}`}`)
  }
  lines.push(
    `Checked ${checkAgeLabel(view.checkedAtIso, now)} (${formatClinicDayTime(new Date(view.checkedAtIso), opts.timeZone)})${view.requestedByName ? ` by ${view.requestedByName}` : ''} · ${opts.clinicName}`,
  )

  if (view.status === 'error') {
    lines.push('')
    lines.push(`Couldn’t check: ${view.error ?? 'the payer could not be reached.'}`)
  }

  if (r && r.status === 'active') {
    lines.push('')
    const max = amountLine(r.annualMax?.remainingCents == null ? 'Yearly maximum' : 'Left this year', r.annualMax, 'max')
    const ded = amountLine(deductibleAsAmount(r.deductible)?.remainingCents == null ? 'Deductible' : 'Deductible left', deductibleAsAmount(r.deductible), 'deductible')
    if (max) lines.push(max)
    if (ded) lines.push(ded)
    if (r.coveragePct) {
      lines.push(`Plan pays — Preventive ${pctWord(r.coveragePct.preventive)} · Basic ${pctWord(r.coveragePct.basic)} · Major ${pctWord(r.coveragePct.major)} · Ortho ${pctWord(r.coveragePct.ortho)}`)
    }
    const rules: string[] = []
    if (r.missingToothClause === true) rules.push('Missing-tooth clause applies')
    const ortho = amountLine('Ortho lifetime maximum', r.orthoLifetimeMax, 'max')
    const fam = amountLine('Family maximum', r.familyMax, 'max')
    const famDed = amountLine('Family deductible', deductibleAsAmount(r.familyDeductible), 'deductible')
    for (const x of [ortho, fam, famDed]) if (x) rules.push(x)
    if (rules.length) {
      lines.push('')
      lines.push('Plan rules:')
      for (const x of rules) lines.push(`- ${x}`)
    }
    if (r.waitingPeriods.length) {
      lines.push('')
      lines.push('Still waiting:')
      for (const w of r.waitingPeriods) lines.push(`- ${WAITING_LABEL[w.category]} — covered from ${niceDate(w.endsOn)}`)
    }
    if (r.frequencies.length) {
      lines.push('')
      lines.push('Frequencies:')
      const today = now.toISOString().slice(0, 10)
      for (const f of r.frequencies) {
        const next = f.nextOn ? (f.nextOn <= today ? 'covered now' : `not until ${niceDate(f.nextOn)}`) : f.lastOn ? `last ${niceDate(f.lastOn)}` : 'none on record'
        lines.push(`- ${f.label}: ${f.limit} · ${next}`)
      }
    }
  }

  if (r && r.notes.length) {
    lines.push('')
    lines.push('Notes:')
    for (const n of r.notes) lines.push(`- ${n}`)
  }

  // The caveat is the LAST line by law — it must survive a paste.
  lines.push('')
  lines.push(INSURANCE_DRIVER_LABEL[view.driver].title)
  return lines.join('\n')
}
