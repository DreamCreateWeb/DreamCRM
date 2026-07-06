'use client'

import { openDemoScriptWindow } from '@/components/demo/demo-conductor'

/**
 * The branded-demo header chip — the ONLY presenter control on the shared
 * screen. Clicking opens (or refocuses — one named window) the pop-out
 * presenter script, where the talk tracks, notes, and the wrap-up live;
 * nothing script-like ever renders on the screen the prospect watches.
 * Popup blocked → navigate this tab to the script (non-destructive; the
 * beat list navigates back). Tinted with the prospect's brand accent
 * (amber fallback); TEXT stays ink — accent-colored text is a contrast
 * lottery.
 */
export default function PresentingChip({ clinicName }: { clinicName: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const w = openDemoScriptWindow()
        if (!w) window.location.assign('/demo/script')
      }}
      title="Open the presenter script (your screen, not theirs)"
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
