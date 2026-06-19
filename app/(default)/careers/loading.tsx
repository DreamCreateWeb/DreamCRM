import { PageSkeleton, SkeletonChipRow, SkeletonRows } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={2} />
      <SkeletonChipRow count={6} />
      <SkeletonRows rows={6} />
    </PageSkeleton>
  )
}
