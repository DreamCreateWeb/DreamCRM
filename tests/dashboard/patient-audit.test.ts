import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * auditUpcomingDay — the per-patient audit of tomorrow's schedule. Flags:
 * unconfirmed / no intake / balance / unreachable / new patient /
 * lapsed-returning / pending deposit / birthday. Clean visits don't surface;
 * visitCount still counts them.
 */

const state = {
  appointments: [] as unknown[],
  submitted: [] as Array<{ patientId: string; formTemplateId: string | null; last: Date }>,
  lastVisits: [] as Array<{ patientId: string; last: Date }>,
  deposits: [] as Array<{ appointmentId: string; amountCents: number }>,
}

// A submission row as the intake-on-file read (ML-30) selects it: the latest
// submittedAt per patient and form. Any date inside the refresh window reads
// as "on file" because the test seeds no form templates.
const sub = (patientId: string) => ({ patientId, formTemplateId: null, last: new Date('2026-06-01T12:00:00Z') })
const intakeDoor = { open: true }
const insuranceDoor = { open: false }
const latestChecks = new Map<string, { checkedAt: Date }>()
vi.mock('@/lib/services/feature-switches', () => ({
  getFeatureSwitchState: async () => ({ intake_forms: intakeDoor.open, insurance: insuranceDoor.open }),
}))
vi.mock('@/lib/services/insurance-eligibility', () => ({
  getLatestInsuranceChecksForPatients: vi.fn(async () => latestChecks),
}))
// ML-50b: the card on file is the primary slot in patient_insurance
// (primaryCardsByPatient; its own query is pinned in tests/insurance/ml50-plans.test.ts).
// A fixture appointment's `policyNumber` stands for that slot's member id.
vi.mock('@/lib/services/insurance-eligibility/plans', () => ({
  primaryCardsByPatient: vi.fn(async (_org: string, ids: string[]) => {
    const out = new Map<string, { provider: string | null; policyNumber: string | null; groupNumber: string | null }>()
    for (const r of state.appointments as Array<{ patientId: string; policyNumber?: string | null }>) {
      if (ids.includes(r.patientId) && r.policyNumber) out.set(r.patientId, { provider: null, policyNumber: r.policyNumber, groupNumber: null })
    }
    return out
  }),
}))
// The chair read (ML-27): the cached intake alerts, keyed by appointment. Its
// own query is pinned in tests/intake-forms/intake-alerts-read.test.ts.
const intakeAlerts = new Map<string, { submissionId: string; alerts: string[] }>()
vi.mock('@/lib/services/intake-summary', () => ({
  getIntakeAlertsForAppointments: vi.fn(async () => intakeAlerts),
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
        from: (tableOrName: unknown) => {
          // The audit's own reads come through the mocked `schema` (string
          // names); the intake-on-file read (ML-30) imports the real table,
          // which carries its name under drizzle's symbol.
          const table =
            typeof tableOrName === 'string'
              ? tableOrName
              : ((tableOrName as Record<symbol, unknown> | null)?.[Symbol.for('drizzle:Name')] as string | undefined)
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

// drizzle's operators are the real ones: the rows come from the db mock below,
// which ignores every where clause, and the audit path now reaches modules
// (the intake-on-file read, ML-30) that use desc()/isNull() the old hand-rolled
// mock did not export. max() stays real so the aggregate keeps the column's
// driver mapper (see tests/guards/timestamp-aggregate-mapping).
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
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
  intakeAlerts.clear()
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
    state.submitted = [sub('p1')]
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
    state.submitted = [sub('p_new'), sub('p_lapsed')]
    state.lastVisits = [{ patientId: 'p_lapsed', last: YEARS_AGO }] // p_new has none
    const r = await auditUpcomingDay('org_1', { now: NOW })
    const byPatient = new Map(r.items.map((i) => [i.patientId, i.flags.map((f) => f.key)]))
    expect(byPatient.get('p_new')).toContain('new_patient')
    expect(byPatient.get('p_lapsed')).toContain('lapsed_returning')
    expect(byPatient.get('p_lapsed')).not.toContain('new_patient')
  })

  it('flags an unreachable patient (no email AND no phone) + a pending deposit', async () => {
    state.appointments = [appt({ email: null, phone: null })]
    state.submitted = [sub('p1')]
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
      state.submitted = [sub('p1')]
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

describe('medical_alert — the chair read (ML-27)', () => {
  it('leads the flags with the alert text and a door to the submission; no cached alerts → no flag', async () => {
    state.appointments = [
      appt({ appointmentId: 'a1', patientId: 'p1', status: 'scheduled' }),
      appt({ appointmentId: 'a2', patientId: 'p2', firstName: 'Noah', lastName: 'Park', status: 'scheduled' }),
    ]
    state.submitted = [sub('p1'), sub('p2')]
    state.lastVisits = [{ patientId: 'p1', last: MONTHS_AGO }, { patientId: 'p2', last: MONTHS_AGO }]
    intakeAlerts.set('a1', { submissionId: 'sub_1', alerts: ['Allergic to penicillin', 'Takes warfarin (blood thinner)'] })
    const r = await auditUpcomingDay('org_1', { now: NOW })
    const mia = r.items.find((i) => i.patientId === 'p1')!
    expect(mia.flags[0]).toEqual({
      key: 'medical_alert',
      label: 'Heads-up from their intake: Allergic to penicillin · Takes warfarin (blood thinner)',
      href: '/intake-forms/submissions/sub_1',
    })
    const noah = r.items.find((i) => i.patientId === 'p2')!
    expect(noah.flags.map((f) => f.key)).not.toContain('medical_alert')
  })

  it('never reads alerts while the Intake Forms door is closed', async () => {
    state.appointments = [appt({ status: 'scheduled' })]
    state.lastVisits = [{ patientId: 'p1', last: MONTHS_AGO }]
    intakeAlerts.set('a1', { submissionId: 'sub_1', alerts: ['Allergic to penicillin'] })
    intakeDoor.open = false
    try {
      const r = await auditUpcomingDay('org_1', { now: NOW })
      expect(r.items[0]!.flags.map((f) => f.key)).not.toContain('medical_alert')
    } finally {
      intakeDoor.open = true
    }
  })
})
