import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  availableSites,
  getReviewConfig,
  listFeaturedTestimonialPatientIds,
  listReviewsReceived,
  reviewPlatformUrl,
  type ReviewSite,
} from '@/lib/services/reviews'
import ReceivedList from './received-list'

export const metadata = {
  title: 'Reviews received — DreamCRM',
  description: 'Browse the reviews your patients have left and feature their quotes on your public website.',
}

export const dynamic = 'force-dynamic'

export default async function ReviewsReceivedPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/reviews')
  if (ctx.role === 'patient') redirect('/')

  const [received, featuredIds, config] = await Promise.all([
    listReviewsReceived(ctx.organizationId),
    listFeaturedTestimonialPatientIds(ctx.organizationId),
    getReviewConfig(ctx.organizationId),
  ])

  // Build platform → write-review URL map so the modal can link out to the
  // public-review page where the staff can copy the patient's quote.
  const platformUrls: Partial<Record<ReviewSite, string | null>> = {}
  for (const site of availableSites(config)) {
    platformUrls[site] = reviewPlatformUrl(site, config)
  }

  const rows = received.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientFirstName: r.patientFirstName,
    patientLastName: r.patientLastName,
    patientCity: r.patientCity,
    patientState: r.patientState,
    completedAtIso: r.completedAt ? r.completedAt.toISOString() : null,
    selectedSite: r.selectedSite,
    isFeatured: featuredIds.has(r.patientId),
  }))

  const featuredCount = rows.filter((r) => r.isFeatured).length
  const totalCount = rows.length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1200px] mx-auto">
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link
            href="/reviews"
            className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            ← Reviews
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800 dark:text-stone-100 mt-1">
            Reviews received
          </h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-[640px]">
            Patients who completed a review request. Pick which ones to feature on your public
            website — we don&apos;t have the review text (it lives on the patient&apos;s public
            platform), so paste the quote when you feature it.
          </p>
        </div>
        {totalCount > 0 && (
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-stone-800 dark:text-stone-100 tabular-nums">
              {featuredCount}
              <span className="text-stone-400 dark:text-stone-500 font-medium"> / {totalCount}</span>
            </p>
            <p className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Featured on site
            </p>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-12 text-center">
          <p className="text-3xl mb-3">⭐</p>
          <p className="text-sm font-medium text-stone-800 dark:text-stone-100 mb-1">
            No completed reviews yet
          </p>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 max-w-md mx-auto">
            When a patient taps a public-review platform on the email we sent, their entry
            shows up here. Send a few requests from the{' '}
            <Link href="/reviews" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
              Reviews dashboard
            </Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <ReceivedList rows={rows} platformUrls={platformUrls} />
      )}
    </div>
  )
}
