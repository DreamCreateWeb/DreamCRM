'use server'

import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { organization, invitation } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { sendInvitationEmail } from '@/lib/email'

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function createClinic(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Not authenticated')
  const isPlatformAdmin = (session.user as { platformAdmin?: boolean }).platformAdmin ?? false
  if (!isPlatformAdmin) throw new Error('Not authorized')

  const name = (formData.get('name') as string).trim()
  const rawSlug = (formData.get('slug') as string).trim()
  const adminEmail = (formData.get('adminEmail') as string).trim().toLowerCase()
  const planTier = (formData.get('planTier') as string) || 'basic'

  if (!name) throw new Error('Clinic name is required.')
  if (!adminEmail) throw new Error('Admin email is required.')

  const slug = rawSlug || slugify(name)
  if (!slug) throw new Error('Could not derive a slug from the clinic name.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Slug must be lowercase letters, numbers, and hyphens only.')
  }

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)
  if (existing) throw new Error(`The slug "${slug}" is already taken.`)

  const orgId = randomUUID()

  // Create the organization
  await db.insert(organization).values({
    id: orgId,
    name,
    slug,
    type: 'clinic',
  })

  // Create the clinic profile
  await db.insert(clinicProfile).values({
    organizationId: orgId,
    displayName: name,
    planTier,
  })

  // Insert invitation directly — Better Auth's createInvitation requires the
  // caller to be a member of the target org, which isn't true for a brand-new
  // clinic. We insert the record ourselves and send the email.
  const inviteId = randomUUID()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

  await db.insert(invitation).values({
    id: inviteId,
    organizationId: orgId,
    email: adminEmail,
    role: 'owner',
    status: 'pending',
    expiresAt,
    inviterId: session.user.id,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const inviteUrl = `${appUrl}/accept-invite?token=${inviteId}`

  // Fire-and-forget — don't block on email send; log failure but don't throw
  sendInvitationEmail(adminEmail, {
    inviterName: session.user.name,
    orgName: name,
    role: 'Owner',
    inviteUrl,
  }).catch(err => console.error('[createClinic] email failed:', err))

  revalidatePath('/ecommerce/customers')

  return { orgId, slug, inviteUrl }
}
