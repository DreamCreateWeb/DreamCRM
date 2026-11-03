import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE INQUIRY FOLLOW-UP EXECUTOR (ML-22). Pins the executor's own
 * contract — the approve wrapper's narrate-once / reopen / atomic-claim
 * laws are pinned through approveProposal in proposals-service.test.ts:
 *  - the yes sends ONCE through the first touch's own path (the clinic
 *    sender, patientEmailShell, deliver) WITH the "Book a time" button the
 *    card disclosed and the clinic's sign-off unless staff signed;
 *  - it records the touch on the lead (followed_up_at) AFTER the send,
 *    best-effort — a failed stamp never fails the yes;
 *  - the machine's own yes (no approver) is allowed — the lane is grantable;
 *  - live staleness at the tap: converted / archived / reopened-as-new /
 *    vanished → retire; already followed up → retire + recovery-narrate,
 *    never re-send; no email → retire;
 *  - a transport failure comes back as deliver()'s own words — reopen,
 *    nothing stamped.
 */

const lead = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }))
vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  const select = () => {
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = () => api
    api.limit = async () => (lead.row ? [lead.row] : [])
    return api
  }
  return {
    db: { select },
    schema: {
      lead: Object.fromEntries(['id', 'organizationId', 'name', 'email', 'status', 'followedUpAt'].map((c) => [c, col(c)])),
    },
  }
})
vi.mock('drizzle-orm', () => ({ eq: () => true, and: () => true }))

const mail = vi.hoisted(() => ({
  deliver: vi.fn(async (_m: Record<string, unknown>) => {}),
  shell: vi.fn((opts: Record<string, unknown>) => `<shell>${JSON.stringify(opts)}</shell>`),
  deliverThrows: null as string | null,
}))
vi.mock('@/lib/email', () => ({
  deliver: vi.fn(async (m: Record<string, unknown>) => {
    if (mail.deliverThrows) throw new Error(mail.deliverThrows)
    return mail.deliver(m)
  }),
  patientEmailShell: (opts: Record<string, unknown>) => mail.shell(opts),
}))

const SENDER = {
  from: 'Acme Dental <acme@dreamcreatestudio.com>',
  replyTo: 'front@acme.example',
  name: 'Acme Dental',
  timeZone: 'America/Chicago',
}
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => SENDER) }))

const stamp = vi.hoisted(() => ({ markLeadFollowedUp: vi.fn(async () => {}), throws: false }))
vi.mock('@/lib/services/leads', () => ({
  markLeadFollowedUp: vi.fn(async (...a: unknown[]) => {
    if (stamp.throws) throw new Error('db hiccup')
    return stamp.markLeadFollowedUp(...(a as []))
  }),
}))

const site = vi.hoisted(() => ({ bookingUrl: 'https://acme.dreamcreatestudio.com/book' as string | null }))
vi.mock('@/lib/services/marketing-send', () => ({ resolveClinicBookingUrl: vi.fn(async () => site.bookingUrl) }))

import { executeInquiryFollowup } from '@/lib/services/proposal-executors/inquiry-followup'

const ORG = 'org_1'
const BODY = 'Hi Marcus — still happy to look at that crown whenever suits you.\n\nNo rush at all.'

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: 'prop_1',
    organizationId: ORG,
    capability: 'inquiry_followup',
    patientId: null,
    sourceKey: 'inquiry_followup:lead_1',
    title: 'Check back in with Marcus',
    body: BODY,
    payload: { leadId: 'lead_1', subject: 'Checking in from Acme Dental' },
    originalBody: null,
    status: 'approved',
    decidedAt: new Date(),
    decidedByUserId: 'user_1',
    executedAt: null,
    expiresAt: null,
    isDemo: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as unknown as Parameters<typeof executeInquiryFollowup>[0]
}

const SAID_YES = '— you approved it'

beforeEach(() => {
  lead.row = { id: 'lead_1', name: 'Marcus Johnson', email: 'marcus@example.com', status: 'contacted', followedUpAt: null }
  mail.deliver.mockClear()
  mail.shell.mockClear()
  mail.deliverThrows = null
  stamp.markLeadFollowedUp.mockClear()
  stamp.throws = false
  site.bookingUrl = 'https://acme.dreamcreatestudio.com/book'
})

describe('the yes', () => {
  it('sends ONCE through the first touch’s path — the clinic sender, the disclosed button, the sign-off — then stamps the lead and narrates once', async () => {
    const p = proposal()
    const r = await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toEqual({
      ok: true,
      ledgerSummary: 'Checked back in with Marcus by email — you approved it',
      ledgerDetail: { leadId: 'lead_1' },
    })
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    const sent = mail.deliver.mock.calls[0][0]
    expect(sent).toMatchObject({ to: 'marcus@example.com', subject: 'Checking in from Acme Dental', from: SENDER.from, replyTo: SENDER.replyTo })
    const shell = mail.shell.mock.calls[0][0]
    expect(shell.sender).toBe(SENDER)
    expect(shell.cta).toEqual({ url: 'https://acme.dreamcreatestudio.com/book', label: 'Book a time' })
    expect(String(shell.body)).toContain('still happy to look at that crown')
    expect(String(shell.body)).toContain('— Acme Dental')
    expect(String(shell.footnoteHtml)).toContain('just checking back in')
    expect(stamp.markLeadFollowedUp).toHaveBeenCalledWith(ORG, 'lead_1')
  })

  it('staff who signed the draft themselves get no second sign-off; HTML in the body is escaped', async () => {
    const p = proposal({ body: 'See you soon <3\n\n— Dr. Reyes' })
    await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)
    const body = String(mail.shell.mock.calls[0][0].body)
    expect(body).toContain('— Dr. Reyes')
    expect(body).not.toContain('— Acme Dental')
    expect(body).toContain('&lt;3')
  })

  it('no resolvable site → no button (the first touch’s best-effort rule)', async () => {
    site.bookingUrl = null
    const p = proposal()
    const r = await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r.ok).toBe(true)
    expect(mail.shell.mock.calls[0][0].cta).toBeUndefined()
  })

  it('the MACHINE’s own yes (no approver — the lane is grantable) sends like any other', async () => {
    const p = proposal({ decidedByUserId: null })
    const r = await executeInquiryFollowup(p, p.payload as Record<string, unknown>, 'on its own')
    expect(r).toMatchObject({ ok: true, ledgerSummary: 'Checked back in with Marcus by email on its own' })
    expect(mail.deliver).toHaveBeenCalledTimes(1)
  })

  it('a failed stamp after the send never fails the yes (nothing goes out twice)', async () => {
    stamp.throws = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = proposal()
    const r = await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r.ok).toBe(true)
    expect(mail.deliver).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('a transport failure comes back as deliver()’s own words — reopen, nothing stamped', async () => {
    mail.deliverThrows = 'Email is paused for this practice — finish connecting your sender.'
    const p = proposal()
    const r = await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toEqual({ ok: false, error: 'Email is paused for this practice — finish connecting your sender.' })
    expect(stamp.markLeadFollowedUp).not.toHaveBeenCalled()
  })
})

describe('live staleness at the tap', () => {
  it('they became a patient → retires, never sends', async () => {
    lead.row!.status = 'converted'
    const p = proposal()
    const r = await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true, error: expect.stringContaining('became a patient') })
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('archived → retires; reopened as new → retires (the first reply comes first)', async () => {
    lead.row!.status = 'archived'
    const p = proposal()
    expect(await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)).toMatchObject({ ok: false, expired: true })
    lead.row!.status = 'new'
    expect(await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)).toMatchObject({
      ok: false,
      expired: true,
      error: expect.stringContaining('first reply comes before'),
    })
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('already followed up (a stranded approve) → retires and recovery-narrates once, never re-sends', async () => {
    lead.row!.followedUpAt = new Date()
    const p = proposal()
    const r = await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toEqual({
      ok: false,
      expired: true,
      error: expect.stringContaining('already went out'),
      recovered: { ledgerSummary: 'Checked back in with Marcus by email', ledgerDetail: { leadId: 'lead_1' } },
    })
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('a vanished inquiry, or one with no email, retires the card', async () => {
    lead.row = null
    const p = proposal()
    expect(await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)).toMatchObject({ ok: false, expired: true })
    lead.row = { id: 'lead_1', name: 'Marcus Johnson', email: null, status: 'contacted', followedUpAt: null }
    expect(await executeInquiryFollowup(p, p.payload as Record<string, unknown>, SAID_YES)).toMatchObject({
      ok: false,
      expired: true,
      error: expect.stringContaining('no email address'),
    })
    expect(mail.deliver).not.toHaveBeenCalled()
  })

  it('a card with no inquiry reference refuses before any read', async () => {
    const p = proposal({ payload: {} })
    expect(await executeInquiryFollowup(p, {}, SAID_YES)).toMatchObject({ ok: false, error: expect.stringContaining('inquiry reference') })
  })
})
