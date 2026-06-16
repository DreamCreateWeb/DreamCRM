'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { requireTenant } from '@/lib/auth/context'
import { createDemoClinic, seedDemoNotificationsForUser } from '@/lib/services/demo-clinic'
import {
  createManagedClinic,
  resendClinicOwnerInvite,
  type CreateManagedClinicResult,
} from '@/lib/services/clinic-provisioning'
import { cancelSubscriptionNow } from '@/lib/services/stripe-admin'
import type { Role } from '@/lib/modules/types'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'

const DEMO_COOKIE = 'demo_context'
const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (!ctx.platformAdmin) {
    throw new Error('Forbidden: platform admin only')
  }
  return ctx
}

const EnterDemoInput = z.object({
  orgId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member', 'patient']),
  patientId: z.string().optional(),
})

/**
 * Drop a demo_context cookie that getTenantContext picks up to render
 * the rest of the app as if the platform admin were a clinic / patient.
 * Real session is untouched — switching back is a cookie clear.
 */
export async function enterDemoMode(input: unknown) {
  const ctx = await requirePlatformAdmin()
  const data = EnterDemoInput.parse(input)

  // If entering the Acme Dental Demo clinic, run the seeder's self-heal
  // pass so the demo is always on the latest template defaults — picks
  // up new fields (stats, testimonials, officePhotos, etc.) added since
  // the demo was first seeded. No-op for any other org.
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, data.orgId))
    .limit(1)
  if (org?.slug === DEMO_CLINIC_SLUG) {
    await createDemoClinic()
    // The demo org has no member rows, so live notifyOrgMembers events route
    // to platform admins (see notifications.ts). Seed a starter set for THIS
    // admin too — idempotent — so the header bell demos populated the moment
    // they enter, not only after the next live event.
    await seedDemoNotificationsForUser(ctx.userId, data.orgId)
  }

  const cookieStore = await cookies()
  cookieStore.set(DEMO_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEMO_COOKIE_MAX_AGE,
  })
  redirect('/')
}

export async function exitDemoMode() {
  // Don't require platformAdmin here — the cookie is itself the gate,
  // and clearing should always succeed (even if the session has changed
  // mid-demo for some reason).
  const cookieStore = await cookies()
  cookieStore.delete(DEMO_COOKIE)
  redirect('/')
}

/**
 * Seeds Acme Dental Demo clinic with sample patients + appointments + tasks
 * so the demo experience actually shows real data. Idempotent — calling
 * twice returns the existing clinic the second time.
 */
export async function seedDemoClinic() {
  await requirePlatformAdmin()
  const result = await createDemoClinic()
  revalidatePath('/ecommerce/customers')
  return result
}

/**
 * Hard-delete a clinic org. Cascades to clinic_profile, patients,
 * appointments, customers, invoices, intake forms + submissions, notes,
 * conversations / messages, members, invitations, projects — anything
 * with `organization_id` FK that's marked `onDelete: cascade`.
 *
 * If the clinic has an active Stripe subscription we cancel it first so
 * we don't keep billing them post-delete. Cancel failures are logged but
 * don't block the DB delete — the operator already typed-to-confirm.
 *
 * Guards:
 * - platform owner only
 * - org type must be 'clinic' (never delete the platform org itself)
 * - confirmation slug must match (UI requires the operator to type the
 *   clinic slug; we double-check on the server in case the form is
 *   replayed)
 */
const DeleteClinicInput = z.object({
  orgId: z.string().min(1),
  confirmSlug: z.string().min(1),
})

export interface DeleteClinicResult {
  ok: true
  name: string
  subscriptionCanceled: boolean
}

export async function deleteClinicAction(input: unknown): Promise<DeleteClinicResult> {
  const ctx = await requirePlatformAdmin()
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: platform owner or admin only')
  }
  const data = DeleteClinicInput.parse(input)

  const [org] = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug, type: organization.type })
    .from(organization)
    .where(eq(organization.id, data.orgId))
    .limit(1)
  if (!org) throw new Error('Clinic not found')
  if (org.type !== 'clinic') throw new Error(`Refusing to delete org of type '${org.type}' — only clinic tenants can be deleted from here`)
  if (org.slug !== data.confirmSlug) throw new Error('Confirmation slug does not match')

  // Cancel Stripe subscription if one is on file, so we don't bill them
  // after the clinic is gone.
  let subscriptionCanceled = false
  const [profile] = await db
    .select({ stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, org.id))
    .limit(1)
  if (profile?.stripeSubscriptionId) {
    try {
      await cancelSubscriptionNow(profile.stripeSubscriptionId)
      subscriptionCanceled = true
    } catch (err) {
      // Log + continue. A failed cancel doesn't block the delete — the
      // operator confirmed by typing the slug, and a stale Stripe sub on
      // a deleted org is something we'd rather fix manually than block on.
      console.warn('[deleteClinic] failed to cancel Stripe subscription', err)
    }
  }

  // If the current demo_context cookie points at this org, drop it so the
  // platform admin doesn't get stranded "viewing as" a deleted clinic.
  const cookieStore = await cookies()
  const demo = cookieStore.get(DEMO_COOKIE)?.value
  if (demo) {
    try {
      const parsed = JSON.parse(demo) as { orgId?: string }
      if (parsed.orgId === org.id) cookieStore.delete(DEMO_COOKIE)
    } catch {
      /* swallow malformed cookie */
    }
  }

  // Delete in a transaction, clearing memberships first as belt-and-suspenders:
  // membership.plan_id used to be a 'restrict' FK that aborted the WHOLE org
  // cascade when a membership plan had members — leaving the org row (and its
  // slug) stranded, which read as "deleted clinics aren't being cleaned up".
  // The FK is now 'cascade' (migration 0071); clearing memberships up front keeps
  // the delete robust regardless of the live constraint state. Everything else
  // org-scoped is cascade, so dropping the org removes the full clinic.
  await db.transaction(async (tx) => {
    await tx.delete(schema.membership).where(eq(schema.membership.organizationId, org.id))
    await tx.delete(organization).where(and(eq(organization.id, org.id), eq(organization.type, 'clinic')))
  })

  revalidatePath('/ecommerce/customers')
  return { ok: true, name: org.name, subscriptionCanceled }
}

const ManagedPricingInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('standard') }),
  z.object({
    kind: z.literal('percent_off'),
    percentOff: z.number().int().min(1).max(100),
    durationMonths: z.number().int().min(1).max(36).optional(),
  }),
  z.object({
    kind: z.literal('amount_off'),
    amountOffCents: z.number().int().min(50),
    durationMonths: z.number().int().min(1).max(36).optional(),
  }),
  z.object({ kind: z.literal('comped') }),
])

const CreateManagedClinicInput = z.object({
  name: z.string().trim().min(1, 'Clinic name is required').max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  ownerEmail: z.string().trim().email('Enter a valid owner email'),
  ownerName: z.string().trim().min(1, 'Owner name is required').max(120),
  planId: z.enum(['basic', 'pro', 'premium']),
  interval: z.enum(['monthly', 'annual']),
  pricing: ManagedPricingInput,
  note: z.string().trim().max(2000).optional(),
  // Optional referral attribution: which partner referred this clinic + an
  // optional per-clinic % override (basis points).
  referral: z
    .object({
      partnerId: z.string().min(1),
      percentBps: z.number().int().min(0).max(10000).nullable().optional(),
    })
    .optional(),
})

/**
 * Platform admin creates a clinic for a client: org + profile + reserved
 * plan (optionally at a negotiated price via a Stripe coupon, or comped),
 * and emails the owner an invite. The owner activates billing from the
 * in-app banner → checkout with the discount pre-applied.
 */
export async function createManagedClinicAction(input: unknown): Promise<CreateManagedClinicResult> {
  const ctx = await requirePlatformAdmin()
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: platform owner or admin only')
  }
  const data = CreateManagedClinicInput.parse(input)
  const result = await createManagedClinic({
    ...data,
    inviterUserId: ctx.userId,
    inviterName: ctx.userName,
  })
  revalidatePath('/ecommerce/customers')
  return result
}

/** Re-send the pending owner invite for a platform-created clinic. */
export async function resendClinicInviteAction(orgId: string): Promise<{ email: string }> {
  const ctx = await requirePlatformAdmin()
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: platform owner or admin only')
  }
  const result = await resendClinicOwnerInvite({
    organizationId: z.string().min(1).parse(orgId),
    inviterName: ctx.userName,
  })
  return result
}

/**
 * One-click "create demo clinic and immediately switch into it".
 * The usual path the platform admin takes the first time they want to
 * see the clinic dashboard.
 */
export async function seedAndEnterDemoClinic(role: Role = 'owner') {
  await requirePlatformAdmin()
  const result = await createDemoClinic()
  const cookieStore = await cookies()
  cookieStore.set(
    DEMO_COOKIE,
    JSON.stringify({ orgId: result.organizationId, role }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: DEMO_COOKIE_MAX_AGE,
    },
  )
  redirect('/')
}
