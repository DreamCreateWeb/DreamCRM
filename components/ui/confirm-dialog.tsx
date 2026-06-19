'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * In-app confirmation dialog, replacing native window.confirm() across the
 * dashboard. Native confirm is off-brand, blocking, unstyleable, and
 * inaccessible; this is a teal v2 modal (role="dialog" + aria-modal, Escape /
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
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel])

  const {
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
  } = opts

  return (
    <div
      className="v2-app fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="v2-card w-full max-w-sm p-6 pop-in"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
          {title}
        </h2>
        {message && <div className="text-sm text-gray-500 dark:text-gray-400 mb-5">{message}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 transition-colors ${
              danger
                ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500 dark:bg-rose-500 dark:hover:bg-rose-600'
                : 'bg-teal-600 hover:bg-teal-700 focus-visible:ring-teal-500 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmProvider
