'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppProvider } from '@/app/app-provider'

/**
 * Global keyboard map for the dashboard shell (DESIGN-SYSTEM.md Part 4):
 *   [            toggle the sidebar rail (expanded ⇄ icon rail)
 *   ⌘1 / ⌘2 / ⌘3 navigate to the pinned cockpit paths (in registry order)
 *   C            open the header quick-create menu
 *   G then P/A/L/M/D/F  go to Patients / Appointments / Leads / Messages /
 *                My Day / Follow-ups (500ms chord window)
 *   ?            this map, as a sheet — a power-user layer nobody can find
 *                is a layer nobody uses
 *
 * ⌘K stays owned by the header (the palette). Esc closing surfaces is owned by
 * each surface (the sheet handles its own). We never intercept while focus is
 * in a text field / select / contenteditable, or while a modal is open
 * (aria-modal present), so typing and modal interactions are untouched.
 *
 * `cockpitPaths` are the resolved hrefs of the tenant's pinned modules — the
 * shell passes them so ⌘1/2/3 target whatever each registry pinned.
 */

/** The G-chord destinations — ONE registry drives both the handler and the
 *  sheet, so the help can never drift from the behavior. */
const GO_CHORDS: Array<{ key: string; dest: string; label: string }> = [
  { key: 'p', dest: '/patients', label: 'Patients' },
  { key: 'a', dest: '/appointments', label: 'Appointments' },
  { key: 'l', dest: '/leads', label: 'Leads' },
  { key: 'm', dest: '/messages', label: 'Messages' },
  { key: 'd', dest: '/my-day', label: 'My Day' },
  { key: 'f', dest: '/followups', label: 'Follow-ups' },
]

/** Rows for the sheet (the non-chord singles). */
const SINGLE_KEYS: Array<{ combo: string; label: string }> = [
  { combo: '⌘K', label: 'Search & actions (the palette)' },
  { combo: 'C', label: 'Quick create' },
  { combo: '[', label: 'Toggle the sidebar rail' },
  { combo: '⌘1 · ⌘2 · ⌘3', label: 'Your pinned cockpit pages' },
  { combo: '?', label: 'This sheet' },
]

export default function KeyboardShortcuts({ cockpitPaths }: { cockpitPaths: string[] }) {
  const router = useRouter()
  const { toggleRail } = useAppProvider()
  // Tracks an in-flight `G` chord; cleared after the window elapses.
  const goPending = useRef(false)
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetOpenRef = useRef(false)
  sheetOpenRef.current = sheetOpen

  useEffect(() => {
    function inEditableTarget(): boolean {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }

    function aModalIsOpen(): boolean {
      return document.querySelector('[aria-modal="true"]') !== null
    }

    function clearGo() {
      goPending.current = false
      if (goTimer.current) {
        clearTimeout(goTimer.current)
        goTimer.current = null
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // The sheet's own keys come first — it is NOT aria-modal (that would
      // block this very handler), so close-on-Esc/? lives here.
      if (sheetOpenRef.current && (e.key === 'Escape' || e.key === '?')) {
        e.preventDefault()
        setSheetOpen(false)
        return
      }

      // Never steal keys from text entry or while a modal owns the surface.
      if (inEditableTarget() || aModalIsOpen()) {
        clearGo()
        return
      }

      // ⌘1/⌘2/⌘3 → cockpit. (Plain 1/2/3 stay free for page use.)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const idx = ['1', '2', '3'].indexOf(e.key)
        if (idx !== -1) {
          const target = cockpitPaths[idx]
          if (target) {
            e.preventDefault()
            router.push(target)
          }
          return
        }
        // Leave every other modified combo (⌘K, ⌘C copy, …) alone.
        return
      }
      // Any other modifier combo: ignore (don't break native shortcuts) —
      // except Shift, which "?" needs.
      if (e.metaKey || e.ctrlKey || e.altKey) {
        clearGo()
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        setSheetOpen(true)
        return
      }

      const key = e.key.toLowerCase()

      // Resolve a pending `G` chord first.
      if (goPending.current) {
        const dest = GO_CHORDS.find((c) => c.key === key)?.dest ?? null
        clearGo()
        if (dest) {
          e.preventDefault()
          router.push(dest)
        }
        return
      }

      if (key === '[') {
        e.preventDefault()
        toggleRail()
        return
      }
      if (key === 'c') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('dc:quick-create'))
        return
      }
      if (key === 'g') {
        // Start the chord window. Don't preventDefault — `g` may be typed
        // elsewhere; we only act if a destination key follows in time.
        goPending.current = true
        goTimer.current = setTimeout(clearGo, 500)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearGo()
    }
  }, [router, toggleRail, cockpitPaths])

  if (!sheetOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => setSheetOpen(false)}
    >
      {/* Faint scrim — a help popover, not a blocking modal (deliberately no
          aria-modal: it would silence the very key handler that closes it). */}
      <div className="absolute inset-0 bg-[color:var(--color-ink-900)]/20 dark:bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] shadow-[var(--shadow-modal)] border border-[color:var(--color-hairline)] p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
            className="p-1 rounded-[var(--r-sm)] text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="space-y-1.5 text-sm">
          {SINGLE_KEYS.map((r) => (
            <li key={r.combo} className="flex items-center justify-between gap-4">
              <span className="text-gray-600 dark:text-gray-300">{r.label}</span>
              <kbd className="shrink-0 rounded-md border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-sunk)] px-1.5 py-0.5 font-mono-num text-xs text-gray-700 dark:text-gray-200">
                {r.combo}
              </kbd>
            </li>
          ))}
          <li className="pt-2 mt-2 border-t border-[color:var(--color-hairline)]">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Go to <span className="font-normal normal-case">(press G, then…)</span>
            </p>
            <ul className="space-y-1.5">
              {GO_CHORDS.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-4">
                  <span className="text-gray-600 dark:text-gray-300">{c.label}</span>
                  <kbd className="shrink-0 rounded-md border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-sunk)] px-1.5 py-0.5 font-mono-num text-xs text-gray-700 dark:text-gray-200">
                    G {c.key.toUpperCase()}
                  </kbd>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </div>
    </div>
  )
}
