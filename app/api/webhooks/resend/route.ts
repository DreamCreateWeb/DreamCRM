import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Resend webhook handler. Signed via Svix; verifies the signature using
 * RESEND_WEBHOOK_SECRET. Records bounce/complaint events against the
 * campaign and marks the customer opted_out on hard bounces / complaints.
 *
 * Resend event payloads carry `data.email_id` (Resend's id, not ours) and
 * a `tags` object — we set `tags.campaignId` + `tags.customerId` on send,
 * so we can map back to our schema.
 */
type ResendEvent = {
  type: string
  data?: {
    email_id?: string
    to?: string[] | string
    bounce?: { type?: string }
    tags?: Record<string, string>
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 })

  const raw = await req.text()
  let evt: ResendEvent
  try {
    const wh = new Webhook(secret)
    const id = req.headers.get('svix-id') ?? ''
    const ts = req.headers.get('svix-timestamp') ?? ''
    const sig = req.headers.get('svix-signature') ?? ''
    evt = wh.verify(raw, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig }) as ResendEvent
  } catch (err) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }

  const tags = evt.data?.tags ?? {}
  const campaignId = Number(tags.campaignId)
  const customerId = tags.customerId ? Number(tags.customerId) : null
  const patientId = tags.patientId ?? null
  if (!campaignId) return NextResponse.json({ ok: true, ignored: 'no campaignId tag' })

  const toList = Array.isArray(evt.data?.to) ? evt.data?.to : evt.data?.to ? [evt.data?.to] : []
  const recipient = (toList?.[0] ?? '').toLowerCase()

  const typeMap: Record<string, 'sent' | 'delivered' | 'bounce' | 'complaint' | 'failed'> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.bounced': 'bounce',
    'email.complained': 'complaint',
    'email.failed': 'failed',
  }
  const evtType = typeMap[evt.type]
  if (!evtType) return NextResponse.json({ ok: true, ignored: evt.type })

  try {
    await db.insert(schema.campaignEvents).values({
      campaignId,
      recipientEmail: recipient,
      customerId,
      patientId,
      type: evtType,
      meta: { resendEmailId: evt.data?.email_id, bounceType: evt.data?.bounce?.type },
    })

    // Hard bounce or complaint → opt out. Patient-source rows opt-out via
    // marketing_email_opt_in=0 + opt-out timestamp; customer-source rows
    // via customers.opted_out=true.
    const shouldOptOut =
      (evtType === 'bounce' && evt.data?.bounce?.type !== 'soft') ||
      evtType === 'complaint'
    if (shouldOptOut) {
      if (patientId) {
        await db
          .update(schema.patient)
          .set({
            marketingEmailOptIn: 0,
            marketingEmailOptOutAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.patient.id, patientId))
      } else if (customerId) {
        await db
          .update(schema.customers)
          .set({ optedOut: true, updatedAt: new Date() })
          .where(eq(schema.customers.id, customerId))
      } else if (recipient) {
        const [campaign] = await db
          .select({ orgId: schema.campaigns.organizationId })
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, campaignId))
          .limit(1)
        if (campaign?.orgId) {
          await db
            .update(schema.customers)
            .set({ optedOut: true, updatedAt: new Date() })
            .where(
              and(
                eq(schema.customers.organizationId, campaign.orgId),
                eq(schema.customers.email, recipient),
              ),
            )
          await db
            .update(schema.patient)
            .set({
              marketingEmailOptIn: 0,
              marketingEmailOptOutAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.patient.organizationId, campaign.orgId),
                eq(schema.patient.email, recipient),
              ),
            )
        }
      }
    }
  } catch (err) {
    console.warn('[webhook.resend]', err)
  }

  return NextResponse.json({ ok: true })
}
