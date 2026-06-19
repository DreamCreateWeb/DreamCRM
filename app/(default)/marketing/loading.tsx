import { PageSkeleton, SkeletonKpiRow, SkeletonRows } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonKpiRow count={4} />
      <SkeletonRows rows={5} />
    </PageSkeleton>
  )
}
