import 'server-only'
import { and, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import {
  agencyProject,
  clinicProfile,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'

function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}
function isStripeUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /STRIPE_SECRET_KEY|Stripe(Authentication|Connection)Error|fetch failed/i.test(msg)
}

const ACTIVE_STATUSES: AgencyProjectStatus[] = ['lead', 'discovery', 'in_progress', 'review']

// ─────────────────────────────────────────────────────────────────────────────
// Attention items — what a Dream Create admin needs to act on today.
// ─────────────────────────────────────────────────────────────────────────────

export interface AttentionItem {
  kind: 'past_due_invoice' | 'stalled_project' | 'overdue_project' | 'new_signup'
  title: string
  subtitle: string | null
  href: string | null
  amountCents?: number
  ts: Date
}

export interface AttentionSummary {
  total: number
  pastDueInvoiceCount: number
  pastDueInvoiceCents: number
  stalledProjectCount: number
  overdueProjectCount: number
  newSignupCount: number
  items: AttentionItem[]
  stripeUnavailable: boolean
}

/**
 * One call returns everything the Overview needs to render its
 * "Needs Your Attention" panel — capped to the most-recent N items per kind.
 */
export async function getAttentionItems(opts: { perKind?: number } = {}): Promise<AttentionSummary> {
  const perKind = opts.perKind ?? 3
  const items: AttentionItem[] = []
  let stripeUnavailable = false

  // ── Past-due Stripe invoices ────────────────────────────────────────────
  let pastDueInvoiceCount = 0
  let pastDueInvoiceCents = 0
  let invoiceCustomers: Array<{ customerId: string; amountCents: number; created: number; invoiceId: string }> = []
  try {
    const open = await stripe.invoices.list({ status: 'open', limit: 25 })
    pastDueInvoiceCount = open.data.length
    pastDueInvoiceCents = open.data.reduce((s: number, inv: Stripe.Invoice) => s + inv.amount_remaining, 0)
    invoiceCustomers = open.data
      .map((inv: Stripe.Invoice) => ({
        customerId: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? '',
        amountCents: inv.amount_remaining,
        created: inv.created,
        invoiceId: inv.id ?? '',
      }))
      .filter((c) => c.customerId)
  } catch (err) {
    if (isStripeUnavailable(err)) stripeUnavailable = true
    else throw err
  }

  // Resolve Stripe customer IDs back to clinic names in one DB hop
  let customerToClinic = new Map<string, string>()
  if (invoiceCustomers.length) {
    try {
      const rows = await db
        .select({
          custId: clinicProfile.stripeCustomerId,
          display: clinicProfile.displayName,
          orgName: organization.name,
        })
        .from(clinicProfile)
        .leftJoin(organization, eq(organization.id, clinicProfile.organizationId))
      customerToClinic = new Map(
        rows
          .filter((r) => r.custId)
          .map((r) => [r.custId as string, (r.display ?? r.orgName ?? 'Unknown clinic') as string]),
      )
    } catch (err) {
      if (!isMissingSchema(err)) throw err
    }
  }

  for (const inv of invoiceCustomers.slice(0, perKind)) {
    items.push({
      kind: 'past_due_invoice',
      title: `Past-due invoice · ${customerToClinic.get(inv.customerId) ?? 'Unknown clinic'}`,
      subtitle: 'Stripe invoice is open — payment failed or not yet collected',
      href: '/dashboard/fintech',
      amountCents: inv.amountCents,
      ts: new Date(inv.created * 1000),
    })
  }

  // ── Stalled (on_hold) projects ──────────────────────────────────────────
  let stalledProjectCount = 0
  let overdueProjectCount = 0
  let newSignupCount = 0
  try {
    const stalledRows = await db
      .select({
        id: agencyProject.id,
        title: agencyProject.title,
        type: agencyProject.type,
        updatedAt: agencyProject.updatedAt,
        clinicName: organization.name,
      })
      .from(agencyProject)
      .leftJoin(organization, eq(organization.id, agencyProject.organizationId))
      .where(eq(agencyProject.status, 'on_hold'))
      .orderBy(desc(agencyProject.updatedAt))
      .limit(perKind + 10)

    stalledProjectCount = stalledRows.length
    for (const r of stalledRows.slice(0, perKind)) {
      items.push({
        kind: 'stalled_project',
        title: `Stalled · ${r.title}`,
        subtitle: r.clinicName ?? 'Internal project',
        href: '/ecommerce/orders',
        ts: r.updatedAt,
      })
    }

    // ── Overdue (due_date < now AND status still active) ────────────────────
    const overdueRows = await db
      .select({
        id: agencyProject.id,
        title: agencyProject.title,
        type: agencyProject.type,
        dueDate: agencyProject.dueDate,
        clinicName: organization.name,
      })
      .from(agencyProject)
      .leftJoin(organization, eq(organization.id, agencyProject.organizationId))
      .where(
        and(
          sql`${agencyProject.status} in ('lead','discovery','in_progress','review')`,
          isNotNull(agencyProject.dueDate),
          lt(agencyProject.dueDate, new Date()),
        ),
      )
      .orderBy(agencyProject.dueDate)
      .limit(perKind + 10)

    overdueProjectCount = overdueRows.length
    for (const r of overdueRows.slice(0, perKind)) {
      items.push({
        kind: 'overdue_project',
        title: `Overdue · ${r.title}`,
        subtitle: r.clinicName
          ? `${r.clinicName} · due ${r.dueDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : `Due ${r.dueDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        href: '/ecommerce/orders',
        ts: r.dueDate ?? new Date(),
      })
    }

    // ── New clinic signups (last 7 days) ────────────────────────────────────
    const since7 = new Date(Date.now() - 7 * 86_400_000)
    const signupRows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .where(
        and(
          eq(organization.type, 'clinic'),
          gte(organization.createdAt, since7),
          eq(organization.isDemo, false),
        ),
      )
      .orderBy(desc(organization.createdAt))
      .limit(perKind + 10)

    newSignupCount = signupRows.length
    for (const r of signupRows.slice(0, perKind)) {
      items.push({
        kind: 'new_signup',
        title: `New clinic · ${r.name}`,
        subtitle: 'Welcome them and check their website setup',
        href: `/ecommerce/customers/${r.id}`,
        ts: r.createdAt,
      })
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  items.sort((a, b) => b.ts.getTime() - a.ts.getTime())

  return {
    total: pastDueInvoiceCount + stalledProjectCount + overdueProjectCount + newSignupCount,
    pastDueInvoiceCount,
    pastDueInvoiceCents,
    stalledProjectCount,
    overdueProjectCount,
    newSignupCount,
    items,
    stripeUnavailable,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent platform activity — unified feed (signups + project updates + payments)
// Used by the Overview's recent-activity panel.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityKind = 'signup' | 'project_completed' | 'project_started' | 'subscription_paid'

export interface ActivityRow {
  id: string
  kind: ActivityKind
  title: string
  subtitle: string | null
  ts: Date
  amountCents?: number
  /** Where clicking the row goes (v3 action-links law). Null = no surface yet. */
  href?: string | null
}

export async function getRecentPlatformActivity(limit = 12): Promise<{ rows: ActivityRow[]; stripeUnavailable: boolean }> {
  const rows: ActivityRow[] = []
  let stripeUnavailable = false

  // Recent signups (clinic orgs)
  try {
    const signups = await db
      .select({
        id: organization.id,
        name: organization.name,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .where(and(eq(organization.type, 'clinic'), eq(organization.isDemo, false)))
      .orderBy(desc(organization.createdAt))
      .limit(limit)
    for (const s of signups) {
      rows.push({
        id: `signup_${s.id}`,
        kind: 'signup',
        title: `${s.name} joined Dream Create`,
        subtitle: 'New clinic signup',
        ts: s.createdAt,
        href: `/ecommerce/customers/${s.id}`,
      })
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  // Recent project completions + starts (one of each per project)
  try {
    const completed = await db
      .select({
        id: agencyProject.id,
        title: agencyProject.title,
        type: agencyProject.type,
        budget: agencyProject.budgetCents,
        ts: agencyProject.completedAt,
        clinicName: organization.name,
      })
      .from(agencyProject)
      .leftJoin(organization, eq(organization.id, agencyProject.organizationId))
      .where(eq(agencyProject.status, 'completed'))
      .orderBy(desc(agencyProject.completedAt))
      .limit(limit)

    for (const p of completed) {
      if (!p.ts) continue
      rows.push({
        id: `proj_done_${p.id}`,
        kind: 'project_completed',
        title: `${p.title} delivered`,
        subtitle: p.clinicName ?? 'Internal',
        ts: p.ts,
        href: '/ecommerce/orders',
        amountCents: p.budget ?? undefined,
      })
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  // Recent Stripe paid invoices
  let customerToClinic = new Map<string, string>()
  try {
    const paid = await stripe.invoices.list({ status: 'paid', limit })
    if (paid.data.length) {
      const custIds = Array.from(
        new Set(
          paid.data
            .map((i: Stripe.Invoice) => (typeof i.customer === 'string' ? i.customer : i.customer?.id))
            .filter(Boolean) as string[],
        ),
      )
      if (custIds.length) {
        const cm = await db
          .select({
            custId: clinicProfile.stripeCustomerId,
            display: clinicProfile.displayName,
            orgName: organization.name,
          })
          .from(clinicProfile)
          .leftJoin(organization, eq(organization.id, clinicProfile.organizationId))
        customerToClinic = new Map(
          cm
            .filter((r) => r.custId)
            .map((r) => [r.custId as string, (r.display ?? r.orgName ?? 'Unknown clinic') as string]),
        )
      }
      for (const inv of paid.data) {
        const cust = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        const tsSec = inv.status_transitions?.paid_at ?? inv.created
        rows.push({
          id: inv.id ?? `inv_${tsSec}`,
          kind: 'subscription_paid',
          title: 'Subscription payment received',
          subtitle: cust ? customerToClinic.get(cust) ?? 'Unknown clinic' : 'Unknown clinic',
          ts: new Date(tsSec * 1000),
          href: '/ecommerce/invoices',
          amountCents: inv.amount_paid,
        })
      }
    }
  } catch (err) {
    if (isStripeUnavailable(err)) stripeUnavailable = true
    else throw err
  }

  rows.sort((a, b) => b.ts.getTime() - a.ts.getTime())
  return { rows: rows.slice(0, limit), stripeUnavailable }
}
