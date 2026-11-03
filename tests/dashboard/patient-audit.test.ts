import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * auditUpcomingDay — the per-patient audit of tomorrow's schedule. Flags:
 * unconfirmed / no intake / balance / unreachable / new patient /
 * lapsed-returning / pending deposit / birthday. Clean visits don't surface;
 * visitCount still counts them.
 */

const state = {
  appointments: [] as unknown[],
  submitted: [] as Array<{ patientId: string }>,
  lastVisits: [] as Array<{ patientId: string; last: Date }>,
  deposits: [] as Array<{ appointmentId: string; amountCents: number }>,
}

const intakeDoor = { open: true }
const insuranceDoor = { open: false }
const latestChecks = new Map<string, { checkedAt: Date }>()
vi.mock('@/lib/services/feature-switches', () => ({
  getFeatureSwitchState: async () => ({ intake_forms: intakeDoor.open, insurance: insuranceDoor.open }),
}))
vi.mock('@/lib/services/insurance-eligibility', () => ({
  getLatestInsuranceChecksForPatients: vi.fn(async () => latestChecks),
}))
vi.mock('@/lib/db', () => {
  const makeThenable = (resolve: () => unknown) => {
    const chain: Record<string, unknown> = {
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      groupBy: () => chain,
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onF, onR),
    }
    return chain
  }
  return {
    db: {
      select: () => ({
        from: (table: unknown) => {
          if (table === 'appointment_first') {
            /* unreachable marker */
          }
          if (table === 'appointment') {
            // First appointment query returns the day's schedule; the grouped
            // last-visit query ALSO starts from appointment — distinguish by
            // call order (schedule first).
            if (!apptServed) {
              apptServed = true
              return makeThenable(() => state.appointments)
            }
            return makeThenable(() => state.lastVisits)
          }
          if (table === 'form_submission') return makeThenable(() => state.submitted)
          if (table === 'booking_deposit') return makeThenable(() => state.deposits)
          return makeThenable(() => [])
        },
      }),
      selectDistinct: () => ({
        from: () => makeThenable(() => state.submitted),
      }),
    },
    schema: {
      appointment: 'appointment',
      patient: 'patient',
      clinicProvider: 'clinic_provider',
      formSubmission: 'form_submission',
      bookingDeposit: 'booking_deposit',
    },
  }
})

let apptServed = false

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn((x) => x),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  // The last-visit lookup uses drizzle's max() so the aggregate keeps the
  // column's driver mapper (see tests/guards/timestamp-aggregate-mapping).
  // This mock only has to EXIST — the rows come from the db mock below.
  max: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))
vi.mock('@/lib/services/clinic-cadence', () => ({
  getClinicCadence: vi.fn(async () => ({ recallMonths: 6, lapsedMonths: 18 })),
}))

import { auditUpcomingDay } from '@/lib/services/patient-audit'

const NOW = new Date('2026-06-10T15:00:00Z')
const TOMORROW = new Date('2026-06-11T15:00:00Z')
const YEARS_AGO = new Date('2024-01-10T15:00:00Z')
const MONTHS_AGO = new Date('2026-02-10T15:00:00Z')

function appt(over: Record<string, unknown> = {}) {
  return {
    appointmentId: 'a1',
    patientId: 'p1',
    startTime: TOMORROW,
    type: 'cleaning',
    status: 'confirmed',
    providerName: 'Dr. Patel',
    firstName: 'Mia',
    lastName: 'Hayes',
    email: 'mia@example.com',
    phone: '555-1212',
    dateOfBirth: '1988-03-12',
    balance: 0,
    ...over,
  }
}

beforeEach(() => {
  state.appointments = []
  state.submitted = []
  state.lastVisits = []
  state.deposits = []
  apptServed = false
  insuranceDoor.open = false
  latestChecks.clear()
  vi.clearAllMocks()
})

describe('auditUpcomingDay', () => {
  it('returns an empty audit when tomorrow has no visits', async () => {
    const r = await auditUpcomingDay('org_1', { now: NOW })
    expect(r.visitCount).toBe(0)
    expect(r.items).toEqual([])
  })

  it('a fully-prepped returning patient does NOT surface (but counts)', async () => {
    state.appointments = [appt()]
    state.submitted = [{ patientId: 'p1' }]
    state.lastVisits = [{ patientId: 'p1', last: MONTHS_AGO }]
    const r = await auditUpcomingDay('org_1', { now: NOW })
    expect(r.visitCount).toBe(1)
    expect(r.items).toEqual([])
  })

  it('flags unconfirmed + balance + missing intake with plain-language reasons', async () => {
    state.appointments = [appt({ status: 'scheduled', balance: 35000 })]
    state.lastVisits = [{ patientId: 'p1', last: MONTHS_AGO }]
    const r = await auditUpcomingDay('org_1', { now: NOW })
    expect(r.items).toHaveLength(1)
    const keys = r.items[0]!.flags.map((f) => f.key)
    expect(keys).toContain('unconfirmed')
    expect(keys).toContain('balance')
    expect(keys).toContain('no_intake')
    expect(r.items[0]!.flags.find((f) => f.key === 'balance')!.label).toContain('$350')
  })

  it('no intake nag while the Intake Forms door is closed — a module the practice never opened (law 1, verification round)', async () => {
    state.appointments = [appt({ status: 'scheduled', balance: 35000 })]
    state.lastVisits = [{ patientId: 'p1', last: MONTHS_AGO }]
    intakeDoor.open = false
    try {
      const r = await auditUpcomingDay('org_1', { now: NOW })
      const keys = r.items[0]!.flags.map((f) => f.key)
      expect(keys).not.toContain('no_intake')
      expect(keys).toContain('balance')
    } finally {
      intakeDoor.open = true
    }
  })

  it('flags a brand-new patient and a lapsed-returning one differently', async () => {
    state.appointments = [
      appt({ appointmentId: 'a1', patientId: 'p_new', firstName: 'Liam', lastName: 'Brooks' }),
      appt({ appointmentId: 'a2', patientId: 'p_lapsed', firstName: 'Aiden', lastName: 'Kim' }),
    ]
    state.submitted = [{ patientId: 'p_new' }, { patientId: 'p_lapsed' }]
    state.lastVisits = [{ patientId: 'p_lapsed', last: YEARS_AGO }] // p_new has none
    const r = await auditUpcomingDay('org_1', { now: NOW })
    const byPatient = new Map(r.items.map((i) => [i.patientId, i.flags.map((f) => f.key)]))
    expect(byPatient.get('p_new')).toContain('new_patient')
    expect(byPatient.get('p_lapsed')).toContain('lapsed_returning')
    expect(byPatient.get('p_lapsed')).not.toContain('new_patient')
  })

  it('flags an unreachable patient (no email AND no phone) + a pending deposit', async () => {
    state.appointments = [appt({ email: null, phone: null })]
    state.submitted = [{ patientId: 'p1' }]
    state.lastVisits = [{ patientId: 'p1', last: MONTHS_AGO }]
    state.deposits = [{ appointmentId: 'a1', amountCents: 5000 }]
    const r = await auditUpcomingDay('org_1', { now: NOW })
    const keys = r.items[0]!.flags.map((f) => f.key)
    expect(keys).toContain('unreachable')
    expect(keys).toContain('deposit_pending')
    expect(r.items[0]!.flags.find((f) => f.key === 'deposit_pending')!.label).toContain('$50')
  })

  describe('insurance_stale', () => {
    const flagsFor = async (over: Record<string, unknown>) => {
      state.appointments = [appt({ status: 'confirmed', ...over })]
      state.submitted = [{ patientId: 'p1' }]
      state.lastVisits = [{ patientId: 'p1', last: MONTHS_AGO }]
      const r = await auditUpcomingDay('org_1', { now: NOW })
      return r.items[0]?.flags.filter((f) => f.key === 'insurance_stale') ?? []
    }

    it('never checked: asks for a run, with the door', async () => {
      insuranceDoor.open = true
      const f = await flagsFor({ policyNumber: 'W123' })
      expect(f).toHaveLength(1)
      expect(f[0]!.label).toMatch(/never checked/)
      expect(f[0]!.href).toBe('/insurance?patient=p1')
    })

    it('checked lately: no flag', async () => {
      insuranceDoor.open = true
      latestChecks.set('p1', { checkedAt: new Date('2026-06-01T15:00:00Z') })
      expect(await flagsFor({ policyNumber: 'W123' })).toHaveLength(0)
    })

    it('checked 30+ days ago: stale flag', async () => {
      insuranceDoor.open = true
      latestChecks.set('p1', { checkedAt: new Date('2026-04-01T15:00:00Z') })
      const f = await flagsFor({ policyNumber: 'W123' })
      expect(f[0]!.label).toMatch(/30\+ days/)
    })

    it('omitted when the switch is off, or when no card is on file', async () => {
      expect(await flagsFor({ policyNumber: 'W123' })).toHaveLength(0)
      insuranceDoor.open = true
      expect(await flagsFor({ policyNumber: null })).toHaveLength(0)
    })
  })
})
