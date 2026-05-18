import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track every call so we can assert insert/select payloads.
const insertedRows: Array<{ table: string; values: unknown }> = []
const selectStubs = {
  patient: null as { id: string } | null,
  profile: null as { email: string | null; displayName: string | null; phone?: string | null } | null,
}

function chain(returnFn: () => unknown) {
  const obj: any = {}
  const passthrough = () => obj
  obj.from = passthrough
  obj.where = passthrough
  obj.limit = async () => {
    const out = returnFn()
    return out ? [out] : []
  }
  return obj
}

vi.mock('@/lib/db', async () => {
  const { patient, appointment } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      select: (cols?: Record<string, unknown>) => {
        // Dispatch by selected columns — patient lookup vs profile lookup.
        if (cols && 'id' in cols && Object.keys(cols).length === 1) {
          return chain(() => selectStubs.patient)
        }
        return chain(() => selectStubs.profile)
      },
      insert: (table: unknown) => ({
        values: async (vals: unknown) => {
          let tableName = 'unknown'
          if (table === patient) tableName = 'patient'
          else if (table === appointment) tableName = 'appointment'
          insertedRows.push({ table: tableName, values: vals })
        },
      }),
    },
  }
})

vi.mock('@/lib/email', () => ({
  sendContactRequestEmail: vi.fn().mockResolvedValue(undefined),
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

import { submitContactRequest, submitBookingRequest } from '@/app/site/[slug]/actions'
import { sendContactRequestEmail, sendBookingConfirmationEmail } from '@/lib/email'

beforeEach(() => {
  insertedRows.length = 0
  selectStubs.patient = null
  selectStubs.profile = null
  vi.clearAllMocks()
})

describe('submitContactRequest', () => {
  function form(fields: Record<string, string | null>) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
    return fd
  }

  it('rejects missing orgId', async () => {
    await expect(
      submitContactRequest(form({ name: 'A', phone: '555' })),
    ).rejects.toThrow(/organization/i)
  })

  it('rejects missing name', async () => {
    await expect(
      submitContactRequest(form({ orgId: 'org_1', phone: '555' })),
    ).rejects.toThrow(/name/i)
  })

  it('rejects missing phone', async () => {
    await expect(
      submitContactRequest(form({ orgId: 'org_1', name: 'Jane' })),
    ).rejects.toThrow(/phone/i)
  })

  it('emails the clinic when profile.email is set', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental' }
    await submitContactRequest(
      form({
        orgId: 'org_1',
        name: 'Jane Doe',
        phone: '5551234',
        email: 'jane@example.com',
        message: 'Tooth hurts',
      }),
    )
    // Give the fire-and-forget .catch() a tick to settle
    await new Promise((r) => setTimeout(r, 0))
    expect(sendContactRequestEmail).toHaveBeenCalledWith(
      'clinic@x.com',
      expect.objectContaining({
        clinicName: 'X Dental',
        patientName: 'Jane Doe',
        phone: '5551234',
        email: 'jane@example.com',
        message: 'Tooth hurts',
      }),
    )
  })

  it('does not email when clinic has no email configured', async () => {
    selectStubs.profile = { email: null, displayName: 'X Dental' }
    await submitContactRequest(
      form({ orgId: 'org_1', name: 'Jane', phone: '555' }),
    )
    expect(sendContactRequestEmail).not.toHaveBeenCalled()
  })
})

describe('submitBookingRequest', () => {
  function form(fields: Record<string, string | null>) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
    return fd
  }

  const baseFields = {
    orgId: 'org_1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@x.com',
    phone: '555',
    type: 'cleaning',
    startTime: '2026-06-01T10:00',
    notes: null,
  }

  it('rejects missing orgId', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, orgId: null })),
    ).rejects.toThrow(/organization/i)
  })

  it('rejects missing first/last name', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, firstName: null })),
    ).rejects.toThrow(/name/i)
  })

  it('rejects missing startTime', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, startTime: null })),
    ).rejects.toThrow(/date/i)
  })

  it('rejects malformed startTime', async () => {
    await expect(
      submitBookingRequest(form({ ...baseFields, startTime: 'not-a-date' })),
    ).rejects.toThrow(/Invalid/i)
  })

  it('creates a new patient when none exists with that email', async () => {
    selectStubs.patient = null
    selectStubs.profile = null
    await submitBookingRequest(form(baseFields))
    const patientInsert = insertedRows.find((r) => r.table === 'patient')
    const appointmentInsert = insertedRows.find((r) => r.table === 'appointment')
    expect(patientInsert).toBeDefined()
    expect(appointmentInsert).toBeDefined()
    expect((patientInsert!.values as { firstName: string }).firstName).toBe('Jane')
  })

  it('reuses existing patient when email matches', async () => {
    selectStubs.patient = { id: 'pat_existing' }
    await submitBookingRequest(form(baseFields))
    const patientInsert = insertedRows.find((r) => r.table === 'patient')
    expect(patientInsert).toBeUndefined()
    const appointmentInsert = insertedRows.find((r) => r.table === 'appointment')
    expect(appointmentInsert).toBeDefined()
    expect((appointmentInsert!.values as { patientId: string }).patientId).toBe('pat_existing')
  })

  it('creates a new patient when no email is provided', async () => {
    await submitBookingRequest(form({ ...baseFields, email: null }))
    const patientInsert = insertedRows.find((r) => r.table === 'patient')
    expect(patientInsert).toBeDefined()
  })

  it('sends a booking confirmation email to the patient', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X Dental', phone: '555-clinic' }
    await submitBookingRequest(form(baseFields))
    await new Promise((r) => setTimeout(r, 0))
    expect(sendBookingConfirmationEmail).toHaveBeenCalledWith(
      'jane@x.com',
      expect.objectContaining({
        patientName: 'Jane Doe',
        clinicName: 'X Dental',
        appointmentType: 'cleaning',
      }),
    )
  })

  it('skips confirmation email when patient supplies no email', async () => {
    selectStubs.profile = { email: 'clinic@x.com', displayName: 'X', phone: null }
    await submitBookingRequest(form({ ...baseFields, email: null }))
    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled()
  })

  it('persists the appointment status as scheduled and the type as provided', async () => {
    await submitBookingRequest(form({ ...baseFields, type: 'root_canal' }))
    const appointmentInsert = insertedRows.find((r) => r.table === 'appointment')!
    const vals = appointmentInsert.values as { status: string; type: string; title: string }
    expect(vals.status).toBe('scheduled')
    expect(vals.type).toBe('root_canal')
    expect(vals.title).toMatch(/Root canal/)
  })
})
