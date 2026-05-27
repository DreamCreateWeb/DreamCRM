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
  it('normalizes patients — phone preference + dollars→cents + birthdate', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
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
      ]),
    )
    const [p] = await new OpenDentalProvider('k').listPatients()
    expect(p.externalId).toBe('42')
    expect(p.phone).toBe('555-0001') // wireless preferred over home
    expect(p.dateOfBirth).toBe('1990-04-15')
    expect(p.balanceCents).toBe(12550)
    expect(p.city).toBe('Austin')
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

  it('maps provider specialty to our role vocabulary', async () => {
    vi.stubGlobal('fetch', mockFetch([{ ProvNum: 3, FName: 'Sara', LName: 'Reyes', Specialty: 'Dental Hygienist' }]))
    const [p] = await new OpenDentalProvider('k').listProviders()
    expect(p.externalId).toBe('3')
    expect(p.displayName).toBe('Sara Reyes')
    expect(p.role).toBe('hygienist')
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

  it('POSTs an appointment with a 5-min pattern + returns the AptNum', async () => {
    const f = mockFetch({ AptNum: 5005 })
    vi.stubGlobal('fetch', f)
    const start = new Date('2026-06-01T09:00:00')
    const res = await new OpenDentalProvider('k').createAppointment({
      patientExternalId: '42',
      startTime: start,
      endTime: new Date(start.getTime() + 30 * 60 * 1000),
      providerExternalId: '3',
      note: 'checkup',
    })
    expect(res.externalId).toBe('5005')
    const init = f.mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.PatNum).toBe(42)
    expect(body.AptStatus).toBe('Scheduled')
    expect(body.Pattern).toBe('XXXXXX') // 30 min → 6 chars
    expect(body.ProvNum).toBe(3)
    expect(body.AptDateTime).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  })
})
