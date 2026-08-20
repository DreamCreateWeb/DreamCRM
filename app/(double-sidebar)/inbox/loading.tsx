import { Skeleton } from '@/components/ui/skeleton'

/** Shaped like the inbox itself — a thread-list pane beside a reading pane —
 *  instead of the generic dashboard shimmer. The first sync can take a
 *  moment, so what loads in should not reflow what the skeleton promised. */
export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-64px)]" aria-busy="true">
      {/* Thread-list pane */}
      <div className="hidden md:block w-[22rem] xl:w-[24rem] shrink-0 border-r border-[color:var(--color-hairline)] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="ml-auto h-8 w-24 rounded-lg" />
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
        <div className="space-y-3 pt-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Reading pane */}
      <div className="grow p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
        <Skeleton className="h-6 w-1/2" />
        <div className="v2-card p-4 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  )
}
