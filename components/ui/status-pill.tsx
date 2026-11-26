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
  size = 'sm',
  wrap = false,
  className = '',
  children,
}: {
  tone: Tone
  label?: string
  /** `lg` is for a screen read from across a room (the Huddle's Present
   *  mode). `sm` — the default — is the pill every list uses. */
  size?: 'sm' | 'lg'
  /** Let a long label wrap instead of running off a phone-width row (a
   *  flag that quotes an intake answer). Off by default: a status word
   *  should never break across two lines. */
  wrap?: boolean
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
      className={`inline-flex items-center font-medium ${size === 'lg' ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-xs'} ${wrap ? 'rounded-[var(--r-sm)] text-left' : 'rounded-full whitespace-nowrap'} ${TONE_PILL[tone]} ${className}`}
    >
      {children ?? label}
    </span>
  )
}
