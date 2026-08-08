import { describe, it, expect } from 'vitest'
import { mapNexAppointmentStatus, NexHealthProvider } from '@/lib/services/pms/nexhealth'

/**
 * NexHealth adapter (onboarding overhaul §2.6). The pure status mapping is
 * pinned always; the LIVE suite runs only when NEXHEALTH_SANDBOX_API_KEY is
 * in the env (local verification against the sandbox demo practice — CI
 * skips it, network tests never gate the merge).
 */

describe('mapNexAppointmentStatus', () => {
  const future = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
  const past = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()

  it('cancelled/deleted beats everything', () => {
    expect(mapNexAppointmentStatus({ cancelled: true, checked_out: true, end_time: past })).toBe('cancelled')
    expect(mapNexAppointmentStatus({ deleted: true, end_time: future })).toBe('cancelled')
  })
  it('patient_missed → no_show', () => {
    expect(mapNexAppointmentStatus({ patient_missed: true, end_time: past })).toBe('no_show')
  })
  it('checked_out → completed; past end without flags → completed', () => {
    expect(mapNexAppointmentStatus({ checked_out: true, end_time: future })).toBe('completed')
    expect(mapNexAppointmentStatus({ end_time: past })).toBe('completed')
  })
  it('future: confirmed flags → confirmed, else scheduled', () => {
    expect(mapNexAppointmentStatus({ confirmed: true, end_time: future })).toBe('confirmed')
    expect(mapNexAppointmentStatus({ patient_confirmed: true, end_time: future })).toBe('confirmed')
    expect(mapNexAppointmentStatus({ end_time: future })).toBe('scheduled')
  })
  it('no end_time at all falls through to scheduled/confirmed, never completed', () => {
    expect(mapNexAppointmentStatus({})).toBe('scheduled')
    expect(mapNexAppointmentStatus({ confirmed: true })).toBe('confirmed')
  })
})

const LIVE = Boolean(process.env.NEXHEALTH_SANDBOX_API_KEY)
;(LIVE ? describe : describe.skip)('LIVE sandbox verification (needs NEXHEALTH_SANDBOX_API_KEY)', () => {
  const provider = () =>
    new NexHealthProvider({
      subdomain: 'dream-create-demo-practice',
      locationId: 353605,
      env: 'sandbox',
    })

  it('testConnection resolves the demo practice', async () => {
    const t = await provider().testConnection()
    expect(t.ok).toBe(true)
    expect(t.practiceTitle).toBeTruthy()
  }, 30_000)

  it('lists providers, patients, and appointments in normalized shapes', async () => {
    const p = provider()
    const providers = await p.listProviders()
    expect(providers.length).toBeGreaterThan(0)
    expect(providers[0].externalId).toMatch(/^\d+$/)
    expect(providers[0].displayName.length).toBeGreaterThan(0)

    const patients = await p.listPatients()
    expect(patients.length).toBeGreaterThan(50)
    const withDob = patients.find((x) => x.dateOfBirth)
    expect(withDob?.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const appts = await p.listAppointments({ since: new Date('2026-01-01') })
    expect(appts.length).toBeGreaterThan(100)
    expect(appts.every((a) => a.startTime instanceof Date && !Number.isNaN(a.startTime.getTime()))).toBe(true)
    for (const s of Array.from(new Set(appts.map((a) => a.status)))) {
      expect(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).toContain(s)
    }
  }, 120_000)

  it('recalls are honestly empty (no NexHealth endpoint)', async () => {
    expect(await provider().listRecalls()).toEqual([])
  })
})
