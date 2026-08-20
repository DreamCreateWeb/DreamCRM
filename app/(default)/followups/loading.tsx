import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'

/** The board's own shape: a chip row, the rules summary line, then grouped
 *  sections of tick-circle rows — not the generic KPI-band fallback. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-wrap gap-1.5 mb-5" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-[var(--r-lg)] mb-6" aria-hidden="true" />
      {[0, 1].map((g) => (
        <div key={g} className="mb-6" aria-hidden="true">
          <Skeleton className="h-4 w-32 mb-2" />
          <div className="v2-card divide-y divide-[color:var(--color-hairline)]">
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center gap-3 px-4 py-2.5">
                <Skeleton className="h-5 w-5 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </PageSkeleton>
  )
}
