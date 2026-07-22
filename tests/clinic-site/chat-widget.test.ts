import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * submitChatMessage — the public "Message us" bubble's server action.
 * Spam guards (silent drops), org-from-slug, the chat_widget_enabled gate,
 * patient dedupe-by-email vs lead creation, and the inbound record
 * (channel=email so staff replies land in the visitor's inbox).
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ values: Record<string, unknown> }>,
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ values })
        },
      }),
      update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { state.updates.push(v) } }) }),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}))

vi.mock('@/lib/db/schema/clinic', () => ({
  patient: { id: 'id', organizationId: 'org', email: 'email', phone: 'phone' },
  appointment: {},
}))
vi.mock('@/lib/db/schema/platform', () => ({
  clinicProfile: { organizationId: 'org', chatWidgetEnabled: 'cwe' },
}))
vi.mock('@/lib/db/schema/auth', () => ({ organization: {} }))

const { botMock, rateMock } = vi.hoisted(() => ({
  botMock: vi.fn(() => false),
  rateMock: vi.fn(async () => true),
}))
vi.mock('@/lib/form-trust', () => ({ looksLikeBot: botMock }))
vi.mock('@/lib/services/rate-limit', () => ({ rateLimitPublicAction: rateMock }))

const { resolveSlugMock } = vi.hoisted(() => ({ resolveSlugMock: vi.fn(async () => 'org_1') }))
vi.mock('@/lib/services/clinic-site', () => ({
  resolveClinicOrgIdBySlug: resolveSlugMock,
  publicSiteUrl: vi.fn(() => 'https://acme.dreamcreatestudio.com'),
  appBaseUrl: vi.fn(() => 'https://www.dreamcreatestudio.com'),
}))

const { recordInboundMock } = vi.hoisted(() => ({
  recordInboundMock: vi.fn(async () => ({ threadId: 't1', messageId: 'm1' })),
}))
vi.mock('@/lib/services/patient-messaging', () => ({ recordInboundMessage: recordInboundMock }))

// The actions module pulls in the whole public-site action surface — stub the
// heavier siblings so importing it stays side-effect-free.
vi.mock('@/lib/email', () => ({
  sendContactRequestEmail: vi.fn(),
  sendBookingConfirmationEmail: vi.fn(),
  sendNotificationEmail: vi.fn(),
}))
vi.mock('@/lib/format-datetime', () => ({ formatClinicDateTime: vi.fn(() => 'Mon, Jan 5 at 2:00 PM') }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/email-automations', () => ({ renderAutomatedEmail: vi.fn() }))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))
vi.mock('@/lib/services/booking', () => ({
  getSlotsForDay: vi.fn(),
  isSlotAvailable: vi.fn(),
  insertAppointmentIfSlotFree: vi.fn(),
  SLOT_MINUTES: 30,
}))
vi.mock('@/lib/services/booking-deposits', () => ({ createBookingDepositSession: vi.fn() }))
vi.mock('@/lib/services/forms', () => ({ getDefaultFormTemplate: vi.fn() }))
vi.mock('@/lib/services/leads', () => ({ createLead: vi.fn() }))
vi.mock('@/lib/services/pms', () => ({ queueAppointmentWriteBack: vi.fn() }))
vi.mock('@/lib/types/lead-forms', () => ({ resolveLeadForm: vi.fn(() => []) }))
vi.mock('@/lib/types/visit-types', () => ({
  visitTypeDuration: vi.fn(() => 30),
  visitTypeDepositCents: vi.fn(() => 0),
}))
vi.mock('@/lib/services/rate-limit', () => ({ rateLimitPublicAction: rateMock }))

import { submitChatMessage } from '@/app/site/[slug]/actions'

function fd(over: Record<string, string> = {}): FormData {
  const f = new FormData()
  f.set('slug', 'acme-dental')
  f.set('name', 'Jordan Lee')
  f.set('email', 'jordan@example.com')
  f.set('message', 'Do you take Delta Dental?')
  for (const [k, v] of Object.entries(over)) f.set(k, v)
  return f
}

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
  botMock.mockReturnValue(false)
  rateMock.mockResolvedValue(true)
  resolveSlugMock.mockResolvedValue('org_1')
})

describe('submitChatMessage', () => {
  it('records an inbound email-channel message for a NEW visitor (lead patient created)', async () => {
    state.selectQueue.push([{ chatWidgetEnabled: true }]) // gate
    state.selectQueue.push([]) // no existing patient by email
    const r = await submitChatMessage(fd())
    expect(r).toEqual({ ok: true })
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]!.values).toMatchObject({
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'jordan@example.com',
      source: 'website_chat',
      lifecycle: 'lead',
    })
    expect(recordInboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        channel: 'email',
        body: expect.stringContaining('Do you take Delta Dental?'),
      }),
    )
  })

  it('threads a REPEAT visitor to their existing patient record (no duplicate)', async () => {
    state.selectQueue.push([{ chatWidgetEnabled: true }])
    state.selectQueue.push([{ id: 'pat_existing', firstName: 'Jordan', lastName: 'Lee' }])
    await submitChatMessage(fd())
    expect(state.inserts).toHaveLength(0)
    expect(recordInboundMock).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'pat_existing' }),
    )
  })

  it('a DIFFERENT-named visitor on the same email gets their own record + a family flag', async () => {
    state.selectQueue.push([{ chatWidgetEnabled: true }])
    state.selectQueue.push([{ id: 'pat_maria', firstName: 'Maria', lastName: 'Aguilera' }])
    await submitChatMessage(fd({ name: 'John Aguilera', email: 'aguilera.family@example.com' }))
    // John gets his OWN record — never threaded onto Maria's chart.
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]!.values).toMatchObject({ firstName: 'John', lastName: 'Aguilera' })
    expect(recordInboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: state.inserts[0]!.values.id,
        body: expect.stringContaining('also on file for Maria Aguilera'),
      }),
    )
  })

  it('silently drops bots (normal success shape, nothing recorded)', async () => {
    botMock.mockReturnValue(true)
    const r = await submitChatMessage(fd())
    expect(r).toEqual({ ok: true })
    expect(recordInboundMock).not.toHaveBeenCalled()
    expect(state.inserts).toHaveLength(0)
  })

  it('silently drops over-rate-limit submissions', async () => {
    rateMock.mockResolvedValue(false)
    const r = await submitChatMessage(fd())
    expect(r).toEqual({ ok: true })
    expect(recordInboundMock).not.toHaveBeenCalled()
  })

  it('refuses when the clinic turned the widget off', async () => {
    state.selectQueue.push([{ chatWidgetEnabled: false }])
    await expect(submitChatMessage(fd())).rejects.toThrow(/off right now/i)
    expect(recordInboundMock).not.toHaveBeenCalled()
  })

  it('validates the email shape', async () => {
    state.selectQueue.push([{ chatWidgetEnabled: true }])
    await expect(submitChatMessage(fd({ email: 'not-an-email' }))).rejects.toThrow(/email/i)
  })
})
