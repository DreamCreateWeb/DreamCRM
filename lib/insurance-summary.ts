import { formatClinicDayTime } from '@/lib/format-datetime'
import {
  INSURANCE_DRIVER_LABEL,
  STATUS_LABEL,
  checkAgeLabel,
  deductibleAsAmount,
  describeBenefitAmount,
  insuranceTypeLabel,
  niceDate,
  planPaysWord,
  replacementWords,
  type BenefitAmount,
  type InsuranceCheckView,
} from '@/lib/insurance-eligibility'
import { PAYER_NETWORK_OPTIONS, PAYER_PAYS_ON_OPTIONS, type PayerNoteView } from '@/lib/payer-notebook'
import { BREAKDOWN_COPY } from '@/lib/insurance-breakdown'

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
  /** The practice's payer notebook for this payer, when written (2026-10-08). */
  practice?: PayerNoteView | null
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

const pctWord = planPaysWord

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
  lines.push(`Payer: ${r?.payerName ?? view.input.payerName ?? view.input.carrierName}${r?.planName ? ` · ${r.planName}` : ''}${view.input.payerId ? ` · payer ID ${view.input.payerId}` : ''}`)
  const plan = r?.plan
  if (plan) {
    const bits = [
      plan.groupNumber ? `Group ${plan.groupNumber}` : null,
      plan.groupName ? `Employer ${plan.groupName}` : null,
      plan.planNumber ? `Plan # ${plan.planNumber}` : null,
      insuranceTypeLabel(plan.insuranceType),
      plan.benefitYear ? `${plan.benefitYear === 'calendar' ? 'Calendar year' : 'Plan year'}${plan.benefitYearStart && plan.benefitYearEnd ? ` ${niceDate(plan.benefitYearStart)} to ${niceDate(plan.benefitYearEnd)}` : ''}` : null,
    ].filter(Boolean)
    if (bits.length) lines.push(`Plan: ${bits.join(' · ')}`)
  }
  const contacts = r?.payerContacts
  if (contacts) {
    const phones = contacts.contacts.flatMap((c) => c.phones)
    const bits = [phones.length ? `Phone ${phones.join(' / ')}` : null, contacts.claimsAddress ? `Claims: ${contacts.claimsAddress}` : null].filter(Boolean)
    if (bits.length) lines.push(`Payer contact: ${bits.join(' · ')}`)
  }
  const practice = opts.practice
  if (practice) {
    const bits = [
      practice.feeSchedule ? `Fee schedule ${practice.feeSchedule}` : null,
      PAYER_NETWORK_OPTIONS.find((o) => o.id === practice.network)?.label ?? null,
      practice.paysOn ? `Pays on the ${PAYER_PAYS_ON_OPTIONS.find((o) => o.id === practice.paysOn)?.label.toLowerCase()}` : null,
      practice.claimsAddress ? `Claims: ${practice.claimsAddress}` : null,
      practice.phone ? `Phone ${practice.phone}` : null,
      practice.notes,
    ].filter(Boolean)
    if (bits.length) lines.push(`Our practice with this payer: ${bits.join(' · ')}`)
  }
  lines.push(`Status: ${STATUS_LABEL[view.status]}`)
  if (r?.breakdown) lines.push(`Full breakdown: ${BREAKDOWN_COPY.receipt(r.breakdown)}`)
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
    if (r.deductibleApplies) {
      const d = r.deductibleApplies
      const applies = [d.preventive === true ? 'preventive' : null, d.basic === true ? 'basic' : null, d.major === true ? 'major' : null].filter(Boolean)
      const waived = [d.preventive === false ? 'preventive' : null, d.basic === false ? 'basic' : null, d.major === false ? 'major' : null].filter(Boolean)
      const bits = [applies.length ? `applies to ${applies.join(', ')}` : null, waived.length ? `not to ${waived.join(', ')}` : null].filter(Boolean)
      if (bits.length) lines.push(`Deductible ${bits.join('; ')}${d.note ? ` (${d.note})` : ''}`)
    }
    if (r.coveragePct) {
      const c = r.coveragePct
      lines.push(`Plan pays — Preventive ${pctWord(c.preventive)} · Basic ${pctWord(c.basic)} · Major ${pctWord(c.major)} · Ortho ${pctWord(c.ortho)}`)
      const extra = [
        c.diagnostic != null ? `Diagnostic ${pctWord(c.diagnostic)}` : null,
        c.perio != null ? `Perio ${pctWord(c.perio)}` : null,
        c.endo != null ? `Endo ${pctWord(c.endo)}` : null,
        c.oralSurgery != null ? `Oral surgery ${pctWord(c.oralSurgery)}` : null,
      ].filter(Boolean)
      if (extra.length) lines.push(`Also — ${extra.join(' · ')}`)
      const o = r.coveragePctOut
      if (o) lines.push(`Out of network — Preventive ${pctWord(o.preventive)} · Basic ${pctWord(o.basic)} · Major ${pctWord(o.major)}`)
    }
    const rules: string[] = []
    if (r.missingToothClause === true) rules.push('Missing-tooth clause applies')
    if (r.noWaitingPeriods) rules.push('No waiting periods')
    if (r.replacement) {
      const rp = r.replacement
      const bits = [
        rp.crownBridgeMonths != null ? `crowns and bridges every ${replacementWords(rp.crownBridgeMonths)}` : null,
        rp.dentureMonths != null ? `dentures every ${replacementWords(rp.dentureMonths)}` : null,
        rp.paysOn ? `paid on the ${rp.paysOn} date` : null,
      ].filter(Boolean)
      if (bits.length) rules.push(`Replacement: ${bits.join(' · ')}`)
    }
    if (r.ageLimits) {
      const a = r.ageLimits
      const bits = [
        a.fluoride != null ? `fluoride through ${a.fluoride}` : null,
        a.sealants != null ? `sealants through ${a.sealants}` : null,
        a.ortho != null ? `ortho through ${a.ortho}` : null,
        a.dependent != null ? `dependents through ${a.dependent}` : null,
      ].filter(Boolean)
      if (bits.length) rules.push(`Age limits: ${bits.join(' · ')}`)
    }
    for (const d of r.downgrades ?? []) rules.push(`Downgrade: ${d}`)
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
    const today = now.toISOString().slice(0, 10)
    const procs = r.procedures ?? []
    if (procs.length) {
      lines.push('')
      lines.push('By procedure (last · next · frequency · plan pays):')
      for (const p of procs) {
        const next = p.nextOn ? (p.nextOn <= today ? 'covered now' : `not until ${niceDate(p.nextOn)}`) : null
        const bits = [
          p.lastOn ? `last ${niceDate(p.lastOn)}` : null,
          next,
          p.limit,
          p.planPays != null ? `${pctWord(p.planPays)}${p.pctSource === 'tier' ? ' (category rate)' : ''}` : null,
          ...p.notes,
        ].filter(Boolean)
        lines.push(`- ${p.label} (${p.code}): ${bits.join(' · ')}`)
      }
    } else if (r.frequencies.length) {
      lines.push('')
      lines.push('Frequencies:')
      for (const f of r.frequencies) {
        const next = f.nextOn ? (f.nextOn <= today ? 'covered now' : `not until ${niceDate(f.nextOn)}`) : f.lastOn ? `last ${niceDate(f.lastOn)}` : 'none on record'
        lines.push(`- ${f.label}: ${f.limit} · ${next}`)
      }
    }
  }

  const payerNotes = (r?.payerNotes ?? []).filter((n) => !(r?.downgrades ?? []).includes(n))
  if (payerNotes.length) {
    lines.push('')
    lines.push('Payer notes:')
    for (const n of payerNotes) lines.push(`- ${n}`)
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
