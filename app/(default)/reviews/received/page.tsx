import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listFeaturedTestimonialPatientIds,
  listReviewsReceived,
} from '@/lib/services/reviews'
import ReceivedList from './received-list'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'

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
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Reviews received"
        subtitle="Every review your patients have left. Read them, then pick which to feature on your public website. You can't edit the patient's words — only the patient owns those."
        actions={
          <div className="flex items-center gap-4">
            {totalCount > 0 && (
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums leading-none">
                  {featuredCount}
                  <span className="text-gray-500 dark:text-gray-400 font-medium"> / {totalCount}</span>
                </p>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-0.5">
                  Featured on site
                </p>
              </div>
            )}
            <ActionButton variant="secondary" href="/reviews">
              ← Reviews
            </ActionButton>
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700/60">
          <EmptyState
            icon="⭐"
            title="No reviews yet"
            body="When a patient writes a review on their request link, it lands here so you can read it and decide whether to feature it on your public site."
            action={
              <ActionButton variant="secondary" size="sm" href="/reviews">
                Send a request from the Reviews dashboard
              </ActionButton>
            }
          />
        </div>
      ) : (
        <ReceivedList rows={rows} />
      )}
    </div>
  )
}
