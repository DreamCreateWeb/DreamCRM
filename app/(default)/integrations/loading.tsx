import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="v2-card p-4 space-y-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  )
}
