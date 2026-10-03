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
})
