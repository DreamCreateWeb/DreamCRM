'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'

async function requireOrgId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Not authenticated')
  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) throw new Error('No active organization')
  return orgId
}

export async function updateClinicProfile(formData: FormData) {
  const orgId = await requireOrgId()

  const displayName = formData.get('displayName')?.toString().trim() || null
  const legalName = formData.get('legalName')?.toString().trim() || null
  const tagline = formData.get('tagline')?.toString().trim() || null
  const about = formData.get('about')?.toString().trim() || null
  const phone = formData.get('phone')?.toString().trim() || null
  const email = formData.get('email')?.toString().trim() || null
  const addressLine1 = formData.get('addressLine1')?.toString().trim() || null
  const addressLine2 = formData.get('addressLine2')?.toString().trim() || null
  const city = formData.get('city')?.toString().trim() || null
  const state = formData.get('state')?.toString().trim() || null
  const postalCode = formData.get('postalCode')?.toString().trim() || null
  const country = formData.get('country')?.toString().trim() || 'US'
  const brandColor = formData.get('brandColor')?.toString().trim() || null
  const template = formData.get('template')?.toString().trim() || 'modern'

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
        updatedAt: new Date(),
      },
    })

  if (displayName) {
    await db.update(organization).set({ name: displayName }).where(eq(organization.id, orgId))
  }

  revalidatePath('/settings/clinic')
}
