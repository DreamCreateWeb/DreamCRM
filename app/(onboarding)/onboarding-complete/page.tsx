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

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

export default async function OnboardingComplete() {
  await requireUser()
  const ctx = await getTenantContext()
  const orgName = ctx?.organizationName
  const siteUrl = ctx?.organizationSlug ? `https://${ctx.organizationSlug}.${SITE_DOMAIN}` : null
  const siteHost = siteUrl ? siteUrl.replace('https://', '') : null

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
                    {orgName ? `${orgName} — your site is live!` : 'Your site is live!'}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                    Your website is already on the internet with starter content, and every page
                    updates live as you customize it. Next: answer a few quick questions and
                    we&apos;ll write the whole site for you.
                  </p>

                  {siteUrl && (
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 mb-6 text-sm font-medium text-gray-800 dark:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600"
                      title="Open your live site in a new tab"
                    >
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
                      {siteHost}
                      <span className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" aria-hidden="true">↗</span>
                    </a>
                  )}

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

                  <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
                    Own a domain like <span className="font-medium">yourpractice.com</span>?{' '}
                    <Link
                      href="/website/domain"
                      className="font-medium text-gray-700 dark:text-gray-200 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
                    >
                      Connect it to your site
                    </Link>{' '}
                    — takes a couple of minutes, and your free {SITE_DOMAIN} address keeps working
                    either way.
                  </p>
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
