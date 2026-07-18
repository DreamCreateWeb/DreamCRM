import { cn } from '@/lib/utils'
import { TONE_PILL, type Tone } from '@/lib/ui/encodings'

/**
 * AI-classified email *intent* (booking / insurance / …). Intent is an
 * editorial CATEGORY, not a workflow status — but each category maps cleanly
 * onto a semantic tone whose hue already matched the legacy palette, so we
 * source the badge color from the contract (`TONE_PILL`) and keep `dot` for
 * the dense list/avatar cues. The label is always rendered as text, so the
 * color never carries meaning alone.
 */
const INTENT_TONE: Record<string, Tone> = {
  booking: 'ok',
  insurance: 'warn',
  billing: 'urgent',
  records: 'info',
  follow_up: 'special',
  marketing: 'neutral',
  other: 'neutral',
}

const INTENT_COLORS: Record<string, { dot: string; label: string }> = {
  booking:   { dot: 'bg-emerald-500', label: 'Booking' },
  insurance: { dot: 'bg-amber-500',   label: 'Insurance' },
  billing:   { dot: 'bg-rose-500',    label: 'Billing' },
  records:   { dot: 'bg-violet-500',  label: 'Records' },
  follow_up: { dot: 'bg-fuchsia-500', label: 'Follow up' },
  marketing: { dot: 'bg-gray-400',    label: 'Marketing' },
  other:     { dot: 'bg-gray-400',    label: 'Other' },
}

export function IntentBadge({ intent, size = 'sm' }: { intent: string | null; size?: 'xs' | 'sm' }) {
  if (!intent) return null
  const c = INTENT_COLORS[intent] ?? INTENT_COLORS.other
  const tone = INTENT_TONE[intent] ?? 'neutral'
  return (
    <span
      title={`Intent: ${c.label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium text-xs',
        TONE_PILL[tone],
        size === 'xs' ? 'px-1.5 py-0.5' : 'px-2 py-0.5',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} aria-hidden="true" />
      {c.label}
    </span>
  )
}

export function IntentDot({ intent }: { intent: string | null }) {
  if (!intent) return <span className="w-1 h-8 rounded-full bg-transparent" />
  const c = INTENT_COLORS[intent] ?? INTENT_COLORS.other
  return <span className={cn('w-1 h-8 rounded-full shrink-0', c.dot)} />
}

export const INTENT_LIST = Object.keys(INTENT_COLORS) as Array<keyof typeof INTENT_COLORS>
export { INTENT_COLORS, INTENT_TONE }
