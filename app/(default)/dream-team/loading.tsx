import { PageSkeleton, Skeleton, SkeletonChipRow } from '@/components/ui/skeleton'

/**
 * The page's own shape while it loads (D7): the status band, the queue rail,
 * then one tall card. A skeleton that doesn't match what arrives is a small
 * lie — the layout jumps the moment the data lands.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-24 w-full rounded-[var(--r-lg)]" />
      <SkeletonChipRow count={4} />
      <Skeleton className="mx-auto h-[26rem] w-full max-w-2xl rounded-[var(--r-lg)]" />
    </PageSkeleton>
  )
}
