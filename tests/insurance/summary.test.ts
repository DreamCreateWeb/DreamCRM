import { describe, it, expect } from 'vitest'
import { benefitsSummaryText } from '@/lib/insurance-summary'
import { INSURANCE_DRIVER_LABEL, type InsuranceCheckView, type InsuranceDriverId } from '@/lib/insurance-eligibility'

/**
 * The copied / printed summary: every dollar line is worded by the one copy
 * helper, "didn't say" caveats survive, and the driver's honesty title is the
 * LAST line for every driver — a practice answer pasted into a PMS note must
 * still say it is one.
 */

const NOW = new Date('2026-10-03T15:00:00Z')

function view(overrides: Partial<InsuranceCheckView> = {}): InsuranceCheckView {
  return {
    id: 'ins_1',
    patientId: 'pat_1',
    patientName: 'Mia Hayes',
    driver: 'sandbox',
    status: 'active',
    input: {
      patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' },
      carrierName: 'Delta Dental',
      memberId: 'DD-100-2231',
      groupNumber: 'GRP-4471',
      relationship: 'child',
      subscriber: { firstName: 'Ana', lastName: 'Hayes', dateOfBirth: '1960-01-02' },
    },
    result: {
      status: 'active',
      payerName: 'Delta Dental',
      planName: 'Delta Dental PPO',
      coverage: { effective: '2026-01-01', termination: null },
      network: 'unknown',
      annualMax: { totalCents: 150_000, usedCents: 62_000, remainingCents: 88_000 },
      deductible: { individualCents: 5_000, metCents: 5_000, remainingCents: 0 },
      coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null },
      waitingPeriods: [{ category: 'major', endsOn: '2027-07-01' }],
      frequencies: [
        { code: 'exam', label: 'Exams', limit: '2 per year', lastOn: null, nextOn: '2024-06-13' },
        { code: 'fmx', label: 'Full-mouth X-rays', limit: '1 every 60 months', lastOn: null, nextOn: '2028-12-08' },
        { code: 'prophy', label: 'Cleanings', limit: '2 per year', lastOn: '2026-04-30', nextOn: null },
      ],
      missingToothClause: true,
      orthoLifetimeMax: { totalCents: 150_000, usedCents: 0, remainingCents: 150_000 },
      notes: ['Bitewings were last taken over a year ago, so a new set is covered.'],
      asOf: '2026-10-01T15:00:00.000Z',
    },
    error: null,
    checkedAtIso: '2026-10-01T15:00:00.000Z',
    requestedByUserId: 'u_1',
    requestedByName: 'Dana Whitfield',
    ...overrides,
  }
}

const OPTS = { clinicName: 'Dream Dental', timeZone: 'America/Chicago', now: NOW }

describe('benefitsSummaryText', () => {
  it('ends with the driver’s honesty title for EVERY driver', () => {
    for (const driver of ['sandbox', 'stedi_test', 'stedi'] as InsuranceDriverId[]) {
      const text = benefitsSummaryText(view({ driver }), OPTS)
      const lines = text.split('\n')
      expect(lines[lines.length - 1]).toBe(INSURANCE_DRIVER_LABEL[driver].title)
    }
  })

  it('reads top to bottom like the sheet: who, card, policyholder, payer, status, when and by whom', () => {
    const text = benefitsSummaryText(view(), OPTS)
    expect(text).toContain('Insurance benefits — Mia Hayes')
    expect(text).toContain('DOB Mar 12, 1988 · Member ID DD-100-2231 · Group GRP-4471')
    expect(text).toContain('Policyholder: Ana Hayes (DOB Jan 2, 1960)')
    expect(text).toContain('Payer: Delta Dental · Delta Dental PPO')
    expect(text).toContain('Status: Active')
    expect(text).toContain('Coverage: since Jan 1, 2026')
    expect(text).toMatch(/Checked 2 days ago \(.*\) by Dana Whitfield · Dream Dental/)
  })

  it('words the money through the one copy helper, tiers in words, rules and waiting periods, frequencies with next dates', () => {
    const text = benefitsSummaryText(view(), OPTS)
    expect(text).toContain('Left this year: $880 left (of $1,500 · $620 used)')
    expect(text).toContain('Deductible left: Met (the $50 deductible is met for the year)')
    expect(text).toContain('Plan pays — Preventive 100% · Basic 80% · Major 50% · Ortho not stated')
    expect(text).toContain('- Missing-tooth clause applies')
    expect(text).toContain('- Ortho lifetime maximum: $1,500 left (of $1,500 · $0 used)')
    expect(text).toContain('- Major (crowns, bridges) — covered from Jul 1, 2027')
    expect(text).toContain('- Exams: 2 per year · covered now')
    expect(text).toContain('- Full-mouth X-rays: 1 every 60 months · not until Dec 8, 2028')
    expect(text).toContain('- Cleanings: 2 per year · last Apr 30, 2026')
    expect(text).toContain('- Bitewings were last taken over a year ago, so a new set is covered.')
  })

  it('a total-only answer keeps its "didn’t say" caveat in the copy', () => {
    const text = benefitsSummaryText(
      view({ result: { ...view().result!, annualMax: { totalCents: 250_000, usedCents: null, remainingCents: null }, deductible: null } }),
      OPTS,
    )
    expect(text).toContain('Yearly maximum: Up to $2,500 (the payer didn’t say how much is used)')
    // The YEARLY line never invents a used figure (the ortho lifetime line may say "$0 used" — both its ends were stated).
    expect(text).not.toMatch(/Yearly maximum:.*\$0 used/)
    expect(text).not.toMatch(/^Deductible/m)
  })

  it('a failed check says what happened and still carries the caveat; a not-found carries the notes', () => {
    const failed = benefitsSummaryText(view({ status: 'error', result: null, error: 'Sandbox: simulated payer timeout' }), OPTS)
    expect(failed).toContain('Status: Couldn’t check')
    expect(failed).toContain('Couldn’t check: Sandbox: simulated payer timeout')
    expect(failed.split('\n').pop()).toBe(INSURANCE_DRIVER_LABEL.sandbox.title)
    const nf = benefitsSummaryText(
      view({ status: 'not_found', result: { ...view().result!, status: 'not_found', annualMax: null, deductible: null, coveragePct: null, frequencies: [], waitingPeriods: [], notes: ['No member matched.'] } }),
      OPTS,
    )
    expect(nf).toContain('Status: Not found')
    expect(nf).not.toContain('Plan pays')
    expect(nf).toContain('- No member matched.')
  })

  it('the verification sheet’s lines (2026-10-08): plan facts, payer contact, the practice notebook, applies-to, seven tiers, by-procedure lines, replacement, ages, downgrades, every payer note — caveat still last', () => {
    const text = benefitsSummaryText(
      view({
        input: { ...view().input, payerId: '77777' },
        result: {
          ...view().result!,
          plan: { groupNumber: 'G-100', groupName: 'Harbor Logistics', planNumber: null, insuranceType: 'PREFERRED_PROVIDER_ORGANIZATION', benefitYear: 'plan', benefitYearStart: '2026-07-01', benefitYearEnd: '2027-06-30' },
          payerContacts: { contacts: [{ name: 'Provider services', phones: ['800-555-0147'], faxes: [], emails: [], urls: [] }], claimsAddress: 'PO Box 1, Anytown, OH 43000' },
          deductibleApplies: { preventive: false, basic: true, major: true, note: 'BASIC/MAJOR' },
          coveragePct: { preventive: 100, basic: 80, major: 50, ortho: null, diagnostic: 100, perio: 80, endo: null, oralSurgery: null },
          coveragePctOut: { preventive: 80, basic: 60, major: 40, ortho: null },
          noWaitingPeriods: true,
          procedures: [
            { key: 'exam', code: 'D0120', label: 'Exam', planPays: 100, pctSource: 'tier', limit: '2 per year', lastOn: null, nextOn: '2024-06-13', notes: [] },
            { key: 'occlusal_guard', code: 'D9944', label: 'Occlusal guard', planPays: 0, pctSource: 'code', limit: null, lastOn: null, nextOn: null, notes: [] },
            { key: 'crown', code: 'D2740', label: 'Crown', planPays: 50, pctSource: 'tier', limit: '1 every 5 years', lastOn: '2023-02-01', nextOn: null, notes: ['Paid on the prep date.'] },
          ],
          replacement: { crownBridgeMonths: 60, dentureMonths: 84, paysOn: 'prep' },
          ageLimits: { fluoride: 14, sealants: null, ortho: 19, dependent: 26 },
          downgrades: ['Posterior composite fillings are paid at the amalgam rate.'],
          payerNotes: ['Posterior composite fillings are paid at the amalgam rate.', 'Pretreatment estimates recommended over $300.'],
        },
      }),
      { ...OPTS, practice: { id: 'p', payerKey: 'id:77777', payerId: '77777', payerName: 'Delta Dental', feeSchedule: 'Premier', network: 'in', paysOn: 'seat', claimsAddress: null, phone: '800-555-0199', notes: 'Ask for the dental desk.', updatedAtIso: '2026-10-08T15:00:00.000Z', updatedByName: 'Mary' } },
    )
    expect(text).toContain('Payer: Delta Dental · Delta Dental PPO · payer ID 77777')
    expect(text).toContain('Plan: Group G-100 · Employer Harbor Logistics · PPO · Plan year Jul 1, 2026 to Jun 30, 2027')
    expect(text).toContain('Payer contact: Phone 800-555-0147 · Claims: PO Box 1, Anytown, OH 43000')
    expect(text).toContain('Our practice with this payer: Fee schedule Premier · In network · Pays on the seat date · Phone 800-555-0199 · Ask for the dental desk.')
    expect(text).toContain('Deductible applies to basic, major; not to preventive (BASIC/MAJOR)')
    expect(text).toContain('Also — Diagnostic 100% · Perio 80%')
    expect(text).toContain('Out of network — Preventive 80% · Basic 60% · Major 40%')
    expect(text).toContain('- No waiting periods')
    expect(text).toContain('- Replacement: crowns and bridges every 5 years · dentures every 7 years · paid on the prep date')
    expect(text).toContain('- Age limits: fluoride through 14 · ortho through 19 · dependents through 26')
    expect(text).toContain('- Downgrade: Posterior composite fillings are paid at the amalgam rate.')
    expect(text).toContain('By procedure (last · next · frequency · plan pays):')
    expect(text).toContain('- Exam (D0120): covered now · 2 per year · 100% (category rate)')
    expect(text).toContain('- Occlusal guard (D9944): not covered')
    expect(text).toContain('- Crown (D2740): last Feb 1, 2023 · 1 every 5 years · 50% (category rate) · Paid on the prep date.')
    // The frequencies block yields to the procedure lines when they exist.
    expect(text).not.toContain('Frequencies:')
    expect(text).toContain('Payer notes:')
    expect(text).toContain('- Pretreatment estimates recommended over $300.')
    // A downgrade is not repeated under the payer notes.
    expect(text.split('Posterior composite fillings').length).toBe(2)
    expect(text.split('\n').pop()).toBe(INSURANCE_DRIVER_LABEL.sandbox.title)
  })
})
