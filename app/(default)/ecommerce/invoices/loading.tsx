import { PageSkeleton, SkeletonKpiRow, SkeletonRows } from '@/components/ui/skeleton'

/** Subscriptions loading — KPI band + attention buckets + the table. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonKpiRow count={4} />
      <SkeletonKpiRow count={3} />
      <SkeletonRows rows={8} />
    </PageSkeleton>
  )
}
