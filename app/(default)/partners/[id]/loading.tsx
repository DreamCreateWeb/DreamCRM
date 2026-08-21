import { PageSkeleton, SkeletonKpiRow, Skeleton } from '@/components/ui/skeleton'

/** Partner detail loading — header + KPI band + the two ledger cards. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonKpiRow count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </PageSkeleton>
  )
}
