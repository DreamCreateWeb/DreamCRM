import { Skeleton, SkeletonPageHeader } from '@/components/ui/skeleton'

/**
 * The Huddle's bones: a header, the source line, then stacked cards (the
 * recap, today's schedule, the next day, the heads-up) — so the page lands
 * in place instead of reshuffling from the generic KPI skeleton.
 */
export default function Loading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto" aria-busy="true">
      <SkeletonPageHeader />
      <Skeleton className="h-4 w-80 max-w-full mb-5" />
      <div className="space-y-5">
        <Skeleton className="h-28" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="h-32" />
        <Skeleton className="h-20" />
      </div>
    </div>
  )
}
