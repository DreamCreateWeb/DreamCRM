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
  /**
   * What this picker is FOR, in the user's words — "Focus point for the
   * reception photo". Becomes the group's accessible name and the prefix on
   * both axis controls, so a page with four of these does not announce four
   * identical "Horizontal position" sliders.
   */
  label?: string
  /** Id of a VISIBLE label naming this picker. Wins over `label` when both are
   *  given, so the name a screen reader hears is the text on screen. */
  labelledBy?: string
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
 *
 * THE KEYBOARD PATH (DREAMCRM-34), and why it is two hidden sliders.
 *
 * This was the last surface in the product a keyboard could not operate at
 * all: a bare `<div>` with `onPointerDown/Move/Up`, no `tabIndex`, no `role`.
 * Choosing what stays in frame on a clinic's hero photo was mouse-or-touch
 * only. It is also, deliberately, a behaviour change rather than the label fix
 * batch 53 could have bolted on — the reason its `<label>` had nothing to name
 * is that there was no control here to name.
 *
 * There is now: one real `<input type="range">` per axis, `sr-only` so nothing
 * about the drag surface looks different, wrapped in a named group. The
 * alternative shape — `tabIndex={0}` plus `role="application"` on the div —
 * was rejected because `application` tells a screen reader to hand over every
 * keystroke, costing the user their normal reading keys in exchange for a
 * widget that still reports no value. A range input reports its value, its
 * bounds and its name for free, to every assistive technology, including the
 * ones that drive controls without a keyboard at all (voice, switch).
 *
 * BOTH sliders handle all four arrows, not just their own axis. Splitting a
 * 2D position across two controls is what makes it announceable, but a person
 * who has tabbed to "vertical" and presses Left expects the point to move
 * left, not nothing to happen. So focus decides what is ANNOUNCED, never what
 * works. Arrows nudge 1%, Shift+arrow and Page keys 10%, Home/End jump that
 * axis to its edge.
 *
 * `aria-valuetext` spells the value out as a position ("30% from the top")
 * rather than leaving a screen reader to read "30" and hope. On the vertical
 * axis, Up DECREASES the number, because the number is distance from the top —
 * the direction the point moves is the thing the person is choosing, and the
 * valuetext is worded so the two agree.
 */
export default function FocalPointPicker({
  src,
  aspectClass = 'aspect-[4/5]',
  value,
  onChange,
  compact = false,
  label = 'Focus point',
  labelledBy,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const { x, y } = parse(value)

  const set = useCallback(
    (nx: number, ny: number) => onChange(`${clamp(Math.round(nx))}% ${clamp(Math.round(ny))}%`),
    [onChange],
  )

  const setFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      set(((clientX - r.left) / r.width) * 100, ((clientY - r.top) / r.height) * 100)
    },
    [set],
  )

  /** Arrow/Page/Home/End on either slider. `axis` only decides what Home, End
   *  and the Page keys act on — the arrows always mean their own direction. */
  const onKeyDown = (axis: 'x' | 'y') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const step = e.shiftKey ? 10 : 1
    switch (e.key) {
      case 'ArrowLeft':
        set(x - step, y)
        break
      case 'ArrowRight':
        set(x + step, y)
        break
      case 'ArrowUp':
        set(x, y - step)
        break
      case 'ArrowDown':
        set(x, y + step)
        break
      case 'PageUp':
        axis === 'x' ? set(x + 10, y) : set(x, y - 10)
        break
      case 'PageDown':
        axis === 'x' ? set(x - 10, y) : set(x, y + 10)
        break
      case 'Home':
        axis === 'x' ? set(0, y) : set(x, 0)
        break
      case 'End':
        axis === 'x' ? set(100, y) : set(x, 100)
        break
      default:
        return
    }
    e.preventDefault()
  }

  // `type="range"` is spelled out on each input rather than spread in: the
  // jsx-a11y gate infers a control's implicit role from the literal attribute,
  // and reads a spread one as a textbox — which does not support
  // aria-valuetext, so the rule fails a slider that is in fact correct.
  const axisProps = { min: 0, max: 100, step: 1, className: 'sr-only' }

  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
    >
      <div
        ref={ref}
        className={`relative ${aspectClass} w-full ${compact ? '' : 'max-w-[220px] mx-auto'} overflow-hidden ${compact ? 'rounded-lg' : 'rounded-2xl'} cursor-crosshair select-none touch-none ring-1 ring-gray-200 dark:ring-gray-700 focus-within:shadow-[var(--focus-ring)]`}
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
        <input
          type="range"
          {...axisProps}
          aria-label={`${label} — horizontal`}
          aria-valuetext={`${Math.round(x)}% from the left`}
          value={Math.round(x)}
          onChange={(e) => set(+e.target.value, y)}
          onKeyDown={onKeyDown('x')}
        />
        <input
          type="range"
          {...axisProps}
          aria-label={`${label} — vertical`}
          aria-orientation="vertical"
          aria-valuetext={`${Math.round(y)}% from the top`}
          value={Math.round(y)}
          onChange={(e) => set(x, +e.target.value)}
          onKeyDown={onKeyDown('y')}
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
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          Drag, or use the arrow keys, to choose what stays in frame.
        </p>
      )}
    </div>
  )
}
