import { describe, it, expect } from 'vitest'
import {
  SANDBOX_SCENARIO_KEYS,
  SANDBOX_TIMEOUT_MESSAGE,
  hashRequest,
  pickSandboxScenario,
  renderSandboxScenario,
  sandboxPlanName,
  sandboxProvider,
} from '@/lib/services/insurance-eligibility/sandbox'
import { SANDBOX_STEERING, type EligibilityRequest } from '@/lib/insurance-eligibility'

/**
 * The sandbox driver: deterministic, steerable, never a payer. Same card →
 * same answer; the documented suffixes force each state; every scenario is a
 * well-formed result derived from the injected clock.
 */

const NOW = new Date('2026-09-30T15:00:00Z')

function req(memberId = 'DD-100-2231', carrier = 'Delta Dental'): EligibilityRequest {
  return {
    patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' },
    carrierName: carrier,
    memberId,
    groupNumber: null,
    relationship: 'self',
    subscriber: null,
  }
}

describe('determinism', () => {
  it('the same request always renders the same result', async () => {
    const a = await sandboxProvider.check(req(), { now: NOW, organizationId: 'org_1' })
    const b = await sandboxProvider.check(req(), { now: NOW, organizationId: 'org_1' })
    expect(a).toEqual(b)
  })

  it('hashes ignore case and member-id punctuation but not the digits', () => {
    expect(hashRequest(req('DD-100-2231', 'delta dental'))).toBe(hashRequest(req('dd 100 2231', 'DELTA DENTAL')))
    expect(hashRequest(req('DD-100-2231'))).not.toBe(hashRequest(req('DD-100-2232')))
  })

  it('spreads ordinary member ids across more than one active plan', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) seen.add(pickSandboxScenario(req(`DD-${1000 + i * 7}-1${i}2`)))
    expect(seen.size).toBeGreaterThan(1)
    for (const k of Array.from(seen)) expect(k.startsWith('active_')).toBe(true)
  })
})

describe('steering suffixes', () => {
  it('map to the documented states', () => {
    expect(pickSandboxScenario(req('DD-100-0000'))).toBe('inactive')
    expect(pickSandboxScenario(req('DD-100-9999'))).toBe('not_found')
    expect(pickSandboxScenario(req('DD-100-5555'))).toBe('needs_review')
    expect(pickSandboxScenario(req('DD-100-0001'))).toBe('timeout')
    expect(pickSandboxScenario(req('DD-100-7777'))).toBe('active_total_only')
  })

  it('the documented list and the driver agree on which suffixes exist', () => {
    const suffixes = SANDBOX_STEERING.map((s) => s.suffix).sort()
    expect(suffixes).toEqual(['0000', '0001', '5555', '7777', '9999'])
  })

  it('the timeout suffix makes the provider THROW (the service stores an error row)', async () => {
    await expect(sandboxProvider.check(req('DD-100-0001'), { now: NOW, organizationId: 'org_1' })).rejects.toThrow(
      SANDBOX_TIMEOUT_MESSAGE,
    )
  })
})

describe('renderSandboxScenario', () => {
  it('every scenario is well-formed: remaining = total − used, dates from the injected clock', () => {
    for (const key of SANDBOX_SCENARIO_KEYS) {
      const r = renderSandboxScenario(key, req(), NOW)
      expect(r.asOf).toBe(NOW.toISOString())
      expect(r.payerName).toBe('Delta Dental')
      if (r.annualMax && r.annualMax.totalCents != null && r.annualMax.usedCents != null) {
        expect(r.annualMax.remainingCents).toBe(r.annualMax.totalCents - r.annualMax.usedCents)
        expect(Number.isInteger(r.annualMax.usedCents)).toBe(true)
      }
      if (r.deductible && r.deductible.individualCents != null && r.deductible.metCents != null) {
        expect(r.deductible.remainingCents).toBe(r.deductible.individualCents - r.deductible.metCents)
      }
      expect(Array.isArray(r.notes)).toBe(true)
    }
  })

  it('active scenarios carry coverage tiers; the others carry an explanation instead', () => {
    expect(renderSandboxScenario('active_ppo', req(), NOW).coveragePct?.preventive).toBe(100)
    expect(renderSandboxScenario('inactive', req(), NOW).coveragePct).toBeNull()
    expect(renderSandboxScenario('inactive', req(), NOW).coverage.termination).toBe('2026-08-31')
    expect(renderSandboxScenario('not_found', req(), NOW).planName).toBeNull()
    expect(renderSandboxScenario('needs_review', req(), NOW).notes[0]).toMatch(/subscriber/i)
  })

  it('new coverage waits out basic and major from its effective date', () => {
    const r = renderSandboxScenario('active_waiting', req(), NOW)
    expect(r.coverage.effective).toBe('2026-07-01')
    expect(r.waitingPeriods).toEqual([
      { category: 'basic', endsOn: '2027-01-01' },
      { category: 'major', endsOn: '2027-07-01' },
    ])
  })

  it('the total-only scenario states the maximum and deductible with NO used or remaining figure', () => {
    const r = renderSandboxScenario('active_total_only', req(), NOW)
    expect(r.status).toBe('active')
    expect(r.annualMax).toEqual({ totalCents: 150_000, usedCents: null, remainingCents: null })
    expect(r.deductible).toEqual({ individualCents: 5_000, metCents: null, remainingCents: null })
    expect(r.notes.join(' ')).toMatch(/not how much has been used/)
  })

  it('the rich plan carries family and ortho-lifetime amounts so the plan-rules block is demoable', () => {
    const r = renderSandboxScenario('active_rich', req(), NOW)
    expect(r.familyMax?.totalCents).toBe(400_000)
    expect(r.familyDeductible?.individualCents).toBe(15_000)
    expect(r.orthoLifetimeMax).toEqual({ totalCents: 150_000, usedCents: 0, remainingCents: 150_000 })
  })

  it('every active scenario carries the verification sheet’s fields (2026-10-08) — the demo prints a full sheet, labelled a practice answer', () => {
    for (const key of ['active_ppo', 'active_rich', 'active_exhausted', 'active_waiting', 'active_total_only'] as const) {
      const r = renderSandboxScenario(key, req(), NOW)
      expect(r.plan?.groupNumber, key).toMatch(/^G\d{6}$/)
      expect(r.plan?.groupName, key).toBeTruthy()
      expect(r.payerContacts?.contacts[0].phones, key).toEqual(['800-555-0147'])
      expect(r.deductibleApplies, key).toEqual({ preventive: false, basic: true, major: true, note: null })
      expect(r.coveragePct?.diagnostic, key).toBe(100)
      expect(r.procedures?.map((p) => p.key), key).toContain('occlusal_guard')
      expect(r.replacement?.crownBridgeMonths, key).toBe(60)
      expect(r.ageLimits?.fluoride, key).toBe(14)
      expect(r.payerNotes?.length, key).toBeGreaterThan(2)
      for (const p of r.procedures ?? []) expect(p.pctSource === null ? p.planPays : true, `${key} ${p.key}`).toBeTruthy()
    }
    // The rich plan covers the guard and pays on prep; the plain PPO excludes the guard, pays on seat and downgrades posterior composites.
    const rich = renderSandboxScenario('active_rich', req(), NOW)
    expect(rich.procedures!.find((p) => p.key === 'occlusal_guard')).toMatchObject({ planPays: 50, pctSource: 'code' })
    expect(rich.replacement?.paysOn).toBe('prep')
    expect(rich.ageLimits?.ortho).toBe(19)
    const ppo = renderSandboxScenario('active_ppo', req(), NOW)
    expect(ppo.procedures!.find((p) => p.key === 'occlusal_guard')).toMatchObject({ planPays: 0, pctSource: 'code' })
    expect(ppo.downgrades).toEqual(['Posterior composite fillings are paid at the amalgam rate.'])
    // The non-active scenarios carry none of it.
    expect(renderSandboxScenario('inactive', req(), NOW).procedures).toBeUndefined()
    // The provider answers in the {result, raw} shape with no raw behind it.
    return sandboxProvider.check(req(), { now: NOW, organizationId: 'org_1' }).then((a) => {
      expect(a.raw).toBeNull()
      expect(a.result.status).toBe('active')
    })
  })

  it('plan names are carrier-flavoured and fall back honestly', () => {
    expect(sandboxPlanName('Delta Dental')).toBe('Delta Dental PPO')
    expect(sandboxPlanName('Cigna')).toBe('Cigna DPPO Advantage')
    expect(sandboxPlanName('Anthem / BlueCross BlueShield')).toBe('Anthem Dental Complete')
    expect(sandboxPlanName('Local Mutual')).toBe('Local Mutual Dental PPO')
  })
})
