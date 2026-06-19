import { PageSkeleton, SkeletonRows } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonRows rows={6} />
    </PageSkeleton>
  )
}
