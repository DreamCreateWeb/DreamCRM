import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { deliver, patientEmailShell } from '@/lib/email'
import { getClinicSenderIdentity } from './clinic-sender'
import { renderAutomatedEmail } from './email-automations'
import { normalizeTrackingUrl } from '@/lib/types/shop'

/**
 * The two emails every shop sends (ML-42): "ready for pickup" and "shipped".
 * Both go from the clinic's own sender through the branded patient shell, are
 * the clinic-editable `shop_ready_for_pickup` / `shop_shipped` automations
 * (toggleable in the Shop group), and speak ONCE per order: the send is
 * CLAIMED first (`UPDATE … SET <col>=now WHERE <col> IS NULL RETURNING`), so a
 * double click or a re-marked status finds the claim taken and stays quiet.
 * A send that fails releases its claim so the next try can speak. Best-effort:
 * never throws, because the status change has already happened.
 */

export type ShopOrderEmailKind = 'ready' | 'shipped'
export type ShopOrderEmailResult = 'sent' | 'already' | 'off' | 'not_applicable' | 'failed'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const CLAIM_COL = { ready: 'readyEmailAt', shipped: 'shippedEmailAt' } as const

export async function sendShopOrderEmail(
  organizationId: string,
  orderId: string,
  kind: ShopOrderEmailKind,
): Promise<ShopOrderEmailResult> {
  const col = CLAIM_COL[kind]
  let claimed = false
  try {
    const [order] = await db
      .select()
      .from(schema.shopOrder)
      .where(and(eq(schema.shopOrder.organizationId, organizationId), eq(schema.shopOrder.id, orderId)))
      .limit(1)
    if (!order || !order.email) return 'not_applicable'
    // Pickup orders hear "ready", shipped orders hear "shipped" — and only
    // once the order is actually paid (never a pending checkout).
    if (order.status !== 'paid') return 'not_applicable'
    if (kind === 'ready' && order.fulfillmentType !== 'pickup') return 'not_applicable'
    if (kind === 'shipped' && order.fulfillmentType !== 'ship') return 'not_applicable'

    const key = kind === 'ready' ? 'shop_ready_for_pickup' : 'shop_shipped'
    const sender = await getClinicSenderIdentity(organizationId)
    const [profile] = await db
      .select({ phone: schema.clinicProfile.phone })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    const items = await db
      .select({ name: schema.shopOrderItem.productName, variant: schema.shopOrderItem.variantName, qty: schema.shopOrderItem.quantity })
      .from(schema.shopOrderItem)
      .where(and(eq(schema.shopOrderItem.organizationId, organizationId), eq(schema.shopOrderItem.orderId, orderId)))
    const tracking = kind === 'shipped' ? order.trackingNumber?.trim() || '' : ''
    const rendered = await renderAutomatedEmail(organizationId, key, {
      firstName: (order.name ?? '').trim().split(/\s+/)[0] ?? '',
      clinicName: sender.name,
      clinicPhone: profile?.phone ?? '',
      trackingNumber: tracking,
    })
    if (!rendered.enabled) return 'off'

    // Claim the one send for this (order, kind) before any network call.
    const won = await db
      .update(schema.shopOrder)
      .set({ [col]: new Date() })
      .where(and(eq(schema.shopOrder.organizationId, organizationId), eq(schema.shopOrder.id, orderId), isNull(schema.shopOrder[col])))
      .returning({ id: schema.shopOrder.id })
    if (won.length === 0) return 'already'
    claimed = true

    const itemsHtml = items.length
      ? `<ul style="margin:14px 0 0;padding-left:18px;">${items
          .map((i) => `<li>${escapeHtml(`${i.qty}× ${i.name}${i.variant ? ` · ${i.variant}` : ''}`)}</li>`)
          .join('')}</ul>`
      : ''
    const trackingLink = kind === 'shipped' ? normalizeTrackingUrl(order.trackingUrl) : null
    const trackingHtml = [
      tracking ? `<p style="margin:14px 0 0;">Tracking number: <strong>${escapeHtml(tracking)}</strong></p>` : '',
      trackingLink
        ? `<p style="margin:14px 0 0;"><a href="${escapeHtml(trackingLink)}">Track your package</a></p>`
        : '',
    ].join('')
    await deliver({
      to: order.email,
      from: sender.from,
      replyTo: sender.replyTo,
      gmail: sender.gmail,
      subject: rendered.full.subject,
      html: patientEmailShell({
        sender,
        title: kind === 'ready' ? 'Your order is ready' : 'Your order is on its way',
        body: `${escapeHtml(rendered.full.body).replace(/\n/g, '<br>')}${trackingHtml}${itemsHtml}`,
        preheader: kind === 'ready' ? `Your order at ${sender.name} is ready for pickup.` : `Your order from ${sender.name} has shipped.`,
        footnoteHtml: `Order ${escapeHtml(order.id.slice(0, 8).toUpperCase())} · ${escapeHtml(sender.name)}`,
      }),
    })
    return 'sent'
  } catch (err) {
    console.warn('[shop] order email failed', err)
    if (claimed) {
      // Release the claim so a retry can speak; best-effort.
      await db
        .update(schema.shopOrder)
        .set({ [col]: null })
        .where(and(eq(schema.shopOrder.organizationId, organizationId), eq(schema.shopOrder.id, orderId)))
        .catch(() => undefined)
    }
    return 'failed'
  }
}
