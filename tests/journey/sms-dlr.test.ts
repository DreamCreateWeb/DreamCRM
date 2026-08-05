import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SMS delivery receipts (Phase 5 limb 3). The honesty layer: "sent" means
 * we handed it to a carrier; only a DELIVERED receipt earns "delivered",
 * exactly as the email side's Resend receipts work. A reminder receipt
 * stamps appointment_reminder_log.deliveredAt; a campaign receipt mints the
 * sibling 'delivered'/'bounce' campaign_events row the funnel already
 * reads. SNS redelivers on any non-2xx, so every path is idempotent and
 * nothing throws.
 */

import { parseSmsDlr, classifySmsDlr } from '@/lib/sms-dlr'

const dlr = (over: Record<string, unknown> = {}) => ({
  eventType: 'TEXT_DELIVERED',
  messageId: 'msg_1',
  messageStatus: 'DELIVERED',
  messageStatusDescription: 'Message has been accepted by phone',
  ...over,
})

describe('parseSmsDlr — external input, parsed defensively', () => {
  it('accepts the real event shape', () => {
    const p = parseSmsDlr(dlr())
    expect(p).not.toBeNull()
    expect(p?.messageId).toBe('msg_1')
    expect(p?.messageStatus).toBe('DELIVERED')
  })

  it('rejects an inbound text, non-TEXT events, and junk', () => {
    expect(parseSmsDlr(null)).toBeNull()
    expect(parseSmsDlr({})).toBeNull()
    expect(parseSmsDlr({ originationNumber: '+1', messageBody: 'hi', inboundMessageId: 'in_1' })).toBeNull()
    expect(parseSmsDlr(dlr({ eventType: 'VOICE_COMPLETED' }))).toBeNull()
    expect(parseSmsDlr(dlr({ messageId: undefined }))).toBeNull()
    expect(parseSmsDlr(dlr({ inboundMessageId: 'in_1' }))).toBeNull()
  })

  it('normalises the status casing', () => {
    expect(parseSmsDlr(dlr({ messageStatus: 'delivered' }))?.messageStatus).toBe('DELIVERED')
  })
})

describe('classifySmsDlr — only DELIVERED earns the word', () => {
  it('DELIVERED → delivered', () => {
    expect(classifySmsDlr(parseSmsDlr(dlr())!)).toBe('delivered')
  })

  it('SUCCESSFUL is carrier acceptance, not delivery — interim', () => {
    expect(classifySmsDlr(parseSmsDlr(dlr({ messageStatus: 'SUCCESSFUL' }))!)).toBe('interim')
  })

  it('every terminal failure status → failed', () => {
    for (const s of ['INVALID', 'INVALID_MESSAGE', 'UNREACHABLE', 'CARRIER_UNREACHABLE', 'BLOCKED', 'CARRIER_BLOCKED', 'SPAM', 'TTL_EXPIRED']) {
      expect(classifySmsDlr(parseSmsDlr(dlr({ messageStatus: s }))!)).toBe('failed')
    }
  })

  it('progress + unknown statuses stay interim — a new provider status is never guessed into a receipt', () => {
    for (const s of ['PENDING', 'QUEUED', 'SENT', 'UNKNOWN', 'SOMETHING_NEW']) {
      expect(classifySmsDlr(parseSmsDlr(dlr({ messageStatus: s }))!)).toBe('interim')
    }
  })
})

// ── The service half ────────────────────────────────────────────────────────

const store = vi.hoisted(() => ({
  reminderRows: [] as Array<Record<string, unknown>>,
  campaignRows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  selectThrows: false,
}))

vi.mock('@/lib/db', () => {
  const col = (n: string) => ({ __col: n })
  return {
    db: {
      update: () => ({
        set: (patch: Record<string, unknown>) => ({
          where: (pred: (r: Record<string, unknown>) => boolean) => ({
            returning: async () => {
              const hit = store.reminderRows.filter((r) => pred(r))
              for (const r of hit) Object.assign(r, patch)
              return hit.map((r) => ({ id: r.id }))
            },
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: async (pred: (r: Record<string, unknown>) => boolean) => {
            if (store.selectThrows) throw new Error('db down')
            return store.campaignRows.filter((r) => pred(r))
          },
        }),
      }),
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          store.inserted.push(v)
        },
      }),
    },
    schema: {
      appointmentReminderLog: {
        id: col('id'),
        providerMessageId: col('providerMessageId'),
        deliveredAt: col('deliveredAt'),
      },
      campaignEvents: {
        id: col('id'),
        type: col('type'),
        campaignId: col('campaignId'),
        recipientEmail: col('recipientEmail'),
        recipientPhone: col('recipientPhone'),
        customerId: col('customerId'),
        patientId: col('patientId'),
        providerMessageId: col('providerMessageId'),
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  isNull: (c: { __col: string }) => (r: Record<string, unknown>) => r[c.__col] == null,
  and:
    (...preds: Array<(r: Record<string, unknown>) => boolean>) =>
    (r: Record<string, unknown>) =>
      preds.every((p) => p(r)),
}))

import { recordSmsDlr } from '@/lib/services/sms-dlr'

const SENT_ROW = {
  id: 1,
  type: 'sent',
  campaignId: 7,
  recipientEmail: null,
  recipientPhone: '+14155550142',
  customerId: null,
  patientId: 'pat_1',
  providerMessageId: 'msg_1',
}

beforeEach(() => {
  store.reminderRows = []
  store.campaignRows = []
  store.inserted = []
  store.selectThrows = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordSmsDlr', () => {
  it('an interim event touches nothing', async () => {
    const r = await recordSmsDlr(parseSmsDlr(dlr({ messageStatus: 'PENDING' }))!)
    expect(r.outcome).toBe('interim')
    expect(store.inserted).toHaveLength(0)
  })

  it('a DELIVERED receipt for a reminder stamps deliveredAt', async () => {
    store.reminderRows = [{ id: 'rem_1', providerMessageId: 'msg_1', deliveredAt: null }]
    const r = await recordSmsDlr(parseSmsDlr(dlr())!)
    expect(r.outcome).toBe('reminder_delivered')
    expect(store.reminderRows[0].deliveredAt).toBeInstanceOf(Date)
  })

  it('a REDELIVERED reminder receipt is a no-op (deliveredAt already set → falls through, unmatched)', async () => {
    store.reminderRows = [{ id: 'rem_1', providerMessageId: 'msg_1', deliveredAt: new Date('2026-08-01') }]
    const r = await recordSmsDlr(parseSmsDlr(dlr())!)
    expect(r.outcome).toBe('unmatched')
    expect(store.reminderRows[0].deliveredAt).toEqual(new Date('2026-08-01'))
    expect(store.inserted).toHaveLength(0)
  })

  it('a DELIVERED receipt for a campaign send mints the sibling delivered row with the same attribution', async () => {
    store.campaignRows = [SENT_ROW]
    const r = await recordSmsDlr(parseSmsDlr(dlr())!)
    expect(r.outcome).toBe('campaign_receipt')
    expect(store.inserted).toHaveLength(1)
    expect(store.inserted[0]).toMatchObject({
      campaignId: 7,
      recipientPhone: '+14155550142',
      patientId: 'pat_1',
      type: 'delivered',
      providerMessageId: 'msg_1',
    })
  })

  it('a terminal failure mints a bounce row carrying the provider status', async () => {
    store.campaignRows = [SENT_ROW]
    const r = await recordSmsDlr(
      parseSmsDlr(dlr({ messageStatus: 'CARRIER_BLOCKED', messageStatusDescription: 'Blocked by carrier' }))!,
    )
    expect(r.outcome).toBe('campaign_receipt')
    expect(store.inserted[0]).toMatchObject({ type: 'bounce' })
    expect((store.inserted[0].meta as Record<string, unknown>).messageStatus).toBe('CARRIER_BLOCKED')
    expect((store.inserted[0].meta as Record<string, unknown>).statusDescription).toBe('Blocked by carrier')
  })

  it('DEDUPES on SNS redelivery — a receipt already recorded is not recorded twice', async () => {
    store.campaignRows = [SENT_ROW, { ...SENT_ROW, id: 2, type: 'delivered' }]
    const r = await recordSmsDlr(parseSmsDlr(dlr())!)
    expect(r.outcome).toBe('campaign_receipt')
    expect(store.inserted).toHaveLength(0)
  })

  it('a receipt no ledger knows is acknowledged as unmatched (keyword confirmations have no ledger row)', async () => {
    const r = await recordSmsDlr(parseSmsDlr(dlr())!)
    expect(r.outcome).toBe('unmatched')
  })

  it('NEVER throws — a db failure is acknowledged so SNS stops redelivering', async () => {
    store.selectThrows = true
    const r = await recordSmsDlr(parseSmsDlr(dlr())!)
    expect(r.outcome).toBe('ignored')
  })
})
