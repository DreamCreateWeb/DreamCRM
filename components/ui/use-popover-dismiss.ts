'use client'

import { useEffect, type RefObject } from 'react'

/**
 * THE popover-dismiss contract: Esc closes, and so does a click/tap anywhere
 * outside the popover (and its trigger, when the trigger lives inside the
 * ref'd container). Extracted because five popovers (assign / snooze /
 * templates / schedule in the thread detail, snooze in the thread list) each
 * shipped with NEITHER — every dismissal cost a second precise click on the
 * trigger.
 *
 * `open` gates the listeners so closed popovers cost nothing. The mousedown
 * phase is used (not click) so the popover closes before a click lands on
 * whatever is underneath — matching how native menus feel.
 */
export function usePopoverDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onDown(e: MouseEvent) {
      const el = ref.current
      if (el && e.target instanceof Node && !el.contains(e.target)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open, ref, onClose])
}
