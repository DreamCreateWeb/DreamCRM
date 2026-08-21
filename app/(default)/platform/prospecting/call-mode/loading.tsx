import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'

/** Call Mode loading — the single-card cockpit shape (AI script inbound). */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-28" />
          ))}
        </div>
      </div>
    </PageSkeleton>
  )
}
