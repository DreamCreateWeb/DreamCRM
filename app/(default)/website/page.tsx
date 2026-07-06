import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { listLibraryForPicker } from '@/lib/services/service-library'
import { getAiUsage } from '@/lib/services/ai-website'
import { getSitePerformance } from '@/lib/services/site-analytics'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import { buildStudioPages } from '@/lib/clinic-site-helpers'
import { getLastWebsiteEdit } from '@/lib/services/website-history'
import type { ClinicStaff } from '@/lib/types/clinic-content'
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
  // Editing is owner/admin-only (every save action enforces it) — don't hand
  // a member the full studio where every Save would error.
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/dashboard')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  if (!profile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
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
    )
  }

  const slug = ctx.organizationSlug
  const siteUrl = publicSiteUrl({ slug, profile })
  const [library, aiUsage, performance, posts, plans, jobs] = await Promise.all([
    listLibraryForPicker(ctx.organizationId),
    getAiUsage(ctx.organizationId, profile.planTier),
    // Best-effort — the Studio must open even if the stats read hiccups.
    getSitePerformance(ctx.organizationId).catch(() => null),
    // Page-navigator gating (same `has*` truth the public nav uses) — each
    // best-effort so a single read failure just hides that page from the
    // dropdown rather than blocking the Studio.
    listPublishedPosts(ctx.organizationId, { limit: 1 }).catch(() => []),
    listActivePlans(ctx.organizationId).catch(() => []),
    getOpenJobs(ctx.organizationId).catch(() => []),
  ])
  // Undo-history head — arms the Studio's ↩ Undo button on load.
  const lastEdit = await getLastWebsiteEdit(ctx.organizationId).catch(() => null)
  const pages = buildStudioPages({
    hasTeam: ((profile.staff as ClinicStaff[] | null) ?? []).length > 0,
    hasBlog: posts.length > 0,
    hasCareers: jobs.length > 0,
    hasDentalPlans: plans.length > 0,
  })

  return (
    <WebsiteStudio
      slug={slug}
      siteUrl={siteUrl}
      profile={profile}
      orgId={ctx.organizationId}
      library={library}
      initialAiUsage={aiUsage}
      performance={performance}
      pages={pages}
      lastEditLabel={lastEdit?.label ?? null}
    />
  )
}
