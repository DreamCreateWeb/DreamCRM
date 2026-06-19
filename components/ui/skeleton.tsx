import type { ReactNode } from 'react'

/**
 * Loading skeletons built on the `.skeleton` shimmer (app/css/style.css, which
 * already honors prefers-reduced-motion). Each route's `loading.tsx` renders
 * one of these so a navigation paints an instant layout-shaped placeholder
 * instead of freezing on the previous page while the server renders.
 *
 * A11y: the visual blocks are decorative (aria-hidden); the outer container
 * carries one `role="status"` + an sr-only "Loading…" so assistive tech
 * announces the wait exactly once.
 */

/** A single shimmer block — shape it with `className` (height / width / radius). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />
}

/** N stacked text lines; the last is short, like a real paragraph. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** The standard PageHeader shape (eyebrow · title · subtitle). */
export function SkeletonPageHeader() {
  return (
    <div className="mb-6 space-y-2.5" aria-hidden="true">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  )
}

/** A row of KPI tiles. */
export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="v2-card p-4 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  )
}

/** A list/table of rows (avatar · two lines · trailing pill). */
export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="v2-card divide-y divide-[color:var(--color-hairline)]" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** A horizontal strip of filter chips. */
export function SkeletonChipRow({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-20 rounded-full" />
      ))}
    </div>
  )
}

/**
 * The standard authenticated page wrapper — the shared container + a header
 * skeleton, then either custom `children` or a generic KPI-row + rows body.
 * This is the group-level `loading.tsx` fallback for every dashboard page that
 * doesn't ship a tailored one.
 */
export function PageSkeleton({
  children,
  kpis = true,
  rows = 8,
}: {
  children?: ReactNode
  kpis?: boolean
  rows?: number
}) {
  return (
    <div
      className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <SkeletonPageHeader />
      {children ?? (
        <>
          {kpis && <SkeletonKpiRow />}
          <SkeletonRows rows={rows} />
        </>
      )}
    </div>
  )
}
