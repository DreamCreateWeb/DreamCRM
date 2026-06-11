import { NextResponse } from 'next/server'
import { and, count, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getTenantContext } from '@/lib/auth/context'
import { getInboxStats } from '@/lib/services/patient-messaging'
import { getLeadCounts } from '@/lib/services/leads'

/**
 * GET /api/nav-badges
 *
 * Sidebar unread-badge counts for the CLINIC dashboard. Polled by
 * components/ui/tenant-sidebar.tsx (60s + on focus) so the Messages / Leads /
 * Shop nav entries show a live "needs attention" count without a page reload.
 *
 * Clinic tenants only — platform + patient contexts get zeroed counts (no badges
 * on their sidebars). The shape is stable so the client can render defensively.
 *
 * Counts:
 *   - messages: unread patient threads (Patient Communications inbox)
 *   - leads:    leads still in `status='new'` (untriaged website enquiries)
 *   - shop:     paid orders still `fulfillmentStatus='unfulfilled'` (waiting on
 *               the front desk to fulfil)
 */
export interface NavBadgeCounts {
  messages: number
  leads: number
  shop: number
}

const ZERO: NavBadgeCounts = { messages: 0, leads: 0, shop: 0 }

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) {
    return NextResponse.json(ZERO, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  // Badges are a clinic-cockpit affordance; platform + patient sidebars don't
  // surface Messages/Leads/Shop, so there's nothing to count.
  if (ctx.tenantType !== 'clinic') {
    return NextResponse.json(ZERO, { headers: { 'Cache-Control': 'no-store' } })
  }

  const orgId = ctx.organizationId
  // Each count is independent + best-effort — one failing query (e.g. shop
  // tables absent) must not blank out the others. Settle all, default to 0.
  const [messages, leads, shop] = await Promise.all([
    getInboxStats(orgId, ctx.userId)
      .then((s) => s.unread)
      .catch(() => 0),
    getLeadCounts(orgId)
      .then((c) => c.new)
      .catch(() => 0),
    countUnfulfilledPaidOrders(orgId).catch(() => 0),
  ])

  const body: NavBadgeCounts = { messages, leads, shop }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}

/** Cheap count of paid-but-unfulfilled shop orders for the org. */
async function countUnfulfilledPaidOrders(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.shopOrder)
    .where(
      and(
        eq(schema.shopOrder.organizationId, organizationId),
        eq(schema.shopOrder.status, 'paid'),
        eq(schema.shopOrder.fulfillmentStatus, 'unfulfilled'),
      ),
    )
  return Number(row?.c ?? 0)
}
