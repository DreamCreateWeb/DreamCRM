'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEMO_GROUP_LABELS,
  DEMO_TRACK_LIST,
  resolveTrack,
  renderTalkTrack,
  type DemoTrackId,
} from '@/lib/types/demo-script'
import type { DemoSkin } from '@/lib/types/demo-skin'
import { groupGapsByBeat } from '@/lib/demo-gaps'
import { ensurePresenterScope } from './presenter-session'
import BeatProgress from './beat-progress'
import DemoTimer, { useDemoElapsed } from './demo-timer'
import BeatNotes from './beat-notes'
import GapCallouts from './gap-callouts'
import WrapUp from './wrap-up'

/**
 * The presenter panel v3 — a floating, keyboard-driven demo script visible
 * ONLY to a platform admin inside demo mode (the server gates mounting).
 * Track-aware: the demo tells the story THIS prospect cares about (website /
 * presence / social / front desk / everything), switchable mid-call when
 * discovery changes the story. → / n next · ← back · 1-{N} jump straight to
 * a beat · Esc collapse. All presenter state lives in sessionStorage SCOPED
 * TO THE PROSPECT (a new demo never resumes the last one's clock or beat),
 * and NOTHING touches the database. Past the last beat is the WRAP-UP — the
 * demo always ends in a logged outcome on the call list, never a dead end.
 */

const VISITED_KEY = 'dc.demo-visited-beats'
const INDEX_KEY = 'dc.demo-beat-index'
const TRACK_KEY = 'dc.demo-track'

/** The header chip fires this to open the wrap-up from anywhere. */
export const DEMO_WRAPUP_EVENT = 'dc:demo-wrapup'

function readVisited(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(VISITED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function readIndex(beatCount: number): number {
  try {
    const raw = Number(sessionStorage.getItem(INDEX_KEY))
    return Number.isInteger(raw) && raw >= 0 && raw < beatCount ? raw : 0
  } catch {
    return 0
  }
}

function readTrackOverride(): DemoTrackId | null {
  try {
    const raw = sessionStorage.getItem(TRACK_KEY)
    return raw && DEMO_TRACK_LIST.some((t) => t.id === raw) ? (raw as DemoTrackId) : null
  } catch {
    return null
  }
}

function CollapsedPill({
  index,
  total,
  onOpen,
}: {
  index: number
  total: number
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
      🎬 {index + 1}/{total} · <span className="tabular-nums">{elapsed}</span>
    </button>
  )
}

export default function PresenterPanel({ skin }: { skin: DemoSkin | null }) {
  const router = useRouter()
  const [trackId, setTrackId] = useState<DemoTrackId>(
    (skin?.track as DemoTrackId | undefined) ?? 'full',
  )
  const [index, setIndex] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [wrapup, setWrapup] = useState(false)
  const [visited, setVisited] = useState<Set<string>>(new Set())

  const track = resolveTrack(trackId)
  const beats = track.beats

  // A new prospect = a fresh demo: reset the scoped session (clock, beat,
  // notes, track override), THEN resume whatever this demo already stored.
  useEffect(() => {
    ensurePresenterScope(skin?.prospectId ?? 'generic')
    const override = readTrackOverride()
    const activeTrack = resolveTrack(override ?? (skin?.track as DemoTrackId | undefined) ?? 'full')
    setTrackId(activeTrack.id)
    setVisited(readVisited())
    setIndex(readIndex(activeTrack.beats.length))
  }, [skin?.prospectId, skin?.track])

  const gapsByBeat = useMemo(
    () => groupGapsByBeat(skin?.weaknesses ?? []),
    [skin?.weaknesses],
  )

  const goTo = useCallback(
    (nextIndex: number) => {
      // Past the last beat = the wrap-up, never a dead end.
      if (nextIndex >= beats.length) {
        setWrapup(true)
        return
      }
      const clamped = Math.max(0, nextIndex)
      const beat = beats[clamped]
      setWrapup(false)
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
    [router, beats],
  )

  const switchTrack = useCallback(
    (id: DemoTrackId) => {
      try {
        sessionStorage.setItem(TRACK_KEY, id)
      } catch {
        /* private mode */
      }
      setTrackId(id)
      setWrapup(false)
      const first = resolveTrack(id).beats[0]
      setIndex(0)
      setVisited((prev) => {
        const next = new Set(prev).add(first.id)
        try {
          sessionStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(next)))
          sessionStorage.setItem(INDEX_KEY, '0')
        } catch {
          /* private mode */
        }
        return next
      })
      router.push(first.href)
    },
    [router],
  )

  // The header "Presenting to X" chip opens the wrap-up (it used to nuke the
  // demo instantly — mid-pitch misclicks lost the whole session).
  useEffect(() => {
    const onWrapup = () => {
      setCollapsed(false)
      setWrapup(true)
    }
    window.addEventListener(DEMO_WRAPUP_EVENT, onWrapup)
    return () => window.removeEventListener(DEMO_WRAPUP_EVENT, onWrapup)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from form fields.
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      if (e.key === 'Escape') {
        if (wrapup) setWrapup(false)
        else setCollapsed(true)
        return
      }
      if (collapsed || wrapup) return
      if (e.key === 'ArrowRight' || e.key === 'n') {
        e.preventDefault()
        goTo(index + 1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
      }
      // Digit jump — "they asked about the website, hit 6". Derived from the
      // active track's length so an added beat never needs a code change here.
      const digit = Number(e.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= beats.length) {
        e.preventDefault()
        goTo(digit - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, wrapup, goTo, index, beats.length])

  const safeIndex = Math.min(index, beats.length - 1)
  const beat = beats[safeIndex]
  const groupCount = beats.filter((b) => b.group === beat.group).length
  const groupIndex = beats.filter((b, i) => b.group === beat.group && i <= safeIndex).length
  const isLast = safeIndex === beats.length - 1
  const coveredCount = beats.filter((b) => visited.has(b.id)).length

  if (collapsed)
    return <CollapsedPill index={safeIndex} total={beats.length} onOpen={() => setCollapsed(false)} />

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

        {/* The story this demo tells — switchable mid-call when discovery
            changes it ("we really just need the website" → switch, beat 1). */}
        <div className="mt-2 flex items-center gap-2">
          <label
            htmlFor="demo-track"
            className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-gray-500"
          >
            Story
          </label>
          <select
            id="demo-track"
            value={trackId}
            onChange={(e) => switchTrack(e.target.value as DemoTrackId)}
            className="w-full rounded-md bg-white/5 px-2 py-1 text-xs text-gray-200 ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-white/25"
          >
            {DEMO_TRACK_LIST.map((t) => (
              <option key={t.id} value={t.id} className="bg-gray-900">
                {t.emoji} {t.label} · {t.beats.length} beats
              </option>
            ))}
          </select>
        </div>

        {wrapup ? (
          <WrapUp
            skin={skin}
            track={track}
            coveredCount={coveredCount}
            onBack={() => setWrapup(false)}
          />
        ) : (
          <>
            {/* Beat — keyed fade/slide so advancing feels alive (motion-safe only). */}
            <div
              key={beat.id}
              className="mt-2 motion-safe:animate-[fadeSlideIn_.25s_ease-out] motion-reduce:animate-none"
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                {DEMO_GROUP_LABELS[beat.group]} · beat {groupIndex} of {groupCount}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {safeIndex + 1}. {beat.title}
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
              <BeatProgress beats={beats} index={safeIndex} visited={visited} onJump={goTo} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goTo(safeIndex - 1)}
                disabled={safeIndex === 0}
                className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
              >
                ← Back
              </button>
              <span className="text-[10px] text-gray-500">
                → next · 1-{beats.length} jump · Esc hides
              </span>
              <button
                type="button"
                onClick={() => goTo(safeIndex + 1)}
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-gray-900"
                style={{ background: 'var(--demo-accent, #2dd4bf)' }}
              >
                {isLast ? 'Wrap up →' : 'Next →'}
              </button>
            </div>

            <div className="mt-3 border-t border-white/10 pt-2 text-right">
              <button
                type="button"
                onClick={() => setWrapup(true)}
                className="text-[11px] font-medium text-rose-400/80 hover:text-rose-300"
                title="End the demo and log the outcome on the call list"
              >
                ■ End demo &amp; log outcome
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
