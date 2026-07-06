'use client'

import { DEMO_WRAPUP_EVENT } from '@/components/demo/presenter-panel'

/**
 * The branded-demo header chip — replaces DemoExitChip during a
 * prospect-branded demo (one control, one lifecycle: "Exit demo" on the
 * prospect's screen mid-pitch is off-brand). Shows who you're presenting
 * to; clicking opens the presenter panel's WRAP-UP (outcome logging) —
 * it used to end the demo instantly, so a mid-pitch misclick nuked the
 * whole session. Tinted with the prospect's brand accent (amber
 * fallback); TEXT stays ink — accent-colored text is a contrast lottery.
 */
export default function PresentingChip({ clinicName }: { clinicName: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(DEMO_WRAPUP_EVENT))}
      title="Wrap up this demo and log the outcome"
      className="inline-flex h-8 max-w-56 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-900 hover:opacity-80"
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
  )
}
