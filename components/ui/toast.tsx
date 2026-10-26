'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { FlashToast, useBulkBarLift } from '@/components/ui/flash-toast'

/**
 * App-wide toast, replacing native alert() for action feedback. Mirrors the
 * ConfirmProvider pattern: mounted once in the dashboard shell, exposed through
 * a hook so any client component answers a mutation in-brand instead of with a
 * blocking browser popup.
 *
 *   const toast = useToast()
 *   toast('Saved.')                    // ok (emerald)
 *   toast(err.message, { tone: 'urgent' })
 *
 * A QUEUE, not a slot (2026-10-26). The provider used to hold ONE toast, so a
 * second call replaced the first mid-read. Now up to `MAX_VISIBLE` stack,
 * newest at the bottom; an identical message+tone already showing is not
 * added again; and when the cap is reached the oldest NON-urgent toast makes
 * room first — an unread error is the last thing to go.
 */
type ToastTone = 'ok' | 'urgent' | 'neutral'
type ToastFn = (message: string, opts?: { tone?: ToastTone }) => void
type ToastEntry = { id: number; message: string; tone: ToastTone }

export const MAX_VISIBLE_TOASTS = 3

const ToastContext = createContext<ToastFn | null>(null)

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

/** Pure: the next queue after a call — exported so the rules above are testable without a render. */
export function enqueueToast(queue: ToastEntry[], entry: ToastEntry): ToastEntry[] {
  if (queue.some((t) => t.message === entry.message && t.tone === entry.tone)) return queue
  const next = [...queue, entry]
  if (next.length <= MAX_VISIBLE_TOASTS) return next
  const victim = next.findIndex((t) => t.tone !== 'urgent')
  next.splice(victim === -1 ? 0 : victim, 1)
  return next
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const seq = useRef(0)

  const show = useCallback<ToastFn>((message, opts) => {
    const tone = opts?.tone ?? 'ok'
    setToasts((prev) => enqueueToast(prev, { id: ++seq.current, message, tone }))
  }, [])
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toasts.length > 0 && <ToastStack toasts={toasts} dismiss={dismiss} />}
    </ToastContext.Provider>
  )
}

function ToastStack({ toasts, dismiss }: { toasts: ToastEntry[]; dismiss: (id: number) => void }) {
  // The stack owns the position (and the lift above a mounted BulkBar); each
  // toast renders in flow inside it.
  const lift = useBulkBarLift()
  return (
    <div
      data-testid="toast-stack"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      style={lift != null ? { bottom: lift } : undefined}
    >
      {toasts.map((t) => (
        <StackedToast key={t.id} id={t.id} message={t.message} tone={t.tone} dismiss={dismiss} />
      ))}
    </div>
  )
}

/** One stable `onDone` per toast, so a sibling arriving does not re-arm this one's timer. */
function StackedToast({ id, message, tone, dismiss }: ToastEntry & { dismiss: (id: number) => void }) {
  const onDone = useCallback(() => dismiss(id), [dismiss, id])
  return <FlashToast placement="stacked" message={message} tone={tone} onDone={onDone} />
}

export default ToastProvider
