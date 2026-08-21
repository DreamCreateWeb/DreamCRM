import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'

/** Call list loading — a stack of call cards. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </PageSkeleton>
  )
}
