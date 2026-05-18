'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { requireTenant } from '@/lib/auth/context'

export interface HoursEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type Day = (typeof DAYS)[number]
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Parse hours[mon].open|close|closed multi-input form fields into a
 * { mon: {open, close, closed}, ... } JSON object suitable for clinic_profile.hours.
 */
function parseHours(formData: FormData): Record<Day, HoursEntry> | null {
  const out: Partial<Record<Day, HoursEntry>> = {}
  let touched = false
  for (const day of DAYS) {
    const closed = formData.get(`hours[${day}].closed`) === 'on'
    const open = formData.get(`hours[${day}].open`)?.toString().trim() ?? ''
    const close = formData.get(`hours[${day}].close`)?.toString().trim() ?? ''
    if (closed) {
      out[day] = { closed: true }
      touched = true
    } else if (open || close) {
      if (open && !HHMM.test(open)) throw new Error(`Invalid open time for ${day}`)
      if (close && !HHMM.test(close)) throw new Error(`Invalid close time for ${day}`)
      out[day] = { open: open || null, close: close || null }
      touched = true
    }
  }
  return touched ? (out as Record<Day, HoursEntry>) : null
}

function clean(field: string, formData: FormData, fallback: string | null = null) {
  return formData.get(field)?.toString().trim() || fallback
}

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
  const hours = parseHours(formData)

  await db
    .insert(clinicProfile)
    .values({
      organizationId: orgId,
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
      hours,
    })
    .onConflictDoUpdate({
      target: clinicProfile.organizationId,
      set: {
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
        hours,
        updatedAt: new Date(),
      },
    })

  if (displayName) {
    await db.update(organization).set({ name: displayName }).where(eq(organization.id, orgId))
  }

  revalidatePath('/settings/clinic')
  revalidatePath(`/site/${ctx.organizationSlug}`)
}
