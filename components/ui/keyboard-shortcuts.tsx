'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAppProvider } from '@/app/app-provider'

/**
 * Global keyboard map for the dashboard shell (DESIGN-SYSTEM.md Part 4):
 *   [            toggle the sidebar rail (expanded ⇄ icon rail)
 *   ⌘1 / ⌘2 / ⌘3 navigate to the pinned cockpit paths (in registry order)
 *   C            open the header quick-create menu
 *   G then P/A/L go to Patients / Appointments / Leads (500ms chord window)
 *
 * ⌘K stays owned by the header (the palette). Esc closing surfaces is owned by
 * each surface. We never intercept while focus is in a text field / select /
 * contenteditable, or while a modal is open (aria-modal present), so typing
 * and modal interactions are untouched.
 *
 * `cockpitPaths` are the resolved hrefs of the tenant's pinned modules — the
 * shell passes them so ⌘1/2/3 target whatever each registry pinned.
 */
export default function KeyboardShortcuts({ cockpitPaths }: { cockpitPaths: string[] }) {
  const router = useRouter()
  const { toggleRail } = useAppProvider()
  // Tracks an in-flight `G` chord; cleared after the window elapses.
  const goPending = useRef(false)
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      // Any other modifier combo: ignore (don't break native shortcuts).
      if (e.metaKey || e.ctrlKey || e.altKey) {
        clearGo()
        return
      }

      const key = e.key.toLowerCase()

      // Resolve a pending `G` chord first.
      if (goPending.current) {
        const dest =
          key === 'p' ? '/patients' : key === 'a' ? '/appointments' : key === 'l' ? '/leads' : null
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
        // elsewhere; we only act if a P/A/L follows in time.
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

  return null
}
