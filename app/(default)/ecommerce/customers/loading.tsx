import { PageSkeleton, SkeletonKpiRow, SkeletonChipRow, SkeletonRows } from '@/components/ui/skeleton'

/** Clinics roster loading — KPI band, filter chips, then the table rows. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonKpiRow count={4} />
      <SkeletonChipRow count={6} />
      <SkeletonRows rows={8} />
    </PageSkeleton>
  )
}
