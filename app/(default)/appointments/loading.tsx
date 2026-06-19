import { PageSkeleton, SkeletonChipRow, SkeletonRows, Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={6} />
      <SkeletonChipRow count={4} />
      {[0, 1].map((g) => (
        <div key={g} className="mb-5" aria-hidden="true">
          <Skeleton className="h-4 w-40 mb-2" />
          <SkeletonRows rows={3} />
        </div>
      ))}
    </PageSkeleton>
  )
}
