'use client'

import { useEffect } from 'react'

/**
 * Auto-recovers from stale-chunk load failures after a deploy.
 *
 * We deploy on every merge. When a new build ships, a page/router already open
 * in a browser still references JS chunks by the OLD content hash. The new
 * server no longer serves those, so the chunk request 404s — and the 404 body
 * (served as text/plain) is rejected as a script — which surfaces as a fatal
 * "Application error: a client-side exception has occurred". A reload fetches
 * the current build's chunks and fixes it (each App Runner instance serves a
 * self-consistent HTML+chunks set, so one reload lands on a matching build).
 *
 * This guard listens for that SPECIFIC failure and reloads ONCE — loop-guarded
 * via sessionStorage so a genuinely-missing chunk (a real bug, not a deploy)
 * can't reload forever. Mounted once at the root layout, so it covers every
 * route. It only ever fires on chunk/script load failures; ordinary app errors
 * are untouched.
 */

const RELOAD_KEY = 'dc:chunk-reload-at'
// Don't auto-reload more than once per window — prevents an infinite loop if a
// chunk is permanently missing. One reload is enough for the deploy case.
const RELOAD_WINDOW_MS = 20_000

/** True when a thrown value / failed resource is a stale-chunk load failure. */
export function isChunkLoadFailure(input: { message?: string | null; tag?: string | null; src?: string | null }): boolean {
  const msg = (input.message ?? '').toLowerCase()
  if (
    msg.includes('failed to load chunk') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('failed to fetch dynamically imported module') ||
    (msg.includes('mime type') && msg.includes('not executable'))
  ) {
    return true
  }
  // A failed `<script src="/_next/static/...">` fires a resource error event with
  // no message and the script element as the target.
  if ((input.tag ?? '').toUpperCase() === 'SCRIPT' && (input.src ?? '').includes('/_next/static/')) {
    return true
  }
  return false
}

export default function ChunkReloadGuard() {
  useEffect(() => {
    function reloadOnce() {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0')
        if (Number.isFinite(last) && Date.now() - last < RELOAD_WINDOW_MS) return // already tried — don't loop
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      } catch {
        /* sessionStorage blocked (private mode etc.) — still attempt one reload */
      }
      window.location.reload()
    }

    function onError(e: Event) {
      const ee = e as ErrorEvent
      const target = e.target as { tagName?: string; src?: string } | null
      if (
        isChunkLoadFailure({
          message: ee.message ?? (ee.error as Error | undefined)?.message ?? null,
          tag: target?.tagName ?? null,
          src: target?.src ?? null,
        })
      ) {
        reloadOnce()
      }
    }

    function onRejection(e: PromiseRejectionEvent) {
      const reason = e.reason as { message?: string } | string | undefined
      const message = typeof reason === 'string' ? reason : (reason?.message ?? null)
      if (isChunkLoadFailure({ message })) reloadOnce()
    }

    // Resource (script) load errors don't bubble — listen in the CAPTURE phase.
    window.addEventListener('error', onError, true)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError, true)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
