import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * submitAppointmentRequest — the public /book request form when a clinic has
 * turned OFF online self-scheduling (Settings → Practice). It must:
 *   - require an email (the reach-back channel) + a name; reject a bad email
 *   - NOT create an appointment — instead land an INBOUND message on the
 *     patient's inbox thread (channel='email' so the reply composer defaults
 *     to the email they gave)
 *   - dedupe an existing patient by email/phone rather than fork a duplicate
 *   - silently drop a bot (honeypot) without writing anything
 */

const insertedRows: Array<{ table: string; values: any }> = []
const updatedPatients: any[] = []
const selectStubs = { patient: null as { id: string; firstName?: string; lastName?: string } | null }

function chain(returnFn: () => unknown) {
  const obj: any = {}
  const pass = () => obj
  obj.from = pass
  obj.where = pass
  obj.limit = async () => {
    const out = returnFn()
    return out ? [out] : []
  }
  return obj
}

vi.mock('@/lib/db', async () => {
  const { patient } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      select: () => chain(() => selectStubs.patient),
      insert: (table: unknown) => ({
        values: async (vals: unknown) => {
          insertedRows.push({ table: table === patient ? 'patient' : 'other', values: vals })
        },
      }),
      update: () => ({
        set: (vals: unknown) => ({
          where: async () => {
            updatedPatients.push(vals)
          },
        }),
      }),
    },
  }
})

// Org resolves from the public slug; 'unknown'/missing → null (the not-found guard).
vi.mock('@/lib/services/clinic-site', () => ({
  publicSiteUrl: () => 'https://clinic.test',
  resolveClinicOrgIdBySlug: async (slug?: string) => (slug && slug !== 'unknown' ? 'org_1' : null),
}))

// Import-safety stubs for the rest of the actions module's graph (these are
// only exercised by the booking/contact actions, not this one).
vi.mock('@/lib/email', () => ({
  sendContactRequestEmail: vi.fn(),
  sendBookingConfirmationEmail: vi.fn(),
  sendNotificationEmail: vi.fn(),
}))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/booking', () => ({ isSlotAvailable: vi.fn(async () => true), SLOT_MINUTES: 30 }))
vi.mock('@/lib/services/forms', () => ({ getDefaultFormTemplate: vi.fn(async () => null) }))

interface InboundArg {
  organizationId: string
  patientId: string
  body: string
  channel: string
}
const { recordInboundMessageMock } = vi.hoisted(() => ({
  recordInboundMessageMock: vi.fn(
    async (_input: { organizationId: string; patientId: string; body: string; channel: string }) => ({
      threadId: 'pthread_x',
      messageId: 'pmsg_x',
    }),
  ),
}))
vi.mock('@/lib/services/patient-messaging', () => ({
  recordInboundMessage: recordInboundMessageMock,
}))

/** First (and only) inbound-message arg, with a clear failure if uncalled. */
function inboundArg(): InboundArg {
  const a = recordInboundMessageMock.mock.calls[0]?.[0]
  if (!a) throw new Error('recordInboundMessage was not called')
  return a
}

import { submitAppointmentRequest } from '@/app/site/[slug]/actions'

function form(fields: Record<string, string | null>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
  return fd
}

const VALID = {
  slug: 'acme',
  firstName: 'Jordan',
  lastName: 'Park',
  email: 'jordan@example.com',
}

beforeEach(() => {
  insertedRows.length = 0
  updatedPatients.length = 0
  selectStubs.patient = null
  vi.clearAllMocks()
  recordInboundMessageMock.mockResolvedValue({ threadId: 'pthread_x', messageId: 'pmsg_x' })
})

describe('submitAppointmentRequest', () => {
  it('rejects an unresolvable clinic (unknown slug)', async () => {
    await expect(submitAppointmentRequest(form({ ...VALID, slug: 'unknown' }))).rejects.toThrow(/clinic/i)
    expect(recordInboundMessageMock).not.toHaveBeenCalled()
    expect(insertedRows).toHaveLength(0)
  })

  it('requires a first and last name', async () => {
    await expect(submitAppointmentRequest(form({ slug: 'acme', email: 'a@b.com' }))).rejects.toThrow(/name/i)
    expect(recordInboundMessageMock).not.toHaveBeenCalled()
  })

  it('requires an email (the reach-back channel)', async () => {
    await expect(
      submitAppointmentRequest(form({ slug: 'acme', firstName: 'Jo', lastName: 'P' })),
    ).rejects.toThrow(/email/i)
    expect(recordInboundMessageMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', async () => {
    await expect(
      submitAppointmentRequest(form({ ...VALID, email: 'not-an-email' })),
    ).rejects.toThrow(/email/i)
    expect(recordInboundMessageMock).not.toHaveBeenCalled()
  })

  it('silently drops a bot (honeypot) — no patient, no message', async () => {
    await submitAppointmentRequest(form({ ...VALID, company_website: 'spam' }))
    expect(insertedRows).toHaveLength(0)
    expect(recordInboundMessageMock).not.toHaveBeenCalled()
  })

  it('creates a lead-lifecycle patient and lands an inbound EMAIL-channel message', async () => {
    await submitAppointmentRequest(
      form({
        ...VALID,
        phone: '(512) 555-0143',
        reason: 'Cleaning & exam',
        preferredTimes: 'Weekday mornings',
        notes: "It's been a couple years — hoping to get established.",
      }),
    )

    // A new patient row, sourced + lifecycle'd as a website request.
    const pat = insertedRows.find((r) => r.table === 'patient')
    expect(pat).toBeTruthy()
    expect(pat!.values).toMatchObject({
      organizationId: 'org_1',
      firstName: 'Jordan',
      lastName: 'Park',
      email: 'jordan@example.com',
      phone: '(512) 555-0143',
      source: 'website_request',
      lifecycle: 'lead',
    })

    // Exactly one inbound message, on the email channel, threaded to the new patient.
    expect(recordInboundMessageMock).toHaveBeenCalledTimes(1)
    const arg = inboundArg()
    expect(arg.organizationId).toBe('org_1')
    expect(arg.patientId).toBe(pat!.values.id)
    expect(arg.channel).toBe('email')
    // The body leads with a scannable line and carries the structured request.
    expect(arg.body).toMatch(/New appointment request via the website/i)
    expect(arg.body).toContain('Looking for: Cleaning & exam')
    expect(arg.body).toContain('Preferred times: Weekday mornings')
    expect(arg.body).toContain('hoping to get established')
  })

  it('dedupes an existing patient (same contact info AND same name) instead of forking a duplicate', async () => {
    selectStubs.patient = { id: 'pat_existing', firstName: 'Jordan', lastName: 'Park' }
    await submitAppointmentRequest(form({ ...VALID }))

    // No new patient row — just an activity bump on the existing one.
    expect(insertedRows.find((r) => r.table === 'patient')).toBeUndefined()
    expect(updatedPatients).toHaveLength(1)

    expect(recordInboundMessageMock).toHaveBeenCalledTimes(1)
    expect(inboundArg().patientId).toBe('pat_existing')
    // No family flag for a plain repeat requester.
    expect(inboundArg().body).not.toContain('Heads-up')
  })

  it('gives a DIFFERENT-named requester on the same email their own record + flags likely family', async () => {
    // The 2026-07-22 mixup: a spouse submits with the shared family email —
    // must NOT thread onto the existing patient's chart.
    selectStubs.patient = { id: 'pat_maria', firstName: 'Maria', lastName: 'Aguilera' }
    await submitAppointmentRequest(
      form({ slug: 'acme', firstName: 'John', lastName: 'Aguilera', email: 'aguilera.family@example.com' }),
    )

    const pat = insertedRows.find((r) => r.table === 'patient')
    expect(pat).toBeTruthy()
    expect(pat!.values).toMatchObject({ firstName: 'John', lastName: 'Aguilera' })
    // The thread lands on JOHN's new record, never Maria's.
    expect(inboundArg().patientId).toBe(pat!.values.id)
    // …and the front desk is told exactly what happened.
    expect(inboundArg().body).toContain('also on file for Maria Aguilera')
    expect(inboundArg().body).toContain('likely family')
  })

  it('omits optional lines from the body when not provided', async () => {
    await submitAppointmentRequest(form({ ...VALID }))
    const body: string = inboundArg().body
    expect(body).toMatch(/New appointment request via the website/i)
    expect(body).not.toContain('Looking for:')
    expect(body).not.toContain('Preferred times:')
  })
})
