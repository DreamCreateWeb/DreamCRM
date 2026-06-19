import 'server-only'
import { and, desc, eq, gte, ilike, ne, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { applyBundleGate, getVisibleModules } from '@/lib/modules'
import { getActiveBundlesForSidebar } from '@/lib/services/integration-bundles'
import type { BundleId } from '@/lib/integrations/bundles'
import type { TenantContext } from '@/lib/auth/context'
import type { SearchGroup, SearchResult } from '@/lib/types/global-search'

/**
 * Global ⌘K search — one query box across the whole system, so the front
 * desk stops thinking in modules ("is this a Patients thing or a Messages
 * thing?") and starts thinking in people. Tenant-aware and org-scoped on
 * every branch; entity searches run in parallel with LIMIT-capped ILIKE
 * lookups (the people tables already carry name/email indexes).
 */

const ENTITY_LIMIT = 5

/** Escape LIKE wildcards so a literal "%" in the query can't scan-bomb.
 *  Exported for unit testing. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}

/** Static page index per tenant — sidebar modules (plan/role + integration-
 *  bundle gated, so ⌘K mirrors the sidebar) plus the settings subpages the
 *  sidebar doesn't list. */
function pageIndex(ctx: TenantContext, activeBundles: ReadonlySet<BundleId>): SearchResult[] {
  const modules = applyBundleGate(getVisibleModules(ctx.tenantType, ctx.planTier, ctx.role), activeBundles).map((m) => ({
    id: `page-${m.id}`,
    label: m.label,
    sublabel: m.section ?? null,
    href: m.path,
    kind: 'page' as const,
  }))
  if (ctx.tenantType !== 'clinic') return modules
  const settingsPages: SearchResult[] = [
    { id: 'page-settings-clinic', label: 'Clinic profile settings', sublabel: 'Settings', href: '/settings/clinic', kind: 'page' },
    { id: 'page-settings-portal', label: 'Patient portal settings', sublabel: 'Settings', href: '/settings/portal', kind: 'page' },
    { id: 'page-settings-team', label: 'Team & invites', sublabel: 'Settings', href: '/settings/team', kind: 'page' },
    { id: 'page-settings-locations', label: 'Locations', sublabel: 'Settings', href: '/settings/locations', kind: 'page' },
    { id: 'page-settings-plan', label: 'Plan & billing', sublabel: 'Settings', href: '/settings/plans', kind: 'page' },
    { id: 'page-settings-apps', label: 'Connected accounts', sublabel: 'Settings', href: '/settings/apps', kind: 'page' },
  ]
  return [...modules, ...settingsPages]
}

/** Quick actions surfaced when the palette is empty (and matched by text). */
function quickActions(ctx: TenantContext, activeBundles: ReadonlySet<BundleId>): SearchResult[] {
  if (ctx.tenantType !== 'clinic') return []
  const actions: SearchResult[] = [
    { id: 'act-add-patient', label: 'Add a patient', sublabel: 'Quick action', href: '/patients?new=1', kind: 'action' },
    { id: 'act-agenda-today', label: 'Open today’s agenda', sublabel: 'Quick action', href: '/appointments?window=today', kind: 'action' },
    { id: 'act-edit-site', label: 'Edit my website', sublabel: 'Quick action', href: '/website', kind: 'action' },
    { id: 'act-preview-portal', label: 'Preview the patient portal', sublabel: 'Quick action', href: '/settings/portal/preview', kind: 'action' },
  ]
  // Quick actions follow the same plan + bundle gates as their pages.
  const visible = new Set(
    applyBundleGate(getVisibleModules(ctx.tenantType, ctx.planTier, ctx.role), activeBundles).map((m) => m.path),
  )
  return actions.filter((a) => {
    if (a.href.startsWith('/patients')) return visible.has('/patients')
    if (a.href.startsWith('/appointments')) return visible.has('/appointments')
    return true
  })
}

async function searchClinicEntities(orgId: string, q: string): Promise<SearchGroup[]> {
  const pattern = likePattern(q)

  const [patients, leads, visits, threads, shopOrders] = await Promise.all([
    db
      .select({
        id: schema.patient.id,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
        email: schema.patient.email,
        phone: schema.patient.phone,
      })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, orgId),
          eq(schema.patient.isActive, 1),
          or(
            ilike(sql`${schema.patient.firstName} || ' ' || ${schema.patient.lastName}`, pattern),
            ilike(schema.patient.email, pattern),
            ilike(schema.patient.phone, pattern),
            // …or the patient carries a tag whose name matches (search by tag —
            // "vip", "anxious" surfaces everyone you've labelled that way).
            sql`exists (select 1 from ${schema.patientTagAssignment} ta join ${schema.patientTag} tg on tg.id = ta.tag_id where ta.patient_id = ${schema.patient.id} and ta.organization_id = ${orgId} and tg.name ilike ${pattern})`,
          ),
        ),
      )
      .limit(ENTITY_LIMIT),
    db
      .select({
        id: schema.lead.id,
        name: schema.lead.name,
        email: schema.lead.email,
        status: schema.lead.status,
      })
      .from(schema.lead)
      .where(
        and(
          eq(schema.lead.organizationId, orgId),
          or(
            ilike(schema.lead.name, pattern),
            ilike(schema.lead.email, pattern),
            ilike(schema.lead.phone, pattern),
          ),
        ),
      )
      .limit(4),
    db
      .select({
        id: schema.appointment.id,
        type: schema.appointment.type,
        startTime: schema.appointment.startTime,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
      })
      .from(schema.appointment)
      .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
      .where(
        and(
          eq(schema.appointment.organizationId, orgId),
          gte(schema.appointment.startTime, new Date()),
          ne(schema.appointment.status, 'cancelled'),
          ne(schema.appointment.status, 'no_show'),
          ilike(sql`${schema.patient.firstName} || ' ' || ${schema.patient.lastName}`, pattern),
        ),
      )
      .orderBy(schema.appointment.startTime)
      .limit(4),
    db
      .select({
        id: schema.patientThread.id,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
        status: schema.patientThread.status,
      })
      .from(schema.patientThread)
      .innerJoin(schema.patient, eq(schema.patientThread.patientId, schema.patient.id))
      .where(
        and(
          eq(schema.patientThread.organizationId, orgId),
          ilike(sql`${schema.patient.firstName} || ' ' || ${schema.patient.lastName}`, pattern),
        ),
      )
      .limit(3),
    // Shop orders — match the linked patient's name, the order email, or any
    // product name on the order (EXISTS over shop_order_item).
    db
      .select({
        id: schema.shopOrder.id,
        name: schema.shopOrder.name,
        email: schema.shopOrder.email,
        status: schema.shopOrder.status,
        totalCents: schema.shopOrder.totalCents,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
      })
      .from(schema.shopOrder)
      .leftJoin(schema.patient, eq(schema.shopOrder.patientId, schema.patient.id))
      .where(
        and(
          eq(schema.shopOrder.organizationId, orgId),
          or(
            ilike(schema.shopOrder.email, pattern),
            ilike(schema.shopOrder.name, pattern),
            ilike(sql`${schema.patient.firstName} || ' ' || ${schema.patient.lastName}`, pattern),
            sql`exists (select 1 from ${schema.shopOrderItem} oi where oi.order_id = ${schema.shopOrder.id} and oi.product_name ilike ${pattern})`,
          ),
        ),
      )
      .orderBy(desc(schema.shopOrder.createdAt))
      .limit(4),
  ])

  const fmtWhen = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const groups: SearchGroup[] = []
  if (patients.length > 0) {
    groups.push({
      label: 'Patients',
      results: patients.map((p) => ({
        id: `pat-${p.id}`,
        label: `${p.firstName} ${p.lastName}`,
        sublabel: p.email ?? p.phone ?? null,
        href: `/patients/${p.id}`,
        kind: 'patient',
      })),
    })
  }
  if (visits.length > 0) {
    groups.push({
      label: 'Upcoming visits',
      results: visits.map((v) => ({
        id: `apt-${v.id}`,
        label: `${v.firstName} ${v.lastName} — ${v.type.replace('_', ' ')}`,
        sublabel: fmtWhen(v.startTime),
        href: `/appointments?q=${encodeURIComponent(`${v.firstName} ${v.lastName}`)}`,
        kind: 'appointment',
      })),
    })
  }
  if (leads.length > 0) {
    groups.push({
      label: 'Leads',
      results: leads.map((l) => ({
        id: `lead-${l.id}`,
        label: l.name,
        sublabel: l.email ? `${l.status} · ${l.email}` : l.status,
        href: `/leads?status=all&q=${encodeURIComponent(l.name)}`,
        kind: 'lead',
      })),
    })
  }
  if (threads.length > 0) {
    groups.push({
      label: 'Conversations',
      results: threads.map((t) => ({
        id: `thr-${t.id}`,
        label: `${t.firstName} ${t.lastName}`,
        sublabel: t.status === 'open' ? 'Open thread' : t.status,
        href: `/messages?thread=${t.id}`,
        kind: 'thread',
      })),
    })
  }
  if (shopOrders.length > 0) {
    groups.push({
      label: 'Shop orders',
      results: shopOrders.map((o) => {
        const who = o.firstName ? `${o.firstName} ${o.lastName ?? ''}`.trim() : o.name || o.email
        return {
          id: `order-${o.id}`,
          label: `${who} — $${(o.totalCents / 100).toFixed(2)}`,
          sublabel: o.status === 'paid' ? 'Paid order' : o.status,
          href: '/shop/orders',
          // Reuse the 'page' kind so the ⌘K modal's exhaustive glyph map stays
          // valid without a shared-type change (it navigates to a page anyway).
          kind: 'page',
        }
      }),
    })
  }
  return groups
}

async function searchPlatformEntities(q: string): Promise<SearchGroup[]> {
  const pattern = likePattern(q)
  const clinics = await db
    .select({ id: schema.organization.id, name: schema.organization.name, slug: schema.organization.slug })
    .from(schema.organization)
    .where(and(eq(schema.organization.type, 'clinic'), ilike(schema.organization.name, pattern)))
    .limit(ENTITY_LIMIT)
  if (clinics.length === 0) return []
  return [
    {
      label: 'Clinics',
      results: clinics.map((c) => ({
        id: `org-${c.id}`,
        label: c.name,
        sublabel: c.slug,
        href: '/ecommerce/customers',
        kind: 'clinic' as const,
      })),
    },
  ]
}

export async function globalSearch(ctx: TenantContext, rawQuery: string): Promise<SearchGroup[]> {
  const q = rawQuery.trim()

  // The active integration bundles gate which feature pages exist (Social Posts,
  // Shop) so ⌘K never offers a page the sidebar is hiding. Clinic-only; cheap.
  const activeBundles: ReadonlySet<BundleId> =
    ctx.tenantType === 'clinic' ? await getActiveBundlesForSidebar(ctx.organizationId) : new Set<BundleId>()

  // Empty query → the launcher view: quick actions + the page index.
  if (q.length === 0) {
    const groups: SearchGroup[] = []
    const actions = quickActions(ctx, activeBundles)
    if (actions.length > 0) groups.push({ label: 'Quick actions', results: actions })
    groups.push({ label: 'Go to', results: pageIndex(ctx, activeBundles).slice(0, 8) })
    return groups
  }
  if (q.length < 2) return []

  const lower = q.toLowerCase()
  const pageMatches = [...quickActions(ctx, activeBundles), ...pageIndex(ctx, activeBundles)].filter((p) =>
    p.label.toLowerCase().includes(lower),
  )

  const entityGroups =
    ctx.tenantType === 'clinic'
      ? await searchClinicEntities(ctx.organizationId, q)
      : ctx.tenantType === 'platform'
        ? await searchPlatformEntities(q)
        : []

  const groups = [...entityGroups]
  if (pageMatches.length > 0) groups.push({ label: 'Go to', results: pageMatches.slice(0, 6) })
  return groups
}
