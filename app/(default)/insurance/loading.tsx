import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'

/** The tool's own shape: a form column beside a result column, then the
 *  recent-checks list — not the generic KPI-band fallback. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-hidden="true">
        <div className="lg:col-span-5 v2-card px-4 py-4 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-full rounded-[var(--r-md)]" />
          ))}
        </div>
        <div className="lg:col-span-7 v2-card px-4 py-4 space-y-3">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <div className="v2-card mt-6 divide-y divide-[color:var(--color-hairline)]" aria-hidden="true">
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
    </PageSkeleton>
  )
}
