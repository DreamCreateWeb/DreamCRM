import { PageSkeleton, SkeletonChipRow, SkeletonRows } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={5} />
      <SkeletonRows rows={8} />
    </PageSkeleton>
  )
}
