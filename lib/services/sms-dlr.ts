import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { classifySmsDlr, type SmsDlrPayload } from '@/lib/sms-dlr'

/**
 * Record one SMS delivery receipt (Phase 5 limb 3). The correlation key is
 * the provider message id stamped at send time on whichever ledger the send
 * came from:
 *
 *   - a reminder text  → appointment_reminder_log.provider_message_id;
 *     a DELIVERED receipt stamps the deliveredAt column that has waited for
 *     this since the table was born. A failure stamps nothing — a null
 *     deliveredAt is already the honest state.
 *   - a campaign text  → the campaign_events 'sent' row; the receipt mints
 *     a sibling row ('delivered', or 'bounce' for a terminal failure) with
 *     the same attribution columns, exactly the shape the email funnel
 *     reads. Both rows carry the message id, so SNS redelivery dedupes on
 *     one indexed read.
 *
 * Never throws — the webhook must 200 whatever happens (SNS retries any
 * non-2xx, and a poison receipt must not redeliver forever).
 */
export async function recordSmsDlr(payload: SmsDlrPayload): Promise<{
  outcome: 'reminder_delivered' | 'campaign_receipt' | 'interim' | 'unmatched' | 'ignored'
}> {
  const verdict = classifySmsDlr(payload)
  if (verdict === 'interim') return { outcome: 'interim' }

  try {
    // The reminder ledger first: one indexed update, idempotent by the
    // deliveredAt-is-null guard (a redelivered receipt matches zero rows).
    if (verdict === 'delivered') {
      const stamped = await db
        .update(schema.appointmentReminderLog)
        .set({ deliveredAt: new Date() })
        .where(
          and(
            eq(schema.appointmentReminderLog.providerMessageId, payload.messageId),
            isNull(schema.appointmentReminderLog.deliveredAt),
          ),
        )
        .returning({ id: schema.appointmentReminderLog.id })
      if (stamped.length > 0) return { outcome: 'reminder_delivered' }
    }

    // The campaign ledger: find the 'sent' row this receipt belongs to.
    const rows = await db
      .select({
        id: schema.campaignEvents.id,
        type: schema.campaignEvents.type,
        campaignId: schema.campaignEvents.campaignId,
        recipientEmail: schema.campaignEvents.recipientEmail,
        recipientPhone: schema.campaignEvents.recipientPhone,
        customerId: schema.campaignEvents.customerId,
        patientId: schema.campaignEvents.patientId,
      })
      .from(schema.campaignEvents)
      .where(eq(schema.campaignEvents.providerMessageId, payload.messageId))
    const sentRow = rows.find((r) => r.type === 'sent')
    if (!sentRow) {
      // A receipt for a send no ledger knows (a keyword confirmation, a
      // /messages reply, or a legacy row from before the column existed).
      // Acknowledged — there is nothing to attribute it to.
      return { outcome: 'unmatched' }
    }

    const receiptType = verdict === 'delivered' ? ('delivered' as const) : ('bounce' as const)
    if (rows.some((r) => r.type === receiptType)) {
      // SNS redelivered a receipt we already recorded.
      return { outcome: 'campaign_receipt' }
    }

    await db.insert(schema.campaignEvents).values({
      campaignId: sentRow.campaignId,
      recipientEmail: sentRow.recipientEmail,
      recipientPhone: sentRow.recipientPhone,
      customerId: sentRow.customerId,
      patientId: sentRow.patientId,
      type: receiptType,
      providerMessageId: payload.messageId,
      meta: {
        channel: 'twilio_sms',
        messageStatus: payload.messageStatus,
        ...(payload.messageStatusDescription ? { statusDescription: payload.messageStatusDescription } : {}),
      },
    })
    return { outcome: 'campaign_receipt' }
  } catch (e) {
    console.error('[sms-dlr] receipt not recorded', e)
    return { outcome: 'ignored' }
  }
}
