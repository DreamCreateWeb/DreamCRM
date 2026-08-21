import { Skeleton } from '@/components/ui/skeleton'

/** Client-messaging loading — the three-pane shape: stats strip + list pane
 *  beside the reading pane, so first paint doesn't reflow. */
export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-64px)]" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="hidden md:block w-[20rem] xl:w-[22rem] shrink-0 border-r border-[color:var(--color-hairline)] p-4 space-y-3" aria-hidden="true">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-8 w-full" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <div className="flex-1 p-6 space-y-3" aria-hidden="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-16 w-1/2 ml-auto" />
        <Skeleton className="h-16 w-3/5" />
      </div>
    </div>
  )
}
