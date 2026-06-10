import type { ReactNode } from 'react'
import { TONE_PILL, type Tone } from '@/lib/ui/encodings'

/**
 * Standard status pill. The tone carries the meaning (see lib/ui/encodings):
 * ok=done/healthy · warn=needs our action · urgent=problem now ·
 * info=in flight/ball-theirs · special=new/featured · neutral=inert.
 *
 * Pills encode categorical STATE. Time-urgency belongs to aging borders,
 * per-row flags belong to glyphs — don't overload the pill.
 */
export function StatusPill({
  tone,
  label,
  title,
  className = '',
  children,
}: {
  tone: Tone
  label?: string
  /** Optional hover explanation ("Needs a confirmation text"). */
  title?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_PILL[tone]} ${className}`}
    >
      {children ?? label}
    </span>
  )
}
