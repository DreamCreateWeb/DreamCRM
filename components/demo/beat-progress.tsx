'use client'

import { DEMO_BEATS } from '@/lib/types/demo-script'

/** Segmented beat progress: current fills with the demo accent, visited a
 *  soft mix, upcoming stays dark. Click = jump. */
export default function BeatProgress({
  index,
  visited,
  onJump,
}: {
  index: number
  visited: Set<string>
  onJump: (i: number) => void
}) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Demo beats">
      {DEMO_BEATS.map((b, i) => (
        <button
          key={b.id}
          type="button"
          role="tab"
          aria-selected={i === index}
          title={`${i + 1}. ${b.title}`}
          onClick={() => onJump(i)}
          className="h-1.5 flex-1 rounded-full transition-colors"
          style={{
            background:
              i === index
                ? 'var(--demo-accent, #2dd4bf)'
                : visited.has(b.id)
                  ? 'color-mix(in srgb, var(--demo-accent, #2dd4bf) 35%, #374151)'
                  : '#374151',
          }}
        />
      ))}
    </div>
  )
}
