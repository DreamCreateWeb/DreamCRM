'use client'

import { useEffect, useState } from 'react'
import { relativeTime } from '@/lib/utils'

interface Props {
  accounts: { lastSyncAt: string | null; syncStatus: string }[]
}

/**
 * "Synced 4 min ago · checking" — honest state from the real columns
 * (`email_account.last_sync_at` / `sync_status`). The inbox renders from the
 * database; the machine syncs behind it, so say how fresh the copy is. The
 * time is formatted in the viewer's browser (never a server-built string).
 * Ticks each 30s so "4 min ago" stays true without a refresh.
 */
export default function SyncedLine({ accounts }: Props) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const syncing = accounts.some((a) => a.syncStatus === 'syncing')
  const errored = accounts.some((a) => a.syncStatus === 'error')
  // The OLDEST successful sync across mailboxes — the honest "as fresh as".
  const stamps = accounts.map((a) => a.lastSyncAt).filter((v): v is string => !!v)
  const oldest = stamps.length === accounts.length && stamps.length > 0
    ? stamps.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
    : null

  let text: string
  if (!oldest) text = syncing ? 'Syncing your mailbox for the first time…' : 'Your mailbox will sync shortly'
  else text = `Synced ${relativeTime(oldest)}`
  if (oldest && syncing) text += ' · checking'

  return (
    <div
      role="status"
      data-testid="inbox-synced-line"
      className="shrink-0 border-b border-gray-200 dark:border-gray-700/60 px-4 py-1 text-xs text-ink-500 truncate"
    >
      {text}
      {errored && <span className="ml-2 text-amber-700 dark:text-amber-300">· one mailbox is retrying</span>}
    </div>
  )
}
