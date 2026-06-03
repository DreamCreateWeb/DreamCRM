import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { listLibraryForPicker } from '@/lib/services/service-library'
import WebsiteEditor from './website-editor'

export const metadata = {
  title: 'Website - DreamCRM',
  description: "Your clinic's storefront — the trunk every other module attaches to.",
}

export const dynamic = 'force-dynamic'

/**
 * Website Editor — the clinic's storefront, edited in place.
 *
 * Replaces the prior read-only checklist (which funneled every edit into the
 * buried settings mega-form) with a real section-based editor: left-rail
 * anatomy + per-section panels + a live preview of the public site. Per
 * DESIGN.md "the website is the trunk." Per-section saves go through
 * ./website-actions.ts; services reuse the dedicated picker actions.
 */
export default async function WebsiteEditorPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  if (!profile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700/60 p-8 text-center">
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">
            Your clinic profile isn&apos;t set up yet
          </p>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-4">
            Finish the onboarding flow to publish your clinic&apos;s public site.
          </p>
          <Link
            href="/settings/clinic"
            className="inline-block text-sm font-semibold px-4 py-2 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
          >
            Set up your clinic
          </Link>
        </div>
      </div>
    )
  }

  const slug = ctx.organizationSlug
  const library = await listLibraryForPicker(ctx.organizationId)
  const siteUrl = publicSiteUrl({ slug, profile })

  return (
    <WebsiteEditor
      profile={profile}
      orgId={ctx.organizationId}
      slug={slug}
      siteUrl={siteUrl}
      previewPath={`/site/${slug}`}
      library={library}
    />
  )
}
