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
  })

  it('the documented list and the driver agree on which suffixes exist', () => {
    const suffixes = SANDBOX_STEERING.map((s) => s.suffix).sort()
    expect(suffixes).toEqual(['0000', '0001', '5555', '9999'])
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
      if (r.annualMax) {
        expect(r.annualMax.remainingCents).toBe(r.annualMax.totalCents - r.annualMax.usedCents)
        expect(Number.isInteger(r.annualMax.usedCents)).toBe(true)
      }
      if (r.deductible) expect(r.deductible.remainingCents).toBe(r.deductible.individualCents - r.deductible.metCents)
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

  it('plan names are carrier-flavoured and fall back honestly', () => {
    expect(sandboxPlanName('Delta Dental')).toBe('Delta Dental PPO')
    expect(sandboxPlanName('Cigna')).toBe('Cigna DPPO Advantage')
    expect(sandboxPlanName('Anthem / BlueCross BlueShield')).toBe('Anthem Dental Complete')
    expect(sandboxPlanName('Local Mutual')).toBe('Local Mutual Dental PPO')
  })
})
