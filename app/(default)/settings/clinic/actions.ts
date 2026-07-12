'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { publishRealtime } from '@/lib/services/realtime'
import { clinicProfile } from '@/lib/db/schema/platform'
import { emailAccount } from '@/lib/db/schema/email'
import { organization } from '@/lib/db/schema/auth'
import { requireTenant } from '@/lib/auth/context'
import { parseHours, clean } from '@/lib/clinic-content-parse'

// Re-exported for back-compat with any importer that pulled the type from here.
export type { HoursEntry } from '@/lib/clinic-content-parse'

export async function updateClinicProfile(formData: FormData) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can edit profile')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can edit clinic profile')
  }

  const orgId = ctx.organizationId
  const displayName = clean('displayName', formData)
  const legalName = clean('legalName', formData)
  const phone = clean('phone', formData)
  const email = clean('email', formData)
  // Display name patients see in the "From" of clinic→patient email. Null falls
  // back to the clinic display name in getClinicSenderIdentity.
  const emailSenderName = clean('emailSenderName', formData)
  // Tier 2 — the connected Google mailbox to send patient email from. Validated
  // to belong to this org so a client can't point it at another clinic's account.
  let emailSendingAccountId = clean('emailSendingAccountId', formData)
  if (emailSendingAccountId) {
    const [acct] = await db
      .select({ id: emailAccount.id })
      .from(emailAccount)
      .where(and(eq(emailAccount.id, emailSendingAccountId), eq(emailAccount.organizationId, orgId)))
      .limit(1)
    if (!acct) emailSendingAccountId = null
  }
  const addressLine1 = clean('addressLine1', formData)
  const addressLine2 = clean('addressLine2', formData)
  const city = clean('city', formData)
  const state = clean('state', formData)
  const postalCode = clean('postalCode', formData)
  const country = clean('country', formData, 'US')
  const logoUrl = clean('logoUrl', formData)
  const hours = parseHours(formData)
  const timezone = clean('timezone', formData)

  // IDENTITY ONLY. This form owns the shared business identity (names,
  // contact, address, hours, timezone, logo) — every website-content column
  // (tagline/about/brand/hero/services/staff/stats/photos/faq/carriers/
  // payments/financing/cancellation/template) now lives in the Website
  // workspace with per-section scoped saves. Keeping them out of this payload
  // is load-bearing: this action writes whatever is in the payload, so a
  // website column here would be NULLED by every identity save that doesn't
  // round-trip it. tests/settings/clinic-actions.test.ts pins the exclusion.
  const payload = {
    // The clinic deliberately authoring hours/address/phone flags all three
    // manually-edited so an automatic Google sync respects the edit (an
    // explicit "Sync from Google" force still overrides).
    hoursSource: 'manual' as const,
    addressSource: 'manual' as const,
    phoneSource: 'manual' as const,
    displayName,
    legalName,
    phone,
    email,
    emailSenderName,
    emailSendingAccountId,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    logoUrl,
    hours,
    timezone,
  }

  await db
    .insert(clinicProfile)
    .values({ organizationId: orgId, ...payload })
    .onConflictDoUpdate({
      target: clinicProfile.organizationId,
      set: { ...payload, updatedAt: new Date() },
    })

  if (displayName) {
    await db.update(organization).set({ name: displayName }).where(eq(organization.id, orgId))
  }

  revalidatePath('/settings/clinic')
  // Live: any teammate viewing settings sees the change without a refresh.
  await publishRealtime(orgId, 'settings', { section: 'clinic' })
  revalidatePath('/website')
  revalidatePath('/website/editor')
  // 'layout' cascades to every public subpage (/about, /team, /faq, /insurance,
  // /payment-financing, /services/*, …) — without it only the home page
  // refreshed, so a hours/tagline/about/staff edit looked stale everywhere else.
  revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
}
