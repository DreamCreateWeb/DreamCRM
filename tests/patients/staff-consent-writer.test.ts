import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * recordStaffConsentChange (lib/services/sms-consent.ts, ML-31) — the staff
 * "Record a change" path through the consent spine's writers.
 */

const state = {
  patient: { email: 'a@b.com', phone: '(415) 555-0142' } as { email: string | null; phone: string | null } | null,
  patches: [] as Array<Record<string, unknown>>,
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => (state.patient ? [state.patient] : []) }) }) }),
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          state.patches.push(patch)
          return { where: async () => undefined }
        },
      }),
    },
  }
})

import { recordStaffConsentChange } from '@/lib/services/sms-consent'

const NOW = new Date('2026-11-04T12:00:00Z')

beforeEach(() => {
  state.patient = { email: 'a@b.com', phone: '(415) 555-0142' }
  state.patches = []
})

describe('recordStaffConsentChange', () => {
  it('email off stamps the opt-out time and clears the flag', async () => {
    const r = await recordStaffConsentChange('org_1', 'pat_1', { channel: 'email', on: false, source: 'staff' }, NOW)
    expect(r.ok).toBe(true)
    expect(state.patches[0]).toEqual({ marketingEmailOptIn: 0, marketingEmailOptOutAt: NOW })
  })

  it('email on clears a standing opt-out and records the source', async () => {
    await recordStaffConsentChange('org_1', 'pat_1', { channel: 'email', on: true, source: 'portal' }, NOW)
    expect(state.patches[0]).toMatchObject({
      marketingEmailOptIn: 1,
      marketingEmailOptInAt: NOW,
      marketingEmailOptOutAt: null,
      marketingOptInSource: 'portal',
    })
  })

  it('email on with no address on file is refused in a reason, nothing written', async () => {
    state.patient = { email: null, phone: null }
    const r = await recordStaffConsentChange('org_1', 'pat_1', { channel: 'email', on: true, source: 'staff' }, NOW)
    expect(r).toEqual({ ok: false, reason: 'no_email' })
    expect(state.patches).toHaveLength(0)
  })

  it('texts on needs a usable number, then takes the deliberate re-subscribe path', async () => {
    state.patient = { email: null, phone: 'nope' }
    expect(await recordStaffConsentChange('org_1', 'pat_1', { channel: 'sms', on: true, source: 'staff' }, NOW)).toEqual({
      ok: false,
      reason: 'no_number',
    })
    state.patient = { email: null, phone: '(415) 555-0142' }
    const r = await recordStaffConsentChange('org_1', 'pat_1', { channel: 'sms', on: true, source: 'staff' }, NOW)
    expect(r.ok).toBe(true)
    expect(state.patches[0]).toMatchObject({ marketingSmsOptIn: 1, marketingSmsOptOutAt: null, marketingOptInSource: 'staff' })
  })

  it('texts off is always honoured, with the time', async () => {
    state.patient = { email: null, phone: null }
    const r = await recordStaffConsentChange('org_1', 'pat_1', { channel: 'sms', on: false, source: 'staff' }, NOW)
    expect(r.ok).toBe(true)
    expect(state.patches[0]).toEqual({ marketingSmsOptIn: 0, marketingSmsOptOutAt: NOW })
  })

  it('an unknown patient (another org’s id) writes nothing', async () => {
    state.patient = null
    const r = await recordStaffConsentChange('org_1', 'pat_x', { channel: 'email', on: false, source: 'staff' }, NOW)
    expect(r.ok).toBe(false)
    expect(state.patches).toHaveLength(0)
  })
})
