'use client'

import { useEffect } from 'react'

/**
 * Fire-and-forget pageview counter for a published post. Runs client-side (so
 * SSR / bot renders don't inflate the count) and dedupes per browser session.
 */
export default function BlogViewBeacon({ postId }: { postId: string }) {
  useEffect(() => {
    const key = `blogview_${postId}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* sessionStorage unavailable — still count once per load */
    }
    fetch(`/api/blog/${postId}/view`, { method: 'POST', keepalive: true }).catch(() => {})
  }, [postId])
  return null
}
