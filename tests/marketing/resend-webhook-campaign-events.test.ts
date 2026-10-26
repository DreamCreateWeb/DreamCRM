import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The Resend webhook's campaign branch (2026-10-26, the double-'sent' fix).
 *
 * lib/services/marketing-send.ts writes ONE campaign_events 'sent' row the
 * moment Resend accepts an email. The webhook used to map `email.sent` onto
 * a second 'sent' row for the same campaign + recipient — the unique index
 * carries occurred_at, so the two never collided — and every funnel read 2×,
 * every open rate was halved, and the 2-per-7-days frequency cap was reached
 * after a single email. These cases pin the contract: `email.sent` records
 * NOTHING for a campaign, delivery/bounce receipts still land, prospect
 * outreach keeps its webhook 'sent' (nothing else writes it), and a test
 * send's receipts are ignored the way its send is.
 */

const h = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}))

vi.mock('svix', () => ({
  // The signature check is Svix's; here `verify` hands back the envelope.
  Webhook: class {
    verify(raw: string) {
      return JSON.parse(raw)
    }
  },
}))

vi.mock('@/lib/services/inbound-reply', () => ({ handleInboundReply: vi.fn() }))
vi.mock('@/lib/utils', () => ({ newId: (p: string) => `${p}_1` }))

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const nameOf = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const db = {
    insert: (t: unknown) => ({
      values: (v: Record<string, unknown>) => {
        h.inserts.push({ table: nameOf(t), values: v })
        const p = Promise.resolve(undefined) as Promise<undefined> & { onConflictDoNothing: () => Promise<undefined> }
        p.onConflictDoNothing = () => Promise.resolve(undefined)
        return p
      },
    }),
    update: (t: unknown) => ({
      set: (s: Record<string, unknown>) => {
        h.updates.push({ table: nameOf(t), set: s })
        return { where: () => Promise.resolve(undefined) }
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  }
  return { db, schema }
})

process.env.RESEND_WEBHOOK_SECRET = 'whsec_test'

import { POST } from '@/app/api/webhooks/resend/route'

function envelope(type: string, tags: Record<string, string>, extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({ type, data: { email_id: 'em_1', to: ['Pat@Example.com'], tags, ...extra } })
  return new NextRequest('http://localhost/api/webhooks/resend', {
    method: 'POST',
    body,
    headers: { 'svix-id': 'id', 'svix-timestamp': '0', 'svix-signature': 'sig' },
  })
}

beforeEach(() => {
  h.inserts.length = 0
  h.updates.length = 0
})

describe('Resend webhook — campaign events', () => {
  it('email.sent for a campaign records NOTHING (the send-time row is the truth)', async () => {
    const res = await POST(envelope('email.sent', { campaignId: '7', patientId: 'pt_1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, ignored: expect.stringMatching(/send time/) })
    expect(h.inserts.filter((i) => i.table === 'campaignEvents')).toEqual([])
  })

  it('email.delivered for a campaign still lands as a delivered row with its attribution', async () => {
    await POST(envelope('email.delivered', { campaignId: '7', patientId: 'pt_1' }))
    const rows = h.inserts.filter((i) => i.table === 'campaignEvents')
    expect(rows).toHaveLength(1)
    expect(rows[0].values).toMatchObject({
      campaignId: 7,
      recipientEmail: 'pat@example.com',
      patientId: 'pt_1',
      type: 'delivered',
    })
  })

  it('a hard bounce still records the receipt AND opts the patient out', async () => {
    await POST(envelope('email.bounced', { campaignId: '7', patientId: 'pt_1' }, { bounce: { type: 'hard' } }))
    const rows = h.inserts.filter((i) => i.table === 'campaignEvents')
    expect(rows.map((r) => r.values.type)).toEqual(['bounce'])
    expect(h.updates.find((u) => u.table === 'patient')?.set).toMatchObject({ marketingEmailOptIn: 0 })
  })

  it('prospect outreach keeps its webhook sent row — nothing else writes it', async () => {
    await POST(envelope('email.sent', { prospectId: 'pr_1', touchLogId: 'tl_1' }))
    const rows = h.inserts.filter((i) => i.table === 'outreachEvent')
    expect(rows).toHaveLength(1)
    expect(rows[0].values).toMatchObject({ prospectId: 'pr_1', type: 'sent' })
    expect(h.inserts.filter((i) => i.table === 'campaignEvents')).toEqual([])
  })

  it('a test send’s receipts are ignored, as its send was', async () => {
    await POST(envelope('email.delivered', { campaignId: '7', test: '1' }))
    await POST(envelope('email.bounced', { campaignId: '7', test: '1' }, { bounce: { type: 'hard' } }))
    expect(h.inserts).toEqual([])
    expect(h.updates).toEqual([])
  })
})
