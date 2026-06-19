import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-7 w-48" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-black/5 bg-white p-5 space-y-3" aria-hidden="true">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
