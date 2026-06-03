import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import OnboardingHeader from '../onboarding-header'
import WelcomeInterview from './welcome-interview'

export const metadata = {
  title: 'Welcome - DreamCRM',
  description: "Let's build your website together",
}

export const dynamic = 'force-dynamic'

/**
 * Post-checkout AI onboarding interview (Website Studio Phase 3). Shown right
 * after `/onboarding-complete`: a short conversational interview that drafts
 * the clinic's whole site, then drops them into the in-place Studio (`/website`)
 * to refine. Only clinic owners/admins have a site to draft.
 */
export default async function WelcomePage() {
  await requireUser()
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') redirect('/dashboard')

  return (
    <main className="bg-white dark:bg-stone-900 min-h-[100dvh]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <OnboardingHeader />
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
            <WelcomeInterview />
          </div>
        </div>
      </div>
    </main>
  )
}
