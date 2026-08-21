import { PageSkeleton, Skeleton, SkeletonChipRow } from '@/components/ui/skeleton'

/**
 * Leads loading state — matched to the page's real shape: filter chips, the
 * select-all line, then the AGING CARD STACK (each inquiry is a standalone
 * card with a left aging border), not a flat divided table.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonChipRow count={5} />
      <Skeleton className="h-4 w-32 mb-2" />
      <ul className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <li key={i} className="v2-card border-l-4 border-l-gray-200 dark:border-l-gray-700 px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </PageSkeleton>
  )
}
