import { PageSkeleton, SkeletonChipRow, SkeletonRows } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={7} />
      <SkeletonRows rows={10} />
    </PageSkeleton>
  )
}
