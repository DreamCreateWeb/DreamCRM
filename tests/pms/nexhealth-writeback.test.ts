import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Write-back v1 (§2.8) — the most dangerous writes in the product, driven
 * through a mocked transport. Pinned laws:
 *  - a create goes out ONLY into a slot THEIR slot engine says is open,
 *    and takes the operatory from the matching slot;
 *  - no slot match → refusal, and NO HTTP write happens;
 *  - patient creation refuses with NAMED missing fields (email/DOB/phone)
 *    rather than inventing data, and rides return_existing_if_match;
 *  - cancel is the only status write; the rest are typed NOT-SUPPORTED;
 *  - "not synced with the PMS" is a typed WAITING state, not a failure.
 */

const state = {
  slots: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ method: string; path: string; params: Record<string, unknown>; body: Record<string, unknown> }>,
  writeResult: null as unknown,
  writeError: null as string | null,
  providers: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/nexhealth', () => ({
  nexGetAll: vi.fn(async () => state.providers),
  listLocations: vi.fn(async () => []),
  listAppointmentTypes: vi.fn(async () => []),
  listOperatories: vi.fn(async () => []),
  listAppointmentSlots: vi.fn(async () => state.slots),
  nexWrite: vi.fn(async (method: string, path: string, params: Record<string, unknown>, body: Record<string, unknown>) => {
    if (state.writeError) throw new Error(state.writeError)
    state.writes.push({ method, path, params, body })
    return state.writeResult
  }),
}))

import { NexHealthProvider } from '@/lib/services/pms/nexhealth'
import { PmsWriteWaitingError, PmsWriteNotSupportedError } from '@/lib/services/pms/provider'

const START = new Date('2026-08-12T14:00:00.000Z')

function provider() {
  return new NexHealthProvider({ subdomain: 'sub', locationId: 353605, env: 'sandbox' })
}

beforeEach(() => {
  state.slots = [
    { time: '2026-08-12T10:00:00.000-04:00', end_time: '2026-08-12T10:30:00.000-04:00', operatory_id: 285050 },
  ]
  state.writes = []
  state.writeResult = { appt: { id: 777 } }
  state.writeError = null
  state.providers = [{ id: 42, inactive: false }]
})

describe('createAppointment — only into a slot THEIR engine confirms', () => {
  it('books into the matching slot and carries its operatory; patient comms stay ours', async () => {
    const r = await provider().createAppointment({
      patientExternalId: '99',
      startTime: START, // 14:00Z === 10:00 -04:00
      endTime: new Date('2026-08-12T14:30:00.000Z'),
      providerExternalId: '42',
      note: null,
    })
    expect(r.externalId).toBe('777')
    expect(state.writes).toHaveLength(1)
    const w = state.writes[0]
    expect(w.method).toBe('POST')
    expect(w.params.notify_patient).toBe(false)
    const appt = w.body.appt as Record<string, unknown>
    expect(appt.operatory_id).toBe(285050)
    expect(appt.patient_id).toBe(99)
    expect(appt.provider_id).toBe(42)
    expect('appointment_type_id' in appt).toBe(false) // v1: typeless on purpose
    expect(String(appt.note)).toContain('DreamCRM')
  })

  it('REFUSES when their schedule shows no open slot at that time — and never writes', async () => {
    state.slots = [] // their engine says: nothing open
    await expect(
      provider().createAppointment({ patientExternalId: '99', startTime: START, providerExternalId: '42' }),
    ).rejects.toThrow(/doesn.t show this time as open/i)
    expect(state.writes).toHaveLength(0)
  })

  it('truncates the EHR note to 128 chars (their hard limit)', async () => {
    const r = await provider().createAppointment({
      patientExternalId: '99',
      startTime: START,
      providerExternalId: '42',
      note: 'x'.repeat(500),
    })
    expect(r.externalId).toBe('777')
    const appt = state.writes[0].body.appt as Record<string, unknown>
    expect(String(appt.note).length).toBeLessThanOrEqual(128)
  })

  it('no synced provider yet → WAITING, not a burned failure', async () => {
    state.providers = []
    await expect(
      provider().createAppointment({ patientExternalId: '99', startTime: START, providerExternalId: null }),
    ).rejects.toBeInstanceOf(PmsWriteWaitingError)
  })
})

describe('createPatient — named missing fields, dedupe-safe', () => {
  const FULL = {
    firstName: 'Maya',
    lastName: 'Ruiz',
    email: 'maya@fixture-mail.com',
    phone: '2125550188',
    dateOfBirth: '1990-01-01',
  }

  it('creates with return_existing_if_match so a matching chart is reused, never duplicated', async () => {
    state.writeResult = { user: { id: 5001 } }
    const r = await provider().createPatient(FULL)
    expect(r.externalId).toBe('5001')
    const w = state.writes[0]
    expect(w.body.return_existing_if_match).toBe(true)
    expect((w.body.provider as Record<string, unknown>).provider_id).toBe(42)
  })

  it('refuses with the NAMED missing fields — no HTTP, no invented data', async () => {
    await expect(provider().createPatient({ ...FULL, email: null, dateOfBirth: null })).rejects.toThrow(
      /an email.*a date of birth/i,
    )
    expect(state.writes).toHaveLength(0)
  })
})

describe('updateAppointment — cancel only; typed lanes for the rest', () => {
  it('cancel PATCHes cancelled:true', async () => {
    state.writeResult = { appt: { id: 777, cancelled: true } }
    await provider().updateAppointment('777', { status: 'cancelled' })
    const w = state.writes[0]
    expect(w.method).toBe('PATCH')
    expect(w.path).toBe('appointments/777')
    expect((w.body.appt as Record<string, unknown>).cancelled).toBe(true)
  })

  it('no_show / completed have no NexHealth vocabulary → NOT-SUPPORTED (skipped, not error)', async () => {
    await expect(provider().updateAppointment('777', { status: 'no_show' })).rejects.toBeInstanceOf(
      PmsWriteNotSupportedError,
    )
    await expect(provider().updateAppointment('777', { status: 'completed' })).rejects.toBeInstanceOf(
      PmsWriteNotSupportedError,
    )
    expect(state.writes).toHaveLength(0)
  })

  it('"not synced with the PMS" becomes the WAITING state (their server sleeps at night)', async () => {
    state.writeError = 'Cannot update appointment because it is not synced with the PMS and/or a live client'
    await expect(provider().updateAppointment('777', { status: 'cancelled' })).rejects.toBeInstanceOf(
      PmsWriteWaitingError,
    )
  })
})
