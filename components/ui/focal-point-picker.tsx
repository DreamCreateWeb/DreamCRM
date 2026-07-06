'use client'

import { useCallback, useRef } from 'react'

interface Props {
  src: string
  /** Tailwind aspect class for the crop frame, e.g. 'aspect-[4/5]'. */
  aspectClass?: string
  /** Current focal point as a CSS object-position string, e.g. "50% 30%". */
  value: string
  onChange: (pos: string) => void
  /** Compact: fills its container (no max-width/centring) and hides the hint —
   *  for embedding in an editor grid cell. */
  compact?: boolean
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))

function parse(value: string): { x: number; y: number } {
  const m = value.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/)
  return m ? { x: clamp(+m[1]), y: clamp(+m[2]) } : { x: 50, y: 50 }
}

/**
 * Drag-to-reposition focal-point picker. The image is shown cover-cropped in
 * the same aspect as where it renders on the site; dragging moves the focal
 * marker and updates CSS object-position so the chosen part stays in frame.
 * Used in the Website Studio image modal for photos shown in small crops
 * (the hero ovals, etc.).
 */
export default function FocalPointPicker({
  src,
  aspectClass = 'aspect-[4/5]',
  value,
  onChange,
  compact = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const { x, y } = parse(value)

  const setFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const nx = clamp(((clientX - r.left) / r.width) * 100)
      const ny = clamp(((clientY - r.top) / r.height) * 100)
      onChange(`${Math.round(nx)}% ${Math.round(ny)}%`)
    },
    [onChange],
  )

  return (
    <div>
      <div
        ref={ref}
        className={`relative ${aspectClass} w-full ${compact ? '' : 'max-w-[220px] mx-auto'} overflow-hidden ${compact ? 'rounded-lg' : 'rounded-2xl'} cursor-crosshair select-none touch-none ring-1 ring-stone-200 dark:ring-stone-700`}
        onPointerDown={(e) => {
          draggingRef.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          setFromEvent(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) setFromEvent(e.clientX, e.clientY)
        }}
        onPointerUp={(e) => {
          draggingRef.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: `${x}% ${y}%` }}
        />
        <div
          className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            boxShadow: '0 0 0 1.5px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.4)',
          }}
        />
      </div>
      {!compact && (
        <p className="text-xs text-stone-400 mt-2 text-center">
          Drag to choose what stays in frame.
        </p>
      )}
    </div>
  )
}
