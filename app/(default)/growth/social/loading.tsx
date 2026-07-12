import { PageSkeleton, SkeletonRows, Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-hidden="true">
        <div className="v2-card p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-8 w-28" />
        </div>
        <SkeletonRows rows={4} />
      </div>
    </PageSkeleton>
  )
}
