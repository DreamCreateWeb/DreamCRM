'use client'

import { endBrandedDemoAction } from '@/app/(default)/ecommerce/customers/admin-actions'

/**
 * The branded-demo header chip — replaces DemoExitChip during a
 * prospect-branded demo (one control, one lifecycle: "Exit demo" on the
 * prospect's screen mid-pitch is off-brand). Shows who you're presenting
 * to; clicking ends the demo and lands on the call list with the prospect
 * pinned for outcome logging. Tinted with the prospect's brand accent
 * (amber fallback); TEXT stays ink — accent-colored text is a contrast
 * lottery.
 */
export default function PresentingChip({ clinicName }: { clinicName: string }) {
  return (
    <form action={endBrandedDemoAction} className="shrink-0 min-w-0">
      <button
        type="submit"
        title="End this demo and log the outcome"
        className="inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-900 hover:opacity-80"
        style={{
          background: 'color-mix(in srgb, var(--demo-accent, #f59e0b) 14%, transparent)',
        }}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: 'var(--demo-accent, #f59e0b)' }}
          aria-hidden="true"
        />
        <span className="truncate">🎬 Presenting to {clinicName}</span>
      </button>
    </form>
  )
}
