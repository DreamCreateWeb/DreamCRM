'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SyncDirection } from '@/lib/types/pms'
import { disconnectPmsAction, setAutoSyncAction, setSyncDirectionAction, syncNowAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'

/**
 * The module's heartbeat action — "Sync now" — lives in the PageHeader as the
 * single primary. Kept its own client component so its in-flight + result
 * feedback travel with the button.
 */
export function SyncNowButton() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [toast, setToast] = useState<{ tone: 'ok' | 'urgent'; text: string } | null>(null)

  function runSync() {
    setToast(null)
    start(async () => {
      const r = await syncNowAction()
      if (r.ok) {
        // A budget-capped first import parked a resume cursor — tell the clinic
        // it's still going (the hourly cron + the next "Sync now" continue it).
        if (r.partial && r.progress) {
          const { imported, total } = r.progress
          setToast({
            tone: 'ok',
            text: `Imported ${imported.toLocaleString()} of ${total.toLocaleString()} so far — continuing automatically.`,
          })
        } else if (r.status === 'partial') {
          setToast({ tone: 'ok', text: 'Synced with some skips.' })
        } else {
          setToast({ tone: 'ok', text: 'Sync complete.' })
        }
      } else setToast({ tone: 'urgent', text: r.error ?? 'Sync failed.' })
      router.refresh()
    })
  }

  return (
    <>
      <ActionButton variant="primary" size="sm" onClick={runSync} disabled={pending}>
        <RefreshIcon spinning={pending} />
        <span className="ml-1.5">{pending ? 'Syncing…' : 'Sync now'}</span>
      </ActionButton>
      {toast && <FlashToast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} />}
    </>
  )
}

interface Props {
  syncDirection: SyncDirection
  autoSyncEnabled: boolean
  isDemo: boolean
}

/**
 * The connection's management controls (direction · auto-sync · disconnect) —
 * secondary to the header's "Sync now" primary. Disconnect is the only
 * destructive verb, separated to the right.
 */
export default function SyncControls({ syncDirection, autoSyncEnabled, isDemo }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function toggleDirection() {
    const next: SyncDirection = syncDirection === 'two_way' ? 'import' : 'two_way'
    start(async () => {
      await setSyncDirectionAction(next)
      setToast(next === 'two_way' ? 'Two-way sync on — bookings push to your PMS.' : 'Import only — bookings stay in DreamCRM.')
      router.refresh()
    })
  }

  function toggleAuto() {
    start(async () => {
      await setAutoSyncAction(!autoSyncEnabled)
      setToast(!autoSyncEnabled ? 'Auto-sync on.' : 'Auto-sync off.')
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
        <ActionButton
          variant="secondary"
          size="sm"
          onClick={toggleDirection}
          disabled={pending}
          title="Toggle whether DreamCRM also pushes its bookings into the PMS"
        >
          {syncDirection === 'two_way' ? 'Two-way sync' : 'Import only'}
        </ActionButton>

        <ActionButton variant="secondary" size="sm" onClick={toggleAuto} disabled={pending}>
          Auto-sync: {autoSyncEnabled ? 'On' : 'Off'}
        </ActionButton>

        <ActionButton variant="danger" size="sm" onClick={disconnect} disabled={pending} className="ml-auto">
          Disconnect
        </ActionButton>
      </div>

      {isDemo && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Sandbox connection — &quot;Sync now&quot; runs the real engine against sample data (no live PMS is contacted).
        </p>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.027 14.652H8.02v4.992m-3.71-9.673a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99m-.001 0h-4.99m-9.504 1.654a8.25 8.25 0 0013.803 3.7l3.181-3.182m0 0h-4.991m4.991 0v4.99" />
    </svg>
  )
}
