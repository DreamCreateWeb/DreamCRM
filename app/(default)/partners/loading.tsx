import { PageSkeleton, SkeletonKpiRow, SkeletonChipRow, SkeletonRows } from '@/components/ui/skeleton'

/** Partners loading — KPI band + status chips + the table. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonKpiRow count={4} />
      <SkeletonChipRow count={5} />
      <SkeletonRows rows={7} />
    </PageSkeleton>
  )
}
