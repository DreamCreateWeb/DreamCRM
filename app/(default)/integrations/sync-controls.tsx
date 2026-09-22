'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SyncDirection } from '@/lib/types/pms'
import { disconnectPmsAction, setAutoSyncAction, setSyncDirectionAction, syncNowAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'

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
      <ActionButton variant="primary" size="sm" onClick={runSync} pending={pending}>
        <RefreshIcon />
        <span className="ml-1.5">Sync now</span>
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
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  // The three controls below are on screen together, so one shared flag spun
  // all three — `active` names the one whose work is actually running.
  const [active, setActive] = useState<'direction' | 'auto' | 'disconnect' | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)

  function toggleDirection() {
    const next: SyncDirection = syncDirection === 'two_way' ? 'import' : 'two_way'
    setActive('direction')
    start(async () => {
      const change = await setSyncDirectionAction(next)
      setToast(directionToast(next, change))
      router.refresh()
    })
  }

  function toggleAuto() {
    setActive('auto')
    start(async () => {
      await setAutoSyncAction(!autoSyncEnabled)
      setToast({ text: !autoSyncEnabled ? 'Auto-sync on.' : 'Auto-sync off.', tone: 'ok' })
      router.refresh()
    })
  }

  async function disconnect() {
    if (
      !(await confirm({
        title: 'Disconnect this PMS?',
        message: 'Synced records stay, but new bookings will stop writing to the PMS and imports will pause.',
        confirmLabel: 'Disconnect',
        danger: true,
      }))
    )
      return
    setActive('disconnect')
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
          pending={pending && active === 'direction'}
          disabled={pending}
          title="Toggle whether DreamCRM also pushes its bookings into the PMS"
        >
          {syncDirection === 'two_way' ? 'Two-way sync' : 'Import only'}
        </ActionButton>

        <ActionButton variant="secondary" size="sm" onClick={toggleAuto} pending={pending && active === 'auto'} disabled={pending}>
          Auto-sync: {autoSyncEnabled ? 'On' : 'Off'}
        </ActionButton>

        <ActionButton variant="danger" size="sm" onClick={disconnect} pending={pending && active === 'disconnect'} disabled={pending} className="ml-auto">
          Disconnect
        </ActionButton>
      </div>

      {isDemo && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Sandbox connection — &quot;Sync now&quot; runs the real engine against sample data (no live PMS is contacted).
        </p>
      )}

      {toast && (
        <FlashToast
          message={toast.text}
          tone={toast.tone}
          // A warning nobody can finish reading is not a warning. The stranded
          // count is a longer sentence than "Auto-sync off." and it is the one
          // sentence on this page a practice must not miss.
          duration={toast.tone === 'warn' ? 12000 : 4000}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  )
}

/**
 * What the practice is told after a direction flip.
 *
 * Turning write-back OFF with bookings already queued strands them: the flush
 * only ever runs on a two-way connection, so neither the hourly cron nor "Sync
 * now" will drive them again. Before DREAMCRM-97 the flip said nothing about
 * it and the page went on promising the queue would "push on next sync".
 *
 * The WARNING only — it does not offer to drain or discard anything. That is a
 * product decision with its own (not-1.0) ledger entry, and a toast is not
 * where it would go.
 */
function directionToast(
  next: SyncDirection,
  change: { strandedWrites: number; oldestStrandedAt: Date | null },
): { text: string; tone: 'ok' | 'warn' } {
  if (next === 'two_way') {
    return { text: 'Two-way sync on — bookings push to your PMS.', tone: 'ok' }
  }
  const n = change.strandedWrites
  if (n === 0) return { text: 'Import only — bookings stay in DreamCRM.', tone: 'ok' }
  const oldest = change.oldestStrandedAt ? new Date(change.oldestStrandedAt) : null
  const since =
    oldest && !Number.isNaN(oldest.getTime())
      ? ` (oldest queued ${oldest.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`
      : ''
  return {
    tone: 'warn',
    text:
      `Import only — ${n} ${n === 1 ? 'change that was' : 'changes that were'} waiting to reach your PMS` +
      `${since} will not be sent. Turn two-way sync back on to send ${n === 1 ? 'it' : 'them'}.`,
  }
}

/** Decorative only — the busy state is ActionButton's own overlaid spinner,
 *  so this never spins on its own account. */
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.027 14.652H8.02v4.992m-3.71-9.673a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99m-.001 0h-4.99m-9.504 1.654a8.25 8.25 0 0013.803 3.7l3.181-3.182m0 0h-4.991m4.991 0v4.99" />
    </svg>
  )
}
