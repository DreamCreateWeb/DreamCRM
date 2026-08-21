import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'

/** Kanban-shaped skeleton — six columns of card blocks, not table rows. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))' }}
      >
        {Array.from({ length: 6 }).map((_, col) => (
          <div
            key={col}
            className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-[color:var(--color-surface-sunk)] p-2 min-h-[10rem] space-y-1.5"
          >
            <Skeleton className="h-4 w-24 mb-2" />
            {Array.from({ length: col % 3 === 0 ? 3 : 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[var(--r-md)]" />
            ))}
          </div>
        ))}
      </div>
    </PageSkeleton>
  )
}
