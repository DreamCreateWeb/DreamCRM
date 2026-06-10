import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { appBaseUrl, publicSiteUrl } from '@/lib/services/clinic-site'

/**
 * The public base URL where this org's blog actually lives. The platform
 * org's posts publish to the marketing site (www.../blog); a clinic's posts
 * publish to its public site ({slug}.../blog). Building platform links with
 * publicSiteUrl produced dead dream-create.* URLs — this is the one place
 * that decision lives now (posts list, editor, and email-this-post all use it).
 */
export async function blogPublicBaseUrl(ctx: {
  tenantType: string
  organizationId: string
}): Promise<string> {
  if (ctx.tenantType === 'platform') return appBaseUrl()

  const [profile] = await db
    .select({ websiteDomain: clinicProfile.websiteDomain })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, ctx.organizationId))
    .limit(1)
  return org
    ? publicSiteUrl({
        slug: org.slug,
        profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
      })
    : ''
}
