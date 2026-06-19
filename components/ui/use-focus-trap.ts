import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Accessibility for the app's hand-rolled overlays (modals / drawers that aren't
 * built on Headless UI's Dialog, which already does this). While `active`:
 *
 * - **Focus trap** — Tab / Shift+Tab cycle within `ref`, never escaping to the
 *   page behind the modal.
 * - **Initial focus** — moves focus into the overlay on open (first focusable,
 *   or the container itself), unless `initialFocus: false` (the caller focuses a
 *   specific element, e.g. a search input or a primary button).
 * - **Focus restore** — returns focus to whatever was focused before the overlay
 *   opened, on close/unmount (so keyboard users land back where they were).
 * - **Escape** — calls `onEscape` when provided (omit to keep a component's own
 *   Escape logic, e.g. a drawer that ignores Escape while a sub-drawer is open).
 */
export function useFocusTrap(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  opts: { onEscape?: () => void; restoreFocus?: boolean; initialFocus?: boolean } = {},
): void {
  const { onEscape, restoreFocus = true, initialFocus = true } = opts

  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

    if (initialFocus) {
      const els = focusables()
      if (els.length > 0) {
        els[0].focus()
      } else {
        container.tabIndex = -1
        container.focus()
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) {
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const els = focusables()
      if (els.length === 0) {
        // Nothing focusable — keep focus on the container, don't leak to the page.
        e.preventDefault()
        return
      }
      const first = els[0]
      const last = els[els.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (activeEl === first || !container!.contains(activeEl)) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeEl === last || !container!.contains(activeEl)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (restoreFocus && previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [active, ref, onEscape, restoreFocus, initialFocus])
}
