import { PageSkeleton, SkeletonKpiRow, Skeleton } from '@/components/ui/skeleton'

/** Demo-prep loading — header, KPI trio, then the brief panels (AI-bound). */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonKpiRow count={3} />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </PageSkeleton>
  )
}
