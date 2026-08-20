import { PageSkeleton, SkeletonKpiRow, SkeletonRows, Skeleton } from '@/components/ui/skeleton'

/** The morning skeleton, shaped like the morning PAGE: the approval stack's
 *  one front card + queue rail, the attention-card grid, the KPI band, the
 *  feed. The first thing every staffer sees each day should not reflow. */
export default function Loading() {
  return (
    <PageSkeleton>
      {/* The sign-here stack: one card front-and-center + a chip rail. */}
      <div className="v2-card p-4 mb-4 space-y-3" aria-hidden="true">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
      {/* The attention-card grid (4-up on desktop). */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="v2-card p-5 space-y-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <SkeletonKpiRow count={5} />
      <SkeletonRows rows={5} />
    </PageSkeleton>
  )
}
