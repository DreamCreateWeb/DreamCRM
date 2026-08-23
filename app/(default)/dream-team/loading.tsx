import { PageSkeleton, Skeleton, SkeletonChipRow } from '@/components/ui/skeleton'

/** Sign-here-stack shape: the queue rail, then one tall card. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={4} />
      <Skeleton className="h-[26rem] w-full max-w-3xl rounded-[var(--r-lg)]" />
    </PageSkeleton>
  )
}
