import 'server-only'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export async function getDashboardKpis() {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [customerCount] = await db
    .select({ count: sql<number>`count(${schema.customers.id})::int` })
    .from(schema.customers)
    .where(eq(schema.customers.archived, false))

  const [revenue] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.invoices.totalCents}), 0)::int`,
      paidCount: sql<number>`count(${schema.invoices.id})::int`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.status, 'paid'))

  const [orderTotals] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
      count: sql<number>`count(${schema.orders.id})::int`,
    })
    .from(schema.orders)

  const [openTasks] = await db
    .select({ count: sql<number>`count(${schema.tasks.id})::int` })
    .from(schema.tasks)
    .where(sql`${schema.tasks.status} in ('todo', 'in_progress')`)

  const [activeCampaigns] = await db
    .select({ count: sql<number>`count(${schema.campaigns.id})::int` })
    .from(schema.campaigns)
    .where(sql`${schema.campaigns.status} in ('active', 'scheduled')`)

  const [newSignups] = await db
    .select({ count: sql<number>`count(${schema.user.id})::int` })
    .from(schema.user)
    .where(gte(schema.user.createdAt, since30))

  const [mrr] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.invoices.totalCents}), 0)::int`,
    })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.status, 'paid'), gte(schema.invoices.issueDate, since30.toISOString().slice(0, 10))))

  return {
    customerCount: customerCount?.count ?? 0,
    revenueCents: revenue?.total ?? 0,
    paidInvoiceCount: revenue?.paidCount ?? 0,
    orderTotalCents: orderTotals?.total ?? 0,
    orderCount: orderTotals?.count ?? 0,
    openTaskCount: openTasks?.count ?? 0,
    activeCampaignCount: activeCampaigns?.count ?? 0,
    newSignups30d: newSignups?.count ?? 0,
    mrrCents: mrr?.total ?? 0,
  }
}

export async function getAnalyticsKpis() {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [totals] = await db
    .select({
      events: sql<number>`count(${schema.analyticsEvents.id})::int`,
      uniqueUsers: sql<number>`count(distinct ${schema.analyticsEvents.userId})::int`,
    })
    .from(schema.analyticsEvents)
    .where(gte(schema.analyticsEvents.occurredAt, since30))

  const top = await db
    .select({
      name: schema.analyticsEvents.name,
      count: sql<number>`count(${schema.analyticsEvents.id})::int`,
    })
    .from(schema.analyticsEvents)
    .where(gte(schema.analyticsEvents.occurredAt, since30))
    .groupBy(schema.analyticsEvents.name)
    .orderBy(sql`count(${schema.analyticsEvents.id}) desc`)
    .limit(5)

  return {
    totalEvents30d: totals?.events ?? 0,
    uniqueUsers30d: totals?.uniqueUsers ?? 0,
    topEvents: top,
  }
}
