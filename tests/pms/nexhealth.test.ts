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
    // Completeness slice: the sandbox seeds ~49 sms opt-outs and a handful of
    // insurance coverages — they must survive normalization.
    expect(patients.some((x) => x.smsOptOut)).toBe(true)
    const insured = patients.find((x) => x.insuranceProvider)
    expect(insured?.insurancePolicyNumber).toBeTruthy()

    const appts = await p.listAppointments({ since: new Date('2026-01-01') })
    expect(appts.length).toBeGreaterThan(100)
    expect(appts.every((a) => a.startTime instanceof Date && !Number.isNaN(a.startTime.getTime()))).toBe(true)
    for (const s of Array.from(new Set(appts.map((a) => a.status)))) {
      expect(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).toContain(s)
    }
    // Completeness slice: visit types resolve through the appointment_types
    // name map (sandbox rows all carry an appointment_type_id).
    expect(appts.some((a) => a.type != null)).toBe(true)

    // Chairs: the sandbox location has 3 operatories but OP3 is inactive —
    // the honest count is the 2 active ones.
    expect(await p.countChairs()).toBe(2)
  }, 120_000)

  it('recalls are honestly empty (no NexHealth endpoint)', async () => {
    expect(await provider().listRecalls()).toEqual([])
  })

  it('WRITE round-trip: dedupe-safe patient → slot-validated booking → cancel (sandbox only)', async () => {
    const p = provider()
    // Same details every run — return_existing_if_match returns the one
    // standing "Writeback Proof" chart instead of minting duplicates.
    const pat = await p.createPatient({
      firstName: 'Writeback',
      lastName: 'Proof',
      email: 'writeback.proof@fixture-mail.com',
      phone: '2125550188',
      dateOfBirth: '1990-01-01',
    })
    expect(pat.externalId).toMatch(/^\d+$/)

    // Book into a REAL open slot from their slot engine (next few days),
    // then cancel immediately — the sandbox stays clean.
    const { listAppointmentSlots } = await import('@/lib/nexhealth')
    let booked: string | null = null
    for (let ahead = 1; ahead <= 7 && !booked; ahead++) {
      const day = new Date(Date.now() + ahead * 24 * 3600_000).toISOString().slice(0, 10)
      const slots = await listAppointmentSlots('dream-create-demo-practice', 353605, 503128460, day, 1, { env: 'sandbox' })
      const slot = slots.find((s) => s.time && new Date(s.time).getTime() > Date.now())
      if (!slot?.time) continue
      const r = await p.createAppointment({
        patientExternalId: pat.externalId,
        startTime: new Date(slot.time),
        endTime: slot.end_time ? new Date(slot.end_time) : null,
        providerExternalId: '503128460',
        note: 'LIVE suite write round-trip (cancelled immediately)',
      })
      expect(r.externalId).toMatch(/^\d+$/)
      booked = r.externalId
      await p.updateAppointment(booked, { status: 'cancelled' })
    }
    expect(booked).not.toBeNull()
  }, 120_000)
})
