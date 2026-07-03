'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEMO_BEATS,
  DEMO_GROUP_LABELS,
  renderTalkTrack,
} from '@/lib/types/demo-script'
import type { DemoSkin } from '@/lib/types/demo-skin'
import { groupGapsByBeat } from '@/lib/demo-gaps'
import { endBrandedDemoAction } from '@/app/(default)/ecommerce/customers/admin-actions'
import BeatProgress from './beat-progress'
import DemoTimer, { useDemoElapsed } from './demo-timer'
import BeatNotes from './beat-notes'
import GapCallouts from './gap-callouts'

/**
 * The presenter panel v2 — a floating, keyboard-driven demo script visible
 * ONLY to a platform admin inside demo mode (the server gates mounting).
 * → / n next · ← back · 1-{N} jump straight to a beat (the prospect asked
 * about reviews? hit 5) · Esc collapse. All presenter state lives in
 * sessionStorage (beat index, start time, visited, per-beat notes) so a
 * mid-demo reload resumes instead of resetting — and NOTHING touches the
 * database. The audience sees the app; you see the script.
 */

const VISITED_KEY = 'dc.demo-visited-beats'
const INDEX_KEY = 'dc.demo-beat-index'

function readVisited(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(VISITED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function readIndex(): number {
  try {
    const raw = Number(sessionStorage.getItem(INDEX_KEY))
    return Number.isInteger(raw) && raw >= 0 && raw < DEMO_BEATS.length ? raw : 0
  } catch {
    return 0
  }
}

function CollapsedPill({
  index,
  onOpen,
}: {
  index: number
  onOpen: () => void
}) {
  const elapsed = useDemoElapsed()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full bg-gray-900/90 dark:bg-gray-950/90 px-3 py-2 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10"
      title="Reopen the presenter script"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--demo-accent, #2dd4bf)' }}
        aria-hidden="true"
      />
      🎬 {index + 1}/{DEMO_BEATS.length} · <span className="tabular-nums">{elapsed}</span>
    </button>
  )
}

export default function PresenterPanel({ skin }: { skin: DemoSkin | null }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [visited, setVisited] = useState<Set<string>>(new Set())

  // Resume a mid-demo reload from sessionStorage.
  useEffect(() => {
    setVisited(readVisited())
    setIndex(readIndex())
  }, [])

  const gapsByBeat = useMemo(
    () => groupGapsByBeat(skin?.weaknesses ?? []),
    [skin?.weaknesses],
  )

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(DEMO_BEATS.length - 1, nextIndex))
      const beat = DEMO_BEATS[clamped]
      setIndex(clamped)
      setVisited((prev) => {
        const next = new Set(prev).add(beat.id)
        try {
          sessionStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(next)))
          sessionStorage.setItem(INDEX_KEY, String(clamped))
        } catch {
          /* private mode — progress just doesn't persist */
        }
        return next
      })
      router.push(beat.href)
    },
    [router],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from form fields.
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      if (e.key === 'Escape') setCollapsed(true)
      if (collapsed) return
      if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault()
        goTo(index + 1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
      }
      // Digit jump — "they asked about the website, hit 6". Derived from the
      // registry length so an added beat never needs a code change here.
      const digit = Number(e.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= DEMO_BEATS.length) {
        e.preventDefault()
        goTo(digit - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, goTo, index])

  const beat = DEMO_BEATS[index]
  const groupCount = DEMO_BEATS.filter((b) => b.group === beat.group).length
  const groupIndex = DEMO_BEATS.filter(
    (b, i) => b.group === beat.group && i <= index,
  ).length

  if (collapsed) return <CollapsedPill index={index} onOpen={() => setCollapsed(false)} />

  return (
    <aside
      className="fixed bottom-4 right-4 z-50 w-96 rounded-xl bg-gray-900/95 dark:bg-gray-950/95 text-gray-100 shadow-2xl ring-1 ring-white/10 backdrop-blur"
      data-testid="presenter-panel"
      style={{
        boxShadow:
          'inset 0 2px 0 0 color-mix(in srgb, var(--demo-accent, #2dd4bf) 55%, transparent), 0 25px 50px -12px rgb(0 0 0 / 0.5)',
      }}
    >
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-teal-300">
            🎬 Presenting{skin ? ` to ${skin.clinicName}` : ''}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DemoTimer />
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="text-gray-400 hover:text-gray-200 text-sm leading-none"
              aria-label="Collapse presenter panel"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Beat — keyed fade/slide so advancing feels alive (motion-safe only). */}
        <div
          key={beat.id}
          className="mt-2 motion-safe:animate-[fadeSlideIn_.25s_ease-out] motion-reduce:animate-none"
        >
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
            {DEMO_GROUP_LABELS[beat.group]} · beat {groupIndex} of {groupCount}
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {index + 1}. {beat.title}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-300">
            {renderTalkTrack(beat.talkTrack, skin)}
          </p>
          <GapCallouts gaps={gapsByBeat[beat.id]} />
          {skin?.websiteUrl && (
            <a
              href={skin.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200"
            >
              ↗ their current site
            </a>
          )}
          <BeatNotes beatId={beat.id} />
        </div>

        <div className="mt-3">
          <BeatProgress index={index} visited={visited} onJump={goTo} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
          >
            ← Back
          </button>
          <span className="text-[10px] text-gray-500">
            → next · 1-{DEMO_BEATS.length} jump · Esc hides
          </span>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={index === DEMO_BEATS.length - 1}
            className="rounded-md px-2.5 py-1 text-xs font-semibold text-gray-900 disabled:opacity-40"
            style={{ background: 'var(--demo-accent, #2dd4bf)' }}
          >
            Next →
          </button>
        </div>

        <form action={endBrandedDemoAction} className="mt-3 border-t border-white/10 pt-2 text-right">
          <button
            type="submit"
            className="text-[11px] font-medium text-rose-400/80 hover:text-rose-300"
            title="End the demo and log the outcome on the call list"
          >
            ■ End demo &amp; log outcome
          </button>
        </form>
      </div>
    </aside>
  )
}
