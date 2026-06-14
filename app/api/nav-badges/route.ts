import { NextResponse } from 'next/server'
import { and, count, eq, gt } from 'drizzle-orm'
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
 *   - messages: unread patient threads (Patient Communications inbox) — a true
 *               unread count; drops as threads are read
 *   - leads:    new (`status='new'`) leads; when `?leadsSince=<epochMs>` is
 *               passed, only those created since (the "new since you looked"
 *               nudge — the sidebar clears it on visit, see tenant-sidebar.tsx)
 *   - shop:     paid + `unfulfilled` orders; when `?shopSince=<epochMs>` is
 *               passed, only those paid since
 *
 * The `*Since` params let the sidebar reset the leads/shop badge the moment you
 * open that module, then tick it back up only for genuinely new arrivals —
 * without that, standing backlog would pin the number forever.
 */
export interface NavBadgeCounts {
  messages: number
  leads: number
  shop: number
}

const ZERO: NavBadgeCounts = { messages: 0, leads: 0, shop: 0 }

/** Parse an epoch-ms query param into a Date, or null if absent/invalid. */
function parseSince(raw: string | null): Date | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? new Date(n) : null
}

export async function GET(req: Request) {
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
  const url = new URL(req.url)
  const leadsSince = parseSince(url.searchParams.get('leadsSince'))
  const shopSince = parseSince(url.searchParams.get('shopSince'))

  // Each count is independent + best-effort — one failing query (e.g. shop
  // tables absent) must not blank out the others. Settle all, default to 0.
  const [messages, leads, shop] = await Promise.all([
    getInboxStats(orgId, ctx.userId)
      .then((s) => s.unread)
      .catch(() => 0),
    countNewLeads(orgId, leadsSince).catch(() => 0),
    countUnfulfilledPaidOrders(orgId, shopSince).catch(() => 0),
  ])

  const body: NavBadgeCounts = { messages, leads, shop }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}

/** New (untriaged) leads — all, or only those created after `since`. */
async function countNewLeads(organizationId: string, since: Date | null): Promise<number> {
  if (!since) {
    const c = await getLeadCounts(organizationId)
    return c.new
  }
  const [row] = await db
    .select({ c: count() })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.status, 'new'),
        gt(schema.lead.createdAt, since),
      ),
    )
  return Number(row?.c ?? 0)
}

/** Paid-but-unfulfilled shop orders — all, or only those paid after `since`. */
async function countUnfulfilledPaidOrders(organizationId: string, since: Date | null): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.shopOrder)
    .where(
      and(
        eq(schema.shopOrder.organizationId, organizationId),
        eq(schema.shopOrder.status, 'paid'),
        eq(schema.shopOrder.fulfillmentStatus, 'unfulfilled'),
        ...(since ? [gt(schema.shopOrder.paidAt, since)] : []),
      ),
    )
  return Number(row?.c ?? 0)
}
