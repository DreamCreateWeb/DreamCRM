import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
 *  - recipientSource truth: the audience's source overrides a stale campaign
 *    column (pre-backfill rows said 'customers' for patient audiences).
 *  - Frequency-cap plumbing: capped recipients are withheld from the send and
 *    surfaced as `suppressed` (the cap's own logic lives in
 *    marketing-frequency.test.ts — here we pin that sendCampaign USES it).
 *  - Welcome one-shot guard: a recipient already welcomed by an earlier week's
 *    campaign is dropped from a welcome-automation send.
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
        websiteDomain: 'websiteDomain',
        planTier: 'planTier',
      },
      organization: { id: 'id', slug: 'slug' },
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
  getAudienceRecipientSource: h.audienceSourceMock,
}))

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: h.getSenderMock,
}))

vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: h.recordActionMock,
}))
vi.mock('@/lib/services/notifications', () => ({
  notify: h.notifyMock,
}))

vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: vi.fn(),
  sendMessage: vi.fn(),
}))

// THE SMS TRANSPORT (Phase 5 limb 3). Identity + delivery are stubbed; the
// text conversion + segment math stay REAL (lib/sms-segments has its own
// suite, but the branch must feed it real campaign HTML).
const sms = vi.hoisted(() => ({
  identity: { ok: true, fromNumber: '+14155550100' } as Record<string, unknown>,
  deliver: vi.fn(async (..._a: unknown[]) => ({ ok: true, messageId: 'sms_1', segments: 1 })),
}))
vi.mock('@/lib/sms', () => ({
  getClinicSmsIdentity: vi.fn(async () => sms.identity),
  deliverSms: (...a: unknown[]) => sms.deliver(...a),
}))

vi.mock('@/lib/services/marketing-frequency', () => ({
  // Default pass-through (set in beforeEach) — the cap's own logic has its own
  // suite (marketing-frequency.test.ts); these hooks let plumbing tests below
  // simulate capped/already-welcomed recipients.
  partitionByFrequencyCap: h.freqCapMock,
  partitionByPriorAutomationSend: h.priorAutoMock,
}))

import { sendCampaign, buildCampaignPreview, neutralizePreviewLinks } from '@/lib/services/marketing-send'

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
  h.audienceSourceMock.mockReset().mockResolvedValue(null)
  h.freqCapMock
    .mockReset()
    .mockImplementation(async (_org: string, recipients: unknown[]) => ({ allowed: recipients, suppressed: [] }))
  h.priorAutoMock
    .mockReset()
    .mockImplementation(async (_org: string, _prefix: string, recipients: unknown[]) => ({ allowed: recipients, suppressed: [] }))
  h.notifyMock.mockReset().mockResolvedValue(undefined)
  h.recordActionMock.mockReset().mockResolvedValue(true)
  h.resendSendMock.mockReset().mockResolvedValue({ data: { id: 'm_1' }, error: null })
  // Default: the atomic claim succeeds (returns one row).
  h.claimReturningMock.mockReset().mockResolvedValue([{ id: 99 }])
  sms.identity = { ok: true, fromNumber: '+14155550100' }
  sms.deliver.mockReset().mockResolvedValue({ ok: true, messageId: 'sms_1', segments: 1 })
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

describe('sendCampaign — the Action Ledger records MACHINE sends only', () => {
  it('a cron/automation send (no initiatedByUserId) lands in the ledger', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(h.recordActionMock).toHaveBeenCalledTimes(1)
    const entry = h.recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('campaign_send')
    expect(entry.organizationId).toBe('org_1')
    expect(String(entry.summary)).toContain('Recall blast')
  })

  it('a staff-clicked "Send now" (initiatedByUserId set) is THEIR work — no ledger entry', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    const r = await sendCampaign({
      organizationId: 'org_1',
      campaignId: 99,
      initiatedByUserId: 'user_1',
    })
    expect(r.sent).toBe(1)
    expect(h.recordActionMock).not.toHaveBeenCalled()
  })

  it('a send where nothing went out never claims credit in the ledger', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    h.resendSendMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.sent).toBe(0)
    expect(h.recordActionMock).not.toHaveBeenCalled()
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

  it('alreadyClaimed bypasses the internal claim and still sends (scheduled-send path)', async () => {
    // The scheduled-send cron flips the campaign scheduled→active ITSELF, then
    // calls sendCampaign. Before the fix, the internal claim (which only matches
    // draft/scheduled/paused) saw 'active', returned no rows, and the send
    // no-op'd as 'already_sending' — so every scheduled campaign sent to nobody.
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ status: 'active' }))
    h.claimReturningMock.mockResolvedValue([]) // an 'active' campaign claims nothing
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99, alreadyClaimed: true })
    expect(h.claimReturningMock).not.toHaveBeenCalled()
    expect(r.skipped).toBeUndefined()
    expect(r.sent).toBe(1)
  })
})

describe('sendCampaign — recipientSource truth (audience wins over a stale column)', () => {
  it('a patient audience corrects a stale customers column: clinic identity + the cap apply', async () => {
    // Pre-backfill rows: clinic staff created the campaign before creation
    // stamped recipientSource, so the column says 'customers' — but the
    // audience actually targeted is patients.
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ recipientSource: 'customers', audienceId: 5 }))
    h.audienceSourceMock.mockResolvedValue('patients')
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.sent).toBe(1)
    // Clinic Tier-1 identity, not the platform From.
    const sent = h.resendSendMock.mock.calls[0][0]
    expect(sent.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
    // And the frequency cap ran (patients-source behavior).
    expect(h.freqCapMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the campaign column when it has no audience to correct from', async () => {
    process.env.EMAIL_FROM = 'Dream Create <hello@dreamcreatestudio.com>'
    process.env.MARKETING_POSTAL_ADDRESS = 'Dream Create, 1 Platform Way, NY'
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ recipientSource: 'customers', audienceId: null }))
    h.resolveRecipientsMock.mockResolvedValue([recipient({ patientId: null, customerId: 7, id: '7' })])
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(h.audienceSourceMock).not.toHaveBeenCalled()
    expect(h.freqCapMock).not.toHaveBeenCalled()
  })
})

describe('sendCampaign — frequency-cap plumbing', () => {
  it('capped recipients are withheld from the send and returned as suppressed', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    h.freqCapMock.mockImplementation(async (_org: string, recipients: unknown[]) => ({
      allowed: [],
      suppressed: recipients,
    }))
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.attempted).toBe(0)
    expect(r.sent).toBe(0)
    expect(r.suppressed).toBe(1)
    expect(h.resendSendMock).not.toHaveBeenCalled()
  })

  it('test sends bypass the cap (a human previewing on purpose)', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign())
    await sendCampaign({ organizationId: 'org_1', campaignId: 99, test: true })
    expect(h.freqCapMock).not.toHaveBeenCalled()
  })
})

describe('sendCampaign — welcome one-shot guard', () => {
  it('drops recipients already welcomed by an earlier week’s welcome campaign', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ automationKey: 'welcome:2026-07-20' }))
    h.priorAutoMock.mockImplementation(async (_org: string, _prefix: string, recipients: unknown[]) => ({
      allowed: [],
      suppressed: recipients,
    }))
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(h.priorAutoMock).toHaveBeenCalledWith('org_1', 'welcome:', expect.any(Array), 99)
    expect(r.sent).toBe(0)
    expect(r.suppressed).toBe(1)
    expect(h.resendSendMock).not.toHaveBeenCalled()
  })

  it('non-welcome campaigns never run the one-shot guard', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ automationKey: 'birthday:2026-07-22' }))
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(h.priorAutoMock).not.toHaveBeenCalled()
  })
})

describe('sendCampaign — the SMS channel (Phase 5 limb 3)', () => {
  const smsRecipient = (over: Record<string, unknown> = {}) =>
    recipient({ phone: '(415) 555-0142', smsOptIn: true, email: null, emailOptIn: false, ...over })

  it('sends the campaign as TEXT: clinic name up front, STOP line appended, merge fields applied', async () => {
    h.getCampaignMock.mockResolvedValue(
      clinicCampaign({ sendChannel: 'twilio_sms', bodyHtml: '<p>Hi {{firstName}}, we have room Thursday.</p>' }),
    )
    h.resolveRecipientsMock.mockResolvedValue([smsRecipient()])
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.channel).toBe('twilio_sms')
    expect(r.sent).toBe(1)
    const [org, input] = sms.deliver.mock.calls[0] as [string, Record<string, unknown>]
    expect(org).toBe('org_1')
    expect(input.to).toBe('+14155550142')
    expect(input.kind).toBe('marketing')
    const body = String(input.body)
    expect(body.startsWith('Acme Dental: ')).toBe(true)
    expect(body).toContain('Hi Mia, we have room Thursday.')
    expect(body).toContain('Reply STOP to opt out.')
    // No email involved anywhere.
    expect(h.resendSendMock).not.toHaveBeenCalled()
  })

  it('does not stack a second STOP line when the composer already wrote one', async () => {
    h.getCampaignMock.mockResolvedValue(
      clinicCampaign({ sendChannel: 'twilio_sms', bodyHtml: '<p>Room Thursday. Reply STOP to opt out.</p>' }),
    )
    h.resolveRecipientsMock.mockResolvedValue([smsRecipient()])
    await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    const body = String((sms.deliver.mock.calls[0] as [string, Record<string, unknown>])[1].body)
    expect(body.match(/STOP/g)).toHaveLength(1)
  })

  it('an UNAPPROVED clinic fails every recipient with ONE honest org-level reason — no carrier calls', async () => {
    sms.identity = { ok: false, reason: 'not_approved' }
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ sendChannel: 'twilio_sms' }))
    h.resolveRecipientsMock.mockResolvedValue([smsRecipient()])
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.sent).toBe(0)
    expect(r.failed).toBe(1)
    expect(r.errors[0].error).toContain('registration is still with the carriers')
    expect(sms.deliver).not.toHaveBeenCalled()
  })

  it('a recipient whose number is unparseable fails alone — the rest still send', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ sendChannel: 'twilio_sms' }))
    h.resolveRecipientsMock.mockResolvedValue([
      smsRecipient({ id: 'p1', patientId: 'p1', phone: '0000000000' }),
      smsRecipient({ id: 'p2', patientId: 'p2' }),
    ])
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.sent).toBe(1)
    expect(r.failed).toBe(1)
    expect(sms.deliver).toHaveBeenCalledTimes(1)
  })

  it('an approval revoked MID-RUN stops the loop instead of burning the rest of the list', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ sendChannel: 'twilio_sms' }))
    h.resolveRecipientsMock.mockResolvedValue([
      smsRecipient({ id: 'p1', patientId: 'p1' }),
      smsRecipient({ id: 'p2', patientId: 'p2', phone: '(415) 555-0143' }),
      smsRecipient({ id: 'p3', patientId: 'p3', phone: '(415) 555-0144' }),
    ])
    sms.deliver.mockResolvedValueOnce({
      ok: false,
      reason: 'not_approved',
      error: 'This practice’s texting isn’t live yet — registration is still with the carriers.',
    })
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.sent).toBe(0)
    expect(r.failed).toBe(3)
    // One real attempt; the remaining two were failed WITHOUT carrier calls.
    expect(sms.deliver).toHaveBeenCalledTimes(1)
  })

  it('nothing sent leaves the campaign a DRAFT for a clean retry, same as the email path', async () => {
    sms.identity = { ok: false, reason: 'driver_off' }
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ sendChannel: 'twilio_sms' }))
    h.resolveRecipientsMock.mockResolvedValue([smsRecipient()])
    const r = await sendCampaign({ organizationId: 'org_1', campaignId: 99 })
    expect(r.sent).toBe(0)
    // The nothing-sent → draft reset is pinned for email in the duplicate-send
    // suite; here we assert the SMS result shape that drives it.
    expect(r.attempted).toBe(1)
  })
})

describe('buildCampaignPreview', () => {
  it('renders the draft with the first audience member personalized in, like a real send', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ audienceId: 7 }))
    h.resolveRecipientsMock.mockResolvedValue([recipient({ firstName: 'Mia' })])
    const r = await buildCampaignPreview(
      'org_1',
      99,
      { subject: 'Hi {{firstName}}', previewText: 'a quick note', bodyHtml: '<p>Hello {{firstName}}!</p>' },
      'patients',
    )
    expect(r.subject).toBe('Hi Mia')
    expect(r.sampleName).toBe('Mia')
    expect(r.realRecipient).toBe(true)
    expect(r.html).toContain('Hello Mia!')
    // sends AS the clinic identity (branding header + From)
    expect(r.fromLabel).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
  })

  it('neutralizes links and omits tracking so a preview click is inert', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ audienceId: 7 }))
    h.resolveRecipientsMock.mockResolvedValue([recipient({ firstName: 'Mia' })])
    const r = await buildCampaignPreview(
      'org_1',
      99,
      { subject: 'Book now', previewText: '', bodyHtml: '<p><a href="https://acme.example/book">Book</a></p>' },
      'patients',
    )
    // the real destination is stripped to '#', no tracked-redirect, no open pixel
    expect(r.html).not.toContain('https://acme.example/book')
    expect(r.html).toContain('href="#"')
    expect(r.html).not.toContain('/api/track/')
  })

  it('falls back to a synthetic sample when the audience resolves to nobody', async () => {
    h.getCampaignMock.mockResolvedValue(clinicCampaign({ audienceId: 7 }))
    h.resolveRecipientsMock.mockResolvedValue([])
    const r = await buildCampaignPreview(
      'org_1',
      99,
      { subject: 'Hi {{firstName}}', previewText: '', bodyHtml: '<p>{{firstName}}</p>' },
      'patients',
    )
    expect(r.realRecipient).toBe(false)
    expect(r.sampleName).toBe('Taylor')
    expect(r.subject).toBe('Hi Taylor')
  })

  it('throws when the campaign is not found (caller turns it into a structured error)', async () => {
    h.getCampaignMock.mockResolvedValue(null)
    await expect(
      buildCampaignPreview('org_1', 99, { subject: '', previewText: '', bodyHtml: '' }, 'patients'),
    ).rejects.toThrow(/not found/i)
  })
})

describe('neutralizePreviewLinks', () => {
  it('rewrites every href to # but leaves the rest of the markup intact', () => {
    const out = neutralizePreviewLinks('<a href="https://x.com/y">x</a> and <a href=\'mailto:a@b.com\'>mail</a>')
    expect(out).toBe('<a href="#">x</a> and <a href="#">mail</a>')
  })
})

describe('the staff-actor pass-through (round-4 pin)', () => {
  it("sendCampaignAction hands the clicker's id to the ledger gate — deleting the one-liner re-opens the round-1 defect", () => {
    const src = readFileSync(resolve(__dirname, '../../app/(default)/marketing/actions.ts'), 'utf8')
    const call = src.slice(src.indexOf('sendCampaign('))
    expect(call.slice(0, 400)).toMatch(/initiatedByUserId: ctx\.userId/)
  })
})
