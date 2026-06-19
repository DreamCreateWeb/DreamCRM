'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { FlashToast } from '@/components/ui/flash-toast'
import { moneyExact, moneyFromCents, type PartnerDeleteDisposition } from '@/lib/types/referrals'
import {
  getPartnerLifecycleAction,
  deletePartnerAction,
  archivePartnerAction,
} from './admin-actions'

/**
 * Delete-partner confirm modal. The single destructive surface for a partner.
 * It explains which path applies, with the partner's numbers in mono:
 *
 *   - 'clean'   → hard delete (no money history). "Permanently delete" danger.
 *   - 'archive' → money history, no balance. Archive (keeps the audit trail).
 *   - 'resolve' → money history + an accrued balance. Two explicit resolutions:
 *                 "Pay out $X now, then archive" (needs payouts) OR
 *                 "Void the $X balance and archive". No silent money deletion.
 *
 * v2 modal: ink scrim + surface-2 + 12px radius + shadow-modal; the danger
 * action is separated from any secondary and never sits next to a primary.
 *
 * On success the modal closes and the caller is navigated/refreshed:
 *   - clean delete → push to /partners (the row is gone).
 *   - archive → router.refresh() (the page re-renders the archived state).
 */
export default function DeletePartnerModal({
  partnerId,
  partnerName,
  clinicCount,
  accruedCents,
  lifetimePaidCents,
  payoutsEnabled,
  /** When true (detail page), a clean delete navigates to /partners; when
   *  false (list row), the page just refreshes. */
  redirectOnDelete = false,
  trigger,
}: {
  partnerId: string
  partnerName: string
  clinicCount: number
  accruedCents: number
  lifetimePaidCents: number
  payoutsEnabled: boolean
  redirectOnDelete?: boolean
  trigger?: (open: () => void) => React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, dialogRef, {}) // keeps the component's own Escape handler
  const [disposition, setDisposition] = useState<PartnerDeleteDisposition | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Resolve the authoritative disposition from the server when the modal opens
  // (the row's cached numbers can lag a just-run payout).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getPartnerLifecycleAction(partnerId)
      .then((info) => {
        if (!cancelled) setDisposition(info.disposition)
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, partnerId])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
    setError(null)
  }

  function doDelete() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await deletePartnerAction(partnerId)
        if (r.ok) {
          setToast(`Deleted ${partnerName}`)
          setOpen(false)
          if (redirectOnDelete) router.push('/partners')
          else router.refresh()
        } else {
          // Money history appeared since we loaded — switch to archive.
          setDisposition(r.disposition)
        }
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  function doArchive(resolve?: 'pay' | 'void') {
    setError(null)
    startTransition(async () => {
      try {
        const r = await archivePartnerAction({ partnerId, resolve })
        if (r.ok) {
          setToast(`Archived ${partnerName}`)
          setOpen(false)
          router.refresh()
        } else {
          setError(
            `Still ${moneyExact(r.accruedCents)} owed — pay it out or void it before archiving.`,
          )
        }
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  const defaultTrigger = (
    <ActionButton variant="danger" size="sm" onClick={() => setOpen(true)}>
      Delete
    </ActionButton>
  )

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : defaultTrigger}

      {open && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Delete ${partnerName}`}
          onClick={close}
        >
          <div
            className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[color:var(--color-hairline)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {disposition === 'clean' ? 'Delete partner' : 'Close partner account'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 text-sm">
              <p className="font-medium text-gray-900 dark:text-gray-100 mb-3">{partnerName}</p>

              {/* The partner's numbers — mono. */}
              <dl className="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div>
                  <dt className="text-[color:var(--color-ink-500)] uppercase tracking-wide">Clinics</dt>
                  <dd className="font-mono-num tabular-nums text-gray-900 dark:text-gray-100 text-sm">{clinicCount}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-500)] uppercase tracking-wide">Accrued</dt>
                  <dd
                    className={`font-mono-num tabular-nums text-sm ${accruedCents > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100'}`}
                  >
                    {moneyExact(accruedCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-500)] uppercase tracking-wide">Lifetime paid</dt>
                  <dd className="font-mono-num tabular-nums text-gray-900 dark:text-gray-100 text-sm">
                    {moneyFromCents(lifetimePaidCents)}
                  </dd>
                </div>
              </dl>

              {loading ? (
                <div className="skeleton h-16 rounded-[var(--r-md)]" aria-hidden="true" />
              ) : disposition === 'clean' ? (
                <p className="text-[color:var(--color-ink-600)]">
                  This partner has no commission or payout history, so it can be{' '}
                  <span className="font-medium">permanently deleted</span>. Any clinics attributed to
                  them will simply lose the referral (no data is removed from the clinics). Their
                  email becomes free to reuse, and any linked login is left untouched.
                </p>
              ) : disposition === 'archive' ? (
                <p className="text-[color:var(--color-ink-600)]">
                  This partner has commission history, so it can’t be permanently deleted — that would
                  erase the audit trail. Instead it’ll be <span className="font-medium">archived</span>:
                  accrual stops, their portal closes, and they leave the active list, but their clinics
                  keep their history and the ledger + payouts are preserved.
                </p>
              ) : disposition === 'resolve' ? (
                <p className="text-[color:var(--color-ink-600)]">
                  This partner still has an accrued balance of{' '}
                  <span className="font-mono-num font-semibold">{moneyExact(accruedCents)}</span>. Settle it
                  before archiving — choose one:
                </p>
              ) : null}

              {error && (
                <div className="mt-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">
                  {error}
                </div>
              )}
            </div>

            {/* Actions. Danger/destructive separated to the right; never beside a primary. */}
            <div className="px-5 py-4 border-t border-[color:var(--color-hairline)] flex items-center justify-between gap-2">
              <ActionButton variant="secondary" size="sm" onClick={close} disabled={pending}>
                Cancel
              </ActionButton>

              {!loading && disposition === 'clean' && (
                <ActionButton variant="danger" size="sm" onClick={doDelete} disabled={pending}>
                  {pending ? 'Deleting…' : 'Permanently delete'}
                </ActionButton>
              )}

              {!loading && disposition === 'archive' && (
                <ActionButton variant="danger" size="sm" onClick={() => doArchive()} disabled={pending}>
                  {pending ? 'Archiving…' : 'Archive partner'}
                </ActionButton>
              )}

              {!loading && disposition === 'resolve' && (
                <div className="flex flex-col items-end gap-2">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    onClick={() => doArchive('pay')}
                    disabled={pending || !payoutsEnabled}
                    title={payoutsEnabled ? undefined : 'Partner hasn’t set up a payout method yet'}
                  >
                    {pending ? 'Working…' : `Pay out ${moneyExact(accruedCents)} now, then archive`}
                  </ActionButton>
                  <ActionButton variant="danger" size="sm" onClick={() => doArchive('void')} disabled={pending}>
                    {pending ? 'Working…' : `Void ${moneyExact(accruedCents)} and archive`}
                  </ActionButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}
