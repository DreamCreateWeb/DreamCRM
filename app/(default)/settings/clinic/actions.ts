'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { publishRealtime } from '@/lib/services/realtime'
import { clinicProfile } from '@/lib/db/schema/platform'
import { emailAccount } from '@/lib/db/schema/email'
import { organization } from '@/lib/db/schema/auth'
import { requireTenant } from '@/lib/auth/context'
import {
  parseServices,
  parseStaff,
  parseStats,
  parseOfficePhotos,
  parseFaq,
  parseStringList,
  parseFinancingPartners,
  parseHours,
  clean,
} from '@/lib/clinic-content-parse'

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
  const tagline = clean('tagline', formData)
  const about = clean('about', formData)
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
  const brandColor = clean('brandColor', formData)
  const template = clean('template', formData, 'modern')
  const logoUrl = clean('logoUrl', formData)
  const heroImageUrl = clean('heroImageUrl', formData)
  // URL only for v1 — no in-product video uploader yet. Clinics paste a public
  // mp4/webm URL; when set, the public "Why us?" media plays as an ambient loop.
  const differenceVideoUrl = clean('differenceVideoUrl', formData)
  const services = parseServices(formData.get('services')?.toString())
  const staff = parseStaff(formData.get('staff')?.toString())
  const stats = parseStats(formData.get('stats')?.toString())
  const officePhotos = parseOfficePhotos(formData.get('officePhotos')?.toString())
  const faq = parseFaq(formData.get('faq')?.toString())
  const acceptedInsuranceCarriers = parseStringList(
    formData.get('acceptedInsuranceCarriers')?.toString(),
  )
  const paymentMethods = parseStringList(formData.get('paymentMethods')?.toString())
  const financingPartners = parseFinancingPartners(
    formData.get('financingPartners')?.toString(),
  )
  const cancellationPolicy = clean('cancellationPolicy', formData)
  const hours = parseHours(formData)
  const timezone = clean('timezone', formData)

  const payload = {
    // This mega-form is the clinic deliberately authoring hours/address/phone,
    // so flag all three as manually-edited. A later automatic Google sync then
    // respects the edit (only an explicit "Sync from Google" force overrides).
    hoursSource: 'manual' as const,
    addressSource: 'manual' as const,
    phoneSource: 'manual' as const,
    displayName,
    legalName,
    tagline,
    about,
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
    brandColor,
    template,
    logoUrl,
    heroImageUrl,
    differenceVideoUrl,
    hours,
    timezone,
    services,
    staff,
    stats,
    // testimonials is deliberately NOT here — clinic_profile.testimonials is
    // now owned by the Reviews module (Google auto-feature + patient-linked
    // legacy entries). This mega-form must never touch it, or every save here
    // would silently overwrite/null it out from under Reviews.
    officePhotos,
    faq,
    acceptedInsuranceCarriers,
    paymentMethods,
    financingPartners,
    cancellationPolicy,
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
