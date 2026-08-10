import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The completeness slice (onboarding overhaul — "if our platform has a slot
 * for it, it shows up there, cleanly"). Pure mappers pinned exactly, then
 * the adapter driven through a mocked transport to prove the new fields
 * land on the normalized shapes: insurance rides the same patient call,
 * visit types resolve through the day-cached name map, the PMS do-not-text
 * flag surfaces as smsOptOut, and the guarantor travels as an external id.
 */

const state = {
  patients: [] as unknown[],
  appointments: [] as unknown[],
  apptTypes: [] as unknown[],
  operatories: [] as unknown[],
  apptTypeFetches: 0,
}

vi.mock('@/lib/nexhealth', () => ({
  nexGetAll: vi.fn(async (resource: string) => {
    if (resource === 'patients') return state.patients
    if (resource === 'appointments') return state.appointments
    return []
  }),
  listLocations: vi.fn(async () => []),
  listAppointmentTypes: vi.fn(async () => {
    state.apptTypeFetches++
    return state.apptTypes
  }),
  listOperatories: vi.fn(async () => state.operatories),
}))

import {
  NexHealthProvider,
  mapNexApptTypeName,
  mapNexSpecialty,
  mapNexPreferredLanguage,
  pickPrimaryCoverage,
} from '@/lib/services/pms/nexhealth'

function provider() {
  // Unique subdomain per test run segment isn't needed — cache is keyed and
  // we reset fetch counters per test via distinct location ids.
  return new NexHealthProvider({ subdomain: 'sub', locationId: Math.floor(Math.random() * 1e9), env: 'sandbox' })
}

beforeEach(() => {
  state.patients = []
  state.appointments = []
  state.apptTypes = []
  state.operatories = []
  state.apptTypeFetches = 0
})

describe('mapNexApptTypeName — PMS names onto our visit-type vocabulary', () => {
  it('maps the sandbox catalog sensibly (most-specific keyword first)', () => {
    expect(mapNexApptTypeName('New patient exam and cleaning')).toBe('cleaning')
    expect(mapNexApptTypeName('Existing Patient Exam & Cleaning')).toBe('cleaning')
    expect(mapNexApptTypeName('Emergency visit')).toBe('emergency')
    expect(mapNexApptTypeName('Consultation')).toBe('consultation')
    expect(mapNexApptTypeName('Invisalign Consultation')).toBe('consultation')
    expect(mapNexApptTypeName('Filling')).toBe('filling')
    expect(mapNexApptTypeName('Extraction')).toBe('extraction')
    expect(mapNexApptTypeName('Root Canal')).toBe('root_canal')
    expect(mapNexApptTypeName('New Patient Appointment')).toBe('checkup')
  })

  it('unknown names are honestly other; empty/null is null (engine default applies)', () => {
    expect(mapNexApptTypeName('Botox')).toBe('other')
    expect(mapNexApptTypeName('')).toBeNull()
    expect(mapNexApptTypeName(null)).toBeNull()
  })
})

describe('mapNexSpecialty — coarse labels onto clinic_provider.role', () => {
  it('maps the vocabulary and defaults unknowns to specialist', () => {
    expect(mapNexSpecialty('Dentist')).toBe('dentist')
    expect(mapNexSpecialty('Hygienist')).toBe('hygienist')
    expect(mapNexSpecialty('Dental Assistant')).toBe('assistant')
    expect(mapNexSpecialty('Orthodontist')).toBe('specialist')
    expect(mapNexSpecialty(null)).toBeNull()
    expect(mapNexSpecialty('  ')).toBeNull()
  })
})

describe('mapNexPreferredLanguage', () => {
  it("recognizes Spanish in language or locale; English stays null", () => {
    expect(mapNexPreferredLanguage('Spanish', null)).toBe('es')
    expect(mapNexPreferredLanguage(null, 'es-MX')).toBe('es')
    expect(mapNexPreferredLanguage('es', null)).toBe('es')
    expect(mapNexPreferredLanguage('English', 'en-US')).toBeNull()
    expect(mapNexPreferredLanguage(null, null)).toBeNull()
    // 'es' must match as a token, not a substring of another word
    expect(mapNexPreferredLanguage('Estonian', null)).toBeNull()
  })
})

describe('pickPrimaryCoverage', () => {
  const NOW = new Date('2026-08-10T00:00:00Z')
  const plan = (name: string) => ({ name, group_num: 'g1', deleted_at: null })

  it('prefers lowest priority (0 = primary) among live coverages', () => {
    const picked = pickPrimaryCoverage(
      [
        { id: 2, priority: 1, subscriber_num: 'b', plan: plan('Cigna') },
        { id: 1, priority: 0, subscriber_num: 'a', plan: plan('Aetna') },
      ],
      NOW,
    )
    expect(picked?.plan?.name).toBe('Aetna')
  })

  it('skips deleted plans and expired windows; empty/absent is null', () => {
    expect(
      pickPrimaryCoverage(
        [{ id: 1, priority: 0, subscriber_num: 'a', plan: { name: 'Aetna', deleted_at: '2026-01-01' } }],
        NOW,
      ),
    ).toBeNull()
    expect(
      pickPrimaryCoverage(
        [{ id: 1, priority: 0, subscriber_num: 'a', expiration_date: '2025-01-01', plan: plan('Aetna') }],
        NOW,
      ),
    ).toBeNull()
    expect(pickPrimaryCoverage([], NOW)).toBeNull()
    expect(pickPrimaryCoverage(null, NOW)).toBeNull()
  })
})

describe('adapter mapping — the new fields land on the normalized shapes', () => {
  it('listPatients carries insurance, language, sms opt-out, and guarantor', async () => {
    state.patients = [
      {
        id: 1,
        first_name: 'Maya',
        last_name: 'Ruiz',
        email: 'maya@fixture-mail.com',
        guarantor_id: 9,
        unsubscribe_sms: true,
        preferred_language: 'Spanish',
        bio: { date_of_birth: '2015-03-01', phone_number: '5551234567' },
        balance: { amount: '12.50' },
        insurance_coverages: [
          { id: 5, priority: 0, subscriber_num: 'SN123', plan: { name: 'Guardian', group_num: 'GRP9', deleted_at: null } },
        ],
      },
    ]
    const [p] = await provider().listPatients()
    expect(p.insuranceProvider).toBe('Guardian')
    expect(p.insurancePolicyNumber).toBe('SN123')
    expect(p.insuranceGroupNumber).toBe('GRP9')
    expect(p.preferredLanguage).toBe('es')
    expect(p.smsOptOut).toBe(true)
    expect(p.guarantorExternalId).toBe('9')
    expect(p.balanceCents).toBe(1250)
  })

  it('no coverage / no flags degrade to nulls and false — never invented', async () => {
    state.patients = [{ id: 2, first_name: 'Sam', last_name: 'Lee', bio: {}, insurance_coverages: [] }]
    const [p] = await provider().listPatients()
    expect(p.insuranceProvider).toBeNull()
    expect(p.smsOptOut).toBe(false)
    expect(p.guarantorExternalId).toBeNull()
    expect(p.preferredLanguage).toBeNull()
  })

  it('listAppointments resolves the visit type through the cached name map', async () => {
    state.apptTypes = [{ id: 77, name: 'Root Canal' }]
    state.appointments = [
      { id: 10, patient_id: 1, appointment_type_id: 77, start_time: '2026-09-01T14:00:00Z', end_time: '2026-09-01T15:00:00Z' },
      { id: 11, patient_id: 1, appointment_type_id: 12345, start_time: '2026-09-01T15:00:00Z' },
    ]
    const p = provider()
    const appts = await p.listAppointments()
    expect(appts[0].type).toBe('root_canal')
    expect(appts[1].type).toBeNull() // unknown id → untyped, engine default
    // Second call within the day hits the cache — one fetch total.
    await p.listAppointments()
    expect(state.apptTypeFetches).toBe(1)
  })

  it('countChairs counts active operatories and answers null on none', async () => {
    state.operatories = [
      { id: 1, name: 'OP1', active: true },
      { id: 2, name: 'OP2', active: true },
      { id: 3, name: 'OP3', active: false },
    ]
    expect(await provider().countChairs()).toBe(2)
    state.operatories = []
    expect(await provider().countChairs()).toBeNull()
  })
})
