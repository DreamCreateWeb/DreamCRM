import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listFeaturedTestimonialPatientIds,
  listReviewsReceived,
} from '@/lib/services/reviews'
import ReceivedList from './received-list'

export const metadata = {
  title: 'Reviews received — DreamCRM',
  description: 'Read every review your patients have left and pick which ones to feature on your public website.',
}

export const dynamic = 'force-dynamic'

export default async function ReviewsReceivedPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/reviews')
  if (ctx.role === 'patient') redirect('/')

  const [received, featuredIds] = await Promise.all([
    listReviewsReceived(ctx.organizationId),
    listFeaturedTestimonialPatientIds(ctx.organizationId),
  ])

  const rows = received.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientFirstName: r.patientFirstName,
    patientLastName: r.patientLastName,
    patientCity: r.patientCity,
    patientState: r.patientState,
    completedAtIso: r.completedAt ? r.completedAt.toISOString() : null,
    selectedSite: r.selectedSite,
    reviewText: r.reviewText,
    rating: r.rating,
    isFeatured: featuredIds.has(r.patientId),
  }))

  const totalCount = rows.length
  const featuredCount = rows.filter((r) => r.isFeatured).length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1100px] mx-auto">
      <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
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
            Every review your patients have left. Read them, then pick which to
            feature on your public website. You can&apos;t edit the patient&apos;s
            words — only the patient owns those.
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
            No reviews yet
          </p>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 max-w-md mx-auto">
            When a patient writes a review on their request link, it lands here so
            you can read it and decide whether to feature it on your public site.
            Send a few requests from the{' '}
            <Link href="/reviews" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
              Reviews dashboard
            </Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <ReceivedList rows={rows} />
      )}
    </div>
  )
}
