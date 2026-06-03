import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'

export const metadata = {
  title: "You're all set - DreamCRM",
  description: 'Onboarding complete',
}

export const dynamic = 'force-dynamic'

export default async function OnboardingComplete() {
  await requireUser()
  const ctx = await getTenantContext()
  const orgName = ctx?.organizationName

  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative flex">
        <div className="w-full md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">
            <div className="flex-1">
              <OnboardingHeader />
              <OnboardingProgress step={4} />
            </div>
            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">
                <div className="text-center">
                  <svg className="inline-flex w-16 h-16 fill-current mb-6" viewBox="0 0 64 64">
                    <circle className="text-green-500/20" cx="32" cy="32" r="32" />
                    <path
                      className="text-green-700"
                      d="M37.22 26.375a1 1 0 1 1 1.56 1.25l-8 10a1 1 0 0 1-1.487.082l-4-4a1 1 0 0 1 1.414-1.414l3.21 3.21 7.302-9.128Z"
                    />
                  </svg>
                  <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-3">
                    {orgName ? `Welcome, ${orgName}!` : "You're all set!"}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-8">
                    Your subscription is active. Let&apos;s build your website — answer a few
                    quick questions and we&apos;ll draft the whole thing for you, then you can
                    edit anything live.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Link
                      className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
                      href="/welcome"
                    >
                      Build my website with AI →
                    </Link>
                    <Link
                      className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300"
                      href="/"
                    >
                      Go to dashboard
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <OnboardingImage />
      </div>
    </main>
  )
}
