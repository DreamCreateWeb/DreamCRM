/**
 * Portal loading state — warm shimmer on the portal's own cream palette.
 * The shared dashboard <Skeleton> is cool gray-200 and read as a foreign
 * surface flashing over the warm canvas; these blocks pulse in the portal's
 * sand tones instead.
 */
function WarmBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ backgroundColor: '#EFE9DF' }} />
}

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <WarmBlock className="h-7 w-48" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl p-5 space-y-3"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E2D9' }}
          aria-hidden="true"
        >
          <WarmBlock className="h-4 w-32" />
          <WarmBlock className="h-3 w-full" />
          <WarmBlock className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
