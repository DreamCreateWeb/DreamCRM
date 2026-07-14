import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { handleInboundReply } from '@/lib/services/inbound-reply'

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

  // ── Inbound patient replies (Resend Inbound → /messages) ─────────────────
  // Tier-1 email carries Reply-To {slug}@INBOUND_REPLY_DOMAIN; a patient's
  // reply arrives here as `email.received`. Route it into the patient's
  // message thread; anything unroutable is forwarded to the clinic's own
  // inbox so no reply is ever silently lost.
  if (evt.type === 'email.received') {
    try {
      const result = await handleInboundReply(evt.data)
      return NextResponse.json({ ok: true, inbound: result })
    } catch (err) {
      console.warn('[webhook.resend.inbound]', err)
      // 200 on handler errors — svix retries won't fix a routing miss, and the
      // failure path already fell back to forwarding where possible.
      return NextResponse.json({ ok: true, inbound: 'error' })
    }
  }

  const tags = evt.data?.tags ?? {}

  // ── Patient-message receipts ──────────────────────────────────────────────
  // Staff→patient thread emails carry a patientMessageId tag; delivery events
  // become the thread's receipt ladder (Delivered → Opened, bounce → staff
  // bell). Handled before the campaign/prospect branches — and with its own
  // event map, because those paths don't track `email.opened`.
  if (tags.patientMessageId) {
    const receiptMap: Record<string, 'delivered' | 'opened' | 'bounce' | 'complaint'> = {
      'email.delivered': 'delivered',
      'email.opened': 'opened',
      'email.bounced': 'bounce',
      'email.complained': 'complaint',
    }
    const receiptEvent = receiptMap[evt.type]
    if (!receiptEvent) return NextResponse.json({ ok: true, ignored: evt.type })
    const { recordPatientMessageReceipt } = await import('@/lib/services/patient-messaging')
    const outcome = await recordPatientMessageReceipt({
      patientMessageId: tags.patientMessageId,
      organizationId: tags.organizationId ?? null,
      event: receiptEvent,
      bounceType: evt.data?.bounce?.type ?? null,
    })
    return NextResponse.json({ ok: true, receipt: outcome })
  }

  const campaignId = Number(tags.campaignId)
  const customerId = tags.customerId ? Number(tags.customerId) : null
  const patientId = tags.patientId ?? null

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

  // Prospect (platform cold-outreach) sends tag prospectId/touchLogId
  // instead of campaignId. Bounce/complaint = permanent suppression + stop
  // the enrollment — deliverability discipline is non-negotiable there.
  if (tags.prospectId) {
    try {
      const { newId } = await import('@/lib/utils')
      const { inArray } = await import('drizzle-orm')
      await db.insert(schema.outreachEvent).values({
        id: newId('oevt'),
        prospectId: tags.prospectId,
        touchLogId: tags.touchLogId ?? null,
        type: evtType,
        meta: { resendEmailId: evt.data?.email_id, bounceType: evt.data?.bounce?.type },
      })
      const shouldSuppress =
        (evtType === 'bounce' && evt.data?.bounce?.type !== 'soft') || evtType === 'complaint'
      if (shouldSuppress) {
        if (recipient) {
          await db
            .insert(schema.prospectSuppression)
            .values({
              id: newId('psup'),
              email: recipient,
              domain: recipient.split('@')[1] ?? null,
              reason: evtType === 'complaint' ? 'complaint' : 'bounce',
              prospectId: tags.prospectId,
            })
            .onConflictDoNothing()
        }
        await db
          .update(schema.outreachEnrollment)
          .set({ status: 'stopped_bounce', stoppedAt: new Date(), stopReason: evtType })
          .where(
            and(
              eq(schema.outreachEnrollment.prospectId, tags.prospectId),
              inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
            ),
          )
        await db
          .update(schema.prospect)
          .set({
            status: 'suppressed',
            suppressedReason: evtType,
            suppressedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.prospect.id, tags.prospectId))
      }
    } catch (err) {
      console.warn('[webhook.resend.prospect]', err)
    }
    return NextResponse.json({ ok: true })
  }

  if (!campaignId) return NextResponse.json({ ok: true, ignored: 'no campaignId tag' })

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
