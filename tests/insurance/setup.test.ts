import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The ON switch service (self-serve setup, 2026-10-05). Pins: turning on
 * stamps once (idempotent — a second call writes nothing); a typed NPI is
 * normalised and written, a bad one refuses BEFORE any write, an empty box
 * keeps what is stored; the live driver's `requireNpi` refuses without
 * one; turning off clears. A switch is a SETTING — nothing here touches
 * the Action Ledger (the marker law keeps `report` to the Guardian).
 */

const state = {
  profile: [] as Array<{ enabledAt: Date | null; npi: string | null }>,
  sets: [] as Array<Record<string, unknown>>,
  updatedRows: 1,
}
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => state.profile }) }) }),
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          state.sets.push(vals)
          const res = { returning: async () => Array.from({ length: state.updatedRows }, () => ({ wasOn: 'org_a' })) }
          return { where: () => Object.assign(Promise.resolve(res), res) }
        },
      }),
    },
  }
})

import { disableInsuranceTool, enableInsuranceTool } from '@/lib/services/insurance-eligibility/setup'

const NOW = new Date('2026-10-05T15:00:00Z')
const BEFORE = new Date('2026-10-01T15:00:00Z')

beforeEach(() => {
  state.profile = [{ enabledAt: null, npi: null }]
  state.sets = []
  state.updatedRows = 1
})

describe('enableInsuranceTool', () => {
  it('turns on once: stamps the switch and writes the normalised NPI', async () => {
    const r = await enableInsuranceTool('org_a', { npi: '123-456-7893', now: NOW })
    expect(r).toEqual({ ok: true, enabledAt: NOW, npi: '1234567893' })
    expect(state.sets).toEqual([{ npi: '1234567893', insuranceEnabledAt: NOW }])
  })

  it('is idempotent: already on + same NPI writes nothing; keeps the original stamp', async () => {
    state.profile = [{ enabledAt: BEFORE, npi: '1234567893' }]
    const r = await enableInsuranceTool('org_a', { npi: '1234567893', now: NOW })
    expect(r).toEqual({ ok: true, enabledAt: BEFORE, npi: '1234567893' })
    expect(state.sets).toEqual([])
  })

  it('an empty box keeps the stored NPI; a bad NPI refuses before any write', async () => {
    state.profile = [{ enabledAt: null, npi: '1234567893' }]
    const kept = await enableInsuranceTool('org_a', { npi: '', now: NOW })
    expect(kept).toEqual({ ok: true, enabledAt: NOW, npi: '1234567893' })
    expect(state.sets).toEqual([{ insuranceEnabledAt: NOW }])

    state.sets = []
    const bad = await enableInsuranceTool('org_a', { npi: '12345', now: NOW })
    expect(bad).toEqual({ ok: false, error: expect.stringMatching(/ten digits/) })
    expect(state.sets).toEqual([])
  })

  it('requireNpi (the live driver) refuses to turn on without one, and allows it with one', async () => {
    const refused = await enableInsuranceTool('org_a', { npi: '', requireNpi: true, now: NOW })
    expect(refused.ok).toBe(false)
    expect(state.sets).toEqual([])
    const ok = await enableInsuranceTool('org_a', { npi: '1234567893', requireNpi: true, now: NOW })
    expect(ok.ok).toBe(true)
  })
})

describe('disableInsuranceTool', () => {
  it('clears the switch; an unknown org clears nothing', async () => {
    expect(await disableInsuranceTool('org_a')).toBe(true)
    expect(state.sets).toEqual([{ insuranceEnabledAt: null }])
    state.updatedRows = 0
    expect(await disableInsuranceTool('org_zzz')).toBe(false)
  })
})
