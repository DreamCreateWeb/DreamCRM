'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { FlashToast } from '@/components/ui/flash-toast'

/**
 * App-wide toast, replacing native alert() for action feedback. Mirrors the
 * ConfirmProvider pattern: mounted once in the dashboard shell, exposed through
 * a hook so any client component answers a mutation in-brand instead of with a
 * blocking browser popup.
 *
 *   const toast = useToast()
 *   toast('Saved.')                    // ok (emerald)
 *   toast(err.message, { tone: 'urgent' })
 */
type ToastTone = 'ok' | 'urgent' | 'neutral'
type ToastFn = (message: string, opts?: { tone?: ToastTone }) => void

const ToastContext = createContext<ToastFn | null>(null)

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; key: number } | null>(null)

  const show = useCallback<ToastFn>((message, opts) => {
    setToast({ message, tone: opts?.tone ?? 'ok', key: Date.now() })
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <FlashToast key={toast.key} message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />
      )}
    </ToastContext.Provider>
  )
}

export default ToastProvider
