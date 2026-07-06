'use client'

import { useMemo, useState, useTransition } from 'react'
import type { DemoTrack } from '@/lib/types/demo-script'
import type { DemoSkin } from '@/lib/types/demo-skin'
import {
  MANUAL_LOSS_REASONS,
  LOSS_REASON_LABELS,
  type ProspectLossReason,
} from '@/lib/types/prospecting'
import { endBrandedDemoWithOutcomeAction } from '@/app/(default)/ecommerce/customers/admin-actions'

/**
 * The wrap-up view — the demo's landing strip, rendered in the pop-out
 * script window (the presenter's screen; the audience never sees it).
 * Every demo ends HERE, in a logged outcome, never a dead drop. Shows the
 * close reminder (the track's plan pitch), collects the result + a note
 * (pre-filled from the per-beat notes mirrored over the channel), logs it
 * and ends the branded demo — then hands the destination to the caller,
 * which tells the demo tab to navigate and closes this window.
 */

const OUTCOMES: Array<{ value: 'won' | 'callback' | 'not_interested'; label: string }> = [
  { value: 'won', label: '🏆 They’re in' },
  { value: 'callback', label: '📞 Follow up' },
  { value: 'not_interested', label: 'Not now' },
]

/** "The website story demo · 14 min" + the per-beat notes — the call log
 *  tells the win/loss review what actually happened. */
function buildDemoNote(
  track: DemoTrack,
  notes: Record<string, string>,
  startedAt: number | null,
): string {
  const minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) : null
  const parts: string[] = [`${track.label} demo${minutes ? ` · ${minutes} min` : ''}`]
  for (const b of track.beats) {
    const note = notes[b.id]
    if (note?.trim()) parts.push(`${b.title}: ${note.trim()}`)
  }
  return parts.join(' · ').slice(0, 480)
}

export default function WrapUp({
  skin,
  track,
  coveredCount,
  notes,
  startedAt,
  elapsed,
  onBack,
  onEnded,
}: {
  skin: DemoSkin | null
  track: DemoTrack
  coveredCount: number
  notes: Record<string, string>
  startedAt: number | null
  elapsed: string
  onBack: () => void
  onEnded: (to: string) => void
}) {
  const [outcome, setOutcome] = useState<'won' | 'callback' | 'not_interested' | null>(null)
  const [lostReason, setLostReason] = useState<ProspectLossReason>('bad_timing')
  const initialNote = useMemo(
    () => buildDemoNote(track, notes, startedAt),
    [track, notes, startedAt],
  )
  const [note, setNote] = useState(initialNote)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const finish = (input: Parameters<typeof endBrandedDemoWithOutcomeAction>[0]) =>
    startTransition(async () => {
      setError(null)
      try {
        const res = await endBrandedDemoWithOutcomeAction(input)
        onEnded(res.to)
      } catch {
        setError('Couldn’t end the demo — try again.')
      }
    })

  return (
    <div className="mt-4" data-testid="demo-wrapup">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        Wrap up · {coveredCount} of {track.beats.length} beats · {elapsed}
      </div>
      <div className="mt-0.5 text-sm font-semibold">
        That’s the pitch{skin ? ` for ${skin.clinicName}` : ''}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-300">{track.planPitch}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setOutcome(o.value)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
              outcome === o.value
                ? 'text-gray-900 ring-transparent'
                : 'text-gray-200 ring-white/15 hover:ring-white/30'
            }`}
            style={outcome === o.value ? { background: 'var(--demo-accent, #2dd4bf)' } : undefined}
          >
            {o.label}
          </button>
        ))}
      </div>

      {outcome === 'not_interested' && (
        <select
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value as ProspectLossReason)}
          aria-label="Why not"
          className="mt-2 w-full rounded-md bg-white/5 px-2 py-1.5 text-xs text-gray-200 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-white/25"
        >
          {MANUAL_LOSS_REASONS.map((r) => (
            <option key={r} value={r} className="bg-gray-900">
              {LOSS_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      )}

      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder="How it went, what they cared about, next step…"
        className="mt-2 w-full rounded-md bg-white/5 px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-white/25"
      />

      {error && <p className="mt-1 text-[11px] text-rose-400">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
        >
          ← Back to the script
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => finish({})}
            disabled={pending}
            className="text-[11px] text-gray-500 hover:text-gray-300 disabled:opacity-40"
            title="End the demo without logging an outcome"
          >
            Skip logging
          </button>
          <button
            type="button"
            onClick={() =>
              finish({
                outcome: outcome ?? undefined,
                note: note.trim() || undefined,
                lostReason: outcome === 'not_interested' ? lostReason : undefined,
              })
            }
            disabled={pending || !outcome}
            className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-40"
            style={{ background: 'var(--demo-accent, #2dd4bf)' }}
          >
            {pending ? 'Ending…' : 'Log & end demo'}
          </button>
        </div>
      </div>
    </div>
  )
}
