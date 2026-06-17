import type { ReactNode } from 'react'
import { TONE_PILL, type Tone } from '@/lib/ui/encodings'

/**
 * Standard status pill. The tone carries the meaning (see lib/ui/encodings):
 * ok=done/healthy · warn=needs our action · urgent=problem now ·
 * info=in flight/ball-theirs (indigo) · special=new/featured · neutral=inert.
 * Teal is NEVER a status — a teal pill is a contract violation.
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
      // Semantic hook: the TONE is the meaning (the Tailwind classes are just
      // how it's painted). Exposing it lets tests + debugging assert the tone
      // contract without coupling to color-class strings that change on a restyle.
      data-tone={tone}
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_PILL[tone]} ${className}`}
    >
      {children ?? label}
    </span>
  )
}
