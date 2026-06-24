'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Slide-out-then-unmount for a conditionally-mounted, hand-rolled detail drawer
 * that uses the `.drawer-enter-right` CSS motion (matched to the shared
 * <Drawer>). `requestClose` adds the `.is-closing` class — the panel slides out,
 * the backdrop fades — and THEN calls the parent's `onClose`, so the exit plays
 * before the parent unmounts the drawer. Enter is pure CSS (@starting-style), so
 * mounting triggers no React state and the component stays test-clean.
 *
 * Wire `requestClose` to the ✕ button, the backdrop click, and Escape; keep
 * calling the raw `onClose` for action-driven closes that navigate away anyway.
 */
const EXIT_MS = 210 // ≥ --dur-base (200ms) so onClose fires once the slide-out finishes

export function useDrawerExit(onClose: () => void): { closing: boolean; requestClose: () => void } {
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const requestClose = useCallback(() => {
    if (closingRef.current) return // guard against double-fire (e.g. Esc + backdrop)
    closingRef.current = true
    setClosing(true)
    window.setTimeout(onClose, EXIT_MS)
  }, [onClose])
  return { closing, requestClose }
}
