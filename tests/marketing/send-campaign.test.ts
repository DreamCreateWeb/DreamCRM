import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for the campaign send orchestrator
 * (`lib/services/marketing-send.ts`) — the compliance-critical path.
 *
 * Covered:
 *  - Clinic campaigns send FROM the clinic Tier-1 identity with the clinic's
 *    contact inbox as Reply-To (NOT the stale hardcoded platform address).
 *  - Platform/customers campaigns send from the platform default From.
 *  - RFC-8058 List-Unsubscribe + List-Unsubscribe-Post headers ride every
 *    Resend send (Gmail/Yahoo bulk-sender requirement).
 *  - The footer carries the SENDING clinic's postal address.
 *  - Fail-closed: a clinic with no resolvable postal address is refused with a
 *    structured `skipped: 'missing_postal_address'` result, no send attempted.
 *  - Duplicate-send guard: the atomic claim flips status; a racing second call
 *    that claims nothing returns `skipped: 'already_sending'` without resending.
 */

const h = vi.hoisted(() => ({
  getCampaignMock: vi.fn(),
  resolveRecipientsMock: vi.fn(),
  getSenderMock: vi.fn(),
  notifyMock: vi.fn().mockResolvedValue(undefined),
  resendSendMock: vi.fn().mockResolvedValue({ data: { id: 'm_1' }, error: null }),
  // db op spies
  claimReturningMock: vi.fn(),
  profileRowsMock: vi.fn().mockResolvedValue([]),
}))

// Chainable db mock. `update().set().where()` either resolves (final status
// write) or exposes `.returning()` (the atomic claim). `insert().values()`
// resolves. `select().from().where().limit()` returns the clinic profile rows.
vi.mock('@/lib/db', () => {
  const db = {
    update: () => ({
      set: () => ({
        where: () => {
          const p: any = Promise.resolve(undefined)
          p.returning = () => h.claimReturningMock()
          return p
        },
      }),
    }),
    insert: () => ({ values: async () => undefined }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => h.profileRowsMock(),
        }),
      }),
    }),
  }
  return {
    db,
    schema: {
      campaigns: { id: 'id', status: 'status' },
      campaignEvents: {},
      clinicProfile: {
        organizationId: 'organizationId',
        addressLine1: 'addressLine1',
        addressLine2: 'addressLine2',
        city: 'city',
        state: 'state',
        postalCode: 'postalCode',
        country: 'country',
        logoUrl: 'logoUrl',
      },
      emailAccount: {},
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _kind: 'and', a }),
  eq: (...a: unknown[]) => ({ _kind: 'eq', a }),
  inArray: (...a: unknown[]) => ({ _kind: 'inArray', a }),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: h.resendSendMock }
  },
}))

vi.mock('@/lib/services/marketing-campaigns', () => ({
  getMarketingCampaign: h.getCampaignMock,
  resolveCampaignRecipients: h.resolveRecipientsMock,
}))

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: h.getSenderMock,
}))

vi.mock('@/lib/services/notifications', () => ({
  notify: h.notifyMock,
}))

vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: vi.fn(),
  sendMessage: vi.fn(),
}))

import { sendCampaign } from '@/lib/services/marketing-send'

const CLINIC_SENDER = {
  name: 'Acme Dental',
  from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
  replyTo: 'front@acmedental.com',
  timeZone: 'America/New_York',
}

const CLINIC_ADDRESS = {
  addressLine1: '123 Main St',
  addressLine2: null,
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
  logoUrl: null,
}

function recipient(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    customerId: null,
    patientId: 'p1',
    firstName: 'Mia',
    name: 'Mia Hayes',
    email: 'mia@example.com',
    phone: null,
    emailOptIn: true,
    smsOptIn: false,
    ...over,
  }
}

function clinicCampaign(over: Record<string, unknown> = {}) {
  return {
    id: 99,
    organizationId: 'org_1',
    name: 'Recall blast',
    subject: 'Time for a cleaning',
    previewText: null,
    bodyHtml: '<p>Hi there</p>',
    sendChannel: 'resend',
    recipientSource: 'patients',
    createdBy: null,
    status: 'draft',
    ...over,
  }
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test_key'
  delete process.env.EMAIL_FROM
  delete process.env.MARKETING_POSTAL_ADDRESS
  h.getCampaignMock.mockReset()
  h.resolveRecipientsMock.mockReset().mockResolvedValue([recipient()])
  h.getSenderMock.mockReset().mockResolvedValue({ ...CLINIC_SENDER })
  h.notifyMock.mockReset().mockResolvedValue(undefined)
  h.resendSendMock.mockReset().mockResolvedValue({ data: { id: 'm_1' }, error: null })
  // Default: the atomic claim succeeds (returns one row).
  h.claimReturningMock.mockReset().mockResolvedValue([{ id: 99 }])
  h.profileRowsMock.mockReset().mockResolvedValue([{ ...CLINIC_ADDRESS }])
})

describe('sendCampaign — clinic sender identity', () => {
  it('sends FROM the clinic Tier-1 identity with the clinic Reply-To', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.sent).toBe(1)
    const sent = h.resendSendMock.mock.calls[0][0]
    expect(sent.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
    expect(sent.from).not.toMatch(/DreamCreateWeb\.com/i)
    expect(sent.replyTo).toBe('front@acmedental.com')
  })

  it('omits Reply-To when the clinic contact email is non-deliverable', async () => {
    h.getSenderMock.mockResolvedValue({ ...CLINIC_SENDER, replyTo: null })
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    const sent = h.resendSendMock.mock.calls[0][0]
    expect(sent.replyTo).toBeUndefined()
  })

  it('platform/customers campaigns use the EMAIL_FROM platform default, not the hardcoded string', async () => {
    process.env.EMAIL_FROM = 'Dream Create <hello@dreamcreatestudio.com>'
    process.env.MARKETING_POSTAL_ADDRESS = 'Dream Create, 1 Platform Way, NY'
    h.getCampaignMock.mockResolvedValue(
      clinicCampaign({ recipientSource: 'customers', patientId: null, customerId: 7 }),
    )
    h.resolveRecipientsMock.mockResolvedValue([
      recipient({ patientId: null, customerId: 7, id: '7' }),
    ])
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    const sent = h.resendSendMock.mock.calls[0][0]
    expect(sent.from).toBe('Dream Create <hello@dreamcreatestudio.com>')
    expect(sent.from).not.toMatch(/DreamCreateWeb\.com/i)
    // Platform campaigns don't resolve a clinic identity.
    expect(h.getSenderMock).not.toHaveBeenCalled()
  })
})

describe('sendCampaign — List-Unsubscribe headers', () => {
  it('adds RFC-8058 List-Unsubscribe + List-Unsubscribe-Post headers on every send', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    const sent = h.resendSendMock.mock.calls[0][0]
    expect(sent.headers['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/api\/unsub\/.+>$/)
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })
})

describe('sendCampaign — compliance fail-closed on missing postal address', () => {
  it('refuses to send a clinic campaign with no resolvable postal address', async () => {
    h.profileRowsMock.mockResolvedValue([
      { ...CLINIC_ADDRESS, addressLine1: null, city: null, state: null, postalCode: null },
    ])
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.skipped).toBe('missing_postal_address')
    expect(r.sent).toBe(0)
    expect(r.error).toMatch(/Settings → Clinic/)
    // Nothing was sent, and the campaign was never claimed.
    expect(h.resendSendMock).not.toHaveBeenCalled()
    expect(h.claimReturningMock).not.toHaveBeenCalled()
  })

  it('falls back to MARKETING_POSTAL_ADDRESS when the clinic address is blank', async () => {
    process.env.MARKETING_POSTAL_ADDRESS = 'Acme Dental, PO Box 1, Austin TX'
    h.profileRowsMock.mockResolvedValue([
      { ...CLINIC_ADDRESS, addressLine1: null, city: null, state: null, postalCode: null },
    ])
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.skipped).toBeUndefined()
    expect(r.sent).toBe(1)
  })

  it('does NOT fail-closed on a test send (no postal address needed)', async () => {
    h.profileRowsMock.mockResolvedValue([
      { ...CLINIC_ADDRESS, addressLine1: null, city: null, state: null, postalCode: null },
    ])
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99, test: true })
    expect(r.skipped).toBeUndefined()
    expect(r.sent).toBe(1)
  })
})

describe('sendCampaign — duplicate-send guard', () => {
  it('claims the campaign atomically and sends when the claim succeeds', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(h.claimReturningMock).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
  })

  it('a racing second call that claims nothing returns already_sending without resending', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    // The claim returns no rows → another invocation already flipped status.
    h.claimReturningMock.mockResolvedValue([])
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.skipped).toBe('already_sending')
    expect(r.sent).toBe(0)
    expect(h.resendSendMock).not.toHaveBeenCalled()
  })

  it('test sends skip the claim entirely (no campaign-state mutation)', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    await sendCampaign({ organizationId: 'org_1', campaignId: 99, test: true })
    expect(h.claimReturningMock).not.toHaveBeenCalled()
  })
})
