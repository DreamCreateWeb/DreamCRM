import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ONE NOTE PER HOUSEHOLD (ML-29, G1-13). Reminders already collapse a
 * family's same-day visits into one email on the shared inbox; the recall /
 * reactivation sends had only the resume filter, so a family of four on one
 * address got four emails. Pins:
 *  - the pure helpers: grouping by shared inbox (order kept, no-email rows
 *    dropped), the names ("Maya and Leo", the Oxford three), the lead-in
 *    only for two or more;
 *  - sendCampaign sends ONE email per inbox, naming everyone, with the
 *    household lead-in above the clinic's own words;
 *  - EVERY member still gets their own campaign_events row — the
 *    patient-keyed frequency cap counts each person, the resume filter drops
 *    each of them, the funnel counts people;
 *  - the cap is asked about PEOPLE before grouping, and a capped member
 *    simply leaves the household note (the rest still get it, addressed to
 *    them alone);
 *  - the household unsubscribe token names the INBOX (no patient id), so one
 *    click opts out everyone who reads it; a solo token names the person;
 *  - a failed household send fails every member, in the errors and the rows;
 *  - the Gmail channel walks the same households.
 */

const h = vi.hoisted(() => ({
  getCampaignMock: vi.fn(),
  resolveRecipientsMock: vi.fn(),
  getSenderMock: vi.fn(),
  audienceSourceMock: vi.fn(),
  freqCapMock: vi.fn(),
  priorAutoMock: vi.fn(),
  notifyMock: vi.fn().mockResolvedValue(undefined),
  recordActionMock: vi.fn(async (..._a: unknown[]) => true),
  resendSendMock: vi.fn().mockResolvedValue({ data: { id: 'm_1' }, error: null }),
  gmailSendMock: vi.fn().mockResolvedValue(undefined),
  insertValuesMock: vi.fn(),
  claimReturningMock: vi.fn(),
  profileRowsMock: vi.fn().mockResolvedValue([]),
  priorSentMock: vi.fn().mockResolvedValue([]),
}))

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
    insert: () => ({
      values: async (v: unknown) => {
        h.insertValuesMock(v)
      },
    }),
    select: () => ({
      from: () => ({
        where: () => {
          const o: any = { limit: async () => h.profileRowsMock() }
          o.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(h.priorSentMock()).then(res, rej)
          return o
        },
      }),
    }),
  }
  return {
    db,
    schema: {
      campaigns: { id: 'id', status: 'status' },
      campaignEvents: { campaignId: 'campaignId', type: 'type', patientId: 'patientId', recipientEmail: 'recipientEmail', recipientPhone: 'recipientPhone' },
      clinicProfile: {
        organizationId: 'organizationId',
        addressLine1: 'addressLine1',
        addressLine2: 'addressLine2',
        city: 'city',
        state: 'state',
        postalCode: 'postalCode',
        country: 'country',
        logoUrl: 'logoUrl',
        websiteDomain: 'websiteDomain',
        planTier: 'planTier',
      },
      organization: { id: 'id', slug: 'slug' },
      emailAccount: { id: 'id', emailAddress: 'emailAddress', displayName: 'displayName', organizationId: 'organizationId' },
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
  getAudienceRecipientSource: h.audienceSourceMock,
}))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: h.getSenderMock }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: h.recordActionMock }))
vi.mock('@/lib/services/notifications', () => ({ notify: h.notifyMock }))
vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  sendMessage: (...a: unknown[]) => h.gmailSendMock(...(a as [])),
}))
vi.mock('@/lib/sms', () => ({
  getClinicSmsIdentity: vi.fn(async () => ({ ok: false, reason: 'driver_off' })),
  deliverSms: vi.fn(),
}))
vi.mock('@/lib/services/marketing-frequency', () => ({
  partitionByFrequencyCap: h.freqCapMock,
  partitionByPriorAutomationSend: h.priorAutoMock,
}))

import { sendCampaign } from '@/lib/services/marketing-send'
import { groupByHousehold, householdNames, householdLeadIn, householdKey } from '@/lib/marketing/household'
import { decodeToken } from '@/lib/marketing/tokens'

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
    firstName: 'Maya',
    name: 'Maya Chen',
    email: 'chens@example.com',
    phone: null,
    emailOptIn: true,
    smsOptIn: false,
    ...over,
  }
}
const MAYA = recipient()
const LEO = recipient({ id: 'p2', patientId: 'p2', firstName: 'Leo', name: 'Leo Chen', email: 'Chens@Example.com' })
const SAM = recipient({ id: 'p3', patientId: 'p3', firstName: 'Sam', name: 'Sam Ortiz', email: 'sam@example.com' })

function clinicCampaign(over: Record<string, unknown> = {}) {
  return {
    id: 99,
    organizationId: 'org_1',
    name: 'Recall blast',
    subject: 'Time for a cleaning, {{firstName}}?',
    previewText: null,
    bodyHtml: '<p>Hi {{firstName}}, it has been a while.</p>',
    sendChannel: 'resend',
    recipientSource: 'patients',
    createdBy: null,
    status: 'draft',
    ...over,
  }
}

const sentRows = () =>
  h.insertValuesMock.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((r) => r.type === 'sent')
const failedRows = () =>
  h.insertValuesMock.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((r) => r.type === 'failed')
const unsubPayload = (headers: Record<string, string>) => {
  const m = /<[^>]*\/api\/unsub\/([^>]+)>/.exec(headers['List-Unsubscribe'])
  return decodeToken(m![1]) as Record<string, unknown>
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test_key'
  h.getCampaignMock.mockReset().mockResolvedValue(clinicCampaign())
  h.resolveRecipientsMock.mockReset().mockResolvedValue([MAYA, LEO, SAM])
  h.getSenderMock.mockReset().mockResolvedValue({ ...CLINIC_SENDER })
  h.audienceSourceMock.mockReset().mockResolvedValue(null)
  h.freqCapMock.mockReset().mockImplementation(async (_org: string, recipients: unknown[]) => ({ allowed: recipients, suppressed: [] }))
  h.priorAutoMock.mockReset().mockImplementation(async (_org: string, _p: string, recipients: unknown[]) => ({ allowed: recipients, suppressed: [] }))
  h.notifyMock.mockReset().mockResolvedValue(undefined)
  h.recordActionMock.mockReset().mockResolvedValue(true)
  h.resendSendMock.mockReset().mockResolvedValue({ data: { id: 'm_1' }, error: null })
  h.gmailSendMock.mockReset().mockResolvedValue(undefined)
  h.insertValuesMock.mockReset()
  h.claimReturningMock.mockReset().mockResolvedValue([{ id: 99 }])
  h.profileRowsMock.mockReset().mockResolvedValue([{ ...CLINIC_ADDRESS }])
  h.priorSentMock.mockReset().mockResolvedValue([])
})

describe('the pure household helpers', () => {
  it('groups by shared inbox (case-insensitive), keeps first-seen order, drops rows with no inbox', () => {
    const groups = groupByHousehold([SAM, MAYA, recipient({ id: 'p9', patientId: 'p9', email: null }), LEO])
    expect(groups.map((g) => g.email)).toEqual(['sam@example.com', 'chens@example.com'])
    expect(groups[1].members.map((m) => m.firstName)).toEqual(['Maya', 'Leo'])
    expect(householdKey({ email: '  Chens@Example.com ', firstName: 'x' })).toBe('chens@example.com')
    expect(householdKey({ email: null, firstName: 'x' })).toBeNull()
  })

  it('names everyone — one, two, or the Oxford three — with the warm fallback for a blank name', () => {
    expect(householdNames([MAYA])).toBe('Maya')
    expect(householdNames([MAYA, LEO])).toBe('Maya and Leo')
    expect(householdNames([MAYA, LEO, SAM])).toBe('Maya, Leo and Sam')
    expect(householdNames([recipient({ firstName: '' })])).toBe('there')
    expect(householdNames([])).toBe('there')
  })

  it('the lead-in exists only for two or more, names them, and never says "overdue"', () => {
    expect(householdLeadIn([MAYA])).toBeNull()
    const line = householdLeadIn([MAYA, LEO])!
    expect(line).toContain('Maya and Leo')
    expect(line.toLowerCase()).not.toContain('overdue')
  })
})

describe('sendCampaign — one note per household', () => {
  it('sends ONE email per inbox naming everyone, with the lead-in above the clinic’s words; counts stay in people', async () => {
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(h.resendSendMock).toHaveBeenCalledTimes(2)
    const [family, sam] = h.resendSendMock.mock.calls.map((c) => c[0] as Record<string, string>)
    expect(family.to).toBe('chens@example.com')
    expect(family.subject).toBe('Time for a cleaning, Maya and Leo?')
    expect(family.html).toContain('Hi Maya and Leo, it has been a while.')
    expect(family.html).toContain('One note for the whole household')
    // The lead-in sits ABOVE the campaign's own words.
    expect(family.html.indexOf('One note for the whole household')).toBeLessThan(family.html.indexOf('Hi Maya and Leo'))
    expect(sam.to).toBe('sam@example.com')
    expect(sam.subject).toBe('Time for a cleaning, Sam?')
    expect(sam.html).not.toContain('One note for the whole household')
    // Three people reached by two emails.
    expect(r).toMatchObject({ attempted: 3, sent: 3, failed: 0 })
  })

  it('EVERY member gets their own sent row (the patient-keyed cap, the resume filter and the funnel count people)', async () => {
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    const rows = sentRows()
    expect(rows.map((r) => r.patientId).sort()).toEqual(['p1', 'p2', 'p3'])
    const maya = rows.find((r) => r.patientId === 'p1')!
    const leo = rows.find((r) => r.patientId === 'p2')!
    const sam = rows.find((r) => r.patientId === 'p3')!
    expect(maya.recipientEmail).toBe('chens@example.com')
    expect(leo.recipientEmail).toBe('chens@example.com')
    expect(maya.campaignId).toBe(99)
    // The household rows say so; a solo row does not.
    expect((maya.meta as Record<string, unknown>).household).toBe(2)
    expect((leo.meta as Record<string, unknown>).household).toBe(2)
    expect((sam.meta as Record<string, unknown>).household).toBeUndefined()
  })

  it('the cap is asked about PEOPLE before grouping; a capped member leaves the note and the rest still get it, addressed to them alone', async () => {
    h.freqCapMock.mockImplementation(async (_org: string, recipients: Array<{ patientId: string }>) => ({
      allowed: recipients.filter((x) => x.patientId !== 'p1'),
      suppressed: recipients.filter((x) => x.patientId === 'p1'),
    }))
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(h.freqCapMock.mock.calls[0][1]).toHaveLength(3)
    const family = h.resendSendMock.mock.calls[0][0] as Record<string, string>
    expect(family.to).toBe('chens@example.com')
    expect(family.subject).toBe('Time for a cleaning, Leo?')
    expect(family.html).not.toContain('One note for the whole household')
    expect(sentRows().map((x) => x.patientId).sort()).toEqual(['p2', 'p3'])
    expect(r).toMatchObject({ sent: 2, suppressed: 1 })
  })

  it('the household unsubscribe names the INBOX (one click opts out everyone who reads it); a solo one names the person', async () => {
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    const [family, sam] = h.resendSendMock.mock.calls.map((c) => c[0] as { headers: Record<string, string> })
    const fam = unsubPayload(family.headers)
    expect(fam.e).toBe('chens@example.com')
    expect(fam.c).toBe(99)
    expect(fam.pi).toBeUndefined()
    const solo = unsubPayload(sam.headers)
    expect(solo.e).toBe('sam@example.com')
    expect(solo.pi).toBe('p3')
  })

  it('a failed household send fails every member — in the errors and the rows', async () => {
    h.resendSendMock
      .mockResolvedValueOnce({ data: null, error: { message: 'mailbox full' } })
      .mockResolvedValueOnce({ data: { id: 'm_2' }, error: null })
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r).toMatchObject({ attempted: 3, sent: 1, failed: 2 })
    expect(r.errors).toHaveLength(2)
    expect(r.errors.every((e) => e.error === 'mailbox full')).toBe(true)
    expect(failedRows().map((x) => x.patientId).sort()).toEqual(['p1', 'p2'])
    expect(sentRows().map((x) => x.patientId)).toEqual(['p3'])
  })

  it('a test send groups the same way and records nothing', async () => {
    await sendCampaign({ organizationId: 'org_1', campaignId: 99, test: true })
    expect(h.resendSendMock).toHaveBeenCalledTimes(2)
    expect(h.insertValuesMock).not.toHaveBeenCalled()
  })

  it('the Gmail channel walks the same households', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ sendChannel: 'gmail' }))
    h.profileRowsMock.mockResolvedValue([{ id: 'acc_1', emailAddress: 'front@acmedental.com', displayName: 'Acme Dental', ...CLINIC_ADDRESS }])
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99, gmailAccountId: 'acc_1' })
    expect(h.gmailSendMock).toHaveBeenCalledTimes(2)
    const family = h.gmailSendMock.mock.calls[0][1] as { to: string[]; subject: string; bodyHtml: string }
    expect(family.to).toEqual(['chens@example.com'])
    expect(family.subject).toBe('Time for a cleaning, Maya and Leo?')
    expect(family.bodyHtml).toContain('One note for the whole household')
    expect(sentRows().map((x) => x.patientId).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(r).toMatchObject({ channel: 'gmail', sent: 3 })
  })
})
