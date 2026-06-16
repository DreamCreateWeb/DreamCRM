import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { listLibraryForPicker } from '@/lib/services/service-library'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { getInterviewDraft } from '@/lib/services/onboarding-draft'
import OnboardingHeader from '../onboarding-header'
import WelcomeInterview, { type ServicePick } from './welcome-interview'

export const metadata = {
  title: 'Welcome - DreamCRM',
  description: "Let's build your website together",
}

export const dynamic = 'force-dynamic'

/**
 * Post-checkout AI onboarding interview (Welcome Interview v2). Shown right
 * after `/onboarding-complete` (and reachable from the Overview re-entry + the
 * accept-invite + billing-activate redirects). A short conversational interview
 * that drafts the clinic's whole site, then reveals the finished site. Only
 * clinic OWNERS/ADMINS have a site to draft.
 */
export default async function WelcomePage() {
  await requireUser()
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') redirect('/dashboard')
  // Owner/admin gate — a clinic 'member' has no site to build (mirrors the
  // server-action gate, so the page can't be reached below the role bar).
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/dashboard')

  // Load the service library (for the checkbox step), the clinic's public URL
  // (for the reveal CTA), and any in-flight draft to resume — in parallel.
  const [library, profileRow, draft] = await Promise.all([
    listLibraryForPicker(ctx.organizationId),
    db
      .select({ websiteDomain: clinicProfile.websiteDomain })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
      .then((r) => r[0] ?? null),
    getInterviewDraft(ctx.organizationId),
  ])

  // Client-safe picker shape — active entries only (own-pending submissions are
  // an edge the welcome day-0 path can skip).
  const services: ServicePick[] = library
    .filter((e) => e.status === 'active')
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      category: e.category === 'special' ? 'special' : 'core',
      shortDescription: e.shortDescription ?? '',
    }))

  const siteUrl = publicSiteUrl({
    slug: ctx.organizationSlug,
    profile: { websiteDomain: profileRow?.websiteDomain ?? null } as never,
  })

  return (
    <main className="bg-white dark:bg-stone-900 min-h-[100dvh]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <OnboardingHeader showSignIn={false} />
        <div className="py-6 sm:py-10">
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-800 dark:text-stone-100 mb-2">
              Welcome{ctx.organizationName ? `, ${ctx.organizationName}` : ''} 👋
            </h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
              Answer a few quick questions and we&apos;ll draft your whole website — then you can
              edit anything, live, in seconds. It&apos;s free and takes about two minutes.
            </p>
          </div>
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700/60 shadow-sm p-5 sm:p-6 min-h-[32rem] flex flex-col">
            <WelcomeInterview services={services} siteUrl={siteUrl} resumeDraft={draft} />
          </div>
        </div>
      </div>
    </main>
  )
}
