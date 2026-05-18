import { cn } from '@/lib/utils'

const INTENT_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  booking:    { bg: 'bg-emerald-50 dark:bg-emerald-500/10',  text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', label: 'Booking' },
  insurance:  { bg: 'bg-amber-50 dark:bg-amber-500/10',      text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500',   label: 'Insurance' },
  billing:    { bg: 'bg-rose-50 dark:bg-rose-500/10',        text: 'text-rose-700 dark:text-rose-300',       dot: 'bg-rose-500',    label: 'Billing' },
  records:    { bg: 'bg-sky-50 dark:bg-sky-500/10',          text: 'text-sky-700 dark:text-sky-300',         dot: 'bg-sky-500',     label: 'Records' },
  follow_up:  { bg: 'bg-violet-50 dark:bg-violet-500/10',    text: 'text-violet-700 dark:text-violet-300',   dot: 'bg-violet-500',  label: 'Follow up' },
  marketing:  { bg: 'bg-stone-100 dark:bg-stone-500/10',     text: 'text-stone-600 dark:text-stone-400',     dot: 'bg-stone-400',   label: 'Marketing' },
  other:      { bg: 'bg-stone-100 dark:bg-stone-500/10',     text: 'text-stone-600 dark:text-stone-400',     dot: 'bg-stone-400',   label: 'Other' },
}

export function IntentBadge({ intent, size = 'sm' }: { intent: string | null; size?: 'xs' | 'sm' }) {
  if (!intent) return null
  const c = INTENT_COLORS[intent] ?? INTENT_COLORS.other
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        c.bg,
        c.text,
        size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
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
export { INTENT_COLORS }
