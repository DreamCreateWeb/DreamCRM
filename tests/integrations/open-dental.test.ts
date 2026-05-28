import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenDentalProvider, openDentalConfigured } from '@/lib/services/pms/open-dental'

// Mock fetch boundary — this is how we exercise the real Open Dental adapter
// without a live office (mirrors how Stripe Connect logic is unit-tested).
function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async (..._args: unknown[]) => ({
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }))
}

beforeEach(() => {
  process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY = 'devkey'
  delete process.env.PMS_OPEN_DENTAL_BASE_URL
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY
})

describe('openDentalConfigured', () => {
  it('reflects the developer key env', () => {
    expect(openDentalConfigured()).toBe(true)
    delete process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY
    expect(openDentalConfigured()).toBe(false)
  })
})

describe('OpenDentalProvider auth', () => {
  it('throws without a developer key', () => {
    delete process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY
    expect(() => new OpenDentalProvider('cust')).toThrow(/DEVELOPER_KEY/)
  })

  it('sends the ODFHIR {dev}/{customer} header', async () => {
    const f = mockFetch([])
    vi.stubGlobal('fetch', f)
    await new OpenDentalProvider('custkey').listProviders()
    expect(f).toHaveBeenCalledTimes(1)
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('ODFHIR devkey/custkey')
  })
})

describe('OpenDentalProvider reads (normalization)', () => {
  it('normalizes patients via /patients/Simple — phone pref + balance + birthdate', async () => {
    const f = mockFetch([
      {
        PatNum: 42,
        FName: 'Mia',
        LName: 'Chen',
        Birthdate: '1990-04-15T00:00:00',
        Email: 'mia@example.com',
        WirelessPhone: '555-0001',
        HmPhone: '555-9999',
        Address: '1 Elm',
        City: 'Austin',
        State: 'TX',
        Zip: '78701',
        EstBalance: 125.5,
      },
    ])
    vi.stubGlobal('fetch', f)
    const [p] = await new OpenDentalProvider('k').listPatients()
    // Balance lives on /patients/Simple, not the plain /patients list.
    expect(f.mock.calls[0][0] as string).toContain('/patients/Simple')
    expect(p.externalId).toBe('42')
    expect(p.phone).toBe('555-0001') // wireless preferred over home
    expect(p.dateOfBirth).toBe('1990-04-15')
    expect(p.balanceCents).toBe(12550)
    expect(p.city).toBe('Austin')
  })

  it('paginates via Offset/Limit and stops on a short page', async () => {
    let call = 0
    const f = vi.fn(async (..._args: unknown[]) => {
      call++
      const body =
        call === 1
          ? Array.from({ length: 1000 }, (_, i) => ({ PatNum: i + 1, FName: 'A', LName: 'B' }))
          : [{ PatNum: 9999, FName: 'Z', LName: 'Z' }]
      return { ok: true, status: 200, json: async () => body, text: async () => '' }
    })
    vi.stubGlobal('fetch', f)
    const rows = await new OpenDentalProvider('k').listPatients()
    expect(rows).toHaveLength(1001)
    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[1][0] as string).toContain('Offset=1000')
  })

  it('maps appointment status + derives end time from the pattern', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { AptNum: 7, PatNum: 42, ProvNum: 3, AptDateTime: '2026-06-01 09:00:00', AptStatus: 'Complete', Pattern: 'XXXXXX', Note: 'cleaning' },
        { AptNum: 8, PatNum: 42, AptDateTime: '2026-06-02 10:00:00', AptStatus: 'Broken' },
        { AptNum: 9, PatNum: 42, AptDateTime: '2026-06-03 11:00:00', AptStatus: 'Scheduled' },
      ]),
    )
    const rows = await new OpenDentalProvider('k').listAppointments()
    expect(rows[0].status).toBe('completed')
    expect(rows[0].providerExternalId).toBe('3')
    // 6 pattern chars * 5 min = 30 min.
    expect(rows[0].endTime!.getTime() - rows[0].startTime.getTime()).toBe(30 * 60 * 1000)
    expect(rows[1].status).toBe('cancelled') // Broken → cancelled
    expect(rows[2].status).toBe('scheduled')
  })

  it('builds the provider display name and defaults role (Specialty is an office-specific DefNum)', async () => {
    vi.stubGlobal('fetch', mockFetch([{ ProvNum: 3, FName: 'Sara', LName: 'Reyes', Specialty: 264 }]))
    const [p] = await new OpenDentalProvider('k').listProviders()
    expect(p.externalId).toBe('3')
    expect(p.displayName).toBe('Sara Reyes')
    expect(p.role).toBe('dentist') // numeric Specialty isn't a portable label
  })

  it('listRecalls — maps fields, treats 0001-01-01 as null, surfaces IsDisabled', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { RecallNum: 1, PatNum: 20, DateDue: '0001-01-01', DatePrevious: '0001-01-01', RecallInterval: '6m', IsDisabled: 'false' },
        { RecallNum: 2, PatNum: 15, DateDue: '2026-09-30', DatePrevious: '2026-03-30', RecallInterval: '6m', IsDisabled: 'false' },
        { RecallNum: 3, PatNum: 10, DateDue: '2026-09-30', RecallInterval: '4m', IsDisabled: 'true' },
      ]),
    )
    const rows = await new OpenDentalProvider('k').listRecalls()
    expect(rows).toHaveLength(3)
    expect(rows[0].dueDate).toBeNull()
    expect(rows[0].previousDate).toBeNull()
    expect(rows[1].dueDate?.toISOString().slice(0, 10)).toBe('2026-09-30')
    expect(rows[1].patientExternalId).toBe('15')
    expect(rows[1].interval).toBe('6m')
    expect(rows[2].isDisabled).toBe(true)
  })

  it('throws on a non-200 response', async () => {
    vi.stubGlobal('fetch', mockFetch('Unauthorized', false, 401))
    await expect(new OpenDentalProvider('k').listPatients()).rejects.toThrow(/401/)
  })

  it('testConnection returns ok:false instead of throwing', async () => {
    vi.stubGlobal('fetch', mockFetch('boom', false, 500))
    const r = await new OpenDentalProvider('k').testConnection()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/500/)
  })
})

describe('OpenDentalProvider writes (sanctioned API)', () => {
  it('POSTs a patient and returns the new PatNum', async () => {
    const f = mockFetch({ PatNum: 1001 })
    vi.stubGlobal('fetch', f)
    const res = await new OpenDentalProvider('k').createPatient({ firstName: 'New', lastName: 'Patient', email: 'n@p.com' })
    expect(res.externalId).toBe('1001')
    const url = f.mock.calls[0][0] as string
    const init = f.mock.calls[0][1] as RequestInit
    expect(url).toContain('/patients')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.LName).toBe('Patient')
    expect(body.FName).toBe('New')
    expect(body.Email).toBe('n@p.com')
  })

  it('POSTs an appointment with the required Op, a 5-min pattern, and returns the AptNum', async () => {
    const f = mockFetch({ AptNum: 5005 })
    vi.stubGlobal('fetch', f)
    const start = new Date('2026-06-01T09:00:00Z')
    const res = await new OpenDentalProvider('k', { defaultOperatoryNum: 5, timeZone: 'UTC' }).createAppointment({
      patientExternalId: '42',
      startTime: start,
      endTime: new Date(start.getTime() + 30 * 60 * 1000),
      providerExternalId: '3',
      note: 'checkup',
    })
    expect(res.externalId).toBe('5005')
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body.PatNum).toBe(42)
    expect(body.AptStatus).toBe('Scheduled')
    expect(body.Op).toBe(5) // required by Open Dental
    expect(body.Pattern).toBe('XXXXXX') // 30 min → 6 chars
    expect(body.ProvNum).toBe(3)
    expect(body.AptDateTime).toBe('2026-06-01 09:00:00')
  })

  it('refuses to create an appointment when no operatory is configured', async () => {
    vi.stubGlobal('fetch', mockFetch({ AptNum: 1 }))
    await expect(
      new OpenDentalProvider('k').createAppointment({ patientExternalId: '42', startTime: new Date() }),
    ).rejects.toThrow(/operatory/i)
  })

  it('formats AptDateTime in the office timezone (wall-clock, no TZ)', async () => {
    const f = mockFetch({ AptNum: 1 })
    vi.stubGlobal('fetch', f)
    // 13:00 UTC in America/New_York (EDT, summer) is 09:00 local.
    await new OpenDentalProvider('k', { defaultOperatoryNum: 2, timeZone: 'America/New_York' }).createAppointment({
      patientExternalId: '1',
      startTime: new Date('2026-07-01T13:00:00Z'),
    })
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
    expect(body.AptDateTime).toBe('2026-07-01 09:00:00')
    expect(body.Op).toBe(2)
  })

  it('PUTs a cancellation (AptStatus=Broken) to an existing appointment', async () => {
    const f = mockFetch({ AptNum: 57, AptStatus: 'Broken' })
    vi.stubGlobal('fetch', f)
    await new OpenDentalProvider('k').updateAppointment('57', { status: 'cancelled' })
    const url = f.mock.calls[0][0] as string
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(url).toContain('/appointments/57')
    expect(JSON.parse(init.body as string).AptStatus).toBe('Broken')
  })

  it('maps no_show → Broken and completed → Complete on update', async () => {
    const f = mockFetch({})
    vi.stubGlobal('fetch', f)
    const od = new OpenDentalProvider('k')
    await od.updateAppointment('1', { status: 'no_show' })
    await od.updateAppointment('2', { status: 'completed' })
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string).AptStatus).toBe('Broken')
    expect(JSON.parse((f.mock.calls[1][1] as RequestInit).body as string).AptStatus).toBe('Complete')
  })
})
