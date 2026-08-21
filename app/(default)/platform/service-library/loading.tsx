import { PageSkeleton, SkeletonChipRow, SkeletonRows } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={3} />
      <SkeletonRows rows={6} />
    </PageSkeleton>
  )
}
