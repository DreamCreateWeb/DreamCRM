'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SyncDirection } from '@/lib/types/pms'
import { disconnectPmsAction, setAutoSyncAction, setSyncDirectionAction, syncNowAction } from './actions'

interface Props {
  syncDirection: SyncDirection
  autoSyncEnabled: boolean
  isDemo: boolean
}

export default function SyncControls({ syncDirection, autoSyncEnabled, isDemo }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)

  function runSync() {
    setMsg(null)
    start(async () => {
      const r = await syncNowAction()
      if (r.ok) setMsg({ tone: r.status === 'partial' ? 'warn' : 'ok', text: r.status === 'partial' ? 'Synced with some skips.' : 'Sync complete.' })
      else setMsg({ tone: 'err', text: r.error ?? 'Sync failed.' })
      router.refresh()
    })
  }

  function toggleDirection() {
    const next: SyncDirection = syncDirection === 'two_way' ? 'import' : 'two_way'
    start(async () => {
      await setSyncDirectionAction(next)
      router.refresh()
    })
  }

  function toggleAuto() {
    start(async () => {
      await setAutoSyncAction(!autoSyncEnabled)
      router.refresh()
    })
  }

  function disconnect() {
    if (!confirm('Disconnect this PMS? Synced records stay, but new bookings will stop writing to the PMS and imports will pause.')) return
    start(async () => {
      await disconnectPmsAction()
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runSync}
          disabled={pending}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-stone-900 text-stone-100 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white disabled:opacity-50 inline-flex items-center gap-2"
        >
          <RefreshIcon spinning={pending} />
          {pending ? 'Syncing…' : 'Sync now'}
        </button>

        <button
          onClick={toggleDirection}
          disabled={pending}
          className="text-sm font-medium px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-300 disabled:opacity-50"
          title="Toggle whether DreamCRM also pushes its bookings into the PMS"
        >
          {syncDirection === 'two_way' ? 'Two-way sync' : 'Import only'}
        </button>

        <button
          onClick={toggleAuto}
          disabled={pending}
          className="text-sm font-medium px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-300 disabled:opacity-50"
        >
          Auto-sync: {autoSyncEnabled ? 'On' : 'Off'}
        </button>

        <button
          onClick={disconnect}
          disabled={pending}
          className="text-sm font-medium px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 disabled:opacity-50 ml-auto"
        >
          Disconnect
        </button>
      </div>

      {isDemo && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Sandbox connection — &quot;Sync now&quot; runs the real engine against sample data (no live PMS is contacted).
        </p>
      )}

      {msg && (
        <p
          className={`mt-2 text-[12px] ${
            msg.tone === 'ok'
              ? 'text-emerald-700 dark:text-emerald-300'
              : msg.tone === 'warn'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-rose-700 dark:text-rose-300'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.027 14.652H8.02v4.992m-3.71-9.673a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99m-.001 0h-4.99m-9.504 1.654a8.25 8.25 0 0013.803 3.7l3.181-3.182m0 0h-4.991m4.991 0v4.99" />
    </svg>
  )
}
