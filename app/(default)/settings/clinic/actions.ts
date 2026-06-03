'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { requireTenant } from '@/lib/auth/context'
import {
  parseServices,
  parseStaff,
  parseStats,
  parseTestimonials,
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
  const testimonials = parseTestimonials(formData.get('testimonials')?.toString())
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

  const payload = {
    displayName,
    legalName,
    tagline,
    about,
    phone,
    email,
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
    services,
    staff,
    stats,
    testimonials,
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
  revalidatePath('/website')
  revalidatePath(`/site/${ctx.organizationSlug}`)
}
