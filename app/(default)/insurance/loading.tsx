import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'

/**
 * The tool's own shape so the page doesn't jump when the data lands: the
 * three-section form beside the benefits card (crown strip, the hero number
 * with its ring, the two tiles, four tier tiles, a few table rows), then
 * the recent-checks list with its header row.
 */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-hidden="true">
        <div className="lg:col-span-5 v2-card px-4 py-4 space-y-5">
          {[0, 1, 2].map((section) => (
            <div key={section} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full rounded-[var(--r-md)]" />
              <Skeleton className="h-9 w-full rounded-[var(--r-md)]" />
            </div>
          ))}
          <Skeleton className="h-10 w-36 rounded-[var(--r-sm)]" />
        </div>
        <div className="lg:col-span-7 v2-card overflow-hidden">
          <div className="px-5 py-4 bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)] space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-3.5 w-64" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="px-5 py-4 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] gap-5">
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-40" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-[var(--r-md)]" />
                <Skeleton className="h-14 w-full rounded-[var(--r-md)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-[var(--r-md)]" />
              ))}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-8 w-full rounded-[var(--r-xs)]" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="v2-card mt-6 overflow-hidden" aria-hidden="true">
        <div className="px-4 py-2.5 bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
        <div className="divide-y divide-[color:var(--color-hairline)]">
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
