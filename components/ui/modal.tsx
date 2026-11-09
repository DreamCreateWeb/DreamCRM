'use client'

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { cn } from '@/lib/utils'

/**
 * THE modal primitive. Below `sm` it is a bottom sheet (grab handle, safe-area
 * padding, a keyboard-safe `85dvh` body scroll); from `sm` up it is a centred
 * dialog. Every modal in the dashboard, the portal and the platform tenant is
 * this one component, so the focus trap and the close rules live in ONE file:
 *
 * - focus moves in on open and returns to the opener on close (`useFocusTrap`);
 * - Escape, a backdrop tap and the X close it — unless `blocking` (a busy
 *   state: a save in flight refuses every close path, including the X);
 * - `aria-modal`, labelled by the visible `title` (or `label` when the body
 *   carries its own heading); the body scrolls under a locked page;
 * - motion is the shared `section-enter`, which collapses under reduced motion.
 *
 * THE DIALOG LAW (CLAUDE.md): a confirm dialog is AWAITED BEFORE a transition.
 * `await confirm(...)` first, THEN `startTransition(...)`. Awaited inside a
 * transition, React 19 holds the render and the click dies. `useConfirm`
 * (confirm-dialog.tsx) is built on this primitive and keeps its Promise API.
 *
 * Do not hand-roll a `role="dialog"` / fixed overlay anywhere else: the
 * `tests/ui/no-hand-rolled-modal.test.ts` grader fails CI on one.
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** A visible heading; also the accessible name. */
  title?: ReactNode
  /** id of a heading inside the body that names the dialog (instead of `title`/`label`). */
  labelledBy?: string
  /** Accessible name when the body renders its own heading (no `title`). */
  label?: string
  size?: ModalSize
  /** Pinned footer row (actions). */
  footer?: ReactNode
  /** A busy state: Escape, the backdrop and the X all refuse to close. */
  blocking?: boolean
  /** Focus the first focusable on open (default). Off when the body focuses its own target. */
  initialFocus?: boolean
  /** A backdrop tap closes (default). Off ONLY for an irreversible flow where leaving must be an explicit act. */
  backdropClose?: boolean
  /** CSS selector of the element to focus on open (e.g. a confirm's primary); default the first focusable. */
  initialFocusSelector?: string
  /** Stacking layer for the rare modal that must sit above another. */
  layer?: 'base' | 'top'
  /** Extra classes on the panel (width overrides, padding). */
  className?: string
  children: ReactNode
}

// Nested modals share one scroll lock; the last one out restores the page.
let lockCount = 0
let lockPrev = ''

export default function Modal(props: ModalProps) {
  if (!props.open) return null
  return <ModalInner {...props} />
}

function ModalInner({
  onClose,
  title,
  label,
  labelledBy,
  size = 'md',
  footer,
  blocking = false,
  initialFocus = true,
  initialFocusSelector,
  backdropClose = true,
  layer = 'base',
  className,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef({ onClose, blocking })
  closeRef.current = { onClose, blocking }

  const tryClose = useCallback(() => {
    if (closeRef.current.blocking) return
    closeRef.current.onClose()
  }, [])

  useFocusTrap(true, panelRef, { onEscape: tryClose, initialFocus, focusSelector: initialFocusSelector })

  useEffect(() => {
    if (lockCount === 0) {
      lockPrev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1
    return () => {
      lockCount -= 1
      if (lockCount === 0) document.body.style.overflow = lockPrev
    }
  }, [])

  return (
    <div
      data-modal-backdrop=""
      className={cn(
        'v2-app fixed inset-0 flex items-end sm:items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] sm:px-4',
        layer === 'top' ? 'z-[100]' : 'z-50',
      )}
      onClick={backdropClose ? tryClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : labelledBy}
        aria-label={title || labelledBy ? undefined : label}
        data-modal=""
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'section-enter bg-[color:var(--color-surface-2)] shadow-[var(--shadow-modal)] w-full flex flex-col',
          'rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto',
          'pb-[env(safe-area-inset-bottom)] sm:pb-0',
          SIZES[size],
          className,
        )}
      >
        <div className="sm:hidden flex justify-center pt-2 shrink-0" aria-hidden="true" data-modal-handle="">
          <span className="h-1 w-10 rounded-full bg-[color:var(--color-hairline)]" />
        </div>
        {title && (
          <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[color:var(--color-hairline)] shrink-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {title}
            </h2>
            <button
              type="button"
              onClick={tryClose}
              disabled={blocking}
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}
        {children}
        {footer && (
          <div className="px-6 py-4 border-t border-[color:var(--color-hairline)] flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
