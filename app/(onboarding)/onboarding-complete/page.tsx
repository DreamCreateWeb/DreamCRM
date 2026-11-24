import Link from 'next/link'
import { redirect } from 'next/navigation'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { PlanPicker } from '@/components/ui/trial-ended-wall'
import { ActionButton } from '@/components/ui/action-button'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { syncCheckoutSuccess } from '@/lib/services/billing'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { formatClinicDate } from '@/lib/format-datetime'
import { TRIAL_DAYS } from '@/lib/trial'

export const metadata = {
  title: 'Finish setting up - DreamCRM',
  description: 'The last step of setting up your practice',
}

export const dynamic = 'force-dynamic'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

/**
 * The last screen of signup, and it is one of two screens.
 *
 * THE CARD STEP — for a practice that has not added its card (owner ruling
 * 2026-11-23: a 14-day free trial, card required to sign up). The practice
 * exists; nothing has started. This says what the card step costs today
 * (nothing), what happens during the trial and what happens at its end, then
 * hands over to Stripe Checkout, which opens the trial.
 *
 * THE "SITE IS READY" SCREEN — once the trial has started (or for anybody who
 * is already past it), with the day the card is charged written on it.
 *
 * Stripe sends the practice back here with `?checkout=success&session_id=…`.
 * The subscription is synced NOW, before anything renders, so the trial does
 * not hinge on webhook timing — and then the request is redirected to a clean
 * URL, so the tenant context below is resolved against the freshly-synced row
 * and a refresh cannot re-run the sync.
 */
export default async function OnboardingComplete({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>
}) {
  await requireUser()
  const { checkout, session_id: sessionId } = await searchParams
  const ctx = await getTenantContext()

  if (checkout === 'success' && sessionId && ctx?.tenantType === 'clinic') {
    await syncCheckoutSuccess(ctx.organizationId, sessionId)
    redirect('/onboarding-complete?checkout=success')
  }

  const orgName = ctx?.organizationName
  const needsCard = ctx?.tenantType === 'clinic' && ctx.trialNeedsCard === true
  const canManageBilling = ctx?.role === 'owner' || ctx?.role === 'admin'

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
                {needsCard ? (
                  <CardStep orgName={orgName} checkout={checkout} canManageBilling={canManageBilling} />
                ) : (
                  <SiteReady
                    orgName={orgName}
                    siteUrl={ctx?.organizationSlug ? `https://${ctx.organizationSlug}.${SITE_DOMAIN}` : null}
                    // The day the card is charged, in the CLINIC's calendar —
                    // the server is UTC, and a trial ending late on the 7th
                    // Central is already the 8th here.
                    trialEndsOn={
                      ctx?.tenantType === 'clinic' && ctx.trialCardOnFile && ctx.trialEndsAt
                        ? formatClinicDate(ctx.trialEndsAt, await getClinicTimeZone(ctx.organizationId))
                        : null
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        <OnboardingImage />
      </div>
    </main>
  )
}

/** Step 4 of 4: the card that starts the free trial. */
function CardStep({
  orgName,
  checkout,
  canManageBilling,
}: {
  orgName: string | undefined
  checkout: string | undefined
  canManageBilling: boolean
}) {
  // Back from a COMPLETED Checkout, and the row still says "awaiting card":
  // the sync on the way in did not land (Stripe slow to answer) and the
  // webhook is still on its way. Offering the card form again here is how a
  // practice ends up with two subscriptions, so this state shows no form.
  if (checkout === 'success') {
    return (
      <div className="text-center">
        <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-3">Opening your free trial…</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Thank you — checkout is complete. We are waiting for Stripe to confirm it, which usually takes a few
          seconds.
        </p>
        <ActionButton href="/onboarding-complete?checkout=success" variant="primary">
          Check again
        </ActionButton>
        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          Still here after a minute or two? Email{' '}
          <a
            href="mailto:hello@dreamcreatestudio.com"
            className="font-medium text-gray-700 dark:text-gray-200 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            hello@dreamcreatestudio.com
          </a>{' '}
          and we will sort it out. You have not been charged.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-3">
        One step left: start your {TRIAL_DAYS}-day free trial
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        {orgName ? (
          <>
            <strong>{orgName}</strong> is set up
          </>
        ) : (
          'Your practice is set up'
        )}{' '}
        and your website draft is waiting. Add a card to open it — nothing is charged today.
      </p>

      {checkout === 'cancelled' && (
        <p className="mb-5 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          No card was added and nothing was charged. Add one whenever you are ready.
        </p>
      )}

      <ul className="mb-6 space-y-2 text-sm text-gray-600 dark:text-gray-400">
        <li>
          <strong className="text-gray-800 dark:text-gray-100">Today:</strong> nothing. Your card is saved, not
          charged.
        </li>
        <li>
          <strong className="text-gray-800 dark:text-gray-100">For {TRIAL_DAYS} days:</strong> everything is switched
          on. Cancel any time from Settings → Plan &amp; billing.
        </li>
        <li>
          <strong className="text-gray-800 dark:text-gray-100">When the trial ends:</strong> your plan starts and the
          card is charged. We email you a week before and again the day before.
        </li>
      </ul>

      {canManageBilling ? (
        <>
          <PlanPicker startsTrial returnTo="onboarding" />
          <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
            The trial and your subscription run on the{' '}
            <Link
              href="/terms"
              target="_blank"
              className="font-medium text-gray-700 dark:text-gray-200 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
            >
              Terms of Service
            </Link>
            .
          </p>
        </>
      ) : (
        <p className="rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
          Ask your clinic’s owner or an admin to add a card and start the trial.
        </p>
      )}
    </div>
  )
}

/** The trial has started (or this person is already past signup). */
function SiteReady({
  orgName,
  siteUrl,
  trialEndsOn,
}: {
  orgName: string | undefined
  siteUrl: string | null
  trialEndsOn: string | null
}) {
  const siteHost = siteUrl ? siteUrl.replace('https://', '') : null
  return (
    <div className="text-center">
      <svg className="inline-flex w-16 h-16 fill-current mb-6" viewBox="0 0 64 64">
        <circle className="text-green-500/20" cx="32" cy="32" r="32" />
        <path
          className="text-green-700"
          d="M37.22 26.375a1 1 0 1 1 1.56 1.25l-8 10a1 1 0 0 1-1.487.082l-4-4a1 1 0 0 1 1.414-1.414l3.21 3.21 7.302-9.128Z"
        />
      </svg>
      {/* HONEST STATE (the 0147 go-live lever): a new clinic's
          site starts PRIVATE — the world sees "coming soon" until
          the deliberate publish from the Website hub. The owner
          sees the real site at this link (editors bypass the
          gate), which is exactly why the old "your site is live!"
          heading was a trap: it showed them a page only they
          could see and called it live. */}
      <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-3">
        {orgName ? `${orgName} — your site is ready!` : 'Your site is ready!'}
      </h1>
      {trialEndsOn && (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          Your free trial has started. It ends on <strong>{trialEndsOn}</strong> — your card is charged then, and
          not before.
        </p>
      )}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
        Your website is built and waiting with starter content — only you can see
        it until you publish, so take your time making it yours. Next: answer a few
        quick questions and we&apos;ll write the whole site for you.
      </p>

      {siteUrl && (
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 mb-6 text-sm font-medium text-gray-800 dark:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600"
          title="Preview your site in a new tab (visible only to you until you go live)"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          {siteHost}
          <span className="text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" aria-hidden="true">↗</span>
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
  )
}
