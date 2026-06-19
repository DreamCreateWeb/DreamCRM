import { PageSkeleton, SkeletonChipRow, SkeletonKpiRow, Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={2} />
      {[0, 1, 2].map((b) => (
        <div key={b} className="mb-6" aria-hidden="true">
          <Skeleton className="h-4 w-40 mb-3" />
          <SkeletonKpiRow count={4} />
        </div>
      ))}
    </PageSkeleton>
  )
}
