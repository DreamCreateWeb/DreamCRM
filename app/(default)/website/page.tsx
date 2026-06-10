import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { listLibraryForPicker } from '@/lib/services/service-library'
import { getAiUsage } from '@/lib/services/ai-website'
import WebsiteStudio from './website-studio'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionButton } from '@/components/ui/action-button'

export const metadata = {
  title: 'Website - DreamCRM',
  description: "Your clinic's storefront — edit it in place, live.",
}

export const dynamic = 'force-dynamic'

/**
 * Website Studio — the full-screen, in-place editor. `/website` opens the
 * clinic's real site in an editable canvas (no CRM chrome). Per DESIGN.md
 * "the website is the trunk" + the research wedge: clinics OWN their site and
 * edit it themselves, live, with no agency ticket. The studio shell lives in
 * website-studio.tsx; the in-canvas editing is driven by the EditBridge that
 * the public site mounts when opened with `?edit=1` (owner/admin only).
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/60">
          <EmptyState
            icon="🌐"
            title="Your clinic profile isn’t set up yet"
            body="Finish setting up your clinic to publish your public site — then you can edit it in place, live."
            action={
              <ActionButton variant="primary" size="sm" href="/settings/clinic">
                Set up your clinic
              </ActionButton>
            }
          />
        </div>
      </div>
    )
  }

  const slug = ctx.organizationSlug
  const siteUrl = publicSiteUrl({ slug, profile })
  const [library, aiUsage] = await Promise.all([
    listLibraryForPicker(ctx.organizationId),
    getAiUsage(ctx.organizationId, profile.planTier),
  ])

  return (
    <WebsiteStudio
      slug={slug}
      siteUrl={siteUrl}
      profile={profile}
      orgId={ctx.organizationId}
      library={library}
      initialAiUsage={aiUsage}
    />
  )
}
