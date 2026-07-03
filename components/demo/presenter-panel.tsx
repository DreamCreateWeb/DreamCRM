'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEMO_BEATS, renderTalkTrack } from '@/lib/types/demo-script'
import type { DemoSkin } from '@/lib/types/demo-skin'

/**
 * The presenter panel — a floating, keyboard-driven demo script visible
 * ONLY to a platform admin inside demo mode (the server gates mounting).
 * → / n = next beat, ← = back, Esc = collapse. Visited checkmarks live in
 * sessionStorage (per-demo, zero DB). The audience sees the app; you see
 * the script.
 */

const VISITED_KEY = 'dc.demo-visited-beats'

function readVisited(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(VISITED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export default function PresenterPanel({ skin }: { skin: DemoSkin | null }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [visited, setVisited] = useState<Set<string>>(new Set())

  useEffect(() => {
    setVisited(readVisited())
  }, [])

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(DEMO_BEATS.length - 1, nextIndex))
      const beat = DEMO_BEATS[clamped]
      setIndex(clamped)
      setVisited((prev) => {
        const next = new Set(prev).add(beat.id)
        try {
          sessionStorage.setItem(VISITED_KEY, JSON.stringify(Array.from(next)))
        } catch {
          /* private mode — checkmarks just don't persist */
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, goTo, index])

  const beat = DEMO_BEATS[index]

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-gray-900/90 dark:bg-gray-100/90 text-white dark:text-gray-900 px-3 py-2 text-xs font-semibold shadow-lg"
        title="Reopen the presenter script"
      >
        🎬 {index + 1}/{DEMO_BEATS.length}
      </button>
    )
  }

  return (
    <aside
      className="fixed bottom-4 right-4 z-50 w-80 rounded-xl bg-gray-900/95 dark:bg-gray-950/95 text-gray-100 shadow-2xl ring-1 ring-white/10 p-4"
      data-testid="presenter-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-300">
          🎬 Presenting{skin ? ` as ${skin.clinicName}` : ''}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-gray-200 text-sm leading-none"
          aria-label="Collapse presenter panel"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 text-sm font-semibold">
        {index + 1}. {beat.title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-300">
        {renderTalkTrack(beat.talkTrack, skin)}
      </p>

      <div className="mt-3 flex items-center gap-1">
        {DEMO_BEATS.map((b, i) => (
          <button
            key={b.id}
            type="button"
            title={b.title}
            onClick={() => goTo(i)}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i === index ? 'bg-teal-400' : visited.has(b.id) ? 'bg-teal-800' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
        >
          ← Back
        </button>
        <span className="text-[10px] text-gray-500">→ or n for next · Esc hides</span>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === DEMO_BEATS.length - 1}
          className="rounded-md bg-teal-500 px-2.5 py-1 text-xs font-semibold text-gray-900 hover:bg-teal-400 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </aside>
  )
}
