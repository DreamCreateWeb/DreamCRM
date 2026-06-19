import { PageSkeleton, SkeletonKpiRow, SkeletonRows, Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="v2-card p-4 space-y-2.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <SkeletonKpiRow count={4} />
      <SkeletonRows rows={5} />
    </PageSkeleton>
  )
}
