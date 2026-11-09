'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import Modal from '@/components/ui/modal'

/**
 * In-app confirmation dialog, replacing native window.confirm() across the
 * dashboard. Native confirm is off-brand, blocking, unstyleable, and
 * inaccessible; this is a teal v2 modal on the shared Modal primitive (role="dialog" + aria-modal, Escape /
 * backdrop to cancel, focus on the primary, body scroll-lock) exposed through a
 * Promise-based hook so call sites stay a one-line guard:
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Delete this?', danger: true }))) return
 */
export interface ConfirmOptions {
  title?: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Rose styling + "this is destructive" affordance for deletes / cancels. */
  danger?: boolean
}

type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

/**
 * Like useConfirm, but for SHARED components that can render outside a
 * ConfirmProvider (e.g. the legacy Mosaic demo surfaces). Falls back to native
 * window.confirm instead of throwing, so the component works everywhere.
 */
export function useConfirmSafe(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  return (
    ctx ??
    (async (opts = {}) => {
      if (typeof window === 'undefined') return false
      const text = opts.message ? `${opts.title ?? ''}\n\n${opts.message}`.trim() : (opts.title ?? 'Are you sure?')
      return window.confirm(text)
    })
  )
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const confirm = useCallback<ConfirmFn>(
    (opts = {}) => new Promise<boolean>((resolve) => setRequest({ opts, resolve })),
    [],
  )

  const settle = useCallback((value: boolean) => {
    setRequest((r) => {
      r?.resolve(value)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmDialog opts={request.opts} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
      )}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({
  opts,
  onCancel,
  onConfirm,
}: {
  opts: ConfirmOptions
  onCancel: () => void
  onConfirm: () => void
}) {
  const {
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
  } = opts

  // The shell (trap, Escape, backdrop, scroll lock, sheet-on-phone) is the
  // Modal primitive; this file owns only what a confirm SAYS and its buttons.
  return (
    <Modal
      open
      onClose={onCancel}
      label={title}
      size="sm"
      layer="top"
      initialFocusSelector="[data-confirm-primary]"
    >
      <div className="p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{title}</h2>
        {message && <div className="text-sm text-gray-500 dark:text-gray-400 mb-5">{message}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            data-confirm-primary=""
            type="button"
            onClick={onConfirm}
            className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 transition-colors ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500 dark:bg-rose-500 dark:hover:bg-rose-600'
                : 'bg-teal-600 hover:bg-teal-700 focus-visible:ring-teal-500 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default ConfirmProvider
