import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Guards against losing unsaved work. While `active` (the editor is dirty):
 *
 * - **Hard navigation** (tab close, refresh, closing the browser, typing a new
 *   URL) → the browser's native "Leave site?" prompt via `beforeunload`. This is
 *   the only thing that can interrupt those, and it can't be styled — that's a
 *   browser constraint.
 * - **In-app navigation** (clicking a sidebar item or any internal link) →
 *   intercepted and routed through `confirmLeave` (the in-app dialog), so a
 *   misclick mid-edit asks "Discard unsaved changes?" instead of silently
 *   throwing the work away. If confirmed, the navigation proceeds.
 *
 * Programmatic `router.push` inside the editor's own save/cancel handlers is NOT
 * intercepted (only real anchor clicks), so an explicit "Save" that navigates
 * away is never blocked. `confirmLeave` is read through a ref so passing an
 * inline arrow doesn't thrash the listeners.
 */
export function useUnsavedChanges(active: boolean, confirmLeave?: () => Promise<boolean>): void {
  const router = useRouter()
  const confirmRef = useRef(confirmLeave)
  confirmRef.current = confirmLeave

  useEffect(() => {
    if (!active) return

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Legacy browsers require returnValue to be set for the prompt to show.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    function onClickCapture(e: MouseEvent) {
      const confirm = confirmRef.current
      if (!confirm) return
      // Only plain left-clicks without modifier keys (Cmd/Ctrl-click opens a new
      // tab — don't interfere) and not already handled.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      const target = anchor.getAttribute('target')
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('http') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        (target && target !== '_self')
      ) {
        return // hash / external / new-tab — leave it to the browser / beforeunload
      }
      // Internal client navigation — pause it, ask, then proceed if confirmed.
      e.preventDefault()
      e.stopPropagation()
      void confirm().then((ok) => {
        if (ok) router.push(href)
      })
    }
    document.addEventListener('click', onClickCapture, true)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [active, router])
}
