import type { ClientMessagingStats } from '@/lib/services/messages'
import { formatNumberShort } from '@/lib/utils/format'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

interface Props {
  stats: ClientMessagingStats
}

/**
 * Compact 3-tile stat strip at the top of the platform messaging sidebar.
 * Uses the design-system semantic tones (special = the active count, warn =
 * unread needs our reply, urgent = stale = waited too long). A zero count is
 * information, so it keeps full contrast rather than dimming into an alert hue.
 */
export default function ClientMessagingStats({ stats }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800">
      <Stat
        label="Active conversations"
        value={formatNumberShort(stats.activeConversations)}
        tone="special"
      />
      <Stat
        label="Unread"
        value={formatNumberShort(stats.unreadMessages)}
        active={stats.unreadMessages > 0}
        tone="warn"
      />
      <Stat
        label="Awaiting reply ≥ 3d"
        value={formatNumberShort(stats.staleConversations)}
        active={stats.staleConversations > 0}
        tone="urgent"
      />
    </div>
  )
}

/**
 * `active` lets a count go quiet (full-contrast neutral) when there's nothing
 * to act on — an empty unread/stale queue shouldn't shout in alert colors.
 */
function Stat({
  label,
  value,
  tone = 'special',
  active = true,
}: {
  label: string
  value: string
  tone?: Tone
  active?: boolean
}) {
  const valueClass = active ? TONE_TEXT[tone] : 'text-gray-800 dark:text-gray-100'
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
      <p className={`text-xl font-bold leading-tight tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}
