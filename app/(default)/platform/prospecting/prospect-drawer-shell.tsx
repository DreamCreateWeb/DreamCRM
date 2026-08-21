'use client'

import { useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

/**
 * Client shell for the server-rendered prospect drawer: scrim + Esc + focus
 * trap + role=dialog — the standard drawer dismiss contract — while the
 * CONTENT stays a server component (the ?prospect= deep link renders it with
 * zero client state, which is the part worth keeping).
 */
export default function ProspectDrawerShell({
  closeHref,
  label,
  children,
}: {
  closeHref: string
  label: string
  children: ReactNode
}) {
  const router = useRouter()
  const panelRef = useRef<HTMLElement>(null)
  const close = () => router.push(closeHref, { scroll: false })
  useFocusTrap(true, panelRef, { onEscape: close })

  return (
    <div
      className="fixed inset-0 z-40 bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px]"
      onClick={close}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-[var(--shadow-modal)] border-l border-[color:var(--color-hairline)] overflow-y-auto"
      >
        {children}
      </aside>
    </div>
  )
}
