import type { ClientMessagingStats } from '@/lib/services/messages'
import { formatNumberShort } from '@/lib/utils/format'

interface Props {
  stats: ClientMessagingStats
}

export default function ClientMessagingStats({ stats }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800">
      <Stat
        label="Active conversations"
        value={formatNumberShort(stats.activeConversations)}
        tone="violet"
      />
      <Stat
        label="Unread"
        value={formatNumberShort(stats.unreadMessages)}
        tone={stats.unreadMessages > 0 ? 'amber' : 'gray'}
      />
      <Stat
        label="Awaiting reply ≥ 3d"
        value={formatNumberShort(stats.staleConversations)}
        tone={stats.staleConversations > 0 ? 'red' : 'gray'}
      />
    </div>
  )
}

const TONES = {
  violet: 'text-violet-600 dark:text-violet-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  gray: 'text-gray-800 dark:text-gray-100',
} as const

function Stat({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONES }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">{label}</p>
      <p className={`text-xl font-bold leading-tight ${TONES[tone]}`}>{value}</p>
    </div>
  )
}
