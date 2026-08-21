import { PageSkeleton, SkeletonKpiRow, SkeletonChipRow, SkeletonRows } from '@/components/ui/skeleton'

/** Prospecting workspace loading — briefing band, tab row, chips, the list. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonKpiRow count={4} />
      <SkeletonChipRow count={7} />
      <SkeletonChipRow count={5} />
      <SkeletonRows rows={8} />
    </PageSkeleton>
  )
}
