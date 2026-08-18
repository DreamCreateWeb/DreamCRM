import { Skeleton, SkeletonPageHeader } from '@/components/ui/skeleton'

/**
 * My Day is the staffer's first navigation of every morning, and its real
 * layout (6-tile KPI grid over a two-column card area) doesn't match the
 * generic 4-KPI PageSkeleton — the reshuffle on arrival was a visible jump.
 * This placeholder mirrors the page's actual bones so content lands in place.
 */
export default function Loading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto" aria-busy="true">
      <SkeletonPageHeader />
      {/* The 6-tile KPI band (grid-cols-2 lg:grid-cols-3). */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* Two-column card area: follow-ups left, schedule + digest right. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
      </div>
    </div>
  )
}
